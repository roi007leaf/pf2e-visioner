import { MODULE_ID } from '../../../constants.js';
import { updateWallVisualsForEveryone } from '../../../services/socket.js';
import { updateWallVisuals } from '../../../services/visual-effects.js';
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

  handleMoveToken(tokenDoc, updateData, options, userId) {
    // This fires for EVERY grid square during animation
    // We only want to process the FINAL destination
    if (!this.systemState.shouldProcessEvents()) {
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

  /**
   * Handles token document updates
   * @param {Object} tokenDoc - The token document
   * @param {Object} changes - The changes object
   * @param {Object} options - Update options (includes animation flag)
   */
  handleTokenUpdate(tokenDoc, changes, options = {}) {
    if (!this.systemState.shouldProcessEvents()) {
      return;
    }

    try {
      this.systemState.debug('onTokenUpdate', tokenDoc.id, tokenDoc.name, Object.keys(changes));
    } catch { }

    // Analyze changes once to derive flags used throughout handling
    const changeFlags = this._analyzeChanges(changes);

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
        // If animating (e.g., remote player movement), wait for animation to complete
        if (isAnimating && token?._animation?.promise) {
          const tokenId = tokenDoc.id;
          token._animation.promise.then(() => {
            // After animation completes, trigger validation directly
            try {
              if (this.overrideValidationManager) {
                this.overrideValidationManager.queueOverrideValidation(tokenId);
                this.overrideValidationManager.processQueuedValidations().catch(() => { });
              }
            } catch (e) {
              console.warn('PF2E Visioner | Error processing validation after animation:', e);
            }
          }).catch(() => { /* ignore animation errors */ });
        }
        return;
      }

      // Check if token was dragged to the same position (no actual movement)
      const oldX = tokenDoc.x;
      const oldY = tokenDoc.y;
      const newX = changes.x ?? oldX;
      const newY = changes.y ?? oldY;

      if (oldX === newX && oldY === newY) {
        // Token dragged but released at same position - clear cached data
        this.positionManager.clearTokenPositionData(tokenDoc.id);
        this.systemState.debug('token-drag-same-position', tokenDoc.id, 'cleared cached positions');
        return;
      }
    }

    // Early light change detection (handles nested dotted paths like "light.bright")
    if (changeFlags.lightChanged) {
      // Light changes affect global visibility; clear caches to avoid stale results
      try {
        this.cacheManager?.clearAllCaches?.();
      } catch {
        /* best-effort */
      }

      // Defer recalculation until after Foundry refreshes lighting, so we read updated sources
      let scheduled = false;
      try {
        Hooks.once('lightingRefresh', () => {
          this.visibilityState.markAllTokensChangedImmediate();
        });
        scheduled = true;
      } catch {
        /* ignore */
      }

      // Fallback: if the hook didn't schedule, use a short timeout
      if (!scheduled) {
        setTimeout(() => this.visibilityState.markAllTokensChangedImmediate(), 50);
      }
      // Continue processing other changes (e.g., movement) for position pinning
    }

    // Movement action changes (flying vs grounded) affect tremorsense detection
    // Clear caches to avoid stale tremorsense results
    if (changeFlags.movementActionChanged) {
      try {
        this.cacheManager?.clearAllCaches?.();
      } catch {
        /* best-effort */
      }
    }

    // Hidden flag toggle - recalculate everyone
    if (Object.prototype.hasOwnProperty.call(changes, 'hidden')) {
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
      this.systemState.debug(
        'emitter-moved: global recalculation for token light move',
        tokenDoc.id,
      );
      this.visibilityState.markTokenChangedWithSpatialOptimization();
      // Continue processing to pin positions
    }

    // Handle hidden tokens (with sneak special case)
    if (isHidden && !changeFlags.lightChanged && !emitterMoved) {
      this._handleHiddenToken(tokenDoc, changes);
      return;
    }

    // Handle excluded tokens (with sneak special case)
    if (this._handleExcludedToken(tokenDoc, changes)) {
      return;
    }

    // Process relevant changes
    if (this._hasRelevantChanges(changeFlags)) {
      this._processRelevantChanges(tokenDoc, changes, changeFlags);
    }
  }

  /**
   * Handles new token creation
   * @param {Object} tokenDoc - The token document
   */
  handleTokenCreate(tokenDoc) {
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
    return this.spatialAnalyzer.tokenEmitsLight(tokenDoc, changes);
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
      this.visibilityState.markAllTokensChangedImmediate();
    } else if (changeFlags.movementActionChanged) {
      // Movement action affects tremorsense detection (flying vs grounded)
      // Need to recalculate for tokens that might detect this one via tremorsense
      this.visibilityState.markTokenChangedImmediate(tokenDoc.id);
    } else if (changeFlags.positionChanged) {
      // Notify batch orchestrator that token is moving to delay processing
      if (this.batchOrchestrator?.notifyTokenMovementStart) {
        this.batchOrchestrator.notifyTokenMovementStart();
      }
      this.visibilityState.markTokenChangedWithSpatialOptimization(tokenDoc, changes);
    } else {
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
