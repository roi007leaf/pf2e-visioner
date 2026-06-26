import { shouldBypassAvsForGmVision } from '../gm-vision-bypass.js';
import { isSelectAllTokenVisibilityBypassActive } from './select-all-token-visibility-bypass.js';
import { getVisionerVisibilityBetweenTokens } from './detection-visibility-context.js';

const RENDER_HIDDEN_FROM_OBSERVER_STATES = new Set(['undetected', 'unnoticed']);
const HIDDEN_STATE_RENDER_HIDDEN_ACTOR_TYPES = new Set(['hazard', 'loot']);

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

export function applyCurrentViewHardHide(token) {
  if (!targetIsHardHiddenFromCurrentView(token)) return false;
  token.visible = false;
  token.renderable = false;
  if (token.mesh) {
    token.mesh.visible = false;
    if ('renderable' in token.mesh) token.mesh.renderable = false;
    if ('alpha' in token.mesh) token.mesh.alpha = 0;
  }
  token.detectionFilter = null;
  return true;
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

  for (const observer of currentViewObservers()) {
    if (tokenIdOf(observer) === tokenIdOf(target)) continue;
    const state = getStoredVisibilityState(observer, target);
    if (visionerStateHidesTargetRendering(state, target)) return true;
  }
  return false;
}
