import { shouldSkipPendingMovementTokenVisibilityRefresh } from '../PendingMovement/pending-movement-render-lock.js';

export const SENSE_BADGE_BLOCKED_VISIBILITY_STATES = new Set(['undetected', 'unnoticed']);

export function normalizeTooltipVisibilityState(visibilityState) {
  return visibilityState === 'avs' ? 'observed' : visibilityState || 'observed';
}

function canRenderTooltipToken(token) {
  return shouldSkipPendingMovementTokenVisibilityRefresh(token) || token.isVisible;
}

export function getVisibleOtherTokens(allTokens = [], subjectToken = null) {
  return allTokens.filter(
    (token) => token && token !== subjectToken && canRenderTooltipToken(token),
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
  visibilityMap,
  getDetectionBetween = () => null,
} = {}) {
  const tokenId = targetToken?.document?.id ?? targetToken?.id;
  const visibilityState = normalizeTooltipVisibilityState(visibilityMap?.[tokenId]);
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
  visibilityMap,
  mode,
  detectionTarget = null,
  getDetectionBetween,
}) {
  const decision = buildTooltipVisibilityIndicatorDecision({
    observerToken,
    targetToken,
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

export function buildTargetTooltipVisibilityRequests({
  subjectToken,
  observerTokens = [],
  getVisibilityMap = () => ({}),
  getDetectionBetween = () => null,
} = {}) {
  if (!subjectToken) return [];

  return observerTokens
    .map((observerToken) => {
      const visibilityMap = getVisibilityMap(observerToken);
      return buildTooltipRequest({
        renderToken: observerToken,
        observerToken,
        targetToken: subjectToken,
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
  getDetectionBetween = () => null,
} = {}) {
  if (!subjectToken) return [];
  if (!isGM && !subjectToken.isOwner) return [];

  const otherTokens =
    mode === 'observer'
      ? allTokens.filter((token) => token && token !== subjectToken)
      : getVisibleOtherTokens(allTokens, subjectToken);
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
    getDetectionBetween,
  });
}

export function buildHoverTooltipVisibilityRequests({
  hoveredToken,
  allTokens = [],
  tooltipMode = 'target',
  isGM = false,
  getVisibilityMap = () => ({}),
  getDetectionBetween = () => null,
} = {}) {
  return buildTooltipVisibilityRequests({
    subjectToken: hoveredToken,
    allTokens,
    mode: tooltipMode === 'observer' ? 'observer' : 'target',
    isGM,
    getVisibilityMap,
    getDetectionBetween,
  });
}
