import {
  clearSuppressLightingRefresh,
  isLightingRefreshAfterBatchSuppressed,
  isLightingRefreshSuppressed,
  setSuppressLightingRefresh,
} from '../../../services/runtime-state.js';
import { LightingPrecomputer } from './LightingPrecomputer.js';
import { VisionAnalyzer } from '../VisionAnalyzer.js';
import {
  AvsMovementInvalidationWorkflow,
  defaultRequestTakeCoverExpirationForToken,
} from './AvsMovementInvalidationWorkflow.js';
import {
  AvsInvalidationReasonRouter,
  changeAffectsLineOfSight,
  changeAffectsVisibility,
} from './AvsInvalidationReasonRouter.js';

export { AVS_INVALIDATION_REASON_HANDLERS } from './AvsInvalidationReasonRouter.js';

export class AvsInvalidationCoordinator {
  static _lastControlTokenTime = 0;

  #reasonRouter;
  #movementInvalidation;

  constructor({
    systemStateProvider,
    visibilityStateManager,
    cacheManager = null,
    batchOrchestrator = null,
    visionAnalyzer = null,
    spatialAnalyzer = null,
    overrideValidationManager = null,
    requestTakeCoverExpirationForToken = defaultRequestTakeCoverExpirationForToken,
    setMovedTokenId,
  } = {}) {
    this.systemState = systemStateProvider;
    this.visibilityState = visibilityStateManager;
    this.cacheManager = cacheManager;
    this.batchOrchestrator = batchOrchestrator;
    this.visionAnalyzer = visionAnalyzer ?? VisionAnalyzer.getInstance?.();
    this.spatialAnalyzer = spatialAnalyzer;
    this.#movementInvalidation = new AvsMovementInvalidationWorkflow({
      shouldProcessEvents: () => this.#shouldProcessEvents(),
      visibilityState: this.visibilityState,
      cacheManager: this.cacheManager,
      batchOrchestrator: this.batchOrchestrator,
      visionAnalyzer: this.visionAnalyzer,
      overrideValidationManager,
      requestTakeCoverExpirationForToken,
      setMovedTokenId,
    });
    this.#reasonRouter = new AvsInvalidationReasonRouter({
      handlersByName: this.#createReasonHandlers(),
    });
  }

  invalidate(change = {}) {
    return this.#reasonRouter.dispatch(change);
  }

  #createReasonHandlers() {
    return {
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
  }

  #shouldProcessEvents() {
    return this.systemState?.shouldProcessEvents?.() !== false;
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
    if (!changeAffectsVisibility(changeData)) return false;

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

    if (this.batchOrchestrator?.isTokenMovementActive?.()) {
      this.batchOrchestrator.recordMovementLightingRefreshSuppressed?.();
      return false;
    }

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
    if (!changeAffectsLineOfSight(changeData)) return false;

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
    return this.#movementInvalidation.handleTokenMovementCompleted(tokenDoc, movementChanges);
  }

  #handleTokenPositionUpdated(tokenDoc, movementChanges) {
    return this.#movementInvalidation.handleTokenPositionUpdated(tokenDoc, movementChanges);
  }

  #handleTokenMovementOverrideValidationRequired(tokenDoc) {
    return this.#movementInvalidation.handleTokenMovementOverrideValidationRequired(tokenDoc);
  }

  #handleTokenMovementActionCacheInvalidated() {
    return this.#movementInvalidation.handleTokenMovementActionCacheInvalidated();
  }

  #handleTokenMovementActionUpdated(tokenDoc) {
    return this.#movementInvalidation.handleTokenMovementActionUpdated(tokenDoc);
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
    this.visibilityState?.markAllTokensChangedImmediate?.();
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
    if (metadata.recalculateAllTokenPairs) {
      this.#clearVisibilityAndLosCaches();
      this.visibilityState?.markAllTokensChangedImmediate?.();
      return true;
    }

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

    this.visibilityState?.markAllTokensChangedImmediate?.();
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
