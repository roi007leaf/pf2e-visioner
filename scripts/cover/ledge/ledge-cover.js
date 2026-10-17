import { coverFromVisibleFraction, visibleFractionOverLedge } from './ledge-cover-math.js';
import { findLedgeCrossings } from './ledge-walls.js';

export function visibleFractionAcrossLedges({ p1, p2, viewerSpan, targetSpan, walls }) {
  if (!viewerSpan || !targetSpan) return null;
  const crossings = findLedgeCrossings(p1, p2, walls).filter(({ elevation }) => elevation !== null);
  if (!crossings.length) return null;
  return Math.min(
    ...crossings.map(({ edgeT, elevation }) =>
      visibleFractionOverLedge({ viewerSpan, targetSpan, ledgeHeight: elevation, edgeT }),
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
