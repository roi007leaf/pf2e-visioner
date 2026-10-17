import { coverFromVisibleFraction, visibleFractionOverLedge } from './ledge-cover-math.js';
import { findLedgeCrossings } from './ledge-walls.js';

function resolveLedgeHeight(elevation, attackerSpan, targetSpan) {
  return elevation ?? Math.max(attackerSpan.bottom, targetSpan.bottom);
}

export function detectLedgeCover({ p1, p2, attackerSpan, targetSpan, walls, thresholds }) {
  if (!attackerSpan || !targetSpan) return 'none';
  const crossings = findLedgeCrossings(p1, p2, walls);
  if (!crossings.length) return 'none';
  const visibleFraction = Math.min(
    ...crossings.map(({ edgeT, elevation }) =>
      visibleFractionOverLedge({
        viewerSpan: attackerSpan,
        targetSpan,
        ledgeHeight: resolveLedgeHeight(elevation, attackerSpan, targetSpan),
        edgeT,
      }),
    ),
  );
  return coverFromVisibleFraction(visibleFraction, thresholds);
}
