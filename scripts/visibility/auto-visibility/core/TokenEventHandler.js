import { MODULE_ID } from '../../../constants.js';
import { updateWallVisualsForEveryone } from '../../../services/socket.js';
import { updateWallVisuals } from '../../../services/visual-effects.js';
import { LightingPrecomputer } from './LightingPrecomputer.js';
/**
 * Handles token-related events and updates for the auto-visibility system.
 * Manages position changes, light updates, exclusions, and override validations.
 *
 * Follows SOLID principles by depending on abstractions rather than concrete implementations.
 *
 * @class TokenEventHandler
 */
export class TokenEventHandler {
  constructor(
    systemStateProvider,
    visibilityStateManager,
    spatialAnalyzer,
    exclusionManager,
    overrideValidationManager,
    positionManager,
    cacheManager = null,
    batchOrchestrator = null,
  ) {
    this.systemState = systemStateProvider;
    this.visibilityState = visibilityStateManager;
    this.spatialAnalyzer = spatialAnalyzer;
    this.exclusionManager = exclusionManager;
    this.overrideValidationManager = overrideValidationManager;
    this.positionManager = positionManager;
    this.cacheManager = cacheManager;
    this.batchOrchestrator = batchOrchestrator;
  }

  initialize() {
    // Token events
    Hooks.on('updateToken', this.handleTokenUpdate.bind(this));
    Hooks.on('createToken', this.handleTokenCreate.bind(this));
    Hooks.on('moveToken', this.handleMoveToken.bind(this));
  }

  async handleMoveToken(tokenDoc, updateData, options, userId) {
    // This fires for EVERY grid square during animation
    // We only want to process the FINAL destination
    // Use token-specific check if available, otherwise fall back to general check
    const shouldProcess = this.systemState.shouldProcessEventsForToken
      ? this.systemState.shouldProcessEventsForToken(tokenDoc)
      : this.systemState.shouldProcessEvents();

    if (!shouldProcess) {
      return;
    }

    // Check if this is the final move segment
    // The updateData has a 'chain' array - if it's empty, this is the final move
    const isFinalMove = !updateData.chain || updateData.chain.length === 0;

    if (!isFinalMove) {
      // This is an intermediate waypoint, skip processing
      return;
    }

    // This is the final destination, process visibility
    // Use destination from updateData - this is the final position after animation
    const finalX = updateData.destination?.x ?? tokenDoc.x;
    const finalY = updateData.destination?.y ?? tokenDoc.y;

    try {
      // Reapply rule element operations after movement to restore overrides
      await this._reapplyRuleElementsAfterMovement(tokenDoc);

      // Clear position-dependent caches since token has moved
      // CRITICAL: Clear lighting caches FIRST to set forceFreshComputation flag
      // This ensures subsequent batches bypass burst optimization and use fresh lighting
      const globalVisCache = this.cacheManager?.getGlobalVisibilityCache();
      LightingPrecomputer.clearLightingCaches(globalVisCache);
      this.cacheManager?.clearLosCache?.();
      this.cacheManager?.clearVisibilityCache?.();

      // CRITICAL: Clear VisionAnalyzer's internal caches for this specific token
      // The wall cache and capabilities cache can become stale when token moves
      if (this.visionAnalyzer?.clearCache) {
        this.visionAnalyzer.clearCache(tokenDoc);
      }

      if (this.overrideValidationManager) {
        this.overrideValidationManager.queueOverrideValidation(tokenDoc.id);
        this.overrideValidationManager.processQueuedValidations().catch(() => { });
      }

      const movementChanges = {
        x: finalX,
        y: finalY,
      };

      this.visibilityState.markTokenChangedWithSpatialOptimization(tokenDoc, movementChanges);
    } catch (e) {
      console.warn('PF2E Visioner | Error processing move token:', e);
    }
  }

  async _reapplyRuleElementsAfterMovement(tokenDoc) {
    try {
      const token = tokenDoc.object;
      if (!token?.actor) return;

      const effects = token.actor.items?.filter(i => i.type === 'effect') || [];
      for (const effect of effects) {
        const rules = effect.system?.rules || [];
        const hasVisionerRules = rules.some(rule =>
          rule.key === 'PF2eVisionerEffect' || rule.key === 'PF2eVisionerVisibility'
        );

        if (hasVisionerRules && Array.isArray(effect.ruleElements)) {
          for (const ruleElement of effect.ruleElements) {
            if ((ruleElement.key === 'PF2eVisionerEffect' || ruleElement.key === 'PF2eVisionerVisibility') &&
                typeof ruleElement.applyOperations === 'function') {
              await ruleElement.applyOperations();
            }
          }
        }
      }
    } catch (error) {
      console.warn('PF2E Visioner | Failed to reapply rule elements after movement:', error);
    }
  }

  /**
   * Handles token document updates
   * @param {Object} tokenDoc - The token document
   * @param {Object} changes - The changes object
   * @param {Object} options - Update options (includes animation flag)
   */
  handleTokenUpdate(tokenDoc, changes, options = {}) {
    this.systemState.debug(() => ({
      msg: 'handleTokenUpdate fired',
      tokenName: tokenDoc?.name,
      tokenId: tokenDoc?.id,
      changes,
      options,
      stack: new Error().stack,
    }));

    // Use token-specific check if available, otherwise fall back to general check
    const shouldProcess = this.systemState.shouldProcessEventsForToken
      ? this.systemState.shouldProcessEventsForToken(tokenDoc)
      : this.systemState.shouldProcessEvents();

    if (!shouldProcess) {
      this.systemState.debug(() => ({
        msg: 'handleTokenUpdate skipped - shouldProcess=false',
        tokenId: tokenDoc?.id,
      }));
      return;
    }

    // Early exit: if ONLY _id or non-visibility flags changed, skip processing
    const keys = Object.keys(changes);
    const relevantKeys = keys.filter(
      (k) => k !== '_id' && !k.startsWith('flags.') && k !== 'flags',
    );
    if (relevantKeys.length === 0 && !changes.flags?.[MODULE_ID]) {
      this.systemState.debug(() => ({
        msg: 'handleTokenUpdate skipped - no relevant changes',
        tokenId: tokenDoc?.id,
        keys,
      }));
      return;
    }

    try {
      this.systemState.debug('onTokenUpdate', tokenDoc.id, tokenDoc.name, Object.keys(changes));
    } catch { }

    // Analyze changes once to derive flags used throughout handling
    const changeFlags = this._analyzeChanges(changes);
    this.systemState.debug(() => ({
      msg: 'handleTokenUpdate changeFlags',
      tokenId: tokenDoc?.id,
      changeFlags,
    }));

    // Skip position updates during animation/dragging - only process completed movements
    const hasPositionChange = changes.x !== undefined || changes.y !== undefined;
    if (hasPositionChange) {
      // Set lastMovedTokenId BEFORE returning early so the hook can pick it up
      try {
        globalThis.game = globalThis.game || {};
        game.pf2eVisioner = game.pf2eVisioner || {};
        game.pf2eVisioner.lastMovedTokenId = tokenDoc.id;
      } catch { }

      const token = tokenDoc.object;

      // Check if token is currently animating or being dragged
      const isAnimating = token?._animation?.state !== 'completed';
      const isDragging = token?._dragHandle !== undefined && token?._dragHandle !== null;

      if (isAnimating || isDragging) {
        this.systemState.debug(() => ({
          msg: 'handleTokenUpdate skipped - animating or dragging',
          tokenId: tokenDoc?.id,
          isAnimating,
          isDragging,
        }));

        // CRITICAL: Notify batch orchestrator that token is moving BEFORE we skip
        // This ensures the orchestrator knows to defer batch processing until movement completes
        if (changeFlags.positionChanged && this.batchOrchestrator?.notifyTokenMovementStart) {
          this.batchOrchestrator.notifyTokenMovementStart();
        }

        // CRITICAL: Store the updated document position BEFORE returning early
        // This ensures the PositionManager has the correct destination position
        // when the batch eventually processes (either from moveToken or later updateToken)
        this.positionManager.storeUpdatedTokenDoc(tokenDoc.id, {
          id: tokenDoc.id,
          x: changes.x !== undefined ? changes.x : tokenDoc.x,
          y: changes.y !== undefined ? changes.y : tokenDoc.y,
          width: tokenDoc.width,
          height: tokenDoc.height,
          name: tokenDoc.name,
          elevation: tokenDoc.elevation,
        });

        // Also pin the destination position
        this.positionManager.pinTokenDestination(tokenDoc, changes);

        // If animating (e.g., remote player movement), wait for animation to complete
        if (isAnimating && token?._animation?.promise) {
          const tokenId = tokenDoc.id;
          const movementChanges = {
            x: changes.x ?? tokenDoc.x,
            y: changes.y ?? tokenDoc.y,
          };

          token._animation.promise
            .then(() => {
              // After animation completes, clear position-dependent caches and trigger visibility recalculation
              try {
                const globalVisCache = this.cacheManager?.getGlobalVisibilityCache();
                LightingPrecomputer.clearLightingCaches(globalVisCache);
                this.cacheManager?.clearLosCache?.();
                this.cacheManager?.clearVisibilityCache?.();

                // CRITICAL: Clear VisionAnalyzer's internal caches for this specific token
                const tokenDocObj = canvas.tokens?.get(tokenId)?.document;
                if (tokenDocObj && this.visionAnalyzer?.clearCache) {
                  this.visionAnalyzer.clearCache(tokenDocObj);
                }

                // Trigger visibility recalculation with spatial optimization
                if (tokenDocObj) {
                  this.visibilityState.markTokenChangedWithSpatialOptimization(
                    tokenDocObj,
                    movementChanges,
                  );
                }

                // Queue override validation
                if (this.overrideValidationManager) {
                  this.overrideValidationManager.queueOverrideValidation(tokenId);
                  this.overrideValidationManager.processQueuedValidations().catch(() => { });
                }
              } catch (e) {
                console.warn('PF2E Visioner | Error processing validation after animation:', e);
              }
            })
            .catch(() => {
              /* ignore animation errors */
            });
          return; // Early return only when we have a promise to wait for
        }

        // If animating but no promise, or if dragging, skip this update
        // The moveToken hook or a later updateToken will handle it when animation completes
        return;
      }

      // Check if token was dragged to the same position (no actual movement)
      const oldX = tokenDoc.x;
      const oldY = tokenDoc.y;
      const newX = changes.x ?? oldX;
      const newY = changes.y ?? oldY;

      if (oldX === newX && oldY === newY) {
        // Token dragged but released at same position - clear cached data
        this.positionManager.clearUpdatedTokenDocsCache(tokenDoc.id);
        this.systemState.debug('token-drag-same-position', tokenDoc.id, 'cleared cached positions');
        return;
      }
    }

    // Early light change detection (handles nested dotted paths like "light.bright")
    if (changeFlags.lightChanged) {
      this.systemState.debug(() => ({
        msg: 'handleTokenUpdate light change detected',
        tokenId: tokenDoc?.id,
        lightChanges: changes.light,
      }));
      // Token light changes affect visibility but not LOS; clear only visibility cache
      try {
        this.cacheManager?.clearVisibilityCache?.();
      } catch {
        /* best-effort */
      }

      // Defer recalculation until after Foundry refreshes lighting, so we read updated sources
      let scheduled = false;
      const startTime = performance.now();
      try {
        globalThis.game = globalThis.game || {};
        game.pf2eVisioner = game.pf2eVisioner || {};
        game.pf2eVisioner.suppressLightingRefresh = true;

        Hooks.once('lightingRefresh', () => {
          try {
            this._handleLightChangeWithSpatialOptimization(tokenDoc, changes);
          } finally {
            delete game.pf2eVisioner.suppressLightingRefresh;
          }
        });
        scheduled = true;
      } catch (error) {
        /* ignore */
        console.warn('[PF2E Visioner] Failed to schedule lightingRefresh hook:', error);
        delete game.pf2eVisioner?.suppressLightingRefresh;
      }

      // Fallback: if the hook didn't schedule, use a short timeout
      if (!scheduled) {
        setTimeout(() => {
          try {
            this._handleLightChangeWithSpatialOptimization(tokenDoc, changes);
          } finally {
            delete game.pf2eVisioner?.suppressLightingRefresh;
          }
        }, 50);
      }
      // Continue processing other changes (e.g., movement) for position pinning
    }

    // Movement action changes (flying vs grounded) affect tremorsense detection
    // Clear visibility cache to avoid stale tremorsense results
    if (changeFlags.movementActionChanged) {
      try {
        this.cacheManager?.clearVisibilityCache?.();
      } catch {
        /* best-effort */
      }
    }

    // Hidden flag toggle - recalculate everyone
    if (Object.prototype.hasOwnProperty.call(changes, 'hidden')) {
      this.systemState.debug(() => ({
        msg: 'handleTokenUpdate hidden toggle',
        tokenId: tokenDoc?.id,
        hidden: changes.hidden,
      }));
      this._handleHiddenToggle(tokenDoc, changes);
      return;
    }

    const isHidden = tokenDoc.hidden === true;

    // Log wall flag changes for debugging
    if (changeFlags.wallFlagsChanged) {
      this.systemState.debug('wall-flags-detected', tokenDoc.id, changes.flags?.[MODULE_ID]?.walls);
    }

    // Handle light emitter movement (global recalculation)
    const emitterMoved = changeFlags.positionChanged && this._tokenEmitsLight(tokenDoc, changes);
    if (emitterMoved) {
      this.systemState.debug(() => ({
        msg: 'handleTokenUpdate light emitter moved - global recalc',
        tokenId: tokenDoc?.id,
      }));
      this.systemState.debug(
        'emitter-moved: global recalculation for token light move',
        tokenDoc.id,
      );
      this.visibilityState.markTokenChangedWithSpatialOptimization();
      // Continue processing to pin positions
    }

    // Handle hidden tokens (with sneak special case)
    if (isHidden && !changeFlags.lightChanged && !emitterMoved) {
      this.systemState.debug(() => ({
        msg: 'handleTokenUpdate hidden token',
        tokenId: tokenDoc?.id,
      }));
      this._handleHiddenToken(tokenDoc, changes);
      return;
    }

    // Handle excluded tokens (with sneak special case)
    if (this._handleExcludedToken(tokenDoc, changes)) {
      this.systemState.debug(() => ({
        msg: 'handleTokenUpdate excluded token',
        tokenId: tokenDoc?.id,
      }));
      return;
    }

    // Process relevant changes
    if (this._hasRelevantChanges(changeFlags)) {
      this.systemState.debug(() => ({
        msg: 'handleTokenUpdate processing relevant changes',
        tokenId: tokenDoc?.id,
        changeFlags,
      }));
      this._processRelevantChanges(tokenDoc, changes, changeFlags);
    } else {
      this.systemState.debug(() => ({
        msg: 'handleTokenUpdate no relevant changes',
        tokenId: tokenDoc?.id,
      }));
    }
  }

  /**
   * Handle token creation
   * @param {TokenDocument} tokenDoc
   */
  handleTokenCreate(tokenDoc) {
    this.systemState.debug(() => ({
      msg: 'handleTokenCreate fired',
      tokenName: tokenDoc?.name,
      tokenId: tokenDoc?.id,
      stack: new Error().stack,
    }));

    if (!this.systemState.shouldProcessEvents()) return;

    try {
      const tok = canvas.tokens?.get?.(tokenDoc.id);
      if (tok && this.exclusionManager.isExcludedToken(tok)) return;
    } catch {
      /* ignore */
    }

    this.visibilityState.markTokenChangedImmediate(tokenDoc.id);
  }

  /**
   * Handles token deletion
   * @param {Object} tokenDoc - The token document
   */
  handleTokenDelete(tokenDoc) {
    if (!this.systemState.shouldProcessEvents()) return;

    // Clean up any pending changes for this token
    this.visibilityState.removeChangedToken(tokenDoc.id);
  }

  // Private helper methods

  _handleHiddenToggle(tokenDoc, changes) {
    try {
      // Check if this is an invisible token being un-Foundry-hidden
      const wasHidden = changes.hidden === false; // Being un-hidden
      const token = tokenDoc.object;

      if (wasHidden && token?.actor) {
        // Check if the token has invisible condition
        const isInvisible =
          token.actor.hasCondition?.('invisible') ||
          token.actor.system?.conditions?.invisible?.active ||
          token.actor.conditions?.has?.('invisible');

        if (isInvisible) {
          // Import ConditionManager to handle special invisible state setup
          // Wait for this to complete before doing global recalculation
          import('../ConditionManager.js')
            .then(async ({ ConditionManager }) => {
              const conditionManager = ConditionManager.getInstance();
              await conditionManager.handleFoundryUnhideInvisible(token);

              const ids = canvas.tokens?.placeables?.map((t) => t.document.id) || [];
              this.visibilityState.recalculateForTokens(ids);
            })
            .catch((error) => {
              console.warn('Failed to handle Foundry unhide for invisible token:', error);
              // Fallback: still do the global recalculation
              const ids = canvas.tokens?.placeables?.map((t) => t.document.id) || [];
              this.visibilityState.recalculateForTokens(ids);
            });

          // Return early - don't do the global recalculation immediately
          return;
        }
      }

      // Always do the global recalculation (unless we returned early above)
      const ids = canvas.tokens?.placeables?.map((t) => t.document.id) || [];
      this.visibilityState.recalculateForTokens(ids);
    } catch (error) {
      console.warn('Error in _handleHiddenToggle:', error);
    }
  }

  _analyzeChanges(changes) {
    const keys = Object.keys(changes || {});
    const hasPrefix = (prefix) => keys.some((k) => k === prefix || k.startsWith(prefix + '.'));
    return {
      positionChanged:
        changes.x !== undefined || changes.y !== undefined || changes.elevation !== undefined,
      lightChanged: changes.light !== undefined || hasPrefix('light'),
      visionChanged: changes.vision !== undefined || hasPrefix('vision'),
      effectsChanged: changes.actorData?.effects !== undefined || changes.actorData !== undefined,
      wallFlagsChanged: changes.flags?.[MODULE_ID]?.walls !== undefined,
      movementActionChanged: changes.movementAction !== undefined,
    };
  }

  _tokenEmitsLight(tokenDoc, changes) {
    try {
      const lightConfig = changes.light !== undefined ? changes.light : tokenDoc.light;
      if (!lightConfig) return false;
      return lightConfig.enabled === true && (lightConfig.bright > 0 || lightConfig.dim > 0);
    } catch {
      return false;
    }
  }

  _handleLightChangeWithSpatialOptimization(tokenDoc, changes) {
    const startTime = performance.now();
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

      this.visibilityState.markTokenChangedImmediate(tokenDoc.id);
      affectedTokens.forEach((token) => {
        this.visibilityState.markTokenChangedImmediate(token.document.id);
      });
    } catch (error) {
      console.error(
        '[PF2E Visioner] Spatial optimization failed, falling back to full recalculation:',
        error,
      );
      this.systemState.debug('light-change-spatial-fallback', tokenDoc.id, error);
      this.visibilityState.markAllTokensChangedImmediate();
    }
  }

  _handleHiddenToken(tokenDoc, changes) {
    // Carve-out: if this token is sneaking and moved, still queue override validation
    try {
      const tokHidden = canvas.tokens?.get?.(tokenDoc.id);
      const positionChangedHidden = changes.x !== undefined || changes.y !== undefined;
      const isSneakingHidden = tokHidden?.document?.getFlag?.(MODULE_ID, 'sneak-active');

      if (isSneakingHidden && positionChangedHidden) {
        try {
          globalThis.game = globalThis.game || {};
          game.pf2eVisioner = game.pf2eVisioner || {};
          game.pf2eVisioner.lastMovedTokenId = tokenDoc.id;
        } catch { }
        this.overrideValidationManager.queueOverrideValidation(tokenDoc.id);
      }
    } catch {
      /* best-effort */
    }
  }

  _handleExcludedToken(tokenDoc, changes) {
    try {
      const tok = canvas.tokens?.get?.(tokenDoc.id);
      if (tok && this.exclusionManager.isExcludedToken(tok)) {
        // Carve-out: if token is excluded due to sneaking, still queue override validation on movement
        const positionChangedExcluded = changes.x !== undefined || changes.y !== undefined;
        const isSneakingExcluded = tok?.document?.getFlag?.(MODULE_ID, 'sneak-active');

        if (isSneakingExcluded && positionChangedExcluded) {
          try {
            globalThis.game = globalThis.game || {};
            game.pf2eVisioner = game.pf2eVisioner || {};
            game.pf2eVisioner.lastMovedTokenId = tokenDoc.id;
          } catch { }
          this.overrideValidationManager.queueOverrideValidation(tokenDoc.id);
        }
        return true; // Token was excluded
      }
    } catch {
      /* ignore */
    }
    return false; // Token was not excluded
  }

  _hasRelevantChanges(changeFlags) {
    return (
      changeFlags.positionChanged ||
      changeFlags.lightChanged ||
      changeFlags.visionChanged ||
      changeFlags.effectsChanged ||
      changeFlags.wallFlagsChanged ||
      changeFlags.movementActionChanged
    );
  }

  _processRelevantChanges(tokenDoc, changes, changeFlags) {
    // Handle wall flag changes first - these affect visual wall rendering
    if (changeFlags.wallFlagsChanged) {
      this._handleWallFlagChanges(tokenDoc);
    }

    // Store the updated document for position calculations
    this._storeUpdatedDocument(tokenDoc, changes);

    // Pin final destination center for smooth animations
    this._pinTokenPosition(tokenDoc, changes, changeFlags.positionChanged);

    // Handle visibility recalculation
    this._handleVisibilityRecalculation(tokenDoc, changes, changeFlags);

    // Handle override validation for movement
    if (changeFlags.positionChanged) {
      this._handleMovementOverrides(tokenDoc);
    }
  }

  _storeUpdatedDocument(tokenDoc, changes) {
    this.positionManager.storeUpdatedTokenDoc(tokenDoc.id, {
      id: tokenDoc.id,
      x: changes.x !== undefined ? changes.x : tokenDoc.x,
      y: changes.y !== undefined ? changes.y : tokenDoc.y,
      width: tokenDoc.width,
      height: tokenDoc.height,
      name: tokenDoc.name,
    });

    this.systemState.debug('store-updatedDoc', tokenDoc.id, {
      x: changes.x ?? tokenDoc.x,
      y: changes.y ?? tokenDoc.y,
      w: tokenDoc.width,
      h: tokenDoc.height,
    });
  }

  _pinTokenPosition(tokenDoc, changes, positionChanged) {
    try {
      if (positionChanged && canvas?.grid?.size) {
        const cx =
          (changes.x !== undefined ? changes.x : tokenDoc.x) +
          (tokenDoc.width * canvas.grid.size) / 2;
        const cy =
          (changes.y !== undefined ? changes.y : tokenDoc.y) +
          (tokenDoc.height * canvas.grid.size) / 2;

        // Use shorter pin duration to reduce visual teleport effect
        const pinDuration = Math.min(this.positionManager.getPinDurationMs(), 500); // Max 500ms

        this.positionManager.pinPosition(tokenDoc.id, {
          x: cx,
          y: cy,
          elevation: changes.elevation !== undefined ? changes.elevation : tokenDoc.elevation || 0,
          until: Date.now() + pinDuration,
        });

        this.systemState.debug('pin-position', tokenDoc.id, {
          x: cx,
          y: cy,
          untilMs: pinDuration,
        });
      }
    } catch {
      /* ignore */
    }
  }

  _handleVisibilityRecalculation(tokenDoc, changes, changeFlags) {
    if (changeFlags.lightChanged) {
      this.systemState.debug(() => ({
        msg: '_handleVisibilityRecalculation light changed - mark all',
        tokenId: tokenDoc?.id,
      }));
      this.visibilityState.markAllTokensChangedImmediate();
    } else if (changeFlags.movementActionChanged) {
      this.systemState.debug(() => ({
        msg: '_handleVisibilityRecalculation movement action changed',
        tokenId: tokenDoc?.id,
      }));
      // Movement action affects tremorsense detection (flying vs grounded)
      // Need to recalculate for tokens that might detect this one via tremorsense
      this.visibilityState.markTokenChangedImmediate(tokenDoc.id);
    } else if (changeFlags.positionChanged) {
      this.systemState.debug(() => ({
        msg: '_handleVisibilityRecalculation position changed - spatial optimization',
        tokenId: tokenDoc?.id,
        x: changes.x,
        y: changes.y,
      }));
      try {
        const globalVisCache = this.cacheManager?.getGlobalVisibilityCache();
        LightingPrecomputer.clearLightingCaches(globalVisCache);
        this.cacheManager?.clearLosCache?.();
        this.cacheManager?.clearVisibilityCache?.();
      } catch {
        /* best-effort */
      }

      // Notify batch orchestrator that token is moving to delay processing
      if (this.batchOrchestrator?.notifyTokenMovementStart) {
        this.batchOrchestrator.notifyTokenMovementStart();
      }
      this.visibilityState.markTokenChangedWithSpatialOptimization(tokenDoc, changes);
    } else {
      this.systemState.debug(() => ({
        msg: '_handleVisibilityRecalculation other change - mark token',
        tokenId: tokenDoc?.id,
      }));
      this.visibilityState.markTokenChangedImmediate(tokenDoc.id);
    }
  }

  _handleMovementOverrides(tokenDoc) {
    // Persist the actual mover for downstream UI
    try {
      globalThis.game = globalThis.game || {};
      game.pf2eVisioner = game.pf2eVisioner || {};
      game.pf2eVisioner.lastMovedTokenId = tokenDoc.id;
      this.systemState.debug('set lastMovedTokenId', tokenDoc.id);
    } catch { }

    // Queue override validation for the moved token
    this.overrideValidationManager.queueOverrideValidation(tokenDoc.id);
  }

  _handleWallFlagChanges(tokenDoc) {
    try {
      this.systemState.debug('wall-flags-changed', tokenDoc.id, 'triggering wall visual update');

      // Update wall visuals for all clients with per-player visibility
      // Each client will apply their own visibility permissions for this token's changes
      updateWallVisualsForEveryone(tokenDoc.id);

      // Also update locally to ensure immediate feedback
      updateWallVisuals(tokenDoc.id).catch((error) => {
        console.warn(
          'PF2E Visioner | TokenEventHandler - Error updating local wall visuals:',
          error,
        );
      });
    } catch (error) {
      console.warn('PF2E Visioner | TokenEventHandler - Error handling wall flag changes:', error);
    }
  }
}
