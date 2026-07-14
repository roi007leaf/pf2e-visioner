import { MODULE_ID, VISIBILITY_STATES, getVisibilityStateLabelKey } from '../constants.js';
import { scheduleRAF } from '../utils/scheduler.js';
import {
  HoverTooltips,
  hideAllCoverIndicators,
  hideAllVisibilityIndicators,
  showVisibilityIndicators,
} from './HoverTooltips.js';
import {
  VISIBILITY_FACTOR_BADGE_SIZE,
  computeVisibilityFactorBadgePlacement,
  computeVisibilityFactorBadgeWorldPoint,
  computeVisibilityFactorTooltipPosition,
} from './HoverTooltip/hover-tooltip-badge-layout.js';
import {
  createVisibilityFactorBadge,
  createVisibilityFactorTooltip,
  resolveTooltipCssColor,
} from './HoverTooltip/hover-tooltip-badge-elements.js';
import { buildVisibilityFactorTooltipLines } from './HoverTooltip/hover-tooltip-factor-overlay.js';
import {
  clearPresenceOnlyTokenRenderSuppression,
  suppressPresenceOnlyTokenRender,
} from './system-hidden-presence-only-suppression.js';

const LIFESENSE_INDICATOR_COLOR = 0x00d4ff;
const THOUGHTSENSE_INDICATOR_COLOR = 0x9400d3;
const ECHOLOCATION_INDICATOR_COLOR = 0x3aa6ff;
const BLIND_DEAF_INDICATOR_COLOR = 0x555555;
const SCENT_INDICATOR_COLOR = 0x8b5a2b;
const TARGETED_FRIENDLY_COLOR = 0x00ff00;
const TARGETED_HOSTILE_COLOR = 0xff0000;
const TARGETED_NEUTRAL_COLOR = 0xffa500;
const PRESENCE_ONLY_RENDER_STATE_KEY = '_pvSystemHiddenPresenceOnlyRenderState';

function getTokenDispositions() {
  return globalThis.CONST?.TOKEN_DISPOSITIONS ?? {};
}

export function syncSystemHiddenIndicatorPositionForToken(token, canvasLayer = globalThis.canvas) {
  const tokenId = token?.document?.id ?? token?.id;
  if (!tokenId) return false;
  const owner = canvasLayer?.tokens?.get?.(tokenId) ?? token;
  const indicator = owner?._pvSystemHiddenIndicator;
  if (!indicator?.position?.set) return false;
  const center = getLiveTokenCenter(owner, canvasLayer);
  if (!center) return false;
  indicator.position.set(center.x, center.y);
  return true;
}

export function getLiveTokenCenter(token, canvasLayer = globalThis.canvas) {
  if (!token) return null;
  const previews = canvasLayer?.tokens?.preview?.children;
  const preview = previews?.find?.(
    (child) =>
      child?._original === token ||
      (child?.document?.id && token?.document?.id && child.document.id === token.document.id),
  );
  const source = preview ?? token;
  const center = source.center;
  if (center && Number.isFinite(center.x) && Number.isFinite(center.y)) {
    return { x: center.x, y: center.y };
  }
  const gridSize = canvasLayer?.grid?.size ?? 0;
  const width = source.document?.width ?? 1;
  const height = source.document?.height ?? 1;
  return {
    x: (source.document?.x ?? 0) + (width * gridSize) / 2,
    y: (source.document?.y ?? 0) + (height * gridSize) / 2,
  };
}

export function getSystemHiddenIndicatorBaseColor({
  observerIsBlindAndDeaf = false,
  shouldShowThoughtsenseIndicator = false,
  shouldShowEcholocationIndicator = false,
  shouldShowScentIndicator = false,
} = {}) {
  if (shouldShowThoughtsenseIndicator) return THOUGHTSENSE_INDICATOR_COLOR;
  if (shouldShowEcholocationIndicator) return ECHOLOCATION_INDICATOR_COLOR;
  if (shouldShowScentIndicator) return SCENT_INDICATOR_COLOR;
  if (observerIsBlindAndDeaf) return BLIND_DEAF_INDICATOR_COLOR;
  return LIFESENSE_INDICATOR_COLOR;
}

export function getSystemHiddenTargetedColor({
  disposition,
  fallbackColor,
  tokenDispositions = getTokenDispositions(),
} = {}) {
  switch (disposition) {
    case tokenDispositions.FRIENDLY:
      return TARGETED_FRIENDLY_COLOR;
    case tokenDispositions.HOSTILE:
      return TARGETED_HOSTILE_COLOR;
    case tokenDispositions.NEUTRAL:
      return TARGETED_NEUTRAL_COLOR;
    default:
      return fallbackColor;
  }
}

export function getSystemHiddenIndicatorColor({
  observerIsBlindAndDeaf = false,
  shouldShowThoughtsenseIndicator = false,
  shouldShowEcholocationIndicator = false,
  shouldShowScentIndicator = false,
  isTargeted = false,
  disposition = null,
  tokenDispositions = getTokenDispositions(),
} = {}) {
  const baseColor = getSystemHiddenIndicatorBaseColor({
    observerIsBlindAndDeaf,
    shouldShowThoughtsenseIndicator,
    shouldShowEcholocationIndicator,
    shouldShowScentIndicator,
  });
  if (!isTargeted) return baseColor;
  return getSystemHiddenTargetedColor({
    disposition,
    fallbackColor: baseColor,
    tokenDispositions,
  });
}

export function drawSystemHiddenIndicatorFrame({
  graphics,
  size,
  color,
  lineWidth = 3,
  alpha = 0.6,
} = {}) {
  graphics.clear();
  graphics.lineStyle(lineWidth, color, alpha);
  graphics.beginFill(color, alpha * 0.05);
  graphics.drawRect(-size / 2, -size / 2, size, size);
  graphics.endFill();
}

let currentlyHoveredIndicator = null;
let keyHandlerInstalled = false;

function lifesenseTargetKeyHandler(event) {
  if (!currentlyHoveredIndicator) return;
  if (event.code !== 'KeyT') return;

  try {
    const targetToken = globalThis.canvas?.tokens?.get?.(currentlyHoveredIndicator._pvTokenId);
    if (!targetToken) return;

    const shiftKey = event.shiftKey ?? false;
    targetToken.setTarget(!targetToken.isTargeted, { releaseOthers: !shiftKey });
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  } catch (err) {
    console.warn('PF2E Visioner | Error keyboard targeting system-hidden token:', err);
  }
}

export function ensureSystemHiddenKeyHandlerInstalled({
  windowObj = globalThis.window,
  hooks = globalThis.Hooks,
} = {}) {
  if (keyHandlerInstalled) return;
  windowObj?.addEventListener?.('keydown', lifesenseTargetKeyHandler, true);
  keyHandlerInstalled = true;

  hooks?.once?.('canvasTearDown', () => {
    cleanupSystemHiddenKeyHandler({ windowObj });
  });
}

export function cleanupSystemHiddenKeyHandler({ windowObj = globalThis.window } = {}) {
  if (!keyHandlerInstalled) return;
  windowObj?.removeEventListener?.('keydown', lifesenseTargetKeyHandler, true);
  keyHandlerInstalled = false;
  currentlyHoveredIndicator = null;
}

const systemHiddenIndicators = new Set();
const systemHiddenHookRegistrations = {
  targetToken: { event: 'targetToken', id: null, registered: false },
  factorsOverlay: {
    event: 'pf2e-visioner:visibilityFactorsOverlay',
    id: null,
    registered: false,
  },
  canvasPan: { event: 'canvasPan', id: null, registered: false },
  canvasReady: { event: 'canvasReady', id: null, registered: false },
  canvasTearDown: { event: 'canvasTearDown', id: null, registered: false },
};

let indicatorPositionTickerActive = false;

export function repositionIndicatorIfMoved(indicator, canvasLayer = globalThis.canvas) {
  const position = indicator?.position;
  if (!position?.set) return false;
  const center = getLiveTokenCenter(indicator?._pvTokenRef, canvasLayer);
  if (!center) return false;
  // Only re-set when it actually moved: setting position on an interactive object dirties its
  // hit-area, so skipping unchanged indicators keeps fast drags smooth (avoids a per-frame
  // reposition of every indicator) while still snapping back to the token when a drag ends.
  if (position.x === center.x && position.y === center.y) return false;
  position.set(center.x, center.y);
  return true;
}

function syncAllSystemHiddenIndicatorPositions() {
  // Per-frame work is scoped to active drags only: iterate the drag-preview clones (usually 0
  // or 1), not every indicator. When nothing is dragging this returns immediately, so the
  // ticker adds no cost during normal play or a slow drag. Snap-back on drop/cancel and
  // committed-move repositioning are handled by the refreshToken sync.
  const previews = globalThis.canvas?.tokens?.preview?.children;
  if (!previews?.length) return;
  for (const preview of previews) {
    try {
      const original =
        preview?._original ?? globalThis.canvas?.tokens?.get?.(preview?.document?.id);
      const indicator = original?._pvSystemHiddenIndicator;
      if (indicator) repositionIndicatorIfMoved(indicator);
    } catch (_) {
      /* best-effort indicator position sync */
    }
  }
}

function ensureIndicatorPositionTicker() {
  if (indicatorPositionTickerActive) return;
  const ticker = globalThis.canvas?.app?.ticker;
  if (!ticker?.add) return;
  ticker.add(syncAllSystemHiddenIndicatorPositions);
  indicatorPositionTickerActive = true;
}

function removeIndicatorPositionTicker() {
  if (!indicatorPositionTickerActive) return;
  globalThis.canvas?.app?.ticker?.remove?.(syncAllSystemHiddenIndicatorPositions);
  indicatorPositionTickerActive = false;
}

export function removeSystemHiddenFactorsBadge(indicator) {
  if (!indicator) return;
  indicator._pvFactorsActive = false;
  if (indicator._pvFactorsBadgeEl) {
    indicator._pvFactorsBadgeEl.remove();
    indicator._pvFactorsBadgeEl = null;
  }
  if (indicator._pvFactorsTooltipEl) {
    indicator._pvFactorsTooltipEl.remove();
    indicator._pvFactorsTooltipEl = null;
  }
}

function releaseSystemHiddenIndicatorHooksIfIdle() {
  if (systemHiddenIndicators.size > 0) return;
  removeIndicatorPositionTicker();
  for (const registration of Object.values(systemHiddenHookRegistrations)) {
    if (!registration.registered) continue;
    globalThis.Hooks?.off?.(registration.event, registration.id);
    registration.id = null;
    registration.registered = false;
  }
}

function forEachSystemHiddenIndicator(callback) {
  for (const indicator of Array.from(systemHiddenIndicators)) {
    try {
      if (indicator?._pvTokenRef?._pvSystemHiddenIndicator !== indicator) {
        systemHiddenIndicators.delete(indicator);
        continue;
      }
      callback(indicator);
    } catch (_) { }
  }
  releaseSystemHiddenIndicatorHooksIfIdle();
}

function registerSystemHiddenHook(key, handler) {
  const registration = systemHiddenHookRegistrations[key];
  if (!registration || registration.registered) return;
  registration.id = globalThis.Hooks?.on?.(registration.event, handler);
  registration.registered = true;
}

function ensureSystemHiddenIndicatorHooks() {
  registerSystemHiddenHook('targetToken', (_user, targetToken) => {
    const targetId = targetToken?.document?.id ?? targetToken?.id;
    const indicator =
      targetToken?._pvSystemHiddenIndicator ??
      Array.from(systemHiddenIndicators).find((candidate) => candidate?._pvTokenId === targetId);
    indicator?._pvUpdateIndicatorColor?.();
  });

  registerSystemHiddenHook('factorsOverlay', async ({ active } = {}) => {
    for (const indicator of Array.from(systemHiddenIndicators)) {
      try {
        if (indicator?._pvTokenRef?._pvSystemHiddenIndicator !== indicator) {
          systemHiddenIndicators.delete(indicator);
          continue;
        }
        if (active) {
          await indicator._pvBuildPairFactorsBadgeOutside?.();
        } else if (indicator._pvFactorsActive) {
          removeSystemHiddenFactorsBadge(indicator);
        }
      } catch (_) { }
    }
    releaseSystemHiddenIndicatorHooksIfIdle();
  });

  registerSystemHiddenHook('canvasPan', () => {
    if (HoverTooltips?._isPanning) return;
    forEachSystemHiddenIndicator((indicator) => {
      if (indicator._pvFactorsActive) {
        removeSystemHiddenFactorsBadge(indicator);
      }
    });
  });

  registerSystemHiddenHook('canvasReady', () => {
    try {
      forEachSystemHiddenIndicator(removeSystemHiddenFactorsBadge);
      hideAllVisibilityIndicators?.();
      hideAllCoverIndicators?.();
    } catch (_) { }
  });

  registerSystemHiddenHook('canvasTearDown', () => {
    forEachSystemHiddenIndicator(removeSystemHiddenFactorsBadge);
  });
}

function registerSystemHiddenIndicator(token, indicator) {
  indicator._pvTokenRef = token;
  systemHiddenIndicators.add(indicator);
  ensureSystemHiddenIndicatorHooks();
  ensureIndicatorPositionTicker();
}

function unregisterSystemHiddenIndicator(indicator) {
  systemHiddenIndicators.delete(indicator);
  releaseSystemHiddenIndicatorHooksIfIdle();
}

function clearPresenceOnlyDetectionFilterVisuals(token) {
  try {
    if ('detectionFilter' in token) token.detectionFilter = null;
  } catch (_) {
    /* best-effort presence-only detection cleanup */
  }
  try {
    const mesh = token?.detectionFilterMesh;
    if (mesh && 'visible' in mesh) mesh.visible = false;
    if (mesh && 'renderable' in mesh) mesh.renderable = false;
    if (mesh && 'alpha' in mesh) mesh.alpha = 0;
  } catch (_) {
    /* best-effort presence-only detection mesh cleanup */
  }
}

function forceVisiblePresenceOnlyRenderState(token) {
  clearPresenceOnlyTokenRenderSuppression(token);
  try {
    if ('visible' in token) token.visible = true;
    if ('renderable' in token) token.renderable = true;

    const mesh = token?.mesh;
    if (mesh) {
      if ('visible' in mesh) mesh.visible = true;
      if ('renderable' in mesh) mesh.renderable = true;
      if ('alpha' in mesh) mesh.alpha = 1;
    }

    const effects = token?.effects;
    if (effects && 'visible' in effects) effects.visible = true;
  } catch (_) {
    /* best-effort presence-only visible restore */
  }
  clearPresenceOnlyDetectionFilterVisuals(token);
}

function hidePresenceOnlyIndicatorTokenDetails(token, { indicator = null } = {}) {
  if (!token) return;
  if (
    suppressPresenceOnlyTokenRender(token, {
      mode: indicator?._pvIndicatorMode,
      observerId: indicator?._pvObserverId,
    })
  ) {
    return;
  }
  clearPresenceOnlyDetectionFilterVisuals(token);
  try {
    if ('visible' in token) token.visible = false;
    if ('renderable' in token) token.renderable = false;
  } catch (_) {
    /* best-effort presence-only body hide */
  }
  try {
    const mesh = token.mesh;
    if (mesh && 'visible' in mesh) mesh.visible = false;
    if (mesh && 'renderable' in mesh) mesh.renderable = false;
    if (mesh && 'alpha' in mesh) mesh.alpha = 0;
  } catch (_) {
    /* best-effort presence-only mesh hide */
  }
  try {
    const effects = token.effects;
    if (effects && 'visible' in effects) effects.visible = false;
  } catch (_) {
    /* best-effort presence-only effect hide */
  }
}

function restoreCapturedPresenceOnlyRenderState(token, { forceTokenVisible = false } = {}) {
  const state = token?.[PRESENCE_ONLY_RENDER_STATE_KEY];
  if (!state) return false;

  try {
    if (state.visible !== undefined && 'visible' in token) token.visible = state.visible;
    if (state.renderable !== undefined && 'renderable' in token) {
      token.renderable = state.renderable;
    }

    const mesh = state.mesh?.object || token.mesh;
    if (mesh) {
      if (state.mesh?.visible !== undefined && 'visible' in mesh) mesh.visible = state.mesh.visible;
      if (state.mesh?.renderable !== undefined && 'renderable' in mesh) {
        mesh.renderable = state.mesh.renderable;
      }
      if (state.mesh?.alpha !== undefined && 'alpha' in mesh) mesh.alpha = state.mesh.alpha;
    }

    const effects = state.effects?.object || token.effects;
    if (effects && state.effects?.visible !== undefined && 'visible' in effects) {
      effects.visible = state.effects.visible;
    }
    if (forceTokenVisible) {
      forceVisiblePresenceOnlyRenderState(token);
    }
  } catch (_) {
    /* best-effort presence-only render restore */
  }

  try {
    delete token[PRESENCE_ONLY_RENDER_STATE_KEY];
  } catch (_) {
    token[PRESENCE_ONLY_RENDER_STATE_KEY] = null;
  }
  return true;
}

function discardCapturedPresenceOnlyRenderState(token) {
  if (!token) return false;
  const hadState = !!token[PRESENCE_ONLY_RENDER_STATE_KEY];
  try {
    delete token[PRESENCE_ONLY_RENDER_STATE_KEY];
  } catch (_) {
    token[PRESENCE_ONLY_RENDER_STATE_KEY] = null;
  }
  return hadState;
}

export function removeSystemHiddenIndicator(token, options = {}) {
  try {
    const indicator = token?._pvSystemHiddenIndicator;
    if (!indicator) return false;
    unregisterSystemHiddenIndicator(indicator);

    if (typeof indicator._pvAnimationFrameId === 'function') {
      try {
        indicator._pvAnimationFrameId();
      } catch (_) { }
      indicator._pvAnimationFrameId = null;
    }
    if (indicator._pvTargetHookId !== undefined) {
      globalThis.Hooks?.off?.('targetToken', indicator._pvTargetHookId);
    }
    if (indicator._pvFactorsOverlayHook !== undefined) {
      globalThis.Hooks?.off?.(
        'pf2e-visioner:visibilityFactorsOverlay',
        indicator._pvFactorsOverlayHook,
      );
    }
    if (indicator._pvCanvasPanHook !== undefined) {
      globalThis.Hooks?.off?.('canvasPan', indicator._pvCanvasPanHook);
    }
    if (indicator._pvCanvasReadyHook !== undefined) {
      globalThis.Hooks?.off?.('canvasReady', indicator._pvCanvasReadyHook);
    }
    if (indicator._pvCanvasTearDownHook !== undefined) {
      globalThis.Hooks?.off?.('canvasTearDown', indicator._pvCanvasTearDownHook);
    }
    if (currentlyHoveredIndicator === indicator) {
      currentlyHoveredIndicator = null;
    }
    removeSystemHiddenFactorsBadge(indicator);
    indicator.parent?.removeChild(indicator);
    indicator.destroy?.({ children: false, texture: false, baseTexture: false });
    indicator._pvTokenRef = null;
    token._pvSystemHiddenIndicator = null;
    const shouldRestoreRenderState = options?.restoreRenderState !== false;
    const restored = shouldRestoreRenderState
      ? restoreCapturedPresenceOnlyRenderState(token, {
        forceTokenVisible: options?.forceTokenVisible === true,
      })
      : discardCapturedPresenceOnlyRenderState(token);
    if (options?.preservePresenceOnlyRenderSuppression === true) {
      suppressPresenceOnlyTokenRender(token, {
        mode: indicator._pvIndicatorMode,
        observerId: indicator._pvObserverId,
        ttlMs: options?.presenceOnlyRenderSuppressionTtlMs,
      });
    } else {
      clearPresenceOnlyTokenRenderSuppression(token, {
        forceTokenVisible: options?.forceTokenVisible === true && !restored,
      });
    }

    return true;
  } catch (_) {
    return false;
  }
}

async function buildSystemHiddenFactorsBadge({ indicator, observer, token, canvasLayer, pixi }) {
  try {
    if (indicator._pvFactorsActive) return;
    const { Pf2eVisionerApi } = await import('../api.js');
    const factors = await Pf2eVisionerApi.getVisibilityFactors(observer.id, token.id);
    if (!factors) return;

    indicator._pvFactorsActive = true;
    const stateCfg = VISIBILITY_STATES[factors.state] ||
      VISIBILITY_STATES.observed || { icon: 'fa-solid fa-eye', color: '#ffffff' };
    const canvasRect = canvasLayer.app.view.getBoundingClientRect();
    const worldPoint = computeVisibilityFactorBadgeWorldPoint({
      tokenX: token.x,
      tokenY: token.y,
      tokenBounds: token.bounds,
    });
    const globalPoint = canvasLayer.tokens.toGlobal(new pixi.Point(worldPoint.x, worldPoint.y));
    const placement = computeVisibilityFactorBadgePlacement({
      canvasRect,
      globalPoint,
    });

    const badgeEl = createVisibilityFactorBadge({
      iconClass: stateCfg.icon,
      iconColor: resolveTooltipCssColor(stateCfg.color),
      iconSize: 16,
      bgSize: VISIBILITY_FACTOR_BADGE_SIZE,
      zIndex: '6000',
      left: placement.left,
      top: placement.top,
    });
    document.body.appendChild(badgeEl);

    const lines = buildVisibilityFactorTooltipLines(factors, {
      localize: (key) => game.i18n?.localize?.(key) || key,
      formatStateLabel: (state) => {
        const stateLabelKey = getVisibilityStateLabelKey(state, { manual: true }) || state;
        return game.i18n?.localize?.(stateLabelKey) || stateLabelKey;
      },
    });

    const tooltipEl = createVisibilityFactorTooltip({
      lines,
      fallbackText: factors.state || '',
    });
    document.body.appendChild(tooltipEl);

    const updateTooltipPos = () => {
      const { left, top } = computeVisibilityFactorTooltipPosition(placement);
      tooltipEl.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    };

    badgeEl.addEventListener('mouseenter', () => {
      tooltipEl.style.display = 'block';
      updateTooltipPos();
    });
    badgeEl.addEventListener('mouseleave', () => {
      tooltipEl.style.display = 'none';
    });

    indicator._pvFactorsBadgeEl = badgeEl;
    indicator._pvFactorsTooltipEl = tooltipEl;
  } catch (_) { }
}

function updateIndicatorColor({
  indicator,
  token,
  observerIsBlindAndDeaf,
  shouldShowThoughtsenseIndicator,
  shouldShowEcholocationIndicator,
  shouldShowScentIndicator,
  size,
  canvasLayer,
}) {
  const targetToken = canvasLayer.tokens.get(token.document.id);
  const color = getSystemHiddenIndicatorColor({
    observerIsBlindAndDeaf,
    shouldShowThoughtsenseIndicator,
    shouldShowEcholocationIndicator,
    shouldShowScentIndicator,
    isTargeted: targetToken?.isTargeted ?? false,
    disposition: token.document.disposition ?? getTokenDispositions().NEUTRAL,
  });

  drawSystemHiddenIndicatorFrame({
    graphics: indicator,
    size,
    color,
  });

  return color;
}

async function addDistanceText({ indicator, observer, token, size, pixi }) {
  if (indicator._distanceText || !observer) return;
  try {
    let distanceInFeet;
    if (observer.distanceTo && typeof observer.distanceTo === 'function') {
      distanceInFeet = observer.distanceTo(token);
    } else {
      const { calculateDistanceInFeet } = await import('../helpers/geometry-utils.js');
      distanceInFeet = calculateDistanceInFeet(observer, token);
    }

    const distance = Math.round(distanceInFeet / 5) * 5;
    const distanceTextStyle = new pixi.TextStyle({
      fontFamily: 'Signika, sans-serif',
      fontSize: Math.max(20, size / 4),
      fill: 0xffffff,
      stroke: 0x000000,
      strokeThickness: 4,
      dropShadow: true,
      dropShadowColor: 0x000000,
      dropShadowBlur: 4,
      dropShadowAngle: Math.PI / 4,
      dropShadowDistance: 2,
      align: 'center',
    });

    const distanceText = new pixi.Text(`${distance} ft`, distanceTextStyle);
    distanceText.anchor.set(0.5, 1);
    distanceText.position.set(0, -size * 0.55);
    distanceText.zIndex = 1000;
    indicator.addChild(distanceText);
    indicator._distanceText = distanceText;
  } catch (err) {
    console.warn('PF2E Visioner | Error showing distance for lifesense indicator:', err);
  }
}

export async function showObserverHoverTooltips({ indicator, token }) {
  try {
    const tooltipsEnabled = game.settings?.get?.(MODULE_ID, 'enableHoverTooltips');
    if (!tooltipsEnabled) return;
    if (HoverTooltips.isShowingKeyTooltips || HoverTooltips._isPanning) return;

    indicator._pvPrevTooltipState = {
      mode: HoverTooltips.tooltipMode,
      hovered: HoverTooltips.currentHoveredToken,
      keyboard: HoverTooltips._keyboardContext,
    };

    HoverTooltips.tooltipMode = 'target';
    HoverTooltips._keyboardContext = true;
    HoverTooltips.currentHoveredToken = token;
    showVisibilityIndicators?.(token);
  } catch (err) {
    console.warn('PF2E Visioner | Error showing hover tooltips for lifesense indicator:', err);
  }
}

function clearDistanceText(indicator) {
  if (!indicator._distanceText) return;
  indicator.removeChild(indicator._distanceText);
  indicator._distanceText.destroy();
  indicator._distanceText = null;
}

function restoreObserverHoverTooltips({ indicator, observer }) {
  try {
    hideAllVisibilityIndicators?.();
    hideAllCoverIndicators?.();

    if (indicator._pvPrevTooltipState) {
      HoverTooltips.tooltipMode = indicator._pvPrevTooltipState.mode;
      HoverTooltips._keyboardContext = indicator._pvPrevTooltipState.keyboard;
      HoverTooltips.currentHoveredToken = indicator._pvPrevTooltipState.hovered || null;
      delete indicator._pvPrevTooltipState;
    } else if (HoverTooltips.currentHoveredToken === observer) {
      HoverTooltips.currentHoveredToken = null;
    }
  } catch (err) {
    console.warn('PF2E Visioner | Error hiding hover tooltips for lifesense indicator:', err);
  }
}

function clearInactiveFactorsBadge(indicator) {
  try {
    if (HoverTooltips?.isShowingFactorsOverlay) return;
    removeSystemHiddenFactorsBadge(indicator);
    delete indicator._pvFactorsActive;
  } catch (_) { }
}

function addDisplayName({ indicator, token, size, pixi }) {
  const displayName = token.document.displayName ?? 0;
  const shouldShowName = displayName >= 30;
  if (!shouldShowName) return;

  const tokenName = token.document.name || 'Unknown';
  const textStyle = new pixi.TextStyle({
    fontFamily: 'Signika, sans-serif',
    fontSize: Math.max(20, size / 4),
    fill: 0xffffff,
    stroke: 0x000000,
    strokeThickness: 4,
    dropShadow: true,
    dropShadowColor: 0x000000,
    dropShadowBlur: 4,
    dropShadowAngle: Math.PI / 4,
    dropShadowDistance: 2,
    align: 'center',
    wordWrap: true,
    wordWrapWidth: size * 1.5,
  });

  const nameText = new pixi.Text(tokenName, textStyle);
  nameText.anchor.set(0.5, 0.5);
  nameText.position.set(0, size * 0.6);
  nameText.alpha = 0.9;
  indicator.addChild(nameText);
}

function attachPulseAnimation({
  indicator,
  token,
  size,
  shouldShowThoughtsenseIndicator,
  shouldShowEcholocationIndicator,
  shouldShowScentIndicator,
  canvasLayer,
  pixi,
}) {
  const effectContainer = new pixi.Container();
  effectContainer._pvTokenId = token.document.id;
  indicator.addChild(effectContainer);

  const pulse = new pixi.Graphics();
  pulse._pvTokenId = token.document.id;
  effectContainer.addChild(pulse);

  const startTime = Date.now();
  const animate = () => {
    try {
      if (!indicator.parent || !canvasLayer?.ready) {
        return;
      }
      if (
        indicator._pvIndicatorMode === 'thoughtsense' ||
        indicator._pvIndicatorMode === 'lifesense' ||
        indicator._pvIndicatorMode === 'scent'
      ) {
        hidePresenceOnlyIndicatorTokenDetails(token, { indicator });
      }

      const elapsed = (Date.now() - startTime) / 1000;
      const targetToken = canvasLayer.tokens.get(token.document.id);
      const animColor = getSystemHiddenIndicatorColor({
        shouldShowThoughtsenseIndicator,
        shouldShowEcholocationIndicator,
        shouldShowScentIndicator,
        isTargeted: targetToken?.isTargeted ?? false,
        disposition: token.document.disposition ?? getTokenDispositions().NEUTRAL,
      });

      pulse.clear();
      const breathe = 1.0 + 0.08 * Math.sin(elapsed * 2.0);
      const pulseAlpha = 0.3 + 0.15 * Math.sin(elapsed * 1.5);

      pulse.lineStyle(2, animColor, pulseAlpha);
      const expansion = 4 * breathe;
      pulse.drawRect(
        -size / 2 - expansion,
        -size / 2 - expansion,
        size + expansion * 2,
        size + expansion * 2,
      );

      const cancelFn = scheduleRAF(animate, true);
      indicator._pvAnimationFrameId = cancelFn || null;
    } catch (error) {
      console.error(`[PF2E-Visioner] System-hidden token animation error:`, error);
    }
  };

  indicator._pvAnimateFunction = animate;
  const cancelFn = scheduleRAF(animate, true);
  if (cancelFn) {
    indicator._pvAnimationFrameId = cancelFn;
  }
}

export async function createSystemHiddenIndicator({
  observer,
  token,
  indicatorMode,
  observerIsBlindAndDeaf = false,
  shouldShowThoughtsenseIndicator = false,
  shouldShowEcholocationIndicator = false,
  shouldShowScentIndicator = false,
  canvasLayer = globalThis.canvas,
  pixi = globalThis.PIXI,
} = {}) {
  const size = token.document.width * canvasLayer.grid.size;
  const centerX = token.center?.x ?? token.document.x + size / 2;
  const centerY = token.center?.y ?? token.document.y + size / 2;

  const indicator = new pixi.Graphics();
  indicator.position.set(centerX, centerY);
  indicator.zIndex = 900;
  indicator.eventMode = 'static';
  indicator.cursor = 'pointer';
  indicator.interactive = true;
  indicator.buttonMode = true;
  indicator.alpha = 0.8;
  indicator._pvTokenId = token.document.id;
  indicator._pvObserverId = observer.document.id;
  indicator._pvIndicatorMode = indicatorMode;

  const buildPairFactorsBadgeOutside = () =>
    buildSystemHiddenFactorsBadge({
      indicator,
      observer,
      token,
      canvasLayer,
      pixi,
    });
  const refreshIndicatorColor = () =>
    updateIndicatorColor({
      indicator,
      token,
      observerIsBlindAndDeaf,
      shouldShowThoughtsenseIndicator,
      shouldShowEcholocationIndicator,
      shouldShowScentIndicator,
      size,
      canvasLayer,
    });

  refreshIndicatorColor();

  indicator._pvUpdateIndicatorColor = refreshIndicatorColor;
  indicator._pvBuildPairFactorsBadgeOutside = buildPairFactorsBadgeOutside;

  indicator.on('pointerenter', () => {
    currentlyHoveredIndicator = indicator;
  });

  indicator.on('pointerleave', () => {
    if (currentlyHoveredIndicator === indicator) {
      currentlyHoveredIndicator = null;
    }
  });

  indicator.on('pointerover', async () => {
    indicator.alpha = 1.0;
    await addDistanceText({ indicator, observer, token, size, pixi });
    await showObserverHoverTooltips({ indicator, token });
    if (HoverTooltips?.isShowingFactorsOverlay) {
      await buildPairFactorsBadgeOutside();
    }
  });

  indicator.on('pointerout', async () => {
    indicator.alpha = 0.8;
    clearDistanceText(indicator);
    restoreObserverHoverTooltips({ indicator, observer });
    clearInactiveFactorsBadge(indicator);
  });

  addDisplayName({ indicator, token, size, pixi });
  attachPulseAnimation({
    indicator,
    token,
    size,
    shouldShowThoughtsenseIndicator,
    shouldShowEcholocationIndicator,
    shouldShowScentIndicator,
    canvasLayer,
    pixi,
  });

  const parent = canvasLayer.interface || canvasLayer.controls || canvasLayer.tokens;
  parent.addChild(indicator);
  token._pvSystemHiddenIndicator = indicator;
  registerSystemHiddenIndicator(token, indicator);

  if (HoverTooltips?.isShowingFactorsOverlay) {
    await buildPairFactorsBadgeOutside();
  }

  return indicator;
}
