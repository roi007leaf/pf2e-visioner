export function resolveTooltipSenseUsed({
  avsEnabled,
  precomputedSenseUsed,
  visibilityState,
  observerToken,
  targetToken,
  detectionTarget = null,
  getDetectionBetween,
  blockedVisibilityStates = new Set(),
}) {
  if (!avsEnabled) return null;
  if (precomputedSenseUsed !== undefined) return precomputedSenseUsed ?? null;
  if (blockedVisibilityStates.has(visibilityState)) return null;

  try {
    const actualTarget = detectionTarget || targetToken;
    return getDetectionBetween(observerToken, actualTarget)?.sense ?? null;
  } catch (_) {
    return null;
  }
}

export function getTooltipSuppressedSenses({
  observerToken,
  targetToken,
  detectionTarget = null,
  suppressionBehavior,
}) {
  try {
    const observerPos = observerToken.center;
    const actualTarget = detectionTarget || targetToken;
    const targetPos = actualTarget.center;
    const observerSenses = suppressionBehavior.getSuppressedSensesForObserver(observerPos);
    const targetSenses = suppressionBehavior.getSuppressedSensesForTarget(targetPos);
    const combined = new Set([...observerSenses, ...targetSenses]);
    return combined.size > 0 ? combined : null;
  } catch (_) {
    return null;
  }
}
