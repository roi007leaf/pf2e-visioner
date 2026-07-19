export const SENSE_BADGE_BLOCKED_VISIBILITY_STATES = new Set(['undetected', 'unnoticed']);

export function normalizeTooltipVisibilityState(visibilityState) {
  return visibilityState === 'avs' ? 'observed' : visibilityState || 'observed';
}

export function canRenderTooltipToken(token) {
  if (!token) return false;

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

export function getCoverOverlayTargets({
  sourceToken,
  allTokens = [],
  isGM = false,
  getVisibilityState = () => null,
} = {}) {
  return getVisibleOtherTokens(allTokens, sourceToken).filter((target) => {
    if (isGM) return true;
    // Foundry's own render state (canRenderTooltipToken) doesn't know about AVS-computed
    // undetected/unnoticed targets - without this, cover badges leak positions of enemies
    // the player hasn't actually detected (unrestricted vision scenes, already-explored fog).
    return !SENSE_BADGE_BLOCKED_VISIBILITY_STATES.has(getVisibilityState(sourceToken, target));
  });
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
  isGM = false,
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
      if (!isGM && SENSE_BADGE_BLOCKED_VISIBILITY_STATES.has(request.visibilityState)) return null;
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
  isGM = false,
  getVisibilityMap = () => ({}),
  getVisibilityState = null,
  getDetectionBetween = () => null,
} = {}) {
  if (!subjectToken) return [];

  return observerTokens
    .map((observerToken) => {
      if (!isGM) {
        const observerVisibilityState = readPairVisibilityState(
          subjectToken,
          observerToken,
          getVisibilityState,
        );
        if (SENSE_BADGE_BLOCKED_VISIBILITY_STATES.has(observerVisibilityState)) return null;
      }
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
      isGM,
      getVisibilityMap,
      getDetectionBetween,
    });
  }

  return buildTargetTooltipVisibilityRequests({
    subjectToken,
    observerTokens: otherTokens,
    isGM,
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
