import { MODULE_ID } from '../constants.js';

const PENDING_MOVEMENT_TTL_MS = 2500;
const PENDING_MOVEMENT_RENDER_LOCK_GRACE_MS = 1000;
const PENDING_MOVEMENT_ANIMATION_DETECTION_DELAY_MS = 50;
const HIDDEN_FROM_OBSERVER_STATES = new Set(['concealed', 'hidden', 'undetected', 'unnoticed']);
const RENDER_HIDDEN_FROM_OBSERVER_STATES = new Set(['hidden', 'undetected', 'unnoticed']);
const NPC_RENDER_VISIBLE_STATES = new Set(['hidden']);
const PENDING_MOVEMENT_SUPPRESSION_KEY = 'pf2eVisionerPendingMovement';
const PENDING_MOVEMENT_RENDER_STATE_KEY = '_pf2eVisionerPendingRenderState';

const pendingTokenMovementPositions = new Map();
const pendingTokenMovementCompletionTimeouts = new Map();
const pendingTokenHiddenForceContexts = new Map();
const pendingMovementRenderLockedTokens = new Set();
let pendingMovementHiddenStateVisibilityProbeDepth = 0;
let pendingMovementSerial = 0;

function tokenIdOf(tokenOrDoc) {
  return tokenOrDoc?.document?.id || tokenOrDoc?.id || null;
}

function tokenDocOf(tokenOrDoc) {
  return tokenOrDoc?.document || tokenOrDoc || null;
}

function sourceFromCollectionEntry(entry) {
  return Array.isArray(entry) && entry.length === 2 ? entry[1] : entry;
}

function sourceList(sources) {
  return Array.from(sources || [], sourceFromCollectionEntry);
}

function hasControlledMovementPreviewSource(sources) {
  for (const entry of sources || []) {
    const source = sourceFromCollectionEntry(entry);
    if (source?.active && isControlledMovementPreviewToken(source.object)) return true;
  }

  return false;
}

function hasPendingMovementDetectionWork({
  visionSources = canvas?.effects?.visionSources || [],
  lightSources = canvas?.effects?.lightSources || [],
} = {}) {
  cleanupExpiredPendingMovements();
  if (pendingTokenMovementPositions.size > 0) return true;

  return (
    hasControlledMovementPreviewSource(visionSources) ||
    hasControlledMovementPreviewSource(lightSources)
  );
}

function tokenDimensions(tokenOrDoc) {
  const doc = tokenDocOf(tokenOrDoc);
  const gridSize = canvas?.grid?.size || 1;
  return {
    width: Number(doc?.width ?? 1) * gridSize,
    height: Number(doc?.height ?? 1) * gridSize,
  };
}

function centerForToken(tokenOrDoc, positionOverride = null) {
  if (!tokenOrDoc) return null;

  const doc = tokenDocOf(tokenOrDoc);
  const dimensions = tokenDimensions(tokenOrDoc);

  if (positionOverride) {
    return {
      x: Number(positionOverride.x ?? doc?.x ?? 0) + dimensions.width / 2,
      y: Number(positionOverride.y ?? doc?.y ?? 0) + dimensions.height / 2,
    };
  }

  return (
    tokenOrDoc.center ||
    tokenOrDoc.getCenterPoint?.() || {
      x: Number(doc?.x ?? tokenOrDoc?.x ?? 0) + dimensions.width / 2,
      y: Number(doc?.y ?? tokenOrDoc?.y ?? 0) + dimensions.height / 2,
    }
  );
}

function cleanupExpiredPendingMovements(now = Date.now()) {
  for (const [tokenId, entry] of pendingTokenMovementPositions.entries()) {
    if (!entry || entry.expiresAt <= now) {
      pendingTokenMovementPositions.delete(tokenId);
    }
  }
}

function isControlledTokenDocument(tokenDoc, controlledTokens = canvas?.tokens?.controlled || []) {
  const tokenId = tokenIdOf(tokenDoc);
  if (!tokenId) return false;

  return controlledTokens.some((token) => tokenIdOf(token) === tokenId);
}

function isControlledMovementPreviewToken(tokenOrDoc) {
  const token = tokenOrDoc?.document ? tokenOrDoc : null;
  if (!token?.isPreview || !token?._original) return false;
  if (token._previewType === 'config') return false;

  return isControlledTokenDocument(token._original);
}

function wallBlocksSight(wall) {
  const doc = wall?.document || wall;
  if (!doc) return false;

  const isDoor = Number(doc.door ?? 0) > 0;
  const doorState = Number(doc.ds ?? doc.doorState ?? 0);
  if (isDoor && doorState === 1) return false;

  return Number(doc.sight ?? 1) > 0;
}

function segmentsIntersect(a, b, c, d) {
  const denom = (d.x - c.x) * (b.y - a.y) - (d.y - c.y) * (b.x - a.x);
  if (Math.abs(denom) < 1e-10) return false;

  const t = ((a.x - c.x) * (b.y - a.y) - (a.y - c.y) * (b.x - a.x)) / denom;
  const u = -((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / denom;

  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

function lineOfSightBlockedByWall(originPoint, targetPoint) {
  if (!originPoint || !targetPoint) return false;

  const walls = canvas?.walls?.placeables || [];
  for (const wall of walls) {
    if (!wallBlocksSight(wall)) continue;

    const doc = wall?.document || wall;
    const coords = Array.isArray(doc.c) ? doc.c : [doc.x, doc.y, doc.x2, doc.y2];
    const [x1, y1, x2, y2] = coords.map(Number);
    if (![x1, y1, x2, y2].every(Number.isFinite)) continue;

    if (segmentsIntersect(originPoint, targetPoint, { x: x1, y: y1 }, { x: x2, y: y2 })) {
      return true;
    }
  }

  return false;
}

function getStoredVisibilityState(observer, target) {
  const targetId = tokenIdOf(target);
  if (!targetId) return 'observed';

  const map = tokenDocOf(observer)?.getFlag?.(MODULE_ID, 'visibility') || {};
  const state = map?.[targetId];
  return typeof state === 'string' && state ? state : 'observed';
}

function visionerStateHidesTargetRendering(target, visibilityState) {
  if (!RENDER_HIDDEN_FROM_OBSERVER_STATES.has(visibilityState)) return false;
  if (target?.actor?.type === 'npc' && NPC_RENDER_VISIBLE_STATES.has(visibilityState)) {
    return false;
  }

  return true;
}

function tokenObjectForId(tokenId) {
  if (!tokenId) return null;
  return (
    canvas?.tokens?.get?.(tokenId) ||
    canvas?.tokens?.placeables?.find?.((token) => tokenIdOf(token) === tokenId) ||
    null
  );
}

function getPendingMovementBlockContext(observer, target) {
  const observerId = tokenIdOf(observer);
  const pendingPosition = getPendingTokenMovementPosition(observerId);
  const isMovementPreview = isControlledMovementPreviewToken(observer);
  if (!pendingPosition && !isMovementPreview) {
    return {
      active: false,
      observerId,
      pendingPosition,
      isMovementPreview,
    };
  }

  const originPoint = centerForToken(observer, pendingPosition || null);
  const targetPoint = centerForToken(target);
  const wallBlocked = lineOfSightBlockedByWall(originPoint, targetPoint);
  const visibilityState = getStoredVisibilityState(observer, target);
  const hiddenByVisioner = visionerStateHidesTargetRendering(target, visibilityState);
  const foundryHidden = !!tokenDocOf(target)?.hidden;
  const blocked = wallBlocked || hiddenByVisioner || foundryHidden;

  return {
    active: true,
    observerId,
    observerName: observer?.name ?? observer?.document?.name,
    targetId: tokenIdOf(target),
    targetName: target?.name ?? target?.document?.name,
    hasPendingPosition: !!pendingPosition,
    isMovementPreview,
    pendingPosition,
    originPoint,
    targetPoint,
    visibilityState,
    hiddenByVisioner,
    foundryHidden,
    wallBlocked,
    blocked,
  };
}

function getPendingMovementHiddenStateContext(target) {
  if (!target?.document?.id) return null;
  cleanupExpiredPendingMovements();

  for (const [observerId, entry] of pendingTokenMovementPositions.entries()) {
    const observer = tokenObjectForId(observerId) || entry?.tokenDoc || { id: observerId };
    const visibilityState = getStoredVisibilityState(observer, target);
    const hiddenByVisioner = visionerStateHidesTargetRendering(target, visibilityState);
    const foundryHidden = !!tokenDocOf(target)?.hidden;
    if (!hiddenByVisioner && !foundryHidden) continue;

    return {
      observerId,
      observerName: observer?.name ?? observer?.document?.name,
      targetId: tokenIdOf(target),
      targetName: target?.name ?? target?.document?.name,
      visibilityState,
      hiddenByVisioner,
      foundryHidden,
      pendingPosition: entry?.position ?? null,
    };
  }

  return null;
}

export function isPendingMovementHiddenStateVisibilityProbe() {
  return pendingMovementHiddenStateVisibilityProbeDepth > 0;
}

export function shouldBypassPendingMovementVisionerRenderState(observer, target, visibilityState) {
  if (!NPC_RENDER_VISIBLE_STATES.has(visibilityState)) return false;
  if (target?.actor?.type !== 'npc') return false;

  const context = getPendingMovementBlockContext(observer, target);
  return context.active && !context.foundryHidden;
}

function withPendingMovementHiddenStateVisibilityProbe(callback) {
  pendingMovementHiddenStateVisibilityProbeDepth += 1;
  try {
    return callback?.() ?? false;
  } finally {
    pendingMovementHiddenStateVisibilityProbeDepth = Math.max(
      0,
      pendingMovementHiddenStateVisibilityProbeDepth - 1,
    );
  }
}

function contextBlocksPendingDetection(context) {
  if (!context?.blocked) return false;
  if (!isPendingMovementHiddenStateVisibilityProbe()) return context.blocked;

  return context.foundryHidden;
}

function withOnlyDetectionSourcesForObserver(observerId, callback) {
  if (!observerId) return callback?.() ?? false;

  const allSources = [
    ...sourceList(canvas?.effects?.visionSources),
    ...sourceList(canvas?.effects?.lightSources),
  ];
  const otherSources = allSources.filter(
    (source) => source?.active && tokenIdOf(source.object) !== observerId,
  );

  return withSuppressedDetectionSources(otherSources, callback);
}

function getControlledObserverHiddenStateContext(target) {
  const targetId = tokenIdOf(target);
  if (!targetId) return null;

  const foundryHidden = !!tokenDocOf(target)?.hidden;
  for (const observer of canvas?.tokens?.controlled || []) {
    const observerId = tokenIdOf(observer);
    if (!observerId || observerId === targetId) continue;

    const visibilityState = getStoredVisibilityState(observer, target);
    const hiddenByVisioner = visionerStateHidesTargetRendering(target, visibilityState);
    if (!hiddenByVisioner && !foundryHidden) continue;

    return {
      observerId,
      observerName: observer?.name ?? observer?.document?.name,
      targetId,
      targetName: target?.name ?? target?.document?.name,
      visibilityState,
      hiddenByVisioner,
      foundryHidden,
      controlledObserver: true,
      pendingPosition: getPendingTokenMovementPosition(observerId),
    };
  }

  return null;
}

function clonePoint(point) {
  if (!point) return null;
  return {
    x: Number(point.x ?? 0),
    y: Number(point.y ?? 0),
  };
}

function normalizeHiddenRenderLockContext(context) {
  if (!context) return null;

  return {
    observerId: context.observerId ?? null,
    observerName: context.observerName,
    targetId: context.targetId ?? null,
    targetName: context.targetName,
    visibilityState: context.visibilityState ?? 'observed',
    hiddenByVisioner: !!context.hiddenByVisioner,
    foundryHidden: !!context.foundryHidden,
    pendingPosition: clonePoint(context.pendingPosition),
  };
}

function rememberHiddenForceContext(target, context) {
  const targetId = tokenIdOf(target);
  const normalizedContext = normalizeHiddenRenderLockContext(context);
  if (!targetId || !normalizedContext) return null;

  const rememberedContext = {
    ...normalizedContext,
    lastForcedAt: Date.now(),
  };
  pendingTokenHiddenForceContexts.set(targetId, rememberedContext);
  return rememberedContext;
}

function forgetHiddenForceContext(target) {
  const targetId = tokenIdOf(target);
  if (!targetId) return;
  pendingTokenHiddenForceContexts.delete(targetId);
}

function getRememberedHiddenForceContext(target) {
  const targetId = tokenIdOf(target);
  if (!targetId) return null;
  return pendingTokenHiddenForceContexts.get(targetId) ?? null;
}

function getHiddenRenderLockContext(target) {
  const pendingHiddenStateContext = getPendingMovementHiddenStateContext(target);
  if (pendingHiddenStateContext) return pendingHiddenStateContext;

  const controlledHiddenStateContext = getControlledObserverHiddenStateContext(target);
  if (controlledHiddenStateContext) return controlledHiddenStateContext;

  const hiddenBlockedEntry = getPendingMovementBlockedDetectionEntries(target).find(
    ({ context }) => context.hiddenByVisioner || context.foundryHidden,
  );
  return hiddenBlockedEntry?.context ?? null;
}

function getStickyHiddenRenderLockContext(target, state) {
  const rememberedLockContext = getRememberedHiddenForceContext(target);
  const stateLockContext = state?.lastHiddenContext
    ? { ...state.lastHiddenContext, lastForcedAt: state.lastForcedAt }
    : null;
  const lockContext =
    Number(rememberedLockContext?.lastForcedAt ?? -1) >
    Number(stateLockContext?.lastForcedAt ?? -1)
      ? rememberedLockContext
      : stateLockContext;
  if (!lockContext) return null;

  const foundryHidden = !!tokenDocOf(target)?.hidden;
  const elapsedMs = Date.now() - Number(lockContext.lastForcedAt ?? 0);
  const withinGrace =
    Number.isFinite(elapsedMs) &&
    elapsedMs >= 0 &&
    elapsedMs < PENDING_MOVEMENT_RENDER_LOCK_GRACE_MS;
  const observer = tokenObjectForId(lockContext.observerId);
  if (observer) {
    const visibilityState = getStoredVisibilityState(observer, target);
    const hiddenByVisioner = visionerStateHidesTargetRendering(target, visibilityState);
    if (!hiddenByVisioner && !foundryHidden) {
      if (withinGrace) {
        return {
          ...lockContext,
          visibilityState,
          hiddenByVisioner,
          foundryHidden,
          currentObserverState: true,
          observedDuringGrace: true,
          elapsedMs,
          renderLockGraceMs: PENDING_MOVEMENT_RENDER_LOCK_GRACE_MS,
        };
      }
      forgetHiddenForceContext(target);
      return null;
    }

    return {
      ...lockContext,
      visibilityState,
      hiddenByVisioner,
      foundryHidden,
      currentObserverState: true,
      elapsedMs,
      renderLockGraceMs: PENDING_MOVEMENT_RENDER_LOCK_GRACE_MS,
    };
  }

  if (foundryHidden || withinGrace) {
    return {
      ...lockContext,
      foundryHidden: foundryHidden || lockContext.foundryHidden,
      elapsedMs,
      renderLockGraceMs: PENDING_MOVEMENT_RENDER_LOCK_GRACE_MS,
    };
  }

  forgetHiddenForceContext(target);
  return null;
}

function suppressDetectionSource(source) {
  if (!source) return null;

  if (source.suppression && typeof source.suppression === 'object') {
    const hadFlag = Object.prototype.hasOwnProperty.call(
      source.suppression,
      PENDING_MOVEMENT_SUPPRESSION_KEY,
    );
    const previous = source.suppression[PENDING_MOVEMENT_SUPPRESSION_KEY];
    source.suppression[PENDING_MOVEMENT_SUPPRESSION_KEY] = true;

    return () => {
      if (hadFlag) source.suppression[PENDING_MOVEMENT_SUPPRESSION_KEY] = previous;
      else delete source.suppression[PENDING_MOVEMENT_SUPPRESSION_KEY];
    };
  }

  const previousActive = source.active;
  try {
    source.active = false;
  } catch {
    return null;
  }

  return () => {
    source.active = previousActive;
  };
}

function withSuppressedDetectionSources(sources, callback) {
  const restoreSuppressedSources = [];
  try {
    for (const source of sources || []) {
      const restore = suppressDetectionSource(source);
      if (restore) restoreSuppressedSources.push(restore);
    }

    return callback?.() ?? false;
  } finally {
    for (const restore of restoreSuppressedSources.reverse()) {
      try {
        restore();
      } catch {
        /* best-effort restore */
      }
    }
  }
}

function tokenInterfaceSurfaces(token) {
  return [
    ['detectionFilterMesh', token?.detectionFilterMesh],
    ['voidMesh', token?.voidMesh],
    ['border', token?.border],
    ['nameplate', token?.nameplate],
    ['bars', token?.bars],
    ['tooltip', token?.tooltip],
    ['levelIndicator', token?.levelIndicator],
    ['effects', token?.effects],
    ['targetArrows', token?.targetArrows],
    ['targetPips', token?.targetPips],
    ['ruler', token?.ruler],
    ['turnMarker', token?.turnMarker],
    ['turnMarkerMesh', token?.turnMarker?.mesh],
    ['ring', token?.ring],
    ['ringMesh', token?.ring?.mesh],
    ['ringSubject', token?.ring?.subject],
  ].filter(([, surface]) => surface && 'visible' in surface);
}

function capturePendingRenderState(token) {
  if (!token) return null;
  if (token[PENDING_MOVEMENT_RENDER_STATE_KEY]) {
    pendingMovementRenderLockedTokens.add(token);
    return token[PENDING_MOVEMENT_RENDER_STATE_KEY];
  }

  const state = {
    tokenVisible: token.visible,
    tokenRenderable: token.renderable,
    meshVisible: token.mesh?.visible,
    meshRenderable: token.mesh?.renderable,
    meshAlpha: token.mesh?.alpha,
    lastForcedAt: null,
    lastHiddenContext: null,
    surfaceVisibility: tokenInterfaceSurfaces(token).map(([name, surface]) => ({
      name,
      surface,
      visible: surface.visible,
    })),
  };

  try {
    token[PENDING_MOVEMENT_RENDER_STATE_KEY] = state;
    pendingMovementRenderLockedTokens.add(token);
  } catch {
    /* best-effort render restore */
  }

  return state;
}

function hideVisibleSurface(surface) {
  if (!surface || !('visible' in surface)) return false;

  try {
    surface.visible = false;
    return true;
  } catch {
    return false;
  }
}

function hiddenRenderLockCanBeBypassedByVisibilityProbe(token, context) {
  if (!hiddenStateVisibilityProbeCanBypassRenderLock(token, context)) return false;

  const observer = tokenObjectForId(context?.observerId);
  return (
    !!context &&
    !!observer &&
    pendingHiddenTargetIsVisibleFromCurrentSources(token, context)
  );
}

function hiddenStateVisibilityProbeCanBypassRenderLock(target, context) {
  if (!context || context.foundryHidden) return false;

  const observer = tokenObjectForId(context.observerId);
  return shouldBypassPendingMovementVisionerRenderState(observer, target, context.visibilityState);
}

function clearHiddenRenderLock(token, state) {
  forgetHiddenForceContext(token);
  if (state) {
    state.lastForcedAt = null;
    state.lastHiddenContext = null;
  }
}

export function restorePendingMovementTokenRendering(
  token,
  { ignoreObservedGrace = false, ignoreObserverLocks = false } = {},
) {
  const state = token?.[PENDING_MOVEMENT_RENDER_STATE_KEY];
  if (!token || !state) return false;

  if (ignoreObserverLocks) {
    clearHiddenRenderLock(token, state);
  } else {
    const hiddenStateContext = getPendingMovementHiddenStateContext(token);
    if (hiddenStateContext) {
      if (hiddenRenderLockCanBeBypassedByVisibilityProbe(token, hiddenStateContext)) {
        clearHiddenRenderLock(token, state);
      } else {
        return false;
      }
    }

    const controlledHiddenStateContext = getControlledObserverHiddenStateContext(token);
    if (controlledHiddenStateContext) {
      if (hiddenRenderLockCanBeBypassedByVisibilityProbe(token, controlledHiddenStateContext)) {
        clearHiddenRenderLock(token, state);
      } else {
        return false;
      }
    }

    const stickyHiddenStateContext = getStickyHiddenRenderLockContext(token, state);
    if (stickyHiddenStateContext) {
      if (ignoreObservedGrace && stickyHiddenStateContext.observedDuringGrace) {
        clearHiddenRenderLock(token, state);
      } else if (hiddenRenderLockCanBeBypassedByVisibilityProbe(token, stickyHiddenStateContext)) {
        clearHiddenRenderLock(token, state);
      } else {
        return false;
      }
    }
  }

  try {
    if (state.tokenVisible !== undefined) token.visible = state.tokenVisible;
    token.renderable = state.tokenRenderable;
    if (token.mesh) {
      if ('visible' in token.mesh && state.meshVisible !== undefined) {
        token.mesh.visible = state.meshVisible;
      }
      if ('renderable' in token.mesh) token.mesh.renderable = state.meshRenderable;
      if ('alpha' in token.mesh && state.meshAlpha !== undefined) token.mesh.alpha = state.meshAlpha;
    }
    for (const { surface, visible } of state.surfaceVisibility || []) {
      try {
        if (surface && 'visible' in surface) surface.visible = visible;
      } catch {
        /* best-effort surface restore */
      }
    }
    delete token[PENDING_MOVEMENT_RENDER_STATE_KEY];
    pendingMovementRenderLockedTokens.delete(token);
    forgetHiddenForceContext(token);
  } catch {
    return false;
  }

  return true;
}

export function forcePendingMovementTokenInvisible(token) {
  if (!token) return;

  const state = capturePendingRenderState(token);
  const hiddenRenderLockContext =
    getHiddenRenderLockContext(token) || getRememberedHiddenForceContext(token);
  if (state) {
    state.lastForcedAt = Date.now();
    state.lastHiddenContext = hiddenRenderLockContext
      ? rememberHiddenForceContext(token, hiddenRenderLockContext)
      : null;
  }
  if (!hiddenRenderLockContext) {
    forgetHiddenForceContext(token);
  }

  token.visible = false;
  token.renderable = false;
  if (token.mesh) token.mesh.visible = false;
  if (token.mesh && 'renderable' in token.mesh) token.mesh.renderable = false;
  if (token.mesh && 'alpha' in token.mesh) token.mesh.alpha = 0;
  token.detectionFilter = null;
  for (const [, surface] of tokenInterfaceSurfaces(token)) {
    hideVisibleSurface(surface);
  }
}

export function clearPendingTokenMovementPosition(tokenId) {
  if (!tokenId) return;

  const completionTimeoutId = pendingTokenMovementCompletionTimeouts.get(tokenId);
  if (completionTimeoutId) {
    clearTimeout(completionTimeoutId);
    pendingTokenMovementCompletionTimeouts.delete(tokenId);
  }

  const entry = pendingTokenMovementPositions.get(tokenId);
  if (entry?.timeoutId) {
    clearTimeout(entry.timeoutId);
  }
  pendingTokenMovementPositions.delete(tokenId);
}

export function setPendingTokenMovementPosition(
  tokenDoc,
  changes = {},
  controlledTokens = canvas?.tokens?.controlled || [],
) {
  const tokenId = tokenIdOf(tokenDoc);
  if (!tokenId || !('x' in changes || 'y' in changes)) return false;
  if (!isControlledTokenDocument(tokenDoc, controlledTokens)) return false;

  const serial = ++pendingMovementSerial;
  const position = {
    x: changes.x ?? tokenDoc?.x ?? tokenDoc?.document?.x ?? 0,
    y: changes.y ?? tokenDoc?.y ?? tokenDoc?.document?.y ?? 0,
  };

  clearPendingTokenMovementPosition(tokenId);

  const timeoutId = setTimeout(() => {
    completePendingTokenMovement(tokenId, serial);
  }, PENDING_MOVEMENT_TTL_MS);

  pendingTokenMovementPositions.set(tokenId, {
    tokenDoc,
    position,
    serial,
    expiresAt: Date.now() + PENDING_MOVEMENT_TTL_MS,
    timeoutId,
  });

  return true;
}

export function getPendingTokenMovementPosition(tokenId) {
  cleanupExpiredPendingMovements();
  return pendingTokenMovementPositions.get(tokenId)?.position || null;
}

export function completePendingTokenMovement(
  tokenOrId,
  expectedSerial = null,
) {
  const tokenId = typeof tokenOrId === 'string' ? tokenOrId : tokenIdOf(tokenOrId);
  if (!tokenId) return false;

  const entry = pendingTokenMovementPositions.get(tokenId);
  if (!entry) return false;
  if (expectedSerial !== null && entry.serial !== expectedSerial) return false;

  clearPendingTokenMovementPosition(tokenId);
  refreshPendingMovementTokenVisibility([], { ignoreObservedGrace: true });

  return true;
}

export function schedulePendingTokenMovementCompletion(tokenDoc) {
  const tokenId = tokenIdOf(tokenDoc);
  if (!tokenId) return false;

  const entry = pendingTokenMovementPositions.get(tokenId);
  if (!entry) return false;

  const completionTimeoutId = pendingTokenMovementCompletionTimeouts.get(tokenId);
  if (completionTimeoutId) {
    clearTimeout(completionTimeoutId);
    pendingTokenMovementCompletionTimeouts.delete(tokenId);
  }

  const serial = entry.serial;
  const complete = () => completePendingTokenMovement(tokenId, serial);
  const token = tokenDoc?.object || tokenObjectForId(tokenId);
  const animation = token?._animation;
  if (animation?.promise && animation.state !== 'completed') {
    animation.promise.finally(complete);
    return true;
  }

  const timeoutId = setTimeout(() => {
    pendingTokenMovementCompletionTimeouts.delete(tokenId);
    const deferredAnimation = (tokenDoc?.object || tokenObjectForId(tokenId))?._animation;
    if (deferredAnimation?.promise && deferredAnimation.state !== 'completed') {
      deferredAnimation.promise.finally(complete);
      return;
    }
    complete();
  }, PENDING_MOVEMENT_ANIMATION_DETECTION_DELAY_MS);
  pendingTokenMovementCompletionTimeouts.set(tokenId, timeoutId);
  return true;
}

export function shouldTemporarilyBlockHiddenDetection(observer, target, visibilityState) {
  if (!HIDDEN_FROM_OBSERVER_STATES.has(visibilityState)) return false;

  return shouldTemporarilyBlockSightDetection(observer, target);
}

export function shouldTemporarilyBlockSightDetection(observer, target) {
  const context = getPendingMovementBlockContext(observer, target);
  if (!context.active) return false;

  return contextBlocksPendingDetection(context);
}

function getPendingMovementBlockedDetectionEntries(
  target,
  {
    visionSources = canvas?.effects?.visionSources || [],
    lightSources = canvas?.effects?.lightSources || [],
  } = {},
) {
  if (!target?.document?.id) return [];
  if (!hasPendingMovementDetectionWork({ visionSources, lightSources })) return [];

  const blockedEntries = [];
  for (const source of [...sourceList(visionSources), ...sourceList(lightSources)]) {
    if (!source?.active || !source?.object) continue;

    const context = getPendingMovementBlockContext(source.object, target);
    if (!context.active) continue;

    if (contextBlocksPendingDetection(context)) {
      blockedEntries.push({ source, context });
    }
  }

  const seenSources = new Set();
  return blockedEntries.filter(({ source }) => {
    if (seenSources.has(source)) return false;
    seenSources.add(source);
    return true;
  });
}

export function getPendingMovementBlockedDetectionSources(target, options = {}) {
  const blockedEntries = getPendingMovementBlockedDetectionEntries(target, options);
  return blockedEntries.map(({ source }) => source);
}

export function withPendingMovementBlockedDetectionSourcesSuppressed(target, callback) {
  const blockedEntries = getPendingMovementBlockedDetectionEntries(target);
  const blockedSources = blockedEntries.map(({ source }) => source);
  return withSuppressedDetectionSources(
    blockedSources,
    () =>
      callback?.(
        blockedSources,
        blockedEntries,
        isPendingMovementHiddenStateVisibilityProbe()
          ? null
          : getPendingMovementHiddenStateContext(target),
      ) ??
      false,
  );
}

export function getPendingMovementHiddenStateBlock(target) {
  return getPendingMovementHiddenStateContext(target);
}

function pendingHiddenTargetIsVisibleFromCurrentSources(target, hiddenStateContext) {
  const testPoints = target?.document?.getVisibilityTestPoints?.();
  const testVisibility = canvas?.visibility?.testVisibility;
  if (!testPoints?.length || !testVisibility) return false;

  try {
    return withPendingMovementHiddenStateVisibilityProbe(() =>
      withOnlyDetectionSourcesForObserver(hiddenStateContext?.observerId, () =>
        !!testVisibility.call(canvas.visibility, testPoints, {
          tolerance: 0,
          object: target,
        }),
      ),
    );
  } catch {
    return false;
  }
}

export function shouldTemporarilyForceTokenInvisible(
  target,
  { hasDetectionWork = null } = {},
) {
  if (!target?.document?.id) return false;
  if (target.controlled) return false;
  if (hasDetectionWork === null && !hasPendingMovementDetectionWork()) return false;
  if (hasDetectionWork === false) return false;

  const hiddenStateContext = getPendingMovementHiddenStateContext(target);
  if (hiddenStateContext) {
    if (
      hiddenStateVisibilityProbeCanBypassRenderLock(target, hiddenStateContext) &&
      pendingHiddenTargetIsVisibleFromCurrentSources(target, hiddenStateContext)
    ) {
      forgetHiddenForceContext(target);
      return false;
    }

    rememberHiddenForceContext(target, hiddenStateContext);
    return true;
  }

  const blockedEntries = getPendingMovementBlockedDetectionEntries(target);
  if (!blockedEntries.length) return false;

  const hiddenBlockedEntry = blockedEntries.find(
    ({ context }) => context.hiddenByVisioner || context.foundryHidden,
  );
  if (hiddenBlockedEntry) {
    rememberHiddenForceContext(target, hiddenBlockedEntry.context);
    return true;
  }

  const blockedSources = blockedEntries.map(({ source }) => source);

  return withSuppressedDetectionSources(blockedSources, () => {
    const testPoints = target.document.getVisibilityTestPoints?.();
    const testVisibility = canvas?.visibility?.testVisibility;
    if (!testPoints?.length || !testVisibility) return false;

    const shouldForceInvisible = !testVisibility.call(canvas.visibility, testPoints, {
      tolerance: 0,
      object: target,
    });

    return shouldForceInvisible;
  });
}

export function hasPendingMovementRenderWork() {
  cleanupExpiredPendingMovements();
  if (pendingTokenMovementPositions.size > 0) return true;
  if (pendingTokenMovementCompletionTimeouts.size > 0) return true;
  if (pendingTokenHiddenForceContexts.size > 0) return true;
  if (pendingMovementRenderLockedTokens.size === 0) return false;

  const sceneTokens = new Set(canvas?.tokens?.placeables || []);
  for (const token of [...pendingMovementRenderLockedTokens]) {
    if (!token?.[PENDING_MOVEMENT_RENDER_STATE_KEY] || !sceneTokens.has(token)) {
      pendingMovementRenderLockedTokens.delete(token);
    }
  }

  return pendingMovementRenderLockedTokens.size > 0;
}

export function refreshPendingMovementTokenVisibility(
  movingTokenIds = [],
  { ignoreObservedGrace = false } = {},
) {
  const ids = new Set(
    (Array.isArray(movingTokenIds) ? movingTokenIds : [movingTokenIds]).filter(Boolean),
  );
  const tokens = canvas?.tokens?.placeables || [];
  const hasDetectionWork = hasPendingMovementDetectionWork();

  for (const token of tokens) {
    if (ids.has(tokenIdOf(token))) continue;
    try {
      if (shouldTemporarilyForceTokenInvisible(token, { hasDetectionWork })) {
        forcePendingMovementTokenInvisible(token);
      } else {
        restorePendingMovementTokenRendering(token, { ignoreObservedGrace });
      }
      token?.refresh?.();
    } catch {
      /* best-effort visual refresh */
    }
  }

  try {
    canvas?.perception?.update?.({ refreshVision: true, refreshOcclusion: true });
  } catch {
    /* best-effort perception refresh */
  }
}
