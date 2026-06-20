import { MODULE_ID } from '../../../constants.js';

export function buildBulkOverrideStates(app) {
  try {
    if (app._cachedBulkStates && Array.isArray(app._cachedBulkStates)) {
      return app._cachedBulkStates;
    }

    const avsEnabled = game.settings.get(MODULE_ID, 'autoVisibilityEnabled');
    let states = ['avs', 'observed', 'concealed', 'hidden', 'undetected'];
    if (!avsEnabled) states = states.filter((state) => state !== 'avs');

    app._cachedBulkStates = states.map((state) => ({
      value: state,
      ...app.visibilityConfig(state, { manual: true }),
    }));
    return app._cachedBulkStates;
  } catch {
    return [];
  }
}

export function deriveBulkStatesFromOutcomes(app, outcomes) {
  try {
    if (!Array.isArray(outcomes) || outcomes.length === 0) return [];

    const avsEnabled = game.settings.get(MODULE_ID, 'autoVisibilityEnabled');
    const set = new Set();

    for (const outcome of outcomes) {
      if (!Array.isArray(outcome.availableStates)) continue;
      for (const state of outcome.availableStates) {
        const value = state?.value ?? state?.key;
        if (typeof value !== 'string') continue;
        if (value === 'avs' && !avsEnabled) continue;
        set.add(value);
      }
    }

    return Array.from(set).map((value) => ({
      value,
      ...app.visibilityConfig(value, { manual: true }),
    }));
  } catch {
    return [];
  }
}

export function attachBulkOverrideHandlers(app) {
  try {
    if (!app.element) return;

    const root = app.element.querySelector('.bulk-override-bar');
    if (!root || root.dataset.bound === 'true') return;

    root.dataset.bound = 'true';
    root.addEventListener('click', (event) => {
      const button = event.target?.closest?.('button[data-action]');
      if (!button || !root.contains(button)) return;
      if (button.dataset.action === 'bulkOverrideSet') {
        setBulkOverrideState(app, event, button);
      } else if (button.dataset.action === 'bulkOverrideClear') {
        clearBulkOverrideState(app);
      }
    });
  } catch {
    /* Bulk override bar is optional */
  }
}

export function setBulkOverrideState(app, event, button = null) {
  try {
    const state = (button || event.currentTarget)?.dataset?.state;
    if (!state || !Array.isArray(app.outcomes)) return;

    for (const outcome of app.outcomes) {
      const tokenId = app.getOutcomeTokenId(outcome);
      if (!tokenId && !outcome._isWall) continue;

      const oldState = outcome.oldVisibility ?? outcome.currentVisibility ?? null;
      outcome.overrideState = state;

      const isOldStateAvsControlled = app.isOldStateAvsControlled(outcome);
      const statesMatch = state === oldState;
      outcome.hasActionableChange =
        (oldState != null && state !== null && !statesMatch) ||
        (statesMatch && isOldStateAvsControlled);

      if (outcome.hasActionableChange) outcome.hasRevertableChange = true;
    }

    refreshBulkOverrideDom(app);
  } catch (error) {
    console.warn('PF2E Visioner | Bulk override set failed', error);
  }
}

export function clearBulkOverrideState(app) {
  try {
    if (!Array.isArray(app.outcomes)) return;

    for (const outcome of app.outcomes) {
      outcome.overrideState = null;
      const effective = outcome.newVisibility;
      const oldState = outcome.oldVisibility ?? outcome.currentVisibility ?? null;
      const isOldStateAvsControlled = app.isOldStateAvsControlled(outcome);
      const statesMatch = effective === oldState;
      outcome.hasActionableChange =
        (oldState != null && effective != null && !statesMatch) ||
        (statesMatch && isOldStateAvsControlled);

      if (!outcome.hasActionableChange) outcome.hasRevertableChange = false;
    }

    refreshBulkOverrideDom(app);
  } catch (error) {
    console.warn('PF2E Visioner | Bulk override clear failed', error);
  }
}

function refreshBulkOverrideDom(app) {
  app.markInitialSelections();
  app.refreshRowActionButtons();
  app.updateChangesCount();
  app.updateBulkActionButtons();
  if (app.showOnlyChanges) app.render({ force: true });
}
