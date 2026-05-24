import { MODULE_ID } from '../../../constants.js';
import { updateCanvasPerception } from '../../../helpers/perception-refresh.js';
import {
  clearExplicitVisiblePair,
  markExplicitVisiblePair,
} from '../../../services/ExplicitVisibilityPairs.js';
import {
  discardDetectionBatch,
  flushDetectionBatch,
  startDetectionBatch,
} from '../../../stores/detection-map.js';
import {
  currentPendingMovementSightLineSeesTarget,
  hasPendingMovementEntryForPair,
} from '../../../services/PendingMovement/pending-movement-sight-line.js';
import { getLogger } from '../../../utils/logger.js';
import { scheduleTask } from '../../../utils/scheduler.js';
import {
  clearPostBatchPerceptionRefreshSuppression,
  clearSuppressLightingRefreshAfterBatch,
  clearSuppressRefreshTokenProcessing,
  getLastMovedTokenId,
  getPostBatchPerceptionRefreshSuppression,
  setSuppressLightingRefresh,
  setSuppressLightingRefreshAfterBatch,
  setSuppressRefreshTokenProcessing,
} from '../../../services/runtime-state.js';
import { overrideMatchesVisibility } from '../../perception-profile.js';
import { BatchProcessor } from './BatchProcessor.js';
import { buildBatchCalculationOptions } from './BatchCalculationOptionsPolicy.js';
import { buildBatchPreflightPlan } from './BatchPreflightPolicy.js';
import { buildBatchEffectSyncPlan } from './BatchEffectSyncPolicy.js';
import { buildBatchResultApplicationPlan } from './BatchResultApplicationPolicy.js';
import { createDefaultBatchWorkflowFactory } from './BatchWorkflowFactory.js';
import {
  buildCoalesceDrainPlan,
  buildProcessBatchAdmissionPlan,
} from './BatchQueuePolicy.js';
import {
  isMovementVisibilityBatch,
  resolveVisibleBatchTokens,
} from './BatchTokenSelectionPolicy.js';
import { collectUnsettledChangedTokenIds } from './BatchTokenSettlingPolicy.js';
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
   * @param {import('./PositionManager.js').PositionManager} [dependencies.positionManager] - Optional position manager for pending destination awareness
   * @param {import('./OverrideValidationManager.js').OverrideValidationManager} [dependencies.overrideValidationManager] - Optional override validation manager
   * @param {string} dependencies.moduleId - Module ID for settings
   */
  constructor(dependencies) {
    this.batchProcessor = dependencies.batchProcessor;
    this.telemetryReporter = dependencies.telemetryReporter;
    this.exclusionManager = dependencies.exclusionManager;
    this.viewportFilterService = dependencies.viewportFilterService || null;
    this.visibilityMapService = dependencies.visibilityMapService;
    this.positionManager = dependencies.positionManager || null;
    this.overrideValidationManager = dependencies.overrideValidationManager || null;
    this.moduleId = dependencies.moduleId;
    this.nowProvider = dependencies.nowProvider || (() => {
      try {
        return performance?.now?.() ?? Date.now();
      } catch {
        return Date.now();
      }
    });
    this.workflowFactory =
      dependencies.workflowFactory ||
      createDefaultBatchWorkflowFactory({
        startDetectionBatch,
        flushDetectionBatch,
        discardDetectionBatch,
        getLastMovedTokenId,
        overrideValidationManager: this.overrideValidationManager,
        warn: (...args) => console.warn(...args),
        applyBatchResults: (result, resultOptions) =>
          this._applyBatchResults(result, resultOptions),
        syncEphemeralEffectsForUpdates: (updates) =>
          this._syncEphemeralEffectsForUpdates(updates),
        refreshPerceptionAfterBatch: () => this._refreshPerceptionAfterBatch(),
        setSuppressLightingRefreshAfterBatch,
        clearSuppressLightingRefreshAfterBatch,
        schedulePostResultTask: scheduleTask,
        debug: (message) => this.systemState?.debug?.(message),
        stopTelemetry: (payload) => this.telemetryReporter.stop(payload),
        getClientId: () => globalThis.game?.user?.id,
        getClientName: () => globalThis.game?.user?.name,
        getViewportFilteringEnabled: () => this._getViewportFilteringEnabled(),
        hasDarknessSources: () => this._detectDarknessSources(),
        getDebugMode: () => this._getDebugMode(),
        setProcessingBatch: (value) => {
          this.processingBatch = value;
        },
        callHook: (hookName, ...args) => Hooks.callAll(hookName, ...args),
        scheduleFinalizationTask: (task) => setTimeout(task, 0),
        processBatch: (tokens, processOptions) => this.processBatch(tokens, processOptions),
        clearPendingTokens: () => this._pendingTokens.clear(),
        clearPendingMovementSessionData: () => {
          this._pendingMovementSessionData = null;
        },
      });

    this.processingBatch = false;
    this._wasMinimized = false;
    this._pendingPerceptionRefresh = false;

    // Listen for visibility changes to handle window being restored from minimized state
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && this._wasMinimized) {
          // Window just became visible after being minimized
          this._wasMinimized = false;
          this._pendingPerceptionRefresh = true;

          // Force immediate perception refresh
          setTimeout(() => {
            if (this._pendingPerceptionRefresh) {
              this._forcePerceptionRefresh();
              this._pendingPerceptionRefresh = false;
            }
          }, 100);
        } else if (document.hidden) {
          this._wasMinimized = true;
        }
      });
    }

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
    this._movementRevision = 0;
    this._pendingMovementSessionData = null;
  }

  _getPostBatchPerceptionRefreshSuppression() {
    try {
      const suppression = getPostBatchPerceptionRefreshSuppression();
      if (!suppression || Date.now() > suppression.until) {
        if (suppression) clearPostBatchPerceptionRefreshSuppression();
        return null;
      }
      return suppression;
    } catch {
      return null;
    }
  }

  /**
   * Notify orchestrator that a token has started moving.
   * This will delay batch processing until movement stops.
   */
  notifyTokenMovementStart() {
    this._movementRevision++;
    // Start a new movement session if one is missing. The moving flag can outlive a
    // previous session after async batch cleanup, so session existence is the invariant.
    if (!this._movementSession) {
      this._movementSession = this._createMovementSession();

      // CRITICAL: Clear LOS cache when movement starts to prevent stale precomputed LOS
      // This ensures fresh LOS calculations when the batch processes after movement completes
      try {
        this.cacheManager?.clearLosCache?.();
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
      this._flushMovementStop();
    }, this._movementStopDelayMs);
  }

  notifyTokenMovementComplete() {
    this._flushMovementStop();
  }

  isTokenMovementActive() {
    return this._isTokenMoving || !!this._movementSession;
  }

  _flushMovementStop() {
    if (this._movementStopTimer) {
      clearTimeout(this._movementStopTimer);
      this._movementStopTimer = null;
    }

    if (!this._movementSession) {
      if (this._pendingTokens.size === 0) {
        this._isTokenMoving = false;
        return;
      }
      this._movementSession = this._createMovementSession(this._pendingTokens);
    }

    const sessionData = {
      sessionId: this._movementSession.sessionId,
      positionUpdates: this._movementSession.positionUpdates,
      tokensAccumulated: this._movementSession.tokensAccumulated.size,
      pendingTokensCount: this._pendingTokens.size,
    };

    this._isTokenMoving = false;

    // If there are pending tokens, process them immediately now that movement stopped
    if (this._pendingTokens.size > 0) {
      if (this.processingBatch) {
        this._pendingMovementSessionData = sessionData;
        return;
      }

      const toProcess = new Set(this._pendingTokens);
      this._pendingTokens.clear();
      if (this._coalesceTimer) {
        clearTimeout(this._coalesceTimer);
        this._coalesceTimer = null;
      }

      // Pass session data to the batch for telemetry
      this.processBatch(toProcess, { movementSession: sessionData });
      Hooks.callAll('pf2e-visioner.tokenMovementComplete', toProcess);
    } else {
      this._movementSession = null;
    }
  }

  _createMovementSession(initialTokenIds = []) {
    return {
      positionUpdates: 0,
      tokensAccumulated: new Set(initialTokenIds),
      sessionId: `movement-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };
  }

  _getAnimatingChangedTokenIds(changedTokens) {
    return collectUnsettledChangedTokenIds({
      changedTokens,
      getTokenById: (id) =>
        canvas?.tokens?.get?.(id) ||
        canvas?.tokens?.placeables?.find?.((placeable) => placeable?.document?.id === id) ||
        null,
      getPendingDestinationById: (id) => this.positionManager?.getUpdatedTokenDoc?.(id) ?? null,
    });
  }

  /**
   * Enqueue token changes and coalesce into a single batch on the next frame.
   * @param {Set<string>} changedTokens
   */
  enqueueTokens(changedTokens) {
    try {
      getLogger('AVS/Batch').debug(() => ({
        msg: 'enqueueTokens',
        count: changedTokens?.size,
        tokens: Array.from(changedTokens || []),
        ...this._getDebugStackDetails(),
        isMoving: this._isTokenMoving,
        pendingCount: this._pendingTokens.size,
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

        const drainPlan = buildCoalesceDrainPlan({
          pendingTokens: this._pendingTokens,
          isTokenMoving: this._isTokenMoving,
          processingBatch: this.processingBatch,
        });
        if (!drainPlan.shouldDrain) {
          return;
        }

        if (drainPlan.shouldClearPending) {
          this._pendingTokens.clear();
        }
        await this.processBatch(drainPlan.tokens);
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
    const admissionPlan = buildProcessBatchAdmissionPlan({
      changedTokens,
      processingBatch: this.processingBatch,
      movementSession: options.movementSession,
    });

    if (!admissionPlan.shouldProcess) {
      if (admissionPlan.shouldQueue) {
        for (const id of admissionPlan.queuedTokens) {
          this._pendingTokens.add(id);
        }
        if (admissionPlan.pendingMovementSessionData) {
          this._pendingMovementSessionData = admissionPlan.pendingMovementSessionData;
        }
      }
      return;
    }

    const batchStartTime = this.nowProvider();
    const timings = {
      tokenPrep: 0,
      lightingPrecompute: 0,
      calcOptionsPrep: 0,
      batchProcessing: 0,
      resultApplication: 0,
    };
    const movementSession = options.movementSession || null;
    const movementRevisionAtStart = this._movementRevision;

    // Check if AVS is disabled for the current scene
    const disableAVS = canvas?.scene?.getFlag?.(this.moduleId, 'disableAVS');
    const scenePreflightPlan = buildBatchPreflightPlan({ sceneAvsDisabled: !!disableAVS });
    if (!scenePreflightPlan.shouldProcess) {
      getLogger('AVS/Batch').debug(() => ({
        msg: 'processBatch:skipped',
        reason: scenePreflightPlan.reason,
        changedCount: changedTokens.size,
      }));
      if (scenePreflightPlan.shouldClearPendingTokens) {
        this._pendingTokens.clear();
      }
      return;
    }

    // CRITICAL: Don't process batch if tokens are still moving/animating
    // Wait for movement to complete to ensure accurate LOS calculations with final positions
    const movementPreflightPlan = buildBatchPreflightPlan({ isTokenMoving: this._isTokenMoving });
    if (!movementPreflightPlan.shouldProcess) {
      if (movementPreflightPlan.shouldQueueChangedTokens) {
        for (const id of changedTokens) {
          this._pendingTokens.add(id);
        }
      }

      getLogger('AVS/Batch').debug(() => ({
        msg: 'processBatch:deferred',
        reason: movementPreflightPlan.reason,
        changedCount: changedTokens.size,
        movementRevision: this._movementRevision,
      }));
      // Tokens will be processed when movement completes via movement stop timer
      return;
    }

    const animatingChangedTokenIds = this._getAnimatingChangedTokenIds(changedTokens);
    const animationPreflightPlan = buildBatchPreflightPlan({ animatingChangedTokenIds });
    if (!animationPreflightPlan.shouldProcess) {
      if (animationPreflightPlan.shouldQueueChangedTokens) {
        for (const id of changedTokens) {
          this._pendingTokens.add(id);
        }
      }

      getLogger('AVS/Batch').debug(() => ({
        msg: 'processBatch:deferred',
        reason: animationPreflightPlan.reason,
        changedCount: changedTokens.size,
        animatingTokenIds: animationPreflightPlan.animatingTokenIds,
      }));

      if (animationPreflightPlan.shouldNotifyMovementStart) {
        this.notifyTokenMovementStart();
      }
      return;
    }

    // Prepare tokens before any perception refresh. If client-aware filtering says
    // none of the changed tokens are visible to this client, avoid touching token
    // rendering at all; refreshing offscreen tokens during lighting rebuilds can
    // produce transient canvas artifacts.
    const isMovementBatch = isMovementVisibilityBatch({
      changedTokens,
      movementSession: options.movementSession,
    });
    const candidateTokens = isMovementBatch ? canvas.tokens?.placeables || [] : this._getAllTokens();
    const { allTokens, visibleChangedTokens, hasVisibleChangedTokens } =
      resolveVisibleBatchTokens({
        changedTokens,
        candidateTokens,
        exclusionManager: this.exclusionManager,
      });

    const visibilityPreflightPlan = buildBatchPreflightPlan({ hasVisibleChangedTokens });
    if (!visibilityPreflightPlan.shouldProcess) {
      getLogger('AVS/Batch').debug(() => ({
        msg: 'processBatch:skipped',
        reason: visibilityPreflightPlan.reason,
        changedCount: changedTokens.size,
      }));
      return;
    }

    timings.tokenPrep = this.nowProvider() - batchStartTime;
    this.processingBatch = true;
    const batchId = `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    try {
      getLogger('AVS/Batch').debug(() => ({
        msg: 'processBatch:start',
        batchId,
        size: changedTokens.size,
        tokens: Array.from(changedTokens),
        ...this._getDebugStackDetails(),
        movementSession: options.movementSession,
      }));
    } catch { }

    // NOTE: VisionAnalyzer now uses PositionManager directly, so we don't need
    // to sync canvas token positions. The LOS calculation will use the correct
    // positions from PositionManager instead of relying on token.center.

    // Prepare tokens and calculation options (moved before telemetry start to report viewport-filtered changed count)
    // For movement batches, bypass viewport filtering so that tokens in the destination room
    // (which may be off-screen from the GM's perspective) are included in visibility calculations.
    // Without this, creatures in a newly-entered room are excluded and stay "undetected".
    // Detect movement batches via the stop-timer movementSession only. lastMovedTokenId can
    // outlive movement, so using it here makes later non-movement refreshes bypass filters.

    if (isMovementBatch) {
      try {
        this.batchProcessor?.globalVisibilityCache?.clear?.();
        this.batchProcessor?.globalLosCache?.clear?.();
      } catch (err) {
        console.warn(
          'PF2E Visioner | BatchOrchestrator.processBatch: Failed to clear caches:',
          err,
        );
      }
    }

    // Start telemetry with viewport-filtered changed count
    this.telemetryReporter.start({
      batchId,
      clientId: game.user.id,
      clientName: game.user.name,
      changedAtStartCount: visibleChangedTokens.size,
    });

    let telemetryStopped = false;
    const detectionBatch = this.workflowFactory.createDetectionBatchLifecycle();
    try {
      // Start detection batch mode to defer writes
      detectionBatch.start();

      // Precompute lighting for performance optimization
      let stageStart = this.nowProvider();
      const { precomputedLights, precomputeStats } = await this._precomputeLighting(allTokens);
      timings.lightingPrecompute = this.nowProvider() - stageStart;

      // Prepare calculation options
      // Reuse short-lived LOS memo for bursty batches (e.g., animation frames)
      // Increased from 150ms to 500ms to better handle multiple batches per lighting change
      stageStart = this.nowProvider();
      const postBatchPerceptionSuppression = this._getPostBatchPerceptionRefreshSuppression();
      const { calcOptions, nextLosMemo } = buildBatchCalculationOptions({
        lastLosMemo: this._lastLosMemo,
        now: Date.now(),
        hasDarknessSources: this._detectDarknessSources(),
        precomputedLights,
        precomputeStats,
        isTokenMoving: this._isTokenMoving,
        movementSession: options.movementSession,
        isMovementBatch,
        postBatchPerceptionSuppression,
      });
      this._lastLosMemo = nextLosMemo;
      timings.calcOptionsPrep = this.nowProvider() - stageStart;

      // Execute batch processing
      stageStart = this.nowProvider();
      const batchResult = await this.batchProcessor.process(
        allTokens,
        visibleChangedTokens,
        calcOptions,
      );
      timings.batchProcessing = this.nowProvider() - stageStart;
      timings.detailedBatchTimings = batchResult.detailedTimings || {};

      if (this._movementRevision !== movementRevisionAtStart) {
        for (const id of visibleChangedTokens) {
          this._pendingTokens.add(id);
        }
        detectionBatch.discard();
        getLogger('AVS/Batch').debug(() => ({
          msg: 'processBatch:discarded-stale-result',
          batchId,
          changed: Array.from(visibleChangedTokens),
          movementRevisionAtStart,
          movementRevisionNow: this._movementRevision,
        }));
        return;
      }

      stageStart = this.nowProvider();
      await this.workflowFactory.runOverrideValidationBeforeResultApplication();

      const { uniqueUpdateCount } = await this.workflowFactory.runPostResults({
        batchResult,
        postBatchPerceptionSuppression,
        flushDetectionBatch: () => detectionBatch.flush(),
        isMovementBatch,
      });
      timings.resultApplication = this.nowProvider() - stageStart;

      this.workflowFactory.reportSuccessTelemetry({
        batchId,
        batchStartTime,
        batchEndTime: this.nowProvider(),
        changedTokens: visibleChangedTokens,
        allTokens,
        batchResult,
        precomputeStats,
        uniqueUpdateCount,
        timings,
        movementSession,
      });
      try {
        getLogger('AVS/Batch').debug(() => ({
          msg: 'processBatch:complete',
          batchId,
          changed: visibleChangedTokens.size,
          updates: uniqueUpdateCount,
        }));
      } catch { }
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
      detectionBatch.discardIfOpen();
      try {
        console.error('PF2E Visioner | processBatch error:', error);
      } catch { }
    } finally {
      this.workflowFactory.runFinalization({
        telemetryStopped,
        fallbackTelemetryContext: {
          batchId,
          clientId: globalThis.game?.user?.id,
          clientName: globalThis.game?.user?.name,
          visibleChangedTokens,
          changedTokens,
          allTokensCount: globalThis.canvas?.tokens?.placeables?.length || 0,
          viewportFilteringEnabled: this._getViewportFilteringEnabled(),
          hasDarknessSources: this._detectDarknessSources(),
          debugMode: this._getDebugMode(),
        },
        changedTokens,
        pendingTokens: this._pendingTokens,
        isTokenMoving: this._isTokenMoving,
        pendingMovementSessionData: this._pendingMovementSessionData,
      });
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
        if (ids) {
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
  async _refreshPerceptionAfterBatch() {
    try {
      // Set flag to suppress lighting refresh events during perception update
      // This prevents feedback loops where perception.update triggers lightingRefresh
      setSuppressLightingRefresh(true);

      try {
        // Rebuild vision sources and refresh visibility after effect cleanup. A light
        // refresh can leave Foundry/PF2E detection using stale token visibility.
        await updateCanvasPerception({
          initializeVision: true,
          refreshVision: true,
          refreshOcclusion: true,
          refreshLighting: false,
          refreshSounds: false,
        });

        // Also refresh everyone's perception via socket to ensure all clients see changes
        await this._refreshEveryonesPerception();
      } finally {
        // Clear the suppression flag after a short delay
        // This ensures any queued lightingRefresh events from perception.update are suppressed
        // Using setTimeout instead of requestAnimationFrame so it works when window is unfocused
        scheduleTask(() => {
          setSuppressLightingRefresh(false);
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
   * Force full perception refresh (used when window is restored from minimized state)
   * @private
   */
  async _forcePerceptionRefresh() {
    try {
      // Update canvas perception
      await updateCanvasPerception({
        refreshVision: true,
        refreshLighting: true,
        refreshOcclusion: true,
        refreshSounds: false,
        initializeVision: false,
      });

      // Also refresh via socket
      await this._refreshEveryonesPerception();
    } catch (error) {
      console.warn('[PF2E-Visioner] Error forcing perception refresh:', error);
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
   *
   * NOTE: This also processes forceEphemeralOnly updates, which occur when visibility state hasn't changed
   * but ephemeral effects need to be re-evaluated (e.g., when Blind-Fight is added/removed).
   *
   * @param {Array<{observer: Token, target: Token, visibility: string, forceEphemeralOnly?: boolean}>} updates - Array of visibility updates
   * @private
   */
  async _syncEphemeralEffectsForUpdates(updates) {
    if (!game.user.isGM || !updates || updates.length === 0) {
      return;
    }

    try {
      const { batchUpdateVisibilityEffects } = await import('../../../visibility/ephemeral.js');

      setSuppressRefreshTokenProcessing(true);
      setSuppressLightingRefresh(true);

      try {
        const effectSyncPlan = buildBatchEffectSyncPlan({
          updates,
          isIgnoredTarget: (target) => this._isHazardOrLoot(target),
        });

        for (const { observer, targets } of effectSyncPlan) {
          await batchUpdateVisibilityEffects(observer, targets);
        }
      } finally {
        // Clear the suppression flags after a short delay
        // This ensures any queued refreshToken/lightingRefresh events are processed while suppressed
        // Using setTimeout instead of requestAnimationFrame so it works when window is unfocused
        scheduleTask(() => {
          clearSuppressRefreshTokenProcessing();
          setSuppressLightingRefresh(false);
        });
      }
    } catch (error) {
      console.warn('PF2E Visioner | Failed to sync ephemeral effects:', error);
    }
  }

  _recordExplicitVisiblePair(update) {
    if (update?.explicitVisiblePair === true) {
      return markExplicitVisiblePair(update.observer, update.target);
    }

    if (update?.explicitVisiblePair === false) {
      return clearExplicitVisiblePair(update.observer, update.target);
    }

    if (update?.visibility === 'observed' || update?.visibility === 'concealed') {
      return markExplicitVisiblePair(update.observer, update.target);
    }

    return clearExplicitVisiblePair(update.observer, update.target);
  }

  _resolvePendingMovementVisibilityUpdate(update, currentVisibility) {
    if (currentVisibility !== 'hidden') return update?.visibility;
    if (update?.visibility !== 'observed' && update?.visibility !== 'concealed') {
      return update?.visibility;
    }
    if (!update?.observer || !update?.target) return update?.visibility;
    if (!hasPendingMovementEntryForPair(update.observer, update.target)) return update.visibility;

    return currentPendingMovementSightLineSeesTarget(update.observer, update.target)
      ? update.visibility
      : currentVisibility;
  }

  /**
   * Apply batch results with deduplication.
   * @param {Object} batchResult - Result from BatchProcessor
   * @param {Object} [options] - Options to pass to setVisibilityBetween
   * @returns {number} Number of unique updates applied
   * @private
   */
  async _applyBatchResults(batchResult, options = {}) {
    if (!game.user.isGM || !batchResult.updates || batchResult.updates.length === 0) {
      return 0;
    }

    const applicationPlan = buildBatchResultApplicationPlan({
      updates: batchResult.updates,
      getVisibilityMap: (observer) => this.visibilityMapService.getVisibilityMap(observer),
      recordExplicitVisiblePair: (update) => this._recordExplicitVisiblePair(update),
      resolveVisibilityForUpdate: (update, currentVisibility) =>
        this._resolvePendingMovementVisibilityUpdate(update, currentVisibility),
      overrideMatchesVisibilityFn: overrideMatchesVisibility,
      moduleId: MODULE_ID,
    });

    const visibilityMapOptions =
      options.suppressVisibilityMapRender === true
        ? { suppressRender: true, preserveObserved: true }
        : undefined;
    const dirtyVisibilityEntries = applicationPlan.dirtyObservers.map((observer) => ({
      token: observer,
      visibilityMap: applicationPlan.observerMaps.get(observer),
    }));
    const persistResults = this.visibilityMapService.setVisibilityMaps
      ? await Promise.allSettled([
        this.visibilityMapService.setVisibilityMaps(
          dirtyVisibilityEntries,
          visibilityMapOptions,
        ),
      ])
      : await Promise.allSettled(
        dirtyVisibilityEntries.map(({ token, visibilityMap }) =>
          visibilityMapOptions
            ? this.visibilityMapService.setVisibilityMap(token, visibilityMap, visibilityMapOptions)
            : this.visibilityMapService.setVisibilityMap(token, visibilityMap),
        ),
      );

    for (const result of persistResults) {
      if (result.status === 'rejected') {
        console.warn('PF2E Visioner | Failed to persist visibility map:', result.reason);
      }
    }

    return applicationPlan.uniqueUpdateCount;
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

  _getDebugStackDetails() {
    const stack = new Error().stack;
    return {
      caller: stack?.split('\n')?.[2]?.trim() || 'unknown',
      stack: stack?.split('\n').slice(1, 4).join('\n'),
    };
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
      this.batchProcessor?.clearPersistentCaches?.();

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
