import { MODULE_TITLE } from '../../../constants.js';
import { notify } from '../../services/infra/notifications.js';
import { filterOutcomesByEncounter } from '../../services/infra/shared-utils.js';
import { getDefaultConsequencesVisibility } from './consequences-dialog-context.js';

export async function applyConsequencesChange(app, button) {
  if (!app) return;

  const tokenId = button?.dataset.tokenId;
  const outcome = app.outcomes.find((candidate) => candidate.target.id === tokenId);
  if (!outcome) return;

  const effectiveNewState =
    outcome.overrideState || outcome.newVisibility || getDefaultConsequencesVisibility();

  if (effectiveNewState === 'avs') {
    await removeConsequencesAvsOverride(app, outcome);
    app.updateRowButtonsToApplied([
      { target: { id: outcome.target.id }, hasActionableChange: false },
    ]);
    app.updateChangesCount();
    return;
  }

  try {
    const { applyNowConsequences } = await import('../../services/index.js');
    const rowTimerConfig = app.rowTimers?.get(tokenId);
    const overrideValue = await buildConsequencesOverrideValue(effectiveNewState, rowTimerConfig);
    const overrides = { [outcome.target.id]: overrideValue };

    await applyNowConsequences(
      {
        ...app.actionData,
        overrides,
        ignoreAllies: app.ignoreAllies,
        encounterOnly: app.encounterOnly,
      },
      { html: () => {}, attr: () => {} },
    );

    if (rowTimerConfig) {
      app.rowTimers.delete(tokenId);
      app._updateRowTimerButton?.(tokenId);
    }
  } catch {
    /* Apply is best-effort from preview dialog */
  }

  app.updateRowButtonsToApplied([{ target: { id: tokenId }, hasActionableChange: true }]);
  app.updateChangesCount();
}

export async function revertConsequencesChange(app, button) {
  if (!app) return;

  const tokenId = button?.dataset.tokenId;
  const outcome = app.outcomes.find((candidate) => candidate.target.id === tokenId);
  if (!outcome) return;

  try {
    const { revertNowConsequences } = await import('../../services/index.js');
    const actionDataWithTarget = { ...app.actionData, targetTokenId: tokenId };
    await revertNowConsequences(actionDataWithTarget, { html: () => {}, attr: () => {} });
  } catch {
    /* Revert is best-effort from preview dialog */
  }

  app.updateRowButtonsToReverted([{ target: { id: tokenId }, hasActionableChange: true }]);
  app.updateChangesCount();
}

export async function applyAllConsequencesChanges(app) {
  if (!app) {
    console.error('Consequences Dialog not found');
    return;
  }

  if (app.bulkActionState === 'applied') {
    notify.warn(
      `${MODULE_TITLE}: Apply All has already been used. Use Revert All to undo changes.`,
    );
    return;
  }

  const changedOutcomes = await getChangedConsequencesOutcomes(app);
  if (changedOutcomes.length === 0) {
    notify.warn(`${MODULE_TITLE}: No visibility changes to apply.`);
    return;
  }

  const { overrides, avsRemovals } = collectConsequencesOverrides(changedOutcomes);
  await removeAllConsequencesAvsOverrides(app, avsRemovals);
  await applyAllConsequencesOverrides(app, overrides);
  markConsequencesOutcomesApplied(app, changedOutcomes);

  app.bulkActionState = 'applied';
  app.updateBulkActionButtons();
  app.updateChangesCount();

  notify.info(
    `${MODULE_TITLE}: Applied all visibility changes. Dialog remains open for further adjustments.`,
  );
}

export async function revertAllConsequencesChanges(app) {
  if (!app) {
    console.error('Consequences Dialog not found');
    return;
  }

  if (app.bulkActionState === 'reverted') {
    notify.warn(
      `${MODULE_TITLE}: Revert All has already been used. Use Apply All to reapply changes.`,
    );
    return;
  }

  const changedOutcomes = await getChangedConsequencesOutcomes(app);
  if (changedOutcomes.length === 0) {
    notify.warn(`${MODULE_TITLE}: No visibility changes to revert.`);
    return;
  }

  const { revertNowConsequences } = await import('../../services/index.js');
  await revertNowConsequences(app.actionData, { html: () => {}, attr: () => {} });

  for (const outcome of changedOutcomes) {
    app.updateRowButtonsToReverted([
      { target: { id: outcome.target.id }, hasActionableChange: true },
    ]);
  }

  app.bulkActionState = 'reverted';
  app.updateBulkActionButtons();
  app.updateChangesCount();
}

async function removeConsequencesAvsOverride(app, outcome) {
  try {
    const { default: AvsOverrideManager } = await import(
      '../../services/infra/AvsOverrideManager.js'
    );
    const attackerId = app.actionData?.actor?.document?.id || app.actionData?.actor?.id;
    const observerId = outcome.target.id;
    if (!attackerId || !observerId) return;

    await AvsOverrideManager.removeOverride(observerId, attackerId);
    const { updateTokenVisuals } = await import('../../../services/visual-effects.js');
    await updateTokenVisuals();
    notify.info(`${MODULE_TITLE}: Accepted AVS changes for ${outcome.target.name}`);
  } catch (error) {
    console.warn('Failed to remove AVS override:', error);
    notify.info(`${MODULE_TITLE}: AVS will control visibility for ${outcome.target.name}`);
  }
}

async function buildConsequencesOverrideValue(effectiveNewState, rowTimerConfig) {
  if (!rowTimerConfig) return effectiveNewState;

  try {
    const { TimedOverrideManager } = await import('../../../services/TimedOverrideManager.js');
    const timedOverride = TimedOverrideManager._buildTimedOverrideData(rowTimerConfig);
    return { state: effectiveNewState, timedOverride };
  } catch (error) {
    console.error('PF2E Visioner | Consequences row apply: Failed to build timer:', error);
    return effectiveNewState;
  }
}

async function getChangedConsequencesOutcomes(app) {
  let filteredOutcomes = filterOutcomesByEncounter(app.outcomes, app.encounterOnly, 'target');

  try {
    const { filterOutcomesByAllies } = await import('../../services/infra/shared-utils.js');
    filteredOutcomes = filterOutcomesByAllies(
      filteredOutcomes,
      app.attackingToken,
      app.ignoreAllies,
      'target',
    );
  } catch {
    /* Ally filtering is optional */
  }

  try {
    if (app.hideFoundryHidden) {
      filteredOutcomes = filteredOutcomes.filter(
        (outcome) => outcome?.target?.document?.hidden !== true,
      );
    }
  } catch {
    /* Visual filtering is optional */
  }

  return filteredOutcomes.filter((outcome) => outcome.hasActionableChange);
}

function collectConsequencesOverrides(changedOutcomes) {
  const overrides = {};
  const avsRemovals = [];

  for (const outcome of changedOutcomes) {
    const id = outcome?.target?.id;
    const state =
      outcome?.overrideState || outcome?.newVisibility || getDefaultConsequencesVisibility();
    if (!id || !state) continue;

    if (state === 'avs') {
      avsRemovals.push({ id, name: outcome.target.name });
    } else {
      overrides[id] = state;
    }
  }

  return { overrides, avsRemovals };
}

async function removeAllConsequencesAvsOverrides(app, avsRemovals) {
  if (avsRemovals.length === 0) return;

  try {
    const { default: AvsOverrideManager } = await import(
      '../../services/infra/AvsOverrideManager.js'
    );
    const attackerId = app.actionData?.actor?.document?.id || app.actionData?.actor?.id;
    if (!attackerId) return;

    for (const removal of avsRemovals) {
      await AvsOverrideManager.removeOverride(removal.id, attackerId);
    }

    const { updateTokenVisuals } = await import('../../../services/visual-effects.js');
    await updateTokenVisuals();
    notify.info(`${MODULE_TITLE}: Accepted AVS changes for ${avsRemovals.length} token(s)`);
  } catch (error) {
    console.warn('Failed to remove AVS overrides:', error);
    notify.info(`${MODULE_TITLE}: AVS will control visibility for ${avsRemovals.length}`);
  }
}

async function applyAllConsequencesOverrides(app, overrides) {
  if (Object.keys(overrides).length === 0) return;

  const { applyNowConsequences } = await import('../../services/index.js');
  await applyNowConsequences(
    {
      ...app.actionData,
      overrides,
      ignoreAllies: app.ignoreAllies,
      encounterOnly: app.encounterOnly,
    },
    { html: () => {}, attr: () => {} },
  );
}

function markConsequencesOutcomesApplied(app, changedOutcomes) {
  for (const outcome of changedOutcomes) {
    app.updateRowButtonsToApplied([
      { target: { id: outcome.target.id }, hasActionableChange: true },
    ]);
  }
}
