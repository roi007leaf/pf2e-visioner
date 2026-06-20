import { getDefaultNewStateFor } from '../../data/action-state-config.js';

async function applyHideVisibilityAdjustment(actionData, current, newVisibility, outcome) {
  try {
    const { FeatsHandler } = await import('../../FeatsHandler.js');
    const inNatural = (() => {
      try {
        return FeatsHandler.isEnvironmentActive(actionData.actor, 'natural');
      } catch {
        return false;
      }
    })();
    return FeatsHandler.adjustVisibility('hide', actionData.actor, current, newVisibility, {
      inNaturalTerrain: inNatural,
      outcome,
    });
  } catch {
    return newVisibility;
  }
}

export async function resolveHideVisibilityOutcomes({
  actionData,
  current,
  adjustedOutcome,
  originalOutcome,
  originalTotal,
}) {
  let newVisibility = getDefaultNewStateFor('hide', current, adjustedOutcome) || current;
  newVisibility = await applyHideVisibilityAdjustment(
    actionData,
    current,
    newVisibility,
    adjustedOutcome,
  );

  let originalNewVisibility = originalTotal
    ? getDefaultNewStateFor('hide', current, originalOutcome) || current
    : newVisibility;
  if (originalTotal) {
    originalNewVisibility = await applyHideVisibilityAdjustment(
      actionData,
      current,
      originalNewVisibility,
      originalOutcome,
    );
  }

  return { newVisibility, originalNewVisibility };
}
