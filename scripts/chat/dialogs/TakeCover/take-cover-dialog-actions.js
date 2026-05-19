import { MODULE_TITLE } from '../../../constants.js';
import { notify } from '../../services/infra/notifications.js';
import { getTakeCoverDisplayBaseline } from './take-cover-dialog-context.js';

export async function applyAllTakeCoverChanges(app) {
  if (!app) return;

  if (app.bulkActionState === 'applied') {
    notify.warn(`${MODULE_TITLE}: Apply All has already been used. Use Revert All to undo changes.`);
    return;
  }

  const changed = getChangedTakeCoverOutcomes(await app.getFilteredOutcomes());
  if (changed.length === 0) {
    notify.info(`${MODULE_TITLE}: No changes to apply`);
    return;
  }

  const overrides = collectTakeCoverOverrides(changed);
  const { applyNowTakeCover } = await import('../../services/index.js');
  await applyNowTakeCover({ ...app.actionData, overrides }, { html: () => {}, attr: () => {} });

  app.bulkActionState = 'applied';
  app.updateBulkActionButtons();
  app.updateRowButtonsToApplied(
    changed.map((outcome) => ({ target: { id: outcome.target.id }, hasActionableChange: true })),
  );
  app.updateChangesCount();
  app.close();
}

export async function revertAllTakeCoverChanges(app) {
  if (!app) return;

  if (app.bulkActionState === 'reverted') {
    notify.warn(
      `${MODULE_TITLE}: Revert All has already been used. Use Apply All to reapply changes.`,
    );
    return;
  }

  const { revertNowTakeCover } = await import('../../services/index.js');
  await revertNowTakeCover(app.actionData, { html: () => {}, attr: () => {} });

  app.bulkActionState = 'reverted';
  app.updateBulkActionButtons();
  const filtered = await app.getFilteredOutcomes();
  app.updateRowButtonsToReverted(
    filtered.map((outcome) => ({ target: { id: outcome.target.id }, hasActionableChange: true })),
  );
  app.updateChangesCount();
}

export async function applyTakeCoverChange(app, target) {
  if (!app) return;

  const tokenId = target?.dataset?.tokenId;
  const outcome = app.outcomes.find((candidate) => candidate.target.id === tokenId);
  if (!outcome) return;

  const effective = outcome.overrideState || outcome.newVisibility || outcome.newCover;
  const base = getTakeCoverDisplayBaseline(outcome);
  if (effective === base && outcome.takeCoverProneRangedOnly !== true) return;

  const overrides = { [tokenId]: effective };
  const { applyNowTakeCover } = await import('../../services/index.js');
  await applyNowTakeCover({ ...app.actionData, overrides }, { html: () => {}, attr: () => {} });
  app.updateRowButtonsToApplied([{ target: { id: tokenId }, hasActionableChange: true }]);
  app.updateChangesCount();
}

export async function revertTakeCoverChange(app, target) {
  if (!app) return;

  const tokenId = target?.dataset?.tokenId;
  const { revertNowTakeCover } = await import('../../services/index.js');
  const actionDataWithTarget = { ...app.actionData, targetTokenId: tokenId };
  await revertNowTakeCover(actionDataWithTarget, { html: () => {}, attr: () => {} });
  app.updateRowButtonsToReverted([{ target: { id: tokenId }, hasActionableChange: true }]);
  app.updateChangesCount();
}

function getChangedTakeCoverOutcomes(outcomes) {
  return outcomes.filter((outcome) => {
    if (outcome?.hasActionableChange === true) return true;
    if (outcome?.takeCoverProneRangedOnly === true) return true;

    const effective = outcome.overrideState ?? outcome.newVisibility ?? outcome.newCover;
    const base = getTakeCoverDisplayBaseline(outcome);
    return effective != null && base != null && effective !== base;
  });
}

function collectTakeCoverOverrides(changedOutcomes) {
  const overrides = {};

  for (const outcome of changedOutcomes) {
    const id = outcome?.target?.id;
    const state = outcome?.overrideState ?? outcome?.newVisibility ?? outcome?.newCover;
    if (id && state) overrides[id] = state;
  }

  return overrides;
}
