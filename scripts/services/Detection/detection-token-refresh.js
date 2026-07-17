import { shouldBypassAvsForGmVision } from '../gm-vision-bypass.js';
import { hasActivePendingTokenMovement } from '../movement-tracking.js';
import { applyCurrentViewHardHide } from './current-view-hard-hide.js';

function renderState(token) {
  if (!token?.document?.hidden) return null;
  return {
    visible: token.visible,
    renderable: token.renderable,
    meshVisible: token.mesh?.visible,
    meshRenderable: token.mesh?.renderable,
    meshAlpha: token.mesh?.alpha,
    hardHidden: token._pvCurrentViewHardHidden,
  };
}

function restoreRenderState(token, state) {
  if ('visible' in token) token.visible = state.visible;
  if ('renderable' in token) token.renderable = state.renderable;
  if (!token.mesh) return;
  if ('visible' in token.mesh) token.mesh.visible = state.meshVisible;
  if ('renderable' in token.mesh) token.mesh.renderable = state.meshRenderable;
  if ('alpha' in token.mesh) token.mesh.alpha = state.meshAlpha;
}

function suppressNewFoundryHiddenVisibilityDuringMove(token, before) {
  if (!before) return false;
  if (!globalThis.game?.user?.isGM || !hasActivePendingTokenMovement()) return false;
  if (token.controlled || before.visible !== false || token.visible !== true) return false;
  if (token._pvCurrentViewHardHidden === false) return false;
  restoreRenderState(token, before);
  return true;
}

function afterCoreRefresh(token, before) {
  if (!shouldBypassAvsForGmVision()) {
    suppressNewFoundryHiddenVisibilityDuringMove(token, before);
  }
  try {
    applyCurrentViewHardHide(token);
  } catch {
    /* keep Foundry visibility if the guard fails */
  }
}

export function wrapTokenRefreshState(wrapped, ...args) {
  const before = renderState(this);
  const result = wrapped(...args);
  afterCoreRefresh(this, before);
  return result;
}

export function wrapTokenApplyRenderFlags(wrapped, ...args) {
  const before = renderState(this);
  const result = wrapped(...args);
  afterCoreRefresh(this, before);
  return result;
}

export function wrapTokenRefreshVisibility(wrapped, ...args) {
  const before = renderState(this);
  const result = wrapped(...args);
  afterCoreRefresh(this, before);
  return result;
}
