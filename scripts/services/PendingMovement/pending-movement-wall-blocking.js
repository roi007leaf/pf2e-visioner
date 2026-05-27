import { doesWallSenseBlockFromPoint, getWallSenseTypes } from '../../helpers/wall-sense-utils.js';
import { LevelsIntegration } from '../LevelsIntegration.js';

const pendingMovementWallRayCacheStack = [];

function activeWallRayCache() {
  return pendingMovementWallRayCacheStack[pendingMovementWallRayCacheStack.length - 1] ?? null;
}

function pointCacheKey(point) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const elevation = Number(point?.elevation ?? point?.z ?? 0);
  return `${x},${y},${Number.isFinite(elevation) ? elevation : 0}`;
}

function wallRayCacheKey(originPoint, targetPoint) {
  const originKey = pointCacheKey(originPoint);
  const targetKey = pointCacheKey(targetPoint);
  return originKey && targetKey ? `${originKey}>${targetKey}` : null;
}

function hasPointCollisionTokenContext(options = {}) {
  return !!(
    options.originToken ||
    options.targetToken ||
    options.originLevel ||
    options.targetLevel ||
    options.level
  );
}

function coreLevelsLineBlockDecision(originPoint, targetPoint, senseType, options = {}) {
  if (!originPoint || !targetPoint || !hasPointCollisionTokenContext(options)) return null;

  try {
    const levelsIntegration = LevelsIntegration.getInstance();
    if (!levelsIntegration.isCoreActive) return null;

    const details = levelsIntegration.get3DPointCollisionDetails?.(
      originPoint,
      targetPoint,
      senseType,
      {
        originToken: options.originToken,
        targetToken: options.targetToken,
        originLevel: options.originLevel,
        targetLevel: options.targetLevel,
        level: options.level,
      },
    );
    if (!details || details.mode !== 'core') return null;
    if (details.reason === 'missing-points' || details.reason === 'no-level') return null;

    if (details.surfaceCollision || details.levelInclusionCollision) return true;
    if (!details.result) return false;

    // Polygon-only collisions are wall/sense-domain collisions. Let pending movement's
    // wall-sense pass handle limited/proximity/reverse-proximity semantics.
    if (details.polygonCollision) return null;

    return true;
  } catch {
    return null;
  }
}

export function withPendingMovementWallRayCache(callback) {
  if (typeof callback !== 'function') return undefined;
  if (activeWallRayCache()) return callback();

  const cache = new Map();
  pendingMovementWallRayCacheStack.push(cache);
  try {
    return callback();
  } finally {
    pendingMovementWallRayCacheStack.pop();
  }
}

function wallSensePassage(wall, sourcePoint, targetPoint, senseType, { customOnly = false } = {}) {
  const doc = wall?.document || wall;
  if (!doc) return 'open';

  if (wallIsOpenDoor(doc)) return 'open';

  const senseTypes = getWallSenseTypes();
  const wallSense = wallSenseValue(doc, senseType, senseTypes);
  if (wallSense === Number(senseTypes.NONE ?? 0)) return 'open';

  const isLimitedSense = wallSense === Number(senseTypes.LIMITED ?? 10);
  const isThresholdSense =
    wallSense === Number(senseTypes.PROXIMITY ?? 30) ||
    wallSense === Number(senseTypes.DISTANCE ?? 40);

  if (customOnly && !isLimitedSense && !isThresholdSense) return 'open';

  if (isThresholdSense) {
    const coords = Array.isArray(doc.c) ? doc.c : [doc.x, doc.y, doc.x2, doc.y2];
    return doesWallSenseBlockFromPoint(doc, sourcePoint, coords, senseType, {
      targetPoint,
      system: 'pending-movement',
    })
      ? 'block'
      : 'open';
  }

  return isLimitedSense ? 'limited' : 'block';
}

function wallIsOpenDoor(doc) {
  const isDoor = Number(doc?.door ?? 0) > 0;
  const doorState = Number(doc?.ds ?? doc?.doorState ?? 0);
  return isDoor && doorState === 1;
}

function wallSenseValue(doc, senseType, senseTypes = getWallSenseTypes()) {
  const defaultSense = senseType === 'sight' ? (senseTypes.NORMAL ?? 1) : (senseTypes.NONE ?? 0);
  return Number(doc?.[senseType] ?? defaultSense);
}

export function sceneHasBlockingWallSense(senseType) {
  const senseTypes = getWallSenseTypes();
  const openSense = Number(senseTypes.NONE ?? 0);

  for (const wall of canvas?.walls?.placeables || []) {
    const doc = wall?.document || wall;
    if (!doc || wallIsOpenDoor(doc)) continue;
    if (wallSenseValue(doc, senseType, senseTypes) !== openSense) return true;
  }

  return false;
}

export function sceneHasLimitedOrThresholdWallSense(senseType) {
  const senseTypes = getWallSenseTypes();
  const limitedSense = Number(senseTypes.LIMITED ?? 10);
  const thresholdSenses = new Set([
    Number(senseTypes.PROXIMITY ?? 30),
    Number(senseTypes.DISTANCE ?? 40),
  ]);

  for (const wall of canvas?.walls?.placeables || []) {
    const doc = wall?.document || wall;
    if (!doc || wallIsOpenDoor(doc)) continue;
    const wallSense = wallSenseValue(doc, senseType, senseTypes);
    if (wallSense === limitedSense || thresholdSenses.has(wallSense)) return true;
  }

  return false;
}

function cross(first, second) {
  return first.x * second.y - first.y * second.x;
}

function segmentIntersectionParameter(a, b, c, d) {
  const ray = { x: b.x - a.x, y: b.y - a.y };
  const wall = { x: d.x - c.x, y: d.y - c.y };
  const denom = cross(ray, wall);
  if (Math.abs(denom) < 1e-10) return null;

  const offset = { x: c.x - a.x, y: c.y - a.y };
  const t = cross(offset, wall) / denom;
  const u = cross(offset, ray) / denom;

  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

function intersectingWallHits(originPoint, targetPoint) {
  if (!originPoint || !targetPoint) return [];

  const cache = activeWallRayCache();
  const cacheKey = cache ? wallRayCacheKey(originPoint, targetPoint) : null;
  if (cacheKey && cache.has(cacheKey)) return cache.get(cacheKey);

  const walls = canvas?.walls?.placeables || [];
  const hits = [];
  for (const wall of walls) {
    const doc = wall?.document || wall;
    if (!doc) continue;
    const coords = Array.isArray(doc.c) ? doc.c : [doc.x, doc.y, doc.x2, doc.y2];
    const [x1, y1, x2, y2] = coords.map(Number);
    if (![x1, y1, x2, y2].every(Number.isFinite)) continue;

    const distance = segmentIntersectionParameter(
      originPoint,
      targetPoint,
      { x: x1, y: y1 },
      { x: x2, y: y2 },
    );
    if (distance === null) continue;
    hits.push({ wall, distance });
  }

  hits.sort((first, second) => first.distance - second.distance);
  if (cacheKey) cache.set(cacheKey, hits);
  return hits;
}

function lineBlockedByWallSense(
  originPoint,
  targetPoint,
  senseType,
  { customOnly = false, ...options } = {},
) {
  if (!customOnly) {
    const coreDecision = coreLevelsLineBlockDecision(
      originPoint,
      targetPoint,
      senseType,
      options,
    );
    if (coreDecision !== null) return coreDecision;
  }

  const hits = intersectingWallHits(originPoint, targetPoint);
  let passedLimitedWall = false;

  for (const { wall } of hits) {
    const sourcePoint = senseType === 'sound' ? targetPoint : originPoint;
    const destinationPoint = senseType === 'sound' ? originPoint : targetPoint;
    const passage = wallSensePassage(wall, sourcePoint, destinationPoint, senseType, {
      customOnly,
    });
    if (passage === 'open') continue;
    if (passage === 'block') return true;
    if (passage !== 'limited') continue;

    if (passedLimitedWall) return true;
    passedLimitedWall = true;
  }

  return false;
}

export function lineOfSightBlockedByWall(originPoint, targetPoint, options = {}) {
  return lineBlockedByWallSense(originPoint, targetPoint, 'sight', options);
}

export function lineOfSightBlockedByCustomSightWall(originPoint, targetPoint) {
  return lineBlockedByWallSense(originPoint, targetPoint, 'sight', { customOnly: true });
}

export function lineOfSoundBlockedByWall(originPoint, targetPoint, options = {}) {
  return lineBlockedByWallSense(originPoint, targetPoint, 'sound', options);
}

export function lineIntersectsLimitedWall(originPoint, targetPoint, senseType = 'sight') {
  const hits = intersectingWallHits(originPoint, targetPoint);

  for (const { wall } of hits) {
    const sourcePoint = senseType === 'sound' ? targetPoint : originPoint;
    const destinationPoint = senseType === 'sound' ? originPoint : targetPoint;
    if (
      wallSensePassage(wall, sourcePoint, destinationPoint, senseType, {
        customOnly: true,
      }) === 'limited'
    ) {
      return true;
    }
  }

  return false;
}
