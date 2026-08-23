import { MODULE_ID } from '../../constants.js';
import { scheduleCanvasPerceptionUpdate } from '../../helpers/perception-refresh.js';
import { getCachedSettingValue } from '../../utils/setting-value-cache.js';
import { resolveGmObserverTokenPresentation } from './gm-observer-view-policy.js';

const SETTING_KEY = 'gmObserverView';
const DARKNESS_STRENGTH_SETTING_KEY = 'gmObserverViewDarknessOpacity';
const DEFAULT_DARKNESS_STRENGTH = 0.7;
const TOKEN_PRESENTATION_KEY = '_pvGmObserverViewPresentation';
const MODE_INDICATOR_ID = 'pf2e-visioner-gm-observer-indicator';
const MODE_INDICATOR_POSITION_KEY = 'pf2e-visioner-gm-observer-indicator-pos';
const MODE_INDICATOR_DRAG_THRESHOLD = 4;
const ACTIVE_BODY_CLASS = 'pf2e-visioner-gm-observer-view-active';
const HIDDEN_FILTER_UNIFORMS = Object.freeze({
  stripeColor: [1, 0.4, 0],
  outlineColor: [1, 0.4, 0],
  stripeOpacity: 0,
  muteAmount: 0.25,
  brightness: 0.82,
});
const UNDETECTED_FILTER_UNIFORMS = Object.freeze({
  stripeColor: [0.9569, 0.2627, 0.2118],
  outlineColor: [0.9569, 0.2627, 0.2118],
  stripeOpacity: 0.24,
  muteAmount: 0.45,
  brightness: 0.72,
});
const UNNOTICED_FILTER_UNIFORMS = Object.freeze({
  stripeColor: [0.6118, 0.1529, 0.6902],
  outlineColor: [0.6118, 0.1529, 0.6902],
  stripeOpacity: 0.24,
  muteAmount: 0.45,
  brightness: 0.72,
});
const STATE_FILTER_UNIFORMS = Object.freeze({
  hidden: HIDDEN_FILTER_UNIFORMS,
  undetected: UNDETECTED_FILTER_UNIFORMS,
  unnoticed: UNNOTICED_FILTER_UNIFORMS,
});
const STATE_INTERFACE_OUTLINE_COLORS = Object.freeze({
  hidden: 0xff6600,
  undetected: 0xf44336,
  unnoticed: 0x9c27b0,
});
const INTERFACE_HATCH_STYLE = Object.freeze({
  opacity: 0.58,
  spacing: 16,
  width: 0.16,
  keylineOpacity: 0.34,
  keylineWidth: 0.32,
  highlightMix: 0.18,
});

let presentedTokens = new Set();
let tokenPresentationStates = new WeakMap();
let ownedTokenFilters = new WeakMap();
let ownedTokenOutlines = new WeakMap();
let hatchFilterClass = null;
let interfaceHatchFilterClass = null;
let darknessColorState = null;
let primaryVisionModeState = null;
let modeIndicatorCleanup = null;

function observerDarknessStrength() {
  const configured = Number(
    getCachedSettingValue(DARKNESS_STRENGTH_SETTING_KEY, DEFAULT_DARKNESS_STRENGTH),
  );
  if (!Number.isFinite(configured)) return DEFAULT_DARKNESS_STRENGTH;
  return Math.min(1, Math.max(0, configured));
}

function rgbColorNumber(value, fallback) {
  if (typeof value === 'string') {
    const match = value.trim().match(/^#?([0-9a-f]{6})$/i);
    if (match) return Number.parseInt(match[1], 16);
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(0xffffff, Math.max(0, Math.round(numeric)));
}

function mixRgbColors(fromColor, toColor, amount) {
  const from = rgbColorNumber(fromColor, 0xd1d1ff);
  const to = rgbColorNumber(toColor, from);
  const mix = Math.min(1, Math.max(0, Number(amount) || 0));
  const channel = (shift) =>
    Math.round(((from >> shift) & 0xff) * (1 - mix) + ((to >> shift) & 0xff) * mix);
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

function hasCurrentObservers() {
  const tokens = globalThis.canvas?.tokens;
  return !!tokens?._draggedToken || (tokens?.controlled?.length ?? 0) > 0;
}

function isPreviewToken(token) {
  return !!(
    token?._original ||
    token?._previewType ||
    token?.isPreview ||
    token?.document?.isPreview
  );
}

function isTokenCulled(token) {
  try {
    return typeof token?._testCulled === 'function' && token._testCulled() === true;
  } catch {
    return false;
  }
}

function getHatchFilterClass() {
  const BaseFilter = globalThis.foundry?.canvas?.rendering?.filters?.AbstractBaseFilter;
  if (!BaseFilter) return null;
  if (hatchFilterClass?.__pvBaseFilter === BaseFilter) return hatchFilterClass;

  hatchFilterClass = class GmObserverHatchFilter extends BaseFilter {
    static __pvBaseFilter = BaseFilter;

    static get defaultUniforms() {
      return {
        uSampler: null,
        ...UNDETECTED_FILTER_UNIFORMS,
        stripeSpacing: 18,
        stripeWidth: 0.09,
      };
    }

    static _createFragmentShader() {
      const precision = globalThis.PIXI?.Program?.defaultFragmentPrecision ?? 'mediump';
      return `
        precision ${precision} float;
        varying vec2 vTextureCoord;
        uniform sampler2D uSampler;
        uniform vec4 inputSize;
        uniform vec3 stripeColor;
        uniform vec3 outlineColor;
        uniform float stripeOpacity;
        uniform float stripeSpacing;
        uniform float stripeWidth;
        uniform float muteAmount;
        uniform float brightness;

        void main() {
          vec4 baseColor = texture2D(uSampler, vTextureCoord);
          vec2 pixel = vTextureCoord * inputSize.xy;
          vec2 texel = 1.35 / max(inputSize.xy, vec2(1.0));
          float nearbyAlpha = baseColor.a;
          nearbyAlpha = max(nearbyAlpha, texture2D(uSampler, vTextureCoord + vec2(texel.x, 0.0)).a);
          nearbyAlpha = max(nearbyAlpha, texture2D(uSampler, vTextureCoord - vec2(texel.x, 0.0)).a);
          nearbyAlpha = max(nearbyAlpha, texture2D(uSampler, vTextureCoord + vec2(0.0, texel.y)).a);
          nearbyAlpha = max(nearbyAlpha, texture2D(uSampler, vTextureCoord - vec2(0.0, texel.y)).a);
          nearbyAlpha = max(nearbyAlpha, texture2D(uSampler, vTextureCoord + texel).a);
          nearbyAlpha = max(nearbyAlpha, texture2D(uSampler, vTextureCoord - texel).a);
          nearbyAlpha = max(nearbyAlpha, texture2D(uSampler, vTextureCoord + vec2(texel.x, -texel.y)).a);
          nearbyAlpha = max(nearbyAlpha, texture2D(uSampler, vTextureCoord + vec2(-texel.x, texel.y)).a);

          float outline = smoothstep(0.04, 0.45, nearbyAlpha - baseColor.a) * 0.55;
          float hatch = step(
            1.0 - stripeWidth,
            fract((pixel.x + pixel.y) / stripeSpacing)
          ) * baseColor.a;
          float luminance = dot(baseColor.rgb, vec3(0.299, 0.587, 0.114));
          vec3 muted = mix(baseColor.rgb, vec3(luminance), muteAmount) * brightness;
          vec3 marked = mix(muted, outlineColor, 0.04 * baseColor.a);
          marked = mix(marked, stripeColor, hatch * stripeOpacity);
          vec3 outputColor = mix(marked, outlineColor, outline);
          gl_FragColor = vec4(outputColor, max(baseColor.a * 0.9, outline));
        }
      `;
    }
  };
  return hatchFilterClass;
}

function getInterfaceHatchFilterClass() {
  const BaseFilter = globalThis.foundry?.canvas?.rendering?.filters?.AbstractBaseFilter;
  if (!BaseFilter) return null;
  if (interfaceHatchFilterClass?.__pvBaseFilter === BaseFilter) {
    return interfaceHatchFilterClass;
  }

  interfaceHatchFilterClass = class GmObserverInterfaceHatchFilter extends BaseFilter {
    static __pvBaseFilter = BaseFilter;

    static get defaultUniforms() {
      return {
        uSampler: null,
        stripeColor: UNDETECTED_FILTER_UNIFORMS.stripeColor,
        stripeOpacity: INTERFACE_HATCH_STYLE.opacity,
        stripeSpacing: INTERFACE_HATCH_STYLE.spacing,
        stripeWidth: INTERFACE_HATCH_STYLE.width,
        keylineOpacity: INTERFACE_HATCH_STYLE.keylineOpacity,
        keylineWidth: INTERFACE_HATCH_STYLE.keylineWidth,
        highlightMix: INTERFACE_HATCH_STYLE.highlightMix,
      };
    }

    static _createFragmentShader() {
      const precision = globalThis.PIXI?.Program?.defaultFragmentPrecision ?? 'mediump';
      return `
        precision ${precision} float;
        varying vec2 vTextureCoord;
        uniform sampler2D uSampler;
        uniform vec4 inputSize;
        uniform vec3 stripeColor;
        uniform float stripeOpacity;
        uniform float stripeSpacing;
        uniform float stripeWidth;
        uniform float keylineOpacity;
        uniform float keylineWidth;
        uniform float highlightMix;

        void main() {
          float tokenAlpha = texture2D(uSampler, vTextureCoord).a;
          vec2 pixel = vTextureCoord * inputSize.xy;
          float phase = fract((pixel.x + pixel.y) / stripeSpacing);
          float tokenMask = smoothstep(0.04, 0.45, tokenAlpha);
          float keyline = step(
            1.0 - keylineWidth,
            phase
          ) * tokenMask;
          float hatch = step(
            1.0 - stripeWidth,
            phase
          ) * tokenMask;
          float keylineAlpha = keyline * keylineOpacity;
          float hatchAlpha = hatch * stripeOpacity;
          vec3 accentColor = mix(stripeColor, vec3(1.0), highlightMix);
          vec4 backing = vec4(vec3(0.015) * keylineAlpha, keylineAlpha);
          vec4 accent = vec4(accentColor * hatchAlpha, hatchAlpha);
          gl_FragColor = accent + (backing * (1.0 - accent.a));
        }
      `;
    }
  };
  return interfaceHatchFilterClass;
}

function removeOwnedFilter(token, { destroy = false } = {}) {
  const owned = ownedTokenFilters.get(token);
  if (!owned) return false;
  const filters = owned.mesh?.filters;
  if (Array.isArray(filters)) {
    const index = filters.indexOf(owned.filter);
    if (index >= 0) filters.splice(index, 1);
  }
  if (destroy) {
    try {
      owned.filter?.destroy?.();
    } catch {
      /* best-effort GPU cleanup */
    }
    ownedTokenFilters.delete(token);
  }
  return true;
}

function removeOwnedOutline(token, { destroy = false } = {}) {
  const owned = ownedTokenOutlines.get(token);
  if (!owned) return false;
  try {
    owned.container?.parent?.removeChild?.(owned.container);
  } catch {
    /* token may already be destroyed */
  }
  if (destroy) {
    try {
      owned.outlineFilter?.destroy?.();
      owned.hatchFilter?.destroy?.();
      owned.container?.destroy?.();
    } catch {
      /* best-effort GPU cleanup */
    }
    ownedTokenOutlines.delete(token);
  }
  return true;
}

function renderTokenMeshWithFilter(mesh, filter, renderer) {
  if (!mesh || !filter || typeof mesh.render !== 'function') return;
  const originalFilters = mesh.filters;
  const originalTint = mesh.tint;
  const originalWorldAlpha = mesh.worldAlpha;
  const originalPluginName = mesh.pluginName;
  const pluginName =
    globalThis.foundry?.canvas?.rendering?.shaders?.BaseSamplerShader?.classPluginName;

  try {
    mesh.filters = [filter];
    mesh.tint = 0xffffff;
    mesh.worldAlpha = 1;
    if (pluginName) mesh.pluginName = pluginName;
    mesh.render(renderer);
  } finally {
    mesh.filters = originalFilters;
    mesh.tint = originalTint;
    mesh.worldAlpha = originalWorldAlpha;
    mesh.pluginName = originalPluginName;
  }
}

function colorNumberToRgba(color) {
  return [((color >> 16) & 0xff) / 255, ((color >> 8) & 0xff) / 255, (color & 0xff) / 255, 1];
}

function colorNumberToRgb(color) {
  return colorNumberToRgba(color).slice(0, 3);
}

function attachOwnedOutline(token, presentation) {
  const color = STATE_INTERFACE_OUTLINE_COLORS[presentation];
  const Container = globalThis.PIXI?.Container;
  const FilterClass =
    globalThis.foundry?.canvas?.rendering?.filters?.OutlineOverlayFilter;
  const HatchFilterClass = getInterfaceHatchFilterClass();
  const mesh = token?.mesh;
  if (
    color === undefined ||
    !Container ||
    !FilterClass ||
    !HatchFilterClass ||
    !mesh ||
    typeof token?.addChild !== 'function'
  ) {
    removeOwnedOutline(token);
    return null;
  }

  let owned = ownedTokenOutlines.get(token);
  if (owned?.mesh !== mesh || owned?.container?.destroyed) {
    removeOwnedOutline(token, { destroy: true });
    owned = null;
  }
  if (!owned) {
    const outlineFilter = FilterClass.create({
      outlineColor: colorNumberToRgba(color),
      knockout: true,
      wave: false,
    });
    outlineFilter.animated = false;
    outlineFilter.thickness = 2;
    const hatchFilter = HatchFilterClass.create({});

    const container = new Container();
    container.name = 'PF2E Visioner GM Observer State Outline';
    container.updateTransform = () => {};
    container.render = (renderer) => {
      if (Number(hatchFilter.uniforms.stripeOpacity) > 0) {
        renderTokenMeshWithFilter(mesh, hatchFilter, renderer);
      }
      renderTokenMeshWithFilter(mesh, outlineFilter, renderer);
    };
    container._pvStateOutlineFilter = outlineFilter;
    container._pvStateHatchFilter = hatchFilter;
    owned = { container, outlineFilter, hatchFilter, mesh };
    ownedTokenOutlines.set(token, owned);
  }

  try {
    const showHatch = (STATE_FILTER_UNIFORMS[presentation]?.stripeOpacity ?? 0) > 0;
    Object.assign(owned.outlineFilter.uniforms, {
      outlineColor: colorNumberToRgba(color),
      knockout: true,
      wave: false,
    });
    Object.assign(owned.hatchFilter.uniforms, {
      stripeColor: colorNumberToRgb(color),
      stripeOpacity: showHatch ? INTERFACE_HATCH_STYLE.opacity : 0,
      stripeSpacing: INTERFACE_HATCH_STYLE.spacing,
      stripeWidth: INTERFACE_HATCH_STYLE.width,
      keylineOpacity: showHatch ? INTERFACE_HATCH_STYLE.keylineOpacity : 0,
      keylineWidth: INTERFACE_HATCH_STYLE.keylineWidth,
      highlightMix: INTERFACE_HATCH_STYLE.highlightMix,
    });
    if (owned.container.parent !== token) token.addChild(owned.container);
    owned.container.eventMode = 'none';
    owned.container.interactive = false;
    owned.container.alpha = 1;
    owned.container.visible = true;
    owned.container.renderable = true;
    // Core soundwaves retain priority at zIndex 0; hover/selection borders remain above both.
    owned.container.zIndex = -0.5;
    return owned.container;
  } catch {
    removeOwnedOutline(token, { destroy: true });
    return null;
  }
}

function attachOwnedFilter(token, presentation) {
  const mesh = token?.mesh;
  if (!mesh) return null;

  let owned = ownedTokenFilters.get(token);
  if (owned?.mesh !== mesh) {
    removeOwnedFilter(token, { destroy: true });
    owned = null;
  }

  if (!owned) {
    const FilterClass = getHatchFilterClass();
    if (!FilterClass) return null;
    owned = { mesh, filter: FilterClass.create({}) };
    owned.filter.padding = 5;
    ownedTokenFilters.set(token, owned);
  }

  mesh.filters ??= [];
  if (!mesh.filters.includes(owned.filter)) mesh.filters.push(owned.filter);
  Object.assign(
    owned.filter.uniforms,
    STATE_FILTER_UNIFORMS[presentation] ?? UNDETECTED_FILTER_UNIFORMS,
  );
  owned.filter.enabled = true;
  return owned.filter;
}

function captureOwnedChange(changes, surface, property, forced) {
  if (!surface || !(property in surface)) return;
  changes.push({ surface, property, original: surface[property], forced });
  surface[property] = forced;
}

function hasActiveSoundwaveSurface(token) {
  const filter = token?.detectionFilter;
  const mesh = token?.detectionFilterMesh;
  if (
    !filter ||
    mesh?.visible !== true ||
    mesh?.renderable !== true ||
    Number(mesh?.alpha ?? 1) <= 0
  )
    return false;

  const modes = globalThis.CONFIG?.Canvas?.detectionModes ?? {};
  for (const modeId of ['hearing', 'feelTremor']) {
    try {
      if (modes[modeId]?.constructor?.getDetectionFilter?.() === filter) return true;
    } catch {
      /* unavailable detection mode */
    }
  }
  return false;
}

function restoreTokenPresentation(token) {
  const state = tokenPresentationStates.get(token);
  if (state) {
    for (const change of state.changes) {
      try {
        if (change.surface?.[change.property] === change.forced) {
          change.surface[change.property] = change.original;
        }
      } catch {
        /* surface may have been destroyed by Core */
      }
    }
  }

  removeOwnedFilter(token);
  removeOwnedOutline(token);
  tokenPresentationStates.delete(token);
  presentedTokens.delete(token);
  try {
    delete token[TOKEN_PRESENTATION_KEY];
  } catch {
    token[TOKEN_PRESENTATION_KEY] = null;
  }
  return !!state;
}

function forceTokenArtVisible(token, { presentation }) {
  const changes = [];
  const preserveSoundwave = hasActiveSoundwaveSurface(token);
  captureOwnedChange(changes, token, 'visible', true);
  captureOwnedChange(changes, token, 'renderable', true);
  captureOwnedChange(changes, token?.mesh, 'visible', true);
  captureOwnedChange(changes, token?.mesh, 'renderable', true);
  captureOwnedChange(changes, token?.mesh, 'alpha', token?.document?.hidden ? 0.5 : 1);
  if (!preserveSoundwave) {
    captureOwnedChange(changes, token?.detectionFilterMesh, 'visible', false);
    captureOwnedChange(changes, token?.detectionFilterMesh, 'renderable', false);
  }

  if (STATE_FILTER_UNIFORMS[presentation]) {
    attachOwnedFilter(token, presentation);
    attachOwnedOutline(token, presentation);
  } else {
    removeOwnedFilter(token, { destroy: true });
    removeOwnedOutline(token, { destroy: true });
  }

  tokenPresentationStates.set(token, { changes });
  presentedTokens.add(token);
  token[TOKEN_PRESENTATION_KEY] = presentation;
}

function expectedCoreVisibilityGroupState() {
  const canvas = globalThis.canvas;
  if (!canvas?.scene?.tokenVision) return false;
  if (!globalThis.game?.user?.isGM) return true;
  return !!canvas.effects?.visionSources?.some?.((source) => source?.active);
}

function restorePrimaryVisionModePresentation() {
  if (!primaryVisionModeState) return;
  try {
    if (primaryVisionModeState.uniforms?.saturation === 0) {
      primaryVisionModeState.uniforms.saturation = primaryVisionModeState.saturation;
    }
  } catch {
    /* primary shader may already have been replaced or destroyed */
  }
  primaryVisionModeState = null;
}

function syncPrimaryVisionModePresentation() {
  const canvas = globalThis.canvas;
  const source = canvas?.visibility?.visionModeData?.source;
  const uniforms = canvas?.primary?.sprite?.shader?.uniforms;
  if (source?.visionMode?.id !== 'darkvision' || !uniforms || !('saturation' in uniforms)) {
    restorePrimaryVisionModePresentation();
    return false;
  }

  if (primaryVisionModeState?.uniforms !== uniforms) {
    restorePrimaryVisionModePresentation();
    primaryVisionModeState = { uniforms, saturation: uniforms.saturation };
  }

  // PF2e's monochrome darkvision is a final Primary-canvas shader, so it otherwise desaturates
  // Observer View's token-only hatch and outline after those markings have rendered.
  uniforms.saturation = 0;
  return true;
}

function restoreCanvasPresentation() {
  restorePrimaryVisionModePresentation();
  const visibility = globalThis.canvas?.visibility;
  if (visibility && 'visible' in visibility) {
    visibility.visible = expectedCoreVisibilityGroupState();
  }

  if (darknessColorState) {
    try {
      if (
        darknessColorState.config?.darknessColor === darknessColorState.appliedColor &&
        darknessColorState.appliedColor !== darknessColorState.originalColor
      ) {
        darknessColorState.config.darknessColor = darknessColorState.originalColor;
        globalThis.canvas?.environment?.initialize?.();
      }
    } catch {
      /* canvas may already be torn down */
    }
    darknessColorState = null;
  }
}

function syncDarknessColor() {
  const config = globalThis.CONFIG?.Canvas;
  if (!config || !('darknessColor' in config)) return;
  const observerColor = globalThis.CONFIG?.PF2E?.Canvas?.darkness?.gmVision ?? 0xd1d1ff;

  if (darknessColorState?.config !== config) {
    darknessColorState = {
      config,
      originalColor: config.darknessColor,
      appliedColor: null,
    };
  } else if (config.darknessColor !== darknessColorState.appliedColor) {
    // Respect a new base color supplied by Core, PF2e, or another module while active.
    darknessColorState.originalColor = config.darknessColor;
  }

  const appliedColor = mixRgbColors(
    observerColor,
    darknessColorState.originalColor,
    observerDarknessStrength(),
  );
  darknessColorState.appliedColor = appliedColor;
  if (config.darknessColor === appliedColor) return;

  config.darknessColor = appliedColor;
  try {
    globalThis.canvas?.environment?.initialize?.();
  } catch {
    /* environment may still be drawing */
  }
}

function syncCanvasPresentation() {
  if (!gmObserverView.isActive()) {
    restoreCanvasPresentation();
    return false;
  }

  const visibility = globalThis.canvas?.visibility;
  if (visibility && 'visible' in visibility) visibility.visible = false;
  syncDarknessColor();
  syncPrimaryVisionModePresentation();
  return true;
}

function refreshSceneControls() {
  try {
    globalThis.ui?.controls?.render?.();
  } catch {
    /* scene controls may not be rendered */
  }
}

function localizeOrFallback(key, fallback) {
  const localized = globalThis.game?.i18n?.localize?.(key);
  return localized && localized !== key ? localized : fallback;
}

function parseIndicatorCoordinate(value) {
  const coordinate = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(coordinate) ? coordinate : null;
}

function clampIndicatorPosition(indicator, left, top) {
  const viewportWidth = globalThis.window?.innerWidth ?? 0;
  const viewportHeight = globalThis.window?.innerHeight ?? 0;
  const maxLeft = Math.max(0, viewportWidth - indicator.offsetWidth);
  const maxTop = Math.max(0, viewportHeight - indicator.offsetHeight);
  return {
    left: Math.max(0, Math.min(left, maxLeft)),
    top: Math.max(0, Math.min(top, maxTop)),
  };
}

function setIndicatorPosition(indicator, left, top) {
  const position = clampIndicatorPosition(indicator, left, top);
  indicator.style.left = `${position.left}px`;
  indicator.style.top = `${position.top}px`;
  indicator.style.transform = 'none';
  return position;
}

function restoreIndicatorPosition(indicator) {
  try {
    const saved = globalThis.localStorage?.getItem?.(MODE_INDICATOR_POSITION_KEY);
    if (!saved) return;
    const position = JSON.parse(saved);
    const left = parseIndicatorCoordinate(position?.left);
    const top = parseIndicatorCoordinate(position?.top);
    if (left !== null && top !== null) setIndicatorPosition(indicator, left, top);
  } catch {
    /* local storage may be unavailable */
  }
}

function saveIndicatorPosition(indicator) {
  const left = parseIndicatorCoordinate(indicator.style.left);
  const top = parseIndicatorCoordinate(indicator.style.top);
  if (left === null || top === null) return;

  try {
    globalThis.localStorage?.setItem?.(
      MODE_INDICATOR_POSITION_KEY,
      JSON.stringify({ left, top }),
    );
  } catch {
    /* local storage may be unavailable */
  }
}

function makeModeIndicatorDraggable(indicator) {
  const drag = {
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
    originLeft: 0,
    originTop: 0,
    currentLeft: 0,
    currentTop: 0,
    maxLeft: 0,
    maxTop: 0,
    resetTimer: null,
  };

  const resetMoved = () => {
    drag.moved = false;
    drag.resetTimer = null;
  };
  const onMouseDown = (event) => {
    if (event.button !== 0) return;
    if (drag.resetTimer) globalThis.clearTimeout(drag.resetTimer);
    drag.active = true;
    drag.moved = false;
    drag.startX = event.clientX;
    drag.startY = event.clientY;
    const bounds = indicator.getBoundingClientRect();
    drag.offsetX = event.clientX - bounds.left;
    drag.offsetY = event.clientY - bounds.top;
    drag.originLeft = bounds.left;
    drag.originTop = bounds.top;
    drag.currentLeft = bounds.left;
    drag.currentTop = bounds.top;
    drag.maxLeft = Math.max(0, (globalThis.window?.innerWidth ?? 0) - indicator.offsetWidth);
    drag.maxTop = Math.max(0, (globalThis.window?.innerHeight ?? 0) - indicator.offsetHeight);
    indicator.classList.add('dragging');
  };
  const onMouseMove = (event) => {
    if (!drag.active) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) > MODE_INDICATOR_DRAG_THRESHOLD) {
      drag.moved = true;
      const origin = setIndicatorPosition(indicator, drag.originLeft, drag.originTop);
      drag.originLeft = origin.left;
      drag.originTop = origin.top;
    }
    if (!drag.moved) return;
    event.preventDefault();
    drag.currentLeft = Math.max(0, Math.min(event.clientX - drag.offsetX, drag.maxLeft));
    drag.currentTop = Math.max(0, Math.min(event.clientY - drag.offsetY, drag.maxTop));
    indicator.style.transform = `translate3d(${drag.currentLeft - drag.originLeft}px, ${drag.currentTop - drag.originTop}px, 0)`;
  };
  const onMouseUp = () => {
    if (!drag.active) return;
    drag.active = false;
    indicator.classList.remove('dragging');
    if (!drag.moved) return;
    setIndicatorPosition(indicator, drag.currentLeft, drag.currentTop);
    saveIndicatorPosition(indicator);
    drag.resetTimer = globalThis.setTimeout(resetMoved, 50);
  };
  const onClick = (event) => {
    if (drag.moved) {
      event.preventDefault();
      event.stopPropagation();
      if (drag.resetTimer) globalThis.clearTimeout(drag.resetTimer);
      resetMoved();
      return;
    }
    gmObserverView.setEnabled(false);
  };
  const onResize = () => {
    const bounds = indicator.getBoundingClientRect();
    setIndicatorPosition(indicator, bounds.left, bounds.top);
    saveIndicatorPosition(indicator);
  };

  indicator.addEventListener('mousedown', onMouseDown);
  indicator.addEventListener('click', onClick);
  globalThis.document.addEventListener('mousemove', onMouseMove);
  globalThis.document.addEventListener('mouseup', onMouseUp);
  globalThis.window?.addEventListener?.('resize', onResize);
  restoreIndicatorPosition(indicator);

  return () => {
    if (drag.resetTimer) globalThis.clearTimeout(drag.resetTimer);
    indicator.removeEventListener('mousedown', onMouseDown);
    indicator.removeEventListener('click', onClick);
    globalThis.document.removeEventListener('mousemove', onMouseMove);
    globalThis.document.removeEventListener('mouseup', onMouseUp);
    globalThis.window?.removeEventListener?.('resize', onResize);
  };
}

function syncModeIndicator(active) {
  const document = globalThis.document;
  if (!document?.body) return;

  document.body.classList.toggle(ACTIVE_BODY_CLASS, active);
  const existing = document.getElementById(MODE_INDICATOR_ID);
  if (!active) {
    modeIndicatorCleanup?.();
    modeIndicatorCleanup = null;
    existing?.remove();
    return;
  }
  if (existing) return;

  const indicator = document.createElement('button');
  indicator.id = MODE_INDICATOR_ID;
  indicator.type = 'button';
  indicator.setAttribute('aria-pressed', 'true');
  indicator.title = localizeOrFallback(
    'PF2E_VISIONER.GM_OBSERVER_VIEW_INDICATOR.hint',
    'GM Observer View is active. Drag to move; click to disable.',
  );

  const icon = document.createElement('i');
  icon.className = 'fa-solid fa-eye';
  icon.setAttribute('aria-hidden', 'true');

  const label = document.createElement('span');
  label.className = 'pf2e-visioner-gm-observer-indicator-label';
  label.textContent = localizeOrFallback(
    'PF2E_VISIONER.GM_OBSERVER_VIEW_INDICATOR.label',
    'GM Observer View',
  );

  indicator.append(icon, label);
  document.body.appendChild(indicator);
  modeIndicatorCleanup = makeModeIndicatorDraggable(indicator);
}

function schedulePerceptionRefresh() {
  scheduleCanvasPerceptionUpdate({
    refreshVision: true,
    refreshOcclusion: true,
  });
}

async function disableCompetingGmVision() {
  try {
    if (globalThis.game?.settings?.get?.('pf2e', 'gmVision') === true) {
      await globalThis.game.settings.set('pf2e', 'gmVision', false);
    }
  } catch {
    /* PF2e GM Vision is unavailable */
  }

  try {
    const external = globalThis.game?.modules?.get?.('gm-vision');
    if (external?.active && globalThis.game?.settings?.get?.('gm-vision', 'active') === true) {
      await globalThis.game.settings.set('gm-vision', 'active', false);
    }
  } catch {
    /* external GM Vision is absent or has no active setting */
  }
}

export const gmObserverView = {
  isActive() {
    if (!globalThis.game?.user?.isGM || !globalThis.canvas?.ready) return false;
    if (globalThis.canvas?.scene?.tokenVision === false) return false;
    return getCachedSettingValue(SETTING_KEY, false) === true;
  },

  beforeCoreTokenRefresh(token) {
    return token ? restoreTokenPresentation(token) : false;
  },

  afterCoreTokenRefresh(token, { coreVisible = false, visionerState = null } = {}) {
    if (!token) return 'unchanged';
    restoreTokenPresentation(token);

    const presentation = resolveGmObserverTokenPresentation({
      active: this.isActive(),
      controlled: token.controlled === true,
      preview: isPreviewToken(token),
      filteredOut: token.isFilteredOut === true,
      culled: isTokenCulled(token),
      hasObservers: hasCurrentObservers(),
      coreVisible,
      visionerState,
    });
    if (presentation === 'unchanged') {
      removeOwnedFilter(token, { destroy: true });
      removeOwnedOutline(token, { destroy: true });
      return presentation;
    }

    forceTokenArtVisible(token, { presentation });
    return presentation;
  },

  syncCanvas() {
    return syncCanvasPresentation();
  },

  refresh({ perception = true } = {}) {
    if (!this.isActive()) this.clear({ restoreCanvas: true });
    else {
      syncCanvasPresentation();
      syncModeIndicator(true);
    }
    if (perception) schedulePerceptionRefresh();
    refreshSceneControls();
  },

  clear({ restoreCanvas = true } = {}) {
    for (const token of presentedTokens) {
      restoreTokenPresentation(token);
      removeOwnedFilter(token, { destroy: true });
      removeOwnedOutline(token, { destroy: true });
    }
    presentedTokens = new Set();
    tokenPresentationStates = new WeakMap();
    ownedTokenFilters = new WeakMap();
    ownedTokenOutlines = new WeakMap();
    syncModeIndicator(false);
    if (restoreCanvas) restoreCanvasPresentation();
    else primaryVisionModeState = null;
  },

  async setEnabled(enabled) {
    if (!globalThis.game?.user?.isGM) return false;
    if (enabled) await disableCompetingGmVision();
    await globalThis.game?.settings?.set?.(MODULE_ID, SETTING_KEY, !!enabled);
    this.refresh();
    return !!enabled;
  },

  async toggle() {
    return this.setEnabled(!this.isActive());
  },

  registerHooks() {
    if (globalThis.__pf2eVisionerGmObserverViewHooksRegistered) return;
    globalThis.__pf2eVisionerGmObserverViewHooksRegistered = true;

    globalThis.Hooks?.on?.('canvasReady', async () => {
      if (this.isActive()) await disableCompetingGmVision();
      this.refresh();
    });
    globalThis.Hooks?.on?.('sightRefresh', () => this.syncCanvas());
    globalThis.Hooks?.on?.('lightingRefresh', () => this.syncCanvas());
    globalThis.Hooks?.on?.('controlToken', () => {
      if (this.isActive()) this.refresh();
    });
    globalThis.Hooks?.on?.('canvasTearDown', () => this.clear({ restoreCanvas: false }));
  },
};
