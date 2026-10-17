import { MODULE_ID } from '../../constants.js';
import { getWallElevationBounds } from '../../helpers/wall-height-utils.js';

export const LEDGE_FLAG = 'ledge';
export const LEDGE_ELEVATION_FLAG = 'ledgeElevation';

export function isLedgeWall(wallDoc) {
  return wallDoc?.flags?.[MODULE_ID]?.[LEDGE_FLAG] === true;
}

export function getLedgeElevation(wallDoc) {
  const raw = wallDoc?.flags?.[MODULE_ID]?.[LEDGE_ELEVATION_FLAG];
  if (raw === null || raw === undefined || raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function wallHeightTop(wallDoc) {
  const top = getWallElevationBounds(wallDoc)?.top;
  return Number.isFinite(top) ? top : null;
}

function wallLevelIds(wallDoc) {
  const ids = wallDoc?.levels;
  if (ids instanceof Set) return [...ids];
  return Array.isArray(ids) ? ids : [];
}

function levelFloor(level) {
  const floor = level?.elevation?.bottom;
  if (floor === null || floor === undefined) return -Infinity;
  const value = Number(floor);
  return Number.isFinite(value) ? value : -Infinity;
}

function lowestSceneFloor(sceneLevels) {
  let lowest = Infinity;
  for (const level of sceneLevels?.values?.() ?? []) {
    const floor = levelFloor(level);
    if (Number.isFinite(floor)) lowest = Math.min(lowest, floor);
  }
  return lowest;
}

function highestLevelFloor(wallDoc) {
  const sceneLevels = wallDoc?.parent?.levels;
  const baseFloor = lowestSceneFloor(sceneLevels);
  let highest = null;
  for (const id of wallLevelIds(wallDoc)) {
    const floor = levelFloor(sceneLevels?.get?.(id));
    if (!Number.isFinite(floor) || floor <= baseFloor) continue;
    if (highest === null || floor > highest) highest = floor;
  }
  return highest;
}

export function getInheritedLedgeElevation(wallDoc) {
  return wallHeightTop(wallDoc) ?? highestLevelFloor(wallDoc);
}

export function resolveLedgeElevation(wallDoc) {
  return getLedgeElevation(wallDoc) ?? getInheritedLedgeElevation(wallDoc);
}

let ledgeWallCache = null;

export function getSceneLedgeWalls() {
  const sceneId = canvas?.scene?.id ?? null;
  if (ledgeWallCache?.sceneId === sceneId) return ledgeWallCache.walls;
  const walls = (canvas?.walls?.placeables ?? []).filter((wall) => isLedgeWall(wall?.document));
  ledgeWallCache = { sceneId, walls };
  return walls;
}

export function invalidateLedgeWallCache() {
  ledgeWallCache = null;
}

export function registerLedgeWallCacheHooks() {
  for (const hook of ['canvasReady', 'createWall', 'updateWall', 'deleteWall']) {
    Hooks.on(hook, invalidateLedgeWallCache);
  }
}

const SENSE_NONE = 0;
const LEDGE_SENSE_PATCH = { sight: SENSE_NONE, light: SENSE_NONE, sound: SENSE_NONE };

export function buildLedgeFlagPatch(ledgeChecked, rawElevation) {
  const text = String(rawElevation ?? '').trim();
  const elevation = text === '' ? null : Number(text);
  return {
    [`flags.${MODULE_ID}.${LEDGE_FLAG}`]: !!ledgeChecked,
    [`flags.${MODULE_ID}.${LEDGE_ELEVATION_FLAG}`]:
      ledgeChecked && Number.isFinite(elevation) ? elevation : null,
    ...(ledgeChecked ? LEDGE_SENSE_PATCH : {}),
  };
}

export function segmentCrossingT(p1, p2, coords) {
  const [x3, y3, x4, y4] = coords;
  const rx = p2.x - p1.x;
  const ry = p2.y - p1.y;
  const sx = x4 - x3;
  const sy = y4 - y3;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-9) return null;
  const qx = x3 - p1.x;
  const qy = y3 - p1.y;
  const t = (qx * sy - qy * sx) / denom;
  const u = (qx * ry - qy * rx) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return t;
}

function wallCoords(wall) {
  const doc = wall?.document ?? wall;
  const c = wall?.coords ?? doc?.c;
  return Array.isArray(c) && c.length >= 4 ? c : null;
}

export function findLedgeCrossings(p1, p2, walls) {
  const crossings = [];
  for (const wall of walls ?? []) {
    const doc = wall?.document ?? wall;
    if (!isLedgeWall(doc)) continue;
    const coords = wallCoords(wall);
    if (!coords) continue;
    const edgeT = segmentCrossingT(p1, p2, coords);
    if (edgeT !== null) crossings.push({ edgeT, elevation: resolveLedgeElevation(doc) });
  }
  return crossings;
}
