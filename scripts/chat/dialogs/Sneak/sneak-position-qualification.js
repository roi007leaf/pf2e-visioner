import autoCoverSystem from '../../../cover/auto-cover/AutoCoverSystem.js';
import { ActionQualifier } from '../../../rule-elements/operations/ActionQualifier.js';
import { getCoverBetween, getVisibilityBetween } from '../../../utils.js';
import {
  canAttemptHideOrRemainHidden,
  legacyVisibilityToProfile,
  overrideToDisplayVisibility,
} from '../../../visibility/perception-profile.js';
import { getDefaultNewStateFor } from '../../services/data/action-state-config.js';
import turnSneakTracker from '../../services/TurnSneakTracker.js';

export function allowHiddenUndetectedSneakEndStates() {
  try {
    return game.settings.get('pf2e-visioner', 'sneakAllowHiddenUndetectedEndPosition');
  } catch {
    return false;
  }
}

export function sneakStartPositionQualifies(visibility) {
  const { detectionState } = legacyVisibilityToProfile(visibility);
  return detectionState === 'hidden' || detectionState === 'undetected';
}

export function sneakEndPositionQualifies(visibility, coverState = 'none', options = {}) {
  const allowExtendedEndStates =
    options.allowExtendedEndStates ?? allowHiddenUndetectedSneakEndStates();
  const profile = legacyVisibilityToProfile(visibility, { coverState });

  if (canAttemptHideOrRemainHidden(profile)) return true;
  return (
    allowExtendedEndStates &&
    (profile.detectionState === 'hidden' || profile.detectionState === 'undetected')
  );
}

export function startPositionQualifiesForSneak(dialog, observerToken, outcome) {
  if (!observerToken || !dialog.sneakingToken) return false;

  try {
    if (ActionQualifier.forceStartQualifies(dialog.sneakingToken, 'sneak')) {
      return true;
    }

    if (outcome?._featPositionOverride) {
      return !!outcome._featPositionOverride.startQualifies;
    }

    const positionDisplay = outcome?.positionDisplay?.startPosition;
    if (positionDisplay && typeof positionDisplay.qualifies === 'boolean') {
      return positionDisplay.qualifies;
    }

    const observerId = observerToken.document?.id || observerToken.id;
    const overrideVisibility = getSneakObserverOverrideVisibility(dialog, observerId);
    if (overrideVisibility && sneakStartPositionQualifies(overrideVisibility)) {
      return true;
    }

    const startState = dialog.startStates[observerId];
    if (startState?.visibility) {
      return sneakStartPositionQualifies(startState.visibility);
    }

    const positionTransition = dialog._getPositionTransitionForToken(observerToken);
    if (positionTransition?.startPosition) {
      return sneakStartPositionQualifies(positionTransition.startPosition.avsVisibility);
    }

    if (outcome && (outcome.startVisibility || outcome.startState)) {
      const startVisibility = outcome.startVisibility || outcome.startState?.visibility;
      return sneakStartPositionQualifies(startVisibility);
    }

    const visibility = getVisibilityBetween(observerToken, dialog.sneakingToken);
    return sneakStartPositionQualifies(visibility);
  } catch {
    return false;
  }
}

export function endPositionQualifiesForSneak(dialog, observerToken, outcome) {
  if (!observerToken || !dialog.sneakingToken) return false;

  if (ActionQualifier.forceEndQualifies(dialog.sneakingToken, 'sneak')) {
    return true;
  }

  const actionCheck = ActionQualifier.checkSneakPrerequisites(dialog.sneakingToken, observerToken.id);
  if (!actionCheck.qualifies) {
    return false;
  }

  if (isSneakObserverDeferred(dialog, observerToken)) {
    return true;
  }

  try {
    if (!dialog.isEndOfTurnDialog) {
      const cachedResult = getCachedSneakEndQualification(dialog, observerToken, outcome);
      if (cachedResult != null) return cachedResult;
    }

    const coverState = getLiveSneakCoverState(observerToken, dialog.sneakingToken);
    const visibility = getVisibilityBetween(observerToken, dialog.sneakingToken);
    return sneakEndPositionQualifies(visibility, coverState);
  } catch {
    return false;
  }
}

export async function recalculateSneakOutcomeVisibility(dialog, outcome) {
  if (!outcome) return;

  const positionTransition =
    outcome.positionTransition || dialog._getPositionTransitionForToken(outcome.token);
  if (!positionTransition) {
    return;
  }

  const { startQualifies, endQualifies } = getSneakPositionQualifications(
    outcome,
    positionTransition,
  );
  const currentVisibility = outcome.oldVisibility || outcome.currentVisibility;
  const rollOutcome = outcome.outcome;

  outcome.newVisibility =
    !startQualifies || !endQualifies
      ? 'avs'
      : getDefaultNewStateFor('sneak', currentVisibility, rollOutcome) || currentVisibility;

  await autoUndeferFailedSneak(dialog, outcome, rollOutcome);

  outcome.overrideState = null;
  await dialog._updateOutcomeDisplayForToken(outcome.token.id, outcome);
}

function getSneakObserverOverrideVisibility(dialog, observerId) {
  const overrideFlag = dialog.sneakingToken?.document?.getFlag?.(
    'pf2e-visioner',
    `avs-override-from-${observerId}`,
  );

  return overrideFlag ? overrideToDisplayVisibility(overrideFlag) : null;
}

function getCachedSneakEndQualification(dialog, observerToken, outcome) {
  if (outcome?._featPositionOverride) {
    return !!outcome._featPositionOverride.endQualifies;
  }

  const positionDisplay = outcome?.positionDisplay?.endPosition;
  if (positionDisplay && typeof positionDisplay.qualifies === 'boolean') {
    return positionDisplay.qualifies;
  }

  const observerId = observerToken.document?.id || observerToken.id;
  const overrideFlag = dialog.sneakingToken?.document?.getFlag?.(
    'pf2e-visioner',
    `avs-override-from-${observerId}`,
  );
  if (overrideFlag) {
    const overrideCoverState = overrideFlag.expectedCover ?? (overrideFlag.hasCover ? 'standard' : 'none');
    if (sneakEndPositionQualifies(overrideToDisplayVisibility(overrideFlag), overrideCoverState)) {
      return true;
    }
  }

  if (outcome && (outcome.endCover || outcome.endVisibility)) {
    if (sneakEndPositionQualifies(outcome.endVisibility, outcome.endCover)) return true;
  }

  const positionTransition = dialog._getPositionTransitionForToken(observerToken);
  if (!positionTransition?.endPosition) return null;

  const endPosition = positionTransition.endPosition;
  const allowExtendedEndStates = allowHiddenUndetectedSneakEndStates();
  if (
    sneakEndPositionQualifies(endPosition.avsVisibility, endPosition.coverState, {
      allowExtendedEndStates,
    })
  ) {
    return true;
  }

  if (
    sneakEndPositionQualifies(outcome?.liveEndVisibility, endPosition.coverState, {
      allowExtendedEndStates,
    })
  ) {
    return true;
  }

  return null;
}

function isSneakObserverDeferred(dialog, observerToken) {
  try {
    return !!turnSneakTracker?.isObserverDeferred?.(dialog.sneakingToken, observerToken);
  } catch {
    return false;
  }
}

function getLiveSneakCoverState(observerToken, sneakingToken) {
  try {
    if (autoCoverSystem?.isEnabled?.()) {
      return autoCoverSystem.detectCoverBetweenTokens(observerToken, sneakingToken) || 'none';
    }
  } catch {
    /* Fall back to stored map */
  }

  try {
    return getCoverBetween(observerToken, sneakingToken);
  } catch {
    return 'none';
  }
}

function getSneakPositionQualifications(outcome, positionTransition) {
  if (outcome.positionDisplay?.startPosition && outcome.positionDisplay?.endPosition) {
    return {
      startQualifies: outcome.positionDisplay.startPosition.qualifies,
      endQualifies: outcome.positionDisplay.endPosition.qualifies,
    };
  }

  return {
    startQualifies: sneakStartPositionQualifies(positionTransition.startPosition?.avsVisibility),
    endQualifies: sneakEndPositionQualifies(
      positionTransition.endPosition?.avsVisibility,
      positionTransition.endPosition?.coverState,
    ),
  };
}

async function autoUndeferFailedSneak(dialog, outcome, rollOutcome) {
  if (
    rollOutcome !== 'failure' &&
    rollOutcome !== 'critical-failure'
  ) {
    return;
  }
  if (!outcome.isDeferred || !dialog._deferredChecks?.has(outcome.token.id)) return;

  try {
    dialog._deferredChecks.delete(outcome.token.id);
    turnSneakTracker.removeDeferredCheck(dialog.sneakingToken, outcome.token);
    outcome.isDeferred = false;
    dialog._updateDeferButtonForToken(outcome.token.id, false);

    if (typeof ui !== 'undefined' && ui.notifications) {
      ui.notifications.info(`${outcome.token.name} automatically undeferred - sneak check failed`);
    }
  } catch {
    /* Failed auto-undefer should not block recalculation */
  }
}
