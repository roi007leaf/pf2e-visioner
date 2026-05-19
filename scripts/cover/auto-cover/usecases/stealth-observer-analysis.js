import { getCoverBetween } from '../../../utils.js';

export const STEALTH_COVER_PRECEDENCE = {
  none: 0,
  lesser: 1,
  standard: 2,
  greater: 4,
};

export function isHostileToHider(token, hider) {
  const hiderAlliance = hider?.actor?.alliance;
  const tokenAlliance = token?.actor?.alliance;
  if (!hiderAlliance || !tokenAlliance) return false;
  if (tokenAlliance === 'neutral') return false;
  return tokenAlliance !== hiderAlliance;
}

function isNonPartyObserver(token) {
  const alliance = token?.actor?.alliance;
  return alliance !== 'party' && alliance !== 'neutral';
}

function shouldIncludeObserver(token, hider, mode) {
  if (!token?.actor || token.id === hider?.id) return false;
  if (mode === 'all-actors') return true;
  if (mode === 'non-party') return isNonPartyObserver(token);
  return isHostileToHider(token, hider);
}

export function collectStealthObservers(hider, { mode = 'hostile-relative' } = {}) {
  const tokens = canvas?.tokens?.placeables || [];
  const observers = [];

  for (const token of tokens) {
    if (shouldIncludeObserver(token, hider, mode)) observers.push(token);
  }

  return observers;
}

export function higherStealthCoverState(currentState, candidateState) {
  return STEALTH_COVER_PRECEDENCE[currentState] < STEALTH_COVER_PRECEDENCE[candidateState]
    ? candidateState
    : currentState;
}

export function analyzeStealthObserverCover({
  hider,
  observerMode = 'hostile-relative',
  observers = collectStealthObservers(hider, { mode: observerMode }),
  detectCover,
  manualCoverBetween = getCoverBetween,
} = {}) {
  let target = null;
  let detectedState = 'none';
  let highestFoundManualCover = 'none';

  for (const observer of observers) {
    let state = null;

    try {
      const manualCover = manualCoverBetween(observer, hider);
      if (manualCover && manualCover !== 'none') {
        state = manualCover;
        highestFoundManualCover = higherStealthCoverState(highestFoundManualCover, manualCover);
      }
    } catch (_) {}

    if (!state) {
      try {
        state = detectCover?.(observer, hider) || null;
      } catch (_) {}
    }

    if (state && state !== 'none') {
      target = observer;
      detectedState = higherStealthCoverState(detectedState, state);
    }
  }

  return {
    observers,
    target,
    detectedState,
    highestFoundManualCover,
  };
}
