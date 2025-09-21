/**
 * Seek Preview Dialog for Seek action automation
 * Uses ApplicationV2 for modern FoundryVTT compatibility
 */

import { MODULE_ID, MODULE_TITLE, REACTIONS } from '../../constants.js';
import { getVisibilityBetween } from '../../utils.js';
import { getDesiredOverrideStatesForAction } from '../services/data/action-state-config.js';
import { notify } from '../services/infra/notifications.js';
import {
  filterOutcomesBySeekDistance,
  filterOutcomesByTemplate,
} from '../services/infra/shared-utils.js';
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
      title: 'Seek Results',
      icon: 'fas fa-search',
      resizable: true,
    },
    position: {
      width: 600,
      height: 'auto',
    },
    actions: {
      close: SeekPreviewDialog._onClose,
      applyAll: SeekPreviewDialog._onApplyAll,
      revertAll: SeekPreviewDialog._onRevertAll,
      applyChange: SeekPreviewDialog._onApplyChange,
      revertChange: SeekPreviewDialog._onRevertChange,
      toggleEncounterFilter: SeekPreviewDialog._onToggleEncounterFilter,
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
      title: 'Action Results',
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

    // Set global reference
    _currentSeekDialogInstance = this;
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

    // Start from original list so re-renders can re-include allies when the checkbox is unchecked
    const baseList = Array.isArray(this._originalOutcomes)
      ? this._originalOutcomes
      : this.outcomes || [];
    // Filter outcomes with encounter helper, ally filtering, optional walls toggle, template (if provided), then distance limits if enabled
    let filteredOutcomes = this.applyEncounterFilter(
      baseList,
      'target',
      'No encounter targets found, showing all',
    );
    // Apply ally filtering for display purposes
    try {
      if (this.actorToken) {
        const { filterOutcomesByAllies } = await import('../services/infra/shared-utils.js');
        filteredOutcomes = filterOutcomesByAllies(
          filteredOutcomes,
          this.actorToken,
          this.ignoreAllies,
          'target',
        );
      }
    } catch { }
    // Optional walls exclusion for UI convenience
    if (this.ignoreWalls === true) {
      filteredOutcomes = Array.isArray(filteredOutcomes)
        ? filteredOutcomes.filter((o) => !o?._isWall && !o?.wallId)
        : filteredOutcomes;
    }
    if (this.actionData.seekTemplateCenter && this.actionData.seekTemplateRadiusFeet) {
      filteredOutcomes = filterOutcomesByTemplate(
        filteredOutcomes,
        this.actionData.seekTemplateCenter,
        this.actionData.seekTemplateRadiusFeet,
        'target',
      );
    }
    if (this.actorToken) {
      filteredOutcomes = filterOutcomesBySeekDistance(filteredOutcomes, this.actorToken, 'target');
    }

    // Prepare visibility states using centralized config
    const cfg = (s) => this.visibilityConfig(s);

    // Preserve any GM override selections from the previously displayed list
    try {
      const previous = Array.isArray(this.outcomes) ? this.outcomes : [];
      filteredOutcomes = filteredOutcomes.map((o) => {
        const existing =
          o?._isWall && o?.wallId
            ? previous.find((x) => x?._isWall && x?.wallId === o.wallId)
            : previous.find((x) => x?.target?.id === o?.target?.id);
        const overrideState = existing?.overrideState ?? o?.overrideState ?? null;
        return { ...o, overrideState };
      });
    } catch { }

    // Prepare outcomes for template
    let processedOutcomes = await Promise.all(
      filteredOutcomes.map(async (outcome) => {
        // Get current visibility state; walls use their stored state instead of token-vs-token
        let currentVisibility = outcome.oldVisibility || outcome.currentVisibility;
        let live = null;
        if (!outcome._isWall) {
          try {
            if (this.actorToken) {
              live = getVisibilityBetween(this.actorToken, outcome.target);
              currentVisibility = live || currentVisibility;
            }
            // If no explicit mapping exists and GM requested system-conditions sync, infer from PF2e conditions
            if ((!live || live === 'observed') && game.user?.isGM) {
              const actor = outcome.target?.actor;
              const hasHidden =
                !!actor?.conditions?.get?.('hidden') ||
                !!actor?.itemTypes?.condition?.some?.((c) => c?.slug === 'hidden');
              const hasUndetected = !!actor?.itemTypes?.condition?.some?.(
                (c) => c?.slug === 'undetected',
              );
              if (hasUndetected || hasHidden) {
                const { setVisibilityBetween } = await import('../../utils.js');
                const inferred = hasUndetected ? 'undetected' : 'hidden';

                // Sync visibility for ALL PC tokens that don't already have a Visioner visibility mapping
                const allPCTokens =
                  canvas.tokens?.placeables?.filter(
                    (t) => t.actor?.type === 'character' && t.actor?.hasPlayerOwner,
                  ) || [];

                for (const pcToken of allPCTokens) {
                  // Skip if this PC already has a Visioner visibility mapping to the target
                  const existingVisibility = getVisibilityBetween(pcToken, outcome.target);
                  if (!existingVisibility || existingVisibility === 'observed') {
                    try {
                      await setVisibilityBetween(pcToken, outcome.target, inferred, {
                        direction: 'observer_to_target',
                      });
                    } catch { }
                  }
                }

                // Also set the current seeker's visibility
                try {
                  await setVisibilityBetween(this.actorToken, outcome.target, inferred, {
                    direction: 'observer_to_target',
                  });
                } catch { }

                // Remove PF2e system condition to avoid double-state after Visioner owns it
                try {
                  const slug = hasUndetected ? 'undetected' : 'hidden';
                  // Prefer the PF2e pf2e.condition automation API if present
                  const toRemove = actor?.itemTypes?.condition?.find?.((c) => c?.slug === slug);
                  if (toRemove?.delete) await toRemove.delete();
                  else if (actor?.toggleCondition)
                    await actor.toggleCondition(slug, { active: false });
                  else if (actor?.decreaseCondition) await actor.decreaseCondition(slug);
                } catch { }
                currentVisibility = inferred;
                // Ensure in-memory outcomes reflect the actual new mapping right away
                outcome.oldVisibility = currentVisibility;
                outcome.newVisibility = currentVisibility;
              }
            }
          } catch { }
        }

        // Prepare available states for override using per-action config
        const desired = getDesiredOverrideStatesForAction('seek');
        const availableStates = this.buildOverrideStates(desired, outcome);

        const effectiveNewState =
          outcome.overrideState || outcome.newVisibility || currentVisibility;
        // Prefer the recorded oldVisibility as the baseline; fall back to current live mapping
        const baseOldState =
          outcome.oldVisibility != null ? outcome.oldVisibility : currentVisibility;
        // Actionable if original differs from new or override
        const hasActionableChange =
          baseOldState != null && effectiveNewState != null && effectiveNewState !== baseOldState;

        return {
          ...outcome,
          outcomeClass: outcome.noProficiency ? 'neutral' : this.getOutcomeClass(outcome.outcome),
          outcomeLabel: outcome.noProficiency
            ? 'No proficiency'
            : this.getOutcomeLabel(outcome.outcome),
          oldVisibilityState: cfg(baseOldState),
          newVisibilityState: cfg(effectiveNewState),
          marginText: this.formatMargin(outcome.margin),
          tokenImage: this.resolveTokenImage(outcome.target),
          availableStates: availableStates,
          overrideState: outcome.overrideState || outcome.newVisibility,
          hasActionableChange,
          noProficiency: !!outcome.noProficiency,
        };
      }),
    );

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

    // Update original outcomes with hasActionableChange for Apply All button logic
    processedOutcomes.forEach((processedOutcome, index) => {
      if (this.outcomes[index]) {
        this.outcomes[index].hasActionableChange = processedOutcome.hasActionableChange;
      }
    });

    // Set actor context for seeker
    // Detect all special senses on seeker (capabilities)
    let activeSenses = [];
    try {
      const { VisionAnalyzer } = await import('../../visibility/auto-visibility/VisionAnalyzer.js');
      const { SPECIAL_SENSES } = await import('../../constants.js');
      const visionAnalyzer = VisionAnalyzer.getInstance();
      const sensingSummary = visionAnalyzer.getSensingSummary(this.actorToken);

      // Check for echolocation via effect item first (legacy support)
      const effects = this.actorToken?.actor?.itemTypes?.effect ?? [];
      const hasEchoEffect = !!effects?.some?.(
        (e) => (e?.slug || e?.system?.slug || e?.name)?.toLowerCase?.() === 'effect-echolocation',
      );
      if (hasEchoEffect) {
        activeSenses.push({
          type: 'echolocation',
          range: 40,
          config: SPECIAL_SENSES.echolocation,
        });
      } else {
        // Check for echolocation via flag (legacy support)
        const flag = this.actorToken?.actor?.getFlag?.('pf2e-visioner', 'echolocation');
        if (flag?.active) {
          activeSenses.push({
            type: 'echolocation',
            range: Number(flag.range) || 40,
            config: SPECIAL_SENSES.echolocation,
          });
        }
      }

      // Check for all special senses from sensing summary
      for (const [senseType, senseConfig] of Object.entries(SPECIAL_SENSES)) {
        if (sensingSummary[senseType]) {
          // Avoid duplicate echolocation if already added via effect/flag
          if (senseType === 'echolocation' && activeSenses.some((s) => s.type === 'echolocation')) {
            continue;
          }

          activeSenses.push({
            type: senseType,
            range: sensingSummary[senseType].range,
            config: senseConfig,
          });
        }
      }
    } catch { }

    // Only show imprecise sense badges if they were ACTUALLY used by at least one outcome
    try {
      const usedTypes = new Set(
        (processedOutcomes || [])
          .filter((o) => o?.usedImprecise && typeof o?.usedImpreciseSenseType === 'string')
          .map((o) => o.usedImpreciseSenseType),
      );
      if (usedTypes.size > 0) {
        // Filter to only the imprecise senses that were used in any row
        activeSenses = activeSenses.filter((s) => usedTypes.has(s.type));
      } else {
        // If no imprecise sense was used, hide the badges entirely to avoid confusion
        activeSenses = null;
      }
    } catch { }

    context.seeker = {
      name: this.actorToken?.name || 'Unknown Actor',
      image: this.resolveTokenImage(this.actorToken),
      actionType: 'seek',
      actionLabel: 'Seek action results analysis',
    };
    context.activeSenses = activeSenses;

    // Legacy support for existing template logic
    const echolocationSense = activeSenses?.find?.((s) => s.type === 'echolocation');
    const lifesenseSense = activeSenses?.find?.((s) => s.type === 'lifesense');
    context.echolocationActive = !!echolocationSense;
    context.echolocationRange = echolocationSense?.range || 0;
    context.lifesenseActive = !!lifesenseSense;
    context.lifesenseRange = lifesenseSense?.range || 0;

    // Reactions system - check for available reactions
    const availableReactions = this.getAvailableReactions(processedOutcomes);
    context.availableReactions = availableReactions;
    context.hasReactions = availableReactions.length > 0;

    // No noisy environment indicator (feature removed)
    context.outcomes = processedOutcomes;
    context.ignoreWalls = !!this.ignoreWalls;
    context.ignoreAllies = !!this.ignoreAllies;
    context.hideFoundryHidden = !!this.hideFoundryHidden;

    // Keep original outcomes intact; provide common context from processed list
    this.outcomes = processedOutcomes;

    Object.assign(context, this.buildCommonContext(processedOutcomes));

    return context;
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
    // Hook up per-dialog Ignore Allies toggle
    try {
      const cb = content.querySelector('input[data-action="toggleIgnoreAllies"]');
      if (cb) {
        cb.addEventListener('change', () => {
          this.ignoreAllies = !!cb.checked;
          this.bulkActionState = 'initial';
          // Recompute outcomes and update UI without losing overrides
          this.getFilteredOutcomes()
            .then((list) => {
              this.outcomes = list;
              this.render({ force: true });
            })
            .catch(() => this.render({ force: true }));
        });
      }
    } catch { }
    // Hook up per-dialog Ignore Walls toggle
    try {
      const cbw = content.querySelector('input[data-action="toggleIgnoreWalls"]');
      if (cbw) {
        cbw.addEventListener('change', () => {
          this.ignoreWalls = !!cbw.checked;
          this.bulkActionState = 'initial';
          // Recompute outcomes and update UI without losing overrides
          this.getFilteredOutcomes()
            .then((list) => {
              this.outcomes = list;
              this.render({ force: true });
            })
            .catch(() => this.render({ force: true }));
        });
      }
    } catch { }
    // Hook up Hide Foundry-hidden visual filter
    try {
      const cbh = content.querySelector('input[data-action="toggleHideFoundryHidden"]');
      if (cbh) {
        cbh.addEventListener('change', async () => {
          this.hideFoundryHidden = !!cbh.checked;
          try {
            await game.settings.set(MODULE_ID, 'hideFoundryHiddenTokens', this.hideFoundryHidden);
          } catch { }
          this.render({ force: true });
        });
      }
    } catch { }

    // Hook up reactions system
    try {
      // Reactions toggle button
      const reactionsToggleBtn = content.querySelector('button[data-action="toggleReactions"]');
      if (reactionsToggleBtn) {
        reactionsToggleBtn.addEventListener('click', () => {
          this.toggleReactionsDropdown();
        });
      }

      // Individual reaction buttons
      const reactionButtons = content.querySelectorAll('button[data-reaction]');
      reactionButtons.forEach((button) => {
        button.addEventListener('click', async () => {
          const reactionKey = button.dataset.reaction;
          await this.applyReaction(reactionKey);
        });
      });
    } catch { }

    // Hook up Sense the Unseen button (deprecated - for backward compatibility)
    try {
      const senseUnseenBtn = content.querySelector('button[data-action="applySenseUnseen"]');
      if (senseUnseenBtn) {
        senseUnseenBtn.addEventListener('click', async () => {
          await this.applySenseUnseen();
        });
      }
    } catch { }
    return content;
  }

  /**
   * Compute filtered outcomes honoring current toggles
   */
  async getFilteredOutcomes() {
    try {
      const baseList = Array.isArray(this._originalOutcomes)
        ? this._originalOutcomes
        : this.outcomes || [];

      let filtered = this.applyEncounterFilter(
        baseList,
        'target',
        'No encounter targets found, showing all',
      );

      // Ally filter via live checkbox
      try {
        if (this.actorToken) {
          const { filterOutcomesByAllies } = await import('../services/infra/shared-utils.js');
          filtered = filterOutcomesByAllies(filtered, this.actorToken, this.ignoreAllies, 'target');
        }
      } catch { }

      // Optional walls exclusion for UI convenience
      if (this.ignoreWalls === true) {
        filtered = Array.isArray(filtered)
          ? filtered.filter((o) => !o?._isWall && !o?.wallId)
          : filtered;
      }

      // Template filter if provided
      if (this.actionData.seekTemplateCenter && this.actionData.seekTemplateRadiusFeet) {
        try {
          const { filterOutcomesByTemplate } = await import('../services/infra/shared-utils.js');
          filtered = filterOutcomesByTemplate(
            filtered,
            this.actionData.seekTemplateCenter,
            this.actionData.seekTemplateRadiusFeet,
            'target',
          );
        } catch { }
      }

      // Seek distance limits
      try {
        if (this.actorToken) {
          const { filterOutcomesBySeekDistance } = await import(
            '../services/infra/shared-utils.js'
          );
          filtered = filterOutcomesBySeekDistance(filtered, this.actorToken, 'target');
        }
      } catch { }
      // Compute actionability and carry over any existing overrides from the currently displayed outcomes
      if (!Array.isArray(filtered)) return [];
      const processed = filtered.map((o) => {
        try {
          // Preserve any override chosen by the user for the same token/wall
          let existing = null;
          if (o?._isWall && o?.wallId) {
            existing = (this.outcomes || []).find((x) => x?.wallId === o.wallId);
          } else {
            const tid = o?.target?.id;
            existing = (this.outcomes || []).find((x) => x?.target?.id === tid);
          }
          const overrideState = existing?.overrideState ?? o?.overrideState ?? null;
          // Determine baseline/current visibility
          let currentVisibility = o.oldVisibility || o.currentVisibility || null;
          if (!o?._isWall) {
            try {
              if (this.actorToken) {
                currentVisibility =
                  getVisibilityBetween(this.actorToken, o.target) || currentVisibility;
              }
            } catch { }
          }
          const effectiveNewState = overrideState || o.newVisibility || currentVisibility;
          const baseOldState = o.oldVisibility || currentVisibility;
          const hasActionableChange =
            baseOldState != null && effectiveNewState != null && effectiveNewState !== baseOldState;
          return { ...o, overrideState, hasActionableChange };
        } catch {
          return { ...o };
        }
      });
      // Visual filtering: hide Foundry-hidden tokens from display if enabled
      let visual = processed;
      try {
        if (this.hideFoundryHidden) {
          visual = processed.filter((o) => {
            try {
              return o?._isWall || o?.target?.document?.hidden !== true;
            } catch {
              return true;
            }
          });
        }
      } catch { }
      // Apply show-only-changes filter for both UI and Apply All
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
    const app = _currentSeekDialogInstance;

    if (!app) {
      return;
    }

    // Recompute filtered outcomes from original list using current toggles
    let filteredOutcomes = await app.getFilteredOutcomes();

    // Only apply changes to filtered outcomes
    const actionableOutcomes = filteredOutcomes.filter((outcome) => outcome.hasActionableChange);

    if (actionableOutcomes.length === 0) {
      notify.info('No changes to apply');
      return;
    }

    // Check if Apply All is allowed based on current state
    if (app.bulkActionState === 'applied') {
      notify.warn(
        `${MODULE_TITLE}: Apply All has already been used. Use Revert All to undo changes.`,
      );
      return;
    }

    // Provide overrides map to services path
    const overrides = {};
    const wallOverrides = {};
    for (const o of actionableOutcomes) {
      const state = o?.overrideState || o?.newVisibility;
      if (o?._isWall && o?.wallId) {
        if (state) wallOverrides[o.wallId] = state;
      } else {
        const id = o?.target?.id;
        if (id && state) overrides[id] = state;
      }
    }

    try {
      const { applyNowSeek } = await import('../services/index.js');
      const payload = { ...app.actionData, ignoreAllies: app.ignoreAllies };
      if (!app.ignoreWalls && Object.keys(wallOverrides).length > 0) {
        payload.overrides = { ...overrides, __wall__: wallOverrides };
      } else {
        payload.overrides = overrides;
      }
      // Pass current live ignoreAllies so discovery in apply respects checkbox state
      const appliedCount = await applyNowSeek(payload, { html: () => { }, attr: () => { } });
      notify.info(
        `${MODULE_TITLE}: Applied ${appliedCount ?? actionableOutcomes.length} visibility changes. Dialog remains open for additional actions.`,
      );

      // Update individual row buttons to show applied state
      app.updateRowButtonsToApplied(actionableOutcomes);

      // Update bulk action state and buttons
      app.bulkActionState = 'applied';
      app.updateBulkActionButtons();
      app.updateChangesCount();

      // Don't close dialog - allow user to continue working
    } catch {
      notify.error(`${MODULE_TITLE}: Error applying changes.`);
    }
  }

  /**
   * Revert all changes to original state
   */
  static async _onRevertAll() {
    const app = _currentSeekDialogInstance;
    if (!app) return;

    try {
      // Recompute filtered outcomes from original list using current toggles
      let filteredOutcomes = await app.getFilteredOutcomes();

      const changedOutcomes = filteredOutcomes.filter(
        (outcome) => outcome.changed && outcome.hasActionableChange,
      );

      const { revertNowSeek } = await import('../services/index.js');
      await revertNowSeek(
        { ...app.actionData, ignoreAllies: app.ignoreAllies },
        { html: () => { }, attr: () => { } },
      );

      app.updateRowButtonsToReverted(changedOutcomes);
      app.bulkActionState = 'reverted';
      app.updateBulkActionButtons();
      app.updateChangesCount();
    } catch (error) {
      console.error(`${MODULE_TITLE}: Error reverting changes:`, error);
      notify.error(`${MODULE_TITLE}: Error reverting changes.`);
    }
  }

  /**
   * Apply individual visibility change
   */
  static async _onApplyChange(event, button) {
    const app = _currentSeekDialogInstance;
    if (!app) return;

    const tokenId = button.dataset.tokenId;
    const wallId = button.dataset.wallId;
    let outcome = null;
    if (wallId) outcome = app.outcomes.find((o) => o._isWall && o.wallId === wallId);
    else outcome = app.outcomes.find((o) => o.target.id === tokenId);

    if (!outcome || !outcome.hasActionableChange) {
      notify.warn(`${MODULE_TITLE}: No change to apply for this ${wallId ? 'wall' : 'token'}`);
      return;
    }

    try {
      const { applyNowSeek } = await import('../services/index.js');
      // Use a clean actionData copy without template limits (the row was already filtered by the dialog)
      const actionData = {
        ...app.actionData,
        ignoreAllies: app.ignoreAllies,
        encounterOnly: app.encounterOnly,
      };
      delete actionData.seekTemplateCenter;
      delete actionData.seekTemplateRadiusFeet;

      // For walls, pass a dedicated overrides shape the handler recognizes via outcomeToChange
      if (outcome._isWall && outcome.wallId) {
        const overrides = {
          __wall__: { [outcome.wallId]: outcome.overrideState || outcome.newVisibility },
        };
        await applyNowSeek({ ...actionData, overrides }, { html: () => { }, attr: () => { } });
        // Disable the row's Apply button for this wall
        app.updateRowButtonsToApplied([{ wallId: outcome.wallId }]);
      } else {
        const overrides = { [outcome.target.id]: outcome.overrideState || outcome.newVisibility };
        await applyNowSeek({ ...actionData, overrides }, { html: () => { }, attr: () => { } });
        // Disable the row's Apply button for this token
        app.updateRowButtonsToApplied([{ target: { id: outcome.target.id } }]);
      }

      app.updateChangesCount();
    } catch {
      notify.error(`${MODULE_TITLE}: Error applying change.`);
    }
  }

  /**
   * Revert individual token to original state
   */
  static async _onRevertChange(event, button) {
    const app = _currentSeekDialogInstance;
    if (!app) return;

    const tokenId = button.dataset.tokenId;
    const wallId = button.dataset.wallId;
    let outcome = null;
    if (wallId) outcome = app.outcomes.find((o) => o._isWall && o.wallId === wallId);
    else outcome = app.outcomes.find((o) => o.target.id === tokenId);

    if (!outcome) {
      notify.warn(`${MODULE_TITLE}: ${wallId ? 'Wall' : 'Token'} not found`);
      return;
    }

    try {
      // Apply the original visibility state for just this specific token/wall
      if (outcome._isWall) {
        // For walls, revert wall visibility
        const { updateWallVisuals } = await import('../../services/visual-effects.js');
        await updateWallVisuals(outcome.wall, outcome.oldVisibility || 'observed');
      } else {
        // For tokens, apply the original visibility state
        const revertVisibility = outcome.oldVisibility || outcome.currentVisibility;

        // Check if we have a valid actor for the revert operation
        if (app.actionData?.actor) {
          // Use the original applyVisibilityChanges if actor is available
          const { applyVisibilityChanges } = await import('../services/infra/shared-utils.js');
          const changes = [{ target: outcome.target, newVisibility: revertVisibility }];

          await applyVisibilityChanges(app.actionData.actor, changes, {
            direction: 'observer_to_target',
          });
        } else {
          // Fallback: directly update token visibility when actor is not available
          // This handles the case where actionData.actor becomes undefined after apply-all
          const { updateTokenVisuals } = await import('../../services/visual-effects.js');
          const { setVisibilityBetween } = await import('../../utils.js');

          // Use the current user's controlled token as fallback observer, or canvas.tokens.controlled[0]
          const fallbackObserver =
            canvas.tokens.controlled[0] || game.user.character?.getActiveTokens()[0];

          if (fallbackObserver) {
            await setVisibilityBetween(fallbackObserver, outcome.target, revertVisibility, {
              direction: 'observer_to_target',
            });
          }

          // Update the target token's visuals directly
          await updateTokenVisuals(outcome.target);
        }
      }

      app.updateRowButtonsToReverted([
        { target: { id: outcome._isWall ? null : outcome.target.id }, wallId },
      ]);
      app.updateChangesCount();
    } catch {
      notify.error(`${MODULE_TITLE}: Error reverting change.`);
    }
  }

  /**
   * Update the changes count display dynamically
   */
  // removed: updateChangesCount duplicated; using BaseActionDialog implementation

  /**
   * Override close to clear global reference
   */
  close(options) {
    // Clean up only auto-created preview templates (not manual, which we delete immediately on placement)
    try {
      if (this.templateId && canvas.scene && !this.templateCenter) {
        const doc =
          canvas.scene.templates?.get?.(this.templateId) ||
          canvas.scene.getEmbeddedDocument?.('MeasuredTemplate', this.templateId);
        if (doc) {
          canvas.scene.deleteEmbeddedDocuments('MeasuredTemplate', [this.templateId]);
        }
      }
    } catch (e) {
      console.warn('Failed to remove Seek preview template:', e);
    }
    // Remove selection hook
    if (this._selectionHookId) {
      try {
        Hooks.off('controlToken', this._selectionHookId);
      } catch { }
      this._selectionHookId = null;
    }
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
    return outcome?.target?.id ?? null;
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
    const dropdown = this.element?.querySelector('.reactions-dropdown');
    const chevron = this.element?.querySelector('.reactions-chevron');
    const toggleButton = this.element?.querySelector('.reactions-toggle-button');

    if (!dropdown) return;

    const isVisible = dropdown.style.display !== 'none';

    if (isVisible) {
      // Hide dropdown
      dropdown.style.display = 'none';
      chevron?.classList.remove('rotated');
      toggleButton?.classList.remove('active');
    } else {
      // Show dropdown
      dropdown.style.display = 'block';
      chevron?.classList.add('rotated');
      toggleButton?.classList.add('active');
    }
  }

  /**
   * Get available reactions for the current context
   */
  getAvailableReactions(outcomes) {
    const actor = this.actorToken?.actor;
    if (!actor) return [];

    const context = { actor, outcomes, dialog: this };
    const availableReactions = [];

    // Check each reaction for availability
    for (const [key, reaction] of Object.entries(REACTIONS)) {
      try {
        if (reaction.isAvailable && reaction.isAvailable(context)) {
          availableReactions.push({
            ...reaction,
            key,
            applied: this._appliedReactions?.has?.(key) || false,
          });
        }
      } catch (error) {
        console.warn(`Error checking availability for reaction ${key}:`, error);
      }
    }

    return availableReactions;
  }

  /**
   * Apply a specific reaction
   */
  async applyReaction(reactionKey) {
    const reaction = REACTIONS[reactionKey];
    if (!reaction) {
      console.error(`Unknown reaction: ${reactionKey}`);
      return;
    }

    // Prevent multiple applications
    if (!this._appliedReactions) {
      this._appliedReactions = new Set();
    }

    if (this._appliedReactions.has(reactionKey)) {
      notify.info(`${game.i18n.localize(reaction.name)} has already been applied.`);
      return;
    }

    try {
      const context = {
        actor: this.actorToken?.actor,
        outcomes: this.outcomes,
        dialog: this,
      };

      const result = await reaction.apply(context);

      if (result.success) {
        // Mark reaction as applied
        this._appliedReactions.add(reactionKey);

        // Reprocess outcomes to update display properties
        await this.getFilteredOutcomes().then((reprocessedOutcomes) => {
          this.outcomes = reprocessedOutcomes;
        });

        // Force a re-render to update the UI with new states
        await this.render({ force: true });

        // Update UI to show applied state after re-render
        this.updateReactionButton(reactionKey, true);

        // Update the reactions toggle button to stop animation if no more reactions are available
        this.updateReactionsToggleButton();

        notify.info(result.message);
      } else {
        notify.warn(result.message);
      }
    } catch (error) {
      console.error(`Error applying reaction ${reactionKey}:`, error);
      notify.error(`Error applying ${game.i18n.localize(reaction.name)}.`);
    }
  }

  /**
   * Update a reaction button to show applied state
   */
  updateReactionButton(reactionKey, applied) {
    const button = this.element?.querySelector(`[data-reaction="${reactionKey}"]`);
    if (!button) return;

    if (applied) {
      button.classList.add('applied');
      button.disabled = true;

      const reaction = REACTIONS[reactionKey];
      const appliedText = `${game.i18n.localize(reaction.name)} Applied`;
      button.innerHTML = `<i class="fas fa-check-circle"></i><span class="button-label">${appliedText}</span>`;

      // Apply green styling
      button.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%)';
      button.style.cursor = 'not-allowed';
      button.style.opacity = '0.9';
    }
  }

  /**
   * Updates the reactions toggle button state based on available reactions
   */
  updateReactionsToggleButton() {
    const toggleButton = this.element?.querySelector('.reactions-toggle-button');
    if (!toggleButton) return;

    // Check if there are any available (non-applied) reactions
    const availableReactions = this.getAvailableReactions(this.outcomes);
    const hasAvailableReactions = availableReactions.some((reaction) => !reaction.applied);

    if (hasAvailableReactions) {
      // Keep the animation
      toggleButton.classList.add('has-available');
    } else {
      // Stop the animation
      toggleButton.classList.remove('has-available');
    }
  }

  /**
   * Update outcome rows to reflect changes
   */
  updateOutcomeRows(affectedOutcomes) {
    for (const outcome of affectedOutcomes) {
      const targetId = outcome.target?.id;
      if (targetId) {
        const row = this.element?.querySelector(`tr[data-target-id="${targetId}"]`);
        if (row) {
          // Update the visibility cell
          const visibilityCell = row.querySelector('.visibility-change');
          if (visibilityCell) {
            visibilityCell.textContent = 'Hidden';
            visibilityCell.className = 'visibility-change hidden';
          }

          // Update the outcome cell
          const outcomeCell = row.querySelector('.outcome');
          if (outcomeCell) {
            outcomeCell.textContent = 'Hidden (Reaction)';
            outcomeCell.className = 'outcome hidden';
          }
        }
      }
    }
  }

  /**
   * Apply Sense the Unseen feat to upgrade failed outcomes
   * @deprecated Use applyReaction('senseTheUnseen') instead
   */
  async applySenseUnseen() {
    try {
      const { notify } = await import('../services/infra/notifications.js');

      // Find all failed outcomes where the target is currently undetected
      const failedUndetectedOutcomes = this.outcomes.filter(
        (outcome) => outcome.outcome === 'failure' && outcome.currentVisibility === 'undetected',
      );

      if (failedUndetectedOutcomes.length === 0) {
        notify.warn('No failed outcomes with undetected targets found.');
        return;
      }

      // Apply Sense the Unseen: upgrade undetected to hidden
      // We need to update both the current outcomes and the original outcomes
      const targetIds = failedUndetectedOutcomes.map((o) => o.target?.id).filter(Boolean);

      for (const outcome of failedUndetectedOutcomes) {
        outcome.newVisibility = 'hidden';
        outcome.changed = true; // Force changed to true since we're upgrading undetected to hidden
        outcome.senseUnseenApplied = true;
        outcome.hasActionableChange = true; // Force actionable change to true
        // Also set overrideState to ensure it's treated as a user override
        outcome.overrideState = 'hidden';
      }

      // Also update the original outcomes so changes persist through re-renders
      if (Array.isArray(this._originalOutcomes)) {
        for (const originalOutcome of this._originalOutcomes) {
          if (targetIds.includes(originalOutcome.target?.id)) {
            originalOutcome.newVisibility = 'hidden';
            originalOutcome.changed = true; // Force changed to true
            originalOutcome.senseUnseenApplied = true;
            originalOutcome.hasActionableChange = true; // Force actionable change to true
            // Also set overrideState to ensure it's treated as a user override
            originalOutcome.overrideState = 'hidden';
          }
        }
      }

      // Reprocess outcomes to update display properties
      await this.getFilteredOutcomes().then((reprocessedOutcomes) => {
        this.outcomes = reprocessedOutcomes;
      });

      // Update the button and section to show applied state
      const button = this.element?.querySelector('button[data-action="applySenseUnseen"]');
      const section = this.element?.querySelector('.sense-unseen-section');

      if (button) {
        // Set the applied flag to prevent multiple applications

        // Update button content with success feedback using localized text
        const appliedText = game.i18n.localize(
          'PF2E_VISIONER.SEEK_AUTOMATION.SENSE_UNSEEN_APPLIED',
        );

        // Update the existing button instead of cloning
        button.classList.add('applied');
        button.disabled = true;
        button.innerHTML = `<i class="fas fa-check-circle"></i><span class="button-label">${appliedText}</span>`;

        // Force style update with inline styles as backup
        button.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%)';
        button.style.cursor = 'not-allowed';
        button.style.opacity = '0.9';

        // Remove all existing event listeners by cloning and replacing
        const newButton = button.cloneNode(true);
        button.parentNode.replaceChild(newButton, button);

        // Ensure the cloned button also has the styles
        newButton.style.background =
          'linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%)';
        newButton.style.cursor = 'not-allowed';
        newButton.style.opacity = '0.9';

        // Add click handler to show info when disabled button is clicked
        newButton.addEventListener('click', (e) => {
          e.preventDefault();
          notify.info(`${appliedText} - This feat has already been used for this seek action.`);
        });
      }

      if (section) {
        // Add applied class to section for visual feedback
        section.classList.add('applied');
      }

      // Update bulk action state and refresh UI
      this.bulkActionState = 'initial';
      this.updateBulkActionButtons();
      this.updateChangesCount();

      notify.info(
        `Applied Sense the Unseen to ${failedUndetectedOutcomes.length} failed outcome(s). Undetected targets are now Hidden.`,
      );

      // Update the affected outcome rows manually without full re-render
      for (const outcome of failedUndetectedOutcomes) {
        const targetId = outcome.target?.id;
        if (targetId) {
          const row = this.element?.querySelector(`tr[data-target-id="${targetId}"]`);
          if (row) {
            // Update the visibility cell
            const visibilityCell = row.querySelector('.visibility-change');
            if (visibilityCell) {
              visibilityCell.textContent = 'Hidden';
              visibilityCell.className = 'visibility-change hidden';
            }

            // Update the outcome cell
            const outcomeCell = row.querySelector('.outcome');
            if (outcomeCell) {
              outcomeCell.textContent = 'Hidden (Sense the Unseen)';
              outcomeCell.className = 'outcome hidden';
            }
          }
        }
      }

      // Don't re-render to avoid resetting the button state
      // The outcomes are already updated and the button styling is applied above
    } catch (error) {
      console.error('Error applying Sense the Unseen:', error);
      const { notify } = await import('../services/infra/notifications.js');
      notify.error('Error applying Sense the Unseen feat.');
    }
  }

  /**
   * Toggle encounter filtering and refresh results
   */
  static async _onToggleEncounterFilter() {
    const app = _currentSeekDialogInstance;
    if (!app) return;

    // Toggle filter and re-render; context preparation applies encounter filter
    app.encounterOnly = !app.encounterOnly;
    app.bulkActionState = 'initial';
    app.render({ force: true });
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
   * Handle state override action (for potential future use)
   */
  static async _onOverrideState() {
    const app = _currentSeekDialogInstance;
    if (!app) return;
    // This method is available for future enhancements if needed
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
}
