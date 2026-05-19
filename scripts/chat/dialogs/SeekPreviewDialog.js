/**
 * Seek Preview Dialog for Seek action automation
 * Uses ApplicationV2 for modern FoundryVTT compatibility
 */

import { MODULE_ID } from '../../constants.js';
import {
  getSeekDisplayOutcomes,
  prepareSeekDialogContext,
} from './Seek/seek-dialog-context.js';
import {
  applyAllSeekChanges,
  applySeekChange,
  applyTimedSeekChange,
  revertAllSeekChanges,
  revertSeekChange,
} from './Seek/seek-dialog-actions.js';
import {
  applySeekReaction,
  applySenseUnseenForSeek,
  getAvailableSeekReactions,
  updateSeekOutcomeRows,
  updateSeekReactionButton,
  updateSeekReactionsToggleButton,
} from './Seek/seek-dialog-reactions.js';
import {
  bindSeekInlineControls,
  toggleSeekEncounterFilter,
  toggleSeekFilterByDetection,
  toggleSeekHideFoundryHidden,
  toggleSeekIgnoreAllies,
  toggleSeekIgnoreWalls,
  toggleSeekReactionsDropdown,
  toggleSeekShowOnlyChanges,
} from './Seek/seek-dialog-controls.js';
import {
  hideSeekSensesTooltip,
  setupSeekSensesButtonTooltips,
  showSeekSensesTooltip,
} from './Seek/seek-senses-tooltip.js';
import { cleanupSeekDialogLifecycle } from './Seek/seek-dialog-lifecycle.js';
import { calculateSeekOutcomeActionability } from './Seek/seek-outcome-context.js';
import {
  applySeekOverrideState,
  filterSeekOverrideStatesForOutcome,
  isCurrentSeekStateAvsControlled,
  isOldSeekStateAvsControlled,
  updateSeekIconSelection,
} from './Seek/seek-override-state.js';
import { BaseActionDialog } from './base-action-dialog.js';

// Store reference to current seek dialog
let _currentSeekDialogInstance = null;

export class SeekPreviewDialog extends BaseActionDialog {
  // Static property to access the current seek dialog
  static get currentSeekDialog() {
    return _currentSeekDialogInstance;
  }

  static DEFAULT_OPTIONS = {
    tag: 'div',
    classes: ['pf2e-visioner', 'seek-preview-dialog'], // Keep same class for CSS compatibility
    window: {
      title: game.i18n.localize('PF2E_VISIONER.DIALOG_TITLES.SEEK_RESULTS'),
      icon: 'fas fa-search',
      resizable: true,
    },
    position: {
      width: 850,
      height: 'auto',
    },
    actions: {
      close: SeekPreviewDialog._onClose,
      applyAll: SeekPreviewDialog._onApplyAll,
      revertAll: SeekPreviewDialog._onRevertAll,
      applyChange: SeekPreviewDialog._onApplyChange,
      applyChangeTimed: SeekPreviewDialog._onApplyChangeTimed,
      revertChange: SeekPreviewDialog._onRevertChange,
      toggleEncounterFilter: SeekPreviewDialog._onToggleEncounterFilter,
      toggleFilterByDetection: SeekPreviewDialog._onToggleFilterByDetection,
      toggleIgnoreAllies: SeekPreviewDialog._onToggleIgnoreAllies,
      toggleHideFoundryHidden: SeekPreviewDialog._onToggleHideFoundryHidden,
      toggleIgnoreWalls: SeekPreviewDialog._onToggleIgnoreWalls,
      toggleShowOnlyChanges: SeekPreviewDialog._onToggleShowOnlyChanges,
      overrideState: SeekPreviewDialog._onOverrideState,
    },
  };

  static PARTS = {
    content: {
      template: 'modules/pf2e-visioner/templates/seek-preview.hbs',
    },
  };

  constructor(actorToken, outcomes, changes, actionData, options = {}) {
    // Set window title and icon for seek dialog
    options.window = {
      ...options.window,
      title:
        options.window?.title || game.i18n.localize('PF2E_VISIONER.DIALOG_TITLES.ACTION_RESULTS'),
      icon: 'fas fa-search',
    };

    super(options);
    this.actorToken = actorToken; // Renamed for clarity
    this.outcomes = outcomes;
    this._appliedReactions = new Set(); // Track applied reactions
    // Preserve original outcomes so toggles (like Ignore Allies) can re-filter properly
    this._originalOutcomes = Array.isArray(outcomes) ? [...outcomes] : [];
    this.changes = changes;
    this.actionData = { ...actionData, actionType: 'seek' }; // Store action data, ensuring actionType is always 'seek'

    // Track bulk action states to prevent abuse
    this.bulkActionState = 'initial'; // 'initial', 'applied', 'reverted'

    // Track encounter filtering state
    this.encounterOnly = game.settings.get(MODULE_ID, 'defaultEncounterFilter');
    // Per-dialog ignore allies defaults from global setting
    this.ignoreAllies = game.settings.get(MODULE_ID, 'ignoreAllies');
    // Per-dialog ignore walls (default off)
    this.ignoreWalls = false;
    // Visual filter default from per-user setting
    try {
      this.hideFoundryHidden = game.settings.get(MODULE_ID, 'hideFoundryHiddenTokens');
    } catch {
      this.hideFoundryHidden = true;
    }
    // Show only changes filter (default off)
    this.showOnlyChanges = false;

    // Ensure filterByDetection is properly initialized (fallback if BaseActionDialog didn't set it)
    if (typeof this.filterByDetection === 'undefined') {
      this.filterByDetection = false; // Conservative default
    }

    // Set global reference
    _currentSeekDialogInstance = this;
  }

  isSearchExplorationGroup() {
    return this.actionData?.searchExplorationGroup === true;
  }

  /**
   * Override buildOverrideStates to filter out 'avs' option for loot tokens, hazards, and walls
   * These entities should never show the AVS tag since AVS doesn't apply to them
   */
  buildOverrideStates(desiredStates, outcome, options = {}) {
    const states = super.buildOverrideStates(desiredStates, outcome, options);
    return filterSeekOverrideStatesForOutcome(states, outcome);
  }

  /**
   * Add hover functionality after rendering
   */
  // Hover/selection behavior is provided by BasePreviewDialog

  /**
   * Prepare context data for the template
   */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return prepareSeekDialogContext(this, context);
  }

  // Use base outcome helpers

  /**
   * Render the HTML for the application
   */
  async _renderHTML(context) {
    const html = await foundry.applications.handlebars.renderTemplate(
      this.constructor.PARTS.content.template,
      context,
    );
    return html;
  }

  /**
   * Replace the HTML content of the application
   */
  _replaceHTML(result, content) {
    content.innerHTML = result;

    // Hook up senses button tooltips
    try {
      setupSeekSensesButtonTooltips(this, content);
    } catch { }

    try {
      bindSeekInlineControls(this, content);
    } catch { }

    return content;
  }

  /**
   * Compute filtered outcomes honoring current toggles
   */
  async getFilteredOutcomes() {
    return getSeekDisplayOutcomes(this);
  }

  /**
   * Called after the application is rendered
   */
  _onRender(context, options) {
    super._onRender(context, options);

    // Set initial button states
    this.updateBulkActionButtons();

    // Add icon click handlers
    this.addIconClickHandlers();
    // Mark initial icon selections
    this.markInitialSelections();
  }

  /**
   * Apply all visibility changes
   */
  static async _onApplyAll() {
    return applyAllSeekChanges(_currentSeekDialogInstance);
  }

  /**
   * Revert all changes to original state
   */
  static async _onRevertAll() {
    return revertAllSeekChanges(_currentSeekDialogInstance);
  }

  /**
   * Apply individual visibility change
   */
  static async _onApplyChange(event, button) {
    return applySeekChange(_currentSeekDialogInstance, button);
  }

  static async _onApplyChangeTimed(event, button) {
    return applyTimedSeekChange(_currentSeekDialogInstance, button);
  }

  /**
   * Revert individual token to original state
   */
  static async _onRevertChange(event, button) {
    return revertSeekChange(_currentSeekDialogInstance, button);
  }

  /**
   * Update the changes count display dynamically
   */
  // removed: updateChangesCount duplicated; using BaseActionDialog implementation

  /**
   * Override close to clear global reference
   */
  close(options) {
    cleanupSeekDialogLifecycle(this);
    _currentSeekDialogInstance = null;
    return super.close(options);
  }

  /**
   * Apply visibility changes using the shared utility function
   * @param {Token} seeker - The seeker token
   * @param {Array} changes - Array of change objects
   * @param {Object} options - Additional options
   * @param {string} options.direction - Direction of visibility check ('observer_to_target' or 'target_to_observer')
   */
  // Use BaseActionDialog.applyVisibilityChanges

  getChangesCounterClass() {
    return 'seek-preview-dialog-changes-count';
  }

  // Token id in Seek outcomes is under `target`
  getOutcomeTokenId(outcome) {
    return outcome?.rowId ?? outcome?.searchExplorationRowId ?? outcome?.target?.id ?? null;
  }

  /**
   * Update individual row buttons to show applied state
   */
  // removed: updateRowButtonsToApplied duplicated; using BaseActionDialog implementation

  /**
   * Update individual row buttons to show reverted state
   */
  // removed: updateRowButtonsToReverted duplicated; using BaseActionDialog implementation

  /**
   * Update bulk action button states based on current bulk action state
   */
  // removed: updateBulkActionButtons duplicated; using BaseActionDialog implementation

  /**
   * Toggle the reactions dropdown visibility
   */
  toggleReactionsDropdown() {
    return toggleSeekReactionsDropdown(this);
  }

  /**
   * Get available reactions for the current context
   */
  getAvailableReactions(outcomes) {
    return getAvailableSeekReactions(this, outcomes);
  }

  /**
   * Apply a specific reaction
   */
  async applyReaction(reactionKey) {
    return applySeekReaction(this, reactionKey);
  }

  /**
   * Update a reaction button to show applied state
   */
  updateReactionButton(reactionKey, applied) {
    return updateSeekReactionButton(this, reactionKey, applied);
  }

  /**
   * Updates the reactions toggle button state based on available reactions
   */
  updateReactionsToggleButton() {
    return updateSeekReactionsToggleButton(this);
  }

  /**
   * Update outcome rows to reflect changes
   */
  updateOutcomeRows(affectedOutcomes) {
    return updateSeekOutcomeRows(this, affectedOutcomes);
  }

  /**
   * Apply Sense the Unseen feat to upgrade failed outcomes
   * @deprecated Use applyReaction('senseTheUnseen') instead
   */
  async applySenseUnseen() {
    return applySenseUnseenForSeek(this);
  }

  /**
   * Toggle encounter filtering and refresh results
   */
  static async _onToggleEncounterFilter(event, target) {
    return toggleSeekEncounterFilter(_currentSeekDialogInstance, target);
  }

  static async _onToggleFilterByDetection(event, target) {
    return toggleSeekFilterByDetection(_currentSeekDialogInstance, target);
  }

  static async _onToggleIgnoreAllies(event, target) {
    return toggleSeekIgnoreAllies(_currentSeekDialogInstance, target);
  }

  static async _onToggleHideFoundryHidden(event, target) {
    return toggleSeekHideFoundryHidden(_currentSeekDialogInstance, target);
  }

  static async _onToggleIgnoreWalls(event, target) {
    return toggleSeekIgnoreWalls(_currentSeekDialogInstance, target);
  }

  static async _onToggleShowOnlyChanges(event, target) {
    return toggleSeekShowOnlyChanges(_currentSeekDialogInstance, target);
  }

  /**
   * Add click handlers for state icon selection
   */
  // removed: addIconClickHandlers duplicated; using BaseActionDialog implementation

  /**
   * Update action buttons visibility for a specific token
   */
  updateActionButtonsForToken(tokenId, hasActionableChange, opts = {}) {
    super.updateActionButtonsForToken(tokenId, hasActionableChange, opts);
  }

  /**
   * Calculate if there's an actionable change (considering overrides)
   */
  calculateHasActionableChange(outcome) {
    return calculateSeekOutcomeActionability(this, outcome, {
      effectiveNewState: outcome.overrideState || outcome.newVisibility,
      baseOldState: outcome.oldVisibility != null ? outcome.oldVisibility : outcome.currentVisibility,
      isOldStateAvsControlled: this.isOldStateAvsControlled(outcome),
    });
  }

  /**
   * Handle state override action
   */
  static async _onOverrideState(event, target) {
    return applySeekOverrideState(_currentSeekDialogInstance, target);
  }

  /**
   * Update icon selection visually
   */
  updateIconSelection(identifier, selectedState, isWall = false) {
    return updateSeekIconSelection(this, identifier, selectedState, isWall);
  }

  /**
   * Setup tooltips for senses buttons
   */
  setupSensesButtonTooltips(content) {
    return setupSeekSensesButtonTooltips(this, content);
  }

  /**
   * Show custom senses tooltip
   */
  showSensesTooltip(element, tooltipContent) {
    return showSeekSensesTooltip(this, element, tooltipContent);
  }

  /**
   * Hide custom senses tooltip
   */
  hideSensesTooltip() {
    return hideSeekSensesTooltip(this);
  }

  /**
   * Handle close action
   */
  static _onClose() {
    const app = _currentSeekDialogInstance;
    if (app) {
      app.close();
      _currentSeekDialogInstance = null; // Clear reference when closing
    }
  }

  /**
   * Check if the old visibility state is AVS-controlled (no manual override exists)
   * @param {Object} outcome - The outcome object containing target and observer information
   * @returns {boolean} True if the old state is AVS-controlled
   */
  isOldStateAvsControlled(outcome) {
    return isOldSeekStateAvsControlled(this, outcome);
  }

  isCurrentStateAvsControlled(outcome) {
    return isCurrentSeekStateAvsControlled(outcome, (candidate) =>
      super.isCurrentStateAvsControlled(candidate),
    );
  }
}
