import { getVisibilityBetween } from '../../../utils.js';
import { optimizedVisibilityCalculator } from '../../../visibility/auto-visibility/index.js';
import { overrideToDisplayVisibility } from '../../../visibility/perception-profile.js';
import {
  getDefaultNewStateFor,
  getDesiredOverrideStatesForAction,
} from '../../services/data/action-state-config.js';
import { FeatsHandler } from '../../services/FeatsHandler.js';
import turnSneakTracker from '../../services/TurnSneakTracker.js';

function getNaturalTerrainState(sneakingToken) {
  try {
    return FeatsHandler.isEnvironmentActive(sneakingToken, 'natural');
  } catch {
    return false;
  }
}

function applyFeatPrerequisiteOverrides(
  dialog,
  outcome,
  positionTransition,
  rawStart,
  rawEnd,
  inNaturalTerrain,
) {
  let effective = {
    startQualifies: rawStart,
    endQualifies: rawEnd,
    bothQualify: rawStart && rawEnd,
  };

  try {
    const startPosition = positionTransition.startPosition || {};
    const endPosition = positionTransition.endPosition || {};
    effective = FeatsHandler.overridePrerequisites(dialog.sneakingToken, effective, {
      startVisibility: startPosition.effectiveVisibility,
      endVisibility: endPosition.effectiveVisibility,
      endCoverState: endPosition.coverState,
      inNaturalTerrain,
      impreciseOnly: outcome?.impreciseOnly || false,
    });
  } catch { }

  return effective;
}

export async function recalculateSneakPositionOutcomes(
  dialog,
  outcomes = [],
  { refreshLiveEndVisibility = false, resetOverrideState = false } = {},
) {
  const inNaturalTerrain = getNaturalTerrainState(dialog.sneakingToken);

  for (const outcome of outcomes) {
    const positionTransition =
      outcome.positionTransition || dialog._getPositionTransitionForToken(outcome.token);

    if (refreshLiveEndVisibility) {
      try {
        outcome.liveEndVisibility =
          await optimizedVisibilityCalculator.calculateVisibilityWithoutOverrides(
            outcome.token,
            dialog.sneakingToken,
          );
      } catch { }
    }

    if (outcome._tsFreeSneak) {
      outcome._featPositionOverride = {
        startQualifies: true,
        endQualifies: true,
        bothQualify: true,
        reason: 'Terrain Stalker: free Sneak',
      };
      continue;
    }

    if (!positionTransition) continue;

    const startQualifies = dialog._startPositionQualifiesForSneak(outcome.token, outcome);
    const endQualifies = dialog._endPositionQualifiesForSneak(outcome.token, outcome);
    const effective = applyFeatPrerequisiteOverrides(
      dialog,
      outcome,
      positionTransition,
      startQualifies,
      endQualifies,
      inNaturalTerrain,
    );

    outcome._featPositionOverride = effective;

    if (!effective.startQualifies || !effective.endQualifies) {
      outcome.newVisibility = 'avs';
      if (resetOverrideState) outcome.overrideState = null;
      continue;
    }

    const currentVisibility = outcome.oldVisibility || outcome.currentVisibility;
    const calculatedVisibility = getDefaultNewStateFor(
      'sneak',
      currentVisibility,
      outcome.outcome,
    );
    outcome.newVisibility = calculatedVisibility || currentVisibility;
    if (resetOverrideState) outcome.overrideState = null;
  }
}

export function collectSneakerOverrideFlagsByObserverId(dialog) {
  const flagsByObserverId = new Map();
  const sneakerActorId = dialog.sneakingToken?.actor?.id;
  const placeables = globalThis.canvas?.tokens?.placeables || [];
  const sneakerTokenIds = placeables
    .filter((token) => token.actor?.id === sneakerActorId)
    .map((token) => token.document?.id || token.id)
    .filter(Boolean);

  for (const tokenId of sneakerTokenIds) {
    const sneakerToken = globalThis.canvas?.tokens?.get?.(tokenId);
    const flags = sneakerToken?.document?.flags?.['pf2e-visioner'] || {};
    for (const [key, flag] of Object.entries(flags)) {
      if (!flag || !key.startsWith('avs-override-from-')) continue;
      const observerId = key.slice('avs-override-from-'.length);
      if (!flagsByObserverId.has(observerId)) flagsByObserverId.set(observerId, flag);
    }
  }

  return flagsByObserverId;
}

function resolveInitialCurrentVisibility(dialog, outcome, flagsByObserverId) {
  const observerId = outcome.token?.document?.id || outcome.token?.id;
  let currentVisibility =
    dialog.getVisibilityBetween?.(outcome.token, dialog.sneakingToken) ||
    outcome.oldVisibility ||
    outcome.currentVisibility;

  const overrideFlag = flagsByObserverId?.get(observerId) || null;
  const overrideVisibility = overrideFlag ? overrideToDisplayVisibility(overrideFlag) : null;
  return overrideVisibility || currentVisibility;
}

function resolveRecomputedCurrentVisibility(dialog, outcome) {
  return (
    getVisibilityBetween(outcome.token, dialog.sneakingToken) ||
    outcome.oldVisibility ||
    outcome.currentVisibility
  );
}

export function calculateSneakOutcomeActionability(
  dialog,
  outcome,
  { effectiveNewState, baseOldState, isOldStateAvsControlled } = {},
) {
  if (isOldStateAvsControlled) {
    const isCurrentAvs = dialog.isCurrentStateAvsControlled(outcome);
    if (outcome.overrideState === 'avs' && isCurrentAvs) return false;
    if (outcome.overrideState) return true;
    return baseOldState !== effectiveNewState;
  }

  const statesMatch = baseOldState === effectiveNewState;
  const choosingAvs = outcome.overrideState === 'avs';
  return !statesMatch || choosingAvs;
}

function getBaseOldState(outcome, currentVisibility, oldStatePreference) {
  if (oldStatePreference === 'oldFirst') return outcome.oldVisibility || currentVisibility;
  return currentVisibility || outcome.oldVisibility;
}

export function prepareSneakOutcomeContext(
  dialog,
  outcome,
  {
    desiredStates,
    flagsByObserverId,
    hasSneakyFeat,
    currentVisibilityMode = 'dialog',
    includeOldVisibility = false,
    oldStatePreference = 'currentFirst',
  } = {},
) {
  const currentVisibility =
    currentVisibilityMode === 'live'
      ? resolveRecomputedCurrentVisibility(dialog, outcome)
      : resolveInitialCurrentVisibility(dialog, outcome, flagsByObserverId);
  const states = desiredStates || getDesiredOverrideStatesForAction('sneak');
  const availableStates = dialog.buildOverrideStates(states, outcome);
  const effectiveNewState = outcome.overrideState || outcome.newVisibility;
  const baseOldState = getBaseOldState(outcome, currentVisibility, oldStatePreference);
  const isOldStateAvsControlled = dialog.isOldStateAvsControlled(outcome);
  const hasActionableChange = calculateSneakOutcomeActionability(dialog, outcome, {
    effectiveNewState,
    baseOldState,
    isOldStateAvsControlled,
  });

  const wasPreviouslyDeferred =
    turnSneakTracker?.isObserverDeferred?.(dialog.sneakingToken, outcome.token) || false;
  const positionTransition = dialog._getPositionTransitionForToken(outcome.token);
  const positionDisplay = dialog._preparePositionDisplay(positionTransition, outcome.token, outcome);
  const canDefer = dialog._isEligibleForSneakyDefer(
    outcome,
    positionDisplay,
    hasSneakyFeat,
    wasPreviouslyDeferred,
  );
  const isDeferred = dialog._deferredChecks?.has(outcome.token.id) || wasPreviouslyDeferred;

  const processed = {
    ...outcome,
    outcomeClass: dialog.getOutcomeClass(outcome.outcome),
    outcomeLabel: dialog.getOutcomeLabel(outcome.outcome),
    oldVisibilityState: dialog.visibilityConfig(baseOldState),
    newVisibilityState: dialog.visibilityConfig(effectiveNewState),
    marginText: dialog.formatMargin(outcome.margin),
    tokenImage: dialog.resolveTokenImage(outcome.token),
    availableStates,
    overrideState: outcome.overrideState || outcome.newVisibility,
    hasActionableChange,
    positionTransition,
    positionDisplay,
    hasPositionData: !!positionTransition,
    positionQuality: positionTransition
      ? dialog._assessPositionQuality(positionTransition.endPosition)
      : 'unknown',
    positionChangeType: positionTransition?.transitionType || 'unchanged',
    baseRollTotal: outcome.rollTotal,
    appliedCoverBonus:
      typeof outcome.appliedCoverBonus !== 'undefined' ? outcome.appliedCoverBonus : 0,
    canDefer,
    isDeferred,
  };

  if (includeOldVisibility) {
    processed.oldVisibility = baseOldState;
    processed.isOldStateAvsControlled = isOldStateAvsControlled;
  }

  return processed;
}

export function prepareSneakOutcomeContexts(dialog, outcomes = [], options = {}) {
  const desiredStates = getDesiredOverrideStatesForAction('sneak');
  const hasSneakyFeat = turnSneakTracker.hasSneakyFeat(dialog.sneakingToken);
  const flagsByObserverId = options.useSneakerOverrideFlags
    ? collectSneakerOverrideFlagsByObserverId(dialog)
    : null;

  return outcomes.map((outcome) =>
    prepareSneakOutcomeContext(dialog, outcome, {
      ...options,
      desiredStates,
      flagsByObserverId,
      hasSneakyFeat,
    }),
  );
}
