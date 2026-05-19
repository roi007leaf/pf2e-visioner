import { MODULE_ID } from '../../constants.js';
import { hasActiveEncounter } from '../services/infra/shared-utils.js';
import sneakPositionTracker from '../services/position/PositionTracker.js';
import turnSneakTracker from '../services/TurnSneakTracker.js';
import { BaseActionDialog } from './base-action-dialog.js';
import {
  bulkDeferAllEligible,
  bulkRestoreDefers,
  bulkUndeferAll,
  forceResetBulkUndeferButton,
  resetBulkUndeferButton,
  setBulkUndeferButtonToRestoreMode,
  updateBulkDeferButton,
  updateDeferButtonForToken,
  updateEndTurnValidationButton,
} from './Sneak/sneak-bulk-defer-actions.js';
import {
  applyAllSneakCoverBonus,
  calculateSneakOutcome,
  resetSneakCoverBonusButtonStates,
  setSneakCoverBonus,
} from './Sneak/sneak-cover-bonus-actions.js';
import { addSneakDeferHandlers } from './Sneak/sneak-defer-handlers.js';
import {
  applySneakVisualFilters,
  getSneakDialogFilteredOutcomes,
} from './Sneak/sneak-dialog-filtering.js';
import { prepareSneakDialogContext } from './Sneak/sneak-dialog-context.js';
import {
  applySneakEndTurnResults,
  processSneakEndTurnValidation,
} from './Sneak/sneak-end-turn-actions.js';
import {
  assessSneakPositionQuality,
  getSneakDisplayProperty,
  prepareSneakPositionDisplay,
  sneakOutcomeQualifies,
  sortSneakOutcomesByQualification,
} from './Sneak/sneak-position-display.js';
import {
  endPositionQualifiesForSneak,
  recalculateSneakOutcomeVisibility,
  sneakEndPositionQualifies,
  sneakStartPositionQualifies,
  startPositionQualifiesForSneak,
} from './Sneak/sneak-position-qualification.js';
import {
  prepareSneakOutcomeContexts,
  recalculateSneakPositionOutcomes,
} from './Sneak/sneak-outcome-context.js';
import { toggleSneakPosition } from './Sneak/sneak-position-toggle-actions.js';
import {
  addSneakIconClickHandlers,
  applySneakOverrideState,
  updateSneakIconSelection,
} from './Sneak/sneak-override-state.js';
import {
  updateSneakOutcomeDisplayForToken,
  updateSneakVisibilityStateIndicators,
} from './Sneak/sneak-row-display.js';
import {
  captureCurrentSneakEndPositions,
  extractSneakPositionTransitions,
  getSneakPositionTransitionForToken,
} from './Sneak/sneak-position-transitions.js';
import { undeferSneakCheck } from './Sneak/sneak-undefer-action.js';

export { sneakEndPositionQualifies, sneakStartPositionQualifies };

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
      options?.title || (isEndOfTurnDialog ? game.i18n.localize('PF2E_VISIONER.DIALOG_TITLES.END_OF_TURN_SNEAK') : game.i18n.localize('PF2E_VISIONER.DIALOG_TITLES.SNEAK_RESULTS'));

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
        width: 1000, // Increased width for position display components
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
    return prepareSneakDialogContext(this, context);
  }

  // Use BaseActionDialog outcome helpers
  // Token id in Sneak outcomes is under `token`
  getOutcomeTokenId(outcome) {
    return outcome?.token?.id ?? null;
  }

  /**
   * Override to check ALL sneaker tokens for override flags (not just the controlled token)
   * This handles the case where an actor has multiple tokens on the scene
   */
  isOldStateAvsControlled(outcome) {
    try {
      const token = outcome.token;
      const isLoot = token?.actor?.type === 'loot';
      const isHazard = token?.actor?.type === 'hazard';
      if (isLoot || isHazard) return false;

      const avsEnabled = game.settings.get(MODULE_ID, 'autoVisibilityEnabled');
      if (!avsEnabled) return false;

      const observerId = token?.document?.id || token?.id;
      if (!observerId) return false;

      const sneakerToken = this.sneakingToken;
      if (!sneakerToken) return false;

      const flagKey = `avs-override-from-${observerId}`;
      if (sneakerToken.document?.getFlag(MODULE_ID, flagKey)) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  async _onRender(context, options) {
    super._onRender(context, options);
    // this.addIconClickHandlers(); // Disabled - using action registration via _onOverrideState instead
    this.updateBulkActionButtons();
    this.markInitialSelections();
    this._resetCoverBonusButtonStates();
    this.addDeferHandlers();
    this._resetBulkUndeferButton();
    // Update bulk defer button asynchronously (don't block render)
    try {
      await this._updateBulkDeferButton();
      this._updateEndTurnValidationButton();
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
    return addSneakDeferHandlers(this);
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
    return bulkDeferAllEligible(this);
  }

  /**
   * Bulk undefer all currently deferred tokens and restore their original state
   * This efficiently removes multiple tokens from defer status in one operation
   * @private
   */
  _bulkUndeferAll() {
    return bulkUndeferAll(this);
  }

  /**
   * Bulk restore all previously undeferred tokens back to deferred state
   * This restores the original outcome states that were preserved during bulk undefer
   * @private
   */
  _bulkRestoreDefers() {
    return bulkRestoreDefers(this);
  }

  /**
   * Updates the bulk defer and undefer button availability based on tokens in the currently visible (filtered) outcomes
   * @private
   */
  _updateBulkDeferButton() {
    return updateBulkDeferButton(this);
  }

  _updateEndTurnValidationButton() {
    return updateEndTurnValidationButton(this);
  }

  /**
   * Recomputes outcomes with position data when toggles change
   * This ensures all tokens (including newly included allies) have position data
   * @private
   */
  async _recomputeOutcomesWithPositionData() {
    let filteredOutcomes = await getSneakDialogFilteredOutcomes(this);

    // Capture current end positions for all filtered outcomes
    await this._captureCurrentEndPositionsForOutcomes(filteredOutcomes);

    // Extract position transition data from outcomes
    await this._extractPositionTransitions(filteredOutcomes);

    await recalculateSneakPositionOutcomes(this, filteredOutcomes, {
      resetOverrideState: true,
    });

    // Process outcomes to add additional properties including position data
    let processedOutcomes = prepareSneakOutcomeContexts(this, filteredOutcomes, {
      currentVisibilityMode: 'live',
      oldStatePreference: 'oldFirst',
    });

    return applySneakVisualFilters(processedOutcomes, {
      hideFoundryHidden: this.hideFoundryHidden,
    });
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
    return captureCurrentSneakEndPositions(this, outcomes);
  }

  /**
   * Extracts position transition data from outcomes
   * @param {Array} outcomes - Array of outcome objects
   * @private
   */
  async _extractPositionTransitions(outcomes) {
    return extractSneakPositionTransitions(this, outcomes);
  }

  /**
   * Gets position transition data for a specific token
   * @param {Token} token - The token to get position data for
   * @returns {PositionTransition|null} Position transition data or null
   * @private
   */
  _getPositionTransitionForToken(token) {
    return getSneakPositionTransitionForToken(this, token);
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
    return prepareSneakPositionDisplay(this, positionTransition, observerToken, outcome);
  }

  /**
   * Assesses the quality of a position for stealth purposes
   * @param {PositionState} position - Position state to assess
   * @returns {string} Quality assessment ('excellent', 'good', 'fair', 'poor')
   * @private
   */
  _assessPositionQuality(position) {
    return assessSneakPositionQuality(position);
  }

  /**
   * Sorts outcomes by qualification status - qualifying positions appear first
   * @param {Array} outcomes - Array of processed outcomes
   * @returns {Array} Sorted array with qualifying positions first
   * @private
   */
  _sortOutcomesByQualification(outcomes) {
    return sortSneakOutcomesByQualification(outcomes);
  }

  /**
   * Determines if an outcome represents a qualifying sneak attempt
   * @param {Object} outcome - Processed outcome object
   * @returns {boolean} True if the outcome qualifies for sneak
   * @private
   */
  _outcomeQualifies(outcome) {
    return sneakOutcomeQualifies(outcome);
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
    return getSneakDisplayProperty(this, type, value, property);
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
    return startPositionQualifiesForSneak(this, observerToken, outcome);
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
    return endPositionQualifiesForSneak(this, observerToken, outcome);
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
    return toggleSneakPosition(currentSneakDialog, target, positionType);
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
    return recalculateSneakOutcomeVisibility(this, outcome);
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
    return updateDeferButtonForToken(this, tokenId, canDefer);
  }

  /**
   * Updates the outcome display for a specific token
   * @param {string} tokenId - Token ID
   * @param {Object} outcome - Updated outcome object
   */
  async _updateOutcomeDisplayForToken(tokenId, outcome) {
    return updateSneakOutcomeDisplayForToken(this, tokenId, outcome);
  }

  /**
   * Handles setting cover bonus for individual tokens
   * @param {Event} event - Click event
   * @param {HTMLElement} target - Button element
   */
  static async _onSetCoverBonus(event, target) {
    return setSneakCoverBonus(currentSneakDialog, target);
  }

  /**
   * Handles undeferring a specific token check
   * @param {Event} event - Click event
   * @param {HTMLElement} target - Button element
   */
  static async _onUndeferCheck(event, target) {
    return undeferSneakCheck(currentSneakDialog, target);
  }

  /**
   * Handles applying cover bonus to all tokens
   * @param {Event} event - Click event
   * @param {HTMLElement} target - Button element
   */
  static async _onApplyAllCover(event, target) {
    return applyAllSneakCoverBonus(currentSneakDialog, target);
  }

  /**
   * Reset all cover bonus button states to default
   * @private
   */
  _resetCoverBonusButtonStates() {
    return resetSneakCoverBonusButtonStates(this);
  }

  /**
   * Reset bulk undefer button to initial state (called on render)
   */
  _resetBulkUndeferButton() {
    return resetBulkUndeferButton(this);
  } /**
   * Set bulk undefer button to "Restore Defers" mode after undefer all is executed
   * @private
   */
  _setBulkUndeferButtonToRestoreMode() {
    return setBulkUndeferButtonToRestoreMode(this);
  }

  /**
   * Force reset bulk undefer button to initial state (removes restore mode)
   * @private
   */
  _forceResetBulkUndeferButton() {
    return forceResetBulkUndeferButton(this);
  } /**
   * Calculates outcome based on margin
   * @param {number} margin - Roll margin vs DC
   * @returns {string} Outcome type
   */
  _calculateOutcome(margin) {
    return calculateSneakOutcome(margin);
  }

  /**
   * Clear sneak-active flag from the sneaking token
   * @private
   */
  async _clearSneakActiveFlag() {
    try {
      const avsEnabled = game.settings?.get?.('pf2e-visioner', 'autoVisibilityEnabled') ?? false;
      if (this.sneakingToken && avsEnabled) {
        await this.sneakingToken.document.unsetFlag('pf2e-visioner', 'sneak-active');
        try {
          const { SneakSpeedService } = await import('../services/SneakSpeedService.js');
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
    return updateSneakVisibilityStateIndicators(row, visibilityState);
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
    return applySneakEndTurnResults(currentSneakDialog);
  }

  /**
   * Handle end-of-turn validation processing
   * @param {Event} event - Click event
   * @param {HTMLElement} target - Button element
   */
  static async _onProcessEndTurnValidation(event, target) {
    return processSneakEndTurnValidation(currentSneakDialog, SneakPreviewDialog);
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

  static async _onOverrideState(event, target) {
    return applySneakOverrideState(currentSneakDialog, target);
  }

  updateIconSelection(identifier, selectedState, isWall = false) {
    return updateSneakIconSelection(this, identifier, selectedState, isWall);
  }

  async close(options = {}) {
    await this._clearSneakActiveFlag();
    return super.close(options);
  }

  // Override addIconClickHandlers to use AVS-aware logic
  addIconClickHandlers() {
    return addSneakIconClickHandlers(this);
  }
}
