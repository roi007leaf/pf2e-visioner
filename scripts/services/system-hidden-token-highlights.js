function hasPositionChange(changes) {
  return !!changes && ('x' in changes || 'y' in changes);
}

function getDefaultControlledTokens() {
  return globalThis.canvas?.tokens?.controlled || [];
}

const SYSTEM_HIDDEN_EXCLUDED_ACTOR_TYPES = new Set(['hazard', 'loot', 'vehicle']);

async function loadDefaultVisualEffects() {
  return import('./visual-effects.js');
}

export function getMatchingControlledTokenForRefresh(token, controlledTokens) {
  const tokenId = token?.document?.id;
  if (!tokenId) return null;
  return (
    controlledTokens?.find?.((controlledToken) => controlledToken?.document?.id === tokenId) ?? null
  );
}

export function resolveSystemHiddenObserver({
  observerId = null,
  allowControlledFallback = true,
  tokensLayer = globalThis.canvas?.tokens,
} = {}) {
  let observer = null;
  try {
    if (observerId) observer = tokensLayer?.get?.(observerId) || null;
    if (!observer && allowControlledFallback) observer = tokensLayer?.controlled?.[0] || null;
  } catch (_) {
    observer = null;
  }
  return observer;
}

export function buildMovedTokenHighlightRequests(tokenDoc, changes, controlledTokens) {
  if (!hasPositionChange(changes)) return [];
  if ((controlledTokens?.length ?? 0) === 0) return [];

  const movedTokenId = tokenDoc?.id;
  const targetPosition = {
    x: changes.x ?? tokenDoc?.x,
    y: changes.y ?? tokenDoc?.y,
  };

  return controlledTokens
    .map((controlledToken) => {
      const tokenId = controlledToken?.document?.id;
      if (!tokenId) return null;
      return {
        tokenId,
        positionOverride: tokenId === movedTokenId ? targetPosition : null,
      };
    })
    .filter(Boolean);
}

export function buildControlledTokenHighlightRequests(controlledTokens) {
  return (controlledTokens || [])
    .map((controlledToken) => controlledToken?.document?.id)
    .filter(Boolean);
}

export function getSystemHiddenSenseContext(observer) {
  const observerSenses = observer?.actor?.system?.perception?.senses || [];
  const lifesenseSense = observerSenses.find?.((sense) => sense.type === 'lifesense') ?? null;
  const thoughtsenseSense = observerSenses.find?.((sense) => sense.type === 'thoughtsense') ?? null;
  const observerIsBlinded = observer?.actor?.hasCondition?.('blinded') ?? false;
  const observerIsDeafened = observer?.actor?.hasCondition?.('deafened') ?? false;

  return {
    lifesenseSense,
    thoughtsenseSense,
    observerHasLifesense: !!lifesenseSense,
    lifesenseIsPrecise: lifesenseSense?.acuity === 'precise',
    observerHasThoughtsense: !!thoughtsenseSense,
    observerIsBlindAndDeaf: observerIsBlinded && observerIsDeafened,
  };
}

export function shouldEvaluateSystemHiddenIndicators(senseContext) {
  return (
    !!senseContext?.observerHasLifesense ||
    !!senseContext?.observerHasThoughtsense ||
    !!senseContext?.observerIsBlindAndDeaf
  );
}

export function isSystemHiddenIndicatorCandidate(token, observer) {
  if (!token || token.id === observer?.id) return false;
  if (!token.actor) return false;
  return !SYSTEM_HIDDEN_EXCLUDED_ACTOR_TYPES.has(token.actor.type);
}

export function getSystemHiddenIndicatorCandidates(tokens, observer) {
  return (tokens || []).filter((token) => isSystemHiddenIndicatorCandidate(token, observer));
}

export function getSystemHiddenTokenDistance(
  observer,
  token,
  positionOverride = null,
  grid = null,
) {
  if (observer?.distanceTo && typeof observer.distanceTo === 'function') {
    return observer.distanceTo(token);
  }

  const activeGrid = grid ?? globalThis.canvas?.grid;
  const gridSize = activeGrid?.size || 1;
  const observerDoc = observer?.document ?? {};
  const tokenDoc = token?.document ?? {};
  const observerDocX = positionOverride?.x ?? observerDoc.x ?? 0;
  const observerDocY = positionOverride?.y ?? observerDoc.y ?? 0;
  const observerCenterX = observerDocX + ((observerDoc.width ?? 1) * gridSize) / 2;
  const observerCenterY = observerDocY + ((observerDoc.height ?? 1) * gridSize) / 2;
  const targetCenterX = (tokenDoc.x ?? 0) + ((tokenDoc.width ?? 1) * gridSize) / 2;
  const targetCenterY = (tokenDoc.y ?? 0) + ((tokenDoc.height ?? 1) * gridSize) / 2;

  const path = activeGrid?.measurePath?.([
    { x: observerCenterX, y: observerCenterY },
    { x: targetCenterX, y: targetCenterY },
  ]);
  const feetPerGrid = activeGrid?.distance || 5;
  return (Number(path?.distance) || 0) * feetPerGrid;
}

export function buildSystemHiddenIndicatorDecision({
  observer,
  token,
  positionOverride = null,
  senseContext = getSystemHiddenSenseContext(observer),
  grid = null,
  getVisibilityState = null,
  canLifesenseDetect = () => false,
  canThoughtsenseDetect = () => false,
} = {}) {
  const isSystemHidden = !token?.visible || token?.renderable === false;
  const targetTraits = token?.actor?.system?.traits?.value || [];
  const distanceInFeet = getSystemHiddenTokenDistance(observer, token, positionOverride, grid);
  const lifesenseRange = senseContext?.lifesenseSense?.range ?? 0;
  const thoughtsenseRange = senseContext?.thoughtsenseSense?.range ?? 0;
  const canBeDetectedByLifesense = canLifesenseDetect({ traits: targetTraits });
  const canBeDetectedByThoughtsense = canThoughtsenseDetect({ traits: targetTraits });
  const isWithinLifesenseRange = lifesenseRange === Infinity || distanceInFeet <= lifesenseRange;
  const isWithinThoughtsenseRange =
    thoughtsenseRange === Infinity || distanceInFeet <= thoughtsenseRange;
  const visibilityState = senseContext?.observerIsBlindAndDeaf
    ? getVisibilityState?.(observer, token)
    : null;
  const isHiddenFromObserver = visibilityState === 'hidden';

  const shouldShowLifesenseIndicator =
    isSystemHidden && canBeDetectedByLifesense && isWithinLifesenseRange;
  const shouldShowThoughtsenseIndicator =
    isSystemHidden && canBeDetectedByThoughtsense && isWithinThoughtsenseRange;
  const shouldShowBlindDeafIndicator =
    !!senseContext?.observerIsBlindAndDeaf && isHiddenFromObserver;
  const shouldShowIndicator =
    shouldShowLifesenseIndicator || shouldShowThoughtsenseIndicator || shouldShowBlindDeafIndicator;
  const indicatorMode = shouldShowBlindDeafIndicator
    ? 'blind-deaf'
    : shouldShowThoughtsenseIndicator
      ? 'thoughtsense'
      : 'lifesense';

  return {
    shouldShowIndicator,
    indicatorMode,
    shouldShowLifesenseIndicator,
    shouldShowThoughtsenseIndicator,
    shouldShowBlindDeafIndicator,
    distanceInFeet,
  };
}

export async function refreshSystemHiddenHighlightsForMovedToken(
  tokenDoc,
  changes,
  {
    getControlledTokens = getDefaultControlledTokens,
    loadVisualEffects = loadDefaultVisualEffects,
  } = {},
) {
  const requests = buildMovedTokenHighlightRequests(tokenDoc, changes, getControlledTokens());
  if (requests.length === 0) {
    return { refreshed: 0 };
  }

  const { updateSystemHiddenTokenHighlights } = await loadVisualEffects();
  for (const request of requests) {
    await updateSystemHiddenTokenHighlights(request.tokenId, request.positionOverride);
  }

  return { refreshed: requests.length };
}

export async function refreshSystemHiddenHighlightsForControlledTokens(
  {
    getControlledTokens = getDefaultControlledTokens,
    loadVisualEffects = loadDefaultVisualEffects,
  } = {},
) {
  const requests = buildControlledTokenHighlightRequests(getControlledTokens());
  if (requests.length === 0) {
    return { refreshed: 0 };
  }

  const { updateSystemHiddenTokenHighlights } = await loadVisualEffects();
  for (const tokenId of requests) {
    await updateSystemHiddenTokenHighlights(tokenId);
  }

  return { refreshed: requests.length };
}

export async function refreshSystemHiddenHighlightsForRenderedToken(
  token,
  {
    getControlledTokens = getDefaultControlledTokens,
    loadVisualEffects = loadDefaultVisualEffects,
  } = {},
) {
  const controlledToken = getMatchingControlledTokenForRefresh(token, getControlledTokens());
  if (!controlledToken) {
    return { refreshed: false };
  }

  const { updateSystemHiddenTokenHighlights } = await loadVisualEffects();
  await updateSystemHiddenTokenHighlights(controlledToken.document.id);
  return { refreshed: true };
}
