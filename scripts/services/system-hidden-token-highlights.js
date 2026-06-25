function hasPositionChange(changes) {
  return !!changes && ('x' in changes || 'y' in changes);
}

function getDefaultControlledTokens() {
  return globalThis.canvas?.tokens?.controlled || [];
}

const SYSTEM_HIDDEN_EXCLUDED_ACTOR_TYPES = new Set(['hazard', 'loot', 'vehicle']);
const SYSTEM_HIDDEN_AUDITORY_PRECISE_SENSES = new Set(['echolocation']);

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
  const observerSenses = getObserverPerceptionSenses(observer);
  const lifesenseSense = observerSenses.find?.((sense) => sense.type === 'lifesense') ?? null;
  const thoughtsenseSense = observerSenses.find?.((sense) => sense.type === 'thoughtsense') ?? null;
  const echolocationSense = observerSenses.find?.((sense) => sense.type === 'echolocation') ?? null;
  const observerIsBlinded = observer?.actor?.hasCondition?.('blinded') ?? false;
  const observerIsDeafened = observer?.actor?.hasCondition?.('deafened') ?? false;

  return {
    lifesenseSense,
    thoughtsenseSense,
    echolocationSense,
    observerHasLifesense: !!lifesenseSense,
    lifesenseIsPrecise: lifesenseSense?.acuity === 'precise',
    observerHasThoughtsense: !!thoughtsenseSense,
    observerHasEcholocation: !!echolocationSense,
    observerIsBlindAndDeaf: observerIsBlinded && observerIsDeafened,
    observerIsDeafened,
  };
}

export function shouldEvaluateSystemHiddenIndicators(senseContext) {
  return (
    !!senseContext?.observerHasLifesense ||
    !!senseContext?.observerHasThoughtsense ||
    !!senseContext?.observerHasEcholocation ||
    !!senseContext?.observerIsBlindAndDeaf
  );
}

function normalizeSenseCollection(senses) {
  if (!senses) return [];
  if (Array.isArray(senses)) return senses;
  if (Array.isArray(senses.contents)) return senses.contents;
  if (typeof senses.values === 'function') {
    try {
      return Array.from(senses.values());
    } catch (_) {}
  }
  if (typeof senses[Symbol.iterator] === 'function') {
    try {
      return Array.from(senses);
    } catch (_) {}
  }
  if (typeof senses === 'object') return Object.values(senses);
  return [];
}

function normalizeSenseEntry(sense) {
  if (!sense || typeof sense !== 'object') return null;
  const type = String(sense.type ?? sense.slug ?? sense.id ?? '').toLowerCase();
  if (!type) return null;
  return {
    ...sense,
    type,
  };
}

function getObserverPerceptionSenses(observer) {
  const actor = observer?.actor;
  return [
    ...normalizeSenseCollection(actor?.system?.perception?.senses),
    ...normalizeSenseCollection(actor?.perception?.senses),
  ]
    .map(normalizeSenseEntry)
    .filter(Boolean);
}

function getStoredDetection({ observer, token, getDetectionBetween }) {
  try {
    return getDetectionBetween?.(observer, token) ?? null;
  } catch (_) {
    return null;
  }
}

function getSoundBlocked({ observer, token, isSoundBlocked }) {
  try {
    return isSoundBlocked?.(observer, token) === true;
  } catch (_) {
    return false;
  }
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
  getDetectionBetween = null,
  isSoundBlocked = null,
  canLifesenseDetect = () => false,
  canThoughtsenseDetect = () => false,
} = {}) {
  const isSystemHidden = !token?.visible || token?.renderable === false;
  const targetTraits = token?.actor?.system?.traits?.value || [];
  const distanceInFeet = getSystemHiddenTokenDistance(observer, token, positionOverride, grid);
  const lifesenseRange = senseContext?.lifesenseSense?.range ?? 0;
  const thoughtsenseRange = senseContext?.thoughtsenseSense?.range ?? 0;
  const echolocationRange = senseContext?.echolocationSense?.range ?? 0;
  const detection = getStoredDetection({ observer, token, getDetectionBetween });
  const canBeDetectedByLifesense = canLifesenseDetect({ traits: targetTraits });
  const canBeDetectedByThoughtsense = canThoughtsenseDetect({ traits: targetTraits });
  const isWithinLifesenseRange = lifesenseRange === Infinity || distanceInFeet <= lifesenseRange;
  const isWithinThoughtsenseRange =
    thoughtsenseRange === Infinity || distanceInFeet <= thoughtsenseRange;
  const isWithinEcholocationRange =
    echolocationRange === Infinity || distanceInFeet <= echolocationRange;
  const visibilityState = senseContext?.observerIsBlindAndDeaf
    ? getVisibilityState?.(observer, token)
    : null;
  const isHiddenFromObserver = visibilityState === 'hidden';
  const detectedByEcholocation =
    SYSTEM_HIDDEN_AUDITORY_PRECISE_SENSES.has(detection?.sense) && detection?.isPrecise !== false;
  const echolocationSoundBlocked =
    detectedByEcholocation && getSoundBlocked({ observer, token, isSoundBlocked });

  const shouldShowLifesenseIndicator =
    isSystemHidden && canBeDetectedByLifesense && isWithinLifesenseRange;
  const shouldShowThoughtsenseIndicator =
    isSystemHidden && canBeDetectedByThoughtsense && isWithinThoughtsenseRange;
  const shouldShowEcholocationIndicator =
    isSystemHidden &&
    !!senseContext?.observerHasEcholocation &&
    !senseContext?.observerIsDeafened &&
    !echolocationSoundBlocked &&
    isWithinEcholocationRange &&
    detectedByEcholocation;
  const shouldShowBlindDeafIndicator =
    !!senseContext?.observerIsBlindAndDeaf && isHiddenFromObserver;
  const shouldShowIndicator =
    shouldShowLifesenseIndicator ||
    shouldShowThoughtsenseIndicator ||
    shouldShowEcholocationIndicator ||
    shouldShowBlindDeafIndicator;
  const indicatorMode = shouldShowBlindDeafIndicator
    ? 'blind-deaf'
    : shouldShowThoughtsenseIndicator
      ? 'thoughtsense'
      : shouldShowEcholocationIndicator
        ? 'echolocation'
        : 'lifesense';

  return {
    shouldShowIndicator,
    indicatorMode,
    shouldShowLifesenseIndicator,
    shouldShowThoughtsenseIndicator,
    shouldShowEcholocationIndicator,
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

export async function removeSystemHiddenIndicatorsForObservedTargets({
  getTokens = () => globalThis.canvas?.tokens?.placeables || [],
  getObserverById = (id) => globalThis.canvas?.tokens?.get?.(id) ?? null,
  getVisibilityState = null,
  loadVisualEffects = loadDefaultVisualEffects,
} = {}) {
  const candidates = (getTokens() || []).filter((token) => token?._pvSystemHiddenIndicator);
  if (candidates.length === 0) {
    return { removed: 0 };
  }

  const { removeSystemHiddenIndicator } = await loadVisualEffects();
  const resolveVisibility =
    getVisibilityState ?? (await import('../utils.js')).getVisibilityBetween;
  if (
    typeof resolveVisibility !== 'function' ||
    typeof removeSystemHiddenIndicator !== 'function'
  ) {
    return { removed: 0 };
  }

  let removed = 0;
  for (const token of candidates) {
    const observerId = token._pvSystemHiddenIndicator?._pvObserverId;
    const observer = observerId ? getObserverById(observerId) : null;
    if (!observer) continue;
    const state = resolveVisibility(observer, token);
    if (state === 'observed' || state === 'concealed') {
      removeSystemHiddenIndicator(token, { forceTokenVisible: true });
      removed += 1;
    }
  }
  return { removed };
}
