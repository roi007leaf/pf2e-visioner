import { COVER_STATES, SNEAK_FLAGS, VISIBILITY_STATES } from '../../../constants.js';
import autoCoverSystem from '../../../cover/auto-cover/AutoCoverSystem.js';
import stealthCheckUseCase from '../../../cover/auto-cover/usecases/StealthCheckUseCase.js';
import { getCoverBetween } from '../../../utils.js';
import { appliedSneakChangesByMessage } from '../data/message-cache.js';
import errorHandlingService, { SYSTEM_TYPES } from '../infra/error-handling-service.js';
import { notify } from '../infra/notifications.js';
import { calculateStealthRollTotals, shouldFilterAlly } from '../infra/shared-utils.js';
import sneakCore from '../sneak-core.js';
import { ActionHandlerBase } from './base-action.js';

export class SneakActionHandler extends ActionHandlerBase {
  constructor() {
    super('sneak');
    // Use singletons to share state with auto-cover pipeline
    this.autoCoverSystem = autoCoverSystem;
    this.stealthCheckUseCase = stealthCheckUseCase;
    this.sneakCore = sneakCore;
    this._currentSessionId = null;
  }
  getCacheMap() {
    return appliedSneakChangesByMessage;
  }
  getOutcomeTokenId(outcome) {
    return outcome?.token?.id ?? outcome?.target?.id ?? null;
  }

  /**
   * Get cached outcomes for the given actionData, or compute them if not cached
   * @param {Object} actionData - The action data
   * @returns {Promise<Array>} Array of outcome objects
   */
  async getCachedOutcomes(actionData) {
    try {
      // For now, just compute the outcomes fresh
      // TODO: implement actual caching if needed for performance
      const subjects = await this.discoverSubjects(actionData);
      const outcomes = [];
      for (const subject of subjects) {
        outcomes.push(await this.analyzeOutcome(actionData, subject));
      }
      return outcomes.filter(Boolean);
    } catch (error) {
      console.error('PF2E Visioner | Error getting cached outcomes:', error);
      return [];
    }
  }

  async ensurePrerequisites(actionData) {
    try {
      const { ensureActionRoll } = await import('../infra/roll-utils.js');
      ensureActionRoll(actionData);

      // Capture start positions when prerequisites are validated
      await this._captureStartPositions(actionData);

      // Initialize sneak visibility states immediately when sneaking starts
      await this._initializeSneakVisibility(actionData);

      // Basic validation without recursion - just check if we have observers
      const observers = await this.discoverSubjects(actionData);
      if (observers.length === 0) {
        const { notify } = await import('../infra/notifications.js');
        notify.warn('No potential observers detected - sneak may not be necessary');
      }
    } catch (error) {
      // Handle prerequisite failures with comprehensive error handling
      const errorResult = await errorHandlingService.handleSystemError(
        SYSTEM_TYPES.SNEAK_ACTION,
        error,
        { actionData, phase: 'prerequisites' },
      );

      if (errorResult.fallbackApplied) {
        console.warn(
          'PF2E Visioner | Using fallback for sneak prerequisites:',
          errorResult.fallbackData,
        );
        // Continue with basic prerequisite validation if fallback is available
        const { ensureActionRoll } = await import('../infra/roll-utils.js');
        ensureActionRoll(actionData);
      } else {
        // Re-throw if no fallback is possible
        throw error;
      }
    }
  }

  /**
   * Initialize sneak visibility states immediately when sneaking starts
   * This ensures AVS has proper baseline states to compare against when the token moves
   * @param {Object} actionData - Action data including actor and context
   * @private
   */
  async _initializeSneakVisibility(actionData) {
    try {
      // Get the sneaking token
      const sneakingToken = this._getSneakingToken(actionData);
      if (!sneakingToken) {
        console.warn('PF2E Visioner | Cannot initialize sneak visibility - token not found');
        return;
      }

      // Set sneak flag on the token to indicate it's currently sneaking
      await sneakingToken.document.setFlag('pf2e-visioner', SNEAK_FLAGS.SNEAK_ACTIVE, true);

      // Apply walk speed halving while sneaking
      try {
        const { SneakSpeedService } = await import('../sneak-speed-service.js');
        await SneakSpeedService.applySneakStartEffect(sneakingToken);
      } catch (speedErr) {
        console.warn('PF2E Visioner | Failed to apply sneak walk speed:', speedErr);
      }

      // Get all observer tokens (include Foundry-hidden; UI checkbox controls visibility only)
      const observerTokens = canvas.tokens.placeables
        .filter((t) => t && t.actor)
        .filter((t) => t.id !== sneakingToken.id);

      // Import the visibility calculator to get proper AVS calculations

      let visibilityModule;
      let optimizedVisibilityCalculator;

      try {
        visibilityModule = await import('../../../visibility/auto-visibility/index.js');

        optimizedVisibilityCalculator = visibilityModule.optimizedVisibilityCalculator;

        if (!optimizedVisibilityCalculator) {
          throw new Error('optimizedVisibilityCalculator is undefined');
        }
      } catch (importError) {
        console.error('PF2E Visioner | Import error:', importError);
        throw importError;
      }

      // Import visibility map utilities
      const { getVisibilityMap } = await import('../../../stores/visibility-map.js');

      // Set visibility for sneak: ONLY affect how observers see the sneaking token, NOT how sneaking token sees observers
      for (const observer of observerTokens) {
        try {
          // Calculate proper visibility using AVS
          const sneakingTokenPosition = {
            x: sneakingToken.document.x,
            y: sneakingToken.document.y,
            elevation: sneakingToken.document.elevation || 0,
          };
          const observerPosition = {
            x: observer.document.x,
            y: observer.document.y,
            elevation: observer.document.elevation || 0,
          };

          // Calculate how the observer sees the sneaking token (this is what sneak affects)
          const observerToSneaking =
            await optimizedVisibilityCalculator.calculateVisibilityWithPosition(
              observer,
              sneakingToken,
              observerPosition,
              sneakingTokenPosition,
            );

          // DO NOT set how the sneaking token sees the observer - they should see normally
          // Sneak only affects how others see the sneaking token, not how the sneaking token sees others

          // Set how the observer sees the sneaking token (observer's visibility map)
          const observerVisibilityMap = getVisibilityMap(observer);
          observerVisibilityMap[sneakingToken.document.id] = observerToSneaking;
        } catch (observerError) {
          console.error('PF2E Visioner | Error processing observer:', observer.name, observerError);
        }
      }

      // Manually trigger AVS to recalculate specifically for sneaking tokens
      // This ensures AVS processes the sneaking token even when it's hidden by Foundry
      try {
        const { eventDrivenVisibilitySystem } = await import(
          '../../../visibility/auto-visibility/EventDrivenVisibilitySystem.js'
        );
        if (eventDrivenVisibilitySystem) {
          await eventDrivenVisibilitySystem.recalculateSneakingTokens();
        }
      } catch (avsError) {
        console.warn('PF2E Visioner | Failed to trigger AVS recalculation:', avsError);
      }
    } catch (error) {
      console.error('PF2E Visioner | Error initializing sneak visibility:', error);
      console.error('PF2E Visioner | Error stack:', error.stack);
      console.error('PF2E Visioner | Error details:', {
        name: error.name,
        message: error.message,
        cause: error.cause,
      });
    }
  }

  /**
   * Captures position state at the start of the sneak action
   * Hybrid approach: Capture start positions at dialog render, calculate end positions in real-time
   * @param {Object} actionData - Action data including actor and context
   * @param {Object} storedStartPosition - Optional stored coordinates from StealthCheckUseCase
   * @private
   */
  async _captureStartPositions(actionData, storedStartPosition = null) {
    try {
      // Skip if we already have a session started
      if (this._currentSessionId) {
        return;
      }

      // Store the provided stored position for later use
      if (storedStartPosition) {
        actionData.storedStartPosition = storedStartPosition;
      } else {
        // Try to get stored position from message flags if not provided directly
        const message = actionData?.message || game.messages.get(actionData?.messageId);

        // Check for sneakStartPosition first (from "Start Sneak" button), then rollTimePosition
        if (message?.flags?.['pf2e-visioner']?.sneakStartPosition) {
          actionData.storedStartPosition = message.flags['pf2e-visioner'].sneakStartPosition;
        } else if (message?.flags?.['pf2e-visioner']?.rollTimePosition) {
          actionData.storedStartPosition = message.flags['pf2e-visioner'].rollTimePosition;
        }

        // Fallback: if still not set, capture current token center NOW (prerequisites time)
        if (!actionData.storedStartPosition) {
          const token = this._getSneakingToken(actionData);
          const cx = token?.center?.x;
          const cy = token?.center?.y;
          if (typeof cx === 'number' && typeof cy === 'number') {
            actionData.storedStartPosition = {
              x: typeof token.x === 'number' ? token.x : undefined,
              y: typeof token.y === 'number' ? token.y : undefined,
              center: { x: cx, y: cy },
              elevation: token?.document?.elevation || 0,
              tokenId: token?.id,
              tokenName: token?.name,
              timestamp: Date.now(),
            };
          }
        }
      }
    } catch (error) {
      console.warn('PF2E Visioner | Error in position capture setup:', error);
    }
  }

  /**
   * Gets the sneaking token using v13-compatible token and document APIs
   * @param {Object} actionData - Action data
   * @returns {Token|null} The sneaking token
   * @private
   */
  _getSneakingToken(actionData) {
    // Try multiple ways to get the token, compatible with v13 APIs
    let token = null;

    // Direct token references
    token = actionData.actorToken || actionData.sneakingToken;
    if (token) {
      return token;
    }

    // From actor's token object
    if (actionData.actor?.token?.object) {
      return actionData.actor.token.object;
    }

    // From actor's active tokens
    if (actionData.actor?.getActiveTokens) {
      const activeTokens = actionData.actor.getActiveTokens();
      if (activeTokens.length > 0) {
        return activeTokens[0];
      }
    }

    // Search canvas tokens by actor ID
    if (actionData.actor?.id && canvas?.tokens?.placeables) {
      const tokenByName = canvas.tokens.placeables.find((t) => t.name === actionData.actor?.name);
      if (tokenByName) {
        return tokenByName;
      }
      token = canvas.tokens.placeables.find((t) => t.actor?.id === actionData.actor.id);
      if (token) {
        return token;
      }
    }

    // Fallback: try to get from message context
    if (actionData.message?.speaker?.token) {
      const tokenId = actionData.message.speaker.token;
      token = canvas?.tokens?.placeables?.find((t) => t.id === tokenId);
      if (token) {
        return token;
      }
    }

    return null;
  }

  async discoverSubjects(actionData) {
    // Observers are all other tokens; dialog filters encounter as needed
    const tokens = canvas?.tokens?.placeables || [];
    // Resolve the actual sneaking token to exclude it reliably
    const sneakingToken = this._getSneakingToken(actionData) || actionData?.actor || null;
    const sneakingTokenId = sneakingToken?.document?.id || sneakingToken?.id || null;

    const base = tokens
      .filter((t) => t && t.actor)
      // Include Foundry-hidden tokens; visual filter handled in dialog
      // Exclude the sneaking token itself
      .filter((t) => (sneakingTokenId ? t.document?.id !== sneakingTokenId : t !== sneakingToken))
      // Use global ignoreAllies setting when not explicitly provided in actionData
      .filter(
        (t) =>
          !shouldFilterAlly(
            actionData.actor,
            t,
            'enemies',
            actionData?.ignoreAllies ?? game.settings.get('pf2e-visioner', 'ignoreAllies'),
          ),
      )
      // Exclude loot and hazards from observers list
      .filter((t) => t.actor?.type !== 'loot' && t.actor?.type !== 'hazard');

    return base;
  }

  async analyzeOutcome(actionData, subject) {
    try {
      // Initialize sneak session if not already started
      if (!this._currentSessionId) {
        const observers = [subject]; // Single observer for this outcome
        this._currentSessionId = await this.sneakCore.startSneakSession(
          actionData.actor,
          observers,
          actionData,
        );
      }
    } catch (error) {
      await errorHandlingService.handleSystemError(SYSTEM_TYPES.SNEAK_ACTION, error, {
        actionData,
        subject,
        phase: 'outcome_analysis_setup',
      });
    }

    const { getVisibilityBetween } = await import('../../../utils.js');
    const { extractPerceptionDC, determineOutcome } = await import('../infra/shared-utils.js');

    // Use fresh visibility calculation that accounts for darkvision instead of stored state
    let current;
    try {
      const { optimizedVisibilityCalculator } = await import(
        '../../../visibility/auto-visibility/index.js'
      );
      current = await optimizedVisibilityCalculator.calculateVisibility(subject, actionData.actor);
    } catch (error) {
      console.warn(
        'PF2E Visioner | Failed to calculate fresh visibility, using stored state:',
        error,
      );
      current = getVisibilityBetween(subject, actionData.actor);
    }

    // Terrain Stalker free Sneak: if criteria met, skip Stealth check and keep visibility
    try {
      const free = await this._checkTerrainStalkerFreeSneak(actionData, subject, current);
      if (free?.applies) {
        return {
          token: subject,
          dc: extractPerceptionDC(subject),
          originalDC: extractPerceptionDC(subject),
          rollTotal: Number(actionData?.roll?.total ?? 0),
          dieResult: Number(actionData?.roll?.dice?.[0]?.results?.[0]?.result ?? 0),
          margin: 0,
          adjustedMargin: 0,
          originalMargin: 0,
          baseMargin: 0,
          outcome: 'success',
          originalOutcome: 'success',
          originalOutcomeLabel: 'Success',
          originalNewVisibility: current,
          shouldShowOverride: false,
          currentVisibility: current,
          oldVisibility: current,
          oldVisibilityLabel: current,
          newVisibility: current,
          changed: false,
          autoCover: null,
          originalRollTotal: Number(actionData?.roll?.total ?? 0),
          baseRollTotal: Number(actionData?.roll?.total ?? 0),
          positionTransition: free.positionTransition || null,
          startPosition: free.positionTransition?.startPosition || null,
          endPosition: free.positionTransition?.endPosition || null,
          // Force qualifications for preview/UI when TS free-sneak applies
          positionQualifies: {
            startQualifies: true,
            endQualifies: true,
            bothQualify: true,
            reason: 'Terrain Stalker: free Sneak',
          },
          _featPositionOverride: {
            startQualifies: true,
            endQualifies: true,
            bothQualify: true,
            reason: 'Terrain Stalker: free Sneak',
          },
          dcAdjustment: 0,
          outcomeChanged: false,
          enhancedAnalysis: { hasPositionData: !!free.positionTransition },
          enhancedOutcomeData: {
            explanation:
              'Terrain Stalker: move <= 5 ft, stay 10 ft from enemies, undetected by all',
          },
          featNotes: ['Terrain Stalker: no Stealth check required'],
          _tsFreeSneak: true,
        };
      }
    } catch {
      /* ignore and continue normal flow */
    }

    // Calculate roll information (stealth vs observer's perception DC)
    let adjustedDC = extractPerceptionDC(subject);

    // Initialize result object for auto-cover data
    const result = {};

    try {
      const sneakingToken =
        actionData.actorToken || actionData.actor?.token?.object || actionData.actor;

      let coverState = null;
      let isOverride = false;
      let coverSource = 'none';

      // Compute base cover (manual first, then auto-cover fallback)
      try {
        // First check for manual cover
        const manualDetected = getCoverBetween(subject, sneakingToken);
        if (manualDetected && manualDetected !== 'none') {
          coverState = manualDetected;
          coverSource = 'manual';
        } else if (this.autoCoverSystem.isEnabled()) {
          // Fallback to auto-cover detection if no manual cover
          // For cover detection: observer is "attacking" (perceiving) the sneaking token
          // So observer is attacker, sneaking token is target
          const autoDetected = this.stealthCheckUseCase._detectCover(subject, sneakingToken);
          if (autoDetected && autoDetected !== 'none') {
            coverState = autoDetected;
            coverSource = 'automatic';
          }
        }
      } catch (e) {
        console.warn(`PF2E Visioner | Cover calculation failed for Sneak action:`, e);
      }

      // Apply overrides last (take precedence over base)
      // Prefer roll-specific override if a rollId exists in the action or message context.
      // Don't delete on consume yet - we need it for all observers
      let originalDetectedState = coverState || 'none'; // Store what we actually detected for this observer
      try {
        const rollId =
          actionData?.context?._visionerRollId ||
          actionData?.context?.rollId ||
          actionData?.message?.flags?.['pf2e-visioner']?.rollId ||
          null;

        // First check if there's a stored modifier for this roll (from StealthCheckUseCase)
        let storedModifier = null;
        if (rollId) {
          storedModifier = this.stealthCheckUseCase?.getOriginalCoverModifier?.(rollId);
        }

        if (storedModifier && storedModifier.isOverride) {
          // Use the stored modifier data to determine override
          originalDetectedState = coverState || 'none';
          coverState = storedModifier.finalState;

          // Only mark as override if the final state is different from what we detected
          if (originalDetectedState !== coverState) {
            isOverride = true;
            coverSource = storedModifier.source || 'dialog';
          }
        } else {
          // Fallback to the old method (but don't consume yet)
          // NOTE: Override parameter order is DIFFERENT from cover detection!
          // Stealth check stores overrides as (sneaking token -> observer)
          // Cover detection uses (observer -> sneaking token)
          const overrideData = this.autoCoverSystem.consumeCoverOverride(
            sneakingToken,
            subject,
            rollId,
            false,
          );
          if (overrideData) {
            // Store the original detected state before applying override
            originalDetectedState = coverState || 'none';
            // Apply the override
            coverState = overrideData.state;

            // Only mark as override if there's actually a difference from what we detected
            if (originalDetectedState !== coverState) {
              isOverride = true;
              coverSource = overrideData.source;
            }
          }
        }
      } catch (e) {
        console.warn('PF2E Visioner | Error checking for cover override in Sneak:', e);
      }

      // Create autoCover object if we have a cover state OR if there's an override
      if (coverState || isOverride) {
        // Feat: Ceaseless Shadows upgrades cover from a creature's perspective
        try {
          const { FeatsHandler } = await import('../feats-handler.js');
          const upgraded = FeatsHandler.upgradeCoverForCreature(actionData.actor, coverState);
          coverState = upgraded.state;
          var _csCanTakeCover = upgraded.canTakeCover;
        } catch { }
        const coverConfig = COVER_STATES[coverState || 'none'];
        const actualStealthBonus = coverConfig?.bonusStealth || 0;
        result.autoCover = {
          state: coverState || 'none',
          label: game.i18n.localize(coverConfig?.label || 'None'),
          icon: coverConfig?.icon || 'fas fa-shield',
          color: coverConfig?.color || '#999',
          cssClass: coverConfig?.cssClass || '',
          bonus: actualStealthBonus,
          // Ceaseless Shadows: gaining Standard or better allows Take Cover
          canTakeCover:
            _csCanTakeCover ||
            (coverState === 'standard' || coverState === 'greater' ? true : undefined),
          isOverride: isOverride && originalDetectedState !== coverState,
          source: coverSource,
          // Add override details for template display (only if actually overridden)
          ...(isOverride && {
            overrideDetails: {
              originalState: originalDetectedState,
              originalLabel: game.i18n.localize(
                COVER_STATES[originalDetectedState]?.label || 'None',
              ),
              originalIcon: COVER_STATES[originalDetectedState]?.icon || 'fas fa-shield',
              originalColor: COVER_STATES[originalDetectedState]?.color || '#999',
              finalState: coverState || 'none',
              finalLabel: game.i18n.localize(coverConfig?.label || 'None'),
              finalIcon: coverConfig?.icon || 'fas fa-shield',
              finalColor: coverConfig?.color || '#999',
              source: coverSource,
            },
          }),
        };
      }
    } catch (e) {
      console.error(`PF2E Visioner | Error in cover calculation for Sneak action:`, e);
    }

    // Calculate roll information (stealth vs observer's perception DC)
    const baseTotal = Number(actionData?.roll?.total ?? 0);

    // Use shared utility to calculate stealth roll totals with cover adjustments
    const { total, originalTotal, baseRollTotal } = calculateStealthRollTotals(
      baseTotal,
      result?.autoCover,
      actionData,
    );

    const dc = adjustedDC;
    const die = Number(
      actionData?.roll?.dice?.[0]?.results?.[0]?.result ??
      actionData?.roll?.dice?.[0]?.total ??
      actionData?.roll?.terms?.[0]?.total ??
      0,
    );
    const margin = total - dc;
    const originalMargin = originalTotal ? originalTotal - dc : margin;
    const baseMargin = baseRollTotal ? baseRollTotal - dc : margin;
    const outcome = determineOutcome(total, die, dc);
    const originalOutcome = originalTotal ? determineOutcome(originalTotal, die, dc) : outcome;

    // Adjust outcome by feats that influence sneak/hide
    let adjustedOutcome = outcome;
    let featNotes = [];
    try {
      const { FeatsHandler } = await import('../feats-handler.js');
      // Basic context: lighting at the sneaking token's position

      const { shift, notes } = FeatsHandler.getOutcomeAdjustment(actionData.actor, 'sneak');
      if (shift) {
        adjustedOutcome = FeatsHandler.applyOutcomeShift(outcome, shift);
        featNotes = notes;
      }
    } catch (e) {
      console.warn('PF2E Visioner | Feats adjustment failed:', e);
    }

    // Sneak Adept feat: upgrade failure to success (but not critical failure)
    let sneakAdeptApplied = false;
    try {
      if (adjustedOutcome === 'failure' && this.#hasSneakAdeptFeat(actionData.actor)) {
        adjustedOutcome = 'success';
        sneakAdeptApplied = true;
        featNotes.push('Sneak Adept: failure upgraded to success');
      }
    } catch (e) {
      console.warn('PF2E Visioner | Sneak Adept feat check failed:', e);
    }

    // Generate outcome labels
    const getOutcomeLabel = (outcomeValue) => {
      switch (outcomeValue) {
        case 'critical-success':
          return 'Critical Success';
        case 'success':
          return 'Success';
        case 'failure':
          return 'Failure';
        case 'critical-failure':
          return 'Critical Failure';
        default:
          return outcomeValue?.charAt(0).toUpperCase() + outcomeValue?.slice(1) || '';
      }
    };
    const originalOutcomeLabel = originalTotal ? getOutcomeLabel(originalOutcome) : null;

    // Use enhanced outcome determination if position data is available
    let newVisibility = current;
    let originalNewVisibility = current;
    let enhancedOutcome = null;

    let positionTransition = null;
    try {
      // Get position transition for enhanced outcome determination
      positionTransition = await this._getPositionTransitionForSubject(subject);
      if (positionTransition?.startPosition && positionTransition?.endPosition) {
        const { default: EnhancedSneakOutcome } = await import('./enhanced-sneak-outcome.js');
        enhancedOutcome = await EnhancedSneakOutcome.determineEnhancedOutcome({
          startVisibilityState: positionTransition.startPosition.avsVisibility,
          endVisibilityState: positionTransition.endPosition.avsVisibility,
          currentVisibilityState: current,
          rollOutcome: adjustedOutcome,
          rollTotal: total,
          perceptionDC: dc,
          dieResult: die,
          observerToken: subject,
          sneakingToken: actionData.actor,
          positionTransition,
        });
        newVisibility = enhancedOutcome.newVisibility;
        // Enforce end-position prerequisite unless a feat removes it
        try {
          const { FeatsHandler } = await import('../feats-handler.js');
          const skip = FeatsHandler.shouldSkipEndCoverRequirement(actionData.actor, 'sneak');
          if (!skip) {
            const endCover = positionTransition?.endPosition?.coverState;
            const endVis = positionTransition?.endPosition?.avsVisibility;
            const endQualifies =
              endCover === 'standard' || endCover === 'greater' || endVis === 'concealed';
            if (!endQualifies) newVisibility = 'observed';
          }
        } catch { }
        // Feat-based post visibility adjustments (e.g., Vanish into the Land)
        try {
          const { FeatsHandler } = await import('../feats-handler.js');
          const inNatural = (() => {
            try {
              return FeatsHandler.isEnvironmentActive(actionData.actor, 'natural');
            } catch {
              return false;
            }
          })();
          newVisibility = FeatsHandler.adjustVisibility(
            'sneak',
            actionData.actor,
            current,
            newVisibility,
            {
              inNaturalTerrain: inNatural,
              outcome: adjustedOutcome,
            },
          );
        } catch { }
      } else {
        // Fall back to standard outcome determination
        const { getDefaultNewStateFor } = await import('../data/action-state-config.js');
        newVisibility = getDefaultNewStateFor('sneak', current, adjustedOutcome) || current;
        // Feat-based post visibility adjustments
        try {
          const { FeatsHandler } = await import('../feats-handler.js');
          const inNatural = (() => {
            try {
              return FeatsHandler.isEnvironmentActive(actionData.actor, 'natural');
            } catch {
              return false;
            }
          })();
          newVisibility = FeatsHandler.adjustVisibility(
            'sneak',
            actionData.actor,
            current,
            newVisibility,
            {
              inNaturalTerrain: inNatural,
              outcome: adjustedOutcome,
            },
          );
        } catch { }
      }
    } catch (error) {
      console.warn(
        'PF2E Visioner | Enhanced outcome determination failed, using standard logic:',
        error,
      );
      // Fall back to standard outcome determination
      const { getDefaultNewStateFor } = await import('../data/action-state-config.js');
      newVisibility = getDefaultNewStateFor('sneak', current, adjustedOutcome) || current;
      // Feat-based post visibility adjustments
      try {
        const { FeatsHandler } = await import('../feats-handler.js');
        const inNatural = (() => {
          try {
            return FeatsHandler.isEnvironmentActive(actionData.actor, 'natural');
          } catch {
            return false;
          }
        })();
        newVisibility = FeatsHandler.adjustVisibility(
          'sneak',
          actionData.actor,
          current,
          newVisibility,
          {
            inNaturalTerrain: inNatural,
            outcome: adjustedOutcome,
          },
        );
      } catch { }
    }

    // Calculate what the visibility change would have been with original outcome
    if (originalTotal) {
      try {
        if (enhancedOutcome) {
          // Use enhanced logic for original outcome too if available
          const { default: EnhancedSneakOutcome } = await import('./enhanced-sneak-outcome.js');
          // positionTransition already computed above

          if (positionTransition?.startPosition && positionTransition?.endPosition) {
            const originalEnhanced = await EnhancedSneakOutcome.determineEnhancedOutcome({
              startVisibilityState: positionTransition.startPosition.avsVisibility,
              endVisibilityState: positionTransition.endPosition.avsVisibility,
              currentVisibilityState: current,
              rollOutcome: originalOutcome,
              rollTotal: originalTotal,
              perceptionDC: dc,
              dieResult: die,
              observerToken: subject,
              sneakingToken: actionData.actor,
              positionTransition,
            });
            originalNewVisibility = originalEnhanced.newVisibility;
          } else {
            const { getDefaultNewStateFor } = await import('../data/action-state-config.js');
            originalNewVisibility =
              getDefaultNewStateFor('sneak', current, originalOutcome) || current;
          }
        } else {
          const { getDefaultNewStateFor } = await import('../data/action-state-config.js');
          originalNewVisibility =
            getDefaultNewStateFor('sneak', current, originalOutcome) || current;
        }
      } catch (error) {
        console.warn('PF2E Visioner | Failed to calculate original enhanced outcome:', error);
        const { getDefaultNewStateFor } = await import('../data/action-state-config.js');
        originalNewVisibility = getDefaultNewStateFor('sneak', current, originalOutcome) || current;
      }
    } else {
      originalNewVisibility = newVisibility;
    }

    // Check if we should show override displays (only if there's a meaningful difference)
    const shouldShowOverride =
      result.autoCover?.isOverride &&
      (total !== originalTotal ||
        margin !== originalMargin ||
        outcome !== originalOutcome ||
        newVisibility !== originalNewVisibility);

    // positionTransition already computed above

    // Use the original DC and outcome without position-based adjustments
    const finalDC = dc;
    const finalOutcome = adjustedOutcome;
    const finalMargin = margin;

    // Simple position qualification check
    const positionQualifies = await this._checkPositionQualification(
      positionTransition,
      actionData,
      subject,
    );

    return {
      token: subject,
      dc: finalDC, // Use adjusted DC
      originalDC: dc, // Keep original for reference
      rollTotal: baseTotal, // Show the actual roll the player made
      dieResult: die,
      margin: baseTotal - finalDC, // Margin of actual roll vs final DC
      adjustedMargin: finalMargin, // Internal adjusted margin for calculations
      originalMargin,
      baseMargin,
      outcome: finalOutcome, // Use adjusted outcome (after feats)
      originalOutcome,
      originalOutcomeLabel,
      originalNewVisibility,
      shouldShowOverride,
      currentVisibility: current,
      // Precedence: AVS override > manual state > AVS calculation
      oldVisibility: (() => {
        // 1. AVS override (observer -> sneaker)
        const observerId = subject.document?.id;
        const sneakerDoc = actionData.actor?.document || actionData.actor;
        let avsOverride = null;
        if (sneakerDoc?.getFlag) {
          const overrideFlag = sneakerDoc.getFlag(
            'pf2e-visioner',
            `avs-override-from-${observerId}`,
          );
          if (overrideFlag && overrideFlag.state) {
            avsOverride = overrideFlag.state;
          }
        }
        if (avsOverride) return avsOverride;
        // 2. Manual state (getVisibilityBetween)
        let manualState = null;
        try {
          manualState = getVisibilityBetween(subject, actionData.actor);
        } catch { }
        if (manualState) return manualState;
        // 3. AVS calculation (position tracker)
        return positionTransition?.startPosition?.avsVisibility || current;
      })(),
      oldVisibilityLabel:
        VISIBILITY_STATES[positionTransition?.startPosition?.avsVisibility || current]?.label ||
        positionTransition?.startPosition?.avsVisibility ||
        current,
      newVisibility,
      changed: newVisibility !== current,
      autoCover: result.autoCover, // Add auto-cover information
      // Add adjusted total for override display (what's used for calculations)
      originalRollTotal: total,
      // Add base roll total for triple-bracket display
      baseRollTotal: baseRollTotal,
      // Enhanced position tracking data
      positionTransition,
      startPosition: positionTransition?.startPosition,
      endPosition: positionTransition?.endPosition,
      positionQualifies,
      // Enhanced outcome analysis
      dcAdjustment: finalDC !== dc ? finalDC - dc : 0,
      outcomeChanged: finalOutcome !== outcome,
      enhancedAnalysis: {
        hasPositionData: !!positionTransition,
      },
      // Enhanced outcome determination data
      enhancedOutcomeData: enhancedOutcome
        ? {
          outcomeReason: enhancedOutcome.outcomeReason,
          avsDecisionUsed: enhancedOutcome.avsDecisionUsed,
          positionQualifications: enhancedOutcome.positionQualifications,
          rollData: enhancedOutcome.rollData,
          rollEnhanced: enhancedOutcome.rollEnhanced,
          explanation: enhancedOutcome.explanation || null,
        }
        : null,
      // Feats adjustment notes
      featNotes,
      // Sneak Adept feat application flag
      sneakAdeptApplied,
    };
  }

  /**
   * Terrain Stalker free Sneak check
   * Criteria: actor has TS selected terrain active, is Undetected by all non-allies,
   * movement <= 5 ft, and path stays >= 10 ft from enemies.
   */
  async _checkTerrainStalkerFreeSneak(actionData, subject) {
    try {
      const { TerrainStalkerService } = await import('../feats/terrain-stalker.js');
      return await TerrainStalkerService.checkFreeSneak(actionData, subject, {
        discoverSubjects: (ad) => this.discoverSubjects(ad),
        sneakCore: this.sneakCore,
        sessionId: this._currentSessionId,
        getSneakingToken: (ad) => this._getSneakingToken(ad),
      });
    } catch (e) {
      return {
        applies: false,
        reason: `Error during free-sneak check: ${e?.message || 'unknown'}`,
      };
    }
  }
  outcomeToChange(actionData, outcome) {
    const observer = outcome.token || outcome.target;
    const change = {
      observer,
      target: actionData.actor,
      newVisibility: outcome.newVisibility,
      oldVisibility: outcome.oldVisibility,
    };

    return change;
  }

  /**
   * Indicates that SneakActionHandler supports dual system application
   * @returns {boolean} True - sneak actions support dual system
   */
  supportsDualSystemApplication() {
    return true;
  }

  /**
   * Converts sneak outcomes to sneak results format for dual system application
   * @param {Array<Object>} outcomes - Sneak outcomes
   * @param {Object} actionData - Action data
   * @returns {Array<Object>} Sneak results in dual system format
   */
  convertOutcomesToSneakResults(outcomes, actionData) {
    return outcomes.map((outcome) => ({
      token: outcome.token,
      actor: actionData.actor,
      newVisibility: outcome.newVisibility,
      oldVisibility: outcome.oldVisibility || outcome.currentVisibility,
      positionTransition: outcome.positionTransition,
      autoCover: outcome.autoCover,
      overrideState: outcome.overrideState,
      // Enhanced sneak-specific data
      startPosition: outcome.startPosition,
      endPosition: outcome.endPosition,
      dcAdjustment: outcome.dcAdjustment,
      outcomeChanged: outcome.outcomeChanged,
      enhancedAnalysis: outcome.enhancedAnalysis,
    }));
  }

  /**
   * Apply sneak results using SneakCore
   * @param {Object} actionData - Action data
   * @param {jQuery} button - Apply button
   * @returns {Promise<number>} Number of changes applied
   */
  async apply(actionData, button) {
    try {
      if (!this._currentSessionId) {
        console.warn('PF2E Visioner | No active sneak session for apply');
        return 0;
      }

      // Get processed outcomes from cache or process them
      const outcomes = (await this.getCachedOutcomes(actionData)) || [];

      // Apply using SneakCore
      const result = await this.sneakCore.applyResults(this._currentSessionId, outcomes);

      if (result.success) {
        this.updateButtonToRevert(button);
        // Clear sneak-active flag after successful application
        await this._clearSneakFlag(actionData);
        notify.info('Sneak changes applied successfully');
        return outcomes.length;
      } else {
        notify.error(`Failed to apply sneak changes: ${result.errors.join('; ')}`);
        return 0;
      }
    } catch (error) {
      console.error('PF2E Visioner | Error applying sneak results:', error);
      notify.error('Failed to apply sneak changes');
      return 0;
    }
  }

  /**
   * Revert sneak results using SneakCore
   * @param {Object} actionData - Action data
   * @param {jQuery} button - Revert button
   */
  async revert(actionData, button) {
    try {
      if (!this._currentSessionId) {
        console.warn('PF2E Visioner | No active sneak session for revert');
        return;
      }

      // Revert using SneakCore
      const success = await this.sneakCore.revertResults(this._currentSessionId);

      if (success) {
        this.clearCache(actionData);
        this.updateButtonToApply(button);
        notify.info('Sneak changes reverted successfully');
      } else {
        // Fallback to standard revert
        console.warn('PF2E Visioner | SneakCore revert failed, attempting standard revert');
        await super.revert(actionData, button);
      }
    } catch (error) {
      console.error('PF2E Visioner | Enhanced revert failed:', error);
      // Fallback to standard revert
      await super.revert(actionData, button);
    }
  }

  buildCacheEntryFromChange(change) {
    return {
      observerId: change?.observer?.id ?? null,
      oldVisibility: change?.oldVisibility ?? null,
    };
  }
  entriesToRevertChanges(entries, actionData) {
    return entries
      .map((e) => ({
        observer: this.getTokenById(e.observerId),
        target: actionData.actor,
        newVisibility: e.oldVisibility,
      }))
      .filter((c) => c.observer && c.target && c.newVisibility);
  }

  async fallbackRevertChanges(actionData) {
    const subjects = await this.discoverSubjects(actionData);
    const outcomes = [];
    for (const subject of subjects) outcomes.push(await this.analyzeOutcome(actionData, subject));
    const filtered = outcomes.filter(Boolean).filter((o) => o.changed);
    return filtered.map((o) => ({
      observer: o.token || o.target,
      target: actionData.actor,
      newVisibility: o.oldVisibility || o.currentVisibility,
    }));
  }

  /**
   * Gets position transition data for a specific subject token
   * @param {Token} subject - The observer token
   * @returns {PositionTransition|null} Position transition data or null if not available
   * @private
   */
  async _getPositionTransitionForSubject(subject) {
    if (!this._currentSessionId || !subject?.document?.id) {
      return null;
    }

    // Get position transition from SneakCore
    const sneakState = this.sneakCore.getSneakState(this._currentSessionId);
    const targetId = subject.document.id;
    return sneakState?.transitions?.get(targetId) || null;
  }

  /**
   * Checks if start and end positions qualify for sneak
   * @param {PositionTransition|null} positionTransition - Position transition data
   * @returns {Object} Position qualification data
   * @private
   */
  async _checkPositionQualification(positionTransition, actionData, observerToken = null) {
    if (!positionTransition) {
      return {
        startQualifies: false,
        endQualifies: false,
        bothQualify: false,
        reason: 'No position data available',
      };
    }

    const startPos = positionTransition.startPosition;
    const endPos = positionTransition.endPosition;

    // PF2E Rules: Start position must be Hidden or Undetected to attempt Sneak
    // End position needs cover or concealment to maintain stealth
    let startQualifies =
      startPos.avsVisibility === 'hidden' || startPos.avsVisibility === 'undetected';
    // Only Standard or Greater cover qualifies (lesser is insufficient per PF2E rules)
    let endQualifies =
      endPos.coverState === 'standard' ||
      endPos.coverState === 'greater' ||
      endPos.avsVisibility === 'concealed';
    let bothQualify = startQualifies && endQualifies;

    let result = {
      startQualifies,
      endQualifies,
      bothQualify,
      reason: bothQualify
        ? 'Both positions qualify for sneak'
        : 'Position does not qualify for sneak',
    };

    // Allow feats to override prerequisites (e.g., Legendary Sneak, Distracting Shadows)
    try {
      const { FeatsHandler } = await import('../feats-handler.js');
      const acting = this._getSneakingToken?.(actionData) || actionData?.actor || null;
      const inNatural = (() => {
        try {
          return FeatsHandler.isEnvironmentActive(acting, 'natural');
        } catch {
          return false;
        }
      })();
      // Position hints for Distracting Shadows
      const startCenter = actionData?.storedStartPosition?.center || null;
      const endCenter = (this._getSneakingToken?.(actionData) || actionData?.actor)?.center || null;
      result = FeatsHandler.overridePrerequisites(acting, result, {
        action: 'sneak',
        observer: observerToken,
        startVisibility: startPos.avsVisibility,
        endVisibility: endPos.avsVisibility,
        endCoverState: endPos.coverState,
        inNaturalTerrain: inNatural,
        startCenter,
        endCenter,
      });
    } catch {
      // ignore
    }

    return result;
  }

  /**
   * Clear the sneak-active flag from the sneaking token
   * @param {Object} actionData - The action data containing the sneaking token
   */
  async _clearSneakFlag(actionData) {
    try {
      if (actionData?.sneakingToken) {
        await actionData.sneakingToken.document.unsetFlag('pf2e-visioner', 'sneak-active');
        // Restore walk speed after sneak ends
        try {
          const { SneakSpeedService } = await import('../sneak-speed-service.js');
          await SneakSpeedService.restoreSneakWalkSpeed(actionData.sneakingToken);
        } catch (speedErr) {
          console.warn('PF2E Visioner | Failed to restore sneak walk speed:', speedErr);
        }
      }
    } catch (error) {
      console.error('PF2E Visioner | Error clearing sneak flag:', error);
    }
  }

  /**
   * Override applyChangesInternal to add Sneaky feat effect application
   * @param {Array} changes - The visibility changes to apply
   */
  async applyChangesInternal(changes) {

    // First apply the normal visibility changes
    await super.applyChangesInternal(changes);

    // Then apply Sneaky feat effects for successful sneak outcomes
    await this.#applySneakyFeatEffects(changes);
  }

  /**
   * Public method to apply Sneaky feat effects (for use by dual system)
   * @param {Array} changes - The visibility changes that were applied
   * @param {Object} context - Additional context (e.g., observer information)
   */
  async applySneakyFeatEffects(changes, context = {}) {
    return this.#applySneakyFeatEffects(changes, context);
  }

  /**
   * Apply Sneaky feat effects to tokens that successfully sneaked and have the feat
   * @param {Array} changes - The visibility changes that were applied
   * @param {Object} context - Additional context (e.g., observer information)
   */
  async #applySneakyFeatEffects(changes, context = {}) {
    try {

      for (const change of changes) {
        // In sneak action: observer = the one being sneaked against, target = the sneaker
        const observer = change?.observer; // The one being sneaked against
        const sneaker = change?.target; // The one doing the sneaking

        if (!sneaker?.actor || !observer) {
          continue;
        }

        // Check if the sneaker has the Sneaky feat
        const hasSneakyFeat = this.#hasSneakyFeat(sneaker);
        if (!hasSneakyFeat) continue;

        // Check if the sneak was successful (success or critical success) OR Sneak Adept applied
        // If outcome is 'unknown' but we have observer/target and Sneaky feat, assume it was successful
        const wasSuccessful =
          this.#wasSneakSuccessful(change) ||
          change?.sneakAdeptApplied ||
          change?.outcome === 'unknown';
        if (!wasSuccessful) continue;
        // Apply Sneaky feat effect to the sneaker, protecting against this observer
        await this.#applySneakyEffectForObserver(sneaker, observer);
      }
    } catch (error) {
      console.error('PF2E Visioner | Error applying Sneaky feat effects:', error);
    }
  }

  /**
   * Check if a token has the Sneaky feat (including Very Sneaky)
   * @param {Token} token - The token to check
   * @returns {boolean} True if the token has the Sneaky or Very Sneaky feat
   */
  #hasSneakyFeat(token) {
    if (!token?.actor) return false;

    const feats =
      token.actor.itemTypes?.feat ?? token.actor.items?.filter?.((i) => i?.type === 'feat') ?? [];
    return feats.some((feat) => {
      const name = feat?.name?.toLowerCase?.() || '';
      const slug = feat?.system?.slug?.toLowerCase?.() || '';
      // Check for Sneaky feat and Very Sneaky feat, but exclude Very, Very Sneaky (different mechanics)
      return (
        name === 'sneaky' ||
        slug === 'sneaky' ||
        name === 'very sneaky' ||
        slug === 'very-sneaky' ||
        name.includes('sneaky') && !name.includes('very, very') && !slug.includes('very-very')
      );
    });
  }

  /**
   * Check if an actor has the Sneak Adept feat
   * @param {Actor} actor - The actor to check
   * @returns {boolean} True if the actor has the Sneak Adept feat
   */
  #hasSneakAdeptFeat(actor) {
    if (!actor) return false;

    const feats = actor.itemTypes?.feat ?? actor.items?.filter?.((i) => i?.type === 'feat') ?? [];
    return feats.some((feat) => {
      const name = feat?.name?.toLowerCase?.() || '';
      const slug = feat?.system?.slug?.toLowerCase?.() || '';
      return name.includes('sneak adept') || slug.includes('sneak-adept');
    });
  }

  /**
   * Check if a sneak was successful based on the outcome
   * @param {Object} change - The visibility change object
   * @returns {boolean} True if the sneak was successful
   */
  #wasSneakSuccessful(change) {
    // A sneak is successful if the outcome was success or critical success
    const outcome = change?.outcome;
    return outcome === 'success' || outcome === 'critical-success';
  }

  /**
   * Apply the Sneaky feat effect to a token
   * @param {Token} token - The token to apply the effect to
   * @param {Array} changes - The visibility changes that were applied
   */
  async #applySneakyEffectForObserver(sneaker, observer) {
    try {

      if (!sneaker?.actor || !observer) return;

      const observerName = observer.name || 'Unknown Observer';
      const observerSignature = `${observer.id}`;

      // Check if main Sneaky feat effect already exists
      let existingEffect = sneaker.actor.itemTypes?.effect?.find((effect) => {
        const slug = effect?.system?.slug?.toLowerCase?.() || '';
        return slug === 'sneaky-feat-effect';
      });

      if (existingEffect) {
        // Effect exists, add new observer rule if not already present
        await this.#addObserverRuleToSneakyEffect(existingEffect, observer);
        return;
      }

      // Create new Sneaky feat effect with first observer rule
      const effectData = {
        name: 'Sneaky Feat Effect',
        type: 'effect',
        system: {
          slug: 'sneaky-feat-effect',
          description: {
            value: `You cannot become observed by creatures you successfully sneaked against: ${observerName}`,
          },
          duration: {
            value: -1, // Permanent until manually removed
            unit: 'unlimited',
            sustained: false,
            expiry: 'turn-end',
          },
          level: {
            value: 1,
          },
          traits: {
            value: ['feat'],
          },
          rules: [
            {
              key: 'RollOption',
              domain: 'all',
              option: 'sneaky-feat-active',
              value: true,
            },
            {
              key: 'RollOption',
              domain: 'all',
              option: `sneaky-feat-vs-${observerSignature}`,
              predicate: [`target:signature:${observerSignature}`],
              value: true,
              label: `Sneaky Feat vs ${observerName} (${sneaker.name})`,
            },
          ],
        },
        flags: {
          'pf2e-visioner': {
            sneakyFeat: {
              protectedFromObservers: [
                {
                  id: observer.id,
                  name: observerName,
                  signature: observerSignature,
                  addedAt: Date.now(),
                },
              ],
              appliedAt: Date.now(),
            },
          },
        },
        img: 'systems/pf2e/icons/conditions/unnoticed.webp',
      };

      // Add the effect to the actor
      await sneaker.actor.createEmbeddedDocuments('Item', [effectData]);
      notify.info(`Applied Sneaky feat protection from ${observerName} to ${sneaker.name}`);
    } catch (error) {
      console.error('PF2E Visioner | Error applying Sneaky effect for observer:', error);
    }
  }

  /**
   * Add observer-specific rule to existing Sneaky feat effect
   * @param {Item} effect - The existing Sneaky feat effect
   * @param {Token} observer - The observer to add protection against
   */
  async #addObserverRuleToSneakyEffect(effect, observer) {
    try {
      const observerName = observer.name || 'Unknown Observer';
      const observerSignature = `${observer.id}`;

      // Get existing protected observers
      const existingObservers =
        effect.flags?.['pf2e-visioner']?.sneakyFeat?.protectedFromObservers || [];

      // Check if this observer is already protected
      if (existingObservers.some((obs) => obs.id === observer.id)) {
        return; // Already protected
      }

      // Add new observer to the list
      const newObserver = {
        id: observer.id,
        name: observerName,
        signature: observerSignature,
        addedAt: Date.now(),
      };
      const updatedObservers = [...existingObservers, newObserver];

      // Get existing rules and add new observer rule
      const existingRules = effect.system.rules || [];
      const newRule = {
        key: 'RollOption',
        domain: 'all',
        option: `sneaky-feat-vs-${observerSignature}`,
        predicate: [`target:signature:${observerSignature}`],
        value: true,
        label: `Sneaky Feat vs ${observerName})`,
      };

      const updatedRules = [...existingRules, newRule];
      const observerNames = updatedObservers.map((obs) => obs.name).join(', ');

      // Update the effect
      const updateData = {
        'system.description.value': `You cannot become observed by creatures you successfully sneaked against: ${observerNames}`,
        'system.rules': updatedRules,
        'flags.pf2e-visioner.sneakyFeat.protectedFromObservers': updatedObservers,
        'flags.pf2e-visioner.sneakyFeat.lastUpdated': Date.now(),
      };

      await effect.update(updateData);

      notify.info(`Added Sneaky feat protection from ${observerName}`);
    } catch (error) {
      console.error('PF2E Visioner | Error adding observer rule to Sneaky effect:', error);
    }
  }
}
