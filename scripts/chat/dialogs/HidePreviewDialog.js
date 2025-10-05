/**
 * Hide Preview Dialog for Hide action automation
 * Uses ApplicationV2 for modern FoundryVTT compatibility
 */

import { MODULE_ID, MODULE_TITLE } from '../../constants.js';
import {
  getDefaultNewStateFor,
  getDesiredOverrideStatesForAction,
} from '../services/data/action-state-config.js';
import { getVisibilityStateConfig } from '../services/data/visibility-states.js';
import { notify } from '../services/infra/notifications.js';
import { hasActiveEncounter } from '../services/infra/shared-utils.js';
import { BaseActionDialog } from './base-action-dialog.js';

// Store reference to current hide dialog
let currentHideDialog = null;

export class HidePreviewDialog extends BaseActionDialog {
  static DEFAULT_OPTIONS = {
    tag: 'div',
    classes: ['pf2e-visioner', 'hide-preview-dialog'],
    window: {
      title: 'Hide Results',
      icon: 'fas fa-mask',
      resizable: true,
    },
    position: {
      width: 800,
      height: 'auto',
    },
    actions: {
      close: HidePreviewDialog._onClose,
      applyAll: HidePreviewDialog._onApplyAll,
      revertAll: HidePreviewDialog._onRevertAll,
      applyChange: HidePreviewDialog._onApplyChange,
      revertChange: HidePreviewDialog._onRevertChange,
      toggleEncounterFilter: HidePreviewDialog._onToggleEncounterFilter,
      toggleFilterByDetection: HidePreviewDialog._onToggleFilterByDetection,
      overrideState: HidePreviewDialog._onOverrideState,
      togglePrequisite: HidePreviewDialog._onTogglePrequisite,
      bulkOverrideSet: HidePreviewDialog._onBulkOverrideSet,
      bulkOverrideClear: HidePreviewDialog._onBulkOverrideClear,
    },
  };

  static PARTS = {
    content: {
      template: 'modules/pf2e-visioner/templates/hide-preview.hbs',
    },
  };

  constructor(actorToken, outcomes, changes, actionData, options = {}) {
    // Set window title and icon for hide dialog
    options.window = {
      ...options.window,
      title: `Hide Results`,
      icon: 'fas fa-eye-slash',
    };

    super(options);

    this.actorToken = actorToken;
    this.outcomes = outcomes || [];
    // Preserve an immutable base list for live filtering toggles
    try {
      this._originalOutcomes = Array.isArray(outcomes) ? [...outcomes] : [];
    } catch {
      this._originalOutcomes = outcomes || [];
    }
    this.changes = changes || [];
    this.actionData = { ...(actionData || {}), actionType: 'hide' };
    this.encounterOnly = game.settings.get(MODULE_ID, 'defaultEncounterFilter');
    this.ignoreAllies = game.settings.get(MODULE_ID, 'ignoreAllies');
    this.bulkActionState = 'initial'; // Track bulk action state
    // Visual filter default from per-user setting
    try {
      this.hideFoundryHidden = game.settings.get(MODULE_ID, 'hideFoundryHiddenTokens');
    } catch {
      this.hideFoundryHidden = true;
    }

    // Store reference for singleton behavior
    currentHideDialog = this;
  }

  /**
   * Called after the dialog is first rendered to set up event handlers
   */
  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    this.addIconClickHandlers();
    this.markInitialSelections();
    this.updateChangesCount();
    try {
      const cb = this.element.querySelector('input[data-action="toggleIgnoreAllies"]');
      if (cb)
        cb.addEventListener('change', () => {
          this.ignoreAllies = !!cb.checked;
          this.bulkActionState = 'initial';
          // Recompute filtered list and preserve overrides before re-rendering
          this.getFilteredOutcomes()
            .then((list) => {
              this.outcomes = list;
              this.render({ force: true });
            })
            .catch(() => this.render({ force: true }));
        });
    } catch { }
  }

  /**
   * Add hover listeners to highlight tokens on canvas
   */
  // Selection highlight handled by BasePreviewDialog

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // Get filtered outcomes from the original list using encounter helper, ally filtering, then extra RAW filtering
    const baseList = Array.isArray(this._originalOutcomes)
      ? this._originalOutcomes
      : this.outcomes || [];
    let filteredOutcomes = this.applyEncounterFilter(
      baseList,
      'target',
      'No encounter observers found for this action',
    );
    // Apply ally filtering for display purposes
    try {
      const { filterOutcomesByAllies } = await import('../services/infra/shared-utils.js');
      filteredOutcomes = filterOutcomesByAllies(
        filteredOutcomes,
        this.actorToken,
        this.ignoreAllies,
        'target',
      );
    } catch { }

    // Apply viewport filtering if enabled
    if (this.filterByDetection && this.actorToken) {
      try {
        const { filterOutcomesByDetection } = await import('../services/infra/shared-utils.js');
        filteredOutcomes = await filterOutcomesByDetection(
          filteredOutcomes,
          this.actorToken,
          'target',
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
      filteredOutcomes = filterOutcomesByDefeated(filteredOutcomes, 'target');
    } catch {
      /* Defeated filtering is non-critical */
    }

    // Augment with end-position qualification like Sneak: concealed OR standard/greater cover qualifies
    try {
      // Compute lightweight position info on demand
      const { default: positionTracker } = await import('../services/position/PositionTracker.js');
      const hider = this.actorToken;
      for (const outcome of filteredOutcomes) {
        try {
          // Capture current end position from observer -> hider perspective
          const endPos = await positionTracker._capturePositionState(
            hider,
            outcome.target,
            Date.now(),
            { forceFresh: true, useCurrentPositionForCover: true },
          );
          // Build minimal positionDisplay like Sneak
          let qualifies = this._endPositionQualifiesForHide(endPos);
          // Apply feat-based prerequisite overrides (Very Very Sneaky, Legendary Sneak, etc.)
          try {
            const { FeatsHandler } = await import('../services/FeatsHandler.js');
            const startVisibility =
              outcome.oldVisibility || outcome.currentVisibility || 'observed';
            const endVisibility = endPos?.effectiveVisibility || startVisibility;
            const endCoverState = endPos?.coverState || 'none';
            // Construct a base prerequisite object (start: need cover/concealment unless feats)
            let base = {
              startQualifies:
                startVisibility === 'hidden' ||
                startVisibility === 'undetected' ||
                startVisibility === 'concealed',
              endQualifies: qualifies,
              bothQualify: false,
              reason: 'Hide (dialog) prerequisites',
            };
            base.bothQualify = base.startQualifies && base.endQualifies;
            const overridden = FeatsHandler.overridePrerequisites(hider, base, {
              startVisibility,
              endVisibility,
              endCoverState,
            });
            // If feats grant endQualifies, reflect in UI gating
            if (overridden.endQualifies && !qualifies) {
              qualifies = true;
            }
            // Store for UI (optional future use)
            outcome.positionQualification = overridden;
          } catch {
            /* feat override non-fatal */
          }

          // Compute and store the base calculated new visibility (ignoring prereq gating)
          const baseOldState = outcome.oldVisibility || outcome.currentVisibility;
          const baseCalculated =
            getDefaultNewStateFor('hide', baseOldState, outcome.outcome) || baseOldState;
          // Persist for later toggles
          outcome._calculatedNewVisibility = baseCalculated;

          outcome.positionDisplay = {
            endPosition: {
              visibility: endPos.effectiveVisibility,
              cover: endPos.coverState,
              qualifies,
            },
          };
          outcome.hasPositionData = true;
          outcome.positionTransition = {
            endPosition: {
              effectiveVisibility: endPos.effectiveVisibility,
              coverState: endPos.coverState,
            },
          };
          // Apply prereq gating: if end doesn't qualify → AVS; else ensure the calculated outcome is used
          if (!qualifies) {
            outcome.newVisibility = 'avs';
            outcome.overrideState = null;
          } else {
            // Use the calculated mapping when qualified
            outcome.newVisibility = baseCalculated;
          }
        } catch {
          /* non-fatal */
        }
      }
    } catch {
      /* optional */
    }

    // Note: autoCover data is already calculated in HideAction.js and should be preserved
    // No need to call getCoverBetween here as it would overwrite the rich autoCover object

    // Show notification if encounter filter results in empty list
    if (this.encounterOnly && hasActiveEncounter() && filteredOutcomes.length === 0) {
      notify.info(`${MODULE_TITLE}: No encounter observers found for this action`);
    }

    // Preserve any previously chosen overrides across re-renders
    try {
      const previous = Array.isArray(this.outcomes) ? this.outcomes : [];
      filteredOutcomes = filteredOutcomes.map((o) => {
        const existing = previous.find((x) => x?.target?.id === o?.target?.id);
        const overrideState = existing?.overrideState ?? o?.overrideState ?? null;
        return { ...o, overrideState };
      });
    } catch { }

    // Process outcomes to add additional properties needed by template
    let processedOutcomes = filteredOutcomes.map((outcome) => {
      const availableStates = this.getAvailableStatesForOutcome(outcome);
      const effectiveNewState = outcome.overrideState ?? outcome.newVisibility;
      const baseOldState = outcome.oldVisibility || outcome.currentVisibility;
      // Check if the old visibility state is AVS-controlled
      const isOldStateAvsControlled = this.isOldStateAvsControlled(outcome);

      // Special case: If current state is AVS-controlled and override is 'avs', no change
      let hasActionableChange = false;
      if (outcome.overrideState === 'avs' && this.isCurrentStateAvsControlled(outcome)) {
        hasActionableChange = false;
      } else {
        // If old state matches new state, check if old state was AVS-controlled
        // If it was AVS-controlled, we should still apply the manual override
        const statesMatch = baseOldState != null && effectiveNewState != null && effectiveNewState === baseOldState;
        hasActionableChange =
          (baseOldState != null && effectiveNewState != null && effectiveNewState !== baseOldState) ||
          (statesMatch && isOldStateAvsControlled);
      }



      return {
        ...outcome,
        positionDisplay: outcome.positionDisplay,
        hasPositionData: !!outcome.hasPositionData,
        availableStates,
        // Do not clobber overrideState here; preserve only user-intended overrides
        hasActionableChange,
        calculatedOutcome: outcome.newVisibility,
        tokenImage: this.resolveTokenImage(outcome.target),
        outcomeClass: this.getOutcomeClass(outcome.outcome),
        outcomeLabel: this.getOutcomeLabel(outcome.outcome),
        marginText: this.formatMargin(outcome.margin),
        oldVisibilityState: getVisibilityStateConfig(baseOldState),
        newVisibilityState: getVisibilityStateConfig(effectiveNewState),
        isOldStateAvsControlled,
      };
    });

    // Visual filtering: hide Foundry-hidden tokens from display if enabled
    try {
      if (this.hideFoundryHidden) {
        processedOutcomes = processedOutcomes.filter((o) => {
          try {
            return o?._isWall || o?.target?.document?.hidden !== true;
          } catch {
            return true;
          }
        });
      }
    } catch { }

    // Show-only-changes visual filter
    try {
      if (this.showOnlyChanges) {
        processedOutcomes = processedOutcomes.filter((o) => !!o.hasActionableChange);
      }
    } catch { }

    // Compute feat prerequisite-relaxation badges for Hide action
    try {
      const { FeatsHandler } = await import('../services/FeatsHandler.js');
      const has = (slug) => {
        try {
          return FeatsHandler.hasFeat(this.actorToken, slug);
        } catch {
          return false;
        }
      };
      const badges = [];
      if (has('ceaseless-shadows')) {
        badges.push({
          key: 'ceaseless-shadows',
          icon: 'fas fa-infinity',
          label: game.i18n.localize('PF2E_VISIONER.HIDE_AUTOMATION.BADGES.CEASELESS_SHADOWS_LABEL'),
          tooltip: game.i18n.localize(
            'PF2E_VISIONER.HIDE_AUTOMATION.BADGES.CEASELESS_SHADOWS_TOOLTIP',
          ),
        });
      }
      try {
        if (has('camouflage')) {
          const env = (await import('../../utils/environment.js')).default;
          const naturalTerrains = ['aquatic', 'arctic', 'desert', 'forest', 'mountain', 'plains', 'sky', 'swamp', 'underground'];
          const inNaturalTerrain = naturalTerrains.some(terrain =>
            env.isEnvironmentActive(this.actorToken, terrain)
          );
          if (inNaturalTerrain) {
            badges.push({
              key: 'camouflage',
              icon: 'fas fa-tree',
              label: game.i18n.localize('PF2E_VISIONER.HIDE_AUTOMATION.BADGES.CAMOUFLAGE_LABEL'),
              tooltip: game.i18n.localize(
                'PF2E_VISIONER.HIDE_AUTOMATION.BADGES.CAMOUFLAGE_TOOLTIP',
              ),
            });
          }
        }
      } catch { }
      if (has('legendary-sneak')) {
        badges.push({
          key: 'legendary-sneak',
          icon: 'fas fa-shoe-prints',
          label: game.i18n.localize('PF2E_VISIONER.HIDE_AUTOMATION.BADGES.LEGENDARY_SNEAK_LABEL'),
          tooltip: game.i18n.localize(
            'PF2E_VISIONER.HIDE_AUTOMATION.BADGES.LEGENDARY_SNEAK_TOOLTIP',
          ),
        });
      }
      if (has('very-very-sneaky')) {
        badges.push({
          key: 'very-very-sneaky',
          icon: 'fas fa-user-ninja',
          label: game.i18n.localize('PF2E_VISIONER.HIDE_AUTOMATION.BADGES.VERY_VERY_SNEAKY_LABEL'),
          tooltip: game.i18n.localize(
            'PF2E_VISIONER.HIDE_AUTOMATION.BADGES.VERY_VERY_SNEAKY_TOOLTIP',
          ),
        });
      }
      try {
        if (has('terrain-stalker')) {
          const selections = FeatsHandler.getTerrainStalkerSelections(this.actorToken) || [];
          const active = selections.filter((sel) => {
            try {
              return FeatsHandler.isEnvironmentActive(this.actorToken, sel);
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
              const ctx = env.getActiveContext(this.actorToken) || {};
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
                'PF2E_VISIONER.HIDE_AUTOMATION.BADGES.TERRAIN_STALKER_LABEL',
              ),
              tooltip: game.i18n.format(
                'PF2E_VISIONER.HIDE_AUTOMATION.BADGES.TERRAIN_STALKER_TOOLTIP',
                { selection: selectionText, environments: environmentsText },
              ),
            });
          }
        }
      } catch { }
      try {
        if (has('vanish-into-the-land')) {
          const selections = FeatsHandler.getTerrainStalkerSelections(this.actorToken) || [];
          let active = false;
          let firstActive = null;
          for (const selection of selections) {
            try {
              const env = (await import('../../utils/environment.js')).default;
              const matches = env.getMatchingEnvironmentRegions(this.actorToken, selection) || [];
              if (matches.length > 0) {
                active = true;
                firstActive = firstActive || selection;
                break;
              }
            } catch {
              active = active || FeatsHandler.isEnvironmentActive(this.actorToken, selection);
              if (active && !firstActive) firstActive = selection;
            }
          }
          if (active) {
            badges.push({
              key: 'vanish-into-the-land',
              icon: 'fas fa-leaf',
              label: game.i18n.localize(
                'PF2E_VISIONER.HIDE_AUTOMATION.BADGES.VANISH_INTO_THE_LAND_LABEL',
              ),
              tooltip: game.i18n.localize(
                'PF2E_VISIONER.HIDE_AUTOMATION.BADGES.VANISH_INTO_THE_LAND_TOOLTIP',
              ),
            });
          }
        }
      } catch { }
      if (has('distracting-shadows')) {
        badges.push({
          key: 'distracting-shadows',
          icon: 'fas fa-users',
          label: game.i18n.localize(
            'PF2E_VISIONER.HIDE_AUTOMATION.BADGES.DISTRACTING_SHADOWS_LABEL',
          ),
          tooltip: game.i18n.localize(
            'PF2E_VISIONER.HIDE_AUTOMATION.BADGES.DISTRACTING_SHADOWS_TOOLTIP',
          ),
        });
      }
      context.prereqBadges = badges;
    } catch { }

    // Keep the immutable original list in _originalOutcomes for live re-filtering,
    // but set the current outcomes to the processed list so UI buttons use up-to-date flags
    this.outcomes = processedOutcomes;

    // Calculate summary information
    context.actorToken = this.actorToken;
    context.actorTokenImage = this.resolveTokenImage(this.actorToken);
    context.outcomes = processedOutcomes;
    context.ignoreAllies = !!this.ignoreAllies;
    context.hideFoundryHidden = !!this.hideFoundryHidden;
    // Expose that we have position UI in template
    context.hasPositionData = processedOutcomes.some((o) => o.hasPositionData);
    Object.assign(context, this.buildCommonContext(processedOutcomes));

    return context;
  }

  /**
   * Get filtered outcomes based on current filter settings
   * @returns {Array} Filtered outcomes
   */
  async getFilteredOutcomes() {
    try {
      const baseList = Array.isArray(this._originalOutcomes)
        ? this._originalOutcomes
        : this.outcomes || [];
      let filtered = this.applyEncounterFilter(
        baseList,
        'target',
        'No encounter observers found for this action',
      );
      // Apply ally filtering via live checkbox
      try {
        const { filterOutcomesByAllies } = await import('../services/infra/shared-utils.js');
        filtered = filterOutcomesByAllies(filtered, this.actorToken, this.ignoreAllies, 'target');
      } catch { }

      // Apply viewport filtering if enabled
      if (this.filterByDetection && this.actorToken) {
        try {
          const { filterOutcomesByDetection } = await import('../services/infra/shared-utils.js');
          filtered = await filterOutcomesByDetection(
            filtered,
            this.actorToken,
            'target',
            false,
            true,
            'target_to_observer',
          );
        } catch {
          /* Viewport filtering is non-critical */
        }
      }
      if (!Array.isArray(filtered)) return [];
      // Preserve override selections and recompute actionability
      const merged = filtered.map((o) => {
        try {
          const existing = (this.outcomes || []).find((x) => x?.target?.id === o?.target?.id);
          const overrideState = existing?.overrideState ?? o?.overrideState ?? null;
          const currentVisibility = o.oldVisibility || o.currentVisibility;
          const effectiveNewState = overrideState || o.newVisibility || currentVisibility;
          const baseOldState = o.oldVisibility || currentVisibility;
          const isOldStateAvsControlled = this.isOldStateAvsControlled(o);

          // Special case: If current state is AVS-controlled and override is 'avs', no change
          let hasActionableChange = false;
          if (overrideState === 'avs' && this.isCurrentStateAvsControlled(o)) {
            hasActionableChange = false;
          } else {
            // If old state matches new state, check if old state was AVS-controlled
            // If it was AVS-controlled, we should still apply the manual override
            const statesMatch = baseOldState != null && effectiveNewState != null && effectiveNewState === baseOldState;
            hasActionableChange =
              (baseOldState != null && effectiveNewState != null && effectiveNewState !== baseOldState) ||
              (statesMatch && isOldStateAvsControlled);
          }
          return { ...o, overrideState, hasActionableChange };
        } catch {
          return { ...o };
        }
      });
      // Visual filtering: hide Foundry-hidden tokens from display if enabled
      let visual = merged;
      try {
        if (this.hideFoundryHidden) {
          visual = visual.filter((o) => {
            try {
              return o?._isWall || o?.target?.document?.hidden !== true;
            } catch {
              return true;
            }
          });
        }
      } catch { }
      // Apply show-only-changes if enabled
      try {
        if (this.showOnlyChanges) {
          visual = visual.filter((o) => !!o.hasActionableChange);
        }
      } catch { }
      return visual;
    } catch {
      return Array.isArray(this.outcomes) ? this.outcomes : [];
    }
  }

  // Token id in Hide outcomes is under `target`
  getOutcomeTokenId(outcome) {
    return outcome?.target?.id ?? null;
  }

  /**
   * Get available visibility states for an outcome based on Hide rules
   * Hide can only make you hidden from observers who can currently see you
   */
  getAvailableStatesForOutcome(outcome) {
    const desired = getDesiredOverrideStatesForAction('hide');
    const built = this.buildOverrideStates(desired, outcome);
    // Inject labels expected by template
    return built.map((s) => ({ ...s, label: this.getStateLabel(s.value) }));
  }

  getStateLabel(state) {
    const labels = {
      observed: 'Observed',
      concealed: 'Concealed',
      hidden: 'Hidden',
      undetected: 'Undetected',
    };
    return labels[state] || state;
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

    return content;
  }

  async _onRender(context, options) {
    super._onRender(context, options);
    this.addIconClickHandlers();
    this.markInitialSelections();
    this.updateBulkActionButtons();
    this.updateChangesCount();

    // Wire Hide Foundry-hidden visual filter toggle on every render so it persists after re-render
    try {
      const cbh = this.element.querySelector('input[data-action="toggleHideFoundryHidden"]');
      if (cbh) {
        cbh.onchange = null; // prevent duplicate handlers on subsequent renders
        cbh.addEventListener('change', async () => {
          this.hideFoundryHidden = !!cbh.checked;
          try {
            await game.settings.set(MODULE_ID, 'hideFoundryHiddenTokens', this.hideFoundryHidden);
          } catch { }
          this.render({ force: true });
        });
      }
    } catch { }
  }

  /**
   * Mark the initial calculated outcomes as selected
   */
  markInitialSelections() {
    this.outcomes.forEach((outcome) => {
      // Mark the effective state (override if present, otherwise calculated) as selected in the UI
      const effectiveState = outcome.overrideState ?? outcome.newVisibility;
      // Recompute actionable flag for UI buttons
      try {
        const oldState = outcome.oldVisibility ?? outcome.currentVisibility ?? null;
        const isOldStateAvsControlled = this.isOldStateAvsControlled(outcome);

        // Special case: If current state is AVS-controlled and override is 'avs', no change
        if (outcome.overrideState === 'avs' && this.isCurrentStateAvsControlled(outcome)) {
          outcome.hasActionableChange = false;
        } else {
          // If old state matches new state, check if old state was AVS-controlled
          // If it was AVS-controlled, we should still apply the manual override
          const statesMatch = oldState != null && effectiveState != null && effectiveState === oldState;
          outcome.hasActionableChange =
            (oldState != null && effectiveState != null && effectiveState !== oldState) ||
            (statesMatch && isOldStateAvsControlled);
        }
        const tokenId = outcome?.target?.id ?? null;
        if (tokenId) this.updateActionButtonsForToken(tokenId, outcome.hasActionableChange);
      } catch { }
      const row = this.element.querySelector(`tr[data-token-id="${outcome.target.id}"]`);
      if (row) {
        const container = row.querySelector('.override-icons');
        if (container) {
          container.querySelectorAll('.state-icon').forEach((i) => i.classList.remove('selected'));
          // Prefer the icon for the effective state; fall back to observed if not found
          const iconEl =
            container.querySelector(`.state-icon[data-state="${effectiveState}"]`) ||
            container.querySelector('.state-icon[data-state="observed"]');
          if (iconEl) iconEl.classList.add('selected');
        }
      }
    });
  }

  // Override addIconClickHandlers to use our AVS-aware logic
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

          // Use our AVS-aware logic instead of the base logic
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

  updateActionButtonsForToken(tokenId, hasActionableChange) {
    // Delegate to base which renders Apply/Revert or "No Change"
    super.updateActionButtonsForToken(tokenId, hasActionableChange);
  }

  /**
   * Updates the changes count in the dialog footer
   */
  // removed: updateChangesCount duplicated; using BaseActionDialog implementation

  // removed: updateBulkActionButtons duplicated; using BaseActionDialog implementation

  // consolidated handlers defined later in file

  /**
   * Handle applying a visibility change for a single token
   */
  // consolidated handlers defined later in file

  /**
   * Handle reverting a visibility change for a single token
   */
  // consolidated handlers defined later in file

  /**
   * Handle applying a visibility change for a single token
   * @param {string} tokenId - The ID of the token to apply changes for
   */
  // consolidated handlers defined later in file

  /**
   * Handle reverting a visibility change for a single token
   * @param {string} tokenId - The ID of the token to revert changes for
   */
  // consolidated handlers defined later in file

  // consolidated handlers defined later in file

  // consolidated handlers defined later in file

  // consolidated handlers defined later in file

  static async _onToggleEncounterFilter(event, target) {
    const app = currentHideDialog;
    if (!app) {
      return;
    }

    // Toggle the filter state
    app.encounterOnly = target.checked;

    // Reset bulk action state
    app.bulkActionState = 'initial';

    // Re-render the dialog - _prepareContext will handle the filtering
    app.render({ force: true });
  }

  static async _onToggleFilterByDetection(event, target) {
    const app = currentHideDialog;
    if (!app) return;
    app.filterByDetection = target.checked;
    app.bulkActionState = 'initial';
    // Recompute filtered outcomes and preserve overrides before re-rendering
    try {
      const list = await app.getFilteredOutcomes();
      if (Array.isArray(list)) app.outcomes = list;
    } catch { }
    app.render({ force: true });
  }

  static async _onOverrideState() {
    // This is handled by the icon click handlers
    // Placeholder for future functionality if needed
  }

  // Use services path for apply/revert; no custom applyVisibilityChanges override needed

  // removed: updateRowButtonsToApplied duplicated; using BaseActionDialog implementation

  // removed: updateRowButtonsToReverted duplicated; using BaseActionDialog implementation

  getChangesCounterClass() {
    return 'hide-preview-dialog-changes-count';
  }

  // Static button handler methods
  static async _onClose(event, target) {
    currentHideDialog = null;
    return super._onClose?.(event, target);
  }

  static async _onApplyAll() {
    const app = currentHideDialog;

    if (!app) {
      console.error('[Hide Dialog] Could not find application instance');
      return;
    }

    // Ensure bulkActionState is initialized
    if (!app.bulkActionState) {
      app.bulkActionState = 'initial';
    }

    // Check if already applied
    if (app.bulkActionState === 'applied') {
      notify.warn(
        `${MODULE_TITLE}: Apply All has already been used. Use Revert All to undo changes.`,
      );
      return;
    }

    // Get filtered outcomes based on current filter settings
    const filteredOutcomes = await app.getFilteredOutcomes();

    // Get filtered outcomes that have actionable changes (AVS-aware)
    const changedOutcomes = filteredOutcomes.filter((outcome) => {
      const effectiveNewState = outcome.overrideState || outcome.newVisibility;
      const baseOld = outcome.oldVisibility || outcome.currentVisibility;

      if (baseOld == null || effectiveNewState == null) return false;

      // Use AVS-aware logic: allow manual override of AVS-controlled states even if same value
      const isOldStateAvsControlled = app.isOldStateAvsControlled(outcome);
      const statesMatch = effectiveNewState === baseOld;
      return (effectiveNewState !== baseOld) || (statesMatch && isOldStateAvsControlled);
    });

    if (changedOutcomes.length === 0) {
      notify.info(`${MODULE_TITLE}: No visibility changes to apply`);
      return;
    }

    // Route via services with overrides for user selections
    const overrides = {};
    const avsRemovals = [];
    for (const o of changedOutcomes) {
      const id = o?.target?.id;
      const state = o?.overrideState || o?.newVisibility;
      if (id && state) {
        if (state === 'avs') {
          // AVS selections - remove any existing overrides
          avsRemovals.push({ id, name: o.target.name });
        } else {
          overrides[id] = state;
        }
      }
    }

    // Remove AVS overrides if any
    if (avsRemovals.length > 0) {
      try {
        const { default: AvsOverrideManager } = await import(
          '../services/infra/AvsOverrideManager.js'
        );
        const hiderId = app.actionData?.actor?.document?.id || app.actionData?.actor?.id;
        if (hiderId) {
          for (const removal of avsRemovals) {
            const observerId = removal.id;
            await AvsOverrideManager.removeOverride(observerId, hiderId);
          }
          // Refresh UI to update override indicators
          const { updateTokenVisuals } = await import('../../services/visual-effects.js');
          await updateTokenVisuals();
          const names = avsRemovals.map((r) => r.name).join(', ');
          notify.info(`${MODULE_TITLE}: Accepted AVS changes for ${avsRemovals.length} token(s)`);
        }
      } catch (e) {
        console.warn('Failed to remove AVS overrides:', e);
        const names = avsRemovals.map((r) => r.name).join(', ');
        notify.info(`${MODULE_TITLE}: AVS will control visibility for ${avsRemovals.length}`);
      }
    }

    // Apply overrides only if there are any
    if (Object.keys(overrides).length > 0) {
      await (
        await import('../services/index.js')
      ).applyNowHide(
        { ...app.actionData, ignoreAllies: app.ignoreAllies, overrides },
        { html: () => { }, attr: () => { } },
      );
    }

    // Update button states
    app.bulkActionState = 'applied';
    app.updateBulkActionButtons();
    app.updateRowButtonsToApplied(changedOutcomes);
    app.updateChangesCount();
    notify.info(
      `${MODULE_TITLE}: Applied ${changedOutcomes.length} hide visibility changes. Dialog remains open for further adjustments.`,
    );
  }

  static async _onRevertAll() {
    const app = currentHideDialog;

    if (!app) {
      return;
    }

    // Ensure bulkActionState is initialized
    if (!app.bulkActionState) {
      app.bulkActionState = 'initial';
    }

    // Check if already reverted
    if (app.bulkActionState === 'reverted') {
      notify.warn(
        `${MODULE_TITLE}: Revert All has already been used. Use Apply All to reapply changes.`,
      );
      return;
    }

    try {
      const { revertNowHide } = await import('../services/index.js');
      await revertNowHide(
        { ...app.actionData, ignoreAllies: app.ignoreAllies },
        { html: () => { }, attr: () => { } },
      );
    } catch { }

    app.bulkActionState = 'reverted';
    app.updateBulkActionButtons();
    // Respect filters for UI row updates
    const filtered = await app.getFilteredOutcomes();
    app.updateRowButtonsToReverted(
      filtered.map((o) => ({ target: { id: o.target.id }, hasActionableChange: true })),
    );
    app.updateChangesCount();

    notify.info(
      `${MODULE_TITLE}: Reverted all tokens to original visibility. Dialog remains open for further adjustments.`,
    );
  }

  static async _onApplyChange(event, target) {
    const app = currentHideDialog;
    if (!app) {
      console.error('[Hide Dialog] Could not find application instance');
      return;
    }

    const tokenId = target.dataset.tokenId;
    const outcome = app.outcomes.find((o) => o.target.id === tokenId);

    if (!outcome) {
      notify.warn(`${MODULE_TITLE}: No outcome found for this token`);
      return;
    }

    // Check if there's actually a change to apply
    const effectiveNewState = outcome.overrideState || outcome.newVisibility;

    // If AVS is selected, remove any existing override
    if (effectiveNewState === 'avs') {
      try {
        const { default: AvsOverrideManager } = await import(
          '../services/infra/AvsOverrideManager.js'
        );
        const hiderId = app.actionData?.actor?.document?.id || app.actionData?.actor?.id;
        const observerId = outcome.target.id;
        if (hiderId && observerId) {
          await AvsOverrideManager.removeOverride(observerId, hiderId);
          // Refresh UI to update override indicators
          const { updateTokenVisuals } = await import('../../services/visual-effects.js');
          await updateTokenVisuals();
          notify.info(
            `${MODULE_TITLE}: Accepted AVS change for ${outcome.target.name}`,
          );
        }
      } catch (e) {
        console.warn('Failed to remove AVS override:', e);
        notify.info(`${MODULE_TITLE}: AVS will control visibility for ${outcome.target.name}`);
      }
      app.updateRowButtonsToApplied([{ target: { id: tokenId }, hasActionableChange: false }]);
      app.updateChangesCount();
      return;
    }

    // Use AVS-aware logic: allow manual override of AVS-controlled states even if same value
    const isOldStateAvsControlled = this.isOldStateAvsControlled(outcome);
    const statesMatch = effectiveNewState === outcome.oldVisibility;
    const hasChange = (effectiveNewState !== outcome.oldVisibility) || (statesMatch && isOldStateAvsControlled);

    if (!hasChange) {
      notify.warn(`${MODULE_TITLE}: No change to apply for ${outcome.target.name}`);
      return;
    }

    try {
      const overrides = { [outcome.target.id]: outcome.overrideState || outcome.newVisibility };
      await (
        await import('../services/index.js')
      ).applyNowHide(
        { ...app.actionData, ignoreAllies: app.ignoreAllies, overrides },
        { html: () => { }, attr: () => { } },
      );

      app.updateRowButtonsToApplied([{ target: { id: tokenId }, hasActionableChange: true }]);
      app.updateChangesCount();
    } catch {
      notify.error(`${MODULE_TITLE}: Error applying change for ${outcome.target.name}`);
    }
  }

  static async _onRevertChange(event, target) {
    const app = currentHideDialog;
    if (!app) {
      console.error('[Hide Dialog] Could not find application instance');
      return;
    }

    const tokenId = target.dataset.tokenId;
    const outcome = app.outcomes.find((o) => o.target.id === tokenId);

    if (!outcome) {
      notify.warn(`${MODULE_TITLE}: Could not find outcome for this token`);
      return;
    }

    try {
      const { revertNowHide } = await import('../services/index.js');
      // Pass the specific tokenId for per-row revert
      const actionDataWithTarget = {
        ...app.actionData,
        ignoreAllies: app.ignoreAllies,
        targetTokenId: tokenId,
      };
      await revertNowHide(actionDataWithTarget, { html: () => { }, attr: () => { } });

      app.updateRowButtonsToReverted([{ target: { id: tokenId }, hasActionableChange: true }]);
      app.updateChangesCount();
    } catch {
      notify.error(`${MODULE_TITLE}: Error reverting change for ${outcome.target.name}`);
    }
  }

  /**
   * Hide end-position prerequisite: concealed OR standard/greater cover
   */
  _endPositionQualifiesForHide(endPos) {
    try {
      if (!endPos) return false;
      if (
        endPos.coverState &&
        (endPos.coverState === 'standard' || endPos.coverState === 'greater')
      )
        return true;
      if (endPos.effectiveVisibility === 'concealed') return true;
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Recalculates newVisibility for an outcome based on current position qualifications
   * @param {Object} outcome - The outcome object to recalculate
   */
  async _recalculateNewVisibilityForOutcome(outcome) {
    if (!outcome || !outcome.hasPositionData) {
      return;
    }

    // Check if end position qualifies for hide
    const endQualifies = outcome.positionDisplay?.endPosition?.qualifies ?? false;

    const currentVisibility = outcome.oldVisibility || outcome.currentVisibility;
    const rollOutcome = outcome.outcome;

    let newVisibility;

    // Apply the position qualification logic for hide
    if (!endQualifies) {
      // If end position doesn't qualify for hide -> AVS (hide fails)
      newVisibility = 'avs';
    } else {
      // If position qualifies -> use stored calculated outcome or recompute from mapping
      const { getDefaultNewStateFor } = await import('../services/data/action-state-config.js');
      newVisibility =
        outcome._calculatedNewVisibility ||
        getDefaultNewStateFor('hide', currentVisibility, rollOutcome) ||
        currentVisibility;
    }

    // Update the outcome
    outcome.newVisibility = newVisibility;

    // Update UI to reflect the change
    const row = this.element?.querySelector(`tr[data-token-id="${outcome.target.id}"]`);
    if (row) {
      // Update visibility state indicators
      const container = row.querySelector('.override-icons');
      if (container) {
        container.querySelectorAll('.state-icon').forEach((i) => i.classList.remove('selected'));
        const iconEl =
          container.querySelector(`.state-icon[data-state="${newVisibility}"]`) ||
          container.querySelector('.state-icon[data-state="observed"]');
        if (iconEl) iconEl.classList.add('selected');
      }

      // Update action button states
      const effectiveNew = outcome.overrideState || outcome.newVisibility;
      const oldState = outcome.oldVisibility || outcome.currentVisibility;
      const isOldStateAvsControlled = this.isOldStateAvsControlled(outcome);

      // Special case: If current state is AVS-controlled and override is 'avs', no change
      if (outcome.overrideState === 'avs' && this.isCurrentStateAvsControlled(outcome)) {
        outcome.hasActionableChange = false;
      } else {
        // If old state matches new state, check if old state was AVS-controlled
        // If it was AVS-controlled, we should still apply the manual override
        const statesMatch = effectiveNew != null && oldState != null && effectiveNew === oldState;
        outcome.hasActionableChange =
          (effectiveNew != null && oldState != null && effectiveNew !== oldState) ||
          (statesMatch && isOldStateAvsControlled);
      }
      this.updateActionButtonsForToken(outcome.target.id, outcome.hasActionableChange);
    }
  }

  static async _onTogglePrequisite(event, target) {
    const app = currentHideDialog;
    if (!app) return;

    const tokenId = target.dataset.tokenId;
    if (!tokenId) return;
    const outcome = app.outcomes.find((o) => o.target.id === tokenId);
    if (!outcome || !outcome.hasPositionData) return;

    const position = outcome.positionDisplay?.endPosition;
    if (!position) return;

    // Toggle the qualification status
    const currentQualifies = position.qualifies;
    position.qualifies = !currentQualifies;

    // Update button visual state
    const icon = target.querySelector('i');
    if (position.qualifies) {
      target.className = 'position-requirement-btn position-check active';
      if (icon) icon.className = 'fas fa-check';
      target.setAttribute('data-tooltip', 'Prerequisite met');
    } else {
      target.className = 'position-requirement-btn position-x';
      if (icon) icon.className = 'fas fa-times';
      target.setAttribute('data-tooltip', 'Prerequisite not met');
    }

    // Recalculate visibility: if not qualified → AVS; else restore calculated outcome
    if (!position.qualifies) {
      outcome.newVisibility = 'avs';
      outcome.overrideState = null;
    } else {
      // Use stored calculated outcome or recompute from mapping
      try {
        const oldState = outcome.oldVisibility || outcome.currentVisibility;
        const restored =
          outcome._calculatedNewVisibility ||
          getDefaultNewStateFor('hide', oldState, outcome.outcome) ||
          oldState;
        outcome.newVisibility = restored;
        // If there is no explicit override, sync override to calculated for UI selection
        if (outcome.overrideState == null) {
          outcome.overrideState = restored;
        }
      } catch {
        // Fallback: keep whatever newVisibility was
      }
    }

    // Update row state indicators and action buttons
    try {
      const row = app.element.querySelector(`tr[data-token-id="${tokenId}"]`);
      if (row) {
        const container = row.querySelector('.override-icons');
        if (container) {
          container.querySelectorAll('.state-icon').forEach((i) => i.classList.remove('selected'));
          // Select the effective state icon for clarity
          const effective = outcome.overrideState || outcome.newVisibility;
          const iconEl =
            container.querySelector(`.state-icon[data-state="${effective}"]`) ||
            container.querySelector('.state-icon[data-state="observed"]');
          if (iconEl) iconEl.classList.add('selected');
        }
        const effectiveNew = outcome.overrideState || outcome.newVisibility;
        const oldState = outcome.oldVisibility || outcome.currentVisibility;
        const isOldStateAvsControlled = app.isOldStateAvsControlled(outcome);

        // Special case: If current state is AVS-controlled and override is 'avs', no change
        if (outcome.overrideState === 'avs' && this.isCurrentStateAvsControlled(outcome)) {
          outcome.hasActionableChange = false;
        } else {
          // If old state matches new state, check if old state was AVS-controlled
          // If it was AVS-controlled, we should still apply the manual override
          const statesMatch = effectiveNew != null && oldState != null && effectiveNew === oldState;
          outcome.hasActionableChange =
            (effectiveNew != null && oldState != null && effectiveNew !== oldState) ||
            (statesMatch && isOldStateAvsControlled);
        }
        app.updateActionButtonsForToken(tokenId, outcome.hasActionableChange);
      }
    } catch { }

    // Recalculate newVisibility based on updated position qualifications
    await app._recalculateNewVisibilityForOutcome(outcome);

    // Apply the visibility change immediately for responsive feedback
    try {
      const effectiveVisibility = outcome.overrideState || outcome.newVisibility;
      const hidingActor = app.actionData?.actor;
      const observerToken = outcome.target;

      if (hidingActor && observerToken && effectiveVisibility) {
        // Import required modules
        const { setVisibilityBetween } = await import('../../stores/visibility-map.js');
        const AvsOverrideManager = (await import('../services/infra/AvsOverrideManager.js'))
          .default;

        // Find the hiding token
        const hidingToken = canvas.tokens?.placeables?.find((t) => t.actor?.id === hidingActor.id);

        if (hidingToken) {
          // Set AVS override to prevent automatic recalculation
          try {
            await AvsOverrideManager.applyOverrides(
              observerToken,
              {
                target: hidingToken,
                state: effectiveVisibility,
              },
              {
                source: 'hide_action',
              },
            );
          } catch (avsError) {
            console.warn(
              'PF2E Visioner | Failed to set AVS override for hide prerequisite toggle:',
              avsError,
            );
          }

          // Apply the immediate visibility change
          await setVisibilityBetween(observerToken, hidingToken, effectiveVisibility);
        }
      }
    } catch (applyError) {
      console.warn('PF2E Visioner | Failed to apply immediate visibility change:', applyError);
    }
  }

  // Bulk override action handlers

  static _onBulkOverrideSet(event, target) {
    const app = currentHideDialog;
    if (!app) return;
    app._onBulkOverrideSet(event);
  }

  static _onBulkOverrideClear(event, target) {
    const app = currentHideDialog;
    if (!app) return;
    app._onBulkOverrideClear();
  }

  /**
   * Check if the old visibility state is AVS-controlled (no manual override exists)
   * @param {Object} outcome - The outcome object containing target and observer information
   * @returns {boolean} True if the old state is AVS-controlled
   */
  isOldStateAvsControlled(outcome) {
    try {
      // Check if AVS is enabled
      const avsEnabled = game.settings.get('pf2e-visioner', 'autoVisibilityEnabled');
      if (!avsEnabled) return false;

      // In hide actions: outcome.target is the observer, this.actorToken is the target being hidden
      const hidingToken = this.actorToken; // The token that's hiding
      const observer = outcome.target; // The token observing the hiding token

      if (!hidingToken || !observer) return false;

      // Check for manual override flag on the hiding token from this observer
      // The flag indicates if this observer has manually overridden the visibility of the hiding token
      const observerId = observer.document?.id || observer.id;
      const flagKey = `avs-override-from-${observerId}`;
      const hasOverride = !!hidingToken.document?.getFlag('pf2e-visioner', flagKey); return !hasOverride; // If no override exists, AVS is controlling
    } catch (error) {
      console.warn('Error checking if old state is AVS-controlled:', error);
      return false; // Default to not AVS-controlled on error
    }
  }

  /**
   * Check if the current visibility state is AVS-controlled (no manual override exists)
   * @param {Object} outcome - The outcome object containing target and observer information
   * @returns {boolean} True if the current state is AVS-controlled
   */
  isCurrentStateAvsControlled(outcome) {
    try {
      // Check if AVS is enabled
      const avsEnabled = game.settings.get('pf2e-visioner', 'autoVisibilityEnabled');
      if (!avsEnabled) return false;

      // In hide actions: outcome.target is the observer, this.actorToken is the target being hidden
      const hidingToken = this.actorToken; // The token that's hiding
      const observer = outcome.target; // The token observing the hiding token

      if (!hidingToken || !observer) return false;

      // Check for manual override flag on the hiding token from this observer
      const hasOverride = !!hidingToken.document?.getFlag(
        'pf2e-visioner',
        `avs-override-from-${observer.document?.id || observer.id}`,
      );

      return !hasOverride; // If no override exists, AVS is controlling
    } catch (error) {
      console.warn('Error checking if current state is AVS-controlled:', error);
      return false; // Default to not AVS-controlled on error
    }
  }
}
