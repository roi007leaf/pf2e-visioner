import { hasActivePendingTokenMovement } from './movement-tracking.js';
import {
  currentViewVisionerObserversForTarget,
  releaseCurrentViewHardHideForLiveSight,
  targetIsHardHiddenFromCurrentView,
} from './Detection/current-view-hard-hide.js';
import {
  getVisionerVisibilityBetweenTokens,
  isAvsActiveGivenCombatGate,
} from './Detection/detection-visibility-context.js';
import { shouldBypassAvsForGmVision } from './gm-vision-bypass.js';
import { isSceneTokenVisionDisabled } from './scene-token-vision.js';
import { VisionAnalyzer } from '../visibility/auto-visibility/VisionAnalyzer.js';
import { isVisualSenseType } from '../visibility/StatelessVisibilityCalculator.js';
import { isPartyActorToken } from '../utils/token-actor.js';

let running = false;
let cachedSoundwaveFilter = null;

// The wave decision runs VisionAnalyzer sense/geometry queries per out-of-sight target; doing that
// every animation frame tanks FPS on busy scenes. Recompute at ~10Hz - imperceptible for the ring,
// off the per-frame hot path. Between recomputes the installed filter overrides keep rendering.
const WAVE_RECOMPUTE_INTERVAL_MS = 100;
let lastWaveComputeAt = 0;

// Whether an out-of-sight target is still heard barely changes as the observer slides, so cache the
// expensive imprecise-sense query (getSensingCapabilities + isSoundBlocked raycast) per pair for the
// duration of one move. Cleared when the move ends.
const senseMemo = new Map();

// During a committed move Foundry recomputes and RESETS each non-controlled token's detectionFilter
// to null every render frame (the persisted state is still the frozen pre-move 'observed'), so the
// soundwave would not appear until the move-end settle. To surface it the instant sight is lost we
// install an accessor on the target's detectionFilter: its getter returns the soundwave filter, so
// Token#_renderDetectionFilter (which Foundry only invokes while detectionFilter is truthy) runs and
// draws the ripple every frame; its setter absorbs Foundry's null writes. `stored || filter` keeps a
// genuinely-hidden target on Foundry's own filter and only falls back for the frozen-observed case.
// Overrides are removed when the target regains sight or the move ends, restoring normal rendering.
const filterOverrides = new Map();
let previouslySoundwaveDetectedTargets = new WeakSet();

// After a move ends the AVS recompute of the persisted state (observed -> hidden) is async. If we
// dropped the filter overrides the instant the move stopped, the target would render 'observed' for
// the frames until that recompute lands - a flash. So we keep each override alive past move-end and
// hand it off only once it is safe (Foundry's own computation now yields a filter, or the target is
// genuinely back in an observer's sight). A hard tick cap prevents a stuck override.
const MAX_SETTLE_TICKS = 300;
let settleTicks = 0;

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

export function observerSightContainsTarget(observer, target) {
  try {
    if (globalThis.canvas?.scene?.tokenVision === false) return true;
    const center = target?.center;
    if (!center) return false;
    const vision = previewForObserver(observer)?.vision || observer?.vision;
    if (vision?.isBlinded || vision?.blinded?.darkness) return false;
    const los = vision?.los;
    return !!(los && los.contains(center.x, center.y));
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

export function impreciselySensedOutOfSight(observer, target) {
  try {
    const analyzer = VisionAnalyzer.getInstance?.();
    if (!analyzer) return false;
    const distance = analyzer.distanceFeet(observer, target);
    const inRange = (senseData) => {
      const range = senseData && typeof senseData === 'object' ? senseData.range : senseData;
      return Number(range) >= distance;
    };
    const capabilities = analyzer.getSensingCapabilities(observer) || {};
    // A precise non-visual sense (echolocation, blindsight) keeps the target observed even without
    // sight, so it must NOT surface an imprecise-only soundwave.
    for (const [senseType, senseData] of Object.entries(capabilities.precise || {})) {
      if (!isVisualSenseType(senseType) && inRange(senseData)) return false;
    }
    // An imprecise sense in range (tremorsense, scent) means the target is sensed = hidden.
    for (const senseData of Object.values(capabilities.imprecise || {})) {
      if (inRange(senseData)) return true;
    }
    // Hearing is implicit for most creatures: hidden unless deafened or the sound is blocked.
    const legacy = analyzer.getVisionCapabilities(observer) || {};
    if (legacy.isDeafened) return false;
    return !analyzer.isSoundBlocked(observer, target);
  } catch {
    return false;
  }
}

function memoImpreciselySensed(observer, target) {
  const key = `${observer?.document?.id ?? observer?.id}:${target?.document?.id ?? target?.id}`;
  const cached = senseMemo.get(key);
  if (cached !== undefined) return cached;
  const result = impreciselySensedOutOfSight(observer, target);
  senseMemo.set(key, result);
  return result;
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
  impreciselySensed = impreciselySensedOutOfSight,
) {
  if (isSceneTokenVisionDisabled()) return false;
  for (const observer of observers) {
    if (observer === target) continue;
    if (getHiddenOverride(observer, target)) return true;
  }
  let sensedOutOfSight = false;
  for (const observer of observers) {
    if (observer === target) continue;
    if (observerSightContainsTarget(observer, target)) return false;
    const visibility = getVisibility(observer, target);
    if (visibility === 'hidden') {
      sensedOutOfSight = true;
    } else if (
      (visibility === 'observed' || visibility === 'concealed') &&
      impreciselySensed(observer, target)
    ) {
      // Freeze+settle keeps the persisted state at the pre-move value, but the observer's live sight
      // polygon updates during a committed move. A previously-seen target whose live sight is now
      // lost but that is still sensed imprecisely (heard/tremorsense, not echolocation) has become
      // hidden - surface its soundwave now instead of waiting for the move-end settle.
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

function reconcileRenderSurfaceAfterSoundwave(target) {
  if (!target) return;
  if (target.detectionFilter) {
    setSoundwaveMeshVisible(target, true);
    return;
  }
  setSoundwaveMeshVisible(target, false);
  let coreVisible = false;
  let visionerHardHidden = true;
  try {
    coreVisible = target.isVisible !== false;
  } catch {
    /* unsafe visibility getter -> do not reveal */
  }
  try {
    visionerHardHidden = targetIsHardHiddenFromCurrentView(target);
  } catch {
    /* unsafe visibility state -> do not reveal */
  }
  if (
    target._pvCurrentViewHardHidden === true ||
    target.visible !== true ||
    !coreVisible ||
    visionerHardHidden
  )
    return;
  if ('renderable' in target) target.renderable = true;
  if (target.mesh) {
    if ('visible' in target.mesh) target.mesh.visible = true;
    if ('renderable' in target.mesh) target.mesh.renderable = true;
  }
}

function hasActiveCoreSoundwaveSurface(target) {
  const mesh = target?.detectionFilterMesh;
  return (
    target?.detectionFilter === getSoundwaveFilter() &&
    mesh?.visible === true &&
    mesh?.renderable === true &&
    Number(mesh.alpha) > 0
  );
}

function showSoundwaveRenderSurface(target) {
  if (!target) return;
  if ('visible' in target) target.visible = true;
  if ('renderable' in target) target.renderable = true;
  if (target.mesh) {
    // A detection-filter mesh renders the waves. Showing the primary mesh here reveals the full
    // token art in darkness underneath/over the waves.
    if ('visible' in target.mesh) target.mesh.visible = false;
    if ('renderable' in target.mesh) target.mesh.renderable = false;
  }
  setSoundwaveMeshVisible(target, true);
}

function showControlledTokenFullArt(target) {
  if (!target) return;
  removeSoundwaveFilterOverride(target);
  try {
    target.detectionFilter = null;
  } catch {
    /* leave Core's filter state intact if assignment fails */
  }
  if ('visible' in target) target.visible = true;
  if ('renderable' in target) target.renderable = true;
  if (target.mesh) {
    if ('visible' in target.mesh) target.mesh.visible = true;
    if ('renderable' in target.mesh) target.mesh.renderable = true;
  }
  setSoundwaveMeshVisible(target, false);
}

export function rememberSoundwaveDetectionBeforeCoreRefresh(target) {
  if (isSceneTokenVisionDisabled()) return;
  if (!target) return;
  if (target.detectionFilter === getSoundwaveFilter()) {
    previouslySoundwaveDetectedTargets.add(target);
  } else if (!target.controlled) {
    const visuallyObserved = currentViewVisionerObserversForTarget(target).some(
      (observer) => observer !== target && observerSightContainsTarget(observer, target),
    );
    if (visuallyObserved) previouslySoundwaveDetectedTargets.delete(target);
  }
}

export function installSoundwaveFilterOverride(target) {
  const id = target?.document?.id;
  const filter = getSoundwaveFilter();
  if (!id || !filter) return false;
  previouslySoundwaveDetectedTargets.add(target);
  if (filterOverrides.has(target)) return false;
  const state = { stored: target.detectionFilter ?? null };
  try {
    Object.defineProperty(target, 'detectionFilter', {
      configurable: true,
      enumerable: true,
      get() {
        return state.stored || filter;
      },
      set(value) {
        state.stored = value;
      },
    });
  } catch {
    return false;
  }
  filterOverrides.set(target, { target, state });
  return true;
}

export function removeSoundwaveFilterOverride(target) {
  if (!target) return false;
  const entry = filterOverrides.get(target);
  if (!entry) return false;
  filterOverrides.delete(target);
  try {
    delete entry.target.detectionFilter;
    entry.target.detectionFilter = entry.state.stored ?? null;
  } catch {
    /* leave rendering to Foundry if the property restore fails */
  }
  reconcileRenderSurfaceAfterSoundwave(entry.target);
  return true;
}

export function settleSoundwaveOverrides() {
  if (isSceneTokenVisionDisabled()) {
    clearDuringMoveSoundwaveState();
    return;
  }
  if (filterOverrides.size === 0) return;
  for (const entry of [...filterOverrides.values()]) {
    const target = entry.target;
    const observers = currentViewVisionerObserversForTarget(target).filter(
      (observer) => !isPartyActorToken(observer),
    );
    // Foundry's own visibility recompute has produced a real filter (persisted settled to a
    // hidden-render state) -> hand off; the getter was already returning `stored`, so the ripple
    // continues seamlessly with no 'observed' frame.
    if (entry.state.stored) {
      removeSoundwaveFilterOverride(target);
      continue;
    }
    // Target is back in an observer's sight -> it should render observed; drop the override.
    const backInSight = observers.some(
      (observer) => observer !== target && observerSightContainsTarget(observer, target),
    );
    if (backInSight) {
      removeSoundwaveFilterOverride(target);
    }
    // else: the settle recompute has not landed yet - keep the ripple so there is no flash.
  }
  if (++settleTicks >= MAX_SETTLE_TICKS) clearDuringMoveSoundwaveState();
}

export function clearDuringMoveSoundwaveState() {
  for (const entry of filterOverrides.values()) {
    try {
      delete entry.target.detectionFilter;
      entry.target.detectionFilter = entry.state.stored ?? null;
    } catch {
      /* best-effort restore */
    }
    reconcileRenderSurfaceAfterSoundwave(entry.target);
  }
  filterOverrides.clear();
  senseMemo.clear();
  lastWaveComputeAt = 0;
  settleTicks = 0;
}

export function refreshSoundwavesForActiveMovement() {
  if (isSceneTokenVisionDisabled()) {
    clearDuringMoveSoundwaveState();
    return;
  }
  const pendingMovementActive = hasActivePendingTokenMovement();
  // Controlled movers are interaction surfaces, not detection results. Keep their primary art
  // visible during selection, drag, and committed movement; soundwaves only describe other tokens.
  for (const target of globalThis.canvas?.tokens?.placeables ?? []) {
    if (target.controlled) showControlledTokenFullArt(target);
  }
  // Foundry moves a preview clone during drag. It follows the same full-art controlled-token rule.
  for (const preview of globalThis.canvas?.tokens?.preview?.children ?? []) {
    if (preview?._original?.controlled) showControlledTokenFullArt(preview);
  }

  // Only mutate soundwaves during an actual committed move. While merely hold-dragging
  // (a drag preview exists but nothing has committed yet) the visuals stay frozen.
  if (!pendingMovementActive) return;
  const gmVisionBypass = shouldBypassAvsForGmVision();

  // Foundry can replace or hide the detection-filter mesh every frame. Reassert existing
  // soundwaves cheaply without rediscovering observers for every token.
  for (const { target } of filterOverrides.values()) {
    showSoundwaveRenderSurface(target);
  }

  const now = globalThis.performance?.now?.() ?? 0;
  const recomputeDue = now - lastWaveComputeAt >= WAVE_RECOMPUTE_INTERVAL_MS;

  // Observer discovery is expensive. GM Vision cleanup stays unthrottled because Core can
  // repaint a soundwave during the throttle window and it must be removed immediately.
  if (!recomputeDue && !gmVisionBypass) return;

  const targetsWithObservers = [];
  for (const target of globalThis.canvas?.tokens?.placeables ?? []) {
    if (isPartyActorToken(target)) continue;
    if (target.controlled) {
      showControlledTokenFullArt(target);
      continue;
    }
    const hardHiddenFromStoredState = targetIsHardHiddenFromCurrentView(target);
    if (hardHiddenFromStoredState && !filterOverrides.has(target)) continue;
    const observers = currentViewVisionerObserversForTarget(target).filter(
      (observer) => !isPartyActorToken(observer),
    );
    if (gmVisionBypass && observers.length === 0) {
      try {
        removeSoundwaveFilterOverride(target);
        if (target.detectionFilter) target.detectionFilter = null;
        setSoundwaveMeshVisible(target, false);
      } catch {
        /* keep core filter state if the clear fails */
      }
      continue;
    }
    targetsWithObservers.push({ target, observers });
  }
  if (targetsWithObservers.length === 0 || !recomputeDue) return;
  lastWaveComputeAt = now;
  for (const { target, observers } of targetsWithObservers) {
    const activeCoreSoundwave = hasActiveCoreSoundwaveSurface(target);
    // Core already has the correct filtered render surface for stored-hidden targets in darkness.
    // Preserve it only while no observer has effective live sight. The persisted state is frozen
    // during movement, so using `hidden` alone would keep a stale Core ripple after LOS opens.
    if (
      !gmVisionBypass &&
      activeCoreSoundwave &&
      observers.length > 0 &&
      observers.every(
        (observer) =>
          getVisionerVisibilityBetweenTokens(observer, target) === 'hidden' &&
          !observerSightContainsTarget(observer, target),
      )
    )
      continue;
    const wantsSoundwave = targetShouldShowSoundwave(
      target,
      observers,
      undefined,
      undefined,
      memoImpreciselySensed,
    );
    const hasLiveSight = observers.some(
      (observer) => observer !== target && observerSightContainsTarget(observer, target),
    );
    try {
      if (wantsSoundwave) {
        installSoundwaveFilterOverride(target);
        showSoundwaveRenderSurface(target);
      } else {
        removeSoundwaveFilterOverride(target);
        if (target.detectionFilter) target.detectionFilter = null;
        setSoundwaveMeshVisible(target, false);
        if (hasLiveSight) releaseCurrentViewHardHideForLiveSight(target);
        reconcileRenderSurfaceAfterSoundwave(target);
      }
    } catch {
      /* keep core filter state if assignment fails */
    }
  }
}

export function ensureDuringMoveSoundwaveRefresh() {
  if (isSceneTokenVisionDisabled()) {
    clearDuringMoveSoundwaveState();
    return;
  }
  if (running) return;
  if (!isAvsActiveGivenCombatGate()) return;
  const raf = globalThis.requestAnimationFrame;
  if (typeof raf !== 'function') return;
  running = true;
  const tick = () => {
    const moving = isMovementOrDragActive();
    // Keep ticking past move-end while overrides are still handing off to Foundry's own rendering.
    if (!moving && filterOverrides.size === 0) {
      running = false;
      clearDuringMoveSoundwaveState();
      return;
    }
    try {
      if (moving) {
        settleTicks = 0;
        refreshSoundwavesForActiveMovement();
      } else {
        settleSoundwaveOverrides();
      }
    } catch {
      /* keep core visibility if the soundwave refresh fails */
    }
    raf(tick);
  };
  raf(tick);
}

export function startDuringMoveSoundwaveOnDrag(wrapped, ...args) {
  if (isSceneTokenVisionDisabled()) return wrapped(...args);
  try {
    ensureDuringMoveSoundwaveRefresh();
  } catch {
    /* never block the drag handler */
  }
  return wrapped(...args);
}
