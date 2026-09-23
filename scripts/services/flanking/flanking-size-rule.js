import { MODULE_ID } from '../../constants.js';

export const FLANKING_SIZE_RULES = Object.freeze({
  raw: 'raw',
  anySquare: 'anySquare',
  anyCorner: 'anyCorner',
  oppositeArcs: 'oppositeArcs',
  lineThrough: 'lineThrough',
});

function orient(a, b, c) {
  return (a.y - c.y) * (b.x - c.x) - (a.x - c.x) * (b.y - c.y);
}

function segmentsIntersect(a, b, c, d) {
  const xa = orient(a, b, c);
  const xb = orient(a, b, d);
  if (xa === 0 && xb === 0) return false;
  const xab = xa * xb <= 0;
  const xcd = orient(c, d, a) * orient(c, d, b) <= 0;
  return xab && xcd;
}

function rectEdges(bounds) {
  const { left, top, right, bottom } = bounds;
  return {
    leftEdge: [{ x: left, y: top }, { x: left, y: bottom }],
    rightEdge: [{ x: right, y: top }, { x: right, y: bottom }],
    topEdge: [{ x: left, y: top }, { x: right, y: top }],
    bottomEdge: [{ x: left, y: bottom }, { x: right, y: bottom }],
  };
}

function centerOf(bounds) {
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

function pointInRect(p, bounds) {
  return p.x >= bounds.left && p.x <= bounds.right && p.y >= bounds.top && p.y <= bounds.bottom;
}

export function pointsOnOppositeSides(a, b, targetBounds) {
  const { leftEdge, rightEdge, topEdge, bottomEdge } = rectEdges(targetBounds);
  const hits = (edge) => segmentsIntersect(a, b, edge[0], edge[1]);
  return (hits(leftEdge) && hits(rightEdge)) || (hits(topEdge) && hits(bottomEdge));
}

export function splitBoundsIntoSquareCenters(bounds, gridSize) {
  const cols = Math.floor(bounds.width / gridSize);
  const rows = Math.floor(bounds.height / gridSize);
  const centers = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      centers.push({
        x: bounds.x + (c + 0.5) * gridSize,
        y: bounds.y + (r + 0.5) * gridSize,
      });
    }
  }
  return centers;
}

function squaredDistance(a, b) {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

function findPointPair(fromPoints, toPoints, accept) {
  let best = null;
  let bestDistance = Infinity;
  for (const from of fromPoints) {
    for (const to of toPoints) {
      if (!accept(from, to)) continue;
      const distance = squaredDistance(from, to);
      if (distance >= bestDistance) continue;
      best = { from, to };
      bestDistance = distance;
    }
  }
  return best;
}

function anyPointPair(fromPoints, toPoints, accept) {
  return fromPoints.some((from) => toPoints.some((to) => accept(from, to)));
}

function squarePairAccept(targetBounds) {
  return (from, to) => pointsOnOppositeSides(from, to, targetBounds);
}

function cornerPairAccept(targetBounds) {
  return (from, to) =>
    !segmentLiesOnEdge(from, to, targetBounds) && pointsOnOppositeSides(from, to, targetBounds);
}

function findSquarePair(flankerBounds, allyBounds, targetBounds, gridSize) {
  return findPointPair(
    splitBoundsIntoSquareCenters(flankerBounds, gridSize),
    splitBoundsIntoSquareCenters(allyBounds, gridSize),
    squarePairAccept(targetBounds),
  );
}

export function anySquarePairOnOppositeSides(flankerBounds, allyBounds, targetBounds, gridSize) {
  return anyPointPair(
    splitBoundsIntoSquareCenters(flankerBounds, gridSize),
    splitBoundsIntoSquareCenters(allyBounds, gridSize),
    squarePairAccept(targetBounds),
  );
}

export function boundsCorners(bounds) {
  const { left, top, right, bottom } = bounds;
  return [
    { x: left, y: top },
    { x: right, y: top },
    { x: left, y: bottom },
    { x: right, y: bottom },
  ];
}

export function segmentLiesOnEdge(a, b, bounds) {
  const horizontal = a.y === b.y && (a.y === bounds.top || a.y === bounds.bottom);
  const vertical = a.x === b.x && (a.x === bounds.left || a.x === bounds.right);
  return horizontal || vertical;
}

function findCornerPair(flankerBounds, allyBounds, targetBounds) {
  return findPointPair(
    boundsCorners(flankerBounds),
    boundsCorners(allyBounds),
    cornerPairAccept(targetBounds),
  );
}

export function anyCornerPairOnOppositeSides(flankerBounds, allyBounds, targetBounds) {
  return anyPointPair(
    boundsCorners(flankerBounds),
    boundsCorners(allyBounds),
    cornerPairAccept(targetBounds),
  );
}

const TWO_PI = Math.PI * 2;

function normalizeAngle(angle) {
  const wrapped = angle % TWO_PI;
  return wrapped < 0 ? wrapped + TWO_PI : wrapped;
}

export function angularSpanFrom(origin, bounds) {
  const base = Math.atan2(centerOf(bounds).y - origin.y, centerOf(bounds).x - origin.x);
  let min = 0;
  let max = 0;
  for (const corner of boundsCorners(bounds)) {
    const offset = normalizeAngle(Math.atan2(corner.y - origin.y, corner.x - origin.x) - base + Math.PI) - Math.PI;
    if (offset < min) min = offset;
    if (offset > max) max = offset;
  }
  return { start: base + min, end: base + max };
}

function spansOverlap(a, b) {
  const widthA = a.end - a.start;
  const widthB = b.end - b.start;
  return normalizeAngle(b.start - a.start) <= widthA || normalizeAngle(a.start - b.start) <= widthB;
}

export function oppositeArcsFlank(flankerBounds, allyBounds, targetBounds) {
  const origin = centerOf(targetBounds);
  const flankerSpan = angularSpanFrom(origin, flankerBounds);
  const allySpan = angularSpanFrom(origin, allyBounds);
  return spansOverlap(flankerSpan, {
    start: allySpan.start + Math.PI,
    end: allySpan.end + Math.PI,
  });
}

export function lineThroughTarget(flankerBounds, allyBounds, targetBounds) {
  const a = centerOf(flankerBounds);
  const b = centerOf(allyBounds);
  if (pointInRect(a, targetBounds) || pointInRect(b, targetBounds)) return true;
  return Object.values(rectEdges(targetBounds)).some((edge) =>
    segmentsIntersect(a, b, edge[0], edge[1]),
  );
}

export function findFlankingPair(flankerBounds, allyBounds, targetBounds, gridSize, rule) {
  if (rule === FLANKING_SIZE_RULES.anySquare) {
    return findSquarePair(flankerBounds, allyBounds, targetBounds, gridSize);
  }
  if (rule === FLANKING_SIZE_RULES.anyCorner) {
    return findCornerPair(flankerBounds, allyBounds, targetBounds);
  }
  if (rule === FLANKING_SIZE_RULES.oppositeArcs) {
    return oppositeArcsFlank(flankerBounds, allyBounds, targetBounds)
      ? { from: centerOf(flankerBounds), to: centerOf(allyBounds) }
      : null;
  }
  if (rule === FLANKING_SIZE_RULES.lineThrough && lineThroughTarget(flankerBounds, allyBounds, targetBounds)) {
    return { from: centerOf(flankerBounds), to: centerOf(allyBounds) };
  }
  return null;
}

export function readFlankingSizeRule() {
  return readRule();
}

function readRule() {
  try {
    return game.settings.get(MODULE_ID, 'flankingSizeRule') ?? FLANKING_SIZE_RULES.raw;
  } catch {
    return FLANKING_SIZE_RULES.raw;
  }
}

function boundsSmallerThanSquare(bounds, gridSize) {
  return bounds.width < gridSize || bounds.height < gridSize;
}

function canApplyRule(rule, flankerBounds, allyBounds, targetBounds, gridSize) {
  if (!flankerBounds || !allyBounds || !targetBounds) return false;
  if (rule === FLANKING_SIZE_RULES.oppositeArcs) return true;
  if (!gridSize || canvas?.grid?.isGridless) return false;
  return !boundsSmallerThanSquare(flankerBounds, gridSize) && !boundsSmallerThanSquare(allyBounds, gridSize);
}

export function wrapOnOppositeSides(wrapped, flanker, ally, target) {
  const rule = readRule();
  if (rule === FLANKING_SIZE_RULES.raw) return wrapped(flanker, ally, target);
  const gridSize = canvas?.grid?.size;
  const flankerBounds = flanker?.mechanicalBounds;
  const allyBounds = ally?.mechanicalBounds;
  const targetBounds = target?.mechanicalBounds;
  if (!canApplyRule(rule, flankerBounds, allyBounds, targetBounds, gridSize)) {
    return wrapped(flanker, ally, target);
  }
  if (rule === FLANKING_SIZE_RULES.oppositeArcs) {
    return oppositeArcsFlank(flankerBounds, allyBounds, targetBounds);
  }
  if (rule === FLANKING_SIZE_RULES.lineThrough) {
    return lineThroughTarget(flankerBounds, allyBounds, targetBounds);
  }
  if (rule === FLANKING_SIZE_RULES.anyCorner) {
    return anyCornerPairOnOppositeSides(flankerBounds, allyBounds, targetBounds);
  }
  return anySquarePairOnOppositeSides(flankerBounds, allyBounds, targetBounds, gridSize);
}

export function registerFlankingSizeRuleWrapper(libWrapperAdapter = globalThis.libWrapper) {
  if (typeof libWrapperAdapter?.register !== 'function') return false;
  const proto = CONFIG?.Token?.objectClass?.prototype;
  if (typeof proto?.onOppositeSides !== 'function') return false;
  libWrapperAdapter.register(
    MODULE_ID,
    'CONFIG.Token.objectClass.prototype.onOppositeSides',
    wrapOnOppositeSides,
    'MIXED',
  );
  return true;
}
