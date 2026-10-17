import { getTokenVerticalSpanFt } from '../../helpers/size-elevation-utils.js';
import { visibleFractionAcrossLedges } from './ledge-cover.js';
import { getSceneLedgeWalls } from './ledge-walls.js';

const HIDDEN_EPSILON = 1e-6;

export function ledgeBlocksSight({ observerSpan, targetSpan, p1, p2, walls }) {
  const visibleFraction = visibleFractionAcrossLedges({
    p1,
    p2,
    viewerSpan: observerSpan,
    targetSpan,
    walls,
  });
  return visibleFraction !== null && visibleFraction <= HIDDEN_EPSILON;
}

export function isTokenSightBlockedByLedge(observer, target, { origin = null } = {}) {
  try {
    const walls = getSceneLedgeWalls();
    if (!walls.length) return false;
    const from = origin ?? observer?.center;
    const to = target?.center;
    if (!from || !to) return false;
    return ledgeBlocksSight({
      observerSpan: getTokenVerticalSpanFt(observer),
      targetSpan: getTokenVerticalSpanFt(target),
      p1: { x: from.x, y: from.y },
      p2: { x: to.x, y: to.y },
      walls,
    });
  } catch {
    return false;
  }
}
