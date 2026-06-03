import { MODULE_ID } from '../../../constants.js';
import {
  setLastMovedTokenId,
  setSuppressTokenMovementLightingRefresh,
} from '../../../services/runtime-state.js';
import {
  hasActivePendingTokenMovement as defaultHasActivePendingTokenMovement,
  isPendingMovementDragPreviewOnlyActive as defaultIsPendingMovementDragPreviewOnlyActive,
} from '../../../services/PendingMovement/pending-movement-render-lock.js';
import { LightingPrecomputer } from './LightingPrecomputer.js';

const DETECTION_BLOCKING_VISIBILITY_STATES = new Set(['hidden', 'undetected', 'unnoticed']);
const VISIBLE_VISIBILITY_STATES = new Set(['observed', 'concealed']);

function hasTakeCoverTrackingFlag(flagData) {
  return (
    flagData?.coverOnly === true ||
    flagData?.coverOverrideSource === 'take_cover_action' ||
    (flagData?.source === 'take_cover_action' && flagData?.expectedCover)
  );
}

export function tokenHasTakeCoverExpirationState(tokenLike) {
  try {
    const token = tokenLike?.object || tokenLike;
    const flags = token?.document?.flags?.[MODULE_ID] || token?.flags?.[MODULE_ID] || {};
    if (Object.values(flags).some((flagData) => hasTakeCoverTrackingFlag(flagData))) {
      return true;
    }
    return (
      token?.actor?.itemTypes?.effect?.some?.(
        (effect) => effect.flags?.[MODULE_ID]?.takeCoverProneRangedOnly === true,
      ) === true
    );
  } catch {
    return false;
  }
}

export async function defaultRequestTakeCoverExpirationForToken(token, reason) {
  const { requestTakeCoverExpirationForToken } = await import(
    '../../../chat/services/take-cover-expiration-service.js'
  );
  return requestTakeCoverExpirationForToken(token, reason);
}

export class AvsMovementInvalidationWorkflow {
  constructor({
    shouldProcessEvents = () => true,
    visibilityState = null,
    cacheManager = null,
    batchOrchestrator = null,
    visionAnalyzer = null,
    overrideValidationManager = null,
    requestTakeCoverExpirationForToken = defaultRequestTakeCoverExpirationForToken,
    setMovedTokenId = setLastMovedTokenId,
    lightingPrecomputer = LightingPrecomputer,
    hasActivePendingTokenMovement = defaultHasActivePendingTokenMovement,
    isPendingMovementDragPreviewOnlyActive = defaultIsPendingMovementDragPreviewOnlyActive,
    overrideValidationProcessDelayMs = 150,
    visibilityCalculator = null,
    getVisibilityBetween = null,
    setVisibilityBetween = null,
    getPlaceableTokens = () => globalThis.canvas?.tokens?.placeables || [],
    finalVisibilityReconcileDelayMs = 300,
    finalVisibilityReconcileRetryDelaysMs = null,
  } = {}) {
    this.shouldProcessEvents = shouldProcessEvents;
    this.visibilityState = visibilityState;
    this.cacheManager = cacheManager;
    this.batchOrchestrator = batchOrchestrator;
    this.visionAnalyzer = visionAnalyzer;
    this.overrideValidationManager = overrideValidationManager;
    this.requestTakeCoverExpirationForToken = requestTakeCoverExpirationForToken;
    this.setMovedTokenId = setMovedTokenId;
    this.lightingPrecomputer = lightingPrecomputer;
    this.hasActivePendingTokenMovement = hasActivePendingTokenMovement;
    this.isPendingMovementDragPreviewOnlyActive = isPendingMovementDragPreviewOnlyActive;
    this.overrideValidationProcessDelayMs = overrideValidationProcessDelayMs;
    this.overrideValidationProcessTimer = null;
    this.visibilityCalculator = visibilityCalculator;
    this.getVisibilityBetween = getVisibilityBetween;
    this.setVisibilityBetween = setVisibilityBetween;
    this.getPlaceableTokens = getPlaceableTokens;
    this.finalVisibilityReconcileDelayMs = finalVisibilityReconcileDelayMs;
    this.finalVisibilityReconcileRetryDelaysMs =
      finalVisibilityReconcileRetryDelaysMs || [
        finalVisibilityReconcileDelayMs,
        1000,
        2000,
      ];
  }

  handleTokenMovementCompleted(tokenDoc, movementChanges) {
    if (!this.shouldProcessEvents?.()) return false;
    if (!tokenDoc) return false;

    setSuppressTokenMovementLightingRefresh();
    this.#clearTokenPositionCaches();
    this.visionAnalyzer?.clearCache?.(tokenDoc);
    this.visibilityState?.markTokenChangedWithSpatialOptimization?.(tokenDoc, movementChanges);
    this.batchOrchestrator?.notifyTokenMovementComplete?.();
    this.#scheduleFinalVisibilityReconciliation(tokenDoc);
    this.#queueMovementOverrideValidation(tokenDoc, { processQueuedValidations: true });
    return true;
  }

  handleTokenPositionUpdated(tokenDoc, movementChanges) {
    if (!this.shouldProcessEvents?.()) return false;
    if (!tokenDoc) return false;

    setSuppressTokenMovementLightingRefresh();
    this.#clearTokenPositionCaches();
    this.batchOrchestrator?.notifyTokenMovementStart?.();
    this.visibilityState?.markTokenChangedWithSpatialOptimization?.(tokenDoc, movementChanges);
    this.#queueMovementOverrideValidation(tokenDoc, { recordLastMoved: true });
    return true;
  }

  handleTokenMovementOverrideValidationRequired(tokenDoc) {
    if (!this.shouldProcessEvents?.()) return false;
    if (!tokenDoc?.id && !tokenDoc?.document?.id) return false;

    this.#queueMovementOverrideValidation(tokenDoc, { recordLastMoved: true });
    return true;
  }

  handleTokenMovementActionCacheInvalidated() {
    if (!this.shouldProcessEvents?.()) return false;

    try {
      this.cacheManager?.clearVisibilityCache?.();
    } catch {
      /* best-effort */
    }
    return true;
  }

  handleTokenMovementActionUpdated(tokenDoc) {
    if (!this.shouldProcessEvents?.()) return false;
    if (!tokenDoc?.id) return false;

    this.visibilityState?.markTokenChangedImmediate?.(tokenDoc.id);
    return true;
  }

  #clearTokenPositionCaches() {
    try {
      const globalVisCache = this.cacheManager?.getGlobalVisibilityCache?.();
      this.lightingPrecomputer?.clearLightingCaches?.(globalVisCache);
      this.cacheManager?.clearLosCache?.();
      this.cacheManager?.clearVisibilityCache?.();
    } catch {
      /* best-effort */
    }
  }

  #scheduleFinalVisibilityReconciliation(tokenDoc) {
    const tokenId = tokenDoc?.id ?? tokenDoc?.document?.id;
    if (!tokenId) return;
    for (const delayMs of this.finalVisibilityReconcileRetryDelaysMs) {
      setTimeout(() => {
        this.#reconcileMovedTokenFinalVisibility(tokenDoc).catch((error) => {
          console.warn('PF2E Visioner | Failed to reconcile final movement visibility:', error);
        });
      }, delayMs);
    }
  }

  async #loadFinalVisibilityDependencies() {
    if (this.visibilityCalculator && this.getVisibilityBetween && this.setVisibilityBetween) {
      return {
        visibilityCalculator: this.visibilityCalculator,
        getVisibilityBetween: this.getVisibilityBetween,
        setVisibilityBetween: this.setVisibilityBetween,
      };
    }

    const [{ optimizedVisibilityCalculator }, visibilityMap] = await Promise.all([
      import('../VisibilityCalculator.js'),
      import('../../../stores/visibility-map.js'),
    ]);

    return {
      visibilityCalculator: this.visibilityCalculator || optimizedVisibilityCalculator,
      getVisibilityBetween: this.getVisibilityBetween || visibilityMap.getVisibilityBetween,
      setVisibilityBetween: this.setVisibilityBetween || visibilityMap.setVisibilityBetween,
    };
  }

  async #reconcileMovedTokenFinalVisibility(tokenDoc) {
    if (!globalThis.game?.user?.isGM) return;
    if (this.isPendingMovementDragPreviewOnlyActive?.()) return;
    const tokenId = tokenDoc?.id ?? tokenDoc?.document?.id;
    const movedToken = tokenDoc?.object || globalThis.canvas?.tokens?.get?.(tokenId);
    if (!movedToken) return;

    const { visibilityCalculator, getVisibilityBetween, setVisibilityBetween } =
      await this.#loadFinalVisibilityDependencies();
    if (!visibilityCalculator?.calculateVisibility || !getVisibilityBetween || !setVisibilityBetween) {
      return;
    }

    for (const token of this.getPlaceableTokens() || []) {
      if (!token?.document?.id || token.document.id === tokenId) continue;
      await this.#reconcileDirection(movedToken, token, {
        visibilityCalculator,
        getVisibilityBetween,
        setVisibilityBetween,
      });
      await this.#reconcileDirection(token, movedToken, {
        visibilityCalculator,
        getVisibilityBetween,
        setVisibilityBetween,
      });
    }
  }

  async #reconcileDirection(observer, target, deps) {
    const currentVisibility = deps.getVisibilityBetween(observer, target);
    if (!VISIBLE_VISIBILITY_STATES.has(currentVisibility)) return;

    const calculatedVisibility = await deps.visibilityCalculator.calculateVisibility(observer, target, {
      isMovementBatch: true,
      skipCache: true,
      skipPrecomputedLOS: true,
    });
    if (!DETECTION_BLOCKING_VISIBILITY_STATES.has(calculatedVisibility)) return;

    await deps.setVisibilityBetween(observer, target, calculatedVisibility, {
      isAutomatic: true,
      source: 'movement-final-reconciliation',
    });
  }

  #queueMovementOverrideValidation(
    tokenDoc,
    { processQueuedValidations = false, recordLastMoved = false } = {},
  ) {
    const tokenId = tokenDoc?.id ?? tokenDoc?.document?.id;
    if (!tokenId || !this.overrideValidationManager?.queueOverrideValidation) return;

    if (recordLastMoved) {
      try {
        this.setMovedTokenId?.(tokenId);
      } catch {
        /* best-effort */
      }
    }

    this.#expireTakeCoverForMovement(tokenDoc).finally(() => {
      try {
        this.overrideValidationManager.queueOverrideValidation(tokenId);
        if (processQueuedValidations) {
          this.#scheduleOverrideValidationProcessing();
        }
      } catch {
        /* best-effort */
      }
    });
  }

  #scheduleOverrideValidationProcessing() {
    if (!this.overrideValidationManager?.processQueuedValidations) return;
    if (this.overrideValidationProcessTimer) {
      clearTimeout(this.overrideValidationProcessTimer);
    }

    this.overrideValidationProcessTimer = setTimeout(() => {
      this.overrideValidationProcessTimer = null;
      try {
        if (this.hasActivePendingTokenMovement?.()) {
          this.#scheduleOverrideValidationProcessing();
          return;
        }

        const result = this.overrideValidationManager.processQueuedValidations?.();
        result?.catch?.(() => {});
      } catch {
        /* best-effort */
      }
    }, this.overrideValidationProcessDelayMs);
  }

  async #expireTakeCoverForMovement(tokenDoc) {
    try {
      if (!tokenDoc?.id) return;
      const token = tokenDoc.object || globalThis.canvas?.tokens?.get?.(tokenDoc.id) || tokenDoc;
      if (!tokenHasTakeCoverExpirationState(token)) return;
      await this.requestTakeCoverExpirationForToken(token, 'movement');
    } catch (error) {
      console.warn('PF2E Visioner | Failed to request Take Cover expiration prompt:', error);
    }
  }
}
