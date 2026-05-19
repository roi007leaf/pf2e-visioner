import { MODULE_ID } from '../constants.js';
import { getVisibilityBetween } from '../utils.js';
import { getWallSegment } from './Walls/wall-indicator-rendering.js';

export async function updateHiddenTokenEchoes(
  observer,
  {
    canvasLayer = globalThis.canvas,
    moduleId = MODULE_ID,
    pixi = globalThis.PIXI,
    getVisibilityState = getVisibilityBetween,
    enabled = false,
  } = {},
) {
  try {
    if (!enabled || !observer) {
      clearHiddenTokenEchoes(canvasLayer?.tokens?.placeables || []);
      return;
    }

    const walls = canvasLayer?.walls?.placeables || [];
    const wallMap = observer?.document?.getFlag?.(moduleId, 'walls') || {};
    const observedSet = new Set(
      Object.entries(wallMap)
        .filter(([, value]) => value === 'observed')
        .map(([id]) => id),
    );
    const expandedObserved = new Set(observedSet);

    try {
      const { getConnectedWallDocsBySourceId } = await import('./Walls/connected-walls.js');
      for (const wall of walls) {
        const id = wall?.document?.id;
        if (!id || !observedSet.has(id)) continue;
        const connectedDocs = getConnectedWallDocsBySourceId(id) || [];
        for (const document of connectedDocs) expandedObserved.add(document.id);
      }
    } catch (_) { }

    const hiddenObservedWalls = walls.filter((wall) => {
      try {
        return expandedObserved.has(wall?.document?.id);
      } catch (_) {
        return false;
      }
    });

    const regularBlockingWalls = walls.filter((wall) => {
      try {
        const document = wall.document;
        if (expandedObserved.has(document.id)) return false;
        const isDoor = Number(document.door) > 0;
        const doorState = Number(document.ds ?? document.doorState ?? 0);
        if (isDoor && doorState === 1) return false;
        const sight = Number(document.sight ?? 1);
        return sight !== 0;
      } catch (_) {
        return false;
      }
    });

    for (const token of canvasLayer.tokens.placeables) {
      if (!token?.actor || token === observer) {
        removeHiddenTokenEcho(token);
        continue;
      }

      let visibilityState = 'observed';
      try {
        visibilityState = getVisibilityState(observer, token);
      } catch (_) { }
      if (visibilityState !== 'hidden') {
        removeHiddenTokenEcho(token);
        continue;
      }

      const observerPoint = observer.center || observer.getCenterPoint?.();
      const targetPoint = token.center || token.getCenterPoint?.();
      if (!observerPoint || !targetPoint) {
        removeHiddenTokenEcho(token);
        continue;
      }

      const intersectsHidden = hiddenObservedWalls.some((wall) =>
        segmentIntersectsWall(observerPoint, targetPoint, wall),
      );
      if (!intersectsHidden) {
        removeHiddenTokenEcho(token);
        continue;
      }

      const intersectsRegular = regularBlockingWalls.some((wall) =>
        segmentIntersectsWall(observerPoint, targetPoint, wall),
      );
      if (intersectsRegular) {
        removeHiddenTokenEcho(token);
        continue;
      }

      drawHiddenTokenEcho(token, { canvasLayer, pixi });
    }
  } catch (_) { }
}

export function clearHiddenTokenEchoes(tokens) {
  for (const token of tokens || []) {
    removeHiddenTokenEcho(token);
  }
}

export function drawHiddenTokenEcho(token, { canvasLayer = globalThis.canvas, pixi = globalThis.PIXI } = {}) {
  try {
    const center = token.center ||
      token.getCenterPoint?.() || {
      x: token.x + token.w / 2,
      y: token.y + token.h / 2,
      elevation: token.elevation,
    };
    const graphics = token._pvHiddenEcho || new pixi.Graphics();
    graphics.clear();
    graphics.lineStyle(2, 0xffa500, 0.9);
    for (const radius of [12, 18, 24]) graphics.drawCircle(center.x, center.y, radius);
    graphics.zIndex = 1001;
    graphics.eventMode = 'none';
    if (!token._pvHiddenEcho) {
      (canvasLayer.tokens || token.parent)?.addChild(graphics);
      token._pvHiddenEcho = graphics;
    }
  } catch (_) { }
}

export function removeHiddenTokenEcho(token) {
  try {
    if (token?._pvHiddenEcho) {
      token._pvHiddenEcho.parent?.removeChild(token._pvHiddenEcho);
      token._pvHiddenEcho.destroy?.();
    }
  } catch (_) { }
  if (token) token._pvHiddenEcho = null;
}

export function segmentIntersectsWall(p1, p2, wall) {
  try {
    const segment = getWallSegment(wall?.document);
    if (!segment) return false;
    return segmentsIntersect(
      p1,
      p2,
      { x: segment.x1, y: segment.y1 },
      { x: segment.x2, y: segment.y2 },
    );
  } catch (_) {
    return false;
  }
}

export function segmentsIntersect(p1, p2, q1, q2) {
  const orientation = (a, b, c) =>
    Math.sign((b.y - a.y) * (c.x - a.x) - (b.x - a.x) * (c.y - a.y));
  const onSegment = (a, b, c) =>
    Math.min(a.x, b.x) <= c.x &&
    c.x <= Math.max(a.x, b.x) &&
    Math.min(a.y, b.y) <= c.y &&
    c.y <= Math.max(a.y, b.y);
  const o1 = orientation(p1, p2, q1);
  const o2 = orientation(p1, p2, q2);
  const o3 = orientation(q1, q2, p1);
  const o4 = orientation(q1, q2, p2);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, p2, q2)) return true;
  if (o3 === 0 && onSegment(q1, q2, p1)) return true;
  if (o4 === 0 && onSegment(q1, q2, p2)) return true;
  return false;
}
