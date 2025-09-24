import { MODULE_ID } from '../../../constants.js';
import { BatchProcessor } from './BatchProcessor.js';
import { ExclusionManager } from './ExclusionManager.js';
import { TelemetryReporter } from './TelemetryReporter.js';

/**
 * BatchOrchestrator coordinates the complete batch processing pipeline:
 * - Telemetry management (start/stop)
 * - Lighting precomputation
 * - BatchProcessor coordination
 * - Result application and deduplication
 * - Error handling and state management
 */
export class BatchOrchestrator {
    /**
     * Creates a new BatchOrchestrator with injected dependencies.
     * @param {Object} dependencies - All required dependencies
     * @param {BatchProcessor} dependencies.batchProcessor - BatchProcessor instance
     * @param {TelemetryReporter} dependencies.telemetryReporter - TelemetryReporter instance
     * @param {ExclusionManager} dependencies.exclusionManager - ExclusionManager instance
     * @param {(observer:Token, target:Token, visibility:string)=>void} dependencies.setVisibilityBetween
     * @param {()=>Token[]} dependencies.getAllTokens - Function to get all canvas tokens
     * @param {string} dependencies.moduleId - Module ID for settings
     */
    constructor(dependencies) {
        this.batchProcessor = dependencies.batchProcessor;
        this.telemetryReporter = dependencies.telemetryReporter;
        this.exclusionManager = dependencies.exclusionManager;
        this.setVisibilityBetween = dependencies.setVisibilityBetween;
        this.getAllTokens = dependencies.getAllTokens;
        this.moduleId = dependencies.moduleId;

        this.processingBatch = false;

        // Coalescing and precompute cache
        this._pendingTokens = new Set();
        this._coalesceTimer = null;
        this._lastPrecompute = { map: null, stats: null, ts: 0 };
    }

    /**
     * Enqueue token changes and coalesce into a single batch on the next frame.
     * @param {Set<string>} changedTokens
     */
    enqueueTokens(changedTokens) {
        try {
            for (const id of changedTokens) this._pendingTokens.add(id);
            // If a batch is currently processing, just accumulate; we'll flush in finally()
            if (this.processingBatch) return;
            if (this._coalesceTimer) return;
            // Coalesce for one frame (~16ms)
            this._coalesceTimer = setTimeout(async () => {
                this._coalesceTimer = null;
                const toProcess = new Set(this._pendingTokens);
                this._pendingTokens.clear();
                await this.processBatch(toProcess);
            }, 16);
        } catch {
            // Fallback: process immediately if coalescing fails
            this.processBatch(changedTokens);
        }
    }

    /**
     * Process a batch of changed tokens through the complete pipeline.
     * @param {Set<string>} changedTokens - Set of token IDs that need processing
     * @returns {Promise<void>}
     */
    async processBatch(changedTokens) {
        if (this.processingBatch || changedTokens.size === 0) {
            return;
        }

        this.processingBatch = true;
        const batchStartTime = performance.now();
        const batchId = `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Start telemetry
        this.telemetryReporter.start({
            batchId,
            clientId: game.user.id,
            clientName: game.user.name,
            changedAtStartCount: changedTokens.size
        });

        try {
            // Prepare tokens and calculation options
            const allTokens = this.getAllTokens().filter(t => !this.exclusionManager.isExcludedToken(t));

            // Precompute lighting for performance optimization
            const { precomputedLights, precomputeStats } = await this._precomputeLighting(allTokens);

            // Prepare calculation options
            const calcOptions = {
                hasDarknessSources: this._detectDarknessSources(),
                precomputedLights,
                precomputeStats
            };

            // Execute batch processing
            const batchResult = await this.batchProcessor.process(allTokens, changedTokens, calcOptions);
            const batchEndTime = performance.now();

            // Apply results
            const uniqueUpdateCount = this._applyBatchResults(batchResult);

            // Stop telemetry with detailed metrics
            this._reportTelemetry({
                batchId,
                batchStartTime,
                batchEndTime,
                changedTokens,
                allTokens,
                batchResult,
                precomputeStats,
                uniqueUpdateCount
            });

        } catch (error) {
            try {
                console.error('PF2E Visioner | processBatch error:', error);
            } catch { }
        } finally {
            this.processingBatch = false;
            // If new tokens accumulated during processing, schedule an immediate follow-up batch
            try {
                if (this._pendingTokens.size > 0) {
                    const next = new Set(this._pendingTokens);
                    this._pendingTokens.clear();
                    // Next tick to avoid deep recursion
                    setTimeout(() => this.processBatch(next), 0);
                }
            } catch { /* noop */ }
        }
    }

    /**
     * Precompute lighting for all tokens.
     * @param {Token[]} allTokens - All tokens to precompute for
     * @returns {Promise<{precomputedLights: Map|null, precomputeStats: Object}>}
     * @private
     */
    async _precomputeLighting(allTokens) {
        let precomputedLights = null;
        let precomputeStats = { batch: 'process', targetUsed: 0, targetMiss: 0, observerUsed: 0, observerMiss: 0 };

        try {
            // Short-TTL reuse to keep micro-batches hot
            const now = Date.now();
            const TTL_MS = 150; // reuse precompute for quick successive batches
            if (this._lastPrecompute.map && (now - this._lastPrecompute.ts) < TTL_MS) {
                precomputedLights = this._lastPrecompute.map;
                precomputeStats = this._lastPrecompute.stats || precomputeStats;
            } else {
                const { LightingPrecomputer } = await import('./LightingPrecomputer.js');
                const result = await LightingPrecomputer.precompute(allTokens);
                precomputedLights = result.map;
                precomputeStats = result.stats;
                this._lastPrecompute = { map: precomputedLights, stats: precomputeStats, ts: now };
            }
        } catch (error) {
            // Best effort - continue without precomputation
            try {
                console.warn('PF2E Visioner | Failed to precompute lighting:', error);
            } catch { }
        }

        return { precomputedLights, precomputeStats };
    }

    /**
     * Detect if darkness sources are present in the scene.
     * @returns {boolean}
     * @private
     */
    _detectDarknessSources() {
        try {
            const darknessSources = canvas.effects?.darknessSources?.size || 0;
            const globalDarkness = canvas.scene?.environment?.darknessLevel || 0;
            const hasRegionDarkness = (canvas.scene?.regions?.filter(r =>
                r.behaviors?.some(b => b.active && b.type === 'adjustDarknessLevel')
            ) || []).length > 0;

            return darknessSources > 0 || globalDarkness >= 0.75 || hasRegionDarkness;
        } catch {
            return false;
        }
    }

    /**
     * Apply batch results with deduplication.
     * @param {Object} batchResult - Result from BatchProcessor
     * @returns {number} Number of unique updates applied
     * @private
     */
    _applyBatchResults(batchResult) {
        let uniqueUpdateCount = 0;

        if (batchResult.updates && batchResult.updates.length > 0) {
            // Deduplicate updates before applying them
            const uniqueUpdates = [];
            const updateKeys = new Set();

            for (const update of batchResult.updates) {
                const key = `${update.observer?.document?.id}-${update.target?.document?.id}`;
                if (!updateKeys.has(key)) {
                    updateKeys.add(key);
                    uniqueUpdates.push(update);
                }
            }

            uniqueUpdateCount = uniqueUpdates.length;

            // Apply unique updates with override safety guard
            for (const update of uniqueUpdates) {
                try {
                    const obsId = update.observer?.document?.id;
                    const tgtDoc = update.target?.document;
                    if (obsId && tgtDoc?.getFlag) {
                        const flagKey = `avs-override-from-${obsId}`;
                        const overrideData = tgtDoc.getFlag(MODULE_ID, flagKey);
                        if (overrideData?.state && overrideData.state !== update.visibility) {
                            // Skip applying AVS-calculated visibility that contradicts an active override
                            continue;
                        }
                    }
                } catch {
                    // If guard fails, fall through to applying the update
                }
                this.setVisibilityBetween(update.observer, update.target, update.visibility);
            }
        }

        return uniqueUpdateCount;
    }

    /**
     * Report telemetry with all metrics.
     * @param {Object} params - Telemetry parameters
     * @private
     */
    _reportTelemetry(params) {
        const {
            batchId,
            batchStartTime,
            batchEndTime,
            changedTokens,
            allTokens,
            batchResult,
            precomputeStats,
            uniqueUpdateCount
        } = params;

        this.telemetryReporter.stop({
            batchId,
            clientId: game.user.id,
            clientName: game.user.name,
            batchStartTime,
            batchEndTime,
            changedAtStartCount: changedTokens.size,
            allTokensCount: allTokens.length,
            viewportFilteringEnabled: this._getViewportFilteringEnabled(),
            hasDarknessSources: this._detectDarknessSources(),
            processedTokens: batchResult.processedTokens || 0,
            uniqueUpdateCount,
            breakdown: batchResult.breakdown,
            precomputeStats: batchResult.precomputeStats || precomputeStats,
            debugMode: this._getDebugMode()
        });
    }

    /**
     * Get debug mode setting.
     * @returns {boolean}
     * @private
     */
    _getDebugMode() {
        try {
            return game.settings?.get(this.moduleId, 'autoVisibilityDebugMode') || false;
        } catch {
            return false;
        }
    }

    /**
     * Get viewport filtering setting.
     * @returns {boolean}
     * @private
     */
    _getViewportFilteringEnabled() {
        try {
            // Treat undefined as enabled by default to favor performance
            const v = game.settings?.get(this.moduleId, 'clientViewportFiltering');
            return v !== false;
        } catch {
            return true;
        }
    }

    /**
     * Get processing state.
     * @returns {boolean}
     */
    isProcessing() {
        return this.processingBatch;
    }
}