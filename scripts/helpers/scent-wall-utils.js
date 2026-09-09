import { MODULE_ID } from '../constants.js';
import { doesWallBlockLineOfSight } from './wall-height-utils.js';

// Scent has its own opt-in wall restriction, independent of sight, sound, and Silence.
export function isScentBlocked(observer, target, walls = globalThis.canvas?.walls?.placeables ?? []) {
  return pathCrossesWall(observer, target, walls, (doc) =>
    (doc.getFlag?.(MODULE_ID, 'blocksScent') ?? doc.flags?.[MODULE_ID]?.blocksScent) === true);
}

// Read door documents directly: Core polygons and stored AVS states can still describe
// the open door during its first closing frame. Special/one-way walls stay with Core.
export function isClosedSightDoorBetween(observer, target, walls = globalThis.canvas?.walls?.placeables ?? [], { soundRequired = false } = {}) {
  return pathCrossesWall(observer, target, walls, (doc) =>
    Number(doc.door) > 0 && Number(doc.sight) === 20 && !Number(doc.dir) &&
    (!soundRequired || Number(doc.sound) === 20));
}

function pathCrossesWall(observer, target, walls, blocks) {
  const a = observer?.center;
  const b = target?.center;
  if (!a || !b) return false;
  for (const wall of walls) {
    const doc = wall.document ?? wall;
    if (!blocks(doc)) continue;
    if (Number(doc.door) > 0 && Number(doc.ds) === 1) continue;
    if (!Array.isArray(doc.c) || doc.c.length < 4) continue;
    const [x1, y1, x2, y2] = doc.c;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const wx = x2 - x1;
    const wy = y2 - y1;
    const denominator = dx * wy - dy * wx;
    if (Math.abs(denominator) < 1e-8) continue;
    const t = ((x1 - a.x) * wy - (y1 - a.y) * wx) / denominator;
    const u = ((x1 - a.x) * dy - (y1 - a.y) * dx) / denominator;
    if (t <= 0 || t >= 1 || u < 0 || u > 1) continue;
    const az = Number(observer.document?.elevation ?? 0);
    const bz = Number(target.document?.elevation ?? 0);
    if (doesWallBlockLineOfSight(doc, { bottom: az, top: az }, { bottom: bz, top: bz }, t)) return true;
  }
  return false;
}
