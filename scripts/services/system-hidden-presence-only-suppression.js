export const PRESENCE_ONLY_RENDER_SUPPRESSION_KEY = '_pvPresenceOnlyRenderSuppression';

const PRESENCE_ONLY_RENDER_SUPPRESSION_TTL_MS = 1500;
const PRESENCE_ONLY_MODES = new Set(['lifesense', 'thoughtsense', 'scent']);

export function isPresenceOnlyIndicatorMode(mode) {
  return PRESENCE_ONLY_MODES.has(mode);
}

function hideDisplayObject(displayObject) {
  if (!displayObject) return;
  try {
    if ('visible' in displayObject) displayObject.visible = false;
    if ('renderable' in displayObject) displayObject.renderable = false;
    if ('alpha' in displayObject) displayObject.alpha = 0;
  } catch {
    /* best-effort render suppression */
  }
}

function showDisplayObject(displayObject) {
  if (!displayObject) return;
  try {
    if ('visible' in displayObject) displayObject.visible = true;
    if ('renderable' in displayObject) displayObject.renderable = true;
    if ('alpha' in displayObject) displayObject.alpha = 1;
  } catch {
    /* best-effort render restore */
  }
}

export function hidePresenceOnlySuppressedTokenDetails(token) {
  if (!token) return;

  try {
    token.detectionFilter = null;
  } catch {
    /* best-effort detection filter cleanup */
  }

  hideDisplayObject(token.detectionFilterMesh);

  const hiddenEcho = token?._pvHiddenEcho;
  if (hiddenEcho) {
    try {
      if ('visible' in hiddenEcho) hiddenEcho.visible = false;
      hiddenEcho.parent?.removeChild?.(hiddenEcho);
      hiddenEcho.destroy?.();
    } catch {
      /* best-effort hidden echo cleanup */
    }
    try {
      token._pvHiddenEcho = null;
    } catch {
      /* best-effort hidden echo cleanup */
    }
  }

  try {
    if ('visible' in token) token.visible = false;
    if ('renderable' in token) token.renderable = false;
  } catch {
    /* best-effort token body cleanup */
  }

  hideDisplayObject(token.mesh);

  try {
    if (token.effects && 'visible' in token.effects) token.effects.visible = false;
  } catch {
    /* best-effort token chrome cleanup */
  }
}

export function forcePresenceOnlySuppressedTokenVisible(token) {
  if (!token) return;
  try {
    if ('visible' in token) token.visible = true;
    if ('renderable' in token) token.renderable = true;
  } catch {
    /* best-effort token body restore */
  }
  showDisplayObject(token.mesh);
  try {
    if (token.effects && 'visible' in token.effects) token.effects.visible = true;
  } catch {
    /* best-effort token chrome restore */
  }
  try {
    token.detectionFilter = null;
  } catch {
    /* best-effort detection filter cleanup */
  }
  hideDisplayObject(token.detectionFilterMesh);
}

export function suppressPresenceOnlyTokenRender(
  token,
  { mode = null, observerId = null, ttlMs = PRESENCE_ONLY_RENDER_SUPPRESSION_TTL_MS } = {},
) {
  if (!token || !isPresenceOnlyIndicatorMode(mode)) return false;
  token[PRESENCE_ONLY_RENDER_SUPPRESSION_KEY] = {
    mode,
    observerId,
    expiresAt: Number.isFinite(ttlMs) ? Date.now() + ttlMs : Number.POSITIVE_INFINITY,
  };
  hidePresenceOnlySuppressedTokenDetails(token);
  return true;
}

export function hasActivePresenceOnlyTokenRenderSuppression(token, { now = Date.now() } = {}) {
  const indicator = token?._pvSystemHiddenIndicator;
  const indicatorMode = indicator?._pvIndicatorMode ?? null;
  if (isPresenceOnlyIndicatorMode(indicatorMode)) {
    token[PRESENCE_ONLY_RENDER_SUPPRESSION_KEY] = {
      mode: indicatorMode,
      observerId: indicator?._pvObserverId ?? null,
      expiresAt: now + PRESENCE_ONLY_RENDER_SUPPRESSION_TTL_MS,
    };
    return true;
  }

  const state = token?.[PRESENCE_ONLY_RENDER_SUPPRESSION_KEY];
  if (!state) return false;
  if (!isPresenceOnlyIndicatorMode(state.mode)) {
    clearPresenceOnlyTokenRenderSuppression(token);
    return false;
  }
  if (Number.isFinite(state.expiresAt) && state.expiresAt < now) {
    clearPresenceOnlyTokenRenderSuppression(token);
    return false;
  }
  return true;
}

export function presenceOnlyTokenRenderSuppressionMode(token) {
  return hasActivePresenceOnlyTokenRenderSuppression(token)
    ? token[PRESENCE_ONLY_RENDER_SUPPRESSION_KEY]?.mode ?? null
    : null;
}

export function clearPresenceOnlyTokenRenderSuppression(
  token,
  { forceTokenVisible = false } = {},
) {
  if (!token) return false;
  const hadSuppression = !!token[PRESENCE_ONLY_RENDER_SUPPRESSION_KEY];
  try {
    delete token[PRESENCE_ONLY_RENDER_SUPPRESSION_KEY];
  } catch {
    token[PRESENCE_ONLY_RENDER_SUPPRESSION_KEY] = null;
  }
  if (forceTokenVisible) forcePresenceOnlySuppressedTokenVisible(token);
  return hadSuppression;
}
