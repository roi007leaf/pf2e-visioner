import { MODULE_ID } from '../../constants.js';
import { hasActivePendingTokenMovement } from '../movement-tracking.js';
import { shouldBypassAvsForGmVision } from '../gm-vision-bypass.js';
import { isSelectAllTokenVisibilityBypassActive } from './select-all-token-visibility-bypass.js';
import { getVisionerVisibilityBetweenTokens } from './detection-visibility-context.js';

const RENDER_HIDDEN_FROM_OBSERVER_STATES = new Set(['undetected', 'unnoticed']);
const HIDDEN_STATE_RENDER_HIDDEN_ACTOR_TYPES = new Set(['hazard', 'loot']);

let storedVisibilityOverrideForTest = null;
export function __setStoredVisibilityForTest(map) {
  storedVisibilityOverrideForTest = map;
}

const foundryHiddenDebugStates = new Map();

function debugFoundryHiddenTarget(token, phase, details = {}) {
  if (!globalThis.game?.ready || !token?.document?.hidden) return;
  const state = {
    phase,
    tokenId: tokenIdOf(token),
    tokenName: token.name,
    activeMovement: hasActivePendingTokenMovement(),
    visible: token.visible,
    renderable: token.renderable,
    meshVisible: token.mesh?.visible,
    meshRenderable: token.mesh?.renderable,
    meshAlpha: token.mesh?.alpha,
    hardHidden: token._pvCurrentViewHardHidden,
    ...details,
  };
  const key = `${state.tokenId}:${phase}`;
  const signature = JSON.stringify(state);
  if (foundryHiddenDebugStates.get(key) === signature) return;
  foundryHiddenDebugStates.set(key, signature);
  console.warn('[DEBUG-hiddentoken-a91f]', JSON.stringify(state));
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

function actorOf(target) {
  return target?.actor ?? null;
}

function getStoredVisibilityState(observer, target) {
  if (storedVisibilityOverrideForTest) {
    return storedVisibilityOverrideForTest.get(`${tokenIdOf(observer)}:${tokenIdOf(target)}`) || 'observed';
  }
  return getVisionerVisibilityBetweenTokens(observer, target) || 'observed';
}

function hiddenStateShouldRenderHideTarget(target) {
  if (!target) return false;
  const actorType = String(actorOf(target)?.type ?? '').toLowerCase();
  return HIDDEN_STATE_RENDER_HIDDEN_ACTOR_TYPES.has(actorType);
}

function visionerStateHidesTargetRendering(state, target) {
  if (RENDER_HIDDEN_FROM_OBSERVER_STATES.has(state)) return true;
  return state === 'hidden' && hiddenStateShouldRenderHideTarget(target);
}

function foundryHiddenRequiresVisionerRenderLock(target) {
  return !!target?.document?.hidden && !globalThis.game?.user?.isGM;
}

const HARD_HIDDEN_CHROME_KEY = '_pvHardHiddenChromeVisibility';

function hardHiddenChromeSurfaces(token) {
  return [
    token?.effects,
    token?.nameplate,
    token?.bars,
    token?.tooltip,
    token?.levelIndicator,
    token?.targetArrows,
    token?.targetPips,
    token?.turnMarker,
    token?.turnMarker?.mesh,
  ].filter((surface) => surface && 'visible' in surface);
}

function hideHardHiddenChromeSurfaces(token) {
  const existing = token[HARD_HIDDEN_CHROME_KEY];
  if (existing) {
    for (const entry of existing) {
      if (entry.surface && 'visible' in entry.surface) entry.surface.visible = false;
    }
    return;
  }
  const captured = hardHiddenChromeSurfaces(token).map((surface) => ({
    surface,
    visible: surface.visible,
  }));
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

function shouldDeferRenderingToCoreDuringMove(target) {
  if (!hasActivePendingTokenMovement()) return false;
  if (!target?.document?.id) return false;
  if (target.controlled) return false;
  if (shouldBypassAvsForGmVision()) return false;
  if (isSelectAllTokenVisibilityBypassActive()) return false;
  if (target.document.hidden) return false;
  if (hiddenStateShouldRenderHideTarget(target)) return false;

  const observers = currentViewObservers();
  if (observers.length === 0) return false;

  let deferrable = false;
  for (const observer of observers) {
    if (tokenIdOf(observer) === tokenIdOf(target)) continue;
    const state = getStoredVisibilityState(observer, target);
    if (!RENDER_HIDDEN_FROM_OBSERVER_STATES.has(state)) continue;
    if (hasUndetectedAvsOverride(observer, target)) return false;
    deferrable = true;
  }
  return deferrable;
}

export function applyCurrentViewHardHide(token) {
  const shouldDefer = shouldDeferRenderingToCoreDuringMove(token);
  if (shouldDefer) {
    debugFoundryHiddenTarget(token, 'defer-to-core');
    if (token.visible) releaseCurrentViewHardHide(token);
    token._pvCurrentViewHardHidden = false;
    return false;
  }
  const shouldHardHide = targetIsHardHiddenFromCurrentView(token);
  debugFoundryHiddenTarget(token, 'hard-hide-decision', {
    shouldDefer,
    shouldHardHide,
    observerStates: currentViewObservers().map((observer) => ({
      observerId: tokenIdOf(observer),
      observerName: observer.name,
      state: getStoredVisibilityState(observer, token),
    })),
  });
  if (!shouldHardHide) {
    releaseCurrentViewHardHideIfMarked(token);
    return false;
  }
  token.visible = false;
  token.renderable = false;
  if (token.mesh) {
    token.mesh.visible = false;
    if ('renderable' in token.mesh) token.mesh.renderable = false;
    if ('alpha' in token.mesh) token.mesh.alpha = 0;
  }
  token.detectionFilter = null;
  hideHardHiddenChromeSurfaces(token);
  token._pvCurrentViewHardHidden = true;
  debugFoundryHiddenTarget(token, 'hard-hide-applied');
  return true;
}

export function releaseCurrentViewHardHideIfMarked(token) {
  if (!token?._pvCurrentViewHardHidden) return false;
  if (targetIsHardHiddenFromCurrentView(token)) return false;
  const released = releaseCurrentViewHardHide(token);
  token._pvCurrentViewHardHidden = false;
  return released;
}

export function releaseCurrentViewHardHide(token) {
  if (!token || token.controlled) return false;
  const mesh = token.mesh;
  const wasHardHidden =
    token.renderable === false || mesh?.visible === false || (mesh && mesh.alpha === 0);
  if (!wasHardHidden) return false;
  if ('renderable' in token) token.renderable = true;
  if (mesh) {
    if ('visible' in mesh) mesh.visible = true;
    if ('renderable' in mesh) mesh.renderable = true;
    if ('alpha' in mesh) mesh.alpha = token.document?.hidden ? 0.5 : 1;
  }
  restoreHardHiddenChromeSurfaces(token);
  debugFoundryHiddenTarget(token, 'hard-hide-released', {
    caller: new Error().stack?.split('\n').slice(2, 6).join(' | '),
  });
  return true;
}

export function releaseAllCurrentViewHardHide(tokens = globalThis.canvas?.tokens?.placeables ?? []) {
  let released = 0;
  for (const token of tokens ?? []) {
    if (releaseCurrentViewHardHide(token)) released += 1;
  }
  return released;
}

export function targetIsHardHiddenFromCurrentView(target) {
  if (!target?.document?.id) return false;
  if (shouldBypassAvsForGmVision()) return false;
  if (isSelectAllTokenVisibilityBypassActive()) return false;
  if (target.controlled) return false;
  if (foundryHiddenRequiresVisionerRenderLock(target)) return true;

  const observers = currentViewObservers();
  if (observers.length === 0) {
    if (globalThis.game?.user?.isGM) return false;
    return !!target._pvCurrentViewHardHidden;
  }

  for (const observer of observers) {
    if (tokenIdOf(observer) === tokenIdOf(target)) continue;
    const state = getStoredVisibilityState(observer, target);
    if (visionerStateHidesTargetRendering(state, target)) return true;
  }
  return false;
}
