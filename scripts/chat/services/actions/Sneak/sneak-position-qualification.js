import defaultTurnSneakTracker from '../../TurnSneakTracker.js';

async function loadActionQualificationIntegration(provided) {
  if (provided) return provided;
  const { ActionQualificationIntegration } = await import(
    '../../../../rule-elements/ActionQualificationIntegration.js'
  );
  return ActionQualificationIntegration;
}

async function loadFeatsHandler(provided) {
  if (provided) return provided;
  const { FeatsHandler } = await import('../../FeatsHandler.js');
  return FeatsHandler;
}

function getBaseQualification(positionTransition) {
  const startPos = positionTransition.startPosition;
  const endPos = positionTransition.endPosition;
  const startQualifies =
    startPos.avsVisibility === 'hidden' || startPos.avsVisibility === 'undetected';
  const allowExtendedEndStates = game.settings.get(
    'pf2e-visioner',
    'sneakAllowHiddenUndetectedEndPosition',
  );
  const endQualifies =
    endPos.coverState === 'standard' ||
    endPos.coverState === 'greater' ||
    endPos.avsVisibility === 'concealed' ||
    (allowExtendedEndStates &&
      (endPos.avsVisibility === 'hidden' || endPos.avsVisibility === 'undetected'));

  return { startQualifies, endQualifies };
}

async function applyRuleElementQualification({
  actionQualificationIntegration,
  sneakingToken,
  startQualifies,
  endQualifies,
}) {
  try {
    const integration = await loadActionQualificationIntegration(actionQualificationIntegration);
    const startCheck = await integration.checkSneakWithRuleElements(
      sneakingToken,
      { startQualifies, endQualifies, bothQualify: startQualifies && endQualifies },
      'start',
    );
    const endCheck = await integration.checkSneakWithRuleElements(
      sneakingToken,
      startCheck,
      'end',
    );

    return {
      startQualifies: endCheck.startQualifies,
      endQualifies: endCheck.endQualifies,
    };
  } catch (err) {
    console.warn('PF2E Visioner | Error checking rule element qualifications:', err);
    return { startQualifies, endQualifies };
  }
}

function applyDeferredSneakyCheck({
  sneakingToken,
  observerToken,
  endPos,
  endQualifies,
  turnSneakTracker,
}) {
  if (!sneakingToken || !observerToken || !turnSneakTracker.hasSneakyFeat(sneakingToken)) {
    return endQualifies;
  }

  const shouldDefer = turnSneakTracker.shouldDeferEndPositionCheck(
    sneakingToken,
    observerToken,
  );
  if (!shouldDefer) return endQualifies;

  turnSneakTracker.recordDeferredCheck(sneakingToken, observerToken, {
    position: endPos,
    visibility: endPos.avsVisibility,
    coverState: endPos.coverState,
  });

  return true;
}

async function applyFeatPrerequisiteOverrides({
  actionData,
  observerToken,
  positionTransition,
  getSneakingToken,
  featsHandler,
  result,
}) {
  try {
    const handler = await loadFeatsHandler(featsHandler);
    const startPos = positionTransition.startPosition;
    const endPos = positionTransition.endPosition;
    const acting = getSneakingToken?.(actionData) || actionData?.actor || null;
    const inNatural = (() => {
      try {
        return handler.isEnvironmentActive(acting, 'natural');
      } catch {
        return false;
      }
    })();
    const startCenter = actionData?.storedStartPosition?.center || null;
    const endCenter = (getSneakingToken?.(actionData) || actionData?.actor)?.center || null;

    return handler.overridePrerequisites(acting, result, {
      action: 'sneak',
      observer: observerToken,
      startVisibility: startPos.avsVisibility,
      endVisibility: endPos.avsVisibility,
      endCoverState: endPos.coverState,
      inNaturalTerrain: inNatural,
      startCenter,
      endCenter,
    });
  } catch {
    return result;
  }
}

export async function checkSneakPositionQualification({
  positionTransition,
  actionData,
  observerToken = null,
  getSneakingToken,
  turnSneakTracker = defaultTurnSneakTracker,
  actionQualificationIntegration = null,
  featsHandler = null,
}) {
  if (!positionTransition) {
    return {
      startQualifies: false,
      endQualifies: false,
      bothQualify: false,
      reason: 'No position data available',
    };
  }

  const endPos = positionTransition.endPosition;
  const sneakingToken = getSneakingToken(actionData);
  let { startQualifies, endQualifies } = getBaseQualification(positionTransition);
  ({ startQualifies, endQualifies } = await applyRuleElementQualification({
    actionQualificationIntegration,
    sneakingToken,
    startQualifies,
    endQualifies,
  }));
  endQualifies = applyDeferredSneakyCheck({
    sneakingToken,
    observerToken,
    endPos,
    endQualifies,
    turnSneakTracker,
  });

  const bothQualify = startQualifies && endQualifies;
  const result = {
    startQualifies,
    endQualifies,
    bothQualify,
    reason: bothQualify
      ? 'Both positions qualify for sneak'
      : 'Position does not qualify for sneak',
  };

  return applyFeatPrerequisiteOverrides({
    actionData,
    observerToken,
    positionTransition,
    getSneakingToken,
    featsHandler,
    result,
  });
}
