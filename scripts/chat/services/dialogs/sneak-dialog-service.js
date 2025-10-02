/**
 * Sneak Dialog Service - Handles dialog preparation and UI logic for sneak actions
 * Separated from SneakActionHandler to reduce class size and improve maintainability
 */

import { SNEAK_FLAGS } from '../../../constants.js';
import autoCoverSystem from '../../../cover/auto-cover/AutoCoverSystem.js';
import { getCoverBetween, getVisibilityBetween } from '../../../utils.js';
import { SneakPreviewDialog } from '../../dialogs/sneak-preview-dialog.js';

export class SneakDialogService {
  /**
   * Starts the sneak action by capturing initial states and hiding the token
   * @param {Object} actionData - Action data from the message
   * @param {Object} button - Button element (optional)
   */
  async startSneak(actionData, _button) {
    try {
      // Get the sneaking token from actionData - handle both token objects and IDs
      let token = null;

      // First, try to get token directly from actionData.actor if it's already a token
      if (actionData.actor?.document?.id) {
        token = actionData.actor;
      }
      // If actionData.actor has an ID, look up the token by actor ID
      else if (actionData.actor?.id && canvas?.tokens?.placeables) {
        token = canvas.tokens.placeables.find((t) => t.actor?.id === actionData.actor.id);
      }
      // Fallback: try to get from message context
      else if (actionData.message?.speaker?.token) {
        const tokenId = actionData.message.speaker.token;
        token = canvas?.tokens?.placeables?.find((t) => t.id === tokenId);
      }

      if (!token) {
        console.error(
          'PF2E Visioner | Cannot start sneak - token not found in actionData:',
          actionData,
        );
        return;
      }

      // Permission: Only the GM or the token's owner can start sneak
      try {
        const isOwner =
          !!token?.isOwner ||
          !!token?.actor?.ownership?.[game.userId] ||
          !!token?.document?.isOwner;
        if (!game.user.isGM && !isOwner) {
          const { notify } = await import('../infra/notifications.js');
          notify.warn("You don't have permission to start Sneak for this token.");
          return;
        }
      } catch { }

      // Get message and messageId from actionData
      const messageId = actionData.messageId || actionData.message?.id;
      const message = messageId ? game.messages.get(messageId) : null;

      // Check system availability by checking if systems are enabled
      const avsEnabled = game.settings.get('pf2e-visioner', 'autoVisibilityEnabled') ?? false;
      const autoCoverEnabled = autoCoverSystem?.isEnabled?.() ?? false;

      // Capture current visibility and cover states from all observer tokens
      const startStates = {};

      // Remove waiting-for-sneak-start effect (if present) and unlock token before proceeding
      try {
        const actor = token?.actor;
        if (actor) {
          const waiting = actor.itemTypes?.effect?.find?.(
            (e) => e?.system?.slug === 'waiting-for-sneak-start',
          );
          if (waiting) {
            try {
              await actor.deleteEmbeddedDocuments('Item', [waiting.id]);
            } catch (e) {
              console.warn('PF2E Visioner | Failed to remove waiting-for-sneak-start effect:', e);
            }
          }
        }
        try {
          const tokenObj = canvas.tokens.get(token.id);
          if (tokenObj) tokenObj.locked = false;
        } catch { }
        // Clear waiting flag so movement is allowed
        try {
          await token.document.unsetFlag('pf2e-visioner', 'waitingSneak');
        } catch { }
      } catch (cleanupErr) {
        console.warn('PF2E Visioner | Cleanup waiting effect failed:', cleanupErr);
      }

      // Get all potential observer tokens (non-allied tokens). Include Foundry-hidden; UI handles visual filtering.
      const observerTokens = canvas.tokens.placeables.filter((t) => t.id !== token.id && t.actor);

      // Capture state from each observer's perspective
      for (const observer of observerTokens) {
        try {
          let visibilityState;
          let coverState;

          // Use fresh visibility calculation that accounts for darkvision for start positions
          if (avsEnabled) {
            try {
              const { optimizedVisibilityCalculator } = await import(
                '../../../visibility/auto-visibility/index.js'
              );
              visibilityState = await optimizedVisibilityCalculator.calculateVisibility(
                observer,
                token,
              );
            } catch (error) {
              console.warn(
                `PF2E Visioner | Failed fresh visibility calculation, using stored state:`,
                error,
              );
              visibilityState = getVisibilityBetween(observer, token) || 'observed';
            }
          } else {
            // Use manual/Foundry visibility detection
            // canObserve is a method on TokenDocument, accessed via observer.document
            try {
              visibilityState = observer.document.canObserve?.(token.document) ? 'observed' : 'hidden';
            } catch {
              // Fallback if canObserve is not available
              visibilityState = 'observed';
            }
          }

          // Get cover state based on Auto-Cover system availability
          if (autoCoverEnabled) {
            // Use auto-cover system directly
            coverState = autoCoverSystem.getCoverBetween(observer, token) || 'none';
          } else {
            // Use manual cover detection
            coverState = getCoverBetween(observer, token) || 'none';
          }

          startStates[observer.id] = {
            observerName: observer.name,
            observerId: observer.id,
            visibility: visibilityState,
            cover: coverState,
            timestamp: Date.now(),
            // Store which systems were used for capture
            capturedWith: {
              avs: avsEnabled,
              autoCover: autoCoverEnabled,
            },
          };
        } catch (error) {
          console.warn(
            `PF2E Visioner | Failed to capture start state for ${observer.name}:`,
            error,
          );
          startStates[observer.id] = {
            observerName: observer.name,
            observerId: observer.id,
            visibility: 'observed',
            cover: 'none',
            timestamp: Date.now(),
            capturedWith: {
              avs: avsEnabled,
              autoCover: autoCoverEnabled,
            },
          };
        }
      }

      // Store states in message flags instead of position
      if (message) {
        await message.setFlag('pf2e-visioner', 'sneakStartStates', startStates);
      }

      // NEW: Capture and store the sneaking token's starting position when Start Sneak is pressed
      try {
        if (message && token) {
          const cx = token?.center?.x;
          const cy = token?.center?.y;
          const pos = {
            x: typeof token.x === 'number' ? token.x : token?.document?.x,
            y: typeof token.y === 'number' ? token.y : token?.document?.y,
            center: typeof cx === 'number' && typeof cy === 'number' ? { x: cx, y: cy } : undefined,
            elevation: token?.document?.elevation || 0,
            tokenId: token?.id,
            tokenName: token?.name,
            timestamp: Date.now(),
          };
          await message.setFlag('pf2e-visioner', 'sneakStartPosition', pos);
          // Mirror into actionData for immediate consumers
          actionData.storedStartPosition = pos;
        }
      } catch (posErr) {
        console.warn('PF2E Visioner | Failed to store sneak start position:', posErr);
      }

      // Set sneak flag on the token to indicate it's currently sneaking
      await token.document.setFlag('pf2e-visioner', SNEAK_FLAGS.SNEAK_ACTIVE, true);

      // Apply speed halving while sneaking
      try {
        const { SneakSpeedService } = await import('../sneak-speed-service.js');
        await SneakSpeedService.applySneakStartEffect(token);
      } catch (speedErr) {
        console.warn('PF2E Visioner | Failed to apply sneak walk speed:', speedErr);
      }

      // Store start states in message flags for persistence
      if (message) {
        try {
          await message.setFlag('pf2e-visioner', 'startStates', startStates);
        } catch (error) {
          console.warn('PF2E Visioner | Failed to store start states in message flags:', error);
        }
      }

      // Refresh the UI to show "Open Results" button instead of "Start Sneak"
      try {
        // Panel container class is 'pf2e-visioner-automation-panel'
        const parent = _button?.closest?.('.pf2e-visioner-automation-panel');
        if (parent && messageId) {
          const message = game.messages.get(messageId);
          if (message) {
            const html = $(message.element);
            parent.remove();

            // Re-inject the UI with updated actionData that includes the message
            const { injectAutomationUI } = await import('../ui/ui-injector.js');
            const updatedActionData = { ...actionData, message };
            injectAutomationUI(message, html, updatedActionData);
          }
        }
      } catch (refreshError) {
        console.warn('PF2E Visioner | Failed to refresh UI after starting sneak:', refreshError);
      }
    } catch (error) {
      console.error('PF2E Visioner | Error starting sneak:', error);
      const { notify } = await import('../infra/notifications.js');
      notify.error('Failed to start sneak - see console for details');
    }
  }

  /**
   * Opens the sneak results dialog for preview and application
   * @param {Object} actionData - Action data from the message
   * @param {Object} button - Button element (optional)
   */
  static async openSneakResults(actionData) {
    try {
      // Mark this flow as preview-only to avoid side effects (like setting sneak-active)
      // Sneak session will be created for caching/processing, but without setting flags
      actionData = { ...actionData, previewOnly: true };
      // Get the token and message
      const messageId = actionData.messageId || actionData.message?.id;
      const message = game.messages.get(messageId);

      // Extract token ID from stored sneak start position (most reliable)
      const storedStartPosition = message?.flags?.['pf2e-visioner']?.sneakStartPosition;
      let tokenId = storedStartPosition?.tokenId;

      // Fallback to actionData if no stored position
      if (!tokenId && actionData.actor) {
        if (typeof actionData.actor === 'string') {
          // If it's a string, it might be a token ID
          tokenId = actionData.actor;
        } else if (actionData.actor.id) {
          // actionData.actor is a token object with ID
          tokenId = actionData.actor.id;
        }
      }

      // Final fallback to direct tokenId property
      tokenId = tokenId || actionData.tokenId;

      // Find the token by ID
      const token = canvas.tokens.placeables.find((t) => t.id === tokenId);
      if (!token) {
        console.error(
          'PF2E Visioner | Cannot open sneak results - token not found for ID:',
          tokenId,
        );
        console.error(
          'PF2E Visioner | Available token IDs:',
          canvas.tokens.placeables.map((t) => t.id),
        );
        return;
      }

      // Get the stored start states from message flags
      const startStates = message?.flags?.['pf2e-visioner']?.sneakStartStates;

      if (!startStates || Object.keys(startStates).length === 0) {
        console.error(
          'PF2E Visioner | Cannot open sneak results - no start states found in message flags',
        );
        const { notify } = await import('../infra/notifications.js');
        notify.error('No sneak start states found - please use "Start Sneak" first');
        return;
      }

      // Generate fresh outcomes using the sneak action handler to calculate end positions
      const { SneakActionHandler } = await import('../actions/sneak-action.js');
      const sneakHandler = new SneakActionHandler();

      // Update actionData to use the correctly resolved token to prevent token resolution inconsistencies
      const correctedActionData = {
        ...actionData,
        actor: token, // Use the specific token we resolved, not the generic actor reference
        actorToken: token, // Also set actorToken for compatibility
        sneakingToken: token, // And sneakingToken for extra safety
      };

      // Discover current subjects (observers)
      const subjects = await sneakHandler.discoverSubjects(correctedActionData);

      // Calculate outcomes with current (end) positions and inject start states
      const outcomes = await Promise.all(
        subjects.map(async (subject) => {
          const outcome = await sneakHandler.analyzeOutcome(correctedActionData, subject);

          // Inject correct start state from stored start states
          const observerId = subject.document.id;
          const startState = startStates[observerId];

          if (startState && outcome.positionTransition) {
            // Override the start position with the correct visibility from start states
            outcome.positionTransition.startPosition.avsVisibility = startState.visibility;
          }

          return outcome;
        }),
      );

      // Filter to only changed outcomes
      const changes = outcomes.filter((outcome) => outcome && outcome.changed);

      // Create the sneak preview dialog with proper outcomes
      const dialog = new SneakPreviewDialog(token, outcomes, changes, {
        startStates,
        message,
        actionData,
      });
      await dialog.render(true);
    } catch (error) {
      console.error('PF2E Visioner | Error opening sneak results dialog:', error);
      const { notify } = await import('../infra/notifications.js');
      notify.error('Failed to open sneak results dialog - see console for details');
    }
  }

  /**
   * Manually initialize visibility for already sneaking tokens
   * This is useful when a token is already sneaking but the visibility map wasn't properly initialized
   */
  static async initializeSneakVisibility(tokenId) {
    try {
      const token = canvas.tokens.get(tokenId);
      if (!token) {
        console.warn('PF2E Visioner | Token not found:', tokenId);
        return;
      }

      const isSneaking = token.document.getFlag('pf2e-visioner', 'sneak-active');
      if (!isSneaking) {
        return;
      }
    } catch (error) {
      console.error('PF2E Visioner | Error initializing sneak visibility:', error);
    }
  }

  /**
   * Initialize visibility for all currently sneaking tokens
   * This should be called when the module loads to fix already sneaking tokens
   */
  static async initializeAllSneakingTokens() {
    try {
      const sneakingTokens = canvas.tokens.placeables.filter((token) =>
        token.document.getFlag('pf2e-visioner', 'sneak-active'),
      );

      for (const token of sneakingTokens) {
        await this.initializeSneakVisibility(token.id);
      }
    } catch (error) {
      console.error('PF2E Visioner | Error initializing sneaking tokens:', error);
    }
  }
}
