import { getDefaultNewStateFor } from '../../data/action-state-config.js';
import defaultTurnSneakTracker from '../../TurnSneakTracker.js';
import EnhancedSneakOutcome from './EnhancedSneakOutcome.js';

async function applySneakVisibilityAdjustment(actionData, current, newVisibility, outcome) {
  try {
    const { FeatsHandler } = await import('../../FeatsHandler.js');
    const inNatural = (() => {
      try {
        return FeatsHandler.isEnvironmentActive(actionData.actor, 'natural');
      } catch {
        return false;
      }
    })();
    return FeatsHandler.adjustVisibility('sneak', actionData.actor, current, newVisibility, {
      inNaturalTerrain: inNatural,
      outcome,
    });
  } catch {
    return newVisibility;
  }
}

async function shouldSkipEndCoverRequirement(actionData) {
  try {
    const { FeatsHandler } = await import('../../FeatsHandler.js');
    return FeatsHandler.shouldSkipEndCoverRequirement(actionData.actor, 'sneak');
  } catch {
    return false;
  }
}

async function applyEndPositionRequirement(actionData, positionTransition, newVisibility) {
  if (await shouldSkipEndCoverRequirement(actionData)) return newVisibility;

  const endCover = positionTransition?.endPosition?.coverState;
  const endVis = positionTransition?.endPosition?.avsVisibility;
  const endQualifies =
    endCover === 'standard' || endCover === 'greater' || endVis === 'concealed';
  return endQualifies ? newVisibility : 'avs';
}

async function resolveStandardVisibility(actionData, current, outcome) {
  const mapped = getDefaultNewStateFor('sneak', current, outcome) || current;
  return applySneakVisibilityAdjustment(actionData, current, mapped, outcome);
}

async function resolveEnhancedVisibility({
  actionData,
  subject,
  current,
  outcome,
  total,
  dc,
  die,
  positionTransition,
}) {
  const enhancedOutcome = await EnhancedSneakOutcome.determineEnhancedOutcome({
    startVisibilityState: positionTransition.startPosition.avsVisibility,
    endVisibilityState: positionTransition.endPosition.avsVisibility,
    currentVisibilityState: current,
    rollOutcome: outcome,
    rollTotal: total,
    perceptionDC: dc,
    dieResult: die,
    observerToken: subject,
    sneakingToken: actionData.actor,
    positionTransition,
  });

  let newVisibility = enhancedOutcome.newVisibility;
  newVisibility = await applyEndPositionRequirement(actionData, positionTransition, newVisibility);
  newVisibility = await applySneakVisibilityAdjustment(
    actionData,
    current,
    newVisibility,
    outcome,
  );

  return { newVisibility, enhancedOutcome };
}

async function resolveDisplayedVisibility(params) {
  const positionTransition = await params.getPositionTransitionForSubject(params.subject);
  if (positionTransition?.startPosition && positionTransition?.endPosition) {
    const { newVisibility, enhancedOutcome } = await resolveEnhancedVisibility({
      ...params,
      outcome: params.adjustedOutcome,
      positionTransition,
    });
    return { newVisibility, enhancedOutcome, positionTransition };
  }

  return {
    newVisibility: await resolveStandardVisibility(
      params.actionData,
      params.current,
      params.adjustedOutcome,
    ),
    enhancedOutcome: null,
    positionTransition,
  };
}

async function applySneakyTurnTracking({
  actionData,
  subject,
  adjustedOutcome,
  newVisibility,
  getSneakingToken,
  turnSneakTracker,
}) {
  try {
    const sneakingToken = getSneakingToken(actionData);
    if (!sneakingToken || !turnSneakTracker.hasSneakyFeat(sneakingToken)) return newVisibility;

    const shouldApplyOutcome = turnSneakTracker.recordRollOutcome(
      sneakingToken,
      subject,
      adjustedOutcome,
      newVisibility,
    );
    return shouldApplyOutcome ? newVisibility : 'avs';
  } catch (error) {
    console.warn('PF2E Visioner | Error tracking roll outcome for Sneaky feat:', error);
    return newVisibility;
  }
}

async function resolveOriginalVisibility({
  actionData,
  subject,
  current,
  originalOutcome,
  originalTotal,
  dc,
  die,
  enhancedOutcome,
  positionTransition,
  newVisibility,
}) {
  if (!originalTotal) return newVisibility;

  try {
    if (enhancedOutcome && positionTransition?.startPosition && positionTransition?.endPosition) {
      const originalEnhanced = await EnhancedSneakOutcome.determineEnhancedOutcome({
        startVisibilityState: positionTransition.startPosition.avsVisibility,
        endVisibilityState: positionTransition.endPosition.avsVisibility,
        currentVisibilityState: current,
        rollOutcome: originalOutcome,
        rollTotal: originalTotal,
        perceptionDC: dc,
        dieResult: die,
        observerToken: subject,
        sneakingToken: actionData.actor,
        positionTransition,
      });
      return originalEnhanced.newVisibility;
    }

    return getDefaultNewStateFor('sneak', current, originalOutcome) || current;
  } catch (error) {
    console.warn('PF2E Visioner | Failed to calculate original enhanced outcome:', error);
    return getDefaultNewStateFor('sneak', current, originalOutcome) || current;
  }
}

export async function resolveSneakVisibilityOutcome({
  actionData,
  subject,
  current,
  adjustedOutcome,
  originalOutcome,
  originalTotal,
  total,
  dc,
  die,
  getPositionTransitionForSubject,
  getSneakingToken,
  turnSneakTracker = defaultTurnSneakTracker,
}) {
  let displayed;
  try {
    displayed = await resolveDisplayedVisibility({
      actionData,
      subject,
      current,
      adjustedOutcome,
      total,
      dc,
      die,
      getPositionTransitionForSubject,
    });
  } catch (error) {
    console.warn(
      'PF2E Visioner | Enhanced outcome determination failed, using standard logic:',
      error,
    );
    displayed = {
      newVisibility: await resolveStandardVisibility(actionData, current, adjustedOutcome),
      enhancedOutcome: null,
      positionTransition: null,
    };
  }

  const newVisibility = await applySneakyTurnTracking({
    actionData,
    subject,
    adjustedOutcome,
    newVisibility: displayed.newVisibility,
    getSneakingToken,
    turnSneakTracker,
  });
  const originalNewVisibility = await resolveOriginalVisibility({
    actionData,
    subject,
    current,
    originalOutcome,
    originalTotal,
    dc,
    die,
    enhancedOutcome: displayed.enhancedOutcome,
    positionTransition: displayed.positionTransition,
    newVisibility,
  });

  return {
    newVisibility,
    originalNewVisibility,
    enhancedOutcome: displayed.enhancedOutcome,
    positionTransition: displayed.positionTransition,
  };
}
