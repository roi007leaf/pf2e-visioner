import { MODULE_ID } from '../../../constants.js';
import { getLogger } from '../../../utils/logger.js';
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
   * @param {import('./OverrideValidationManager.js').OverrideValidationManager} [dependencies.overrideValidationManager] - Optional override validation manager
   * @param {string} dependencies.moduleId - Module ID for settings
   */
  constructor(dependencies) {
    this.batchProcessor = dependencies.batchProcessor;
    this.telemetryReporter = dependencies.telemetryReporter;
    this.exclusionManager = dependencies.exclusionManager;
    this.viewportFilterService = dependencies.viewportFilterService || null;
    this.visibilityMapService = dependencies.visibilityMapService;
    this.overrideValidationManager = dependencies.overrideValidationManager || null;
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
    this._movementStopDelayMs = 200; // Increased to allow canvas position to update after animation

    // Movement session telemetry tracking
    this._movementSession = null;
  }

  /**
   * Notify orchestrator that a token has started moving.
   * This will delay batch processing until movement stops.
   */
  notifyTokenMovementStart() {
    try {
      getLogger('AVS/Batch').debug(() => ({
        msg: 'movement:start',
        wasMoving: this._isTokenMoving,
        pendingTokens: this._pendingTokens.size,
        stack: new Error().stack?.split('\n').slice(1, 4).join('\n'),
      }));
    } catch {}
    // Start a new movement session if not already moving
    if (!this._isTokenMoving) {
      this._movementSession = {
        positionUpdates: 0,
        tokensAccumulated: new Set(),
        sessionId: `movement-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      };

      // CRITICAL: Clear LOS cache when movement starts to prevent stale precomputed LOS
      // This ensures fresh LOS calculations when the batch processes after movement completes
      try {
        this.cacheManager?.clearLosCache?.();
        getLogger('AVS/Batch').debug(() => ({
          msg: 'movement:cleared-los-cache',
          reason: 'movement-started',
        }));
      } catch (error) {
        console.warn('PF2E Visioner | Failed to clear LOS cache on movement start:', error);
      }
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
      try {
        getLogger('AVS/Batch').debug(() => ({
          msg: 'movement:stop-timer-fired',
          hasSession: !!this._movementSession,
          pendingTokens: this._pendingTokens.size,
        }));
      } catch {}

      if (!this._movementSession) {
        console.warn('PF2E Visioner | Movement stop timer fired but no session exists');
        this._isTokenMoving = false;
        this._movementStopTimer = null;
        return;
      }

      const sessionData = {
        sessionId: this._movementSession.sessionId,
        positionUpdates: this._movementSession.positionUpdates,
        tokensAccumulated: this._movementSession.tokensAccumulated.size,
        pendingTokensCount: this._pendingTokens.size,
      };

      this._isTokenMoving = false;
      this._movementStopTimer = null;

      try {
        getLogger('AVS/Batch').debug(() => ({
          msg: 'movement:stopped',
          sessionData,
          willProcessBatch: this._pendingTokens.size > 0,
        }));
      } catch {}

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
      const stack = new Error().stack;
      const caller = stack?.split('\n')?.[2]?.trim() || 'unknown';
      getLogger('AVS/Batch').debug(() => ({
        msg: 'enqueueTokens',
        count: changedTokens?.size,
        tokens: Array.from(changedTokens || []),
        caller,
        isMoving: this._isTokenMoving,
        pendingCount: this._pendingTokens.size,
        stack: stack?.split('\n').slice(1, 4).join('\n'),
      }));
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

      // Process immediately for faster response (reduced from 16ms coalescing)
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
      }, 0); // Reduced from 16ms for immediate processing
    } catch {
      // Fallback: process immediately if coalescing fails
      this.processBatch(changedTokens);
    }
  } /**
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

    // CRITICAL: Don't process batch if tokens are still moving/animating
    // Wait for movement to complete to ensure accurate LOS calculations with final positions
    if (this._isTokenMoving) {
      getLogger('AVS/Batch').debug(() => ({
        msg: 'processBatch:deferred',
        reason: 'tokens-still-moving',
        changedCount: changedTokens.size,
      }));
      // Tokens will be processed when movement completes via movement stop timer
      return;
    }

    this.processingBatch = true;
    const batchId = `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    try {
      const stack = new Error().stack;
      const caller = stack?.split('\n')?.[2]?.trim() || 'unknown';
      getLogger('AVS/Batch').debug(() => ({
        msg: 'processBatch:start',
        batchId,
        size: changedTokens.size,
        tokens: Array.from(changedTokens),
        caller,
        movementSession: options.movementSession,
        stack: stack?.split('\n').slice(1, 4).join('\n'),
      }));
    } catch {}
    const movementSession = options.movementSession || null;

    // Invalidate global caches to ensure fresh calculations
    // This is critical when the GM window regains focus after player movements
    try {
      if (this.batchProcessor?.globalVisibilityCache) {
        this.batchProcessor.globalVisibilityCache.clear();
      }
      if (this.batchProcessor?.globalLosCache) {
        this.batchProcessor.globalLosCache.clear();
      }
    } catch (err) {
      console.warn('PF2E Visioner | BatchOrchestrator.processBatch: Failed to clear caches:', err);
    }

    // NOTE: VisionAnalyzer now uses PositionManager directly, so we don't need
    // to sync canvas token positions. The LOS calculation will use the correct
    // positions from PositionManager instead of relying on token.center.

    // Update perception to ensure vision polygons are current
    try {
      await canvas.perception.update({
        initializeVision: false,
        refreshLighting: false,
        refreshVision: true,
        refreshSounds: false,
      });
    } catch (e) {
      console.warn('PF2E Visioner | Failed to update perception before batch:', e);
    }

    // Prepare tokens and calculation options (moved before telemetry start to report viewport-filtered changed count)
    const allTokens = this._getAllTokens().filter((t) => !this.exclusionManager.isExcludedToken(t));

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
      // Start detection batch mode to defer writes
      const { startDetectionBatch } = await import('../../../stores/detection-map.js');
      startDetectionBatch();

      // Precompute lighting for performance optimization
      const { precomputedLights, precomputeStats } = await this._precomputeLighting(allTokens);

      // Prepare calculation options
      // Reuse short-lived LOS memo for bursty batches (e.g., animation frames)
      // Increased from 150ms to 500ms to better handle multiple batches per lighting change
      const now = Date.now();
      const BURST_TTL_MS = 500;
      const timeSinceLastBatch = this._lastLosMemo.ts ? now - this._lastLosMemo.ts : 999999;
      if (!this._lastLosMemo.map || timeSinceLastBatch >= BURST_TTL_MS) {
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
        // CRITICAL: Skip precomputed LOS if this batch is processing after movement
        // The precomputed LOS would be stale because tokens have moved
        skipPrecomputedLOS: !!options.movementSession,
      };

      // Execute batch processing
      const batchResult = await this.batchProcessor.process(
        allTokens,
        visibleChangedTokens,
        calcOptions,
      );

      // Queue and process override validation BEFORE applying results
      // This allows validation to compare override state against OLD map values
      // before they get overwritten with NEW calculated values
      try {
        const lastMovedId = globalThis?.game?.pf2eVisioner?.lastMovedTokenId;
        if (lastMovedId && this.overrideValidationManager) {
          // Create a timeout promise to prevent indefinite blocking
          const timeoutPromise = new Promise((resolve) => {
            setTimeout(() => {
              resolve();
            }, 50); // Reduced from 200ms for faster response
          });

          // Race between validation and timeout
          const validationPromise = (async () => {
            this.overrideValidationManager.queueOverrideValidation(lastMovedId);
            await this.overrideValidationManager.processQueuedValidations();
          })();

          await Promise.race([validationPromise, timeoutPromise]);
        }
      } catch (e) {
        console.warn('PF2E Visioner | Error processing override validation in batch:', e);
      }

      // Apply results - this writes NEW values to maps
      const uniqueUpdateCount = this._applyBatchResults(batchResult, options);

      // Flush batched detection writes (turns 110+ writes into one batched operation)
      const { flushDetectionBatch } = await import('../../../stores/detection-map.js');
      await flushDetectionBatch();

      // Only refresh perception if there were actual updates to avoid triggering feedback loops
      // When uniqueUpdateCount is 0, nothing changed so perception refresh would just waste cycles
      // and potentially trigger more lightingRefresh events
      if (uniqueUpdateCount > 0) {
        // Refresh perception after batch processing to ensure condition changes are reflected
        this._refreshPerceptionAfterBatch();

        // Sync ephemeral effects ONLY for observer-target pairs that had visibility changes
        // This prevents unnecessary refreshToken events for unchanged tokens
        await this._syncEphemeralEffectsForUpdates(batchResult.updates);
      } else {
        // No updates - skip perception refresh to prevent feedback loops
        this.systemState?.debug?.('BatchOrchestrator: skipping perception refresh (no updates)');
      }

      // Set flag to suppress lightingRefresh immediately after batch completion
      // This prevents feedback loops where batch completion triggers immediate re-processing
      if (!globalThis.game) globalThis.game = {};
      if (!globalThis.game.pf2eVisioner) globalThis.game.pf2eVisioner = {};
      globalThis.game.pf2eVisioner.suppressLightingRefreshAfterBatch = true;

      // Clear the flag after the next render frame to allow normal processing to resume
      requestAnimationFrame(() => {
        if (globalThis.game?.pf2eVisioner) {
          globalThis.game.pf2eVisioner.suppressLightingRefreshAfterBatch = false;
        }
      });

      // Stop telemetry with detailed metrics
      this._reportTelemetry({
        batchId,
        changedTokens: visibleChangedTokens,
        allTokens,
        batchResult,
        precomputeStats,
        uniqueUpdateCount,
        movementSession,
      });
      try {
        getLogger('AVS/Batch').debug(() => ({
          msg: 'processBatch:complete',
          batchId,
          changed: visibleChangedTokens.size,
          updates: uniqueUpdateCount,
        }));
      } catch {}
      telemetryStopped = true;

      // Clear movement session after successful batch
      if (movementSession) {
        this._movementSession = null;
      }

      // Fire custom hook to notify other systems that AVS batch is complete
      Hooks.callAll('pf2eVisionerAvsBatchComplete', {
        batchId,
        changedTokens: Array.from(visibleChangedTokens),
        allTokens,
        uniqueUpdateCount,
      });
    } catch (error) {
      try {
        console.error('PF2E Visioner | processBatch error:', error);
      } catch {}
    } finally {
      // Defensive: ensure we stop telemetry even if an error occurred before normal stop
      if (!telemetryStopped) {
        try {
          this.telemetryReporter.stop({
            batchId,
            clientId: game.user.id,
            clientName: game.user.name,
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
          return result;
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

      // Check if lighting environment changed
      // Note: We don't clear caches here because:
      // 1. Visibility calculations use precomputedLights, so they naturally handle lighting changes
      // 2. LOS is not affected by lighting
      // 3. Event handlers (LightingEventHandler, TokenEventHandler) already clear appropriate caches
      const lightingChanged =
        result.lightingHash &&
        this._lastPrecompute.lightingHash &&
        result.lightingHash !== this._lastPrecompute.lightingHash;
      // Lighting changes are handled by event handlers clearing appropriate caches
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
      } catch {}
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
      // Set flag to suppress lighting refresh events during perception update
      // This prevents feedback loops where perception.update triggers lightingRefresh
      if (!globalThis.game) globalThis.game = {};
      if (!globalThis.game.pf2eVisioner) globalThis.game.pf2eVisioner = {};
      globalThis.game.pf2eVisioner.suppressLightingRefresh = true;

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
      } finally {
        // Clear the suppression flag after the current render frame
        // This ensures any queued lightingRefresh events from perception.update are suppressed
        requestAnimationFrame(() => {
          if (globalThis.game?.pf2eVisioner) {
            globalThis.game.pf2eVisioner.suppressLightingRefresh = false;
          }
        });
      }
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
   * Check if a token is a hazard or loot token that doesn't need visibility effects.
   * @param {Token} token - Token to check
   * @returns {boolean} True if token is hazard or loot
   * @private
   */
  _isHazardOrLoot(token) {
    try {
      const actorType = token?.actor?.type || token?.document?.actor?.type;
      return actorType === 'hazard' || actorType === 'loot';
    } catch {
      return false;
    }
  }

  /**
   * Sync ephemeral effects ONLY for the specific observer-target pairs that had visibility changes.
   * This is much more efficient than syncing all tokens, preventing unnecessary refreshToken events.
   * Skips hazards and loot tokens as they don't need visibility effects.
   * @param {Array<{observer: Token, target: Token, visibility: string}>} updates - Array of visibility updates
   * @private
   */
  async _syncEphemeralEffectsForUpdates(updates) {
    if (!updates || updates.length === 0) {
      return;
    }

    try {
      const { updateEphemeralEffectsForVisibility } = await import(
        '../../../visibility/ephemeral.js'
      );

      // Set flags to suppress both refreshToken processing AND lightingRefresh during ephemeral effect updates
      // This prevents feedback loops where effect updates trigger refreshToken → lightingRefresh → new batch
      if (!globalThis.game) globalThis.game = {};
      if (!globalThis.game.pf2eVisioner) globalThis.game.pf2eVisioner = {};
      globalThis.game.pf2eVisioner.suppressRefreshTokenProcessing = true;
      globalThis.game.pf2eVisioner.suppressLightingRefresh = true;

      try {
        // Deduplicate updates to avoid syncing the same pair multiple times
        const syncedPairs = new Set();
        let syncCount = 0;
        let skippedCount = 0;

        for (const update of updates) {
          const observerId = update.observer?.document?.id;
          const targetId = update.target?.document?.id;

          if (!observerId || !targetId) continue;

          // Skip hazards and loot tokens - they don't need visibility effects
          if (this._isHazardOrLoot(update.target)) {
            skippedCount++;
            continue;
          }

          const pairKey = `${observerId}-${targetId}`;
          if (syncedPairs.has(pairKey)) continue;
          syncedPairs.add(pairKey);

          // Update ephemeral effects for this specific observer-target pair
          await updateEphemeralEffectsForVisibility(
            update.observer,
            update.target,
            update.visibility,
          );
          syncCount++;
        }

        if (syncCount > 0 || skippedCount > 0) {
          this.systemState?.debug?.(
            `BatchOrchestrator: synced ${syncCount} ephemeral effects, skipped ${skippedCount} hazards/loot`,
          );
        }
      } finally {
        // Clear the suppression flags after the current event loop cycle completes
        // This ensures any queued refreshToken/lightingRefresh events are processed while suppressed
        // Using requestAnimationFrame ensures we wait for the next render frame
        requestAnimationFrame(() => {
          if (globalThis.game?.pf2eVisioner) {
            globalThis.game.pf2eVisioner.suppressRefreshTokenProcessing = false;
            globalThis.game.pf2eVisioner.suppressLightingRefresh = false;
          }
        });
      }
    } catch (error) {
      console.warn('PF2E Visioner | Failed to sync ephemeral effects:', error);
    }
  }

  /**
   * Apply batch results with deduplication.
   * @param {Object} batchResult - Result from BatchProcessor
   * @param {Object} [options] - Options to pass to setVisibilityBetween
   * @returns {number} Number of unique updates applied
   * @private
   */
  _applyBatchResults(batchResult, options = {}) {
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
          options,
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
    return true;
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

  /**
   * Clear the burst LOS memo
   * Called when walls/lighting changes to invalidate recent LOS calculations
   */
  clearBurstLosMemo() {
    this._lastLosMemo = { map: null, ts: 0 };
  }
}
