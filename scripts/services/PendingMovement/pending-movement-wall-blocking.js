import { doesWallSenseBlockFromPoint, getWallSenseTypes } from '../../helpers/wall-sense-utils.js';
import { LevelsIntegration } from '../LevelsIntegration.js';

const pendingMovementWallRayCacheStack = [];
let pendingMovementWallGeometryCache = null;

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

function wallRayCacheKey(originPoint, targetPoint, senseKey = 'all') {
  const originKey = pointCacheKey(originPoint);
  const targetKey = pointCacheKey(targetPoint);
  return originKey && targetKey ? `${senseKey}:${originKey}>${targetKey}` : null;
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

export function clearPendingMovementWallGeometryCache() {
  pendingMovementWallGeometryCache = null;
}

function limitedOrThresholdWallSense(wallSense, senseTypes = getWallSenseTypes()) {
  return (
    wallSense === Number(senseTypes.LIMITED ?? 10) ||
    wallSense === Number(senseTypes.PROXIMITY ?? 30) ||
    wallSense === Number(senseTypes.DISTANCE ?? 40)
  );
}

function buildWallGeometryIndex() {
  const walls = canvas?.walls?.placeables || [];
  const senseTypes = getWallSenseTypes();
  const openSense = Number(senseTypes.NONE ?? 0);
  const entries = [];
  const bySense = {
    sight: { all: [], custom: [] },
    sound: { all: [], custom: [] },
  };
  const hasBlocking = { sight: false, sound: false };
  const hasLimitedOrThreshold = { sight: false, sound: false };

  for (const wall of walls) {
    const doc = wall?.document || wall;
    if (!doc || wallIsOpenDoor(doc)) continue;

    const sightSense = wallSenseValue(doc, 'sight', senseTypes);
    const soundSense = wallSenseValue(doc, 'sound', senseTypes);
    const sightBlocks = sightSense !== openSense;
    const soundBlocks = soundSense !== openSense;
    if (!sightBlocks && !soundBlocks) continue;

    const sightCustom = limitedOrThresholdWallSense(sightSense, senseTypes);
    const soundCustom = limitedOrThresholdWallSense(soundSense, senseTypes);
    const entry = {
      wall,
      doc,
      sense: {
        sight: { blocks: sightBlocks, custom: sightCustom },
        sound: { blocks: soundBlocks, custom: soundCustom },
      },
      segment: null,
      segmentResolved: false,
    };
    entries.push(entry);

    if (sightBlocks) {
      bySense.sight.all.push(entry);
      hasBlocking.sight = true;
      if (sightCustom) {
        bySense.sight.custom.push(entry);
        hasLimitedOrThreshold.sight = true;
      }
    }
    if (soundBlocks) {
      bySense.sound.all.push(entry);
      hasBlocking.sound = true;
      if (soundCustom) {
        bySense.sound.custom.push(entry);
        hasLimitedOrThreshold.sound = true;
      }
    }
  }

  return {
    source: walls,
    length: Number.isFinite(walls?.length) ? walls.length : null,
    entries,
    bySense,
    hasBlocking,
    hasLimitedOrThreshold,
  };
}

function getWallGeometryIndex() {
  const walls = canvas?.walls?.placeables || [];
  const length = Number.isFinite(walls?.length) ? walls.length : null;
  if (
    pendingMovementWallGeometryCache?.source === walls &&
    (length === null || pendingMovementWallGeometryCache.length === length)
  ) {
    return pendingMovementWallGeometryCache;
  }

  pendingMovementWallGeometryCache = buildWallGeometryIndex();
  return pendingMovementWallGeometryCache;
}

function wallEntriesForSense(senseType, customOnly = false) {
  const index = getWallGeometryIndex();
  if (senseType === 'sight' || senseType === 'sound') {
    return index.bySense[senseType][customOnly ? 'custom' : 'all'];
  }
  return index.entries;
}

function resolveWallSegment(entry) {
  if (!entry || entry.segmentResolved) return entry?.segment ?? null;
  entry.segmentResolved = true;

  const doc = entry.doc;
  const rawCoords = doc?.c;
  const coords = Array.isArray(rawCoords) ? rawCoords : [doc?.x, doc?.y, doc?.x2, doc?.y2];
  const [x1, y1, x2, y2] = coords.map(Number);
  if (![x1, y1, x2, y2].every(Number.isFinite)) return null;

  entry.segment = {
    coords: [x1, y1, x2, y2],
    start: { x: x1, y: y1 },
    end: { x: x2, y: y2 },
    minX: Math.min(x1, x2),
    maxX: Math.max(x1, x2),
    minY: Math.min(y1, y2),
    maxY: Math.max(y1, y2),
  };
  return entry.segment;
}

function wallSensePassage(
  wall,
  sourcePoint,
  targetPoint,
  senseType,
  { customOnly = false, coordsOverride = null } = {},
) {
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
    const rawCoords = coordsOverride || doc.c;
    const coords = Array.isArray(rawCoords) ? rawCoords : [doc.x, doc.y, doc.x2, doc.y2];
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
  return !!getWallGeometryIndex().hasBlocking?.[senseType];
}

export function sceneHasLimitedOrThresholdWallSense(senseType) {
  return !!getWallGeometryIndex().hasLimitedOrThreshold?.[senseType];
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

function intersectingWallHits(originPoint, targetPoint, { senseType = null, customOnly = false } = {}) {
  if (!originPoint || !targetPoint) return [];

  const cache = activeWallRayCache();
  const senseKey = `${senseType || 'all'}:${customOnly ? 'custom' : 'all'}`;
  const cacheKey = cache ? wallRayCacheKey(originPoint, targetPoint, senseKey) : null;
  if (cacheKey && cache.has(cacheKey)) return cache.get(cacheKey);

  const rayMinX = Math.min(originPoint.x, targetPoint.x);
  const rayMaxX = Math.max(originPoint.x, targetPoint.x);
  const rayMinY = Math.min(originPoint.y, targetPoint.y);
  const rayMaxY = Math.max(originPoint.y, targetPoint.y);
  const hits = [];
  for (const entry of wallEntriesForSense(senseType, customOnly)) {
    const segment = resolveWallSegment(entry);
    if (
      !segment ||
      segment.maxX < rayMinX ||
      segment.minX > rayMaxX ||
      segment.maxY < rayMinY ||
      segment.minY > rayMaxY
    ) {
      continue;
    }
    const distance = segmentIntersectionParameter(
      originPoint,
      targetPoint,
      segment.start,
      segment.end,
    );
    if (distance === null) continue;
    hits.push({ wall: entry.wall, entry, distance });
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

  const hits = intersectingWallHits(originPoint, targetPoint, { senseType, customOnly });
  let passedLimitedWall = false;

  for (const { wall, entry } of hits) {
    const sourcePoint = senseType === 'sound' ? targetPoint : originPoint;
    const destinationPoint = senseType === 'sound' ? originPoint : targetPoint;
    const passage = wallSensePassage(wall, sourcePoint, destinationPoint, senseType, {
      customOnly,
      coordsOverride: entry?.segment?.coords,
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
  const hits = intersectingWallHits(originPoint, targetPoint, {
    senseType,
    customOnly: true,
  });

  for (const { wall, entry } of hits) {
    const sourcePoint = senseType === 'sound' ? targetPoint : originPoint;
    const destinationPoint = senseType === 'sound' ? originPoint : targetPoint;
    if (
      wallSensePassage(wall, sourcePoint, destinationPoint, senseType, {
        customOnly: true,
        coordsOverride: entry?.segment?.coords,
      }) === 'limited'
    ) {
      return true;
    }
  }

  return false;
}
