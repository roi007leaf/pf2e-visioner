import { MODULE_ID } from '../../constants.js';
import autoCoverSystem from '../../cover/auto-cover/AutoCoverSystem.js';
import { getCoverBetween, getVisibilityBetween } from '../../utils.js';
import { optimizedVisibilityCalculator } from '../../visibility/auto-visibility/index.js';
import { getDesiredOverrideStatesForAction } from '../services/data/action-state-config.js';
import { FeatsHandler } from '../services/feats-handler.js';
import { notify } from '../services/infra/notifications.js';
import { hasActiveEncounter } from '../services/infra/shared-utils.js';
import sneakPositionTracker from '../services/position/PositionTracker.js';
import turnSneakTracker from '../services/turn-sneak-tracker.js';
import { BaseActionDialog } from './base-action-dialog.js';

// Store reference to current sneak dialog
let currentSneakDialog = null;

/**
 * Dialog for previewing and applying Sneak action results
 */
export class SneakPreviewDialog extends BaseActionDialog {
  constructor(sneakingToken, outcomes, changes, sneakData, options = {}) {
    if (!sneakingToken) {
      throw new Error('SneakPreviewDialog: sneakingToken is required');
    }

    // Check if this is an end-of-turn dialog
    const isEndOfTurnDialog = options?.isEndOfTurnDialog || false;
    const dialogTitle =
      options?.title || (isEndOfTurnDialog ? 'End-of-Turn Stealth Validation' : 'Sneak Results');

    super({
      id: `sneak-preview-${sneakingToken.id}${isEndOfTurnDialog ? '-end-of-turn' : ''}`,
      title: dialogTitle,
      tag: 'form',
      window: {
        title: dialogTitle,
        icon: isEndOfTurnDialog ? 'fas fa-clock' : 'fas fa-user-ninja',
        resizable: true,
        positioned: true,
        minimizable: false,
      },
      position: {
        width: 900, // Increased width for position display components
        height: 'auto',
      },
      form: {
        handler: SneakPreviewDialog.formHandler,
        submitOnChange: false,
        closeOnSubmit: false,
      },
      classes: ['pf2e-visioner', 'sneak-preview-dialog', 'enhanced-position-tracking'],
      ...options,
    });

    this.sneakingToken = sneakingToken;
    this.isEndOfTurnDialog = isEndOfTurnDialog;

    // Initialize deferred checks tracking
    this._deferredChecks = new Set();

    // Track bulk undefer button state
    this._bulkUndeferButtonState = 'undefer'; // 'undefer' or 'restore'

    // Track outcomes that were bulk undeferred so we can restore them
    this._bulkUndeferredOutcomes = new Map(); // tokenId -> original outcome state

    // Store the start states data for correct start position visibility
    this.startStates = sneakData?.startStates || {};

    // If no start states were passed, try to retrieve them from the sneaking token's flags or message flags
    if (Object.keys(this.startStates).length === 0) {
      this._retrieveStoredStartStates(sneakData?.message);
    }

    // Filter out the sneaking token from outcomes - it should not appear as an observer
    const sneakingTokenId = sneakingToken.id;
    const sneakingActorId = sneakingToken.actor?.id;

    this.outcomes = outcomes.filter((outcome) => {
      const isSneakingToken =
        outcome.token?.id === sneakingTokenId || outcome.token?.actor?.id === sneakingActorId;
      return !isSneakingToken;
    });

    // Preserve original outcomes so live toggles can re-filter from a stable list
    try {
      this._originalOutcomes = Array.isArray(this.outcomes) ? [...this.outcomes] : [];
    } catch {
      this._originalOutcomes = this.outcomes || [];
    }
    this.changes = changes;
    this.sneakData = sneakData;
    // Ensure services can resolve the correct handler
    this.actionData = { ...(sneakData || {}), actor: sneakingToken, actionType: 'sneak' };
    this.encounterOnly = game.settings.get(MODULE_ID, 'defaultEncounterFilter');
    this.ignoreAllies = game.settings.get(MODULE_ID, 'ignoreAllies');
    this.bulkActionState = 'initial'; // 'initial', 'applied', 'reverted'

    // Initialize filter properties with defaults
    this.showChangesOnly = options.showChangesOnly ?? false;

    // LOS filter: enabled out of combat by default, disabled in combat unless explicitly set
    try {
      if (typeof options.filterByDetection === 'boolean') {
        this.filterByDetection = options.filterByDetection;
      } else {
        const inCombat = hasActiveEncounter();
        this.filterByDetection = !inCombat;
      }
    } catch {
      this.filterByDetection = false;
    }

    // Visual filter default from per-user setting
    try {
      this.hideFoundryHidden = game.settings.get(MODULE_ID, 'hideFoundryHiddenTokens');
    } catch {
      this.hideFoundryHidden = true;
    }

    // Enhanced position tracking properties
    this.positionTracker = sneakPositionTracker;
    this._positionTransitions = new Map();
    this._hasPositionData = false;
    this._positionDisplayMode = 'enhanced'; // 'basic', 'enhanced', 'detailed'

    // Set global reference
    currentSneakDialog = this;
  }

  /**
   * Attempt to retrieve start states from stored data (token flags or message flags)
   * @param {ChatMessage} message - The message that might contain start states
   * @private
   */
  _retrieveStoredStartStates(message) {
    try {
      // Try to get from provided message flags first
      if (message?.flags?.['pf2e-visioner']?.startStates) {
        this.startStates = message.flags['pf2e-visioner'].startStates;
        return;
      }

      // Search recent messages for start states (within last 10 messages)
      const recentMessages = game.messages.contents.slice(-10).reverse();

      for (const msg of recentMessages) {
        const startStates = msg.flags?.['pf2e-visioner']?.startStates;
        if (startStates && Object.keys(startStates).length > 0) {
          // Check if any start state is related to our sneaking session
          // Start states are typically keyed by observer ID, so check if they contain relevant data
          const hasRelevantStates = Object.values(startStates).some(
            (state) =>
              state &&
              typeof state === 'object' &&
              (state.observerName || state.visibility || state.cover !== undefined),
          );

          if (hasRelevantStates) {
            this.startStates = startStates;
            return;
          }
        }
      }

      // Try to get from sneaking token flags
      const tokenFlags = this.sneakingToken?.document?.flags?.['pf2e-visioner'];
      if (tokenFlags?.startStates) {
        this.startStates = tokenFlags.startStates;
        return;
      }
    } catch (error) {
      // Error retrieving stored start states - continue silently
    }
  }

  static DEFAULT_OPTIONS = {
    actions: {
      applyChange: SneakPreviewDialog._onApplyChange,
      revertChange: SneakPreviewDialog._onRevertChange,
      applyAll: SneakPreviewDialog._onApplyAll,
      revertAll: SneakPreviewDialog._onRevertAll,
      toggleEncounterFilter: SneakPreviewDialog._onToggleEncounterFilter,
      toggleFilterByDetection: SneakPreviewDialog._onToggleFilterByDetection,
      toggleShowOnlyChanges: SneakPreviewDialog._onToggleShowOnlyChanges,
      overrideState: SneakPreviewDialog._onOverrideState,
      togglePositionDisplay: SneakPreviewDialog._onTogglePositionDisplay,
      toggleStartPosition: SneakPreviewDialog._onToggleStartPosition,
      toggleEndPosition: SneakPreviewDialog._onToggleEndPosition,
      setCoverBonus: SneakPreviewDialog._onSetCoverBonus,
      applyAllCover: SneakPreviewDialog._onApplyAllCover,
      processEndTurnValidation: SneakPreviewDialog._onProcessEndTurnValidation,
      undeferCheck: SneakPreviewDialog._onUndeferCheck,
      onClose: SneakPreviewDialog._onClose,
    },
  };

  static PARTS = {
    content: {
      template: 'modules/pf2e-visioner/templates/sneak-preview.hbs',
    },
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // Determine movement type from token's current movement action (default to walk)
    let movementType = 'walk';
    try {
      const raw =
        this.sneakingToken?.document?.movementAction || this.sneakingToken?.document?.movementType;
      const v = String(raw || '').toLowerCase();
      if (['walk', 'land', 'ground', 'move'].includes(v)) movementType = 'walk';
      else if (['stride'].includes(v)) movementType = 'stride';
      else if (['leap'].includes(v)) movementType = 'leap';
      else if (['climb'].includes(v)) movementType = 'climb';
      else if (['fly', 'flying'].includes(v)) movementType = 'fly';
      else if (['swim'].includes(v)) movementType = 'swim';
      else if (['burrow'].includes(v)) movementType = 'burrow';
      else if (['teleport'].includes(v)) movementType = 'teleport';
      else if (['deploy'].includes(v)) movementType = 'deploy';
      else if (['travel'].includes(v)) movementType = 'travel';
    } catch { }

    // Capture current end positions FIRST, before processing outcomes
    await this._captureCurrentEndPositionsForOutcomes(this.outcomes);

    // Start from original list if available so toggles can re-include allies
    const baseList = Array.isArray(this._originalOutcomes)
      ? this._originalOutcomes
      : this.outcomes || [];
    // Filter outcomes with base helper and ally filtering
    let filteredOutcomes = this.applyEncounterFilter(
      baseList,
      'token',
      'No encounter observers found, showing all',
    );
    // Apply ally filtering for display purposes
    try {
      const { filterOutcomesByAllies } = await import('../services/infra/shared-utils.js');
      filteredOutcomes = filterOutcomesByAllies(
        filteredOutcomes,
        this.sneakingToken,
        this.ignoreAllies,
        'token',
      );
    } catch { }

    // Apply viewport filtering if enabled (Note: Sneak uses 'token' property, not 'target')
    if (this.filterByDetection && this.sneakingToken) {
      try {
        const { filterOutcomesByDetection } = await import('../services/infra/shared-utils.js');
        filteredOutcomes = await filterOutcomesByDetection(
          filteredOutcomes,
          this.sneakingToken,
          'token',
          false,
          true,
          'target_to_observer',
        );
      } catch {
        /* Viewport filtering is non-critical */
      }
    }

    // Apply defeated token filtering (exclude dead/unconscious tokens)
    try {
      const { filterOutcomesByDefeated } = await import('../services/infra/shared-utils.js');
      filteredOutcomes = filterOutcomesByDefeated(filteredOutcomes, 'token');
    } catch {
      /* Defeated filtering is non-critical */
    }

    // Preserve any overrides the GM selected in the previous render
    try {
      const previous = Array.isArray(this.outcomes) ? this.outcomes : [];
      filteredOutcomes = filteredOutcomes.map((o) => {
        const existing = previous.find((x) => x?.token?.id === o?.token?.id);
        const overrideState = existing?.overrideState ?? o?.overrideState ?? null;
        return { ...o, overrideState };
      });
    } catch { }

    const cfg = (s) => this.visibilityConfig(s);

    // Extract position transition data from outcomes
    await this._extractPositionTransitions(filteredOutcomes);

    // Recalculate visibility outcomes based on position qualifications for initial display
    for (const outcome of filteredOutcomes) {
      // Check if we have position data and if positions don't qualify
      const positionTransition =
        outcome.positionTransition || this._getPositionTransitionForToken(outcome.token);
      // Also compute a wrapper-free live end visibility for accurate concealment checks
      // This bypasses the sneaking detection wrapper that temporarily forces 'hidden'
      try {
        const liveEndVis = await optimizedVisibilityCalculator.calculateVisibilityWithoutOverrides(
          outcome.token,
          this.sneakingToken,
        );
        outcome.liveEndVisibility = liveEndVis;
      } catch { }
      if (outcome._tsFreeSneak) {
        // For Terrain Stalker free-sneak, force qualifications to pass for UI and keep newVisibility
        outcome._featPositionOverride = {
          startQualifies: true,
          endQualifies: true,
          bothQualify: true,
          reason: 'Terrain Stalker: free Sneak',
        };
      } else if (positionTransition) {
        // Calculate raw qualifications
        const rawStart = this._startPositionQualifiesForSneak(outcome.token, outcome);
        const rawEnd = this._endPositionQualifiesForSneak(outcome.token, outcome);

        // Apply feat-based overrides to prerequisites
        let effective = {
          startQualifies: rawStart,
          endQualifies: rawEnd,
          bothQualify: rawStart && rawEnd,
        };
        try {
          const sp = positionTransition.startPosition || {};
          const ep = positionTransition.endPosition || {};
          const inNatural = (() => {
            try {
              return FeatsHandler.isEnvironmentActive(this.sneakingToken, 'natural');
            } catch {
              return false;
            }
          })();
          effective = FeatsHandler.overridePrerequisites(this.sneakingToken, effective, {
            startVisibility: sp.effectiveVisibility,
            endVisibility: ep.effectiveVisibility,
            endCoverState: ep.coverState,
            inNaturalTerrain: inNatural,
            impreciseOnly: outcome?.impreciseOnly || false,
          });
        } catch { }
        // Stash for UI rendering
        outcome._featPositionOverride = effective;

        // Only override to observed if one or both positions don't qualify AFTER overrides
        if (!effective.startQualifies || !effective.endQualifies) {
          outcome.newVisibility = 'observed';
        } else {
          // Both positions qualify - calculate proper outcome based on roll result
          const currentVisibility = outcome.oldVisibility || outcome.currentVisibility;
          const rollOutcome = outcome.outcome;

          // Use standard calculation when prerequisites are met
          const { getDefaultNewStateFor } = await import('../services/data/action-state-config.js');
          const calculatedVisibility = getDefaultNewStateFor(
            'sneak',
            currentVisibility,
            rollOutcome,
          );
          outcome.newVisibility = calculatedVisibility || currentVisibility;
        }
      }
    }

    // Store initial AVS outcome for comparison during recalculation (before any processing)
    filteredOutcomes.forEach((outcome) => {
      if (!outcome._initialAVSOutcome) {
        outcome._initialAVSOutcome = {
          newVisibility: outcome.newVisibility,
          outcome: outcome.outcome,
          rollTotal: outcome.rollTotal,
        };
      }
    });

    // Process outcomes to add additional properties including position data
    let processedOutcomes = filteredOutcomes.map((outcome) => {
      // Get current visibility state - how this observer sees the sneaking token
      const currentVisibility =
        getVisibilityBetween(outcome.token, this.sneakingToken) ||
        outcome.oldVisibility ||
        outcome.currentVisibility;

      // Prepare available states for override
      const desired = getDesiredOverrideStatesForAction('sneak');
      const availableStates = this.buildOverrideStates(desired, outcome);

      const effectiveNewState = outcome.overrideState || outcome.newVisibility;
      const baseOldState = outcome.oldVisibility || currentVisibility;
      // Special case: If current state is AVS-controlled and override is 'avs', no change
      let hasActionableChange = false;
      if (outcome.overrideState === 'avs' && this.isCurrentStateAvsControlled(outcome)) {
        hasActionableChange = false;
      } else {
        hasActionableChange =
          baseOldState != null && effectiveNewState != null && effectiveNewState !== baseOldState;
      }

      // Check if this outcome has deferred end position checks
      const hasSneakyFeat = turnSneakTracker.hasSneakyFeat(this.sneakingToken);

      // Check if this token was already deferred in previous sneak actions this turn
      const wasPreviouslyDeferred =
        turnSneakTracker?.isObserverDeferred?.(this.sneakingToken, outcome.token) || false;

      // Get position transition data for this outcome (needed for eligibility check)
      const positionTransition = this._getPositionTransitionForToken(outcome.token);
      const positionDisplay = this._preparePositionDisplay(
        positionTransition,
        outcome.token,
        outcome,
      );

      // Check Sneaky feat eligibility: start position must qualify and (sneak succeeded but end position doesn't qualify)
      const canDefer = this._isEligibleForSneakyDefer(
        outcome,
        positionDisplay,
        hasSneakyFeat,
        wasPreviouslyDeferred,
      );

      // Is deferred either in current dialog or from previous sneak actions
      const isDeferred = this._deferredChecks?.has(outcome.token.id) || wasPreviouslyDeferred;

      // Check if the old visibility state is AVS-controlled
      const isOldStateAvsControlled = this.isOldStateAvsControlled(outcome);

      return {
        ...outcome,
        outcomeClass: this.getOutcomeClass(outcome.outcome),
        outcomeLabel: this.getOutcomeLabel(outcome.outcome),
        oldVisibilityState: cfg(baseOldState),
        newVisibilityState: cfg(effectiveNewState),
        marginText: this.formatMargin(outcome.margin),
        tokenImage: this.resolveTokenImage(outcome.token),
        availableStates,
        overrideState: outcome.overrideState || outcome.newVisibility,
        hasActionableChange,
        // Enhanced position tracking data
        positionTransition,
        positionDisplay,
        hasPositionData: !!positionTransition,
        positionQuality: positionTransition
          ? this._assessPositionQuality(positionTransition.endPosition)
          : 'unknown',
        positionChangeType: positionTransition?.transitionType || 'unchanged',
        // Cover bonus and roll data
        baseRollTotal: outcome.rollTotal, // Store original roll total
        appliedCoverBonus:
          typeof outcome.appliedCoverBonus !== 'undefined' ? outcome.appliedCoverBonus : 0, // Track applied cover bonus (default to 0)
        // Defer functionality
        canDefer,
        isDeferred,
        isOldStateAvsControlled,
      };
    });

    // Visual filtering: hide Foundry-hidden tokens from display if enabled
    try {
      if (this.hideFoundryHidden) {
        processedOutcomes = processedOutcomes.filter((o) => {
          try {
            return o?.token?.document?.hidden !== true;
          } catch {
            return true;
          }
        });
      }
    } catch { }

    // Sort outcomes to prioritize qualifying positions (green checkmarks) at the top
    let sortedOutcomes = this._sortOutcomesByQualification(processedOutcomes);

    // Show-only-changes visual filter
    try {
      if (this.showChangesOnly) {
        sortedOutcomes = sortedOutcomes.filter((o) => !!o.hasActionableChange);
      }
    } catch { }

    // Update original outcomes with hasActionableChange for Apply All button logic
    sortedOutcomes.forEach((processedOutcome, index) => {
      if (this.outcomes[index]) {
        this.outcomes[index].hasActionableChange = processedOutcome.hasActionableChange;
      }
    });

    // Set sneaker context for template (like Seek dialog)
    context.sneaker = {
      name: this.sneakingToken.name,
      image: this.resolveTokenImage(this.sneakingToken),
      actionType: 'sneak',
      actionLabel: this.isEndOfTurnDialog
        ? 'End-of-turn position validation for Sneaky/Very Sneaky feat'
        : 'Enhanced sneak action results with position tracking',
    };

    context.sneakingToken = this.sneakingToken;
    context.outcomes = sortedOutcomes;
    context.ignoreAllies = !!this.ignoreAllies;
    context.hideFoundryHidden = !!this.hideFoundryHidden;
    context.showChangesOnly = !!this.showChangesOnly;
    context.isEndOfTurnDialog = this.isEndOfTurnDialog;

    // Store the currently rendered outcomes for bulk actions to use
    this._lastRenderedOutcomes = sortedOutcomes;

    // Bulk defer functionality
    const hasSneakyFeat = turnSneakTracker.hasSneakyFeat(this.sneakingToken);
    const deferableOutcomes = sortedOutcomes.filter(
      (outcome) => outcome.canDefer && !outcome.isDeferred,
    );
    context.canBulkDefer = hasSneakyFeat && !this.isEndOfTurnDialog;
    context.hasDeferableTokens = deferableOutcomes.length > 0;

    // Bulk undefer functionality
    const deferredOutcomes = sortedOutcomes.filter(
      (outcome) => outcome.isDeferred || this._deferredChecks?.has(outcome.token?.id),
    );
    context.canBulkUndefer = hasSneakyFeat && !this.isEndOfTurnDialog;
    context.hasDeferredTokens = deferredOutcomes.length > 0;

    // End-of-turn validation functionality
    const hasActiveDeferredChecks = this._deferredChecks && this._deferredChecks.size > 0;
    context.canProcessEndTurn = hasSneakyFeat && !this.isEndOfTurnDialog && hasActiveDeferredChecks;
    context.deferredChecksCount = this._deferredChecks ? this._deferredChecks.size : 0;

    // Enhanced context with position tracking data
    context.hasPositionData = this._hasPositionData;
    context.positionDisplayMode = this._positionDisplayMode;

    // Preserve original outcomes separate from processed
    this.outcomes = processedOutcomes;

    // Compute and expose Max Sneak Distance indicator data
    try {
      const { SneakSpeedService } = await import('../services/sneak-speed-service.js');
      const env = (await import('../../utils/environment.js')).default;
      const actor = this.sneakingToken?.actor || this.sneakingToken;
      const baseSpeed = Number(actor?.system?.movement?.speeds?.land?.value ?? 0) || 0;
      // Prefer original speed flag if present (effect applied), otherwise current value
      let originalSpeed = baseSpeed;
      try {
        const flagVal = this.sneakingToken?.actor?.getFlag?.(
          MODULE_ID,
          'sneak-original-walk-speed',
        );
        if (Number.isFinite(Number(flagVal)) && Number(flagVal) > 0)
          originalSpeed = Number(flagVal);
      } catch { }

      const maxFeet = await SneakSpeedService.getSneakMaxDistanceFeet(this.sneakingToken);

      // Also compute multiplier and bonus for tooltip details
      let multiplier = 0.5;
      let bonusFeet = 0;
      try {
        multiplier = FeatsHandler.getSneakSpeedMultiplier(this.sneakingToken) ?? 0.5;
        bonusFeet = FeatsHandler.getSneakDistanceBonusFeet(this.sneakingToken) ?? 0;
      } catch { }

      const explanations = [];
      explanations.push(`Base Speed: ${originalSpeed} ft`);
      explanations.push(`Sneak Multiplier: x${multiplier}`);
      if (bonusFeet) explanations.push(`Feat Bonus: +${bonusFeet} ft`);
      // Determine whether clamping occurred by comparing raw vs base
      const rawTotal = Math.floor(originalSpeed * multiplier) + (bonusFeet || 0);
      if (rawTotal > originalSpeed) {
        explanations.push(`Capped at base Speed (${originalSpeed} ft)`);
      }
      const movementLabel = game.i18n.localize(`PF2E_VISIONER.MOVEMENT.${movementType}`);
      // Choose an icon matching the movement type
      const movementIcon = (() => {
        switch (movementType) {
          case 'stride':
            return 'fas fa-running';
          case 'leap':
            return 'fas fa-person-running';
          case 'climb':
            return 'fas fa-mountain';
          case 'fly':
            return 'fas fa-feather';
          case 'swim':
            return 'fas fa-person-swimming';
          case 'burrow':
            return 'fas fa-person-digging';
          case 'teleport':
            return 'fas fa-bolt';
          case 'travel':
            return 'fas fa-route';
          case 'deploy':
            return 'fas fa-box-open';
          case 'walk':
          default:
            return 'fas fa-person-walking';
        }
      })();
      // Determine movement support (green/red chip)
      let supported = true;
      let speedVal = 0;
      try {
        const speeds = actor?.system?.movement?.speeds || {};
        const key = movementType === 'walk' ? 'land' : movementType;
        const sobj = speeds?.[key] || null;
        speedVal = Number(sobj?.value ?? 0) || 0;
        supported = speedVal > 0;
      } catch { }

      context.sneakDistance = {
        maxFeet,
        baseSpeed: originalSpeed,
        multiplier,
        bonusFeet,
        tooltip: explanations.join('\n'),
        movementType,
        movementLabel,
        movementIcon,
        supported,
        speed: speedVal,
        statusClass: supported ? 'ok' : 'warn',
        supportTooltip: supported
          ? `${movementLabel} speed: ${speedVal} ft`
          : `${movementLabel} speed unavailable for this actor`,
      };
    } catch { }

    // Compute feat prerequisite-relaxation badges (Terrain Stalker, Vanish into the Land, Very Very Sneaky, Legendary Sneak, Ceaseless Shadows, Distracting Shadows)
    try {
      const badges = [];
      const actorOrToken = this.sneakingToken;
      const has = (slug) => {
        try {
          return FeatsHandler.hasFeat(actorOrToken, slug);
        } catch {
          return false;
        }
      };
      // Sneaky/Very Sneaky: allows consecutive sneak actions with deferred end position checks
      if (has('sneaky') || has('very-sneaky')) {
        const isVery = has('very-sneaky');
        const turnState = turnSneakTracker.getTurnSneakState(actorOrToken);
        const sneakCount = turnState?.sneakActions?.length || 0;

        badges.push({
          key: isVery ? 'very-sneaky' : 'sneaky',
          icon: 'fas fa-user-ninja',
          label: isVery ? 'Very Sneaky' : 'Sneaky',
          tooltip:
            sneakCount > 1
              ? `${isVery ? 'Very Sneaky' : 'Sneaky'} feat active - End position checks deferred to turn end (${sneakCount} consecutive sneaks this turn)`
              : `${isVery ? 'Very Sneaky' : 'Sneaky'} feat available - Consecutive sneaks will defer end position checks`,
        });
      }
      // Ceaseless Shadows: removes cover/concealment requirement entirely
      if (has('ceaseless-shadows')) {
        badges.push({
          key: 'ceaseless-shadows',
          icon: 'fas fa-infinity',
          label: game.i18n.localize(
            'PF2E_VISIONER.SNEAK_AUTOMATION.BADGES.CEASELESS_SHADOWS_LABEL',
          ),
          tooltip: game.i18n.localize(
            'PF2E_VISIONER.SNEAK_AUTOMATION.BADGES.CEASELESS_SHADOWS_TOOLTIP',
          ),
        });
      }
      // Camouflage: removes cover/concealment requirement in natural terrain
      try {
        if (has('camouflage')) {
          const env = (await import('../../utils/environment.js')).default;
          const naturalTerrains = ['aquatic', 'arctic', 'desert', 'forest', 'mountain', 'plains', 'sky', 'swamp', 'underground'];
          const inNaturalTerrain = naturalTerrains.some(terrain =>
            env.isEnvironmentActive(actorOrToken, terrain)
          );
          if (inNaturalTerrain) {
            badges.push({
              key: 'camouflage',
              icon: 'fas fa-tree',
              label: game.i18n.localize(
                'PF2E_VISIONER.SNEAK_AUTOMATION.BADGES.CAMOUFLAGE_LABEL',
              ),
              tooltip: game.i18n.localize(
                'PF2E_VISIONER.SNEAK_AUTOMATION.BADGES.CAMOUFLAGE_TOOLTIP',
              ),
            });
          }
        }
      } catch { }
      // Legendary Sneak: relaxes start prerequisite
      if (has('legendary-sneak')) {
        badges.push({
          key: 'legendary-sneak',
          icon: 'fas fa-shoe-prints',
          label: game.i18n.localize('PF2E_VISIONER.SNEAK_AUTOMATION.BADGES.LEGENDARY_SNEAK_LABEL'),
          tooltip: game.i18n.localize(
            'PF2E_VISIONER.SNEAK_AUTOMATION.BADGES.LEGENDARY_SNEAK_TOOLTIP',
          ),
        });
      }
      // Very, Very Sneaky: relaxes end prerequisite
      if (has('very-very-sneaky')) {
        badges.push({
          key: 'very-very-sneaky',
          icon: 'fas fa-user-ninja',
          label: game.i18n.localize('PF2E_VISIONER.SNEAK_AUTOMATION.BADGES.VERY_VERY_SNEAKY_LABEL'),
          tooltip: game.i18n.localize(
            'PF2E_VISIONER.SNEAK_AUTOMATION.BADGES.VERY_VERY_SNEAKY_TOOLTIP',
          ),
        });
      }
      // Terrain Stalker: active in chosen environment
      try {
        if (has('terrain-stalker')) {
          const selections = FeatsHandler.getTerrainStalkerSelections(actorOrToken) || [];
          const active = selections.filter((sel) => {
            try {
              return FeatsHandler.isEnvironmentActive(actorOrToken, sel);
            } catch {
              return false;
            }
          });
          if (active.length) {
            const selectionText = active.join(', ');
            // Also show all region environment types under the token (supports multiple)
            let environmentsText = '—';
            try {
              const env = (await import('../../utils/environment.js')).default;
              const ctx = env.getActiveContext(actorOrToken, { movementType }) || {};
              const regionTypes = Array.from(ctx.regionTypes || []);
              const sceneFallback = Array.from(ctx.sceneTypes || []);
              const envList = regionTypes.length ? regionTypes : sceneFallback;
              if (envList.length) environmentsText = envList.join(', ');
            } catch {
              /* non-critical */
            }
            badges.push({
              key: 'terrain-stalker',
              icon: 'fas fa-tree',
              label: game.i18n.localize(
                'PF2E_VISIONER.SNEAK_AUTOMATION.BADGES.TERRAIN_STALKER_LABEL',
              ),
              tooltip: game.i18n.format(
                'PF2E_VISIONER.SNEAK_AUTOMATION.BADGES.TERRAIN_STALKER_TOOLTIP',
                { selection: selectionText, environments: environmentsText },
              ),
            });
          }
        }
      } catch { }
      // Vanish into the Land: active in selected difficult terrain for Terrain Stalker
      try {
        if (has('vanish-into-the-land')) {
          const selections = FeatsHandler.getTerrainStalkerSelections(actorOrToken) || [];
          let active = false;
          for (const selection of selections) {
            try {
              // Prefer precise difficult terrain check (movement-aware)
              const env = (await import('../../utils/environment.js')).default;
              const matches =
                env.getMatchingEnvironmentRegions(actorOrToken, selection, { movementType }) || [];
              if (matches.length > 0) {
                active = true;
                break;
              }
            } catch {
              active = active || FeatsHandler.isEnvironmentActive(actorOrToken, selection);
            }
          }
          if (active) {
            badges.push({
              key: 'vanish-into-the-land',
              icon: 'fas fa-leaf',
              label: game.i18n.localize(
                'PF2E_VISIONER.SNEAK_AUTOMATION.BADGES.VANISH_INTO_THE_LAND_LABEL',
              ),
              tooltip: game.i18n.localize(
                'PF2E_VISIONER.SNEAK_AUTOMATION.BADGES.VANISH_INTO_THE_LAND_TOOLTIP',
              ),
            });
          }
        }
      } catch { }
      // Distracting Shadows: show informational badge when feat present (contextual per observer)
      if (has('distracting-shadows')) {
        badges.push({
          key: 'distracting-shadows',
          icon: 'fas fa-users',
          label: game.i18n.localize(
            'PF2E_VISIONER.SNEAK_AUTOMATION.BADGES.DISTRACTING_SHADOWS_LABEL',
          ),
          tooltip: game.i18n.localize(
            'PF2E_VISIONER.SNEAK_AUTOMATION.BADGES.DISTRACTING_SHADOWS_TOOLTIP',
          ),
        });
      }
      context.prereqBadges = badges;
    } catch { }

    // Add deferred checks information for global display
    try {
      const turnState = turnSneakTracker?.getTurnSneakState?.(this.sneakingToken);
      if (turnState && turnState.isActive) {
        const hasSneakyFeat = turnSneakTracker.hasSneakyFeat(this.sneakingToken);
        const hasAnyDeferredChecks = processedOutcomes.some((outcome) =>
          turnSneakTracker.shouldDeferEndPositionCheck(this.sneakingToken, outcome.token),
        );

        if (hasSneakyFeat && hasAnyDeferredChecks) {
          context.hasDeferredChecks = true;
          context.consecutiveSneaks = turnState.sneakActions?.length || 1;
        }
      }
    } catch (error) {
      // Error checking deferred state - continue silently
    }

    Object.assign(context, this.buildCommonContext(processedOutcomes));

    return context;
  }

  // Use BaseActionDialog outcome helpers
  // Token id in Sneak outcomes is under `token`
  getOutcomeTokenId(outcome) {
    return outcome?.token?.id ?? null;
  }

  async _onRender(context, options) {
    super._onRender(context, options);
    this.addIconClickHandlers();
    this.updateBulkActionButtons();
    this.markInitialSelections();
    this._resetCoverBonusButtonStates();
    this.addDeferHandlers();
    this._resetBulkUndeferButton();
    // Update bulk defer button asynchronously (don't block render)
    try {
      await this._updateBulkDeferButton();
    } catch { }

    try {
      const cb = this.element.querySelector('input[data-action="toggleIgnoreAllies"]');
      if (cb)
        cb.addEventListener('change', () => {
          this.ignoreAllies = !!cb.checked;
          this.bulkActionState = 'initial';
          // Recompute outcomes and preserve overrides before re-rendering
          this._recomputeOutcomesWithPositionData()
            .then((list) => {
              if (Array.isArray(list)) this.outcomes = list;
              this.render({ force: true });
            })
            .catch(() => this.render({ force: true }));
        });
    } catch { }
    // Wire Hide Foundry-hidden visual filter toggle
    try {
      const cbh = this.element.querySelector('input[data-action="toggleHideFoundryHidden"]');
      if (cbh) {
        cbh.addEventListener('change', async () => {
          this.hideFoundryHidden = !!cbh.checked;
          try {
            await game.settings.set(MODULE_ID, 'hideFoundryHiddenTokens', this.hideFoundryHidden);
          } catch { }
          // Recompute outcomes to apply visual filter and keep positions updated
          const list = await this._recomputeOutcomesWithPositionData();
          if (Array.isArray(list)) this.outcomes = list;
          this.render({ force: true });
        });
      }
    } catch { }
  }

  /**
   * Add event handlers for defer buttons
   * @private
   */
  addDeferHandlers() {
    // Individual defer buttons
    const deferButtons = this.element.querySelectorAll('[data-action="toggleDefer"]');
    deferButtons.forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();

        const tokenId = button.dataset.tokenId;
        const row = button.closest('tr');

        if (!tokenId || !row) return;

        // Find the outcome for this token
        const outcome = this.outcomes.find((o) => o.token?.id === tokenId);
        if (!outcome) return;

        // Toggle defer state
        const wasDeferred = this._deferredChecks.has(tokenId);

        if (wasDeferred) {
          this._deferredChecks.delete(tokenId);
          button.classList.remove('deferred', 'active');
          row.classList.remove('row-deferred');
          button.querySelector('i').className = 'fas fa-hourglass-half';
          button.title = 'Defer this check';

          // Remove from turn tracker
          try {
            turnSneakTracker.removeDeferredCheck(this.sneakingToken, outcome.token);
          } catch (error) {
            // Failed to remove from turn tracker - continue silently
          }

          // Update outcome state
          outcome.isDeferred = false;

          // Recalculate defer eligibility - if end position doesn't qualify, defer button should be visible again
          this._recalculateDeferEligibility(outcome);
        } else {
          this._deferredChecks.add(tokenId);
          button.classList.add('deferred', 'active');
          row.classList.add('row-deferred');
          button.querySelector('i').className = 'fas fa-clock';
          button.title = 'Remove defer';

          // Store the original position qualifications before deferring
          // This preserves the start position qualification for consecutive sneaks
          if (!outcome._featPositionOverride) {
            outcome._featPositionOverride = {
              startQualifies: this._startPositionQualifiesForSneak(outcome.token, outcome),
              endQualifies: this._endPositionQualifiesForSneak(outcome.token, outcome),
              reason: 'Deferred position qualifications',
            };
          }

          // Update outcome state
          outcome.isDeferred = true;

          // Record the deferred check in the turn tracker
          try {
            const positionTransition = this._getPositionTransitionForToken(outcome.token);
            const positionData = {
              position: positionTransition?.endPosition,
              visibility: outcome.newVisibility,
              coverState: outcome.endCover || 'none',
            };

            turnSneakTracker.recordDeferredCheck(
              this.sneakingToken,
              outcome.token,
              positionData,
              outcome,
            );
          } catch (error) {
            // Failed to record deferred check - continue silently
          }
        }

        // Update bulk defer button availability
        this._updateBulkDeferButton();
      });
    });

    // Bulk defer button
    const bulkDeferButton = this.element.querySelector('[data-action="bulkDefer"]');
    if (bulkDeferButton) {
      bulkDeferButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this._bulkDeferAllEligible();
      });
    }

    // Bulk undefer button
    const bulkUndeferButton = this.element.querySelector('[data-action="bulkUndefer"]');
    if (bulkUndeferButton) {
      bulkUndeferButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();

        // Check if button is in "Restore Defers" mode
        if (bulkUndeferButton.classList.contains('ready-to-restore')) {
          this._bulkRestoreDefers();
        } else {
          this._bulkUndeferAll();
        }
      });
    }
  }

  /**
   * Get filtered outcomes for Apply All operations, excluding deferred outcomes
   * @returns {Array} Filtered outcomes array excluding deferred tokens
   */
  async getFilteredOutcomes() {
    // Start with all outcomes
    let filteredOutcomes = Array.isArray(this.outcomes) ? [...this.outcomes] : [];

    // Exclude deferred outcomes from Apply All operations
    if (this._deferredChecks && this._deferredChecks.size > 0) {
      filteredOutcomes = filteredOutcomes.filter((outcome) => {
        const tokenId = outcome.token?.id || outcome.target?.id;
        return tokenId && !this._deferredChecks.has(tokenId);
      });
    }

    return filteredOutcomes;
  }

  /**
   * Bulk defer all eligible tokens that are currently visible based on active filters
   * According to Sneaky feat rules, only defer outcomes that:
   * 1. Are currently visible in the filtered dialog
   * 2. Succeeded at the Sneak check (success or critical-success)
   * 3. End position doesn't qualify (no cover/concealment)
   * @private
   */
  _bulkDeferAllEligible() {
    // Use the exact same outcomes that were rendered to the user (respects all active filters)
    const visibleOutcomes = this._lastRenderedOutcomes || [];

    let deferredCount = 0;

    // Only process outcomes that are currently visible in the filtered dialog
    visibleOutcomes.forEach((outcome) => {
      const tokenId = outcome.token?.id;
      if (!tokenId) return;

      // Skip if already deferred in current dialog or from previous sneak actions
      if (this._deferredChecks.has(tokenId) || outcome.isDeferred) return;

      // Only defer if this outcome can be deferred (meets Sneaky feat eligibility)
      if (!outcome.canDefer) return;

      // Find the corresponding defer button in the DOM
      const button = this.element.querySelector(
        `[data-action="toggleDefer"][data-token-id="${tokenId}"]`,
      );
      const row = button?.closest('tr');

      if (!button || !row) return;

      // Perform the defer action
      this._deferredChecks.add(tokenId);
      button.classList.add('deferred', 'active');
      row.classList.add('row-deferred');
      button.querySelector('i').className = 'fas fa-clock';
      button.title = 'Remove defer';

      // Record the deferred check in the turn tracker
      try {
        const positionTransition = this._getPositionTransitionForToken(outcome.token);
        const positionData = {
          position: positionTransition?.endPosition,
          visibility: outcome.newVisibility,
          coverState: outcome.endCover || 'none',
        };

        turnSneakTracker.recordDeferredCheck(
          this.sneakingToken,
          outcome.token,
          positionData,
          outcome,
        );
      } catch (error) {
        // Failed to record deferred check for bulk defer - continue silently
      }

      deferredCount++;
    });

    if (deferredCount > 0) {
      // Update the bulk defer button state
      this._updateBulkDeferButton();

      // Show notification about successful deferrals
      if (typeof ui !== 'undefined' && ui.notifications) {
        ui.notifications.info(
          `Deferred ${deferredCount} eligible position check${deferredCount !== 1 ? 's' : ''} to end of turn (Sneaky feat).`,
        );
      }
    } else {
      // Show notification when no eligible outcomes found
      if (typeof ui !== 'undefined' && ui.notifications) {
        ui.notifications.warn(
          'No eligible outcomes found for deferral. Sneaky feat only applies to successful sneaks with failing end positions.',
        );
      }
    }
  }

  /**
   * Bulk undefer all currently deferred tokens and restore their original state
   * This efficiently removes multiple tokens from defer status in one operation
   * @private
   */
  _bulkUndeferAll() {
    // Use the exact same outcomes that were rendered to the user (respects all active filters)
    const visibleOutcomes = this._lastRenderedOutcomes || [];

    let undeferredCount = 0;

    // Only process outcomes that are currently visible in the filtered dialog and are deferred
    visibleOutcomes.forEach((outcome) => {
      const tokenId = outcome.token?.id;
      if (!tokenId) return;

      // Skip if not currently deferred
      if (!this._deferredChecks.has(tokenId) && !outcome.isDeferred) return;

      // Get original stored outcome before removing from tracker
      let originalStoredOutcome = null;
      try {
        const combatantId = turnSneakTracker._getCombatantId(this.sneakingToken);
        if (combatantId) {
          const turnState = turnSneakTracker._turnSneakStates.get(combatantId);
          if (turnState) {
            const observerId = outcome.token.document?.id || outcome.token.id;
            const deferredData = turnState.deferredChecks.get(observerId);
            if (deferredData && deferredData.originalOutcome) {
              originalStoredOutcome = deferredData.originalOutcome;
            }
          }
        }
      } catch (error) {
        // Failed to retrieve original outcome for bulk undefer - continue silently
      }

      // Remove from local deferred set
      if (this._deferredChecks.has(tokenId)) {
        this._deferredChecks.delete(tokenId);
      }

      // Update DOM elements
      const button = this.element.querySelector(
        `[data-action="toggleDefer"][data-token-id="${tokenId}"]`,
      );
      const row = button?.closest('tr');

      if (button && row) {
        button.classList.remove('deferred', 'active');
        row.classList.remove('row-deferred');
        button.querySelector('i').className = 'fas fa-hourglass-half';
        button.title = 'Defer this check';
        row.removeAttribute('data-deferred');
      }

      // Remove from turn tracker deferred checks
      try {
        turnSneakTracker.removeDeferredCheck(this.sneakingToken, outcome.token);
      } catch (error) {
        // Failed to remove deferred check from tracker for bulk undefer - continue silently
      }

      // Store the original outcome state before modifying it (for potential restore)
      const originalOutcomeState = { ...outcome };
      this._bulkUndeferredOutcomes.set(tokenId, originalOutcomeState);

      // Apply selective recalculation if we have original data
      if (originalStoredOutcome) {
        try {
          // Use the original start position qualification from when it was deferred
          const preservedStartQualifies = originalStoredOutcome.startQualifies;
          const preservedStartCover = originalStoredOutcome.startCover;
          const preservedStartVisibility = originalStoredOutcome.startVisibility;

          // Recalculate only end position qualification with current position
          const positionTransition = this._getPositionTransitionForToken(outcome.token);
          const endQualifies = positionTransition
            ? this._endPositionQualifiesForSneak(outcome.token, positionTransition.endPosition)
            : false;

          // Update the outcome with preserved start data and recalculated end data
          const outcomeIndex = this.outcomes.findIndex((o) => o.token?.id === tokenId);
          if (outcomeIndex >= 0) {
            this.outcomes[outcomeIndex] = {
              ...this.outcomes[outcomeIndex],
              startQualifies: preservedStartQualifies,
              startCover: preservedStartCover,
              startVisibility: preservedStartVisibility,
              endQualifies: endQualifies,
              isDeferred: false, // No longer deferred
            };
          }
        } catch (error) {
          // Error during bulk selective recalculation - continue silently
        }
      }

      undeferredCount++;
    });

    if (undeferredCount > 0) {
      // Update the bulk defer button state
      this._updateBulkDeferButton();

      // Change the bulk undefer button to "Restore Defers" mode
      this._setBulkUndeferButtonToRestoreMode();

      // Re-render to update button states and visibility for all changes
      this.render(false, { force: true }).catch((error) => {
        // Error during bulk undefer render - continue silently
      });

      if (typeof ui !== 'undefined' && ui.notifications) {
        ui.notifications.info(
          `Bulk undeferred ${undeferredCount} token${undeferredCount === 1 ? '' : 's'}`,
        );
      }
    } else {
      if (typeof ui !== 'undefined' && ui.notifications) {
        ui.notifications.warn('No deferred tokens found to undefer.');
      }
    }
  }

  /**
   * Bulk restore all previously undeferred tokens back to deferred state
   * This restores the original outcome states that were preserved during bulk undefer
   * @private
   */
  _bulkRestoreDefers() {
    let restoredCount = 0;

    // Restore all tokens that were bulk undeferred
    this._bulkUndeferredOutcomes.forEach((originalOutcome, tokenId) => {
      // Find the current outcome
      const outcomeIndex = this.outcomes.findIndex((o) => o.token?.id === tokenId);
      if (outcomeIndex < 0) return;

      // Restore the original outcome state
      this.outcomes[outcomeIndex] = { ...originalOutcome };

      // Add back to deferred set
      this._deferredChecks.add(tokenId);

      // Update DOM elements
      const button = this.element.querySelector(
        `[data-action="toggleDefer"][data-token-id="${tokenId}"]`,
      );
      const row = button?.closest('tr');

      if (button && row) {
        button.classList.add('deferred', 'active');
        row.classList.add('row-deferred');
        button.querySelector('i').className = 'fas fa-clock';
        button.title = 'Remove defer';
        row.setAttribute('data-deferred', 'true');
      }

      // Record the deferred check in the turn tracker (restore original state)
      try {
        const positionTransition = this._getPositionTransitionForToken(originalOutcome.token);
        const positionData = {
          position: positionTransition?.endPosition,
          visibility: originalOutcome.newVisibility,
          coverState: originalOutcome.endCover || 'none',
        };

        turnSneakTracker.recordDeferredCheck(
          this.sneakingToken,
          originalOutcome.token,
          positionData,
          originalOutcome,
        );
      } catch (error) {
        // Failed to record deferred check in bulk restore - continue silently
      }

      restoredCount++;
    });

    // Clear the undeferred outcomes tracking since we've restored them
    this._bulkUndeferredOutcomes.clear();

    if (restoredCount > 0) {
      // Force reset button to normal mode
      this._forceResetBulkUndeferButton();

      // Update bulk defer button state
      this._updateBulkDeferButton(); // Re-render to update all states
      this.render(false, { force: true }).catch((error) => {
        // Error during bulk restore render - continue silently
      });

      if (typeof ui !== 'undefined' && ui.notifications) {
        ui.notifications.info(
          `Restored ${restoredCount} token${restoredCount === 1 ? '' : 's'} to original deferred state with all position data`,
        );
      }
    } else {
      if (typeof ui !== 'undefined' && ui.notifications) {
        ui.notifications.warn('No undeferred tokens found to restore to deferred state.');
      }
    }
  }

  /**
   * Updates the bulk defer and undefer button availability based on tokens in the currently visible (filtered) outcomes
   * @private
   */
  _updateBulkDeferButton() {
    const bulkDeferButton = this.element.querySelector('[data-action="bulkDefer"]');
    const bulkUndeferButton = this.element.querySelector('[data-action="bulkUndefer"]');

    // Use the exact same outcomes that were rendered to the user (respects all active filters)
    const visibleOutcomes = this._lastRenderedOutcomes || [];

    // Check for eligible deferrals
    const hasEligible = visibleOutcomes.some((outcome) => {
      // Use the canDefer flag that already considers all eligibility criteria
      return outcome.canDefer && !outcome.isDeferred;
    });

    // Check for currently deferred tokens
    const hasDeferred = visibleOutcomes.some((outcome) => {
      return outcome.isDeferred || this._deferredChecks.has(outcome.token?.id);
    });

    // Update bulk defer button
    if (bulkDeferButton) {
      if (hasEligible) {
        bulkDeferButton.classList.add('available');
      } else {
        bulkDeferButton.classList.remove('available');
      }
    }

    // Update bulk undefer button
    if (bulkUndeferButton) {
      // Available if there are deferred tokens OR if there are undeferred outcomes to restore
      const hasUndeferredToRestore = this._bulkUndeferredOutcomes.size > 0;
      if (hasDeferred || hasUndeferredToRestore) {
        bulkUndeferButton.classList.add('available');
      } else {
        bulkUndeferButton.classList.remove('available');
      }
    }
  }

  /**
   * Recomputes outcomes with position data when toggles change
   * This ensures all tokens (including newly included allies) have position data
   * @private
   */
  async _recomputeOutcomesWithPositionData() {
    // Start from original list if available so toggles can re-include allies
    const baseList = Array.isArray(this._originalOutcomes)
      ? this._originalOutcomes
      : this.outcomes || [];

    // Filter outcomes with base helper and ally filtering
    let filteredOutcomes = this.applyEncounterFilter(
      baseList,
      'token',
      'No encounter observers found, showing all',
    );

    // Apply ally filtering for display purposes
    try {
      const { filterOutcomesByAllies } = await import('../services/infra/shared-utils.js');
      filteredOutcomes = filterOutcomesByAllies(
        filteredOutcomes,
        this.sneakingToken,
        this.ignoreAllies,
        'token',
      );
    } catch { }

    // Apply viewport filtering if enabled (Note: Sneak uses 'token' property, not 'target')
    if (this.filterByDetection && this.sneakingToken) {
      try {
        const { filterOutcomesByDetection } = await import('../services/infra/shared-utils.js');
        filteredOutcomes = await filterOutcomesByDetection(
          filteredOutcomes,
          this.sneakingToken,
          'token',
          false,
          true,
          'target_to_observer',
        );
      } catch {
        /* Viewport filtering is non-critical */
      }
    }

    // Capture current end positions for all filtered outcomes
    await this._captureCurrentEndPositionsForOutcomes(filteredOutcomes);

    // Extract position transition data from outcomes
    await this._extractPositionTransitions(filteredOutcomes);

    // Recalculate visibility outcomes based on position qualifications for ignore allies toggle
    for (const outcome of filteredOutcomes) {
      // Check if we have position data and if positions don't qualify
      const positionTransition =
        outcome.positionTransition || this._getPositionTransitionForToken(outcome.token);
      if (outcome._tsFreeSneak) {
        outcome._featPositionOverride = {
          startQualifies: true,
          endQualifies: true,
          bothQualify: true,
          reason: 'Terrain Stalker: free Sneak',
        };
        // Keep existing newVisibility; do not force observed
      } else if (positionTransition) {
        // Calculate raw qualifications
        const startQualifies = this._startPositionQualifiesForSneak(outcome.token, outcome);
        const endQualifies = this._endPositionQualifiesForSneak(outcome.token, outcome);

        // Apply feat-based overrides
        let effective = {
          startQualifies,
          endQualifies,
          bothQualify: startQualifies && endQualifies,
        };
        try {
          const sp = positionTransition.startPosition || {};
          const ep = positionTransition.endPosition || {};
          const inNatural = (() => {
            try {
              return FeatsHandler.isEnvironmentActive(this.sneakingToken, 'natural');
            } catch {
              return false;
            }
          })();
          effective = FeatsHandler.overridePrerequisites(this.sneakingToken, effective, {
            startVisibility: sp.effectiveVisibility,
            endVisibility: ep.effectiveVisibility,
            endCoverState: ep.coverState,
            inNaturalTerrain: inNatural,
            impreciseOnly: outcome?.impreciseOnly || false,
          });
        } catch { }
        outcome._featPositionOverride = effective;

        // Only override to observed if one or both positions don't qualify AFTER overrides
        if (!effective.startQualifies || !effective.endQualifies) {
          outcome.newVisibility = 'observed';
          outcome.overrideState = null;
        } else {
          // Both positions qualify - calculate proper outcome based on roll result
          const currentVis = outcome.oldVisibility || outcome.currentVisibility;
          const rollOutcome = outcome.outcome;

          // Use standard calculation when prerequisites are met
          const { getDefaultNewStateFor } = await import('../services/data/action-state-config.js');
          const calculatedVisibility = getDefaultNewStateFor('sneak', currentVis, rollOutcome);
          outcome.newVisibility = calculatedVisibility || currentVis;

          // Clear any override state to ensure our calculation is used
          outcome.overrideState = null;
        }
      }
    }

    // Process outcomes to add additional properties including position data
    let processedOutcomes = filteredOutcomes.map((outcome) => {
      // Get current visibility state - how this observer sees the sneaking token
      const currentVisibility =
        getVisibilityBetween(outcome.token, this.sneakingToken) ||
        outcome.oldVisibility ||
        outcome.currentVisibility;

      // Prepare available states for override
      const desired = getDesiredOverrideStatesForAction('sneak');
      const availableStates = this.buildOverrideStates(desired, outcome);

      const effectiveNewState = outcome.overrideState || outcome.newVisibility;
      const baseOldState = outcome.oldVisibility || currentVisibility;
      // Special case: If current state is AVS-controlled and override is 'avs', no change
      let hasActionableChange = false;
      if (outcome.overrideState === 'avs' && this.isCurrentStateAvsControlled(outcome)) {
        hasActionableChange = false;
      } else {
        hasActionableChange =
          baseOldState != null && effectiveNewState != null && effectiveNewState !== baseOldState;
      }

      // Check if this outcome has deferred end position checks
      const hasSneakyFeat = turnSneakTracker.hasSneakyFeat(this.sneakingToken);

      // Check if this token was already deferred in previous sneak actions this turn
      const wasPreviouslyDeferred =
        turnSneakTracker?.isObserverDeferred?.(this.sneakingToken, outcome.token) || false;

      // Get position transition data for this outcome (needed for eligibility check)
      const positionTransition = this._getPositionTransitionForToken(outcome.token);
      const positionDisplay = this._preparePositionDisplay(
        positionTransition,
        outcome.token,
        outcome,
      );

      // Check Sneaky feat eligibility: start position must qualify and (sneak succeeded but end position doesn't qualify)
      const canDefer = this._isEligibleForSneakyDefer(
        outcome,
        positionDisplay,
        hasSneakyFeat,
        wasPreviouslyDeferred,
      );

      // Is deferred either in current dialog or from previous sneak actions
      const isDeferred = this._deferredChecks?.has(outcome.token.id) || wasPreviouslyDeferred;

      return {
        ...outcome,
        outcomeClass: this.getOutcomeClass(outcome.outcome),
        outcomeLabel: this.getOutcomeLabel(outcome.outcome),
        oldVisibilityState: this.visibilityConfig(baseOldState),
        newVisibilityState: this.visibilityConfig(effectiveNewState),
        marginText: this.formatMargin(outcome.margin),
        tokenImage: this.resolveTokenImage(outcome.token),
        availableStates,
        overrideState: outcome.overrideState || outcome.newVisibility,
        hasActionableChange,
        // Enhanced position tracking data
        positionTransition,
        positionDisplay,
        hasPositionData: !!positionTransition,
        positionQuality: positionTransition
          ? this._assessPositionQuality(positionTransition.endPosition)
          : 'unknown',
        positionChangeType: positionTransition?.transitionType || 'unchanged',
        // Cover bonus and roll data
        baseRollTotal: outcome.rollTotal, // Store original roll total
        appliedCoverBonus:
          typeof outcome.appliedCoverBonus !== 'undefined' ? outcome.appliedCoverBonus : 0, // Track applied cover bonus (default to 0)
        // Defer functionality
        canDefer,
        isDeferred,
      };
    });

    // Visual filtering: hide Foundry-hidden tokens from display if enabled
    try {
      if (this.hideFoundryHidden) {
        processedOutcomes = processedOutcomes.filter((o) => {
          try {
            return o?.token?.document?.hidden !== true;
          } catch {
            return true;
          }
        });
      }
    } catch { }
    return processedOutcomes;
  }

  /**
   * Captures current end positions for all observer tokens in real-time
   * This provides fresh position data without relying on complex tracking systems
   * @private
   */
  /**
   * Captures current end positions for a specific set of outcomes
   * This is used when recomputing outcomes after toggles change
   * @param {Array} outcomes - Array of outcome objects
   * @private
   */
  async _captureCurrentEndPositionsForOutcomes(outcomes) {
    if (!outcomes?.length || !this.sneakingToken) return;

    try {
      for (const outcome of outcomes) {
        if (!outcome.token?.document?.id) continue;

        try {
          // Capture current position state for this observer token
          const currentEndPosition = await this.positionTracker._capturePositionState(
            this.sneakingToken,
            outcome.token,
            Date.now(),
            { forceFresh: true, useCurrentPositionForCover: true },
          );

          // Update the outcome with fresh end position data
          if (currentEndPosition) {
            outcome.endCover = currentEndPosition.coverState;
            outcome.endVisibility = currentEndPosition.effectiveVisibility;

            // Also compute a live end visibility ignoring overrides for higher-fidelity dim/dark checks
            try {
              outcome.liveEndVisibility =
                await optimizedVisibilityCalculator.calculateVisibilityWithoutOverrides(
                  outcome.token,
                  this.sneakingToken,
                );
            } catch { }

            // Create a basic position transition object for newly included tokens
            if (!outcome.positionTransition) {
              // For newly included tokens, we need to determine the start position
              // The start position should be the state when sneak began
              // Use the actual start states data captured when sneak began
              const startState = this.startStates[outcome.token.id];
              const startVisibility = startState?.visibility || 'hidden';
              const startCover = startState?.cover || 'none';

              outcome.positionTransition = {
                hasChanged: startVisibility !== currentEndPosition.effectiveVisibility,
                transitionType:
                  startVisibility !== currentEndPosition.effectiveVisibility
                    ? 'improved'
                    : 'unchanged',
                avsVisibilityChanged: startVisibility !== currentEndPosition.effectiveVisibility,
                coverStateChanged: startCover !== currentEndPosition.coverState,
                stealthBonusChange: 0,
                impactOnDC: 0,
                startPosition: {
                  effectiveVisibility: startVisibility,
                  coverState: startCover,
                  stealthBonus: 0,
                  distance: currentEndPosition.distance || 0,
                  lightingConditions: currentEndPosition.lightingConditions || 'bright',
                },
                endPosition: {
                  effectiveVisibility: currentEndPosition.effectiveVisibility,
                  coverState: currentEndPosition.coverState,
                  stealthBonus: 0,
                  distance: currentEndPosition.distance || 0,
                  lightingConditions: currentEndPosition.lightingConditions || 'bright',
                },
              };
            }
          }
        } catch (error) {
          // Failed to capture current end position - continue silently
        }
      }
    } catch (error) {
      // Failed to capture current end positions for outcomes - continue silently
    }
  }

  /**
   * Extracts position transition data from outcomes
   * @param {Array} outcomes - Array of outcome objects
   * @private
   */
  async _extractPositionTransitions(outcomes) {
    this._positionTransitions.clear();
    this._hasPositionData = false;

    for (const outcome of outcomes) {
      if (outcome.positionTransition) {
        this._positionTransitions.set(outcome.token.id, outcome.positionTransition);
        this._hasPositionData = true;
      }
    }
  }

  /**
   * Gets position transition data for a specific token
   * @param {Token} token - The token to get position data for
   * @returns {PositionTransition|null} Position transition data or null
   * @private
   */
  _getPositionTransitionForToken(token) {
    if (!token?.id) return null;

    // For end-of-turn dialogs, check if we have preserved original position data
    if (this.isEndOfTurnDialog) {
      // Look for the outcome with this token to check for preserved position data
      const outcome = this.outcomes?.find((o) => o.token?.id === token.id);
      if (outcome && outcome.positionTransition) {
        return outcome.positionTransition; // Use preserved original position data
      }
    }

    return this._positionTransitions.get(token.id) || null;
  }

  /**
   * Prepares position display data for template rendering
   * @param {PositionTransition|null} positionTransition - Position transition data
   * @param {Token} observerToken - The observer token
   * @param {Object} outcome - The sneak outcome data
   * @returns {Object|null} Position display data
   * @private
   */
  _preparePositionDisplay(positionTransition, observerToken, outcome) {
    // For end-of-turn dialogs, use preserved original position display data but recalculate qualifications
    if (this.isEndOfTurnDialog && outcome && outcome.positionDisplay) {
      const preservedDisplay = { ...outcome.positionDisplay };

      // Recalculate position qualifications with current live data
      if (preservedDisplay.startPosition) {
        preservedDisplay.startPosition = {
          ...preservedDisplay.startPosition,
          qualifies: this._startPositionQualifiesForSneak(observerToken, outcome),
        };
      }

      if (preservedDisplay.endPosition) {
        preservedDisplay.endPosition = {
          ...preservedDisplay.endPosition,
          qualifies: this._endPositionQualifiesForSneak(observerToken, outcome),
        };
      }

      return preservedDisplay;
    }

    if (!positionTransition) {
      // Return fallback position display when no position data is available
      return {
        hasChanged: false,
        transitionType: 'unknown',
        transitionClass: 'position-unknown',
        transitionIcon: 'fas fa-question',

        // Start position display (fallback)
        startPosition: {
          visibility: 'unknown',
          visibilityLabel: 'Unknown',
          visibilityIcon: 'fas fa-question-circle',
          visibilityClass: 'visibility-unknown',
          cover: 'unknown',
          coverLabel: 'Unknown',
          coverIcon: 'fas fa-question-circle',
          coverClass: 'cover-unknown',
          stealthBonus: 0,
          distance: 0,
          lighting: 'unknown',
          lightingLabel: 'Unknown',
          lightingIcon: 'fas fa-question-circle',
          qualifies: false, // Default to false when no data
        },

        // End position display (fallback)
        endPosition: {
          visibility: 'unknown',
          visibilityLabel: 'Unknown',
          visibilityIcon: 'fas fa-question-circle',
          visibilityClass: 'visibility-unknown',
          cover: 'unknown',
          coverLabel: 'Unknown',
          coverIcon: 'fas fa-question-circle',
          coverClass: 'cover-unknown',
          stealthBonus: 0,
          distance: 0,
          lighting: 'unknown',
          lightingLabel: 'Unknown',
          lightingIcon: 'fas fa-question-circle',
          qualifies: false, // Default to false when no data
        },

        // Change indicators (all false for fallback)
        changes: {
          visibility: false,
          cover: false,
          stealthBonus: 0,
          distance: 0,
          lighting: false,
        },
      };
    }

    const startPos = positionTransition.startPosition;
    const endPos = positionTransition.endPosition;

    const result = {
      hasChanged: positionTransition.hasChanged,
      transitionType: positionTransition.transitionType,
      transitionClass: this._getTransitionClass(positionTransition.transitionType),
      transitionIcon: this._getTransitionIcon(positionTransition.transitionType),

      // Start position display
      startPosition: {
        visibility: startPos.effectiveVisibility,
        visibilityLabel: this._getVisibilityLabel(startPos.effectiveVisibility),
        visibilityIcon: this._getVisibilityIcon(startPos.effectiveVisibility),
        visibilityClass: this._getVisibilityClass(startPos.effectiveVisibility),
        cover: startPos.coverState,
        coverLabel: this._getCoverLabel(startPos.coverState),
        coverIcon: this._getCoverIcon(startPos.coverState),
        coverClass: this._getCoverClass(startPos.coverState),
        stealthBonus: startPos.stealthBonus,
        distance: Math.round(startPos.distance),
        lighting: startPos.lightingConditions,
        lightingLabel: this._getLightingLabel(startPos.lightingConditions),
        lightingIcon: this._getLightingIcon(startPos.lightingConditions),
        qualifies: (() => {
          // If token is deferred, always show start position as qualifying
          const isCurrentlyDeferred =
            this._deferredChecks?.has(observerToken.id) ||
            turnSneakTracker?.isObserverDeferred?.(this.sneakingToken, observerToken);
          if (isCurrentlyDeferred) return true;

          if (outcome?._featPositionOverride) return !!outcome._featPositionOverride.startQualifies;
          return this._startPositionQualifiesForSneak(observerToken, outcome);
        })(),
      },

      // End position display
      endPosition: {
        visibility: endPos.effectiveVisibility,
        visibilityLabel: this._getVisibilityLabel(endPos.effectiveVisibility),
        visibilityIcon: this._getVisibilityIcon(endPos.effectiveVisibility),
        visibilityClass: this._getVisibilityClass(endPos.effectiveVisibility),
        cover: endPos.coverState,
        coverLabel: this._getCoverLabel(endPos.coverState),
        coverIcon: this._getCoverIcon(endPos.coverState),
        coverClass: this._getCoverClass(endPos.coverState),
        stealthBonus: endPos.stealthBonus,
        distance: Math.round(endPos.distance),
        lighting: endPos.lightingConditions,
        lightingLabel: this._getLightingLabel(endPos.lightingConditions),
        lightingIcon: this._getLightingIcon(endPos.lightingConditions),
        qualifies: (() => {
          if (outcome?._featPositionOverride) return !!outcome._featPositionOverride.endQualifies;
          return this._endPositionQualifiesForSneak(observerToken, outcome);
        })(),
      },

      // Change indicators
      changes: {
        visibility: positionTransition.avsVisibilityChanged,
        cover: positionTransition.coverStateChanged,
        stealthBonus: positionTransition.stealthBonusChange,
        distance: Math.round(endPos.distance - startPos.distance),
        lighting: startPos.lightingConditions !== endPos.lightingConditions,
      },
    };

    return result;
  }

  /**
   * Assesses the quality of a position for stealth purposes
   * @param {PositionState} position - Position state to assess
   * @returns {string} Quality assessment ('excellent', 'good', 'fair', 'poor')
   * @private
   */
  _assessPositionQuality(position) {
    if (!position) return 'unknown';

    let score = 0;

    // Visibility contribution
    switch (position.avsVisibility) {
      case 'undetected':
        score += 4;
        break;
      case 'hidden':
        score += 3;
        break;
      case 'concealed':
        score += 2;
        break;
      case 'observed':
        score += 0;
        break;
    }

    // Cover contribution
    switch (position.coverState) {
      case 'greater':
        score += 3;
        break;
      case 'standard':
        score += 2;
        break;
      case 'lesser':
        score += 1;
        break;
      case 'none':
        score += 0;
        break;
    }

    // Lighting contribution
    switch (position.lightingConditions) {
      case 'darkness':
        score += 2;
        break;
      case 'dim':
        score += 1;
        break;
      case 'bright':
        score += 0;
        break;
    }

    // Distance contribution (farther is generally better for stealth)
    if (position.distance > 60) score += 2;
    else if (position.distance > 30) score += 1;

    // Convert score to quality rating
    if (score >= 8) return 'excellent';
    if (score >= 6) return 'good';
    if (score >= 4) return 'fair';
    if (score >= 2) return 'poor';
    return 'terrible';
  }

  /**
   * Sorts outcomes by qualification status - qualifying positions appear first
   * @param {Array} outcomes - Array of processed outcomes
   * @returns {Array} Sorted array with qualifying positions first
   * @private
   */
  _sortOutcomesByQualification(outcomes) {
    if (!outcomes || !Array.isArray(outcomes)) {
      return outcomes || [];
    }

    return outcomes.sort((a, b) => {
      // Extract qualification data for comparison
      const aQualifies = this._outcomeQualifies(a);
      const bQualifies = this._outcomeQualifies(b);

      // Qualifying outcomes first (true < false in descending order)
      if (aQualifies !== bQualifies) {
        return bQualifies - aQualifies; // true (1) - false (0) = 1, false (0) - true (1) = -1
      }

      // If both have same qualification status, maintain original order
      return 0;
    });
  }

  /**
   * Determines if an outcome represents a qualifying sneak attempt
   * @param {Object} outcome - Processed outcome object
   * @returns {boolean} True if the outcome qualifies for sneak
   * @private
   */
  _outcomeQualifies(outcome) {
    if (!outcome || !outcome.positionDisplay) return false;

    // Check if this outcome has qualifying start and end positions
    const hasValidStart =
      outcome.positionDisplay.startPosition && outcome.positionDisplay.startPosition.qualifies;
    const hasValidEnd =
      outcome.positionDisplay.endPosition && outcome.positionDisplay.endPosition.qualifies;

    return hasValidStart && hasValidEnd;
  }

  // ===== Enhanced Visual Feedback Helper Functions =====

  /**
   * Generic helper for getting display properties based on type and value
   * @param {string} type - Type of property ('visibility', 'cover', 'lighting', 'transition')
   * @param {string} value - The value to get properties for
   * @param {string} property - Property to get ('label', 'icon', 'class')
   * @returns {string} The requested property value
   * @private
   */
  _getDisplayProperty(type, value, property) {
    const configs = {
      visibility: {
        observed: { label: 'Observed', icon: 'fas fa-eye', class: 'visibility-observed' },
        concealed: { label: 'Concealed', icon: 'fas fa-eye-slash', class: 'visibility-concealed' },
        hidden: { label: 'Hidden', icon: 'fas fa-user-secret', class: 'visibility-hidden' },
        undetected: { label: 'Undetected', icon: 'fas fa-ghost', class: 'visibility-undetected' },
      },
      cover: {
        none: { label: 'No Cover', icon: 'fas fa-shield-slash', class: 'cover-none' },
        lesser: { label: 'Lesser Cover', icon: 'fas fa-shield-alt', class: 'cover-lesser' },
        standard: { label: 'Standard Cover', icon: 'fas fa-shield-alt', class: 'cover-standard' },
        greater: { label: 'Greater Cover', icon: 'fas fa-shield', class: 'cover-greater' },
      },
      lighting: {
        bright: { label: 'Bright Light', icon: 'fas fa-sun', class: 'lighting-bright' },
        dim: { label: 'Dim Light', icon: 'fas fa-adjust', class: 'lighting-dim' },
        darkness: { label: 'Darkness', icon: 'fas fa-moon', class: 'lighting-darkness' },
      },
      transition: {
        improved: { label: 'Improved', icon: 'fas fa-arrow-up', class: 'position-improved' },
        worsened: { label: 'Worsened', icon: 'fas fa-arrow-down', class: 'position-worsened' },
        unchanged: { label: 'Unchanged', icon: 'fas fa-equals', class: 'position-unchanged' },
      },
    };

    const config = configs[type]?.[value];
    if (!config) {
      return property === 'label'
        ? value || 'Unknown'
        : property === 'icon'
          ? 'fas fa-question-circle'
          : `${type}-unknown`;
    }
    return config[property];
  }

  _getVisibilityLabel(visibility) {
    return this._getDisplayProperty('visibility', visibility, 'label');
  }
  _getVisibilityIcon(visibility) {
    return this._getDisplayProperty('visibility', visibility, 'icon');
  }
  _getVisibilityClass(visibility) {
    return this._getDisplayProperty('visibility', visibility, 'class');
  }
  _getCoverLabel(cover) {
    return this._getDisplayProperty('cover', cover, 'label');
  }
  _getCoverIcon(cover) {
    return this._getDisplayProperty('cover', cover, 'icon');
  }
  _getCoverClass(cover) {
    return this._getDisplayProperty('cover', cover, 'class');
  }
  _getLightingLabel(lighting) {
    return this._getDisplayProperty('lighting', lighting, 'label');
  }
  _getLightingIcon(lighting) {
    return this._getDisplayProperty('lighting', lighting, 'icon');
  }
  _getTransitionClass(transitionType) {
    return this._getDisplayProperty('transition', transitionType, 'class');
  }
  _getTransitionIcon(transitionType) {
    return this._getDisplayProperty('transition', transitionType, 'icon');
  }

  /**
   * Determines if an outcome is eligible for Sneaky feat deferral
   * Requirements: start position must qualify, sneak succeeded, but end position doesn't qualify
   * @param {Object} outcome - The sneak outcome data
   * @param {Object} positionDisplay - The position display data containing qualification info
   * @param {boolean} hasSneakyFeat - Whether the sneaking token has the Sneaky feat
   * @param {boolean} wasPreviouslyDeferred - Whether this token was already deferred this turn
   * @returns {boolean} True if outcome is eligible for deferral
   * @private
   */
  _isEligibleForSneakyDefer(outcome, positionDisplay, hasSneakyFeat, wasPreviouslyDeferred) {
    if (!hasSneakyFeat || this.isEndOfTurnDialog) {
      return false;
    }

    const sneakSucceeded = outcome.outcome === 'success' || outcome.outcome === 'critical-success';
    const startPositionQualifies = this._startPositionQualifiesForSneak(outcome.token, outcome);
    const endPositionFails = positionDisplay?.endPosition?.qualifies === false;

    // Allow defer eligibility even for previously deferred tokens if conditions are met
    // This enables re-deferring when user manually changes position requirements
    return startPositionQualifies && sneakSucceeded && endPositionFails;
  }

  /**
   * Determines if start position qualifies for sneaking
   * Start position: Check if sneaker is hidden from the observer AT THE START POSITION
   * @param {Object} observerToken - The token observing the sneaker
   * @param {Object} outcome - The sneak outcome data containing roll information
   * @returns {boolean} True if start position qualifies for sneak
   * @private
   */
  _startPositionQualifiesForSneak(observerToken, outcome) {
    if (!observerToken || !this.sneakingToken) return false;

    try {
      // Priority -2: For deferred checks, use the preserved original qualification (highest priority)
      if (outcome?._featPositionOverride) {
        return !!outcome._featPositionOverride.startQualifies;
      }

      // Priority -1: Check manual position display qualification for non-deferred tokens
      const positionDisplay = outcome?.positionDisplay?.startPosition;
      if (positionDisplay && typeof positionDisplay.qualifies === 'boolean') {
        return positionDisplay.qualifies;
      }

      // Priority 0: AVS override flag (observer -> sneaking token)
      const observerId = observerToken.document?.id || observerToken.id;
      const overrideFlag = this.sneakingToken?.document?.getFlag?.(
        MODULE_ID,
        `avs-override-from-${observerId}`,
      );
      if (overrideFlag && overrideFlag.state) {
        const s = overrideFlag.state;

        if (s === 'hidden' || s === 'undetected') return true;
        // concealed/observed do not satisfy start prerequisite
      }

      // Priority 1: Use stored start states from when sneak was initiated
      const startState = this.startStates[observerId];

      if (startState && startState.visibility) {
        const startVisibility = startState.visibility;

        return startVisibility === 'hidden' || startVisibility === 'undetected';
      }

      // Priority 2: Use position transition data
      const positionTransition = this._getPositionTransitionForToken(observerToken);
      if (positionTransition && positionTransition.startPosition) {
        const startVisibility = positionTransition.startPosition.avsVisibility;

        return startVisibility === 'hidden' || startVisibility === 'undetected';
      }

      // Priority 3: Use outcome start state data
      if (outcome && (outcome.startVisibility || outcome.startState)) {
        const startVisibility = outcome.startVisibility || outcome.startState?.visibility;

        return startVisibility === 'hidden' || startVisibility === 'undetected';
      }

      // Final fallback to current visibility check
      // Use the observer -> sneaking token perspective
      const visibility = getVisibilityBetween(observerToken, this.sneakingToken);

      return visibility === 'hidden' || visibility === 'undetected';
    } catch (error) {
      // Error checking start position qualification
      return false;
    }
  }

  /**
   * Determines if end position qualifies for sneaking
   * End position: Check if sneaker has cover (auto/manual) or is concealed AT THE END POSITION
   * @param {Object} observerToken - The token observing the sneaker
   * @param {Object} outcome - The sneak outcome data containing roll information
   * @returns {boolean} True if end position qualifies for sneak
   * @private
   */
  _endPositionQualifiesForSneak(observerToken, outcome) {
    if (!observerToken || !this.sneakingToken) return false;

    try {
      // Check if this specific observer's end position check has been deferred for Sneaky feats
      if (turnSneakTracker?.isObserverDeferred?.(this.sneakingToken, observerToken)) {
        // End position check is deferred for this specific observer - return true for UI
        return true;
      }
    } catch (error) {
      // Error checking deferred sneak state - continue silently
    }

    try {
      // For end-of-turn dialogs, skip preserved position data and go directly to live checks
      if (this.isEndOfTurnDialog) {
        // Skip all cached data sources and jump directly to live position checks
        // This ensures we use the token's current position, not the original sneak position
      } else {
        // Priority -2: For deferred checks, use the preserved original qualification (highest priority)
        if (outcome?._featPositionOverride) {
          return !!outcome._featPositionOverride.endQualifies;
        }

        // Priority -1: Check manual position display qualification for non-deferred tokens
        const positionDisplay = outcome?.positionDisplay?.endPosition;
        if (positionDisplay && typeof positionDisplay.qualifies === 'boolean') {
          return positionDisplay.qualifies;
        }

        // Priority 0: AVS override flag (observer -> sneaking token)
        const observerId = observerToken.document?.id || observerToken.id;
        const overrideFlag = this.sneakingToken?.document?.getFlag?.(
          MODULE_ID,
          `avs-override-from-${observerId}`,
        );
        if (overrideFlag) {
          // Qualify if override provides standard/greater cover or concealment
          if (overrideFlag.hasCover || ['standard', 'greater'].includes(overrideFlag.expectedCover))
            return true;
          if (overrideFlag.state === 'concealed') return true;
          // hidden/undetected do not satisfy end prerequisite
        }
      }

      // For regular (non-end-of-turn) dialogs, use cached position data
      if (!this.isEndOfTurnDialog) {
        // Get the position transition data for this observer (only for regular dialogs)
        const positionTransition = this._getPositionTransitionForToken(observerToken);

        // Priority: Use fresh outcome data if available (from _captureCurrentEndPositions).
        // Treat these as positive signals only; do not early-return false so we can still run
        // a real-time visibility check (fixes cases like dim light where cached fields lag).
        if (outcome && (outcome.endCover || outcome.endVisibility)) {
          // Qualify if end cover indicates standard or greater
          if (outcome.endCover && ['standard', 'greater'].includes(outcome.endCover)) return true;
          // Qualify if outcome reports concealed at end
          if (outcome.endVisibility === 'concealed') return true;
          // Otherwise, continue to check positionTransition and live visibility below
        }

        if (positionTransition && positionTransition.endPosition) {
          // Use the actual end position data
          const endPosition = positionTransition.endPosition;

          // Qualify if standard/greater cover at end
          if (endPosition.coverState && ['standard', 'greater'].includes(endPosition.coverState)) {
            return true;
          }

          // Qualify if concealed at end (not hidden/undetected)
          const endVisibility = endPosition.avsVisibility;
          if (endVisibility === 'concealed') {
            return true;
          }
          // Additionally, if we calculated a live end visibility and it's concealed, qualify
          if (outcome?.liveEndVisibility === 'concealed') {
            return true;
          }
          // Otherwise, fall through to live visibility check below
        }
      }
      // For end-of-turn dialogs, skip all cached data and go directly to live checks below

      // Final fallback to current position check if no position or outcome data available
      // Prefer live auto-cover detection; if unavailable, fall back to stored map
      let coverState = null;
      try {
        if (autoCoverSystem?.isEnabled?.()) {
          coverState =
            autoCoverSystem.detectCoverBetweenTokens(observerToken, this.sneakingToken) || 'none';
        }
      } catch { }
      if (!coverState) {
        try {
          coverState = getCoverBetween(observerToken, this.sneakingToken);
        } catch {
          coverState = 'none';
        }
      }

      if (coverState === 'standard' || coverState === 'greater') return true;

      // Live check last: qualify if currently concealed from this observer
      // (dim light and similar lighting effects are captured here)
      const visibility = getVisibilityBetween(observerToken, this.sneakingToken);

      const qualifies = visibility === 'concealed';
      return qualifies;
    } catch (error) {
      // Error checking end position qualification
      return false;
    }
  }

  static async _onTogglePositionDisplay(event, button) {
    const app = currentSneakDialog;
    if (!app) return;

    // Cycle through display modes: basic -> enhanced -> detailed -> basic
    const modes = ['basic', 'enhanced', 'detailed'];
    const currentIndex = modes.indexOf(app._positionDisplayMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    app._positionDisplayMode = modes[nextIndex];

    // Update button text to show current mode
    if (button) {
      button.textContent = `Position: ${app._positionDisplayMode}`;
    }

    // Re-render dialog with new display mode
    app.render({ force: true });
  }

  getChangesCounterClass() {
    return 'sneak-preview-dialog-changes-count';
  }

  /**
   * Handles toggling position requirements (start or end)
   * @param {Event} event - Click event
   * @param {HTMLElement} target - Button element
   * @param {string} positionType - Either 'start' or 'end'
   */
  static async _onTogglePosition(event, target, positionType) {
    const app = currentSneakDialog;
    if (!app) return;

    const tokenId = target.dataset.tokenId;
    if (!tokenId) return;

    const outcome = app.outcomes.find((o) => o.token.id === tokenId);
    if (!outcome || !outcome.hasPositionData) return;

    const position =
      positionType === 'start'
        ? outcome.positionDisplay.startPosition
        : outcome.positionDisplay.endPosition;

    // Toggle the qualification status
    const currentQualifies = position.qualifies;
    position.qualifies = !currentQualifies;

    // Clear any deferred position overrides when manually toggling position
    // Manual action should take precedence over stored defer state, but only for non-deferred tokens
    const isCurrentlyDeferred =
      app._deferredChecks?.has(outcome.token.id) ||
      turnSneakTracker?.isObserverDeferred?.(app.sneakingToken, outcome.token);

    if (outcome._featPositionOverride && !isCurrentlyDeferred) {
      delete outcome._featPositionOverride;
    }

    // Update button visual state
    const icon = target.querySelector('i');
    if (position.qualifies) {
      target.className = 'position-requirement-btn position-check active';
      icon.className = 'fas fa-check';
      target.setAttribute('data-tooltip', `${positionType} position qualifies for sneak`);
    } else {
      target.className = 'position-requirement-btn position-x';
      icon.className = 'fas fa-times';
      target.setAttribute('data-tooltip', `${positionType} position does not qualify for sneak`);
    }

    // Recalculate newVisibility based on updated position qualifications
    await app._recalculateNewVisibilityForOutcome(outcome);

    // Recalculate defer eligibility for both start and end position changes
    // (defer eligibility depends on both start qualifying AND end not qualifying)
    app._recalculateDeferEligibility(outcome);

    // Auto-undefer if this is a deferred token and end position now qualifies
    if (positionType === 'end' && position.qualifies && isCurrentlyDeferred) {
      try {
        // Remove from local deferred set
        if (app._deferredChecks.has(outcome.token.id)) {
          app._deferredChecks.delete(outcome.token.id);
        }

        // Remove from turn tracker
        turnSneakTracker.removeDeferredCheck(app.sneakingToken, outcome.token);

        // Update UI elements
        const row = target.closest('tr');
        const deferButton = row.querySelector('[data-action="toggleDefer"]');
        if (deferButton) {
          deferButton.classList.remove('deferred', 'active');
          deferButton.querySelector('i').className = 'fas fa-hourglass';
          deferButton.title = 'Defer this check';
          deferButton.disabled = false;
        }

        // Update row styling
        row.classList.remove('row-deferred', 'deferred-row');
        row.removeAttribute('data-deferred');

        // Update outcome state
        outcome.isDeferred = false;

        // Update bulk defer button availability
        app._updateBulkDeferButton();

        notify.success(
          `${outcome.token.name} automatically undeferred - end position now qualifies for sneak`,
        );
      } catch (error) {
        // Failed to auto-undefer token - show fallback notification
        notify.info(
          `${outcome.token.name} ${positionType} position ${position.qualifies ? 'now qualifies' : 'no longer qualifies'} for sneak`,
        );
      }
    } else {
      // Normal notification for non-auto-undefer cases
      notify.info(
        `${outcome.token.name} ${positionType} position ${position.qualifies ? 'now qualifies' : 'no longer qualifies'} for sneak`,
      );
    }
  }

  /**
   * Handles toggling start position requirements
   * @param {Event} event - Click event
   * @param {HTMLElement} target - Button element
   */
  static async _onToggleStartPosition(event, target) {
    return SneakPreviewDialog._onTogglePosition(event, target, 'start');
  }

  /**
   * Handles toggling end position requirements
   * @param {Event} event - Click event
   * @param {HTMLElement} target - Button element
   */
  static async _onToggleEndPosition(event, target) {
    return SneakPreviewDialog._onTogglePosition(event, target, 'end');
  }

  /**
   * Recalculates newVisibility for an outcome based on current position qualifications
   * @param {Object} outcome - The outcome object to recalculate
   */
  async _recalculateNewVisibilityForOutcome(outcome) {
    if (!outcome) return;

    // Check if we have position data either from the outcome or can get it from position transitions
    const positionTransition =
      outcome.positionTransition || this._getPositionTransitionForToken(outcome.token);
    if (!positionTransition) {
      return;
    }

    // Get position qualifications - either from prepared display or calculate from position transition
    let startQualifies, endQualifies;
    if (outcome.positionDisplay?.startPosition && outcome.positionDisplay?.endPosition) {
      startQualifies = outcome.positionDisplay.startPosition.qualifies;
      endQualifies = outcome.positionDisplay.endPosition.qualifies;
    } else {
      // Calculate qualifications from position transition data
      const { default: EnhancedSneakOutcome } = await import(
        '../services/actions/enhanced-sneak-outcome.js'
      );
      startQualifies = EnhancedSneakOutcome.doesPositionQualifyForSneak(
        positionTransition.startPosition?.avsVisibility,
        true,
      );
      endQualifies = EnhancedSneakOutcome.doesPositionQualifyForSneak(
        positionTransition.endPosition?.avsVisibility,
        false,
        positionTransition.endPosition?.coverState,
      );
    }

    const currentVisibility = outcome.oldVisibility || outcome.currentVisibility;
    const rollOutcome = outcome.outcome;

    let newVisibility;

    // Apply the position qualification logic
    if (!startQualifies || !endQualifies) {
      // If start OR end position doesn't qualify for sneak -> observed (sneak fails)
      newVisibility = 'observed';
    } else {
      // If both positions qualify -> use standard calculation from action-state-config.js
      const { getDefaultNewStateFor } = await import('../services/data/action-state-config.js');
      const calculatedVisibility = getDefaultNewStateFor('sneak', currentVisibility, rollOutcome);
      newVisibility = calculatedVisibility || currentVisibility;
    }

    // Update the outcome
    outcome.newVisibility = newVisibility;

    // Auto-undefer if the sneak fails (failure or critical failure outcome)
    if (
      (rollOutcome === 'failure' || rollOutcome === 'critical-failure') &&
      outcome.isDeferred &&
      this._deferredChecks?.has(outcome.token.id)
    ) {
      try {
        // Remove from local deferred set
        this._deferredChecks.delete(outcome.token.id);

        // Remove from turn tracker
        turnSneakTracker.removeDeferredCheck(this.sneakingToken, outcome.token);

        // Update outcome state
        outcome.isDeferred = false;

        // Update UI elements
        this._updateDeferButtonForToken(outcome.token.id, false);

        if (typeof ui !== 'undefined' && ui.notifications) {
          ui.notifications.info(
            `${outcome.token.name} automatically undeferred - sneak check failed`,
          );
        }
      } catch (error) {
        // Failed to auto-undefer on failed sneak - continue silently
      }
    }

    // Clear any override state since we're recalculating based on position qualifications
    outcome.overrideState = null;

    // Update the UI to reflect the change
    await this._updateOutcomeDisplayForToken(outcome.token.id, outcome);
  }

  /**
   * Recalculates defer eligibility for an outcome based on current position qualifications
   * @param {Object} outcome - The outcome object to recalculate defer eligibility for
   */
  _recalculateDeferEligibility(outcome) {
    if (!outcome) return;

    // Get current defer eligibility requirements
    const hasSneakyFeat = turnSneakTracker.hasSneakyFeat(this.sneakingToken);
    const wasPreviouslyDeferred =
      turnSneakTracker?.isObserverDeferred?.(this.sneakingToken, outcome.token) || false;

    // Check Sneaky feat eligibility: start position must qualify and (sneak succeeded but end position doesn't qualify)
    const canDefer = this._isEligibleForSneakyDefer(
      outcome,
      outcome.positionDisplay,
      hasSneakyFeat,
      wasPreviouslyDeferred,
    );

    // Update the outcome
    outcome.canDefer = canDefer;

    // Update defer button visibility in the UI
    this._updateDeferButtonForToken(outcome.token.id, canDefer);
  }

  /**
   * Updates the defer button visibility for a specific token
   * @param {string} tokenId - Token ID
   * @param {boolean} canDefer - Whether the token can be deferred
   */
  _updateDeferButtonForToken(tokenId, canDefer) {
    // Skip if dialog is not rendered (e.g., in tests)
    if (!this.element) return;

    const row = this.element.querySelector(`tr[data-token-id="${tokenId}"]`);
    if (!row) return;

    // Find the defer button - it should always exist now (but possibly hidden)
    const deferButton = row.querySelector('[data-action="toggleDefer"]');
    if (deferButton) {
      if (canDefer) {
        deferButton.classList.remove('hidden');
        deferButton.disabled = false;
      } else {
        deferButton.classList.add('hidden');
        deferButton.disabled = true;
      }
    }

    // Update bulk defer button availability
    this._updateBulkDeferButton();
  }

  /**
   * Updates the outcome display for a specific token
   * @param {string} tokenId - Token ID
   * @param {Object} outcome - Updated outcome object
   */
  async _updateOutcomeDisplayForToken(tokenId, outcome) {
    const row = document.querySelector(`tr[data-token-id="${tokenId}"]`);
    if (!row) {
      return;
    }

    // Update outcome display
    const outcomeCell = row.querySelector('.outcome');
    if (outcomeCell) {
      const outcomeText = outcomeCell.querySelector('.outcome-text');
      if (outcomeText) {
        const outcomeLabel = this.getOutcomeLabel(outcome.outcome);
        outcomeText.textContent = outcomeLabel;
      }
    }

    // Update outcome CSS class
    if (outcomeCell) {
      outcomeCell.className = `outcome ${this.getOutcomeClass(outcome.outcome)}`;

      // Also update the outcome-primary element class
      const outcomePrimary = outcomeCell.querySelector('.outcome-primary');
      if (outcomePrimary) {
        outcomePrimary.className = `outcome-primary sneak-result-${this.getOutcomeClass(outcome.outcome)}`;
      }
    }

    // Update visibility state indicators
    this._updateVisibilityStateIndicators(row, outcome.newVisibility);

    // Update actionable change status - compare against both old visibility AND initial AVS outcome
    const effectiveNewState = outcome.overrideState || outcome.newVisibility;
    const hasChangeFromOldVisibility = effectiveNewState !== outcome.oldVisibility;

    // Show apply buttons only if the effective new state differs from old visibility
    // Manual override takes precedence - if user overrode to match old visibility, no change needed
    outcome.hasActionableChange = hasChangeFromOldVisibility;

    // Show revert buttons if there are changes that can be reverted
    // This includes both unapplied changes and applied changes
    const hasRevertableChange =
      hasChangeFromOldVisibility ||
      (outcome.oldVisibility !== outcome.currentVisibility &&
        outcome.oldVisibility !== outcome.newVisibility);
    outcome.hasRevertableChange = hasRevertableChange;

    this.updateActionButtonsForToken(tokenId, outcome.hasActionableChange);

    // Update apply button state and visibility
    let applyButton = row.querySelector('.apply-change');
    let revertButton = row.querySelector('.revert-change');

    // Create apply button if it doesn't exist and we need it
    if (!applyButton && outcome.hasActionableChange) {
      const actionsCell = row.querySelector('.actions');
      if (actionsCell) {
        // Remove "No Change" span if it exists
        const noActionSpan = actionsCell.querySelector('.no-action');
        if (noActionSpan) {
          noActionSpan.remove();
        }

        // Create apply button
        applyButton = document.createElement('button');
        applyButton.type = 'button';
        applyButton.className = 'row-action-btn apply-change';
        applyButton.setAttribute('data-action', 'applyChange');
        applyButton.setAttribute('data-token-id', tokenId);
        applyButton.setAttribute('data-tooltip', 'Apply this visibility change');
        applyButton.innerHTML = '<i class="fas fa-check"></i>';
        actionsCell.appendChild(applyButton);
      }
    }

    // Create revert button if it doesn't exist and we need it
    if (!revertButton && outcome.hasRevertableChange) {
      const actionsCell = row.querySelector('.actions');
      if (actionsCell) {
        // Remove "No Change" span if it exists
        const noActionSpan = actionsCell.querySelector('.no-action');
        if (noActionSpan) {
          noActionSpan.remove();
        }

        // Create revert button
        revertButton = document.createElement('button');
        revertButton.type = 'button';
        revertButton.className = 'row-action-btn revert-change';
        revertButton.setAttribute('data-action', 'revertChange');
        revertButton.setAttribute('data-token-id', tokenId);
        revertButton.setAttribute('data-tooltip', 'Revert to original visibility');
        revertButton.innerHTML = '<i class="fas fa-undo"></i>';
        actionsCell.appendChild(revertButton);
      }
    }

    if (applyButton) {
      applyButton.disabled = !outcome.hasActionableChange;
      applyButton.style.display = outcome.hasActionableChange ? 'inline-flex' : 'none';
    }

    if (revertButton) {
      revertButton.disabled = !outcome.hasRevertableChange;
      revertButton.style.display = outcome.hasRevertableChange ? 'inline-flex' : 'none';
    }

    // If no actionable change, show "No Change" span
    if (!outcome.hasActionableChange) {
      const actionsCell = row.querySelector('.actions');
      if (actionsCell && !actionsCell.querySelector('.no-action')) {
        const noActionSpan = document.createElement('span');
        noActionSpan.className = 'no-action';
        noActionSpan.textContent = 'No Change';
        actionsCell.appendChild(noActionSpan);
      }
    }
  }

  /**
   * Handles setting cover bonus for individual tokens
   * @param {Event} event - Click event
   * @param {HTMLElement} target - Button element
   */
  static async _onSetCoverBonus(event, target) {
    const app = currentSneakDialog;
    if (!app) return;

    const tokenId = target.dataset.tokenId;
    const bonus = parseInt(target.dataset.bonus, 10);
    if (!tokenId || isNaN(bonus)) return;

    const outcome = app.outcomes.find((o) => o.token.id === tokenId);
    if (!outcome) return;

    // Update the outcome's applied cover bonus
    outcome.appliedCoverBonus = bonus;

    // Update button visual states in this row
    const row = target.closest('tr');
    const coverButtons = row.querySelectorAll('.cover-bonus-btn');
    coverButtons.forEach((btn) => btn.classList.remove('active'));
    target.classList.add('active');

    // Update the roll total display
    const rollTotalElement = row.querySelector('.roll-total');
    const baseTotal =
      parseInt(rollTotalElement.dataset.baseTotal, 10) ||
      outcome.baseRollTotal ||
      outcome.rollTotal;
    const newTotal = baseTotal + bonus;

    // Store the base total if not already stored
    if (!rollTotalElement.dataset.baseTotal) {
      rollTotalElement.dataset.baseTotal = outcome.rollTotal;
    }

    rollTotalElement.textContent = newTotal;
    outcome.rollTotal = newTotal;

    // Recalculate outcome based on new total
    const margin = newTotal - outcome.dc;
    const newOutcome = app._calculateOutcome(margin);

    // Update outcome in the data structure
    outcome.outcome = newOutcome;

    // Update outcome display
    const outcomeCell = row.querySelector('.outcome');
    const outcomeText = outcomeCell.querySelector('.outcome-text');
    if (outcomeText) {
      const outcomeLabel = app.getOutcomeLabel(newOutcome);
      outcomeText.textContent = outcomeLabel;
    }

    // Update outcome CSS class
    if (outcomeCell) {
      outcomeCell.className = `outcome ${app.getOutcomeClass(newOutcome)}`;

      // Also update the outcome-primary element class
      const outcomePrimary = outcomeCell.querySelector('.outcome-primary');
      if (outcomePrimary) {
        outcomePrimary.className = `outcome-primary sneak-result-${app.getOutcomeClass(newOutcome)}`;
      }
    }

    // Recalculate newVisibility based on position qualifications and new outcome
    try {
      if (app && typeof app._recalculateNewVisibilityForOutcome === 'function') {
        await app._recalculateNewVisibilityForOutcome(outcome);
      } else {
        // _recalculateNewVisibilityForOutcome method not available - continue silently
      }
    } catch (error) {
      // Error recalculating newVisibility - continue silently
    }

    // Update visibility state indicators with the recalculated newVisibility
    app._updateVisibilityStateIndicators(row, outcome.newVisibility);

    notify.info(
      `Applied +${bonus} cover bonus to ${outcome.token.name} (Roll: ${newTotal} vs DC ${outcome.dc})`,
    );
  }

  /**
   * Handles undeferring a specific token check
   * @param {Event} event - Click event
   * @param {HTMLElement} target - Button element
   */
  static async _onUndeferCheck(event, target) {
    const app = currentSneakDialog;
    if (!app) {
      // No current sneak dialog found
      ui.notifications.error('No active sneak dialog found');
      return;
    }

    const tokenId = target.dataset.tokenId;
    if (!tokenId) {
      // No token ID found on undefer button
      ui.notifications.error('No token ID found on button');
      return;
    }

    // Find the outcome for this token
    const outcome = app.outcomes.find((o) => o.token?.id === tokenId);
    if (!outcome) {
      // No outcome found for token
      return;
    }

    // Check if token is actually deferred (either locally or in turn tracker)
    const isLocallyDeferred = app._deferredChecks.has(tokenId);
    const isTrackerDeferred = turnSneakTracker.isObserverDeferred(app.sneakingToken, outcome.token);

    if (!isLocallyDeferred && !isTrackerDeferred) {
      // Token not deferred in either location
      return;
    }

    // Remove from both locations
    if (isLocallyDeferred) {
      app._deferredChecks.delete(tokenId);
    }

    // Update the defer button state
    const row = target.closest('tr');
    const deferButton = row.querySelector('[data-action="toggleDefer"]');
    if (deferButton) {
      deferButton.classList.remove('deferred', 'active');
      deferButton.querySelector('i').className = 'fas fa-hourglass-half';
      deferButton.title = 'Defer this check';
    }

    // Update row styling
    row.classList.remove('deferred-row');
    row.removeAttribute('data-deferred');

    // Get original stored outcome before removing from tracker
    let originalStoredOutcome = null;
    try {
      const combatantId = turnSneakTracker._getCombatantId(app.sneakingToken);
      if (combatantId) {
        const turnState = turnSneakTracker._turnSneakStates.get(combatantId);
        if (turnState) {
          const observerId = outcome.token.document?.id || outcome.token.id;
          const deferredData = turnState.deferredChecks.get(observerId);
          if (deferredData && deferredData.originalOutcome) {
            originalStoredOutcome = deferredData.originalOutcome;
          }
        }
      }
    } catch (error) {
      // Failed to retrieve original outcome - continue silently
    }

    // Remove from turn tracker deferred checks
    try {
      turnSneakTracker.removeDeferredCheck(app.sneakingToken, outcome.token);
    } catch (error) {
      // Failed to remove deferred check from tracker - continue silently
    }

    // Update bulk defer button availability
    app._updateBulkDeferButton();

    // Selectively recalculate: preserve start position, recalculate end position only
    try {
      if (originalStoredOutcome) {
        // Use the original start position qualification from when it was deferred
        const preservedStartQualifies = originalStoredOutcome.startQualifies;
        const preservedStartCover = originalStoredOutcome.startCover;
        const preservedStartVisibility = originalStoredOutcome.startVisibility;

        // Recalculate only end position qualification with current position
        const positionTransition = app._getPositionTransitionForToken(outcome.token);
        const endQualifies = positionTransition
          ? app._endPositionQualifiesForSneak(outcome.token, positionTransition.endPosition)
          : false;

        // Update the outcome with preserved start data and recalculated end data
        const outcomeIndex = app.outcomes.findIndex((o) => o.token?.id === tokenId);
        if (outcomeIndex >= 0) {
          app.outcomes[outcomeIndex] = {
            ...app.outcomes[outcomeIndex],
            startQualifies: preservedStartQualifies,
            startCover: preservedStartCover,
            startVisibility: preservedStartVisibility,
            endQualifies: endQualifies,
            isDeferred: false, // No longer deferred
          };
        }
      } else {
        // Fallback: full recalculation if original outcome not found
        app.outcomes = app._enrichOutcomes(app.outcomes);
      }
    } catch (error) {
      // Error during selective recalculation - fallback to full recalculation
      try {
        app.outcomes = app._enrichOutcomes(app.outcomes);
      } catch (fallbackError) {
        // Error during fallback recalculation - continue silently
      }
    }

    // Re-render to update button states and visibility
    try {
      await app.render(false, { force: true });
    } catch (error) {
      // Error during render - continue silently
    }

    notify.info(`Undeferred check for ${outcome.token.name}`);
  }

  /**
   * Handles applying cover bonus to all tokens
   * @param {Event} event - Click event
   * @param {HTMLElement} target - Button element
   */
  static async _onApplyAllCover(event, target) {
    const app = currentSneakDialog;
    if (!app) return;

    const bonus = parseInt(target.dataset.bonus, 10);
    if (isNaN(bonus)) return;

    let appliedCount = 0;

    // Apply to all visible outcomes
    for (const outcome of app.outcomes) {
      if (!outcome.token) continue;

      // Update the applied cover bonus
      outcome.appliedCoverBonus = bonus;

      // Find the row and update buttons
      const row = app.element.querySelector(`tr[data-token-id="${outcome.token.id}"]`);
      if (!row) continue;

      // Update cover bonus buttons
      const coverButtons = row.querySelectorAll('.cover-bonus-btn');
      coverButtons.forEach((btn) => {
        btn.classList.remove('active');
        if (parseInt(btn.dataset.bonus, 10) === bonus) {
          btn.classList.add('active');
        }
      });

      // Update roll total
      const rollTotalElement = row.querySelector('.roll-total');
      const baseTotal =
        parseInt(rollTotalElement.dataset.baseTotal, 10) ||
        outcome.baseRollTotal ||
        outcome.rollTotal;
      const newTotal = baseTotal + bonus;

      if (!rollTotalElement.dataset.baseTotal) {
        rollTotalElement.dataset.baseTotal = outcome.rollTotal;
      }

      rollTotalElement.textContent = newTotal;
      outcome.rollTotal = newTotal;

      // Recalculate outcome
      const margin = newTotal - outcome.dc;
      const newOutcome = app._calculateOutcome(margin);

      // Update outcome display
      const outcomeCell = row.querySelector('.outcome');
      const outcomeText = outcomeCell.querySelector('.outcome-text');
      if (outcomeText) {
        outcomeText.textContent = app.getOutcomeLabel(newOutcome);
      }

      // Update outcome CSS class
      if (outcomeCell) {
        outcomeCell.className = `outcome ${app.getOutcomeClass(newOutcome)}`;

        // Also update the outcome-primary element class
        const outcomePrimary = outcomeCell.querySelector('.outcome-primary');
        if (outcomePrimary) {
          outcomePrimary.className = `outcome-primary sneak-result-${app.getOutcomeClass(newOutcome)}`;
        }
      }

      // Recalculate newVisibility based on position qualifications and new outcome
      try {
        if (app && typeof app._recalculateNewVisibilityForOutcome === 'function') {
          await app._recalculateNewVisibilityForOutcome(outcome);
        } else {
          // _recalculateNewVisibilityForOutcome method not available - continue silently
        }
      } catch (error) {
        // Error recalculating newVisibility - continue silently
      }

      // Update visibility indicators with the recalculated newVisibility
      app._updateVisibilityStateIndicators(row, outcome.newVisibility);

      appliedCount++;
    }

    // Highlight the "Apply All" button that was clicked temporarily
    const applyAllButtons = app.element.querySelectorAll('.apply-all-cover-btn');
    applyAllButtons.forEach((btn) => btn.classList.remove('active'));
    target.classList.add('active');

    // Reset button states after a short delay
    applyAllButtons.forEach((btn) => btn.classList.remove('active'));

    notify.info(`Applied +${bonus} cover bonus to all ${appliedCount} observers`);
  }

  /**
   * Reset all cover bonus button states to default
   * @private
   */
  _resetCoverBonusButtonStates() {
    // Reset individual cover bonus buttons
    const coverButtons = this.element.querySelectorAll('.cover-bonus-btn');
    coverButtons.forEach((btn) => {
      btn.classList.remove('active');
      // Highlight the "no cover bonus" (+0) button by default for individual tokens
      if (btn.dataset.bonus === '0') {
        btn.classList.add('active');
      }
    });

    // Reset apply all cover buttons (no default highlighting)
    const applyAllButtons = this.element.querySelectorAll('.apply-all-cover-btn');
    applyAllButtons.forEach((btn) => btn.classList.remove('active'));
  }

  /**
   * Reset bulk undefer button to initial state (called on render)
   */
  _resetBulkUndeferButton() {
    const bulkUndeferButton = this.element.querySelector('[data-action="bulkUndefer"]');
    if (bulkUndeferButton) {
      // Apply the correct state based on our tracked state
      if (this._bulkUndeferButtonState === 'restore') {
        bulkUndeferButton.classList.add('ready-to-restore');
        bulkUndeferButton.innerHTML = '<i class="fas fa-undo"></i> Restore Defers';
        bulkUndeferButton.setAttribute(
          'data-tooltip',
          'Restore all previously deferred tokens to deferred state',
        );
      } else {
        bulkUndeferButton.classList.remove('ready-to-restore');
        bulkUndeferButton.innerHTML = '<i class="fas fa-clock"></i> Undefer All';
        bulkUndeferButton.setAttribute(
          'data-tooltip',
          'Undefer all currently deferred tokens and restore their original state',
        );
      }

      // Remove pending visual indication from any rows
      const pendingRows = this.element.querySelectorAll('tr.pending-restore');
      pendingRows.forEach((row) => {
        row.classList.remove('pending-restore');
      });
    }
  } /**
   * Set bulk undefer button to "Restore Defers" mode after undefer all is executed
   * @private
   */
  _setBulkUndeferButtonToRestoreMode() {
    this._bulkUndeferButtonState = 'restore';
    const bulkUndeferButton = this.element.querySelector('[data-action="bulkUndefer"]');
    if (bulkUndeferButton) {
      bulkUndeferButton.classList.add('ready-to-restore');
      bulkUndeferButton.innerHTML = '<i class="fas fa-undo"></i> Restore Defers';
      bulkUndeferButton.setAttribute(
        'data-tooltip',
        'Restore all previously deferred tokens to deferred state',
      );
    }
  }

  /**
   * Force reset bulk undefer button to initial state (removes restore mode)
   * @private
   */
  _forceResetBulkUndeferButton() {
    this._bulkUndeferButtonState = 'undefer';
    this._bulkUndeferredOutcomes.clear(); // Clear tracked outcomes when resetting
    const bulkUndeferButton = this.element.querySelector('[data-action="bulkUndefer"]');
    if (bulkUndeferButton) {
      bulkUndeferButton.classList.remove('ready-to-restore');
      bulkUndeferButton.innerHTML = '<i class="fas fa-clock"></i> Undefer All';
      bulkUndeferButton.setAttribute(
        'data-tooltip',
        'Undefer all currently deferred tokens and restore their original state',
      );

      // Remove pending visual indication from any rows
      const pendingRows = this.element.querySelectorAll('tr.pending-restore');
      pendingRows.forEach((row) => {
        row.classList.remove('pending-restore');
      });
    }
  } /**
   * Calculates outcome based on margin
   * @param {number} margin - Roll margin vs DC
   * @returns {string} Outcome type
   */
  _calculateOutcome(margin) {
    if (margin >= 10) return 'critical-success';
    if (margin >= 0) return 'success';
    if (margin <= -10) return 'critical-failure';
    return 'failure';
  }

  /**
   * Clear sneak-active flag from the sneaking token
   * @private
   */
  async _clearSneakActiveFlag() {
    try {
      if (this.sneakingToken) {
        await this.sneakingToken.document.unsetFlag('pf2e-visioner', 'sneak-active');
        try {
          const { SneakSpeedService } = await import('../services/sneak-speed-service.js');
          await SneakSpeedService.restoreSneakWalkSpeed(this.sneakingToken);
        } catch (speedErr) {
          // Failed to restore sneak walk speed - continue silently
        }
      }
    } catch (error) {
      // Failed to clear sneak-active flag - continue silently
    }
  }

  /**
   * Updates visibility state indicators based on outcome
   * @param {HTMLElement} row - Table row element
   * @param {string} outcome - New outcome
   */
  _updateVisibilityStateIndicators(row, visibilityState) {
    const visibilityStates = row.querySelectorAll('.state-icon');

    // Remove selected class from all state icons
    visibilityStates.forEach((state) => state.classList.remove('selected'));

    // Find the state icon with the matching data-state attribute
    const targetElement = row.querySelector(`.state-icon[data-state="${visibilityState}"]`);

    if (targetElement) {
      targetElement.classList.add('selected');
    }
  }

  /**
   * Handle apply change button click
   * @param {Event} event - Click event
   * @param {HTMLElement} target - Button element
   */
  static async _onApplyChange(event, target) {
    const { applyNowSneak } = await import('../services/apply-service.js');
    return BaseActionDialog.onApplyChange(event, target, {
      app: currentSneakDialog,
      applyFunction: applyNowSneak,
      actionType: 'Sneak',
    });
  }

  /**
   * Handle revert change button click for individual row
   * @param {Event} event - Click event
   * @param {HTMLElement} target - Button element
   */
  static async _onRevertChange(event, target) {
    return BaseActionDialog.onRevertChange(event, target, {
      app: currentSneakDialog,
      actionType: 'Sneak',
    });
  }

  /**
   * Handle apply all button click
   * @param {Event} event - Click event
   * @param {HTMLElement} target - Button element
   */
  static async _onApplyAll(event, target) {
    const app = currentSneakDialog;

    // Handle end-of-turn dialogs differently
    if (app && app.isEndOfTurnDialog) {
      return SneakPreviewDialog._onApplyEndOfTurnResults(event, target);
    }

    // Regular sneak dialog apply
    const { applyNowSneak } = await import('../services/apply-service.js');
    return BaseActionDialog.onApplyAll(event, target, {
      app: currentSneakDialog,
      applyFunction: applyNowSneak,
      actionType: 'Sneak',
    });
  }

  /**
   * Handle applying end-of-turn deferred check results
   * @param {Event} event - Click event
   * @param {HTMLElement} target - Button element
   */
  static async _onApplyEndOfTurnResults(event, target) {
    const app = currentSneakDialog;
    if (!app || !app.isEndOfTurnDialog) return;

    try {
      let appliedCount = 0;

      // Process outcomes that need visibility changes
      for (const outcome of app.outcomes) {
        if (outcome.needsApplication && !outcome.positionQualified) {
          // Apply visibility change: set to observed
          try {
            const { getVisibilityMap, setVisibilityMap } = await import(
              '../../stores/visibility-map.js'
            );

            // Set visibility to observed in observer's visibility map
            const observerVisibilityMap = getVisibilityMap(outcome.token);
            observerVisibilityMap[app.sneakingToken.document.id] = 'observed';

            // Update the visibility map
            await setVisibilityMap(outcome.token, observerVisibilityMap);
            appliedCount++;
          } catch (error) {
            // Error applying end-of-turn visibility change - continue silently
          }
        }
      }

      // Trigger visual updates if any changes were made
      if (appliedCount > 0) {
        try {
          const { eventDrivenVisibilitySystem } = await import(
            '../../visibility/auto-visibility/EventDrivenVisibilitySystem.js'
          );
          if (eventDrivenVisibilitySystem?.refreshVisibilityForTokens) {
            await eventDrivenVisibilitySystem.refreshVisibilityForTokens([app.sneakingToken]);
          }
        } catch (error) {
          // Failed to trigger visibility refresh - continue silently
        }

        // Show notification
        if (typeof ui !== 'undefined' && ui.notifications) {
          ui.notifications.info(
            `Applied ${appliedCount} end-of-turn visibility change${appliedCount !== 1 ? 's' : ''} for ${app.sneakingToken.name}`,
          );
        }
      } else {
        // Show notification when no changes were needed
        if (typeof ui !== 'undefined' && ui.notifications) {
          ui.notifications.info(
            `No visibility changes needed - ${app.sneakingToken.name} maintains stealth positions`,
          );
        }
      }

      // Close dialog after applying
      app.close();
    } catch (error) {
      // Error applying end-of-turn results
      if (typeof ui !== 'undefined' && ui.notifications) {
        ui.notifications.error('Failed to apply end-of-turn visibility changes.');
      }
    }
  }

  /**
   * Handle end-of-turn validation processing
   * @param {Event} event - Click event
   * @param {HTMLElement} target - Button element
   */
  static async _onProcessEndTurnValidation(event, target) {
    const app = currentSneakDialog;
    if (!app || app.isEndOfTurnDialog) return;

    // Check if there are deferred outcomes to process
    if (!app._deferredChecks || app._deferredChecks.size === 0) {
      if (typeof ui !== 'undefined' && ui.notifications) {
        ui.notifications.warn('No deferred position checks to validate.');
      }
      return;
    }

    try {
      // Get deferred token IDs
      const deferredTokenIds = Array.from(app._deferredChecks);

      // Find the corresponding outcomes for deferred tokens
      const deferredOutcomes = app.outcomes.filter((outcome) =>
        deferredTokenIds.includes(outcome.token?.id),
      );

      if (deferredOutcomes.length === 0) {
        if (typeof ui !== 'undefined' && ui.notifications) {
          ui.notifications.warn('No deferred outcomes found to validate.');
        }
        return;
      }

      // Create end-of-turn dialog with the deferred outcomes
      const endOfTurnDialog = new SneakPreviewDialog(
        app.sneakingToken,
        deferredOutcomes,
        app.changes,
        app.sneakData,
        {
          isEndOfTurnDialog: true,
          title: `End-of-Turn Position Validation - ${app.sneakingToken.name}`,
          deferredFromDialog: app, // Reference to the original dialog
        },
      );

      // Show the end-of-turn dialog
      endOfTurnDialog.render(true);

      // Notify about the validation
      if (typeof ui !== 'undefined' && ui.notifications) {
        ui.notifications.info(
          `Processing ${deferredOutcomes.length} deferred position check${deferredOutcomes.length !== 1 ? 's' : ''} for end-of-turn validation.`,
        );
      }
    } catch (error) {
      // Error processing end-of-turn validation
      if (typeof ui !== 'undefined' && ui.notifications) {
        ui.notifications.error('Failed to process end-of-turn validation.');
      }
    }
  }

  /**
   * Handle close action - clear sneak flag when dialog is closed
   * @param {Event} event - Click event
   * @param {HTMLElement} target - Clicked element
   */
  static async _onClose() {
    const app = currentSneakDialog;
    if (app) {
      // Clear the sneak-active flag when dialog is closed
      await app._clearSneakActiveFlag();

      app.close();
      currentSneakDialog = null; // Clear reference when closing
    }
  }

  /**
   * Handle revert all button click
   * @param {Event} event - Click event
   * @param {HTMLElement} target - Clicked element
   */
  static async _onRevertAll(event, target) {
    return BaseActionDialog.onRevertAll(event, target, {
      app: currentSneakDialog,
      actionType: 'Sneak',
    });
  }

  static async _onToggleEncounterFilter(event, target) {
    const app = currentSneakDialog;
    if (!app) return;
    app.encounterOnly = target.checked;
    app.bulkActionState = 'initial';
    app.render({ force: true });
  }

  static async _onToggleFilterByDetection(event, target) {
    const app = currentSneakDialog;
    if (!app) return;
    app.filterByDetection = target.checked;
    app.bulkActionState = 'initial';
    app.render({ force: true });
  }

  static async _onToggleShowOnlyChanges(event, target) {
    const app = currentSneakDialog;
    if (!app) return;
    app.showChangesOnly = target.checked;
    app.bulkActionState = 'initial';
    app.render({ force: true });
  }

  async close(options = {}) {
    await this._clearSneakActiveFlag();
    return super.close(options);
  }

  // Override addIconClickHandlers to use AVS-aware logic
  addIconClickHandlers() {
    const stateIcons = this.element.querySelectorAll('.state-icon');
    stateIcons.forEach((icon) => {
      icon.addEventListener('click', (event) => {
        // Only handle clicks within override selection container
        const overrideIcons = event.currentTarget.closest('.override-icons');
        if (!overrideIcons) return;

        // Robustly resolve target id from data attributes or row
        let targetId = event.currentTarget.dataset.target || event.currentTarget.dataset.tokenId;
        if (!targetId) {
          const row = event.currentTarget.closest('tr[data-token-id]');
          targetId = row?.dataset?.tokenId;
        }
        const newState = event.currentTarget.dataset.state;
        overrideIcons
          .querySelectorAll('.state-icon')
          .forEach((i) => i.classList.remove('selected'));
        event.currentTarget.classList.add('selected');
        const hiddenInput = overrideIcons?.querySelector('input[type="hidden"]');
        if (hiddenInput) hiddenInput.value = newState;
        let outcome = this.outcomes?.find?.(
          (o) => String(this.getOutcomeTokenId(o)) === String(targetId),
        );
        if (outcome) {
          outcome.overrideState = newState;
          const oldState = outcome.oldVisibility ?? outcome.currentVisibility ?? null;

          // Use AVS-aware logic instead of the base logic
          const isOldStateAvsControlled = this.isOldStateAvsControlled(outcome);
          const statesMatch = oldState != null && newState != null && newState === oldState;
          const hasActionableChange =
            (oldState != null && newState != null && newState !== oldState) ||
            (statesMatch && isOldStateAvsControlled);

          // Persist actionable state on outcome so templates and bulk ops reflect immediately
          outcome.hasActionableChange = hasActionableChange;
          try {
            this.updateActionButtonsForToken(targetId || null, hasActionableChange, {
              row: event.currentTarget.closest('tr'),
            });
          } catch { }
        }
      });
    });
  }
}
