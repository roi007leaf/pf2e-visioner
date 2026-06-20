import { MODULE_TITLE } from '../../../constants.js';
import { notify } from '../../services/infra/notifications.js';

export async function applyAllHideDialogChanges(app) {
  if (!app) {
    console.error('[Hide Dialog] Could not find application instance');
    return;
  }

  ensureHideBulkState(app);
  if (app.bulkActionState === 'applied') {
    notify.warn(`${MODULE_TITLE}: Apply All has already been used. Use Revert All to undo changes.`);
    return;
  }

  const filteredOutcomes = await app.getFilteredOutcomes();
  const changedOutcomes = getChangedHideOutcomes(app, filteredOutcomes);

  if (changedOutcomes.length === 0) {
    notify.info(`${MODULE_TITLE}: No visibility changes to apply`);
    return;
  }

  const { overrides, avsRemovals } = partitionHideDialogChanges(changedOutcomes);
  await removeHideAvsOverrides(app, avsRemovals);
  await applyHideOverrides(app, overrides);

  app.bulkActionState = 'applied';
  app.updateBulkActionButtons();
  app.updateRowButtonsToApplied(changedOutcomes);
  app.updateChangesCount();
  notify.info(
    `${MODULE_TITLE}: Applied ${changedOutcomes.length} hide visibility changes. Dialog remains open for further adjustments.`,
  );
}

export async function revertAllHideDialogChanges(app) {
  if (!app) return;

  ensureHideBulkState(app);
  if (app.bulkActionState === 'reverted') {
    notify.warn(
      `${MODULE_TITLE}: Revert All has already been used. Use Apply All to reapply changes.`,
    );
    return;
  }

  try {
    const { revertNowHide } = await import('../../services/index.js');
    await revertNowHide(
      { ...app.actionData, ignoreAllies: app.ignoreAllies },
      { html: () => {}, attr: () => {} },
    );
  } catch {
    /* Revert service failure still leaves dialog stable */
  }

  app.bulkActionState = 'reverted';
  app.updateBulkActionButtons();

  const filtered = await app.getFilteredOutcomes();
  app.updateRowButtonsToReverted(
    filtered.map((outcome) => ({
      target: { id: outcome.target.id },
      hasActionableChange: true,
    })),
  );
  app.updateChangesCount();

  notify.info(
    `${MODULE_TITLE}: Reverted all tokens to original visibility. Dialog remains open for further adjustments.`,
  );
}

export async function applyHideDialogChange(app, target) {
  if (!app) {
    console.error('[Hide Dialog] Could not find application instance');
    return;
  }

  const tokenId = target.dataset.tokenId;
  const outcome = app.outcomes.find((candidate) => candidate.target.id === tokenId);

  if (!outcome) {
    notify.warn(`${MODULE_TITLE}: No outcome found for this token`);
    return;
  }

  const effectiveNewState = outcome.overrideState || outcome.newVisibility;
  if (effectiveNewState === 'avs') {
    await removeSingleHideAvsOverride(app, tokenId, outcome);
    return;
  }

  if (!isHideDialogChangeActionable(app, outcome, effectiveNewState)) {
    notify.warn(`${MODULE_TITLE}: No change to apply for ${outcome.target.name}`);
    return;
  }

  try {
    const overrideValue = await getHideDialogOverrideValue(app, tokenId, effectiveNewState);
    const { applyNowHide } = await import('../../services/index.js');
    await applyNowHide(
      {
        ...app.actionData,
        ignoreAllies: app.ignoreAllies,
        overrides: { [outcome.target.id]: overrideValue },
      },
      { html: () => {}, attr: () => {} },
    );

    clearHideRowTimer(app, tokenId);
    app.updateRowButtonsToApplied([{ target: { id: tokenId }, hasActionableChange: true }]);
    app.updateChangesCount();
  } catch {
    notify.error(`${MODULE_TITLE}: Error applying change for ${outcome.target.name}`);
  }
}

export async function revertHideDialogChange(app, target) {
  if (!app) {
    console.error('[Hide Dialog] Could not find application instance');
    return;
  }

  const tokenId = target.dataset.tokenId;
  const outcome = app.outcomes.find((candidate) => candidate.target.id === tokenId);

  if (!outcome) {
    notify.warn(`${MODULE_TITLE}: Could not find outcome for this token`);
    return;
  }

  try {
    const { revertNowHide } = await import('../../services/index.js');
    await revertNowHide(
      {
        ...app.actionData,
        ignoreAllies: app.ignoreAllies,
        targetTokenId: tokenId,
      },
      { html: () => {}, attr: () => {} },
    );

    app.updateRowButtonsToReverted([{ target: { id: tokenId }, hasActionableChange: true }]);
    app.updateChangesCount();
  } catch {
    notify.error(`${MODULE_TITLE}: Error reverting change for ${outcome.target.name}`);
  }
}

export function isHideDialogChangeActionable(app, outcome, effectiveNewState) {
  const isOldStateAvsControlled = app.isOldStateAvsControlled(outcome);
  const statesMatch = effectiveNewState === outcome.oldVisibility;

  return effectiveNewState !== outcome.oldVisibility || (statesMatch && isOldStateAvsControlled);
}

function ensureHideBulkState(app) {
  if (!app.bulkActionState) app.bulkActionState = 'initial';
}

function getChangedHideOutcomes(app, filteredOutcomes) {
  return filteredOutcomes.filter((outcome) => {
    const effectiveNewState = outcome.overrideState || outcome.newVisibility;
    const baseOld = outcome.oldVisibility || outcome.currentVisibility;

    if (baseOld == null || effectiveNewState == null) return false;

    const isOldStateAvsControlled = app.isOldStateAvsControlled(outcome);
    const statesMatch = effectiveNewState === baseOld;
    return effectiveNewState !== baseOld || (statesMatch && isOldStateAvsControlled);
  });
}

function partitionHideDialogChanges(changedOutcomes) {
  const overrides = {};
  const avsRemovals = [];

  for (const outcome of changedOutcomes) {
    const id = outcome?.target?.id;
    const state = outcome?.overrideState || outcome?.newVisibility;
    if (!id || !state) continue;

    if (state === 'avs') {
      avsRemovals.push({ id, name: outcome.target.name });
    } else {
      overrides[id] = state;
    }
  }

  return { overrides, avsRemovals };
}

async function removeHideAvsOverrides(app, avsRemovals) {
  if (avsRemovals.length === 0) return;

  try {
    const { default: AvsOverrideManager } = await import(
      '../../services/infra/AvsOverrideManager.js'
    );
    const hiderId = app.actionData?.actor?.document?.id || app.actionData?.actor?.id;
    if (!hiderId) return;

    for (const removal of avsRemovals) {
      await AvsOverrideManager.removeOverride(removal.id, hiderId);
    }

    await refreshHideTokenVisuals();
    notify.info(`${MODULE_TITLE}: Accepted AVS changes for ${avsRemovals.length} token(s)`);
  } catch (error) {
    console.warn('Failed to remove AVS overrides:', error);
    notify.info(`${MODULE_TITLE}: AVS will control visibility for ${avsRemovals.length}`);
  }
}

async function removeSingleHideAvsOverride(app, tokenId, outcome) {
  try {
    const { default: AvsOverrideManager } = await import(
      '../../services/infra/AvsOverrideManager.js'
    );
    const hiderId = app.actionData?.actor?.document?.id || app.actionData?.actor?.id;
    const observerId = outcome.target.id;

    if (hiderId && observerId) {
      await AvsOverrideManager.removeOverride(observerId, hiderId);
      await refreshHideTokenVisuals();
      notify.info(`${MODULE_TITLE}: Accepted AVS change for ${outcome.target.name}`);
    }
  } catch (error) {
    console.warn('Failed to remove AVS override:', error);
    notify.info(`${MODULE_TITLE}: AVS will control visibility for ${outcome.target.name}`);
  }

  app.updateRowButtonsToApplied([{ target: { id: tokenId }, hasActionableChange: false }]);
  app.updateChangesCount();
}

async function refreshHideTokenVisuals() {
  const { updateTokenVisuals } = await import('../../../services/visual-effects.js');
  await updateTokenVisuals();
}

async function applyHideOverrides(app, overrides) {
  if (Object.keys(overrides).length === 0) return;

  const { applyNowHide } = await import('../../services/index.js');
  await applyNowHide(
    { ...app.actionData, ignoreAllies: app.ignoreAllies, overrides },
    { html: () => {}, attr: () => {} },
  );
}

async function getHideDialogOverrideValue(app, tokenId, effectiveNewState) {
  const rowTimerConfig = app.rowTimers?.get(tokenId);
  if (!rowTimerConfig) return effectiveNewState;

  try {
    const { TimedOverrideManager } = await import('../../../services/TimedOverrideManager.js');
    const timedOverride = TimedOverrideManager._buildTimedOverrideData(rowTimerConfig);
    return { state: effectiveNewState, timedOverride };
  } catch (error) {
    console.error('PF2E Visioner | Hide row apply: Failed to build timer:', error);
    return effectiveNewState;
  }
}

function clearHideRowTimer(app, tokenId) {
  if (!app.rowTimers?.has(tokenId)) return;

  app.rowTimers.delete(tokenId);
  app._updateRowTimerButton?.(tokenId);
}
