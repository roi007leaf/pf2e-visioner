import { MODULE_ID } from '../../../constants.js';
import { setLastMovedTokenId } from '../../../services/runtime-state.js';
import { updateWallVisualsForEveryone } from '../../../services/socket.js';
import { updateWallVisuals } from '../../../services/visual-effects.js';
import { AvsInvalidationCoordinator } from './AvsInvalidationCoordinator.js';
import {
  tokenCreated,
  tokenDeleted,
  tokenHiddenToggled,
  tokenLightEmitterMoved,
  tokenLightRecalculationRequired,
  tokenLightUpdated,
  tokenMovementActionCacheInvalidated,
  tokenMovementActionUpdated,
  tokenMovementCompleted,
  tokenMovementOverrideValidationRequired,
  tokenPositionUpdated,
  tokenVisibilityAffectingUpdated,
} from './InvalidationIntents.js';

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
    invalidationCoordinator = null,
  ) {
    this.systemState = systemStateProvider;
    this.visibilityState = visibilityStateManager;
    this.spatialAnalyzer = spatialAnalyzer;
    this.exclusionManager = exclusionManager;
    this.overrideValidationManager = overrideValidationManager;
    this.positionManager = positionManager;
    this.cacheManager = cacheManager;
    this.batchOrchestrator = batchOrchestrator;
    this.invalidation = invalidationCoordinator ?? new AvsInvalidationCoordinator({
      systemStateProvider,
      visibilityStateManager,
      cacheManager,
      batchOrchestrator,
      spatialAnalyzer,
      overrideValidationManager,
    });
    this._deferredAnimatedMoves = new Map();
    this._recentlyHandledAnimatedMoves = new Map();
    this._recentAnimationSkipMs = 1000;
  }

  initialize() {
    // Token events
    Hooks.on('updateToken', this.handleTokenUpdate.bind(this));
    Hooks.on('createToken', this.handleTokenCreate.bind(this));
    Hooks.on('deleteToken', this.handleTokenDelete.bind(this));
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
    const tokenId = tokenDoc.id;
    const token = tokenDoc.object;
    const activeAnimation = token?._animation;

    const movementChanges = {
      x: finalX,
      y: finalY,
    };

    if (this._wasAnimatedMoveHandledRecently(tokenId, movementChanges)) {
      return;
    }

    if (this._isAnimatedMoveDeferred(tokenId, movementChanges)) {
      return;
    }

    try {
      if (activeAnimation?.promise && activeAnimation.state !== 'completed') {
        try {
          await activeAnimation.promise;
        } catch {
          /* ignore animation errors */
        }

        if (
          this._wasAnimatedMoveHandledRecently(tokenId, movementChanges) ||
          this._isAnimatedMoveDeferred(tokenId, movementChanges)
        ) {
          return;
        }
      }

      await this._finalizeCompletedMovement(
        tokenDoc,
        movementChanges,
        { options, userId },
      );
    } catch (e) {
      console.warn('PF2E Visioner | Error processing move token:', e);
    }
  }

  _sameMovementDestination(left, right) {
    if (!left || !right) return false;
    return left.x === right.x && left.y === right.y;
  }

  _wasAnimatedMoveHandledRecently(tokenId, movementChanges = null) {
    const entry = this._recentlyHandledAnimatedMoves.get(tokenId);
    if (!entry) return false;
    if (entry.until < Date.now()) {
      this._recentlyHandledAnimatedMoves.delete(tokenId);
      return false;
    }
    return !movementChanges || this._sameMovementDestination(entry, movementChanges);
  }

  _markAnimatedMoveHandledRecently(tokenId, movementChanges = {}) {
    this._recentlyHandledAnimatedMoves.set(tokenId, {
      x: movementChanges.x,
      y: movementChanges.y,
      until: Date.now() + this._recentAnimationSkipMs,
    });
  }

  _isAnimatedMoveDeferred(tokenId, movementChanges = null) {
    const deferredMovement = this._deferredAnimatedMoves.get(tokenId);
    if (!deferredMovement) return false;
    return !movementChanges || this._sameMovementDestination(deferredMovement, movementChanges);
  }

  _markAnimatedMoveDeferred(tokenId, movementChanges) {
    this._deferredAnimatedMoves.set(tokenId, {
      x: movementChanges.x,
      y: movementChanges.y,
    });
  }

  _clearAnimatedMoveDeferred(tokenId, movementChanges = null) {
    if (movementChanges && !this._isAnimatedMoveDeferred(tokenId, movementChanges)) return;
    this._deferredAnimatedMoves.delete(tokenId);
  }

  async _finalizeCompletedMovement(tokenDoc, movementChanges, context = {}) {
    if (!tokenDoc) return;

    try {
      this.positionManager.storeUpdatedTokenDoc(tokenDoc.id, {
        id: tokenDoc.id,
        x: movementChanges.x ?? tokenDoc.x,
        y: movementChanges.y ?? tokenDoc.y,
        width: tokenDoc.width,
        height: tokenDoc.height,
        name: tokenDoc.name,
        elevation: tokenDoc.elevation,
      });
    } catch {
      /* best-effort */
    }

    await this._reapplyRuleElementsAfterMovement(tokenDoc);

    this.invalidation.invalidate(tokenMovementCompleted(tokenDoc, movementChanges, context));
  }

  async _reapplyRuleElementsAfterMovement(tokenDoc) {
    try {
      const token = tokenDoc.object;
      if (!token?.actor) return;

      const itemsWithRules = token.actor.items?.filter(i => {
        const rules = i.system?.rules || [];
        return rules.some(rule => rule.key === 'PF2eVisionerEffect');
      }) || [];
      for (const item of itemsWithRules) {
          if (Array.isArray(item.ruleElements)) {
          for (const ruleElement of item.ruleElements) {
            if (ruleElement.key === 'PF2eVisionerEffect' &&
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
  handleTokenUpdate(tokenDoc, changes, options = {}, userId) {
    this.systemState.debug(() => ({
      msg: 'handleTokenUpdate fired',
      tokenName: tokenDoc?.name,
      tokenId: tokenDoc?.id,
      changes,
      options,
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
    let effectiveChangeFlags = changeFlags;

    // Skip position updates during animation/dragging - only process completed movements
    const hasPositionChange = changes.x !== undefined || changes.y !== undefined;
    if (hasPositionChange) {
      // Set lastMovedTokenId BEFORE returning early so the hook can pick it up
      try {
        setLastMovedTokenId(tokenDoc.id);
      } catch { }

      const token = tokenDoc.object;

      // Check if token is currently animating or being dragged
      const isAnimating = token?._animation != null && token._animation.state !== 'completed';
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

        // If animating (e.g., remote player movement), wait for animation to complete
        if (isAnimating && token?._animation?.promise) {
          const tokenId = tokenDoc.id;
          const movementChanges = {
            x: changes.x ?? tokenDoc.x,
            y: changes.y ?? tokenDoc.y,
          };
          this._markAnimatedMoveDeferred(tokenId, movementChanges);

          token._animation.promise
            .then(async () => {
              // After animation completes, clear position-dependent caches and trigger visibility recalculation
              try {
                if (!this._isAnimatedMoveDeferred(tokenId, movementChanges)) return;
                const tokenDocObj = canvas.tokens?.get(tokenId)?.document;
                await this._finalizeCompletedMovement(tokenDocObj ?? tokenDoc, movementChanges, {
                  options,
                  userId,
                });
                this._markAnimatedMoveHandledRecently(tokenId, movementChanges);
              } catch (e) {
                console.warn('PF2E Visioner | Error processing validation after animation:', e);
              } finally {
                this._clearAnimatedMoveDeferred(tokenId, movementChanges);
              }
            })
            .catch(() => {
              /* ignore animation errors */
              this._clearAnimatedMoveDeferred(tokenId, movementChanges);
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
      this.invalidation.invalidate(tokenLightUpdated(tokenDoc, changes, { options, userId }));
      // Continue processing other changes (e.g., movement) for position pinning,
      // but don't also run the generic light-change recalculation before Foundry
      // has refreshed lighting sources.
      effectiveChangeFlags = { ...changeFlags, lightChanged: false };
    }

    // Movement action changes (flying vs grounded) affect tremorsense detection
    // Clear visibility cache to avoid stale tremorsense results
    if (effectiveChangeFlags.movementActionChanged) {
      this.invalidation.invalidate(
        tokenMovementActionCacheInvalidated(tokenDoc, changes, { options, userId }),
      );
    }

    // Hidden flag toggle - recalculate everyone
    if (Object.prototype.hasOwnProperty.call(changes, 'hidden')) {
      this.systemState.debug(() => ({
        msg: 'handleTokenUpdate hidden toggle',
        tokenId: tokenDoc?.id,
        hidden: changes.hidden,
      }));
      this.invalidation.invalidate(tokenHiddenToggled(tokenDoc, changes, { options, userId }));
      return;
    }

    const isHidden = tokenDoc.hidden === true;

    // Log wall flag changes for debugging
    if (effectiveChangeFlags.wallFlagsChanged) {
      this.systemState.debug('wall-flags-detected', tokenDoc.id, changes.flags?.[MODULE_ID]?.walls);
    }

    // Handle light emitter movement (global recalculation)
    const emitterMoved = effectiveChangeFlags.positionChanged && this._tokenEmitsLight(tokenDoc, changes);
    if (emitterMoved) {
      this.systemState.debug(() => ({
        msg: 'handleTokenUpdate light emitter moved - global recalc',
        tokenId: tokenDoc?.id,
      }));
      this.systemState.debug(
        'emitter-moved: global recalculation for token light move',
        tokenDoc.id,
      );
      this.invalidation.invalidate(tokenLightEmitterMoved(tokenDoc, changes, { options, userId }));
      // Continue processing to pin positions
    }

    // Handle hidden tokens (with sneak special case)
    if (isHidden && !effectiveChangeFlags.lightChanged && !emitterMoved) {
      this.systemState.debug(() => ({
        msg: 'handleTokenUpdate hidden token',
        tokenId: tokenDoc?.id,
      }));
      this._handleHiddenToken(tokenDoc, changes, { options, userId });
      return;
    }

    // Handle excluded tokens (with sneak special case)
    if (this._handleExcludedToken(tokenDoc, changes, { options, userId })) {
      this.systemState.debug(() => ({
        msg: 'handleTokenUpdate excluded token',
        tokenId: tokenDoc?.id,
      }));
      return;
    }

    // Process relevant changes
    if (this._hasRelevantChanges(effectiveChangeFlags)) {
      this.systemState.debug(() => ({
        msg: 'handleTokenUpdate processing relevant changes',
        tokenId: tokenDoc?.id,
        changeFlags: effectiveChangeFlags,
      }));
      this._processRelevantChanges(tokenDoc, changes, effectiveChangeFlags, { options, userId });
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
    }));

    if (!this.systemState.shouldProcessEvents()) return;

    try {
      const tok = canvas.tokens?.get?.(tokenDoc.id);
      if (tok && this.exclusionManager.isExcludedToken(tok)) return;
    } catch {
      /* ignore */
    }

    this.invalidation.invalidate(tokenCreated(tokenDoc));
  }

  /**
   * Handles token deletion
   * @param {Object} tokenDoc - The token document
   */
  handleTokenDelete(tokenDoc) {
    if (!this.systemState.shouldProcessEvents()) return;

    this.invalidation.invalidate(tokenDeleted(tokenDoc));
  }

  // Private helper methods

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

  _handleHiddenToken(tokenDoc, changes, context = {}) {
    // Carve-out: if this token is sneaking and moved, still queue override validation
    try {
      const tokHidden = canvas.tokens?.get?.(tokenDoc.id);
      const positionChangedHidden = changes.x !== undefined || changes.y !== undefined;
      const isSneakingHidden = tokHidden?.document?.getFlag?.(MODULE_ID, 'sneak-active');

      if (isSneakingHidden && positionChangedHidden) {
        this.invalidation.invalidate(
          tokenMovementOverrideValidationRequired(tokHidden || tokenDoc, changes, context),
        );
      }
    } catch {
      /* best-effort */
    }
  }

  _handleExcludedToken(tokenDoc, changes, context = {}) {
    try {
      const tok = canvas.tokens?.get?.(tokenDoc.id);
      if (tok && this.exclusionManager.isExcludedToken(tok)) {
        // Carve-out: if token is excluded due to sneaking, still queue override validation on movement
        const positionChangedExcluded = changes.x !== undefined || changes.y !== undefined;
        const isSneakingExcluded = tok?.document?.getFlag?.(MODULE_ID, 'sneak-active');

        if (isSneakingExcluded && positionChangedExcluded) {
          this.invalidation.invalidate(
            tokenMovementOverrideValidationRequired(tok || tokenDoc, changes, context),
          );
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

  _processRelevantChanges(tokenDoc, changes, changeFlags, context = {}) {
    // Handle wall flag changes first - these affect visual wall rendering
    if (changeFlags.wallFlagsChanged) {
      this._handleWallFlagChanges(tokenDoc);
    }

    // Store the updated document for position calculations
    this._storeUpdatedDocument(tokenDoc, changes);

    // Handle visibility recalculation
    this._handleVisibilityRecalculation(tokenDoc, changes, changeFlags, context);

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

  _handleVisibilityRecalculation(tokenDoc, changes, changeFlags, context = {}) {
    if (changeFlags.lightChanged) {
      this.systemState.debug(() => ({
        msg: '_handleVisibilityRecalculation light changed - mark all',
        tokenId: tokenDoc?.id,
      }));
      this.invalidation.invalidate(tokenLightRecalculationRequired(tokenDoc, changes, context));
    } else if (changeFlags.movementActionChanged) {
      this.systemState.debug(() => ({
        msg: '_handleVisibilityRecalculation movement action changed',
        tokenId: tokenDoc?.id,
      }));
      this.invalidation.invalidate(tokenMovementActionUpdated(tokenDoc, changes, context));
    } else if (changeFlags.positionChanged) {
      this.systemState.debug(() => ({
        msg: '_handleVisibilityRecalculation position changed - spatial optimization',
        tokenId: tokenDoc?.id,
        x: changes.x,
        y: changes.y,
      }));
      this.invalidation.invalidate(tokenPositionUpdated(tokenDoc, changes, context));
    } else {
      this.systemState.debug(() => ({
        msg: '_handleVisibilityRecalculation other change - mark token',
        tokenId: tokenDoc?.id,
      }));
      this.invalidation.invalidate(tokenVisibilityAffectingUpdated(tokenDoc, changes, context));
    }
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
