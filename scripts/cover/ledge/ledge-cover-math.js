const EDGE_EPSILON = 1e-6;

function visibilityThreshold(eyeHeight, ledgeHeight, edgeT) {
  if (edgeT <= EDGE_EPSILON) return eyeHeight >= ledgeHeight ? -Infinity : Infinity;
  return eyeHeight + (ledgeHeight - eyeHeight) / edgeT;
}

function fractionAbove(threshold, span) {
  const height = span.top - span.bottom;
  if (height <= 0) return threshold <= span.bottom ? 1 : 0;
  return Math.max(0, Math.min(1, (span.top - threshold) / height));
}

export function visibleFractionOverLedge({ viewerSpan, targetSpan, ledgeHeight, edgeT }) {
  const eyes = [viewerSpan.bottom, viewerSpan.top];
  return Math.max(
    ...eyes.map((eye) => fractionAbove(visibilityThreshold(eye, ledgeHeight, edgeT), targetSpan)),
  );
}

export function coverFromVisibleFraction(
  fraction,
  { standardThreshold = 50, greaterThreshold = 70, allowGreater = true } = {},
) {
  const blockedPercent = (1 - fraction) * 100;
  if (allowGreater && blockedPercent >= greaterThreshold) return 'greater';
  if (blockedPercent >= standardThreshold) return 'standard';
  return 'none';
}
