import { shouldBypassAvsForGmVision } from '../gm-vision-bypass.js';
import { hasActivePendingTokenMovement } from '../movement-tracking.js';
import { isSceneTokenVisionDisabled } from '../scene-token-vision.js';
import {
  applyCurrentViewHardHide,
  usesCoreMultiLevelSurfaceRendering,
} from './current-view-hard-hide.js';
import {
  ensureDuringMoveSoundwaveRefresh,
  refreshSoundwavesForActiveMovement,
  rememberSoundwaveDetectionBeforeCoreRefresh,
} from '../during-move-soundwave.js';
import { withDetectionSettingCache } from './detection-setting-cache.js';
import { captureMultiLevelViewBeforeControl } from './multi-level-control-view.js';

const deferredCoreLevelHardHideTokens = new WeakSet();
const LEGACY_FILTERED_EFFECT_VISIBILITY_KEY = '_pvLegacyFilteredEffectVisibility';

function reconcileLegacyFilteredEffectVisibility(token) {
  const effects = token?.effects;
  if (!effects || !('visible' in effects)) return;

  if (token._pvCurrentViewHardHidden === true) {
    effects.visible = false;
    return;
  }

  const hasCapturedVisibility = Object.prototype.hasOwnProperty.call(
    token,
    LEGACY_FILTERED_EFFECT_VISIBILITY_KEY,
  );
  if (!token.controlled && token.detectionFilter) {
    if (!hasCapturedVisibility) {
      token[LEGACY_FILTERED_EFFECT_VISIBILITY_KEY] = effects.visible;
    }
    effects.visible = false;
    return;
  }

  if (!hasCapturedVisibility) return;
  const visible = token[LEGACY_FILTERED_EFFECT_VISIBILITY_KEY];
  try {
    delete token[LEGACY_FILTERED_EFFECT_VISIBILITY_KEY];
  } catch {
    token[LEGACY_FILTERED_EFFECT_VISIBILITY_KEY] = undefined;
  }
  effects.visible = visible;
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

function applyCurrentViewHardHideAfterCore(token) {
  if (!usesCoreMultiLevelSurfaceRendering()) {
    applyCurrentViewHardHide(token);
    return;
  }
  if (deferredCoreLevelHardHideTokens.has(token)) return;

  deferredCoreLevelHardHideTokens.add(token);
  const schedule = globalThis.queueMicrotask ?? ((callback) => Promise.resolve().then(callback));
  schedule(() => {
    deferredCoreLevelHardHideTokens.delete(token);
    try {
      applyCurrentViewHardHide(token);
    } catch {
      /* keep Core visibility if the deferred guard fails */
    }
  });
}

function afterCoreRefresh(token, before) {
  if (!shouldBypassAvsForGmVision()) {
    suppressNewFoundryHiddenVisibilityDuringMove(token, before);
  }
  try {
    applyCurrentViewHardHideAfterCore(token);
  } catch {
    /* keep Foundry visibility if the guard fails */
  }
  rememberSoundwaveDetectionBeforeCoreRefresh(token);
  // Token#_refreshVisibility forces a controlled token's primary mesh visible. Reassert the
  // remembered soundwave after Core has applied those flags so no full-art frame leaks through.
  refreshSoundwavesForActiveMovement();
}

export function wrapTokenRefreshState(wrapped, ...args) {
  if (isSceneTokenVisionDisabled()) return wrapped(...args);
  const before = renderState(this);
  const result = wrapped(...args);
  afterCoreRefresh(this, before);
  return result;
}

export function wrapTokenApplyRenderFlags(wrapped, ...args) {
  if (isSceneTokenVisionDisabled()) return wrapped(...args);
  const before = renderState(this);
  const result = wrapped(...args);
  afterCoreRefresh(this, before);
  reconcileLegacyFilteredEffectVisibility(this);
  return result;
}

export function wrapTokenRefreshVisibility(wrapped, ...args) {
  if (isSceneTokenVisionDisabled()) return wrapped(...args);
  return withDetectionSettingCache(() => {
    rememberSoundwaveDetectionBeforeCoreRefresh(this);
    const before = renderState(this);
    const result = wrapped(...args);
    afterCoreRefresh(this, before);
    return result;
  });
}

export function wrapTokenRefreshTooltip(wrapped, ...args) {
  const result = wrapped(...args);
  if (isSceneTokenVisionDisabled()) return result;
  try {
    applyCurrentViewHardHide(this);
    if (
      this.tooltip &&
      'visible' in this.tooltip &&
      (this._pvCurrentViewHardHidden === true || (!this.controlled && this.detectionFilter))
    ) {
      this.tooltip.visible = false;
    }
  } catch {
    /* keep Foundry tooltip visibility if the guard fails */
  }
  return result;
}

export function wrapTokenControl(wrapped, ...args) {
  if (isSceneTokenVisionDisabled()) return wrapped(...args);
  captureMultiLevelViewBeforeControl(this);
  rememberSoundwaveDetectionBeforeCoreRefresh(this);
  const result = wrapped(...args);
  refreshSoundwavesForActiveMovement();
  ensureDuringMoveSoundwaveRefresh();
  return result;
}
