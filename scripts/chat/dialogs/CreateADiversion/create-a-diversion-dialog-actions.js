import { MODULE_TITLE } from '../../../constants.js';
import { notify } from '../../services/infra/notifications.js';

export async function applyDiversionChange(app, button) {
  if (!app) return;

  const tokenId = button?.dataset.tokenId;
  const outcome = app.outcomes.find((candidate) => candidate.observer.id === tokenId);
  if (!outcome) return;

  const effectiveNewState = outcome.overrideState || outcome.newVisibility;

  try {
    const { applyNowDiversion } = await import('../../services/index.js');
    const rowTimerConfig = app.rowTimers?.get(tokenId);
    const overrideValue = await buildDiversionOverrideValue(effectiveNewState, rowTimerConfig);
    const overrides = { [tokenId]: overrideValue };

    await applyNowDiversion({ ...app.actionData, overrides }, { html: () => {}, attr: () => {} });

    if (rowTimerConfig) {
      app.rowTimers.delete(tokenId);
      app._updateRowTimerButton?.(tokenId);
    }
  } catch {
    /* Apply is best-effort from preview dialog */
  }

  app.updateRowButtonsToApplied([{ target: { id: tokenId }, hasActionableChange: true }]);
  enableDiversionRevertAll(app);
  app.updateChangesCount();
}

export async function revertDiversionChange(app, button) {
  if (!app) return;

  const tokenId = button?.dataset.tokenId;
  const outcome = app.outcomes.find((candidate) => candidate.observer.id === tokenId);
  if (!outcome) return;

  try {
    const { applyVisibilityChanges } = await import('../../services/infra/shared-utils.js');
    const revertVisibility = outcome.oldVisibility || outcome.currentVisibility;
    const beneficiary = app.actionData?.diversionTarget || app.actionData?.actor;
    const changes = [{ target: beneficiary, newVisibility: revertVisibility }];

    await applyVisibilityChanges(outcome.observer, changes, {
      direction: 'observer_to_target',
    });
  } catch {
    /* Revert is best-effort from preview dialog */
  }

  app.updateRowButtonsToReverted([{ target: { id: tokenId }, hasActionableChange: true }]);
  app.bulkActionState = 'initial';
  app.updateBulkActionButtons();
  app.updateChangesCount();
}

export async function applyAllDiversionChanges(app) {
  if (!app) {
    console.error('Create a Diversion Dialog not found');
    return;
  }

  if (app.bulkActionState === 'applied') {
    const anyActionable = (app.outcomes || []).some((outcome) => outcome?.hasActionableChange);
    if (!anyActionable) {
      notify.warn(
        `${MODULE_TITLE}: Apply All has already been used. Use Revert All to undo changes.`,
      );
      return;
    }
  }

  const changedOutcomes = getChangedDiversionOutcomes(app);
  if (changedOutcomes.length === 0) {
    notify.warn(`${MODULE_TITLE}: No visibility changes to apply.`);
    return;
  }

  try {
    const { applyNowDiversion } = await import('../../services/index.js');
    const overrides = collectDiversionOverrides(changedOutcomes);
    await applyNowDiversion(
      { ...app.actionData, ignoreAllies: app.ignoreAllies, overrides },
      { html: () => {}, attr: () => {} },
    );
  } catch {
    /* Apply all is best-effort from preview dialog */
  }

  app.updateRowButtonsToApplied(
    changedOutcomes.map((outcome) => ({
      target: { id: outcome.observer.id },
      hasActionableChange: true,
    })),
  );

  app.bulkActionState = 'applied';
  app.updateBulkActionButtons();
  app.updateChangesCount();

  notify.info(
    `${MODULE_TITLE}: Applied all diversion visibility changes. Dialog remains open for further adjustments.`,
  );
}

export async function revertAllDiversionChanges(app) {
  if (!app) {
    console.error('Create a Diversion Dialog not found');
    return;
  }

  if (app.bulkActionState === 'reverted') {
    notify.warn(
      `${MODULE_TITLE}: Revert All has already been used. Use Apply All to reapply changes.`,
    );
    return;
  }

  const changedOutcomes = getChangedDiversionOutcomes(app);
  if (changedOutcomes.length === 0) {
    notify.warn(`${MODULE_TITLE}: No visibility changes to revert.`);
    return;
  }

  try {
    const { revertNowDiversion } = await import('../../services/index.js');
    await revertNowDiversion(
      { ...app.actionData, ignoreAllies: app.ignoreAllies },
      { html: () => {}, attr: () => {} },
    );
  } catch {
    /* Revert all is best-effort from preview dialog */
  }

  app.updateRowButtonsToReverted(
    changedOutcomes.map((outcome) => ({
      target: { id: outcome.observer.id },
      hasActionableChange: true,
    })),
  );

  app.bulkActionState = 'reverted';
  app.updateBulkActionButtons();
  app.updateChangesCount();

  notify.info(
    `${MODULE_TITLE}: Reverted all diversion visibility changes. Dialog remains open for further adjustments.`,
  );
}

async function buildDiversionOverrideValue(effectiveNewState, rowTimerConfig) {
  if (!rowTimerConfig) return effectiveNewState;

  try {
    const { TimedOverrideManager } = await import('../../../services/TimedOverrideManager.js');
    const timedOverride = TimedOverrideManager._buildTimedOverrideData(rowTimerConfig);
    return { state: effectiveNewState, timedOverride };
  } catch (error) {
    console.error('PF2E Visioner | Diversion row apply: Failed to build timer:', error);
    return effectiveNewState;
  }
}

function enableDiversionRevertAll(app) {
  try {
    const revertAllButton = app.element.querySelector('.bulk-action-btn[data-action="revertAll"]');
    if (!revertAllButton) return;

    revertAllButton.disabled = false;
    revertAllButton.innerHTML = `<i class="fas fa-undo"></i> ${game.i18n.localize('PF2E_VISIONER.UI.REVERT_ALL_BUTTON')}`;
  } catch {
    /* Button may not exist in unit harness */
  }
}

function getChangedDiversionOutcomes(app) {
  const filteredOutcomes = app.processedOutcomes || app.outcomes || [];

  return filteredOutcomes.filter(
    (outcome) =>
      outcome.hasActionableChange || (outcome.changed && outcome.newVisibility !== 'avs'),
  );
}

function collectDiversionOverrides(changedOutcomes) {
  const overrides = {};

  for (const outcome of changedOutcomes) {
    const id = outcome?.observer?.id;
    const state = outcome?.overrideState || outcome?.newVisibility;
    if (id && state) overrides[id] = state;
  }

  return overrides;
}
