import { getDefaultNewStateFor } from '../../data/action-state-config.js';

function getObserverId(outcome) {
  return outcome?.token?.document?.id || outcome?.token?.id;
}

function getSneakStartStates(actionData) {
  const message = actionData?.message || game.messages.get(actionData?.messageId);
  return message?.flags?.['pf2e-visioner']?.sneakStartStates;
}

async function getEndCoverState(outcome, sneakingToken, startState) {
  let endCoverState = startState.endCoverState || 'none';
  if (endCoverState !== 'none') return endCoverState;

  try {
    const { getCoverBetween } = await import('../../../../utils.js');
    endCoverState = getCoverBetween(outcome.token, sneakingToken) || 'none';
  } catch {
    endCoverState = 'none';
  }

  return endCoverState;
}

function canEndSneak(endVisibility, endCoverState, allowExtendedEndStates) {
  return (
    endCoverState === 'standard' ||
    endCoverState === 'greater' ||
    endVisibility === 'concealed' ||
    (allowExtendedEndStates &&
      (endVisibility === 'hidden' || endVisibility === 'undetected'))
  );
}

export async function enrichSneakOutcomesWithStartStates(
  actionData,
  outcomes,
  { getSneakingToken, autoCoverSystem, stealthCheckUseCase },
) {
  try {
    const sneakStartStates = getSneakStartStates(actionData);
    if (!sneakStartStates || !Object.keys(sneakStartStates).length) return;

    const sneakingToken = getSneakingToken(actionData);
    if (!sneakingToken) return;

    const allowExtendedEndStates =
      game.settings?.get?.('pf2e-visioner', 'sneakAllowHiddenUndetectedEndPosition') ?? false;

    for (const outcome of outcomes) {
      if (!outcome?.token || outcome.positionTransition) continue;

      const observerId = getObserverId(outcome);
      const startState = sneakStartStates[observerId];
      if (!startState) continue;

      const startVisibility = startState.visibility || 'observed';
      const startQualifies = startVisibility === 'hidden' || startVisibility === 'undetected';
      const endVisibility = outcome.currentVisibility || 'observed';
      let endCoverState = await getEndCoverState(outcome, sneakingToken, startState);
      if (endCoverState === 'none' && autoCoverSystem?.isEnabled?.()) {
        endCoverState = stealthCheckUseCase?._detectCover?.(outcome.token, sneakingToken) || 'none';
      }
      const endQualifies = canEndSneak(endVisibility, endCoverState, allowExtendedEndStates);

      outcome.oldVisibility = startVisibility;

      if (!startQualifies || !endQualifies) {
        outcome.newVisibility = 'avs';
      } else {
        const newVis = getDefaultNewStateFor('sneak', startVisibility, outcome.outcome);
        if (newVis) outcome.newVisibility = newVis;
      }

      outcome.changed = outcome.newVisibility !== outcome.currentVisibility;
    }
  } catch (error) {
    console.warn('PF2E Visioner | Error enriching outcomes with start states:', error);
  }
}
