import { doesWallSenseBlockFromPoint, getWallSenseTypes } from '../../helpers/wall-sense-utils.js';

function wallBlocksSight(wall) {
  const doc = wall?.document || wall;
  if (!doc) return false;

  const isDoor = Number(doc.door ?? 0) > 0;
  const doorState = Number(doc.ds ?? doc.doorState ?? 0);
  if (isDoor && doorState === 1) return false;

  return Number(doc.sight ?? 1) > 0;
}

function segmentsIntersect(a, b, c, d) {
  const denom = (d.x - c.x) * (b.y - a.y) - (d.y - c.y) * (b.x - a.x);
  if (Math.abs(denom) < 1e-10) return false;

  const t = ((a.x - c.x) * (b.y - a.y) - (a.y - c.y) * (b.x - a.x)) / denom;
  const u = -((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / denom;

  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

export function lineOfSightBlockedByWall(originPoint, targetPoint) {
  if (!originPoint || !targetPoint) return false;

  const walls = canvas?.walls?.placeables || [];
  for (const wall of walls) {
    if (!wallBlocksSight(wall)) continue;

    const doc = wall?.document || wall;
    const coords = Array.isArray(doc.c) ? doc.c : [doc.x, doc.y, doc.x2, doc.y2];
    const [x1, y1, x2, y2] = coords.map(Number);
    if (![x1, y1, x2, y2].every(Number.isFinite)) continue;

    if (segmentsIntersect(originPoint, targetPoint, { x: x1, y: y1 }, { x: x2, y: y2 })) {
      return true;
    }
  }

  return false;
}

function wallBlocksSound(wall, sourcePoint, targetPoint) {
  const doc = wall?.document || wall;
  if (!doc) return false;

  const senseTypes = getWallSenseTypes();
  const soundSense = Number(doc.sound ?? senseTypes.NONE ?? 0);
  if (soundSense === Number(senseTypes.NONE ?? 0)) return false;
  if (soundSense === Number(senseTypes.LIMITED ?? 10)) return false;

  const isDoor = Number(doc.door ?? 0) > 0;
  const doorState = Number(doc.ds ?? doc.doorState ?? 0);
  if (isDoor && doorState === 1) return false;

  const coords = Array.isArray(doc.c) ? doc.c : [doc.x, doc.y, doc.x2, doc.y2];
  if (
    soundSense === Number(senseTypes.PROXIMITY ?? 30) ||
    soundSense === Number(senseTypes.DISTANCE ?? 40)
  ) {
    return doesWallSenseBlockFromPoint(doc, sourcePoint, coords, 'sound', {
      targetPoint,
      system: 'pending-movement',
    });
  }

  return true;
}

export function lineOfSoundBlockedByWall(originPoint, targetPoint) {
  if (!originPoint || !targetPoint) return false;

  const walls = canvas?.walls?.placeables || [];
  for (const wall of walls) {
    const doc = wall?.document || wall;
    const coords = Array.isArray(doc?.c) ? doc.c : [doc?.x, doc?.y, doc?.x2, doc?.y2];
    const [x1, y1, x2, y2] = coords.map(Number);
    if (![x1, y1, x2, y2].every(Number.isFinite)) continue;

    if (!segmentsIntersect(originPoint, targetPoint, { x: x1, y: y1 }, { x: x2, y: y2 })) {
      continue;
    }

    if (wallBlocksSound(wall, targetPoint, originPoint)) {
      return true;
    }
  }

  return false;
}
