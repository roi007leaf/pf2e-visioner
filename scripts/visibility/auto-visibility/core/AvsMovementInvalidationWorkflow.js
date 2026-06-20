import { MODULE_ID } from '../../../constants.js';
import {
  setLastMovedTokenId,
  setSuppressTokenMovementLightingRefresh,
} from '../../../services/runtime-state.js';
import {
  hasActivePendingTokenMovement as defaultHasActivePendingTokenMovement,
} from '../../../services/PendingMovement/pending-movement-render-lock.js';
import { LightingPrecomputer } from './LightingPrecomputer.js';

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
    overrideValidationProcessDelayMs = 150,
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
    this.overrideValidationProcessDelayMs = overrideValidationProcessDelayMs;
    this.overrideValidationProcessTimer = null;
  }

  handleTokenMovementCompleted(tokenDoc, movementChanges) {
    if (!this.shouldProcessEvents?.()) return false;
    if (!tokenDoc) return false;

    setSuppressTokenMovementLightingRefresh();
    this.#clearTokenPositionCaches();
    this.visionAnalyzer?.clearCache?.(tokenDoc);
    this.visibilityState?.markTokenChangedWithSpatialOptimization?.(tokenDoc, movementChanges);
    this.batchOrchestrator?.notifyTokenMovementComplete?.(tokenDoc?.id ?? tokenDoc?.document?.id);
    this.#queueMovementOverrideValidation(tokenDoc, { processQueuedValidations: true });
    return true;
  }

  handleTokenPositionUpdated(tokenDoc, movementChanges) {
    if (!this.shouldProcessEvents?.()) return false;
    if (!tokenDoc) return false;

    setSuppressTokenMovementLightingRefresh();
    this.#clearTokenPositionCaches();
    this.batchOrchestrator?.notifyTokenMovementStart?.(tokenDoc?.id ?? tokenDoc?.document?.id);
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
