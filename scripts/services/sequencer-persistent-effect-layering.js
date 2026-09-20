import { MODULE_ID } from '../constants.js';
import { shouldBypassAvsForGmVision } from './gm-vision-bypass.js';
import { isSceneTokenVisionDisabled } from './scene-token-vision.js';
import { isSelectAllTokenVisibilityBypassActive } from './Detection/select-all-token-visibility-bypass.js';

const trackedEffects = new Map();
let hooksRegistered = false;

function defaultTokenSortLayer() {
  return globalThis.foundry?.canvas?.groups?.PrimaryCanvasGroup?.SORT_LAYERS?.TOKENS ?? 700;
}

function defaultEffects() {
  try {
    return globalThis.Sequencer?.EffectManager?.effects ?? [];
  } catch {
    return [];
  }
}

function defaultAvsEnabled() {
  try {
    if (!globalThis.game?.settings?.get?.(MODULE_ID, 'autoVisibilityEnabled')) return false;
    if (globalThis.canvas?.scene?.getFlag?.(MODULE_ID, 'disableAVS')) return false;
    if (!globalThis.game?.settings?.get?.(MODULE_ID, 'avsOnlyInCombat')) return true;
    return !!(globalThis.game?.combat?.started && globalThis.game?.combat?.combatants?.size > 0);
  } catch {
    return false;
  }
}

function restoreVoidProxy(state) {
  const proxy = state?.voidProxy;
  if (!proxy || proxy.destroyed) return;
  try {
    if (proxy.renderable === false) proxy.renderable = state.voidProxyRenderable;
  } catch {
    /* Sequencer may destroy its interface proxy before ending the effect. */
  }
}

function suppressVoidProxy(effect, state) {
  const proxy = effect?._voidProxy;
  if (!proxy || proxy.destroyed) return;
  if (state.voidProxy !== proxy) {
    restoreVoidProxy(state);
    state.voidProxy = proxy;
    state.voidProxyRenderable = proxy.renderable;
  }
  proxy.renderable = false;
}

function restoreEffect(effect, state) {
  if (!effect || effect.destroyed) return;
  try {
    effect.elevation = state.elevation;
    effect.sortLayer = state.sortLayer;
    if (effect.parent) effect.parent.sortDirty = true;
  } catch {
    /* Sequencer effect may have been destroyed between hook and cleanup. */
  }
  restoreVoidProxy(state);
}

function stopTracking(effect, { restore = true, restoreSortLayer = restore } = {}) {
  if (!trackedEffects.has(effect)) return;
  const state = trackedEffects.get(effect);
  trackedEffects.delete(effect);
  if (restoreSortLayer) restoreEffect(effect, state);
  else if (restore) restoreVoidProxy(state);
}

function isPrimaryPersistentEffect(effect, primaryGroup) {
  return !!effect?.data?.persist && !!primaryGroup && effect.parent === primaryGroup;
}

function tokenElevation(token) {
  const elevation = token?.mesh?.elevation ?? token?.document?.elevation ?? token?.elevation ?? 0;
  return Number.isFinite(elevation) ? elevation : 0;
}

function effectIsAboveTokens(elevation, sortLayer, observerElevation, tokenSortLayer) {
  return (
    elevation > observerElevation ||
    (elevation === observerElevation && sortLayer >= tokenSortLayer)
  );
}

function applyLoweredOrdering(effect, state, observerElevation, tokenSortLayer) {
  const elevation = Math.min(state.elevation, observerElevation);
  const sortLayer =
    elevation === observerElevation && state.sortLayer >= tokenSortLayer
      ? tokenSortLayer - 1
      : state.sortLayer;
  effect.elevation = elevation;
  effect.sortLayer = sortLayer;
  state.appliedElevation = elevation;
  state.appliedSortLayer = sortLayer;
  if (effect.parent) effect.parent.sortDirty = true;
}

/**
 * Put persistent, primary-layer Sequencer effects below token art while Visioner is
 * presenting a selected observer's AVS view. Sequencer v4 also installs an interface
 * ERASE proxy so effects punch through region highlights; suppress it here so it cannot
 * erase token borders, names, or Visioner's state contours above the lowered effect.
 * Visioner already suppresses Hidden and Undetected token bodies, so this reveals only
 * Observed/Concealed art.
 */
export function refreshPersistentSequencerEffectLayering(options = {}) {
  const effects = options.effects ?? defaultEffects();
  const controlledTokens = options.controlledTokens ?? globalThis.canvas?.tokens?.controlled ?? [];
  const primaryGroup = options.primaryGroup ?? globalThis.canvas?.primary ?? null;
  const tokenSortLayer = options.tokenSortLayer ?? defaultTokenSortLayer();
  const avsEnabled = options.avsEnabled ?? defaultAvsEnabled();
  const tokenVisionEnabled = options.tokenVisionEnabled ?? !isSceneTokenVisionDisabled();
  const bypassAvs =
    options.bypassAvs ?? (shouldBypassAvsForGmVision() || isSelectAllTokenVisibilityBypassActive());
  const active = controlledTokens.length > 0 && avsEnabled && tokenVisionEnabled && !bypassAvs;
  const observerElevation = Math.min(...controlledTokens.map(tokenElevation));
  const currentEffects = new Set(effects);

  for (const [effect, state] of trackedEffects) {
    const remainsEligible =
      active && currentEffects.has(effect) && isPrimaryPersistentEffect(effect, primaryGroup);
    if (!remainsEligible) {
      stopTracking(effect, { restore: currentEffects.has(effect) });
      continue;
    }

    if (effect.elevation !== state.appliedElevation) state.elevation = effect.elevation;
    if (effect.sortLayer !== state.appliedSortLayer) {
      state.sortLayer = effect.sortLayer;
    }
    if (!effectIsAboveTokens(state.elevation, state.sortLayer, observerElevation, tokenSortLayer)) {
      stopTracking(effect, { restore: true, restoreSortLayer: false });
      continue;
    }
    applyLoweredOrdering(effect, state, observerElevation, tokenSortLayer);
    suppressVoidProxy(effect, state);
  }

  if (!active) return { active: false, adjusted: 0 };

  let adjusted = 0;
  for (const effect of effects) {
    if (!isPrimaryPersistentEffect(effect, primaryGroup)) continue;
    if (trackedEffects.has(effect)) {
      adjusted += 1;
      continue;
    }
    const elevation = Number.isFinite(effect.elevation) ? effect.elevation : 0;
    if (!Number.isFinite(effect.sortLayer)) continue;
    if (!effectIsAboveTokens(elevation, effect.sortLayer, observerElevation, tokenSortLayer)) continue;

    const state = {
      elevation,
      sortLayer: effect.sortLayer,
      appliedElevation: elevation,
      appliedSortLayer: effect.sortLayer,
      voidProxy: null,
      voidProxyRenderable: undefined,
    };
    trackedEffects.set(effect, state);
    applyLoweredOrdering(effect, state, observerElevation, tokenSortLayer);
    suppressVoidProxy(effect, state);
    adjusted += 1;
  }

  return { active: true, adjusted };
}

export function clearPersistentSequencerEffectLayering() {
  for (const [effect, state] of trackedEffects) {
    restoreEffect(effect, state);
  }
  trackedEffects.clear();
}

function queueLayerRefresh() {
  queueMicrotask(() => refreshPersistentSequencerEffectLayering());
}

export function registerPersistentSequencerEffectLayeringHooks() {
  if (hooksRegistered || !globalThis.Hooks?.on) return;
  hooksRegistered = true;

  Hooks.on('canvasReady', queueLayerRefresh);
  Hooks.on('controlToken', queueLayerRefresh);
  Hooks.on('sequencerEffectManagerReady', queueLayerRefresh);
  Hooks.on('createSequencerEffect', queueLayerRefresh);
  Hooks.on('updateSequencerEffect', queueLayerRefresh);
  Hooks.on('endedSequencerEffect', queueLayerRefresh);
  Hooks.on('updateSetting', (setting) => {
    if (
      setting?.key === `${MODULE_ID}.autoVisibilityEnabled` ||
      setting?.key === `${MODULE_ID}.avsOnlyInCombat`
    ) {
      queueLayerRefresh();
    }
  });
  Hooks.on('updateScene', (scene) => {
    if (scene === globalThis.canvas?.scene) queueLayerRefresh();
  });
  Hooks.on('combatStart', queueLayerRefresh);
  Hooks.on('combatEnd', queueLayerRefresh);
  Hooks.on('canvasTearDown', clearPersistentSequencerEffectLayering);
}
