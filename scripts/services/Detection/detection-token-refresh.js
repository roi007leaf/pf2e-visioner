import { shouldBypassAvsForGmVision } from '../gm-vision-bypass.js';
import { hasActivePendingTokenMovement } from '../movement-tracking.js';
import { applyCurrentViewHardHide } from './current-view-hard-hide.js';

const foundryHiddenRefreshDebugStates = new Map();

function debugFoundryHiddenRefresh(token, phase, details) {
  if (!globalThis.game?.ready) return;
  const state = {
    phase,
    tokenId: token.document?.id,
    tokenName: token.name,
    ...details,
  };
  const key = `${state.tokenId}:${phase}`;
  const signature = JSON.stringify(state);
  if (foundryHiddenRefreshDebugStates.get(key) === signature) return;
  foundryHiddenRefreshDebugStates.set(key, signature);
  console.warn('[DEBUG-hiddentoken-a91f]', signature);
}

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

function debugCoreRefreshChange(token, method, before) {
  if (!globalThis.game?.ready || !before) return;
  const after = renderState(token);
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  debugFoundryHiddenRefresh(token, 'core-refresh-write', { method, before, after });
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
  restoreRenderState(token, before);
  debugFoundryHiddenRefresh(token, 'movement-reveal-suppressed', { restored: before });
  return true;
}

function afterCoreRefresh(token, method, before) {
  debugCoreRefreshChange(token, method, before);
  suppressNewFoundryHiddenVisibilityDuringMove(token, before);
  try {
    applyCurrentViewHardHide(token);
  } catch {
    /* keep Foundry visibility if the guard fails */
  }
}

export function wrapTokenRefreshState(wrapped, ...args) {
  const before = renderState(this);
  const result = wrapped(...args);
  if (!shouldBypassAvsForGmVision()) afterCoreRefresh(this, '_refreshState', before);
  return result;
}

export function wrapTokenApplyRenderFlags(wrapped, ...args) {
  const before = renderState(this);
  const result = wrapped(...args);
  if (!shouldBypassAvsForGmVision()) afterCoreRefresh(this, '_applyRenderFlags', before);
  return result;
}

export function wrapTokenRefreshVisibility(wrapped, ...args) {
  const before = renderState(this);
  const result = wrapped(...args);
  if (!shouldBypassAvsForGmVision()) afterCoreRefresh(this, '_refreshVisibility', before);
  return result;
}
