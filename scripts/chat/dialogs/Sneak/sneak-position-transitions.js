import { optimizedVisibilityCalculator } from '../../../visibility/auto-visibility/index.js';

export async function captureCurrentSneakEndPositions(app, outcomes) {
  if (!outcomes?.length || !app.sneakingToken) return;

  try {
    for (const outcome of outcomes) {
      if (!outcome.token?.document?.id) continue;
      await captureSneakEndPositionForOutcome(app, outcome);
    }
  } catch {
    /* Capture is best-effort */
  }
}

export async function extractSneakPositionTransitions(app, outcomes) {
  app._positionTransitions.clear();
  app._hasPositionData = false;

  for (const outcome of outcomes) {
    if (outcome.positionTransition) {
      app._positionTransitions.set(outcome.token.id, outcome.positionTransition);
      app._hasPositionData = true;
    }
  }
}

export function getSneakPositionTransitionForToken(app, token) {
  if (!token?.id) return null;

  if (app.isEndOfTurnDialog) {
    const outcome = app.outcomes?.find((candidate) => candidate.token?.id === token.id);
    if (outcome?.positionTransition) {
      return outcome.positionTransition;
    }
  }

  return app._positionTransitions.get(token.id) || null;
}

async function captureSneakEndPositionForOutcome(app, outcome) {
  try {
    const currentEndPosition = await app.positionTracker._capturePositionState(
      app.sneakingToken,
      outcome.token,
      Date.now(),
      { forceFresh: true, useCurrentPositionForCover: true },
    );
    if (!currentEndPosition) return;

    outcome.endCover = currentEndPosition.coverState;
    outcome.endVisibility = currentEndPosition.effectiveVisibility;
    outcome.liveEndVisibility = await calculateSneakLiveEndVisibility(app, outcome);

    if (!outcome.positionTransition) {
      outcome.positionTransition = buildSneakPositionTransition(app, outcome, currentEndPosition);
    }
  } catch {
    /* Per-outcome capture is best-effort */
  }
}

async function calculateSneakLiveEndVisibility(app, outcome) {
  try {
    return await optimizedVisibilityCalculator.calculateVisibilityWithoutOverrides(
      outcome.token,
      app.sneakingToken,
    );
  } catch {
    return undefined;
  }
}

function buildSneakPositionTransition(app, outcome, currentEndPosition) {
  const startState = app.startStates[outcome.token.id];
  const startVisibility = startState?.visibility || 'hidden';
  const startCover = startState?.cover || 'none';
  const visibilityChanged = startVisibility !== currentEndPosition.effectiveVisibility;

  return {
    hasChanged: visibilityChanged,
    transitionType: visibilityChanged ? 'improved' : 'unchanged',
    avsVisibilityChanged: visibilityChanged,
    coverStateChanged: startCover !== currentEndPosition.coverState,
    stealthBonusChange: 0,
    impactOnDC: 0,
    startPosition: {
      effectiveVisibility: startVisibility,
      coverState: startCover,
      stealthBonus: 0,
      distance: currentEndPosition.distance || 0,
      lightingConditions: currentEndPosition.lightingConditions || 'bright',
    },
    endPosition: {
      effectiveVisibility: currentEndPosition.effectiveVisibility,
      coverState: currentEndPosition.coverState,
      stealthBonus: 0,
      distance: currentEndPosition.distance || 0,
      lightingConditions: currentEndPosition.lightingConditions || 'bright',
    },
  };
}
