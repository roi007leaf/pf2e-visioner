import { MODULE_ID } from '../../constants.js';

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

export function buildLedgeFlagPatch(ledgeChecked, rawElevation) {
  const text = String(rawElevation ?? '').trim();
  const elevation = text === '' ? null : Number(text);
  return {
    [`flags.${MODULE_ID}.${LEDGE_FLAG}`]: !!ledgeChecked,
    [`flags.${MODULE_ID}.${LEDGE_ELEVATION_FLAG}`]:
      ledgeChecked && Number.isFinite(elevation) ? elevation : null,
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
    if (edgeT !== null) crossings.push({ edgeT, elevation: getLedgeElevation(doc) });
  }
  return crossings;
}
