import { shouldBypassAvsForGmVision } from '../gm-vision-bypass.js';
import { currentViewObservers } from './current-view-hard-hide.js';
import {
  getVisionerVisibilityBetweenTokens,
  isAvsActiveGivenCombatGate,
} from './detection-visibility-context.js';
import { isSelectAllTokenVisibilityBypassActive } from './select-all-token-visibility-bypass.js';
import { peekRegistry } from '../Peek/PeekRegistry.js';
import { isPointInCone } from '../Peek/peek-geometry.js';

function tokenIdOf(token) {
  return token?.document?.id ?? token?.id ?? null;
}

function pointFrom(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function normalizeVisibilityPoints(points, target) {
  const out = [];
  if (Array.isArray(points)) {
    if (points.length >= 2 && typeof points[0] === 'number') {
      for (let i = 0; i < points.length - 1; i += 2) {
        const point = pointFrom({ x: points[i], y: points[i + 1] });
        if (point) out.push(point);
      }
    } else {
      for (const entry of points) {
        const point = pointFrom(entry);
        if (point) out.push(point);
      }
    }
  } else {
    const point = pointFrom(points);
    if (point) out.push(point);
  }

  if (!out.length) {
    const fallback = pointFrom(target?.center);
    if (fallback) out.push(fallback);
  }
  return out;
}

function geometryContainsPoint(geometry, point) {
  if (!geometry) return null;
  for (const method of ['containsPoint', 'testPoint']) {
    const fn = geometry?.[method];
    if (typeof fn !== 'function') continue;
    try {
      const result = fn.call(geometry, point);
      if (typeof result === 'boolean') return result;
    } catch (_) {}
  }
  if (typeof geometry.contains === 'function') {
    try {
      const result = geometry.contains(point.x, point.y);
      if (typeof result === 'boolean') return result;
    } catch (_) {}
    try {
      const result = geometry.contains(point);
      if (typeof result === 'boolean') return result;
    } catch (_) {}
  }
  return null;
}

function pointWithinPeekBounds(observer, peek, point) {
  if (typeof peek?.fov === 'number' && !isPointInCone(peek.origin, peek.direction, peek.fov, point)) {
    return false;
  }
  if (typeof peek?.range === 'number' && peek.range > 0) {
    const dx = point.x - peek.origin.x;
    const dy = point.y - peek.origin.y;
    if (Math.hypot(dx, dy) > peek.range) return false;
  }

  const losResult = geometryContainsPoint(observer?.vision?.los, point);
  if (losResult !== null) return losResult;
  const fovResult = geometryContainsPoint(observer?.vision?.fov, point);
  if (fovResult !== null) return fovResult;
  return true;
}

function activePeekObserversForCanvasTest(options) {
  const sourceToken = options?.source?.object;
  const candidates = sourceToken ? [sourceToken] : currentViewObservers();
  const out = [];
  const seen = new Set();
  for (const observer of candidates) {
    const id = tokenIdOf(observer);
    if (!id || seen.has(id) || !peekRegistry.has(id)) continue;
    seen.add(id);
    out.push(observer);
  }
  return out;
}

function coreVisibilityAllowedByActivePeek(points, options) {
  const observers = activePeekObserversForCanvasTest(options);
  if (!observers.length) return true;
  const target = options?.object;
  const testPoints = normalizeVisibilityPoints(points, target);
  if (!testPoints.length) return true;
  return observers.some((observer) => {
    const peek = peekRegistry.get(tokenIdOf(observer));
    if (!peek?.origin) return false;
    if (getVisionerVisibilityBetweenTokens(observer, target) === 'hidden') return true;
    return testPoints.some((point) => pointWithinPeekBounds(observer, peek, point));
  });
}

function currentViewObservesTargetPrecisely(target) {
  const observers = currentViewObservers();
  if (!observers.length) return false;
  for (const observer of observers) {
    if (observer === target) continue;
    if (getVisionerVisibilityBetweenTokens(observer, target) === 'observed') return true;
  }
  return false;
}

export function wrapCanvasVisibilityTest(wrapped, points, options = {}) {
  if (isSelectAllTokenVisibilityBypassActive()) {
    return wrapped(points, options);
  }
  if (shouldBypassAvsForGmVision()) {
    return wrapped(points, options);
  }
  if (!isAvsActiveGivenCombatGate()) {
    return wrapped(points, options);
  }
  const result = wrapped(points, options);
  if (result === true && !coreVisibilityAllowedByActivePeek(points, options)) {
    return false;
  }
  const target = options?.object;
  if (result === true && target?.detectionFilter && currentViewObservesTargetPrecisely(target)) {
    target.detectionFilter = null;
  }
  return result;
}
