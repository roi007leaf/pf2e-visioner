import { MODULE_ID } from '../../constants.js';
import { scheduleCanvasPerceptionUpdate } from '../../helpers/perception-refresh.js';
import { getCachedSettingValue } from '../../utils/setting-value-cache.js';
import { resolveGmObserverTokenPresentation } from './gm-observer-view-policy.js';

const SETTING_KEY = 'gmObserverView';
const DARKNESS_ALPHA = 0.5;
const TOKEN_PRESENTATION_KEY = '_pvGmObserverViewPresentation';
const MODE_INDICATOR_ID = 'pf2e-visioner-gm-observer-indicator';
const MODE_INDICATOR_POSITION_KEY = 'pf2e-visioner-gm-observer-indicator-pos';
const MODE_INDICATOR_DRAG_THRESHOLD = 4;
const ACTIVE_BODY_CLASS = 'pf2e-visioner-gm-observer-view-active';

let presentedTokens = new Set();
let tokenPresentationStates = new WeakMap();
let ownedTokenFilters = new WeakMap();
let hatchFilterClass = null;
let darknessState = null;
let darknessColorState = null;
let primaryVisionModeState = null;
let modeIndicatorCleanup = null;

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
        stripeColor: [1, 0.7, 0.2],
        outlineColor: [1, 0.28, 0.12],
        stripeOpacity: 0.24,
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
          vec3 muted = mix(baseColor.rgb, vec3(luminance), 0.45) * 0.72;
          vec3 marked = mix(muted, vec3(0.45, 0.12, 0.035), 0.08 * baseColor.a);
          marked = mix(marked, stripeColor, hatch * stripeOpacity);
          vec3 outputColor = mix(marked, outlineColor, outline);
          gl_FragColor = vec4(outputColor, max(baseColor.a * 0.9, outline));
        }
      `;
    }
  };
  return hatchFilterClass;
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

function attachOwnedFilter(token) {
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
  tokenPresentationStates.delete(token);
  presentedTokens.delete(token);
  try {
    delete token[TOKEN_PRESENTATION_KEY];
  } catch {
    token[TOKEN_PRESENTATION_KEY] = null;
  }
  return !!state;
}

function forceTokenArtVisible(token, { hatched }) {
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

  if (hatched) attachOwnedFilter(token);
  else removeOwnedFilter(token);

  tokenPresentationStates.set(token, { changes });
  presentedTokens.add(token);
  token[TOKEN_PRESENTATION_KEY] = hatched ? 'unseen' : 'normal';
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

  if (darknessState) {
    try {
      if (darknessState.surface?.alpha === DARKNESS_ALPHA) {
        darknessState.surface.alpha = darknessState.alpha;
      }
    } catch {
      /* canvas may already be torn down */
    }
    darknessState = null;
  }

  if (darknessColorState) {
    try {
      if (darknessColorState.config?.darknessColor === darknessColorState.observerColor) {
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
  if (darknessColorState?.config === config) {
    config.darknessColor = observerColor;
    return;
  }

  darknessColorState = {
    config,
    originalColor: config.darknessColor,
    observerColor,
  };
  config.darknessColor = observerColor;
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

  const darkness = globalThis.canvas?.effects?.darkness;
  if (darkness && 'alpha' in darkness) {
    if (darknessState?.surface !== darkness) {
      darknessState = { surface: darkness, alpha: darkness.alpha };
    }
    darkness.alpha = DARKNESS_ALPHA;
  }
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

  afterCoreTokenRefresh(token, { coreVisible = false, visionerHidden = false } = {}) {
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
      visionerHidden,
    });
    if (presentation === 'unchanged') return presentation;

    forceTokenArtVisible(token, { hatched: presentation === 'unseen' });
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
    }
    presentedTokens = new Set();
    tokenPresentationStates = new WeakMap();
    ownedTokenFilters = new WeakMap();
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
