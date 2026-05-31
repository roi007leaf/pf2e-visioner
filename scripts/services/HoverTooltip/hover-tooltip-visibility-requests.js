import { shouldSkipPendingMovementTokenVisibilityRefresh } from '../PendingMovement/pending-movement-render-lock.js';

export const SENSE_BADGE_BLOCKED_VISIBILITY_STATES = new Set(['undetected', 'unnoticed']);

export function normalizeTooltipVisibilityState(visibilityState) {
  return visibilityState === 'avs' ? 'observed' : visibilityState || 'observed';
}

export function canRenderTooltipToken(token) {
  if (!token) return false;
  if (shouldSkipPendingMovementTokenVisibilityRefresh(token)) return true;

  const detectionFilterMesh = token.detectionFilterMesh;
  if (
    detectionFilterMesh &&
    detectionFilterMesh.visible !== false &&
    detectionFilterMesh.renderable !== false &&
    detectionFilterMesh.alpha !== 0
  ) {
    return true;
  }

  if (token.visible === false || token.renderable === false) return false;
  const mesh = token.mesh;
  if (mesh && (mesh.visible === false || mesh.renderable === false || mesh.alpha === 0)) {
    return false;
  }
  return true;
}

export function getVisibleOtherTokens(allTokens = [], subjectToken = null) {
  return allTokens.filter(
    (token) => token && token !== subjectToken && canRenderTooltipToken(token),
  );
}

function collectionToArray(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection.contents)) return collection.contents;
  if (typeof collection.values === 'function') return Array.from(collection.values());
  try {
    return Array.from(collection);
  } catch {
    return [];
  }
}

function getTokenId(token) {
  return token?.document?.id ?? token?.id ?? token?.tokenId ?? token?.object?.id ?? null;
}

function getCombatantTokenIds(combat = globalThis.game?.combat) {
  return new Set(
    collectionToArray(combat?.combatants ?? combat?.turns)
      .map((combatant) => combatant?.tokenId ?? combatant?.token?.id ?? combatant?.token?.object?.id)
      .filter(Boolean),
  );
}

function hasActiveTooltipEncounter(combat = globalThis.game?.combat) {
  return getCombatantTokenIds(combat).size > 0;
}

export function isTooltipTokenInEncounter(token, combat = globalThis.game?.combat) {
  const tokenId = getTokenId(token);
  if (!tokenId) return false;

  const combatantTokenIds = getCombatantTokenIds(combat);
  if (combatantTokenIds.has(tokenId)) return true;

  const encounterMasterTokenId = token?.document?.getFlag?.('pf2e-visioner', 'encounterMasterTokenId');
  return !!(encounterMasterTokenId && combatantTokenIds.has(encounterMasterTokenId));
}

export function getTooltipCandidateTokens(
  allTokens = [],
  subjectToken = null,
  { combat = globalThis.game?.combat } = {},
) {
  if (!subjectToken || !hasActiveTooltipEncounter(combat)) return allTokens;
  if (!isTooltipTokenInEncounter(subjectToken, combat)) return allTokens;

  return allTokens.filter(
    (token) => token === subjectToken || isTooltipTokenInEncounter(token, combat),
  );
}

export function getTooltipSenseUsed(
  observerToken,
  targetToken,
  visibilityState,
  getDetectionBetween = () => null,
) {
  if (SENSE_BADGE_BLOCKED_VISIBILITY_STATES.has(visibilityState)) return null;

  try {
    return getDetectionBetween(observerToken, targetToken)?.sense ?? null;
  } catch {
    return null;
  }
}

export function buildTooltipVisibilityIndicatorDecision({
  observerToken,
  targetToken,
  visibilityState: precomputedVisibilityState,
  visibilityMap,
  getDetectionBetween = () => null,
} = {}) {
  const tokenId = targetToken?.document?.id ?? targetToken?.id;
  const visibilityState =
    precomputedVisibilityState === undefined
      ? normalizeTooltipVisibilityState(visibilityMap?.[tokenId])
      : normalizeTooltipVisibilityState(precomputedVisibilityState);
  const senseUsed = getTooltipSenseUsed(
    observerToken,
    targetToken,
    visibilityState,
    getDetectionBetween,
  );

  return {
    visibilityState,
    senseUsed,
    shouldShowIndicator: visibilityState !== 'observed' || !!senseUsed,
  };
}

function buildTooltipRequest({
  renderToken,
  observerToken,
  targetToken,
  visibilityState,
  visibilityMap,
  mode,
  detectionTarget = null,
  getDetectionBetween,
}) {
  const decision = buildTooltipVisibilityIndicatorDecision({
    observerToken,
    targetToken,
    visibilityState,
    visibilityMap,
    getDetectionBetween,
  });
  if (!decision.shouldShowIndicator) return null;

  return {
    renderToken,
    observerToken,
    visibilityState: decision.visibilityState,
    mode,
    detectionTarget,
    senseUsed: decision.senseUsed,
  };
}

export function buildObserverTooltipVisibilityRequests({
  observerToken,
  targetTokens = [],
  getVisibilityMap = () => ({}),
  getDetectionBetween = () => null,
} = {}) {
  if (!observerToken) return [];

  const visibilityMap = getVisibilityMap(observerToken);
  return targetTokens
    .map((targetToken) => {
      const canRenderToken = canRenderTooltipToken(targetToken);
      const request = buildTooltipRequest({
        renderToken: targetToken,
        observerToken,
        targetToken,
        visibilityMap,
        mode: 'observer',
        getDetectionBetween,
      });

      if (!request) return null;
      return canRenderToken || request.senseUsed ? request : null;
    })
    .filter(Boolean);
}

function readPairVisibilityState(observerToken, targetToken, getVisibilityState) {
  if (typeof getVisibilityState !== 'function') return undefined;
  try {
    return getVisibilityState(observerToken, targetToken);
  } catch {
    return undefined;
  }
}

export function buildTargetTooltipVisibilityRequests({
  subjectToken,
  observerTokens = [],
  getVisibilityMap = () => ({}),
  getVisibilityState = null,
  getDetectionBetween = () => null,
} = {}) {
  if (!subjectToken) return [];

  return observerTokens
    .map((observerToken) => {
      const visibilityState = readPairVisibilityState(
        observerToken,
        subjectToken,
        getVisibilityState,
      );
      const visibilityMap =
        visibilityState === undefined ? getVisibilityMap(observerToken) : undefined;
      return buildTooltipRequest({
        renderToken: observerToken,
        observerToken,
        targetToken: subjectToken,
        visibilityState,
        visibilityMap,
        mode: 'target',
        detectionTarget: subjectToken,
        getDetectionBetween,
      });
    })
    .filter(Boolean);
}

export function buildTooltipVisibilityRequests({
  subjectToken,
  allTokens = [],
  mode = 'target',
  isGM = false,
  getVisibilityMap = () => ({}),
  getVisibilityState = null,
  getDetectionBetween = () => null,
  combat = globalThis.game?.combat,
} = {}) {
  if (!subjectToken) return [];
  if (!isGM && !subjectToken.isOwner) return [];

  const candidateTokens = getTooltipCandidateTokens(allTokens, subjectToken, { combat });
  const otherTokens =
    mode === 'observer'
      ? candidateTokens.filter((token) => token && token !== subjectToken)
      : getVisibleOtherTokens(candidateTokens, subjectToken);
  if (otherTokens.length === 0) return [];

  if (mode === 'observer') {
    return buildObserverTooltipVisibilityRequests({
      observerToken: subjectToken,
      targetTokens: otherTokens,
      getVisibilityMap,
      getDetectionBetween,
    });
  }

  return buildTargetTooltipVisibilityRequests({
    subjectToken,
    observerTokens: otherTokens,
    getVisibilityMap,
    getVisibilityState,
    getDetectionBetween,
  });
}

export function buildHoverTooltipVisibilityRequests({
  hoveredToken,
  allTokens = [],
  tooltipMode = 'target',
  isGM = false,
  getVisibilityMap = () => ({}),
  getVisibilityState = null,
  getDetectionBetween = () => null,
} = {}) {
  return buildTooltipVisibilityRequests({
    subjectToken: hoveredToken,
    allTokens,
    mode: tooltipMode === 'observer' ? 'observer' : 'target',
    isGM,
    getVisibilityMap,
    getVisibilityState,
    getDetectionBetween,
  });
}
