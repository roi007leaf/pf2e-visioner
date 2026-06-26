import { hasActivePendingTokenMovement } from './movement-tracking.js';
import {
  currentViewObservers,
  targetIsHardHiddenFromCurrentView,
} from './Detection/current-view-hard-hide.js';
import { getVisionerVisibilityBetweenTokens } from './Detection/detection-visibility-context.js';

let running = false;
let cachedSoundwaveFilter = null;

function getSoundwaveFilter() {
  if (cachedSoundwaveFilter) return cachedSoundwaveFilter;
  try {
    const modes = globalThis.CONFIG?.Canvas?.detectionModes ?? {};
    const mode = modes.hearing || modes.feelTremor;
    cachedSoundwaveFilter = mode?.constructor?.getDetectionFilter?.() ?? null;
  } catch {
    cachedSoundwaveFilter = null;
  }
  return cachedSoundwaveFilter;
}

function previewForObserver(observer) {
  const previews = globalThis.canvas?.tokens?.preview?.children;
  if (!previews?.find) return null;
  const id = observer?.document?.id;
  return previews.find((c) => c?._original === observer || (id && c?.document?.id === id)) || null;
}

function targetSightPoints(target) {
  const documentPoints = target?.document?.getVisibilityTestPoints?.();
  if (Array.isArray(documentPoints) && documentPoints.length) return documentPoints;
  const center = target?.center;
  return center ? [center] : [];
}

function geometricSightReaches(origin, points) {
  const sight = globalThis.CONFIG?.Canvas?.polygonBackends?.sight;
  if (!origin || !sight?.testCollision) return null;
  for (const point of points) {
    try {
      if (!sight.testCollision(origin, point, { type: 'sight', mode: 'any' })) return true;
    } catch {
      /* ignore individual ray failures */
    }
  }
  return false;
}

export function observerSightContainsTarget(observer, target) {
  try {
    const points = targetSightPoints(target);
    if (!points.length) return false;
    const preview = previewForObserver(observer);
    if (preview) {
      const geom = geometricSightReaches(preview.center ?? observer?.center, points);
      if (geom !== null) return geom;
    }
    const los = preview?.vision?.los || observer?.vision?.los;
    return points.some((point) => los && los.contains(point.x, point.y));
  } catch {
    return false;
  }
}

function isMovementOrDragActive() {
  if (hasActivePendingTokenMovement()) return true;
  const tokens = globalThis.canvas?.tokens;
  if (tokens?._draggedToken) return true;
  const previews = tokens?.preview?.children;
  return !!(previews && previews.some?.((c) => c?.document?.id));
}

function hasHiddenAvsOverride(observer, target) {
  try {
    const observerId = observer?.document?.id ?? observer?.id;
    if (!observerId) return false;
    const flag = target?.document?.getFlag?.('pf2e-visioner', `avs-override-from-${observerId}`);
    return flag?.state === 'hidden';
  } catch {
    return false;
  }
}

export function targetShouldShowSoundwave(
  target,
  observers,
  getVisibility = getVisionerVisibilityBetweenTokens,
  getHiddenOverride = hasHiddenAvsOverride,
) {
  for (const observer of observers) {
    if (observer === target) continue;
    if (getHiddenOverride(observer, target)) return true;
  }
  let sensedOutOfSight = false;
  for (const observer of observers) {
    if (observer === target) continue;
    if (observerSightContainsTarget(observer, target)) return false;
    const visibility = getVisibility(observer, target);
    if (visibility === 'hidden' || visibility === 'observed' || visibility === 'concealed') {
      sensedOutOfSight = true;
    }
  }
  return sensedOutOfSight;
}

export function setSoundwaveMeshVisible(target, visible) {
  const mesh = target?.detectionFilterMesh;
  if (!mesh) return;
  if ('visible' in mesh && mesh.visible !== visible) mesh.visible = visible;
  if ('renderable' in mesh && mesh.renderable !== visible) mesh.renderable = visible;
  if ('alpha' in mesh) {
    const nextAlpha = visible ? 1 : 0;
    if (mesh.alpha !== nextAlpha) mesh.alpha = nextAlpha;
  }
}

function refreshSoundwavesForActiveMovement() {
  const observers = currentViewObservers();
  if (!observers.length) return;
  const filter = getSoundwaveFilter();
  for (const target of globalThis.canvas?.tokens?.placeables ?? []) {
    if (target.controlled) continue;
    if (targetIsHardHiddenFromCurrentView(target)) continue;
    const wantsSoundwave = targetShouldShowSoundwave(target, observers);
    try {
      if (wantsSoundwave) {
        if (filter && target.detectionFilter !== filter) target.detectionFilter = filter;
        setSoundwaveMeshVisible(target, true);
      } else {
        if (target.detectionFilter) target.detectionFilter = null;
        setSoundwaveMeshVisible(target, false);
      }
    } catch {
      /* keep core filter state if assignment fails */
    }
  }
}

export function ensureDuringMoveSoundwaveRefresh() {
  if (running) return;
  const raf = globalThis.requestAnimationFrame;
  if (typeof raf !== 'function') return;
  running = true;
  const tick = () => {
    if (!isMovementOrDragActive()) {
      running = false;
      return;
    }
    try {
      refreshSoundwavesForActiveMovement();
    } catch {
      /* keep core visibility if the soundwave refresh fails */
    }
    raf(tick);
  };
  raf(tick);
}

export function startDuringMoveSoundwaveOnDrag(wrapped, ...args) {
  try {
    ensureDuringMoveSoundwaveRefresh();
  } catch {
    /* never block the drag handler */
  }
  return wrapped(...args);
}
