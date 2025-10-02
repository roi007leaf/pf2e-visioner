import { MODULE_ID } from '../../../constants.js';
import { BatchProcessor } from './BatchProcessor.js';
import { ExclusionManager } from './ExclusionManager.js';
import { LightingPrecomputer } from './LightingPrecomputer.js';
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
   * @param {import('./ViewportFilterService.js').ViewportFilterService} [dependencies.viewportFilterService] - Optional viewport filter service for client-aware filtering
   * @param {import('./VisibilityMapService.js').VisibilityMapService} dependencies.visibilityMapService - Visibility map service to persist results
   * @param {string} dependencies.moduleId - Module ID for settings
   */
  constructor(dependencies) {
    this.batchProcessor = dependencies.batchProcessor;
    this.telemetryReporter = dependencies.telemetryReporter;
    this.exclusionManager = dependencies.exclusionManager;
    this.viewportFilterService = dependencies.viewportFilterService || null;
    this.visibilityMapService = dependencies.visibilityMapService;
    this.moduleId = dependencies.moduleId;

    this.processingBatch = false;

    // Coalescing and precompute cache
    this._pendingTokens = new Set();
    this._coalesceTimer = null;
    this._lastPrecompute = { map: null, stats: null, posKeyMap: null, lightingHash: null, ts: 0 };
    // Short-lived LOS memo reused across immediate micro-batches
    this._lastLosMemo = { map: null, ts: 0 };
    // Memoized module import to avoid dynamic import overhead in micro-batches
    this._lightingPrecomputerModulePromise = null;

    // Movement detection to delay batch processing until movement stops
    this._isTokenMoving = false;
    this._movementStopTimer = null;
    this._movementStopDelayMs = 300;

    // Movement session telemetry tracking
    this._movementSession = null;
  }

  /**
   * Notify orchestrator that a token has started moving.
   * This will delay batch processing until movement stops.
   */
  notifyTokenMovementStart() {
    // Start a new movement session if not already moving
    if (!this._isTokenMoving) {
      this._movementSession = {
        startTime: performance.now(),
        positionUpdates: 0,
        tokensAccumulated: new Set(),
        sessionId: `movement-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      };
      console.log('PF2E Visioner | Movement session START', {
        sessionId: this._movementSession.sessionId,
        startedAtIso: new Date().toISOString(),
      });
    }

    this._isTokenMoving = true;
    if (this._movementSession) {
      this._movementSession.positionUpdates++;
    }

    // Clear existing stop timer and restart it
    if (this._movementStopTimer) {
      clearTimeout(this._movementStopTimer);
    }

    // Set timer to detect when movement stops
    this._movementStopTimer = setTimeout(() => {
      if (!this._movementSession) {
        console.warn('PF2E Visioner | Movement stop timer fired but no session exists');
        this._isTokenMoving = false;
        this._movementStopTimer = null;
        return;
      }

      const sessionDurationMs = performance.now() - this._movementSession.startTime;
      const sessionData = {
        sessionId: this._movementSession.sessionId,
        sessionDurationMs: Number(sessionDurationMs.toFixed(2)),
        positionUpdates: this._movementSession.positionUpdates,
        tokensAccumulated: this._movementSession.tokensAccumulated.size,
        pendingTokensCount: this._pendingTokens.size,
      };

      this._isTokenMoving = false;
      this._movementStopTimer = null;

      // If there are pending tokens, process them immediately now that movement stopped
      if (this._pendingTokens.size > 0) {
        const toProcess = new Set(this._pendingTokens);
        this._pendingTokens.clear();
        if (this._coalesceTimer) {
          clearTimeout(this._coalesceTimer);
          this._coalesceTimer = null;
        }

        // Pass session data to the batch for telemetry
        this.processBatch(toProcess, { movementSession: sessionData });
      } else {
        // No pending tokens - report session ended without batch
        console.log('PF2E Visioner | Movement session STOP (no batch needed)', {
          ...sessionData,
          finishedAtIso: new Date().toISOString(),
        });
        this._movementSession = null;
      }
    }, this._movementStopDelayMs);
  }

  /**
   * Enqueue token changes and coalesce into a single batch on the next frame.
   * @param {Set<string>} changedTokens
   */
  enqueueTokens(changedTokens) {
    try {
      for (const id of changedTokens) {
        this._pendingTokens.add(id);
        // Track accumulated tokens in movement session
        if (this._movementSession) {
          this._movementSession.tokensAccumulated.add(id);
        }
      }

      // If a batch is currently processing, just accumulate; we'll flush in finally()
      if (this.processingBatch) return;

      // If tokens are moving, just accumulate - don't start batch processing yet
      // The movement stop timer will trigger the batch when movement completes
      if (this._isTokenMoving) return;

      // Cancel any existing coalesce timer to restart it with fresh changes
      if (this._coalesceTimer) {
        clearTimeout(this._coalesceTimer);
      }

      // Coalesce for one frame (~16ms)
      this._coalesceTimer = setTimeout(async () => {
        this._coalesceTimer = null;

        // Double-check movement flag before processing (in case movement started during coalesce)
        if (this._isTokenMoving) {
          // Movement started during coalesce - let movement timer handle it
          return;
        }

        const toProcess = new Set(this._pendingTokens);
        this._pendingTokens.clear();
        await this.processBatch(toProcess);
      }, 16);
    } catch {
      // Fallback: process immediately if coalescing fails
      this.processBatch(changedTokens);
    }
  }  /**
   * Process a batch of changed tokens through the complete pipeline.
   * @param {Set<string>} changedTokens - Set of token IDs that need processing
   * @param {Object} [options] - Optional processing metadata
   * @param {Object} [options.movementSession] - Movement session data if this batch completes a movement
   * @returns {Promise<void>}
   */
  async processBatch(changedTokens, options = {}) {
    if (this.processingBatch || changedTokens.size === 0) {
      return;
    }

    this.processingBatch = true;
    const batchStartTime = performance.now();
    const batchId = `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const movementSession = options.movementSession || null;

    // Timing measurements
    const timings = {
      batchStart: batchStartTime,
      tokenPrep: 0,
      lightingPrecompute: 0,
      calcOptionsPrep: 0,
      batchProcessing: 0,
      resultApplication: 0,
      batchEnd: 0,
    };

    // Prepare tokens and calculation options (moved before telemetry start to report viewport-filtered changed count)
    const tokenPrepStart = performance.now();
    const allTokens = this._getAllTokens().filter((t) => !this.exclusionManager.isExcludedToken(t));
    timings.tokenPrep = performance.now() - tokenPrepStart;

    // Filter the changed set to tokens present in the current viewport set
    const visibleIdSet = new Set();
    for (const t of allTokens) {
      const id = t?.document?.id;
      if (id) visibleIdSet.add(id);
    }
    const visibleChangedTokens = new Set();
    for (const id of changedTokens) {
      if (visibleIdSet.has(id)) visibleChangedTokens.add(id);
    }

    // Start telemetry with viewport-filtered changed count
    this.telemetryReporter.start({
      batchId,
      clientId: game.user.id,
      clientName: game.user.name,
      changedAtStartCount: visibleChangedTokens.size,
    });

    let telemetryStopped = false;
    try {
      // Precompute lighting for performance optimization
      const lightingStart = performance.now();
      const { precomputedLights, precomputeStats } = await this._precomputeLighting(allTokens);
      timings.lightingPrecompute = performance.now() - lightingStart;

      // Prepare calculation options
      const calcOptionsStart = performance.now();
      // Reuse short-lived LOS memo for bursty batches (e.g., animation frames)
      const now = Date.now();
      const BURST_TTL_MS = 150;
      if (!this._lastLosMemo.map || now - this._lastLosMemo.ts >= BURST_TTL_MS) {
        this._lastLosMemo.map = new Map();
      }
      this._lastLosMemo.ts = now;
      const calcOptions = {
        hasDarknessSources: this._detectDarknessSources(),
        precomputedLights,
        precomputeStats,
        burstLosMemo: this._lastLosMemo.map,
        // Enable fast mode during active token movement to reduce LOS precision
        fastMode: this._isTokenMoving,
      };
      timings.calcOptionsPrep = performance.now() - calcOptionsStart;

      // Execute batch processing
      const batchProcessingStart = performance.now();
      const batchResult = await this.batchProcessor.process(
        allTokens,
        visibleChangedTokens,
        calcOptions,
      );
      timings.batchProcessing = performance.now() - batchProcessingStart;

      // Capture detailed timings from BatchProcessor
      timings.detailedBatchTimings = batchResult.detailedTimings || {};

      // Apply results
      const resultApplicationStart = performance.now();
      const uniqueUpdateCount = this._applyBatchResults(batchResult);

      // Always refresh perception after batch processing to ensure condition changes are reflected
      // Even if no visibility map updates occurred, conditions like invisibility, blindness, etc.
      // may still affect what tokens can perceive, so we need to refresh perception consistently
      this._refreshPerceptionAfterBatch();

      timings.resultApplication = performance.now() - resultApplicationStart;

      const batchEndTime = performance.now();
      timings.batchEnd = batchEndTime;

      // Stop telemetry with detailed metrics
      this._reportTelemetry({
        batchId,
        batchStartTime,
        batchEndTime,
        changedTokens: visibleChangedTokens,
        allTokens,
        batchResult,
        precomputeStats,
        uniqueUpdateCount,
        timings,
        movementSession,
      });
      telemetryStopped = true;

      // Clear movement session after successful batch
      if (movementSession) {
        this._movementSession = null;
      }
    } catch (error) {
      try {
        console.error('PF2E Visioner | processBatch error:', error);
      } catch { }
    } finally {
      // Defensive: ensure we stop telemetry even if an error occurred before normal stop
      if (!telemetryStopped) {
        try {
          const errorEndTime = performance.now();
          this.telemetryReporter.stop({
            batchId,
            clientId: game.user.id,
            clientName: game.user.name,
            batchStartTime,
            batchEndTime: errorEndTime,
            changedAtStartCount: visibleChangedTokens.size || changedTokens.size,
            allTokensCount: canvas.tokens?.placeables?.length || 0,
            viewportFilteringEnabled: this._getViewportFilteringEnabled(),
            hasDarknessSources: this._detectDarknessSources(),
            processedTokens: 0,
            uniqueUpdateCount: 0,
            breakdown: {
              visGlobalHits: 0,
              visGlobalMisses: 0,
              losGlobalHits: 0,
              losGlobalMisses: 0,
            },
            precomputeStats: { observerUsed: 0, observerMiss: 0, targetUsed: 0, targetMiss: 0 },
            debugMode: this._getDebugMode(),
            timings: {
              tokenPrep: 0,
              lightingPrecompute: 0,
              calcOptionsPrep: 0,
              batchProcessing: 0,
              resultApplication: 0,
              detailedBatchTimings: {
                cacheBuilding: 0,
                lightingPrecompute: 0,
                mainProcessingLoop: 0,
                spatialFiltering: 0,
                losCalculations: 0,
                visibilityCalculations: 0,
                cacheOperations: 0,
                updateCollection: 0,
              },
            },
          });
        } catch {
          /* noop */
        }
      }
      this.processingBatch = false;
      // If new tokens accumulated during processing, schedule an immediate follow-up batch
      try {
        if (this._pendingTokens.size > 0) {
          const next = new Set(this._pendingTokens);
          this._pendingTokens.clear();
          // Next tick to avoid deep recursion
          setTimeout(() => this.processBatch(next), 0);
        }
      } catch {
        /* noop */
      }
    }
  }

  /**
   * Resolve the current token list, preferring viewport-filtered tokens when enabled.
   * @returns {Token[]}
   * @private
   */
  _getAllTokens() {
    try {
      const vf = this.viewportFilterService;
      if (vf?.isClientAwareFilteringEnabled?.()) {
        const ids = vf.getViewportTokenIdSet?.(64) || null;
        if (ids && ids.size > 0) {
          const result = [];
          const all = canvas.tokens?.placeables || [];
          for (const t of all) {
            const id = t?.document?.id;
            if (id && ids.has(id)) result.push(t);
          }
          try {
            if (this._getDebugMode()) {
              console.debug('PF2E Visioner | Viewport filtering active', {
                total: all.length,
                inViewport: result.length,
              });
            }
          } catch {
            /* noop */
          }
          return result;
        }
        // Debug when viewport filtering yields empty set and we fall back
        try {
          if (this._getDebugMode()) {
            const total = (canvas.tokens?.placeables || []).length;
            console.debug(
              'PF2E Visioner | Viewport filtering returned empty; falling back to all tokens',
              { total },
            );
          }
        } catch {
          /* noop */
        }
      }
    } catch {
      /* fall through */
    }
    return canvas.tokens?.placeables || [];
  }

  /**
   * Precompute lighting for all tokens.
   * @param {Token[]} allTokens - All tokens to precompute for
   * @returns {Promise<{precomputedLights: Map|null, precomputeStats: Object}>}
   * @private
   */
  async _precomputeLighting(allTokens) {
    let precomputedLights = null;
    let precomputeStats = {
      batch: 'process',
      targetUsed: 0,
      targetMiss: 0,
      observerUsed: 0,
      observerMiss: 0,
    };

    try {
      // Extended TTL to better accommodate real-world batch timing patterns
      const now = Date.now();
      const TTL_MS = 2000; // Increased from 150ms to 2s based on telemetry showing 300-700ms gaps
      if (!this._lightingPrecomputerModulePromise) {
        this._lightingPrecomputerModulePromise = import('./LightingPrecomputer.js');
      }
      const { LightingPrecomputer } = await this._lightingPrecomputerModulePromise;
      // Within TTL, try to reuse previous values when token posKey unchanged
      const previous =
        this._lastPrecompute.map && now - this._lastPrecompute.ts < TTL_MS
          ? {
            map: this._lastPrecompute.map,
            posKeyMap: this._lastPrecompute.posKeyMap,
            lightingHash: this._lastPrecompute.lightingHash,
            ts: this._lastPrecompute.ts,
          }
          : undefined;

      // Track cache hit/miss for better telemetry
      const wasReused = !!previous;
      const result = await LightingPrecomputer.precompute(allTokens, undefined, previous);

      // Check if lighting environment changed and clear BatchProcessor caches if needed
      const lightingChanged =
        result.lightingHash &&
        this._lastPrecompute.lightingHash &&
        result.lightingHash !== this._lastPrecompute.lightingHash;
      if (lightingChanged) {
        this.clearPersistentCaches();
      }
      precomputedLights = result.map;
      precomputeStats = result.stats || precomputeStats;
      // Add cache reuse stats to precompute stats
      precomputeStats.cacheReused = wasReused;
      precomputeStats.cacheAge = previous ? now - this._lastPrecompute.ts : 0;
      // Update memo and timestamp
      this._lastPrecompute = {
        map: precomputedLights,
        stats: precomputeStats,
        posKeyMap: result.posKeyMap || null,
        lightingHash: result.lightingHash || null,
        ts: now,
      };
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
      const hasRegionDarkness =
        (
          canvas.scene?.regions?.filter((r) =>
            r.behaviors?.some((b) => b.active && b.type === 'adjustDarknessLevel'),
          ) || []
        ).length > 0;

      return darknessSources > 0 || globalDarkness >= 0.75 || hasRegionDarkness;
    } catch {
      return false;
    }
  }

  /**
   * Refresh canvas perception after batch processing to ensure immediate visual updates.
   * This prevents the need for users to reselect tokens to see visibility changes.
   * @private
   */
  _refreshPerceptionAfterBatch() {
    try {
      // Update canvas perception to reflect visibility changes immediately
      if (canvas?.perception?.update) {
        canvas.perception.update({
          refreshVision: true,
          refreshOcclusion: true,
        });
      }

      // Also refresh everyone's perception via socket to ensure all clients see changes
      this._refreshEveryonesPerception();
    } catch (error) {
      // Fail silently to avoid disrupting batch processing
      try {
        console.warn('PF2E Visioner | Failed to refresh perception after batch:', error);
      } catch {
        /* noop */
      }
    }
  }

  /**
   * Trigger perception refresh on all clients via socket.
   * @private
   */
  async _refreshEveryonesPerception() {
    try {
      const { refreshEveryonesPerception } = await import('../../../services/socket.js');
      refreshEveryonesPerception();
    } catch {
      // Best effort - continue if socket service unavailable
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
        this.visibilityMapService.setVisibilityBetween(
          update.observer,
          update.target,
          update.visibility,
        );
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
      uniqueUpdateCount,
      timings,
      movementSession,
    } = params;

    // If this batch is part of a movement session, include session telemetry
    if (movementSession) {
      console.log('PF2E Visioner | Movement session STOP (with batch)', {
        sessionId: movementSession.sessionId,
        sessionDurationMs: movementSession.sessionDurationMs,
        positionUpdates: movementSession.positionUpdates,
        tokensAccumulated: movementSession.tokensAccumulated,
        batchId,
        batchProcessingMs: Number((batchEndTime - batchStartTime).toFixed(2)),
        totalTimeMs: Number((movementSession.sessionDurationMs + (batchEndTime - batchStartTime)).toFixed(2)),
        processedTokens: batchResult.processedTokens || 0,
        uniqueUpdates: uniqueUpdateCount,
        finishedAtIso: new Date().toISOString(),
      });
    }

    // Regular batch telemetry
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
      debugMode: this._getDebugMode(),
      timings,
      movementSession, // Include movement session data in batch telemetry
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

  /**
   * Clear persistent caches when major scene changes occur.
   * Call this on scene changes, token additions/deletions, etc.
   */
  clearPersistentCaches() {
    try {
      if (this.batchProcessor?._persistentCaches) {
        this.batchProcessor._persistentCaches.sensesCache = null;
        this.batchProcessor._persistentCaches.sensesCacheTs = 0;
        this.batchProcessor._persistentCaches.idToTokenMap = null;
        this.batchProcessor._persistentCaches.idToTokenMapTs = 0;
        this.batchProcessor._persistentCaches.spatialIndex = null;
        this.batchProcessor._persistentCaches.spatialIndexTs = 0;
      }

      // Clear global caches that might contain stale visibility calculations
      if (this.batchProcessor?.globalLosCache) {
        this.batchProcessor.globalLosCache.clear();
      }
      if (this.batchProcessor?.globalVisibilityCache) {
        this.batchProcessor.globalVisibilityCache.clear();
      }

      // Also clear lighting precompute
      this._lastPrecompute = { map: null, stats: null, posKeyMap: null, lightingHash: null, ts: 0 };

      // Clear LightingPrecomputer static caches (hash memo, token data, force flag)
      if (LightingPrecomputer?.clearLightingCaches) {
        LightingPrecomputer.clearLightingCaches();
      }
    } catch {
      // Best effort cache clearing
    }
  }
}
