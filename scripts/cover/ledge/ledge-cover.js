import { coverFromVisibleFraction, visibleFractionOverLedge } from './ledge-cover-math.js';
import { findLedgeCrossings } from './ledge-walls.js';

function resolveLedgeHeight(elevation, attackerSpan, targetSpan) {
  return elevation ?? Math.max(attackerSpan.bottom, targetSpan.bottom);
}

export function visibleFractionAcrossLedges({ p1, p2, viewerSpan, targetSpan, walls }) {
  if (!viewerSpan || !targetSpan) return null;
  const crossings = findLedgeCrossings(p1, p2, walls);
  if (!crossings.length) return null;
  return Math.min(
    ...crossings.map(({ edgeT, elevation }) =>
      visibleFractionOverLedge({
        viewerSpan,
        targetSpan,
        ledgeHeight: resolveLedgeHeight(elevation, viewerSpan, targetSpan),
        edgeT,
      }),
    ),
  );
}

export function detectLedgeCover({ p1, p2, attackerSpan, targetSpan, walls, thresholds }) {
  const visibleFraction = visibleFractionAcrossLedges({
    p1,
    p2,
    viewerSpan: attackerSpan,
    targetSpan,
    walls,
  });
  if (visibleFraction === null) return 'none';
  return coverFromVisibleFraction(visibleFraction, thresholds);
}
