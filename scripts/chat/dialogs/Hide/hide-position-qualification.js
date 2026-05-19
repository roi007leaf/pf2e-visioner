import { ActionQualifier } from '../../../rule-elements/operations/ActionQualifier.js';
import { getDefaultNewStateFor } from '../../services/data/action-state-config.js';

export function hideEndPositionQualifies(app, endPos) {
  try {
    if (ActionQualifier.forceEndQualifies(app.hidingToken, 'hide')) {
      return true;
    }

    const actionCheck = ActionQualifier.canUseConcealment(app.hidingToken, 'hide');
    if (!actionCheck || !endPos) return false;

    if (
      endPos.coverState &&
      (endPos.coverState === 'standard' || endPos.coverState === 'greater')
    ) {
      return true;
    }

    return endPos.effectiveVisibility === 'concealed';
  } catch {
    return false;
  }
}

export async function recalculateHideOutcomeVisibility(app, outcome) {
  if (!outcome || !outcome.hasPositionData) {
    return;
  }

  const currentVisibility = outcome.oldVisibility || outcome.currentVisibility;
  const rollOutcome = outcome.outcome;
  outcome.newVisibility = getHideOutcomeVisibilityFromPosition(
    outcome,
    currentVisibility,
    rollOutcome,
  );

  updateHidePositionRowState(app, outcome);
}

export async function toggleHidePositionPrerequisite(app, target) {
  if (!app) return;

  const tokenId = target.dataset.tokenId;
  if (!tokenId) return;

  const outcome = app.outcomes.find((candidate) => candidate.target.id === tokenId);
  if (!outcome || !outcome.hasPositionData) return;

  const position = outcome.positionDisplay?.endPosition;
  if (!position) return;

  position.qualifies = !position.qualifies;
  updateHidePositionButton(target, position.qualifies);
  restoreHideVisibilityForPositionToggle(outcome);
  updateHidePositionToggleRow(app, tokenId, outcome);

  await recalculateHideOutcomeVisibility(app, outcome);
  await applyHidePositionVisibility(app, outcome);
}

function getHideOutcomeVisibilityFromPosition(outcome, currentVisibility, rollOutcome) {
  const endQualifies = outcome.positionDisplay?.endPosition?.qualifies ?? false;
  if (!endQualifies) return 'avs';

  return (
    outcome._calculatedNewVisibility ||
    getDefaultNewStateFor('hide', currentVisibility, rollOutcome) ||
    currentVisibility
  );
}

function updateHidePositionButton(target, qualifies) {
  const icon = target.querySelector('i');

  if (qualifies) {
    target.className = 'position-requirement-btn position-check active';
    if (icon) icon.className = 'fas fa-check';
    target.setAttribute('data-tooltip', 'Prerequisite met');
    return;
  }

  target.className = 'position-requirement-btn position-x';
  if (icon) icon.className = 'fas fa-times';
  target.setAttribute('data-tooltip', 'Prerequisite not met');
}

function restoreHideVisibilityForPositionToggle(outcome) {
  if (!outcome.positionDisplay?.endPosition?.qualifies) {
    outcome.newVisibility = 'avs';
    outcome.overrideState = null;
    return;
  }

  try {
    const oldState = outcome.oldVisibility || outcome.currentVisibility;
    const restored =
      outcome._calculatedNewVisibility ||
      getDefaultNewStateFor('hide', oldState, outcome.outcome) ||
      oldState;
    outcome.newVisibility = restored;
    if (outcome.overrideState == null) {
      outcome.overrideState = restored;
    }
  } catch {
    /* Keep existing newVisibility */
  }
}

function updateHidePositionRowState(app, outcome) {
  const row = app.element?.querySelector(`tr[data-token-id="${outcome.target.id}"]`);
  if (!row) return;

  updateHidePositionSelectedIcon(row, outcome.newVisibility);
  outcome.hasActionableChange = getHidePositionActionableChange(app, outcome);
  app.updateActionButtonsForToken(outcome.target.id, outcome.hasActionableChange);
}

function updateHidePositionToggleRow(app, tokenId, outcome) {
  try {
    const row = app.element.querySelector(`tr[data-token-id="${tokenId}"]`);
    if (!row) return;

    updateHidePositionSelectedIcon(row, outcome.overrideState || outcome.newVisibility);
    outcome.hasActionableChange = getHidePositionActionableChange(app, outcome);
    app.updateActionButtonsForToken(tokenId, outcome.hasActionableChange);
  } catch {
    /* Row update is best-effort */
  }
}

function updateHidePositionSelectedIcon(row, effectiveState) {
  const container = row.querySelector('.override-icons');
  if (!container) return;

  container.querySelectorAll('.state-icon').forEach((icon) => icon.classList.remove('selected'));
  const iconElement =
    container.querySelector(`.state-icon[data-state="${effectiveState}"]`) ||
    container.querySelector('.state-icon[data-state="observed"]');
  if (iconElement) iconElement.classList.add('selected');
}

export function getHidePositionActionableChange(app, outcome) {
  const effectiveNew = outcome.overrideState || outcome.newVisibility;
  const oldState = outcome.oldVisibility || outcome.currentVisibility;
  const isOldStateAvsControlled = app.isOldStateAvsControlled(outcome);

  if (outcome.overrideState === 'avs' && app.isCurrentStateAvsControlled(outcome)) {
    return false;
  }

  const statesMatch = effectiveNew != null && oldState != null && effectiveNew === oldState;
  return (
    (effectiveNew != null && oldState != null && effectiveNew !== oldState) ||
    (statesMatch && isOldStateAvsControlled)
  );
}

async function applyHidePositionVisibility(app, outcome) {
  try {
    const effectiveVisibility = outcome.overrideState || outcome.newVisibility;
    const hidingActor = app.actionData?.actor;
    const observerToken = outcome.target;

    if (!hidingActor || !observerToken || !effectiveVisibility) return;

    const hidingToken = canvas.tokens?.placeables?.find(
      (token) => token.actor?.id === hidingActor.id,
    );
    if (!hidingToken) return;

    await applyHidePositionAvsOverride(observerToken, hidingToken, effectiveVisibility);

    const { setVisibilityBetween } = await import('../../../stores/visibility-map.js');
    await setVisibilityBetween(observerToken, hidingToken, effectiveVisibility);
  } catch (error) {
    console.warn('PF2E Visioner | Failed to apply immediate visibility change:', error);
  }
}

async function applyHidePositionAvsOverride(observerToken, hidingToken, effectiveVisibility) {
  try {
    const AvsOverrideManager = (await import('../../services/infra/AvsOverrideManager.js'))
      .default;
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
  } catch (error) {
    console.warn(
      'PF2E Visioner | Failed to set AVS override for hide prerequisite toggle:',
      error,
    );
  }
}
