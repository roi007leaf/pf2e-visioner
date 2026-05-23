import {
  clearSuppressLightingRefresh,
  isLightingRefreshAfterBatchSuppressed,
  isLightingRefreshSuppressed,
  setLastMovedTokenId,
  setSuppressLightingRefresh,
} from '../../../services/runtime-state.js';
import { MODULE_ID } from '../../../constants.js';
import { LightingPrecomputer } from './LightingPrecomputer.js';
import { VisionAnalyzer } from '../VisionAnalyzer.js';

const LIGHT_VISIBILITY_FIELDS = [
  'x',
  'y',
  'elevation',
  'config.dim',
  'config.bright',
  'config.angle',
  'rotation',
  'config.alpha',
  'config.darkness.min',
  'config.darkness.max',
  'hidden',
  'config.walls',
];

const WALL_LOS_FIELDS = [
  'c',
  'ds',
  'door',
  'sense',
  'dir',
  'sight',
  'sound',
  'threshold',
  'threshold.sight',
  'threshold.sound',
  'threshold.attenuation',
];

export const AVS_INVALIDATION_REASON_HANDLERS = Object.freeze({
  'ambient-light-updated': 'ambientLightUpdated',
  'ambient-light-created': 'ambientLightCreatedOrDeleted',
  'ambient-light-deleted': 'ambientLightCreatedOrDeleted',
  'lighting-refresh': 'lightingRefresh',
  'wall-updated': 'wallUpdated',
  'wall-created': 'wallCreatedOrDeleted',
  'wall-deleted': 'wallCreatedOrDeleted',
  'scene-lighting-updated': 'fullSceneImmediateInvalidation',
  'scene-config-lighting-flushed': 'fullSceneImmediateInvalidation',
  'region-surface-updated': 'fullSceneImmediateInvalidation',
  'token-light-updated': 'tokenLightUpdated',
  'token-light-emitter-moved': 'tokenLightEmitterMoved',
  'token-light-recalculation-required': 'tokenLightRecalculationRequired',
  'token-position-updated': 'tokenPositionUpdated',
  'token-movement-completed': 'tokenMovementCompleted',
  'token-movement-override-validation-required': 'tokenMovementOverrideValidationRequired',
  'token-movement-action-cache-invalidated': 'tokenMovementActionCacheInvalidated',
  'token-movement-action-updated': 'tokenMovementActionUpdated',
  'token-hidden-toggled': 'tokenHiddenToggled',
  'token-created': 'tokenCreated',
  'token-deleted': 'tokenDeleted',
  'token-visibility-affecting-updated': 'tokenVisibilityAffectingUpdated',
  'effect-visibility-updated': 'effectVisibilityUpdated',
  'effect-light-emitter-updated': 'effectLightEmitterUpdated',
  'item-visibility-updated': 'itemVisibilityUpdated',
  'item-vision-equipment-updated': 'itemVisionEquipmentUpdated',
  'item-light-emitter-updated': 'itemLightEmitterUpdated',
  'actor-visibility-updated': 'actorVisibilityUpdated',
  'template-light-updated': 'templateLightUpdated',
});

function hasTakeCoverTrackingFlag(flagData) {
  return (
    flagData?.coverOnly === true ||
    flagData?.coverOverrideSource === 'take_cover_action' ||
    (flagData?.source === 'take_cover_action' && flagData?.expectedCover)
  );
}

function tokenHasTakeCoverExpirationState(tokenLike) {
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

async function defaultRequestTakeCoverExpirationForToken(token, reason) {
  const { requestTakeCoverExpirationForToken } = await import(
    '../../../chat/services/take-cover-expiration-service.js'
  );
  return requestTakeCoverExpirationForToken(token, reason);
}

export class AvsInvalidationCoordinator {
  static _lastControlTokenTime = 0;

  #reasonHandlers;

  constructor({
    systemStateProvider,
    visibilityStateManager,
    cacheManager = null,
    batchOrchestrator = null,
    visionAnalyzer = null,
    spatialAnalyzer = null,
    overrideValidationManager = null,
    requestTakeCoverExpirationForToken = defaultRequestTakeCoverExpirationForToken,
    setMovedTokenId = setLastMovedTokenId,
  } = {}) {
    this.systemState = systemStateProvider;
    this.visibilityState = visibilityStateManager;
    this.cacheManager = cacheManager;
    this.batchOrchestrator = batchOrchestrator;
    this.visionAnalyzer = visionAnalyzer ?? VisionAnalyzer.getInstance?.();
    this.spatialAnalyzer = spatialAnalyzer;
    this.overrideValidationManager = overrideValidationManager;
    this.requestTakeCoverExpirationForToken = requestTakeCoverExpirationForToken;
    this.setMovedTokenId = setMovedTokenId;
    this.#reasonHandlers = this.#createReasonHandlers();
  }

  invalidate(change = {}) {
    const handler = this.#reasonHandlers?.[change.reason];
    return handler ? handler(change) : false;
  }

  #createReasonHandlers() {
    const handlersByName = {
      ambientLightUpdated: (change) => this.#handleAmbientLightUpdated(change.changeData),
      ambientLightCreatedOrDeleted: () => this.#handleAmbientLightCreatedOrDeleted(),
      lightingRefresh: () => this.#handleLightingRefresh(),
      wallUpdated: (change) => this.#handleWallUpdated(change.changeData),
      wallCreatedOrDeleted: () => this.#handleWallCreatedOrDeleted(),
      fullSceneImmediateInvalidation: () => this.#handleFullSceneImmediateInvalidation(),
      tokenLightUpdated: (change) => this.#handleTokenLightUpdated(change.document, change.changeData),
      tokenLightEmitterMoved: () => this.#handleTokenLightEmitterMoved(),
      tokenLightRecalculationRequired: () => this.#handleTokenLightRecalculationRequired(),
      tokenPositionUpdated: (change) =>
        this.#handleTokenPositionUpdated(change.document, change.changeData),
      tokenMovementCompleted: (change) =>
        this.#handleTokenMovementCompleted(change.document, change.changeData),
      tokenMovementOverrideValidationRequired: (change) =>
        this.#handleTokenMovementOverrideValidationRequired(change.document),
      tokenMovementActionCacheInvalidated: () => this.#handleTokenMovementActionCacheInvalidated(),
      tokenMovementActionUpdated: (change) => this.#handleTokenMovementActionUpdated(change.document),
      tokenHiddenToggled: (change) =>
        this.#handleTokenHiddenToggled(change.document, change.changeData),
      tokenCreated: (change) => this.#handleTokenCreated(change.document),
      tokenDeleted: (change) => this.#handleTokenDeleted(change.document),
      tokenVisibilityAffectingUpdated: (change) =>
        this.#handleTokenVisibilityAffectingUpdated(change.document),
      effectVisibilityUpdated: (change) =>
        this.#handleEffectVisibilityUpdated(change.metadata?.tokenIds),
      effectLightEmitterUpdated: () => this.#handleEffectLightEmitterUpdated(),
      itemVisibilityUpdated: (change) => this.#handleItemVisibilityUpdated(change.metadata),
      itemVisionEquipmentUpdated: (change) =>
        this.#handleItemVisionEquipmentUpdated(change.metadata),
      itemLightEmitterUpdated: (change) => this.#handleItemLightEmitterUpdated(change.metadata),
      actorVisibilityUpdated: (change) => this.#handleActorVisibilityUpdated(change.metadata),
      templateLightUpdated: () => this.#handleTemplateLightUpdated(),
    };

    return Object.freeze(
      Object.fromEntries(
        Object.entries(AVS_INVALIDATION_REASON_HANDLERS).map(([reason, handlerName]) => [
          reason,
          handlersByName[handlerName],
        ]),
      ),
    );
  }

  #shouldProcessEvents() {
    return this.systemState?.shouldProcessEvents?.() !== false;
  }

  #affectsVisibility(changeData) {
    if (!changeData) return true;
    return LIGHT_VISIBILITY_FIELDS.some((field) =>
      globalThis.foundry?.utils?.hasProperty?.(changeData, field),
    );
  }

  #affectsLineOfSight(changeData) {
    if (!changeData) return true;
    return WALL_LOS_FIELDS.some((field) =>
      globalThis.foundry?.utils?.hasProperty?.(changeData, field),
    );
  }

  #clearAmbientLightingCaches() {
    this.cacheManager?.clearVisibilityCache?.();
    try {
      LightingPrecomputer.clearLightingCaches();
    } catch (error) {
      console.warn('Failed to clear LightingPrecomputer caches:', error);
    }
  }

  #runAfterLightingRefresh(callback) {
    let completed = false;
    const finish = async () => {
      if (completed) return;
      completed = true;
      try {
        await callback();
      } finally {
        try {
          clearSuppressLightingRefresh();
        } catch {
          /* best-effort */
        }
      }
    };

    try {
      setSuppressLightingRefresh(true);
      Hooks.once('lightingRefresh', finish);
      setTimeout(finish, 100);
    } catch (error) {
      console.warn('[PF2E Visioner] Failed to schedule post-lighting refresh work:', error);
      finish();
    }
  }

  #runAfterTokenLightingRefresh(callback) {
    let scheduled = false;
    try {
      setSuppressLightingRefresh(true);

      Hooks.once('lightingRefresh', () => {
        try {
          callback();
        } finally {
          clearSuppressLightingRefresh();
        }
      });
      scheduled = true;
    } catch (error) {
      console.warn('[PF2E Visioner] Failed to schedule lightingRefresh hook:', error);
      clearSuppressLightingRefresh();
    }

    if (!scheduled) {
      setTimeout(() => {
        try {
          callback();
        } finally {
          clearSuppressLightingRefresh();
        }
      }, 50);
    }
  }

  #handleAmbientLightUpdated(changeData) {
    if (!this.#shouldProcessEvents()) return false;
    if (!this.#affectsVisibility(changeData)) return false;

    this.#clearAmbientLightingCaches();
    this.#runAfterLightingRefresh(() => {
      this.visibilityState?.markAllTokensChangedImmediate?.();
    });
    return true;
  }

  #handleAmbientLightCreatedOrDeleted() {
    if (!this.#shouldProcessEvents()) return false;

    this.#clearAmbientLightingCaches();
    this.visibilityState?.markAllTokensChangedImmediate?.();
    return true;
  }

  #handleLightingRefresh() {
    if (!this.#shouldProcessEvents()) return false;

    if (isLightingRefreshSuppressed()) {
      this.systemState?.debug?.(
        'LightingEventHandler: suppressing lightingRefresh during token operation',
      );
      return false;
    }

    if (this.#isLightingRefreshFromTokenSelection()) {
      this.systemState?.debug?.('LightingEventHandler: ignoring lightingRefresh from token selection');
      return false;
    }

    if (this.systemState?.isSceneConfigOpen?.()) {
      this.systemState?.markPendingLightingChange?.();
      this.systemState?.debug?.(
        'LightingEventHandler: deferring lightingRefresh during open SceneConfig',
      );
      return false;
    }

    if (isLightingRefreshAfterBatchSuppressed()) {
      this.systemState?.debug?.(
        'LightingEventHandler: ignoring lightingRefresh after batch completion (feedback loop prevention)',
      );
      return false;
    }

    try {
      this.cacheManager?.clearAllCaches?.();
    } catch {
      /* best-effort */
    }
    this.visibilityState?.markAllTokensChangedThrottled?.();
    return true;
  }

  #clearWallInvalidationCaches() {
    this.cacheManager?.clearLosCache?.();
    this.visionAnalyzer?.clearCache?.();
    this.cacheManager?.clearGlobalVisibilityCache?.();
    this.batchOrchestrator?.clearBurstLosMemo?.();
  }

  #handleWallUpdated(changeData) {
    if (!this.#shouldProcessEvents()) return false;
    if (!this.#affectsLineOfSight(changeData)) return false;

    this.#clearWallInvalidationCaches();
    this.visibilityState?.markAllTokensChangedImmediate?.();
    return true;
  }

  #handleWallCreatedOrDeleted() {
    if (!this.#shouldProcessEvents()) return false;

    this.#clearWallInvalidationCaches();
    this.visibilityState?.markAllTokensChangedImmediate?.();
    return true;
  }

  #handleFullSceneImmediateInvalidation() {
    if (!this.#shouldProcessEvents()) return false;

    this.cacheManager?.clearAllCaches?.();
    this.visibilityState?.markAllTokensChangedImmediate?.();
    return true;
  }

  #handleTokenLightUpdated(tokenDoc, changeData) {
    if (!this.#shouldProcessEvents()) return false;

    try {
      this.cacheManager?.clearVisibilityCache?.();
    } catch {
      /* best-effort */
    }

    this.#runAfterTokenLightingRefresh(() => {
      this.#handleTokenLightChangeWithSpatialOptimization(tokenDoc, changeData);
    });
    return true;
  }

  #handleTokenLightChangeWithSpatialOptimization(tokenDoc, changes) {
    try {
      const gridSize = canvas.grid?.size || 1;
      const tokenPos = {
        x: tokenDoc.x + (tokenDoc.width * gridSize) / 2,
        y: tokenDoc.y + (tokenDoc.height * gridSize) / 2,
      };

      const affectedTokens = this.spatialAnalyzer.getAffectedTokens(
        tokenPos,
        tokenPos,
        tokenDoc.id,
      );

      this.visibilityState?.markTokenChangedImmediate?.(tokenDoc.id);
      affectedTokens.forEach((token) => {
        this.visibilityState?.markTokenChangedImmediate?.(token.document.id);
      });
    } catch (error) {
      console.error(
        '[PF2E Visioner] Spatial optimization failed, falling back to full recalculation:',
        error,
      );
      this.systemState?.debug?.('light-change-spatial-fallback', tokenDoc.id, error);
      this.visibilityState?.markAllTokensChangedImmediate?.();
    }
  }

  #handleTokenLightEmitterMoved() {
    if (!this.#shouldProcessEvents()) return false;

    this.visibilityState?.markAllTokensChangedImmediate?.();
    return true;
  }

  #handleTokenLightRecalculationRequired() {
    if (!this.#shouldProcessEvents()) return false;

    this.visibilityState?.markAllTokensChangedImmediate?.();
    return true;
  }

  #handleTokenMovementCompleted(tokenDoc, movementChanges) {
    if (!this.#shouldProcessEvents()) return false;
    if (!tokenDoc) return false;

    this.#clearTokenPositionCaches();
    this.visionAnalyzer?.clearCache?.(tokenDoc);
    this.visibilityState?.markTokenChangedWithSpatialOptimization?.(tokenDoc, movementChanges);
    this.batchOrchestrator?.notifyTokenMovementComplete?.();
    this.#queueMovementOverrideValidation(tokenDoc, { processQueuedValidations: true });
    return true;
  }

  #handleTokenPositionUpdated(tokenDoc, movementChanges) {
    if (!this.#shouldProcessEvents()) return false;
    if (!tokenDoc) return false;

    this.#clearTokenPositionCaches();
    this.batchOrchestrator?.notifyTokenMovementStart?.();
    this.visibilityState?.markTokenChangedWithSpatialOptimization?.(tokenDoc, movementChanges);
    this.#queueMovementOverrideValidation(tokenDoc, { recordLastMoved: true });
    return true;
  }

  #handleTokenMovementOverrideValidationRequired(tokenDoc) {
    if (!this.#shouldProcessEvents()) return false;
    if (!tokenDoc?.id && !tokenDoc?.document?.id) return false;

    this.#queueMovementOverrideValidation(tokenDoc, { recordLastMoved: true });
    return true;
  }

  #clearTokenPositionCaches() {
    try {
      const globalVisCache = this.cacheManager?.getGlobalVisibilityCache?.();
      LightingPrecomputer.clearLightingCaches(globalVisCache);
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
          const result = this.overrideValidationManager.processQueuedValidations?.();
          result?.catch?.(() => {});
        }
      } catch {
        /* best-effort */
      }
    });
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

  #handleTokenMovementActionCacheInvalidated() {
    if (!this.#shouldProcessEvents()) return false;

    try {
      this.cacheManager?.clearVisibilityCache?.();
    } catch {
      /* best-effort */
    }
    return true;
  }

  #handleTokenMovementActionUpdated(tokenDoc) {
    if (!this.#shouldProcessEvents()) return false;
    if (!tokenDoc?.id) return false;

    this.visibilityState?.markTokenChangedImmediate?.(tokenDoc.id);
    return true;
  }

  #handleTokenHiddenToggled(tokenDoc, changes) {
    if (!this.#shouldProcessEvents()) return false;

    try {
      const isBeingUnhidden = changes?.hidden === false;
      const token = tokenDoc?.object;

      if (isBeingUnhidden && token?.actor && this.#isInvisibleToken(token)) {
        import('../ConditionManager.js')
          .then(async ({ ConditionManager }) => {
            const conditionManager = ConditionManager.getInstance();
            await conditionManager.handleFoundryUnhideInvisible(token);
            this.#recalculateCurrentCanvasTokens();
          })
          .catch((error) => {
            console.warn('Failed to handle Foundry unhide for invisible token:', error);
            this.#recalculateCurrentCanvasTokens();
          });
        return true;
      }

      this.#recalculateCurrentCanvasTokens();
      return true;
    } catch (error) {
      console.warn('Error handling token hidden toggle:', error);
      return false;
    }
  }

  #isInvisibleToken(token) {
    return (
      token.actor.hasCondition?.('invisible') ||
      token.actor.system?.conditions?.invisible?.active ||
      token.actor.conditions?.has?.('invisible')
    );
  }

  #recalculateCurrentCanvasTokens() {
    const ids = canvas.tokens?.placeables?.map((token) => token.document.id) || [];
    this.visibilityState?.recalculateForTokens?.(ids);
  }

  #handleTokenCreated(tokenDoc) {
    if (!this.#shouldProcessEvents()) return false;
    if (!tokenDoc?.id) return false;

    this.visibilityState?.markTokenChangedImmediate?.(tokenDoc.id);
    return true;
  }

  #handleTokenDeleted(tokenDoc) {
    if (!this.#shouldProcessEvents()) return false;
    if (!tokenDoc?.id) return false;

    this.visibilityState?.removeChangedToken?.(tokenDoc.id);
    return true;
  }

  #handleTokenVisibilityAffectingUpdated(tokenDoc) {
    if (!this.#shouldProcessEvents()) return false;
    if (!tokenDoc?.id) return false;

    this.visibilityState?.markTokenChangedImmediate?.(tokenDoc.id);
    return true;
  }

  #handleEffectVisibilityUpdated(tokenIds = []) {
    if (!this.#shouldProcessEvents()) return false;
    if (!Array.isArray(tokenIds) || tokenIds.length === 0) return false;

    this.#clearVisibilityAndLosCaches();
    tokenIds.forEach((tokenId) => {
      this.visibilityState?.markTokenChangedImmediate?.(tokenId);
    });
    return true;
  }

  #handleEffectLightEmitterUpdated() {
    if (!this.#shouldProcessEvents()) return false;

    this.#clearVisibilityAndLosCaches();
    this.visibilityState?.markAllTokensChangedImmediate?.();
    return true;
  }

  #clearVisibilityAndLosCaches() {
    try {
      this.cacheManager?.clearVisibilityCache?.();
      this.cacheManager?.clearLosCache?.();
    } catch (error) {
      console.warn('PF2E Visioner | Failed to clear visibility/LOS caches:', error);
    }
  }

  #handleItemVisibilityUpdated(metadata = {}) {
    if (!this.#shouldProcessEvents()) return false;
    const tokenIds = Array.isArray(metadata.tokenIds) ? metadata.tokenIds : [];
    if (tokenIds.length === 0) return false;

    this.#clearVisionAnalyzerCaches(metadata.tokens);
    this.cacheManager?.getGlobalVisibilityCache?.()?.clear?.();
    this.#markTokenIdsImmediate(tokenIds);
    return true;
  }

  #handleItemVisionEquipmentUpdated(metadata = {}) {
    if (!this.#shouldProcessEvents()) return false;
    const tokenIds = Array.isArray(metadata.tokenIds) ? metadata.tokenIds : [];
    if (tokenIds.length === 0) return false;

    this.#clearVisionAnalyzerCaches(metadata.tokens);
    this.#markTokenIdsImmediate(tokenIds);
    return true;
  }

  #handleItemLightEmitterUpdated(metadata = {}) {
    if (!this.#shouldProcessEvents()) return false;

    this.#clearVisionAnalyzerCaches(metadata.tokens);
    this.visibilityState?.markAllTokensChangedImmediate?.();
    return true;
  }

  #handleActorVisibilityUpdated(metadata = {}) {
    if (!this.#shouldProcessEvents()) return false;
    const tokenIds = Array.isArray(metadata.tokenIds) ? metadata.tokenIds : [];
    if (tokenIds.length === 0) return false;

    this.#markTokenIdsImmediate(tokenIds);
    return true;
  }

  #handleTemplateLightUpdated() {
    if (!this.#shouldProcessEvents()) return false;

    this.visibilityState?.markAllTokensChangedImmediate?.();
    return true;
  }

  #clearVisionAnalyzerCaches(tokens = []) {
    if (!Array.isArray(tokens)) return;
    tokens.forEach((token) => {
      this.visionAnalyzer?.clearCache?.(token);
    });
  }

  #markTokenIdsImmediate(tokenIds = []) {
    tokenIds.forEach((tokenId) => {
      this.visibilityState?.markTokenChangedImmediate?.(tokenId);
    });
  }

  #isLightingRefreshFromTokenSelection() {
    try {
      const now = Date.now();
      const timeSinceControl = now - this.constructor._lastControlTokenTime;
      return timeSinceControl < 100;
    } catch {
      return false;
    }
  }

  static trackControlTokenEvent() {
    this._lastControlTokenTime = Date.now();
  }
}
