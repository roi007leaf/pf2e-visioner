import {
  canAttemptHideOrRemainHidden,
  legacyVisibilityToProfile,
} from '../../../../visibility/perception-profile.js';

export function evaluateHidePrerequisites(startVisibility, endVisibility, coverState = 'none') {
  const startQualifies = canAttemptHideOrRemainHidden(
    legacyVisibilityToProfile(startVisibility, { coverState }),
  );
  const endQualifies = canAttemptHideOrRemainHidden(
    legacyVisibilityToProfile(endVisibility, { coverState }),
  );

  return {
    startQualifies,
    endQualifies,
    bothQualify: startQualifies && endQualifies,
    reason: 'Hide prerequisites evaluated',
  };
}

export function applyHidePrerequisiteFallback(newVisibility, qualification) {
  return qualification?.endQualifies ? newVisibility : 'avs';
}

function resolveHidingToken(actionData) {
  let hidingToken = actionData.actorToken || actionData.actor;
  if (hidingToken?.actor) return hidingToken;
  if (hidingToken?.getActiveTokens) {
    hidingToken = hidingToken.getActiveTokens()[0];
  }
  return hidingToken;
}

async function applyFeatPrerequisiteOverrides(actionData, subject, qualification, position) {
  try {
    const { FeatsHandler } = await import('../../FeatsHandler.js');
    const inNatural = (() => {
      try {
        return FeatsHandler.isEnvironmentActive(actionData.actor, 'natural');
      } catch {
        return false;
      }
    })();
    return FeatsHandler.overridePrerequisites(actionData.actor, qualification, {
      action: 'hide',
      observer: subject,
      startVisibility: position.startVisibility,
      endVisibility: position.endVisibility,
      endCoverState: position.endCoverState,
      inNaturalTerrain: inNatural,
      startCenter: actionData?.storedStartPosition?.center || undefined,
      endCenter: position.endSnapshot?.endPositionCenter || undefined,
    });
  } catch {
    return qualification;
  }
}

async function applyRuleElementQualification(actionData, qualification) {
  try {
    const { ActionQualificationIntegration } = await import(
      '../../../../rule-elements/ActionQualificationIntegration.js'
    );
    const hidingToken = resolveHidingToken(actionData);
    if (!hidingToken) return qualification;
    return ActionQualificationIntegration.checkHideWithRuleElements(hidingToken, qualification);
  } catch (err) {
    console.warn('PF2E Visioner | Error checking rule element qualifications:', err);
    return qualification;
  }
}

export async function resolveHidePositionQualification({ actionData, subject, current }) {
  try {
    const { default: positionTracker } = await import('../../position/PositionTracker.js');
    const endSnapshot = await positionTracker._capturePositionState(
      actionData.actor,
      subject,
      Date.now(),
      { forceFresh: true, useCurrentPositionForCover: true },
    );

    const position = {
      endSnapshot,
      startVisibility: current,
      endVisibility: endSnapshot?.avsVisibility || current,
      endCoverState: endSnapshot?.coverState || 'none',
    };
    let qualification = evaluateHidePrerequisites(
      position.startVisibility,
      position.endVisibility,
      position.endCoverState,
    );
    qualification = await applyFeatPrerequisiteOverrides(
      actionData,
      subject,
      qualification,
      position,
    );
    return applyRuleElementQualification(actionData, qualification);
  } catch {
    return null;
  }
}
