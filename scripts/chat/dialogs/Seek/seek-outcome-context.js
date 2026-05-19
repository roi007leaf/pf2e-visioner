import { getVisibilityBetween } from '../../../utils.js';
import { getDesiredOverrideStatesForAction } from '../../services/data/action-state-config.js';

function getObserverToken(app, outcome) {
  return outcome.observerToken || outcome.observer || app.actorToken;
}

function getSystemConditionState(actor) {
  const hasHidden =
    !!actor?.conditions?.get?.('hidden') ||
    !!actor?.itemTypes?.condition?.some?.((condition) => condition?.slug === 'hidden');
  const hasUndetected = !!actor?.itemTypes?.condition?.some?.(
    (condition) => condition?.slug === 'undetected',
  );

  if (hasUndetected) return 'undetected';
  if (hasHidden) return 'hidden';
  return null;
}

async function clearSystemCondition(actor, state) {
  try {
    const toRemove = actor?.itemTypes?.condition?.find?.((condition) => condition?.slug === state);
    if (toRemove?.delete) await toRemove.delete();
    else if (actor?.toggleCondition) await actor.toggleCondition(state, { active: false });
    else if (actor?.decreaseCondition) await actor.decreaseCondition(state);
  } catch {
    /* PF2e condition cleanup is best effort after Visioner sync */
  }
}

async function syncSystemConditionVisibility(
  outcome,
  observerToken,
  liveVisibility,
  getSetVisibilityBetween,
  { getPlayerCharacterTokens } = {},
) {
  if (outcome._isWall || !globalThis.game?.user?.isGM) return null;
  if (liveVisibility && liveVisibility !== 'observed') return null;

  const actor = outcome.target?.actor;
  const inferred = getSystemConditionState(actor);
  if (!inferred) return null;

  const setVisibilityBetween = await getSetVisibilityBetween();
  const allPCTokens = getPlayerCharacterTokens?.() || [];

  for (const pcToken of allPCTokens) {
    const existingVisibility = getVisibilityBetween(pcToken, outcome.target);
    if (!existingVisibility || existingVisibility === 'observed') {
      try {
        await setVisibilityBetween(pcToken, outcome.target, inferred, {
          direction: 'observer_to_target',
        });
      } catch { }
    }
  }

  try {
    await setVisibilityBetween(observerToken, outcome.target, inferred, {
      direction: 'observer_to_target',
    });
  } catch { }

  await clearSystemCondition(actor, inferred);

  outcome.oldVisibility = inferred;
  outcome.newVisibility = inferred;
  return inferred;
}

async function getSeekDeferredStatus(outcome, observerToken, effectiveNewState, getVisionAnalyzer) {
  if (outcome._isWall || !observerToken || !outcome.target || effectiveNewState !== 'observed') {
    return false;
  }

  try {
    const visionAnalyzer = await getVisionAnalyzer();
    return visionAnalyzer.hasLineOfSight(observerToken, outcome.target) === false;
  } catch {
    return false;
  }
}

async function loadVisionAnalyzer() {
  const { VisionAnalyzer } = await import('../../../visibility/auto-visibility/VisionAnalyzer.js');
  return VisionAnalyzer.getInstance();
}

async function loadSetVisibilityBetween() {
  const { setVisibilityBetween } = await import('../../../utils.js');
  return setVisibilityBetween;
}

function createSeekOutcomeContextResources({
  getVisionAnalyzer,
  getSetVisibilityBetween,
} = {}) {
  let visionAnalyzerPromise = null;
  const resolveVisionAnalyzer = getVisionAnalyzer || (async () => {
    visionAnalyzerPromise ??= loadVisionAnalyzer();
    return visionAnalyzerPromise;
  });

  let setVisibilityBetweenPromise = null;
  const resolveSetVisibilityBetween = getSetVisibilityBetween || (async () => {
    setVisibilityBetweenPromise ??= loadSetVisibilityBetween();
    return setVisibilityBetweenPromise;
  });

  let playerCharacterTokens = null;
  const getPlayerCharacterTokens = () => {
    if (playerCharacterTokens) return playerCharacterTokens;
    playerCharacterTokens = (
      globalThis.canvas?.tokens?.placeables || []
    ).filter((token) => token.actor?.type === 'character' && token.actor?.hasPlayerOwner);
    return playerCharacterTokens;
  };

  return {
    desiredStates: getDesiredOverrideStatesForAction('seek'),
    getVisionAnalyzer: resolveVisionAnalyzer,
    getSetVisibilityBetween: resolveSetVisibilityBetween,
    getPlayerCharacterTokens,
  };
}

export function calculateSeekOutcomeActionability(
  app,
  outcome,
  { effectiveNewState, baseOldState, isOldStateAvsControlled } = {},
) {
  if (outcome.overrideState === 'avs' && app.isCurrentStateAvsControlled(outcome)) {
    return false;
  }

  if (outcome.overrideState) {
    const statesMatch = effectiveNewState === baseOldState;
    return (
      (baseOldState != null && effectiveNewState != null && !statesMatch) ||
      (statesMatch && isOldStateAvsControlled)
    );
  }

  const statesMatch = baseOldState === effectiveNewState;
  return outcome.changed === true || (statesMatch && isOldStateAvsControlled);
}

export async function prepareSeekOutcomeContext(
  app,
  outcome,
  resources = {},
) {
  const contextResources = resources.desiredStates
    ? resources
    : createSeekOutcomeContextResources(resources);
  let currentVisibility = outcome.oldVisibility || outcome.currentVisibility;
  let liveVisibility = null;
  const observerToken = getObserverToken(app, outcome);

  if (!outcome._isWall) {
    try {
      if (observerToken) {
        liveVisibility = getVisibilityBetween(observerToken, outcome.target);
        currentVisibility = liveVisibility || currentVisibility;
      }

      currentVisibility =
        (await syncSystemConditionVisibility(
          outcome,
          observerToken,
          liveVisibility,
          contextResources.getSetVisibilityBetween,
          contextResources,
        )) || currentVisibility;
    } catch { }
  }

  const desiredStates = contextResources.desiredStates;
  const availableStates = app.buildOverrideStates(desiredStates, outcome);
  const effectiveNewState = outcome.overrideState || outcome.newVisibility || currentVisibility;
  const baseOldState =
    outcome.oldVisibility != null ? outcome.oldVisibility : currentVisibility;
  const isOldStateAvsControlled = app.isOldStateAvsControlled(outcome);
  const hasActionableChange = calculateSeekOutcomeActionability(app, outcome, {
    effectiveNewState,
    baseOldState,
    isOldStateAvsControlled,
  });
  const deferred = await getSeekDeferredStatus(
    outcome,
    observerToken,
    effectiveNewState,
    contextResources.getVisionAnalyzer,
  );

  return {
    ...outcome,
    rowId: app.getOutcomeTokenId(outcome),
    outcomeClass: outcome.noProficiency ? 'neutral' : app.getOutcomeClass(outcome.outcome),
    outcomeLabel: outcome.noProficiency ? 'No proficiency' : app.getOutcomeLabel(outcome.outcome),
    oldVisibilityState: app.visibilityConfig(baseOldState),
    newVisibilityState: app.visibilityConfig(effectiveNewState),
    marginText: app.formatMargin(outcome.margin),
    tokenImage: app.resolveTokenImage(outcome.target),
    availableStates,
    overrideState: outcome.overrideState || outcome.newVisibility,
    hasActionableChange,
    noProficiency: !!outcome.noProficiency,
    isOldStateAvsControlled,
    detectedBySense: outcome.usedSenseType || null,
    deferred,
  };
}

export async function prepareSeekOutcomeContexts(app, outcomes = []) {
  const resources = createSeekOutcomeContextResources();

  return Promise.all(
    outcomes.map((outcome) =>
      prepareSeekOutcomeContext(app, outcome, resources),
    ),
  );
}
