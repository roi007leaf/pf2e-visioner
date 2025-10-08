import { MODULE_ID, MODULE_TITLE } from '../../constants.js';
import { getVisibilityStateConfig } from '../services/data/visibility-states.js';
import '../services/hbs-helpers.js';
import { notify } from '../services/infra/notifications.js';
import { filterOutcomesByEncounter, hasActiveEncounter } from '../services/infra/shared-utils.js';
import { BasePreviewDialog } from './BasePreviewDialog.js';

export class BaseActionDialog extends BasePreviewDialog {
  constructor(options = {}) {
    super(options);
    this.bulkActionState = this.bulkActionState ?? 'initial';
    // Per-dialog visual filter: show only rows with actionable changes
    if (typeof this.showOnlyChanges === 'undefined') this.showOnlyChanges = false;
    // LOS filter: enabled out of combat by default, disabled in combat (UI disabled while in combat)
    try {
      // Default to enabled when out of combat, unless explicitly overridden
      if (typeof options.filterByDetection === 'boolean') {
        this.filterByDetection = options.filterByDetection;
      } else {
        const inCombat = hasActiveEncounter();
        this.filterByDetection = !inCombat;
      }
    } catch (err) {
      this.filterByDetection = false;
    }
  }

  getApplyDirection() {
    return 'observer_to_target';
  }

  getChangesCounterClass() {
    return null; // override in subclass if you want auto counting via dialog-utils
  }

  // Shared UI helpers
  visibilityConfig(state) {
    return getVisibilityStateConfig(state) || { icon: '', color: '', label: String(state ?? '') };
  }

  resolveTokenImage(token) {
    try {
      return (
        token?.actor?.img ||
        token?.actor?.prototypeToken?.texture?.src ||
        token?.texture?.src ||
        token?.document?.texture?.src ||
        token?.img ||
        'icons/svg/mystery-man.svg'
      );
    } catch {
      return 'icons/svg/mystery-man.svg';
    }
  }

  formatMargin(margin) {
    const n = Number(margin);
    if (Number.isNaN(n)) return String(margin ?? '');
    return n >= 0 ? `+${n}` : `${n}`;
  }

  buildOverrideStates(desiredStates, outcome, options = {}) {
    const selectFrom = options.selectFrom || 'overrideState';
    const calcFrom = options.calcFrom || 'newVisibility';
    const selectedValue = outcome?.[selectFrom] || outcome?.[calcFrom] || null;
    const avsEnabled = game.settings.get(MODULE_ID, 'autoVisibilityEnabled');
    return desiredStates
      .filter((s) => typeof s === 'string' && s.length > 0)
      .filter((s) => s !== 'avs' || avsEnabled)
      .map((state) => ({
        value: state,
        ...this.visibilityConfig(state),
        selected: selectedValue === state,
        calculatedOutcome: outcome?.[calcFrom] === state,
      }));
  }

  /**
   * Check if a token's current visibility state is controlled by AVS (no manual override)
   * @param {Object} outcome - The outcome object containing token and visibility info
   * @returns {boolean} True if AVS is controlling the visibility, false if there's a manual override
   */
  isCurrentStateAvsControlled(outcome) {
    try {
      // Check if AVS is enabled
      const avsEnabled = game.settings.get(MODULE_ID, 'autoVisibilityEnabled');
      if (!avsEnabled) return false;

      // Get the token and observer from the outcome
      const token = outcome.target || outcome.token;
      const observer = outcome.observer || this.actionData?.actor;

      if (!token || !observer) return false;

      // Check for manual override flag
      // In most action dialogs, the override is stored on the target token with key from observer
      const hasOverride = !!token.document?.getFlag(
        MODULE_ID,
        `avs-override-from-${observer.document?.id || observer.id}`,
      );

      return !hasOverride; // If no override exists, AVS is controlling
    } catch {
      return false;
    }
  }

  /**
   * Check if a token's old visibility state is controlled by AVS (no manual override)
   * @param {Object} outcome - The outcome object containing token and visibility info
   * @returns {boolean} True if AVS is controlling the old visibility, false if there's a manual override
   */
  isOldStateAvsControlled(outcome) {
    try {
      // Walls, loot, and hazards never use AVS
      if (outcome._isWall) return false;

      const token = outcome.target || outcome.token;
      const isLoot = token?.actor?.type === 'loot';
      const isHazard = token?.actor?.type === 'hazard';
      if (isLoot || isHazard) return false;

      // Check if AVS is enabled
      const avsEnabled = game.settings.get(MODULE_ID, 'autoVisibilityEnabled');
      if (!avsEnabled) return false;

      // Get the observer from the outcome
      const observer = outcome.observer || this.actionData?.actor;

      if (!token || !observer) return false;

      // Check for manual override flag
      // In most action dialogs, the override is stored on the target token with key from observer
      const hasOverride = !!token.document?.getFlag(
        MODULE_ID,
        `avs-override-from-${observer.document?.id || observer.id}`,
      );

      return !hasOverride; // If no override exists, AVS is controlling
    } catch {
      return false;
    }
  }

  computeChangesCount(outcomes) {
    if (!Array.isArray(outcomes)) return 0;
    return outcomes.filter((o) => o?.hasActionableChange).length;
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    this._applySelectionHighlight();

    // Ensure bulk override buttons get listeners
    try {
      this._attachBulkOverrideHandlers();
    } catch { }
  }

  buildCommonContext(outcomes) {
    const changesCount = this.computeChangesCount(outcomes);

    return {
      changesCount,
      totalCount: Array.isArray(outcomes) ? outcomes.length : 0,
      showEncounterFilter: hasActiveEncounter(),
      encounterOnly: !!this.encounterOnly,
      // Per-dialog ignore-allies checkbox state (defaults from global setting)
      ignoreAllies: this.ignoreAllies,
      // LOS filter state; UI disables when in combat
      filterByDetection: !!this.filterByDetection,
      // Visual filter checkbox state
      showOnlyChanges: !!this.showOnlyChanges,
      bulkActionState: this.bulkActionState ?? 'initial',
      bulkOverrideStates:
        this._deriveBulkStatesFromOutcomes?.(outcomes) || this._buildBulkOverrideStates?.() || [],
    };
  }

  // ===== Bulk Override Helpers =====
  _buildBulkOverrideStates() {
    try {
      if (this._cachedBulkStates && Array.isArray(this._cachedBulkStates))
        return this._cachedBulkStates;

      // Check if AVS is enabled to filter out 'avs' state
      const avsEnabled = game.settings.get(MODULE_ID, 'autoVisibilityEnabled');
      let states = ['avs', 'observed', 'concealed', 'hidden', 'undetected'];

      // Remove 'avs' if AVS is disabled
      if (!avsEnabled) {
        states = states.filter(s => s !== 'avs');
      }

      this._cachedBulkStates = states.map((s) => ({ value: s, ...this.visibilityConfig(s) }));
      return this._cachedBulkStates;
    } catch {
      return [];
    }
  }

  _deriveBulkStatesFromOutcomes(outcomes) {
    try {
      if (!Array.isArray(outcomes) || outcomes.length === 0) return [];

      // Check if AVS is enabled to filter out 'avs' state
      const avsEnabled = game.settings.get(MODULE_ID, 'autoVisibilityEnabled');

      const set = new Set();
      for (const o of outcomes) {
        if (Array.isArray(o.availableStates)) {
          for (const st of o.availableStates) {
            const value = st?.value ?? st?.key;
            if (typeof value === 'string') {
              // Skip 'avs' if AVS is disabled
              if (value === 'avs' && !avsEnabled) continue;
              set.add(value);
            }
          }
        }
      }
      return Array.from(set).map((v) => ({ value: v, ...this.visibilityConfig(v) }));
    } catch {
      return [];
    }
  }

  _attachBulkOverrideHandlers() {
    try {
      if (!this.element) return;
      const root = this.element.querySelector('.bulk-override-bar');
      if (!root) return;
      if (root.dataset.bound === 'true') return;
      root.dataset.bound = 'true';
      root.querySelectorAll('button[data-action="bulkOverrideSet"]').forEach((btn) => {
        btn.addEventListener('click', (ev) => this._onBulkOverrideSet(ev));
      });
      const clearBtn = root.querySelector('button[data-action="bulkOverrideClear"]');
      if (clearBtn) clearBtn.addEventListener('click', (ev) => this._onBulkOverrideClear(ev));
    } catch { }
  }

  _onBulkOverrideSet(event) {
    try {
      const state = event.currentTarget?.dataset?.state;
      if (!state || !Array.isArray(this.outcomes)) return;
      for (const o of this.outcomes) {
        const tokenId = this.getOutcomeTokenId(o);
        if (!tokenId && !o._isWall) continue;
        const oldState = o.oldVisibility ?? o.currentVisibility ?? null;
        o.overrideState = state;

        const isOldStateAvsControlled = this.isOldStateAvsControlled(o);
        const statesMatch = state === oldState;
        o.hasActionableChange =
          (oldState != null && state !== null && !statesMatch) ||
          (statesMatch && isOldStateAvsControlled);

        if (o.hasActionableChange) o.hasRevertableChange = true;
      }
      // Update UI to reflect new actionable states
      this.markInitialSelections();
      this.refreshRowActionButtons();
      this.updateChangesCount();
      this.updateBulkActionButtons();
      // If filtering to show only changes, re-render so rows reflect new effective states
      if (this.showOnlyChanges) this.render({ force: true });
    } catch (e) {
      console.warn('PF2E Visioner | Bulk override set failed', e);
    }
  }

  _onBulkOverrideClear() {
    try {
      if (!Array.isArray(this.outcomes)) return;
      for (const o of this.outcomes) {
        o.overrideState = null;
        const effective = o.newVisibility;
        const oldState = o.oldVisibility ?? o.currentVisibility ?? null;

        const isOldStateAvsControlled = this.isOldStateAvsControlled(o);
        const statesMatch = effective === oldState;
        o.hasActionableChange =
          (oldState != null && effective != null && !statesMatch) ||
          (statesMatch && isOldStateAvsControlled);

        if (!o.hasActionableChange) o.hasRevertableChange = false;
      }
      // Update UI to reflect recalculated actionable states
      this.markInitialSelections();
      this.refreshRowActionButtons();
      this.updateChangesCount();
      this.updateBulkActionButtons();
      // If filtering to show only changes, re-render so rows reflect recalculated actionability
      if (this.showOnlyChanges) this.render({ force: true });
    } catch (e) {
      console.warn('PF2E Visioner | Bulk override clear failed', e);
    }
  }

  applyEncounterFilter(outcomes, tokenProperty, emptyNotice) {
    let filtered = filterOutcomesByEncounter(outcomes, this.encounterOnly, tokenProperty);
    if (filtered.length === 0 && this.encounterOnly && hasActiveEncounter()) {
      this.encounterOnly = false;
      filtered = outcomes;
    }
    return filtered;
  }

  async applyVisibilityChanges(seeker, changes, options = {}) {
    const { applyVisibilityChanges } = await import('../services/infra/shared-utils.js');
    const direction = options.direction || this.getApplyDirection();
    return applyVisibilityChanges(seeker, changes, { ...options, direction });
  }

  updateRowButtonsToApplied(outcomes) {
    // Normalize outcomes so helpers can locate rows regardless of shape
    // Some dialogs (e.g., Sneak) use `token` instead of `target`
    const normalized = Array.isArray(outcomes)
      ? outcomes.map((o) => (o?.target?.id ? o : o?.token?.id ? { target: { id: o.token.id } } : o))
      : outcomes;
    import('../services/ui/dialog-utils.js').then(({ updateRowButtonsToApplied }) => {
      try {
        updateRowButtonsToApplied(this.element, normalized);
      } catch { }
    });
  }

  updateRowButtonsToReverted(outcomes) {
    // Normalize outcomes so helpers can locate rows regardless of shape
    const normalized = Array.isArray(outcomes)
      ? outcomes.map((o) => (o?.target?.id ? o : o?.token?.id ? { target: { id: o.token.id } } : o))
      : outcomes;
    import('../services/ui/dialog-utils.js').then(({ updateRowButtonsToReverted }) => {
      try {
        updateRowButtonsToReverted(this.element, normalized);
      } catch { }
      try {
        // After reverting, reset each row's selection to its initial calculated outcome
        if (!Array.isArray(outcomes)) return;
        for (const o of outcomes) {
          const tokenId = o?.target?.id;
          if (!tokenId) continue;
          const row = this.element?.querySelector?.(`tr[data-token-id="${tokenId}"]`);
          if (!row) continue;
          const container = row.querySelector('.override-icons');
          if (!container) continue;
          // Clear current selection
          container.querySelectorAll('.state-icon').forEach((i) => i.classList.remove('selected'));
          // Prefer icon marked as calculated outcome; fallback to the hidden input's value
          let selectedIcon = container.querySelector('.state-icon.calculated-outcome');
          if (!selectedIcon) {
            const hidden = container.querySelector('input[type="hidden"]');
            if (hidden)
              selectedIcon = container.querySelector(`.state-icon[data-state="${hidden.value}"]`);
          }
          if (selectedIcon) {
            selectedIcon.classList.add('selected');
            const state = selectedIcon.dataset.state;
            const hidden = container.querySelector('input[type="hidden"]');
            if (hidden) hidden.value = state;
          }
          // Clear any explicit override so selection reflects initial calculated state
          try {
            const outcome = this.outcomes?.find?.(
              (x) => String(this.getOutcomeTokenId(x)) === String(tokenId),
            );
            if (outcome) outcome.overrideState = null;
          } catch { }
        }
      } catch { }
    });
  }

  updateBulkActionButtons() {
    import('../services/ui/dialog-utils.js').then(({ updateBulkActionButtons }) => {
      try {
        updateBulkActionButtons(this.element, this.bulkActionState);
      } catch { }
    });
  }

  updateChangesCount() {
    import('../services/ui/dialog-utils.js').then(({ updateChangesCount }) => {
      try {
        updateChangesCount(this.element, this.getChangesCounterClass());
      } catch { }
    });
  }

  // Default token id resolver for outcomes; subclasses can override
  getOutcomeTokenId(outcome) {
    return outcome?.target?.id ?? null;
  }

  // Mark calculated selection (override if present, otherwise calculated)
  markInitialSelections() {
    try {
      if (!Array.isArray(this.outcomes)) return;
      for (const outcome of this.outcomes) {
        const tokenId = this.getOutcomeTokenId(outcome);
        if (!tokenId) continue;
        const row = this.element.querySelector(`tr[data-token-id="${tokenId}"]`);
        if (!row) continue;
        const container = row.querySelector('.override-icons');
        if (!container) continue;
        const desiredState = outcome.overrideState || outcome.newVisibility;
        container.querySelectorAll('.state-icon').forEach((i) => i.classList.remove('selected'));
        const icon = container.querySelector(`.state-icon[data-state="${desiredState}"]`);
        if (icon) icon.classList.add('selected');
      }
    } catch { }
  }

  // Outcome display helpers (string-based). Subclasses can override if needed
  getOutcomeClass(value) {
    return value && typeof value === 'string'
      ? value === 'criticalSuccess'
        ? 'critical-success'
        : value === 'criticalFailure'
          ? 'critical-failure'
          : value
      : '';
  }

  getOutcomeLabel(value) {
    if (!value || typeof value !== 'string') return '';
    const norm =
      value === 'criticalSuccess'
        ? 'critical-success'
        : value === 'criticalFailure'
          ? 'critical-failure'
          : value;

    switch (norm) {
      case 'critical-success':
        return 'Critical Success';
      case 'success':
        return 'Success';
      case 'failure':
        return 'Failure';
      case 'critical-failure':
        return 'Critical Failure';
      case 'out-of-range':
        return game.i18n.localize('PF2E_VISIONER.SEEK_AUTOMATION.OUT_OF_RANGE');
      case 'unmet-conditions':
        return game.i18n.localize('PF2E_VISIONER.SEEK_AUTOMATION.UNMET_CONDITIONS');
      default:
        return norm.charAt(0).toUpperCase() + norm.slice(1);
    }
  }

  // Default per-row buttons rendering. Subclasses may override for custom layouts.
  updateActionButtonsForToken(tokenId, hasActionableChange, opts = {}) {
    try {
      // Support wall rows by allowing caller to pass row or using wallId
      let row = opts.row || this.element?.querySelector?.(`tr[data-token-id="${tokenId}"]`);
      if (!row && opts.wallId)
        row = this.element?.querySelector?.(`tr[data-wall-id="${opts.wallId}"]`);
      if (!row) return;

      // Try common containers in priority order
      let container = row.querySelector('td.actions');
      if (!container) container = row.querySelector('.actions');
      if (!container) container = row.querySelector('.row-actions');
      if (!container) container = row.querySelector('.action-buttons');
      if (!container) return;

      if (hasActionableChange) {
        container.innerHTML = `
          <button type="button" class="row-action-btn apply-change" data-action="applyChange" ${opts.wallId ? `data-wall-id="${opts.wallId}"` : `data-token-id="${tokenId}"`} data-tooltip="${game.i18n.localize('PF2E_VISIONER.UI.APPLY_VISIBILITY_CHANGE')}">
            <i class="fas fa-check"></i>
          </button>
          <button type="button" class="row-action-btn revert-change" data-action="revertChange" ${opts.wallId ? `data-wall-id="${opts.wallId}"` : `data-token-id="${tokenId}"`} data-tooltip="${game.i18n.localize('PF2E_VISIONER.UI.REVERT_TO_ORIGINAL')}">
            <i class="fas fa-undo"></i>
          </button>
        `;
      } else {
        container.innerHTML = `<span class="no-action">${game.i18n.localize('PF2E_VISIONER.UI.NO_CHANGE_LABEL')}</span>`;
      }
    } catch { }
  }

  addIconClickHandlers() {
    const stateIcons = this.element.querySelectorAll('.state-icon');
    stateIcons.forEach((icon) => {
      icon.addEventListener('click', (event) => {
        // Only handle clicks within override selection container
        const overrideIcons = event.currentTarget.closest('.override-icons');
        if (!overrideIcons) return;

        // Robustly resolve target id from data attributes or row
        let targetId = event.currentTarget.dataset.target || event.currentTarget.dataset.tokenId;
        const wallId =
          overrideIcons?.dataset?.wallId ||
          event.currentTarget.dataset.wallId ||
          event.currentTarget.closest('tr')?.dataset?.wallId ||
          null;
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
        if (!outcome && wallId) outcome = this.outcomes?.find?.((o) => o?.wallId === wallId);
        if (outcome) {
          outcome.overrideState = newState;
          const oldState = outcome.oldVisibility ?? outcome.currentVisibility ?? null;

          const isOldStateAvsControlled = this.isOldStateAvsControlled(outcome);
          const statesMatch = newState === oldState;
          const hasActionableChange =
            (oldState != null && newState != null && !statesMatch) ||
            (statesMatch && isOldStateAvsControlled);

          // Persist actionable state on outcome so templates and bulk ops reflect immediately
          outcome.hasActionableChange = hasActionableChange;
          try {
            this.updateActionButtonsForToken(targetId || null, hasActionableChange, {
              wallId,
              row: event.currentTarget.closest('tr'),
            });
          } catch { }
          // Direct DOM fallback to ensure row shows buttons immediately
          try {
            const rowEl = event.currentTarget.closest('tr');
            if (rowEl) {
              let container = rowEl.querySelector('td.actions') || rowEl.querySelector('.actions');
              if (container) {
                if (hasActionableChange) {
                  const idAttr = wallId
                    ? `data-wall-id="${wallId}"`
                    : targetId
                      ? `data-token-id="${targetId}"`
                      : '';
                  container.innerHTML = `
                    <button type="button" class="row-action-btn apply-change" data-action="applyChange" ${idAttr} data-tooltip="${game.i18n.localize('PF2E_VISIONER.UI.APPLY_VISIBILITY_CHANGE')}">
                      <i class="fas fa-check"></i>
                    </button>
                    <button type="button" class="row-action-btn revert-change" data-action="revertChange" ${idAttr} data-tooltip="${game.i18n.localize('PF2E_VISIONER.UI.REVERT_TO_ORIGINAL')}">
                      <i class="fas fa-undo"></i>
                    </button>
                  `;
                } else {
                  container.innerHTML = `<span class="no-action">${game.i18n.localize('PF2E_VISIONER.UI.NO_CHANGE_LABEL')}</span>`;
                }
              }
            }
          } catch { }
          try {
            // Maintain a lightweight list of changed outcomes for convenience
            this.changes = Array.isArray(this.outcomes)
              ? this.outcomes.filter((o) => {
                const baseOld = o.oldVisibility ?? o.currentVisibility ?? null;
                const baseNew = o.overrideState ?? o.newVisibility ?? null;
                return baseOld != null && baseNew != null && baseOld !== baseNew;
              })
              : [];
          } catch { }
        }
        this.updateChangesCount();
        // If "Show only changes" is active, re-render so filtering reflects override adjustments
        try {
          if (this.showOnlyChanges) this.render({ force: true });
        } catch { }
      });
    });
  }

  // Refresh per-row Actions column to show Apply/Revert buttons only when the state changes from old
  refreshRowActionButtons() {
    try {
      if (!Array.isArray(this.outcomes)) return;
      for (const o of this.outcomes) {
        const tokenId = this.getOutcomeTokenId(o);
        const wallId = o?._isWall ? o.wallId : null;
        // Only attempt to update rows that exist in the current DOM
        const rowSelector = wallId
          ? `tr[data-wall-id="${String(wallId)}"]`
          : tokenId
            ? `tr[data-token-id="${String(tokenId)}"]`
            : null;
        if (!rowSelector) continue;
        const row = this.element?.querySelector?.(rowSelector);
        if (!row) continue;
        this.updateActionButtonsForToken(tokenId || null, !!o.hasActionableChange, { wallId, row });
      }
    } catch { }
  }

  /**
   * Generic apply change handler that can be used by all action dialogs
   * @param {Event} event - Click event
   * @param {HTMLElement} target - Button element
   * @param {Object} context - Dialog context with app instance and apply function
   */
  static async onApplyChange(event, target, context) {
    const { app, applyFunction, actionType } = context;
    if (!app) {
      console.error(`[${actionType} Dialog] Could not find application instance`);
      return;
    }

    const tokenId = target.dataset.tokenId;
    const wallId = target.dataset.wallId;
    let outcome = null;

    if (wallId) {
      outcome = app.outcomes.find((o) => o._isWall && o.wallId === wallId);
    } else {
      outcome = app.outcomes.find((o) => o.token?.id === tokenId || o.target?.id === tokenId);
    }

    if (!outcome) {
      notify.warn(`${MODULE_TITLE}: No outcome found for this ${wallId ? 'wall' : 'token'}`);
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
        const actorId = app.actionData?.actor?.document?.id || app.actionData?.actor?.id;
        const targetId = outcome.target?.id || outcome.token?.id || tokenId;
        if (actorId && targetId) {
          // Determine the correct direction based on the action semantics
          const direction = app.getApplyDirection?.() || 'observer_to_target';
          const observerId = direction === 'observer_to_target' ? actorId : targetId;
          const overrideTargetId = direction === 'observer_to_target' ? targetId : actorId;
          await AvsOverrideManager.removeOverride(observerId, overrideTargetId);
          // Refresh UI to update override indicators
          const { updateTokenVisuals } = await import('../../services/visual-effects.js');
          await updateTokenVisuals();
          const targetName = outcome.target?.name || outcome.token?.name || 'token';
          notify.info(
            `${MODULE_TITLE}: Accepted AVS change for ${targetName}`,
          );
        }
      } catch (e) {
        console.warn('Failed to remove AVS override:', e);
        const targetName = outcome.target?.name || outcome.token?.name || 'token';
      }
      app.updateRowButtonsToApplied([{ target: { id: tokenId } }]);
      app.updateChangesCount();
      return;
    }

    // Use AVS-aware logic: allow manual override of AVS-controlled states even if same value
    const isOldStateAvsControlled = (typeof app.isOldStateAvsControlled === 'function')
      ? app.isOldStateAvsControlled(outcome)
      : false;
    const statesMatch = effectiveNewState === outcome.oldVisibility;
    const hasChange = (effectiveNewState !== outcome.oldVisibility) || (statesMatch && isOldStateAvsControlled);

    if (!hasChange) {
      notify.warn(`${MODULE_TITLE}: No changes to apply for this ${wallId ? 'wall' : 'token'}`);
      return;
    }

    try {
      const actionData = {
        ...app.actionData,
        ignoreAllies: app.ignoreAllies,
        encounterOnly: app.encounterOnly,
      };

      // Create overrides based on wall vs token
      if (outcome._isWall && outcome.wallId) {
        const overrides = {
          __wall__: { [outcome.wallId]: effectiveNewState },
        };
        await applyFunction({ ...actionData, overrides }, target);
        app.updateRowButtonsToApplied([{ wallId: outcome.wallId }]);
      } else {
        // Apply visibility changes - this sets AVS pair overrides which will
        // prevent future AVS calculations for this token pair until reverted
        const overrides = { [tokenId]: effectiveNewState };
        await applyFunction({ ...actionData, overrides }, target);

        // Update the outcome to reflect the applied state
        outcome.oldVisibility = effectiveNewState;
        outcome.overrideState = null;
        outcome.hasActionableChange = false;
        outcome.hasRevertableChange = false;

        // Update the UI if method exists
        if (app._updateOutcomeDisplayForToken) {
          app._updateOutcomeDisplayForToken(tokenId, outcome);
        }
        if (app.updateRowButtonsToApplied) {
          app.updateRowButtonsToApplied([{ target: { id: tokenId } }]);
        }
      }

      // Clear sneak-active flag for sneak actions
      if (actionType === 'Sneak' && app.sneakingToken) {
        await app._clearSneakActiveFlag();
      }

      if (app.updateChangesCount) {
        app.updateChangesCount();
      }

    } catch (error) {
      console.error(`[${actionType} Dialog] Error applying change:`, error);
      notify.error(`${MODULE_TITLE}: Failed to apply change - see console for details`);
    }
  }

  /**
   * Generic revert change handler that can be used by all action dialogs
   * @param {Event} event - Click event
   * @param {HTMLElement} target - Button element
   * @param {Object} context - Dialog context with app instance
   */
  static async onRevertChange(event, target, context) {
    const { app, actionType } = context;
    if (!app) {
      console.error(`[${actionType} Dialog] Could not find application instance`);
      return;
    }

    const tokenId = target.dataset.tokenId;
    const wallId = target.dataset.wallId;
    let outcome = null;

    if (wallId) {
      outcome = app.outcomes.find((o) => o._isWall && o.wallId === wallId);
    } else {
      outcome = app.outcomes.find((o) => o.token?.id === tokenId || o.target?.id === tokenId);
    }

    if (!outcome) {
      notify.warn(`${MODULE_TITLE}: No outcome found for this ${wallId ? 'wall' : 'token'}`);
      return;
    }

    // Check if there's actually a change to revert
    const hasChange = outcome.oldVisibility !== outcome.newVisibility;
    if (!hasChange) {
      notify.warn(`${MODULE_TITLE}: No changes to revert for this ${wallId ? 'wall' : 'token'}`);
      return;
    }

    try {
      // Remove AVS override if one was created during apply
      // This handles the case where user applied an override (even with same state as AVS calculated)
      // We check if an override exists rather than checking state differences
      if (!wallId) {
        try {
          const { default: AvsOverrideManager } = await import('../../services/infra/AvsOverrideManager.js');
          const actorId = app.actionData?.actor?.document?.id || app.actionData?.actor?.id;
          const targetId = outcome.target?.id || outcome.token?.id || tokenId;

          if (actorId && targetId) {
            // Determine the correct direction based on the action semantics
            const direction = app.getApplyDirection?.() || 'observer_to_target';
            const observerId = direction === 'observer_to_target' ? actorId : targetId;
            const overrideTargetId = direction === 'observer_to_target' ? targetId : actorId;
            const hasOverride = await AvsOverrideManager.getOverride(observerId, overrideTargetId);
            if (hasOverride) {
              await AvsOverrideManager.removeOverride(observerId, overrideTargetId);
              // Refresh UI to update override indicators
              const { updateTokenVisuals } = await import('../../services/visual-effects.js');
              await updateTokenVisuals();
            }
          }
        } catch (e) {
          console.warn('Failed to remove AVS override during revert:', e);
        }
      }

      // Revert to original visibility
      outcome.oldVisibility = outcome.currentVisibility; // Reset to original visibility
      outcome.overrideState = null;
      outcome.hasActionableChange = false;
      outcome.hasRevertableChange = false;

      // Update the UI if method exists
      if (app._updateOutcomeDisplayForToken) {
        app._updateOutcomeDisplayForToken(tokenId, outcome);
      }
      if (app.updateRowButtonsToReverted) {
        app.updateRowButtonsToReverted([outcome]);
      }

      if (app.updateChangesCount) {
        app.updateChangesCount();
      }

    } catch (error) {
      console.error(`[${actionType} Dialog] Error reverting change:`, error);
      notify.error(`${MODULE_TITLE}: Failed to revert change - see console for details`);
    }
  }

  /**
   * Generic apply all handler that can be used by all action dialogs
   * @param {Event} event - Click event
   * @param {HTMLElement} target - Button element
   * @param {Object} context - Dialog context with app instance and apply function
   */
  static async onApplyAll(event, target, context) {
    const { app, applyFunction, actionType } = context;
    if (!app) {
      console.error(`[${actionType} Dialog] Could not find application instance`);
      return;
    }

    // Check if already applied
    if (app.bulkActionState === 'applied') {
      notify.warn(
        `${MODULE_TITLE}: Apply All has already been used. Use Revert All to undo changes.`,
      );
      return;
    }

    // Prefer dialog-provided filtered outcomes (respects encounter/ally/visual filters)
    let sourceOutcomes = [];
    try {
      if (typeof app.getFilteredOutcomes === 'function') {
        sourceOutcomes = await app.getFilteredOutcomes();
      } else {
        sourceOutcomes = Array.isArray(app.outcomes) ? app.outcomes : [];
      }
    } catch {
      sourceOutcomes = Array.isArray(app.outcomes) ? app.outcomes : [];
    }

    // Get all outcomes that have actionable changes
    const outcomesWithChanges = sourceOutcomes.filter((o) => o.hasActionableChange);

    if (outcomesWithChanges.length === 0) {
      notify.warn(`${MODULE_TITLE}: No changes to apply`);
      return;
    }

    try {
      // Create overrides object for all tokens with changes
      // This sets AVS pair overrides which will prevent future AVS calculations
      // for these token pairs until reverted
      const overrides = {};
      const avsRemovals = [];
      outcomesWithChanges.forEach((outcome) => {
        const effectiveNewState = outcome.overrideState || outcome.newVisibility;
        const tokenId = outcome.token?.id || outcome.target?.id;
        if (tokenId) {
          if (effectiveNewState === 'avs') {
            // AVS selections - remove any existing overrides
            const tokenName = outcome.token?.name || outcome.target?.name || 'token';
            avsRemovals.push({ id: tokenId, name: tokenName });
          } else {
            overrides[tokenId] = effectiveNewState;
          }
        }
      });

      // Remove AVS overrides if any
      if (avsRemovals.length > 0) {
        try {
          const { default: AvsOverrideManager } = await import(
            '../services/infra/AvsOverrideManager.js'
          );
          const actorId = app.actionData?.actor?.document?.id || app.actionData?.actor?.id;
          if (actorId) {
            // Determine the correct direction based on the action semantics
            const direction = app.getApplyDirection?.() || 'observer_to_target';
            for (const removal of avsRemovals) {
              const targetId = removal.id;
              const observerId = direction === 'observer_to_target' ? actorId : targetId;
              const overrideTargetId = direction === 'observer_to_target' ? targetId : actorId;
              await AvsOverrideManager.removeOverride(observerId, overrideTargetId);
            }
            // Refresh UI to update override indicators
            const { updateTokenVisuals } = await import('../../services/visual-effects.js');
            await updateTokenVisuals();
            notify.info(`${MODULE_TITLE}: Accepted AVS changes for ${avsRemovals.length} token(s)`);
          }
        } catch (e) {
          console.warn('Failed to remove AVS overrides:', e);
        }
      }

      // Apply overrides only if there are any
      if (Object.keys(overrides).length > 0) {
        const actionData = {
          ...app.actionData,
          ignoreAllies: app.ignoreAllies,
          encounterOnly: app.encounterOnly,
          overrides,
        };

        await applyFunction(actionData, target);
      }

      // Update all outcomes to reflect applied state
      outcomesWithChanges.forEach((outcome) => {
        const effectiveNewState = outcome.overrideState || outcome.newVisibility;
        outcome.oldVisibility = effectiveNewState;
        outcome.overrideState = null;
        outcome.hasActionableChange = false;
        outcome.hasRevertableChange = false;
      });

      // Update bulk state
      app.bulkActionState = 'applied';

      // Update UI
      if (app.updateRowButtonsToApplied) {
        app.updateRowButtonsToApplied(outcomesWithChanges);
      }
      if (app.updateChangesCount) {
        app.updateChangesCount();
      }
      if (app.updateBulkActionButtons) {
        app.updateBulkActionButtons();
      }

      // Clear sneak-active flag for sneak actions
      if (actionType === 'Sneak' && app.sneakingToken) {
        await app._clearSneakActiveFlag();
      }

      notify.info(
        `${MODULE_TITLE}: Applied ${actionType.toLowerCase()} results for ${outcomesWithChanges.length} tokens`,
      );
    } catch (error) {
      console.error(`[${actionType} Dialog] Error applying all changes:`, error);
      notify.error(`${MODULE_TITLE}: Failed to apply changes - see console for details`);
    }
  }

  /**
   * Generic revert all handler that can be used by all action dialogs
   * @param {Event} event - Click event
   * @param {HTMLElement} target - Button element
   * @param {Object} context - Dialog context with app instance
   */
  static async onRevertAll(event, target, context) {
    const { app, actionType } = context;
    if (!app) {
      console.error(`[${actionType} Dialog] Could not find application instance`);
      return;
    }

    // Check if there are changes to revert
    if (app.bulkActionState !== 'applied') {
      notify.warn(`${MODULE_TITLE}: No changes to revert. Apply changes first.`);
      return;
    }

    try {
      // Get all outcomes that were applied (where oldVisibility was changed from original)
      const appliedOutcomes = app.outcomes.filter((o) => o.oldVisibility !== o.currentVisibility);

      if (appliedOutcomes.length === 0) {
        notify.warn(`${MODULE_TITLE}: No applied changes found to revert`);
        return;
      }

      // Remove AVS overrides for all outcomes that have non-AVS states
      const actorId = app.actionData?.actor?.document?.id || app.actionData?.actor?.id;
      let removedOverrides = 0;

      if (actorId) {
        try {
          const { default: AvsOverrideManager } = await import('../../services/infra/AvsOverrideManager.js');
          // Determine the correct direction based on the action semantics
          const direction = app.getApplyDirection?.() || 'observer_to_target';

          for (const outcome of appliedOutcomes) {
            const effectiveOldState = outcome.oldVisibility;
            if (effectiveOldState && effectiveOldState !== 'avs' && effectiveOldState !== outcome.currentVisibility) {
              const targetId = outcome.target?.id || outcome.token?.id;
              if (targetId) {
                try {
                  const observerId = direction === 'observer_to_target' ? actorId : targetId;
                  const overrideTargetId = direction === 'observer_to_target' ? targetId : actorId;
                  await AvsOverrideManager.removeOverride(observerId, overrideTargetId);
                  removedOverrides++;
                } catch (e) {
                  console.warn(`Failed to remove AVS override for ${targetId}:`, e);
                }
              }
            }
          }

          // Refresh UI to update override indicators if any were removed
          if (removedOverrides > 0) {
            const { updateTokenVisuals } = await import('../../services/visual-effects.js');
            await updateTokenVisuals();
          }
        } catch (e) {
          console.warn('Failed to remove AVS overrides during revert all:', e);
        }
      }

      // Revert all outcomes to their original state
      appliedOutcomes.forEach((outcome) => {
        outcome.oldVisibility = outcome.currentVisibility; // Reset to original visibility
        outcome.overrideState = null;
        outcome.hasActionableChange = false;
        outcome.hasRevertableChange = false;
      });

      // Update bulk state
      app.bulkActionState = 'initial';

      // Update UI
      if (app.updateRowButtonsToReverted) {
        app.updateRowButtonsToReverted(appliedOutcomes);
      }
      if (app.updateChangesCount) {
        app.updateChangesCount();
      }
      if (app.updateBulkActionButtons) {
        app.updateBulkActionButtons();
      }

    } catch (error) {
      console.error(`[${actionType} Dialog] Error reverting all changes:`, error);
      notify.error(`${MODULE_TITLE}: Failed to revert changes - see console for details`);
    }
  }
}
