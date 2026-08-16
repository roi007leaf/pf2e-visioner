import { MODULE_ID } from '../../constants.js';
import { hasActivePendingTokenMovement } from '../movement-tracking.js';
import { shouldBypassAvsForGmVision } from '../gm-vision-bypass.js';
import { isSceneTokenVisionDisabled } from '../scene-token-vision.js';
import { currentViewHardHideSurfaces } from './current-view-hard-hide-surfaces.js';
import { legacyLevelsFloorBlocksSightBetween } from './legacy-levels-live-sight.js';
import { isSelectAllTokenVisibilityBypassActive } from './select-all-token-visibility-bypass.js';
import {
  getVisionerVisibilityBetweenTokens,
  isAvsActiveGivenCombatGate,
} from './detection-visibility-context.js';
import { getDetectionSetting } from './detection-setting-cache.js';
import {
  tokenIsOutsideControlledLevelCullingSurface,
  usesCoreMultiLevelSurfaceRendering,
} from './multi-level-control-view.js';

export { usesCoreMultiLevelSurfaceRendering } from './multi-level-control-view.js';

const RENDER_HIDDEN_FROM_OBSERVER_STATES = new Set(['undetected', 'unnoticed']);
const HIDDEN_STATE_RENDER_HIDDEN_ACTOR_TYPES = new Set(['hazard', 'loot']);
const MOVEMENT_REVEAL_SETTLE_TTL_MS = 3000;

// Stored AVS states intentionally remain frozen during movement. Remember targets Core revealed
// from the live LOS result so the stale stored Undetected state cannot hide them for one frame (or
// longer) between movement tracking ending and the AVS batch settling.
let movementCoreVisibleReveals = new WeakMap();

let storedVisibilityOverrideForTest = null;
export function __setStoredVisibilityForTest(map) {
  storedVisibilityOverrideForTest = map;
}

function tokenIdOf(token) {
  return token?.document?.id ?? token?.id ?? null;
}

export function currentViewObservers() {
  const observers = [];
  const seen = new Set();
  const add = (token) => {
    const id = tokenIdOf(token);
    if (!id || seen.has(id)) return;
    seen.add(id);
    observers.push(token);
  };
  add(globalThis.canvas?.tokens?._draggedToken);
  for (const token of globalThis.canvas?.tokens?.controlled || []) add(token);
  return observers;
}

export function currentViewVisionerObserversForTarget(target) {
  if (isSceneTokenVisionDisabled()) return [];
  if (shouldBypassAvsForGmVision()) return [];
  return currentViewObservers();
}

function actorOf(target) {
  return target?.actor ?? null;
}

function getStoredVisibilityState(observer, target) {
  if (storedVisibilityOverrideForTest) {
    return (
      storedVisibilityOverrideForTest.get(`${tokenIdOf(observer)}:${tokenIdOf(target)}`) ||
      'observed'
    );
  }
  return getVisionerVisibilityBetweenTokens(observer, target) || 'observed';
}

function hiddenStateShouldRenderHideTarget(target) {
  if (!target) return false;
  const actorType = String(actorOf(target)?.type ?? '').toLowerCase();
  return HIDDEN_STATE_RENDER_HIDDEN_ACTOR_TYPES.has(actorType);
}

export function shouldBlockPlayerHoverForCurrentView(
  target,
  user = globalThis.game?.user,
) {
  if (!target || user?.isGM) return false;
  if (target._pvCurrentViewHardHidden === true) return true;
  if (!hiddenStateShouldRenderHideTarget(target)) return false;
  return targetIsHardHiddenFromCurrentView(target);
}

export function wrapTokenCanHover(wrapped, user, event) {
  if (shouldBlockPlayerHoverForCurrentView(this, user)) return false;
  return wrapped(user, event);
}

export function wrapTokenHoverIn(wrapped, event, options) {
  if (shouldBlockPlayerHoverForCurrentView(this)) return false;
  return wrapped(event, options);
}

function visionerStateHidesTargetRendering(state, target) {
  if (RENDER_HIDDEN_FROM_OBSERVER_STATES.has(state)) return true;
  return state === 'hidden' && hiddenStateShouldRenderHideTarget(target);
}

function foundryHiddenRequiresVisionerRenderLock(target) {
  if (!target?.document?.hidden) return false;
  if (!globalThis.game?.user?.isGM) return true;
  return currentViewObservers().length > 0;
}

const HARD_HIDDEN_CHROME_KEY = '_pvHardHiddenChromeVisibility';
const HARD_HIDDEN_INTERACTION_KEY = '_pvHardHiddenInteractionState';
const HARD_HIDDEN_HIT_AREA = Object.freeze({ contains: () => false });

function hideHardHiddenChromeSurfaces(token) {
  const captured = token[HARD_HIDDEN_CHROME_KEY] ?? [];
  const capturedSurfaces = new Set(captured.map((entry) => entry.surface));
  for (const surface of currentViewHardHideSurfaces(token)) {
    if (capturedSurfaces.has(surface)) continue;
    captured.push({ surface, visible: surface.visible });
    capturedSurfaces.add(surface);
  }
  for (const entry of captured) entry.surface.visible = false;
  token[HARD_HIDDEN_CHROME_KEY] = captured;
}

function restoreHardHiddenChromeSurfaces(token) {
  const captured = token?.[HARD_HIDDEN_CHROME_KEY];
  if (!captured) return;
  for (const entry of captured) {
    try {
      if (entry.surface && 'visible' in entry.surface) entry.surface.visible = entry.visible;
    } catch {
      /* best-effort chrome restore */
    }
  }
  try {
    delete token[HARD_HIDDEN_CHROME_KEY];
  } catch {
    token[HARD_HIDDEN_CHROME_KEY] = null;
  }
}

function disableHardHiddenInteraction(token) {
  if (!token[HARD_HIDDEN_INTERACTION_KEY]) {
    token[HARD_HIDDEN_INTERACTION_KEY] = {
      eventMode: token.eventMode,
      cursor: token.cursor,
      hitArea: token.hitArea,
      interactiveChildren: token.interactiveChildren,
    };
  }
  token.eventMode = 'none';
  token.cursor = 'default';
  token.hitArea = HARD_HIDDEN_HIT_AREA;
  token.interactiveChildren = false;
}

function restoreHardHiddenInteraction(token) {
  const captured = token?.[HARD_HIDDEN_INTERACTION_KEY];
  if (!captured) return false;
  // Core can rebuild token interaction while Visioner's render lock is active, most notably when
  // a token hidden at scene load is revealed for the first time. Preserve any values Core already
  // restored; replace only the exact disabled values still owned by Visioner.
  if (token.eventMode === 'none') token.eventMode = captured.eventMode;
  if (token.cursor === 'default') token.cursor = captured.cursor;
  if (token.hitArea === HARD_HIDDEN_HIT_AREA || token.hitArea == null) {
    // Core-hidden tokens can be captured before Core assigns their normal interactive hit area.
    token.hitArea = captured.hitArea ?? token.shape ?? null;
  }
  if (token.interactiveChildren === false) {
    token.interactiveChildren = captured.interactiveChildren;
  }
  try {
    delete token[HARD_HIDDEN_INTERACTION_KEY];
  } catch {
    token[HARD_HIDDEN_INTERACTION_KEY] = null;
  }
  return true;
}

function hasUndetectedAvsOverride(observer, target) {
  try {
    const observerId = tokenIdOf(observer);
    if (!observerId) return false;
    const state = target?.document?.getFlag?.(MODULE_ID, `avs-override-from-${observerId}`)?.state;
    return state === 'undetected' || state === 'unnoticed';
  } catch {
    return false;
  }
}

function automaticVisionerVisibilityIsActive() {
  try {
    if (isSceneTokenVisionDisabled()) return false;
    if (globalThis.canvas?.scene?.getFlag?.(MODULE_ID, 'disableAVS') === true) return false;
    return getDetectionSetting('autoVisibilityEnabled') !== false && isAvsActiveGivenCombatGate();
  } catch {
    return true;
  }
}

function hasActiveCurrentViewTokenMovement() {
  if (hasActivePendingTokenMovement()) return true;
  const tokens = globalThis.canvas?.tokens;
  if (tokens?._draggedToken) return true;
  const previews = tokens?.preview?.children;
  return !!(previews && previews.some?.((entry) => entry?.document?.id));
}

function shouldDeferRenderingToCoreDuringMove(target) {
  if (!hasActiveCurrentViewTokenMovement()) return false;
  if (!target?.document?.id) return false;
  if (target.controlled) return false;
  if (isSelectAllTokenVisibilityBypassActive()) return false;
  if (target.document.hidden) return false;
  if (hiddenStateShouldRenderHideTarget(target)) return false;

  const observers = currentViewVisionerObserversForTarget(target);
  if (observers.length === 0) return false;

  let deferrable = false;
  for (const observer of observers) {
    if (tokenIdOf(observer) === tokenIdOf(target)) continue;
    const state = getStoredVisibilityState(observer, target);
    if (!RENDER_HIDDEN_FROM_OBSERVER_STATES.has(state)) continue;
    if (hasUndetectedAvsOverride(observer, target)) return false;
    if (!legacyLevelsFloorBlocksSightBetween(observer, target)) deferrable = true;
  }
  return deferrable;
}

function rememberMovementCoreReveal(target, coreVisible) {
  if (!target) return;
  if (!coreVisible) {
    movementCoreVisibleReveals.delete(target);
    return;
  }
  movementCoreVisibleReveals.set(target, Date.now() + MOVEMENT_REVEAL_SETTLE_TTL_MS);
}

function shouldPreserveMovementCoreReveal(target) {
  const expiresAt = movementCoreVisibleReveals.get(target);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    movementCoreVisibleReveals.delete(target);
    return false;
  }
  const observers = currentViewVisionerObserversForTarget(target);
  if (observers.some((observer) => hasUndetectedAvsOverride(observer, target))) {
    movementCoreVisibleReveals.delete(target);
    return false;
  }
  if (
    observers.length > 0 &&
    observers.every((observer) => legacyLevelsFloorBlocksSightBetween(observer, target))
  ) {
    movementCoreVisibleReveals.delete(target);
    return false;
  }
  return true;
}

export function clearCurrentViewMovementRenderSettles() {
  movementCoreVisibleReveals = new WeakMap();
}

export function applyCurrentViewHardHide(token) {
  const shouldDefer = shouldDeferRenderingToCoreDuringMove(token);
  if (shouldDefer) {
    rememberMovementCoreReveal(token, token.visible === true);
    let released = false;
    if (token.visible) {
      released = releaseCurrentViewHardHide(token);
      if (released || !hasCurrentViewHardHideRenderState(token)) {
        token._pvCurrentViewHardHidden = false;
      }
    }
    return false;
  }
  const shouldHardHide = targetIsHardHiddenFromCurrentView(token);
  if (shouldHardHide && shouldPreserveMovementCoreReveal(token)) {
    releaseCurrentViewHardHideForLiveSight(token);
    return false;
  }
  if (!shouldHardHide) {
    movementCoreVisibleReveals.delete(token);
    if (globalThis.game?.user?.isGM && token.document?.hidden) {
      releaseCurrentViewHardHide(token);
      token._pvCurrentViewHardHidden = false;
    } else {
      releaseCurrentViewHardHideIfMarked(token);
    }
    return false;
  }
  const preserveCoreRenderState = usesCoreMultiLevelSurfaceRendering();
  if (!preserveCoreRenderState) {
    token.visible = false;
    token.renderable = false;
  }
  if (token.mesh) {
    token.mesh.visible = false;
    if (!preserveCoreRenderState) {
      if ('renderable' in token.mesh) token.mesh.renderable = false;
      if ('alpha' in token.mesh) token.mesh.alpha = 0;
    }
  }
  token.detectionFilter = null;
  hideHardHiddenChromeSurfaces(token);
  disableHardHiddenInteraction(token);
  token._pvCurrentViewHardHidden = true;
  return true;
}

export function releaseCurrentViewHardHideIfMarked(token) {
  if (!token?._pvCurrentViewHardHidden) return false;
  if (targetIsHardHiddenFromCurrentView(token)) return false;
  const automaticActive = automaticVisionerVisibilityIsActive();
  if (!automaticActive && token.visible === false) return false;
  const released = releaseCurrentViewHardHide(token);
  if (released || !hasCurrentViewHardHideRenderState(token)) {
    token._pvCurrentViewHardHidden = false;
  }
  return released;
}

function hasCurrentViewHardHideRenderState(token) {
  const mesh = token?.mesh;
  return (
    token?.renderable === false ||
    mesh?.visible === false ||
    mesh?.renderable === false ||
    (mesh && mesh.alpha === 0)
  );
}

export function releaseCurrentViewHardHide(token) {
  if (!token) return false;
  if (token.controlled) {
    restoreHardHiddenInteraction(token);
    return false;
  }
  const mesh = token.mesh;
  if (!hasCurrentViewHardHideRenderState(token)) return restoreHardHiddenInteraction(token);
  if ('visible' in token) token.visible = true;
  if ('renderable' in token) token.renderable = true;
  const detectionFilterOwnsRenderSurface = !!token.detectionFilter;
  if (mesh) {
    if ('visible' in mesh) mesh.visible = !detectionFilterOwnsRenderSurface;
    if ('renderable' in mesh) mesh.renderable = !detectionFilterOwnsRenderSurface;
    if ('alpha' in mesh) mesh.alpha = token.document?.hidden ? 0.5 : 1;
  }
  if (!detectionFilterOwnsRenderSurface) restoreHardHiddenChromeSurfaces(token);
  restoreHardHiddenInteraction(token);
  return true;
}

export function releaseCurrentViewHardHideForLiveSight(token) {
  if (!token) return false;
  let released = releaseCurrentViewHardHide(token);
  if (!token.controlled && !token.detectionFilter) {
    const mesh = token.mesh;
    if (token.visible !== true) {
      token.visible = true;
      released = true;
    }
    if (token.renderable !== true) {
      token.renderable = true;
      released = true;
    }
    if (mesh) {
      if ('visible' in mesh && mesh.visible !== true) {
        mesh.visible = true;
        released = true;
      }
      if ('renderable' in mesh && mesh.renderable !== true) {
        mesh.renderable = true;
        released = true;
      }
      if ('alpha' in mesh) mesh.alpha = token.document?.hidden ? 0.5 : 1;
    }
  }
  restoreHardHiddenChromeSurfaces(token);
  restoreHardHiddenInteraction(token);
  token._pvCurrentViewHardHidden = false;
  return released;
}

export function releaseAllCurrentViewHardHide(
  tokens = globalThis.canvas?.tokens?.placeables ?? [],
) {
  let released = 0;
  for (const token of tokens ?? []) {
    if (releaseCurrentViewHardHide(token)) released += 1;
  }
  return released;
}

export function targetIsHardHiddenFromCurrentView(target) {
  if (!target?.document?.id) return false;
  if (isSceneTokenVisionDisabled()) return false;
  if (isSelectAllTokenVisibilityBypassActive()) return false;
  if (target.controlled) return false;
  if (foundryHiddenRequiresVisionerRenderLock(target)) return true;
  // Core multi-level culling applies only where a level surface exists. Outside those surfaces,
  // the token remains part of the unrestricted scene view and AVS must not hide its render art.
  if (tokenIsOutsideControlledLevelCullingSurface(target)) return false;

  const automaticVisibilityActive = automaticVisionerVisibilityIsActive();
  const observers = currentViewVisionerObserversForTarget(target);
  if (observers.length === 0) {
    if (globalThis.game?.user?.isGM || !automaticVisibilityActive) return false;
    return !!target._pvCurrentViewHardHidden;
  }

  for (const observer of observers) {
    if (tokenIdOf(observer) === tokenIdOf(target)) continue;
    const state = getStoredVisibilityState(observer, target);
    if (!visionerStateHidesTargetRendering(state, target)) continue;
    if (automaticVisibilityActive || hasUndetectedAvsOverride(observer, target)) return true;
  }
  return false;
}
