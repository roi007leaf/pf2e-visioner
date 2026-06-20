import { MODULE_TITLE } from '../../../constants.js';
import { notify } from '../../services/infra/notifications.js';
import { filterOutcomesByEncounter } from '../../services/infra/shared-utils.js';

export async function applyAllPointOutChanges(app) {
  if (!app || app.bulkActionState === 'applied') {
    if (app?.bulkActionState === 'applied') {
      notify.warn(
        `${MODULE_TITLE}: Apply All has already been used. Use Revert All to undo changes.`,
      );
    }
    return;
  }

  try {
    const filteredOutcomes =
      typeof app.getFilteredOutcomes === 'function'
        ? await app.getFilteredOutcomes()
        : filterOutcomesByEncounter(app.outcomes, app.encounterOnly, 'target');
    const changedOutcomes = filteredOutcomes.filter(isPointOutStateChange);
    const processedOutcomes = attachOriginalPointOutTargetTokens(app, changedOutcomes);
    const overrides = collectPointOutOverrides(processedOutcomes);
    const { applyNowPointOut } = await import('../../services/index.js');

    await applyNowPointOut({ ...app.actionData, overrides }, { html: () => {}, attr: () => {} });

    app.bulkActionState = 'applied';
    app.updateBulkActionButtons();
    app.updateRowButtonsToApplied(
      processedOutcomes.map((outcome) => ({
        target: { id: outcome.target.id },
        hasActionableChange: true,
      })),
    );
    app.updateChangesCount();

    notify.info(
      `${MODULE_TITLE}: Applied Point Out changes for ${processedOutcomes.length} allies. Dialog remains open for further adjustments.`,
    );
  } catch (error) {
    console.error(`${MODULE_TITLE}: Error applying Point Out changes:`, error);
    notify.error(`${MODULE_TITLE}: Failed to apply Point Out changes`);
  }
}

export async function revertAllPointOutChanges(app) {
  if (!app || app.bulkActionState === 'reverted') {
    if (app?.bulkActionState === 'reverted') {
      notify.warn(
        `${MODULE_TITLE}: Revert All has already been used. Use Apply All to reapply changes.`,
      );
    }
    return;
  }

  try {
    const { revertNowPointOut } = await import('../../services/index.js');
    await revertNowPointOut(app.actionData, { html: () => {}, attr: () => {} });

    const filteredOutcomes = await getPointOutRevertDisplayOutcomes(app);

    app.bulkActionState = 'reverted';
    app.updateBulkActionButtons();
    app.updateRowButtonsToReverted(
      filteredOutcomes.map((outcome) => ({
        target: { id: outcome.target.id },
        hasActionableChange: true,
      })),
    );
    app.updateChangesCount();
  } catch (error) {
    console.error(`${MODULE_TITLE}: Error reverting Point Out changes:`, error);
    notify.error(`${MODULE_TITLE}: Failed to revert Point Out changes`);
  }
}

export async function applyPointOutChange(app, button) {
  if (!app) return;

  const tokenId = button.dataset.tokenId;
  const outcome = app.outcomes.find((candidate) => candidate.target.id === tokenId);

  if (!outcome || !outcome.hasActionableChange) {
    notify.warn(`${MODULE_TITLE}: No change to apply for this token`);
    return;
  }

  try {
    const effectiveNewState = outcome.overrideState || outcome.newVisibility;
    const rowTimerConfig = app.rowTimers?.get(tokenId);
    const overrideValue = await buildPointOutOverrideValue(effectiveNewState, rowTimerConfig);
    const overrides = { [outcome.target.id]: overrideValue };
    const { applyNowPointOut } = await import('../../services/index.js');

    await applyNowPointOut({ ...app.actionData, overrides }, { html: () => {}, attr: () => {} });

    if (rowTimerConfig) {
      app.rowTimers.delete(tokenId);
      app._updateRowTimerButton?.(tokenId);
    }

    app.updateRowButtonsToApplied([
      { target: { id: outcome.target.id }, hasActionableChange: true },
    ]);
    app.updateChangesCount();
  } catch (error) {
    console.error(`${MODULE_TITLE}: Error applying change.`, error);
    notify.error(`${MODULE_TITLE}: Error applying change.`);
  }
}

export async function revertPointOutChange(app, button) {
  if (!app) return;

  const tokenId = button.dataset.tokenId;
  const outcome = app.outcomes.find((candidate) => candidate.target.id === tokenId);

  if (!outcome) {
    notify.warn(`${MODULE_TITLE}: Token not found`);
    return;
  }

  try {
    const { revertNowPointOut } = await import('../../services/index.js');
    const actionDataWithTarget = { ...app.actionData, targetTokenId: tokenId };
    await revertNowPointOut(actionDataWithTarget, { html: () => {}, attr: () => {} });

    app.updateRowButtonsToReverted([
      { target: { id: outcome.target.id }, hasActionableChange: true },
    ]);
    app.updateChangesCount();
  } catch (error) {
    console.error(`${MODULE_TITLE}: Error reverting change.`, error);
    notify.error(`${MODULE_TITLE}: Error reverting change.`);
  }
}

function attachOriginalPointOutTargetTokens(app, changedOutcomes) {
  return changedOutcomes.map((outcome) => {
    if (outcome.targetToken) return outcome;

    const originalOutcome = app.outcomes.find((candidate) => candidate.target.id === outcome.target.id);
    if (originalOutcome?.targetToken) {
      return { ...outcome, targetToken: originalOutcome.targetToken };
    }

    return outcome;
  });
}

function collectPointOutOverrides(processedOutcomes) {
  const overrides = {};

  for (const outcome of processedOutcomes) {
    const id = outcome?.target?.id;
    const state = outcome?.overrideState || outcome?.newVisibility;
    if (id && state) overrides[id] = state;
  }

  return overrides;
}

async function getPointOutRevertDisplayOutcomes(app) {
  let filteredOutcomes = filterOutcomesByEncounter(app.outcomes, app.encounterOnly, 'target');

  try {
    const { filterOutcomesByAllies } = await import('../../services/infra/shared-utils.js');
    filteredOutcomes = filterOutcomesByAllies(
      filteredOutcomes,
      app.actorToken,
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

  return filteredOutcomes;
}

async function buildPointOutOverrideValue(effectiveNewState, rowTimerConfig) {
  if (!rowTimerConfig) return effectiveNewState;

  try {
    const { TimedOverrideManager } = await import('../../../services/TimedOverrideManager.js');
    const timedOverride = TimedOverrideManager._buildTimedOverrideData(rowTimerConfig);
    return { state: effectiveNewState, timedOverride };
  } catch (error) {
    console.error('PF2E Visioner | PointOut row apply: Failed to build timer:', error);
    return effectiveNewState;
  }
}

function isPointOutStateChange(outcome) {
  const effectiveNew = outcome?.overrideState ?? outcome?.newVisibility;
  const baseOld = outcome?.oldVisibility ?? outcome?.currentVisibility;

  return baseOld != null && effectiveNew != null && effectiveNew !== baseOld;
}
