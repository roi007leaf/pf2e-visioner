import { MODULE_ID } from '../constants.js';

const PENDING_MOVEMENT_TTL_MS = 2500;
const PENDING_MOVEMENT_RENDER_LOCK_GRACE_MS = 1000;
const PENDING_MOVEMENT_ANIMATION_DETECTION_DELAY_MS = 50;
const PENDING_MOVEMENT_ANIMATION_DETECTION_SETTLE_MS = 250;
const PENDING_MOVEMENT_POST_COMPLETION_REFRESH_DELAYS_MS = [100, 300, 700, 1200];
const PENDING_MOVEMENT_MAX_ROUTE_POINTS = 96;
const HIDDEN_FROM_OBSERVER_STATES = new Set(['concealed', 'hidden', 'undetected', 'unnoticed']);
const RENDER_HIDDEN_FROM_OBSERVER_STATES = new Set(['hidden', 'undetected', 'unnoticed']);
const NPC_RENDER_VISIBLE_STATES = new Set(['hidden']);
const PENDING_MOVEMENT_SUPPRESSION_KEY = 'pf2eVisionerPendingMovement';
const PENDING_MOVEMENT_RENDER_STATE_KEY = '_pf2eVisionerPendingRenderState';

const pendingTokenMovementPositions = new Map();
const pendingTokenMovementCompletionTimeouts = new Map();
const pendingTokenHiddenForceContexts = new Map();
const pendingMovementRenderLockedTokens = new Set();
const pendingMovementPostCompletionRefreshTimeouts = new Map();
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

function finiteCoordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cloneMovementPosition(position) {
  const x = finiteCoordinate(position?.x);
  const y = finiteCoordinate(position?.y);
  if (x === null || y === null) return null;
  return { x, y };
}

function movementPositionFromCenter(tokenOrDoc, center) {
  const x = finiteCoordinate(center?.x);
  const y = finiteCoordinate(center?.y);
  if (x === null || y === null) return null;

  const dimensions = tokenDimensions(tokenOrDoc);
  return {
    x: x - dimensions.width / 2,
    y: y - dimensions.height / 2,
  };
}

function movementPositionFromWaypoint(tokenOrDoc, waypoint) {
  if (!waypoint) return null;

  if (Array.isArray(waypoint)) {
    return cloneMovementPosition({ x: waypoint[0], y: waypoint[1] });
  }

  if (waypoint.center) return movementPositionFromCenter(tokenOrDoc, waypoint.center);
  if (waypoint.destination) return cloneMovementPosition(waypoint.destination);
  if (waypoint.position) return cloneMovementPosition(waypoint.position);
  if (waypoint.point) return cloneMovementPosition(waypoint.point);
  if (waypoint.B) return movementPositionFromCenter(tokenOrDoc, waypoint.B);
  if (waypoint.ray?.B) return movementPositionFromCenter(tokenOrDoc, waypoint.ray.B);

  return cloneMovementPosition(waypoint);
}

function movementWaypointArraysFromOptions(options = {}, changes = {}) {
  const hookOptions = options.hookOptions || options.options || null;
  const candidates = [
    options.waypoints,
    options.path,
    options.route,
    options.movement?.waypoints,
    options.movement?.path,
    options.movement?.route,
    options.animation?.waypoints,
    options.animation?.path,
    options.animation?.route,
    options.animation?.movement?.waypoints,
    hookOptions?.waypoints,
    hookOptions?.path,
    hookOptions?.route,
    hookOptions?.movement?.waypoints,
    hookOptions?.movement?.path,
    hookOptions?.movement?.route,
    hookOptions?.animation?.waypoints,
    hookOptions?.animation?.path,
    hookOptions?.animation?.route,
    hookOptions?.animation?.movement?.waypoints,
    changes.waypoints,
    changes.path,
    changes.route,
    changes.movement?.waypoints,
    changes.movement?.path,
    changes.movement?.route,
  ];

  return candidates.filter((candidate) => Array.isArray(candidate) && candidate.length);
}

function positionsEqual(a, b) {
  return a && b && Math.abs(a.x - b.x) < 0.001 && Math.abs(a.y - b.y) < 0.001;
}

function pushUniqueMovementPosition(positions, position) {
  if (!position) return;
  if (positions.length && positionsEqual(positions[positions.length - 1], position)) return;
  positions.push(position);
}

function buildPendingMovementRoutePositions(tokenDoc, changes = {}, options = {}) {
  const routePositions = [];
  pushUniqueMovementPosition(
    routePositions,
    cloneMovementPosition({
      x: tokenDoc?.x ?? tokenDoc?.document?.x ?? 0,
      y: tokenDoc?.y ?? tokenDoc?.document?.y ?? 0,
    }),
  );

  for (const waypoints of movementWaypointArraysFromOptions(options, changes)) {
    for (const waypoint of waypoints) {
      pushUniqueMovementPosition(routePositions, movementPositionFromWaypoint(tokenDoc, waypoint));
    }
  }

  pushUniqueMovementPosition(
    routePositions,
    cloneMovementPosition({
      x: changes.x ?? tokenDoc?.x ?? tokenDoc?.document?.x ?? 0,
      y: changes.y ?? tokenDoc?.y ?? tokenDoc?.document?.y ?? 0,
    }),
  );
  return routePositions;
}

function sampleMovementRoutePoints(tokenDoc, routePositions) {
  const gridSize = Math.max(1, Number(canvas?.grid?.size ?? 50));
  const sampleDistance = Math.max(1, gridSize / 2);
  const maxSamplesPerSegment = 32;
  const centers = routePositions.map((position) => centerForToken(tokenDoc, position)).filter(Boolean);
  if (centers.length <= 1) return centers;

  const segmentLengths = [];
  let uncappedPointCount = 1;
  let totalDistance = 0;
  for (let i = 0; i < centers.length - 1; i += 1) {
    const start = centers[i];
    const end = centers[i + 1];
    const distance = Math.hypot(end.x - start.x, end.y - start.y);
    segmentLengths.push(distance);
    const steps = Math.max(
      1,
      Math.min(maxSamplesPerSegment, Math.ceil(distance / sampleDistance)),
    );
    uncappedPointCount += steps;
    totalDistance += distance;
  }

  if (uncappedPointCount <= PENDING_MOVEMENT_MAX_ROUTE_POINTS || totalDistance <= 0) {
    const routePoints = [];
    for (let i = 0; i < centers.length; i += 1) {
      const start = centers[i];
      const end = centers[i + 1];
      if (!end) {
        routePoints.push(start);
        continue;
      }

      const distance = segmentLengths[i];
      const steps = Math.max(
        1,
        Math.min(maxSamplesPerSegment, Math.ceil(distance / sampleDistance)),
      );
      for (let step = 0; step < steps; step += 1) {
        const t = step / steps;
        routePoints.push({
          x: start.x + (end.x - start.x) * t,
          y: start.y + (end.y - start.y) * t,
        });
      }
    }

    return routePoints;
  }

  const routePoints = [];
  let segmentIndex = 0;
  let segmentStartDistance = 0;
  for (let sampleIndex = 0; sampleIndex < PENDING_MOVEMENT_MAX_ROUTE_POINTS; sampleIndex += 1) {
    const distanceAlongRoute =
      (totalDistance * sampleIndex) / (PENDING_MOVEMENT_MAX_ROUTE_POINTS - 1);
    while (
      segmentIndex < segmentLengths.length - 1 &&
      distanceAlongRoute > segmentStartDistance + segmentLengths[segmentIndex]
    ) {
      segmentStartDistance += segmentLengths[segmentIndex];
      segmentIndex += 1;
    }

    const start = centers[segmentIndex];
    const end = centers[segmentIndex + 1] ?? start;
    const segmentLength = segmentLengths[segmentIndex] || 0;
    if (segmentLength <= 0) {
      routePoints.push(start);
    } else {
      const t = (distanceAlongRoute - segmentStartDistance) / segmentLength;
      routePoints.push({
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t,
      });
    }
  }

  return routePoints;
}

function cleanupExpiredPendingMovements(now = Date.now()) {
  for (const [tokenId, entry] of pendingTokenMovementPositions.entries()) {
    if (!entry || entry.expiresAt <= now) {
      pendingTokenMovementPositions.delete(tokenId);
    }
  }
}

function hasActivePendingMovementForObserver(observerId) {
  if (!observerId) return false;
  cleanupExpiredPendingMovements();
  return pendingTokenMovementPositions.has(observerId);
}

function isControlledTokenDocument(tokenDoc, controlledTokens = canvas?.tokens?.controlled || []) {
  const tokenId = tokenIdOf(tokenDoc);
  if (!tokenId) return false;

  return controlledTokens.some((token) => tokenIdOf(token) === tokenId);
}

function currentUserOwnsMovedToken(tokenDoc, userId = null) {
  const currentUser = game?.user;
  if (!tokenDoc || !currentUser || currentUser.isGM) return false;
  if (userId && userId !== currentUser.id) return false;

  try {
    if (tokenDoc.testUserPermission?.(currentUser, 'OWNER')) return true;
  } catch {
    /* fall through to local ownership hints */
  }

  const ownerLevel = Number(globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3);
  const ownershipValue = Number(
    tokenDoc.ownership?.[currentUser.id] ?? tokenDoc.actor?.ownership?.[currentUser.id],
  );
  return (
    tokenDoc.isOwner === true ||
    tokenDoc.object?.isOwner === true ||
    tokenDoc.actor?.isOwner === true ||
    (Number.isFinite(ownershipValue) && ownershipValue >= ownerLevel)
  );
}

function getPendingMovementTrackingReason(tokenDoc, controlledTokens, options = {}) {
  if (isControlledTokenDocument(tokenDoc, controlledTokens)) return 'controlled-token';
  if (currentUserOwnsMovedToken(tokenDoc, options.userId)) return 'player-owned-token';
  return null;
}

function isControlledMovementPreviewToken(tokenOrDoc) {
  const token = tokenOrDoc?.document ? tokenOrDoc : null;
  if (!token?.isPreview || !token?._original) return false;
  if (token._previewType === 'config') return false;

  return isControlledTokenDocument(token._original);
}

function movementAnimationIsRunning(animation) {
  if (!animation || animation.state === 'completed') return false;
  return !!animation.promise || !!animation.active || animation.state !== undefined;
}

function movementAnimationInfo(animation) {
  if (!animation) return null;
  return {
    state: animation.state ?? null,
    active: animation.active ?? null,
    hasPromise: !!animation.promise,
  };
}

function addPostCompletionRefreshTimeout(tokenId, timeoutId) {
  if (!tokenId || !timeoutId) return;
  if (!pendingMovementPostCompletionRefreshTimeouts.has(tokenId)) {
    pendingMovementPostCompletionRefreshTimeouts.set(tokenId, new Set());
  }
  pendingMovementPostCompletionRefreshTimeouts.get(tokenId).add(timeoutId);
}

function removePostCompletionRefreshTimeout(tokenId, timeoutId) {
  const timeouts = pendingMovementPostCompletionRefreshTimeouts.get(tokenId);
  if (!timeouts) return;
  timeouts.delete(timeoutId);
  if (!timeouts.size) pendingMovementPostCompletionRefreshTimeouts.delete(tokenId);
}

function clearPostCompletionRenderRefreshes(tokenId) {
  const timeouts = pendingMovementPostCompletionRefreshTimeouts.get(tokenId);
  if (!timeouts) return;

  for (const timeoutId of timeouts) {
    clearTimeout(timeoutId);
  }
  pendingMovementPostCompletionRefreshTimeouts.delete(tokenId);
}

function schedulePostCompletionRenderRefreshes(tokenId, serial) {
  clearPostCompletionRenderRefreshes(tokenId);
  for (const delayMs of PENDING_MOVEMENT_POST_COMPLETION_REFRESH_DELAYS_MS) {
    const timeoutId = setTimeout(() => {
      removePostCompletionRefreshTimeout(tokenId, timeoutId);
      if (hasActivePendingMovementForObserver(tokenId)) {
        return;
      }

      if (!hasPendingMovementRenderWork()) {

        return;
      }

      refreshPendingMovementTokenVisibility([], { ignoreObservedGrace: true });
    }, delayMs);
    addPostCompletionRefreshTimeout(tokenId, timeoutId);
  }
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
  const pendingMovementEntry = getPendingTokenMovementEntry(observerId);
  const pendingPosition = pendingMovementEntry?.position ?? null;
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
  const originPoints =
    pendingMovementEntry?.routePoints?.length
      ? pendingMovementEntry.routePoints
      : [originPoint].filter(Boolean);
  const targetPoint = centerForToken(target);
  const wallBlocked = originPoints.some((point) => lineOfSightBlockedByWall(point, targetPoint));
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
    originPointCount: originPoints.length,
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
    wallBlocked: !!context.wallBlocked,
    blocked: !!context.blocked,
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

function getPendingMovementRenderLockContext(target) {
  const hiddenRenderLockContext = getHiddenRenderLockContext(target);
  if (hiddenRenderLockContext) return hiddenRenderLockContext;

  const blockedEntry = getPendingMovementBlockedDetectionEntries(target)[0];
  if (blockedEntry?.context) return blockedEntry.context;

  return getRememberedHiddenForceContext(target);
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
  const activePendingMovementLock =
    !!lockContext.wallBlocked && hasActivePendingMovementForObserver(lockContext.observerId);
  if (activePendingMovementLock) {
    return {
      ...lockContext,
      foundryHidden: foundryHidden || lockContext.foundryHidden,
      activePendingMovementLock: true,
      elapsedMs,
      renderLockGraceMs: PENDING_MOVEMENT_RENDER_LOCK_GRACE_MS,
    };
  }

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
    getPendingMovementRenderLockContext(token) || getRememberedHiddenForceContext(token);
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
  clearPostCompletionRenderRefreshes(tokenId);

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
  options = {},
) {
  const tokenId = tokenIdOf(tokenDoc);
  if (!tokenId || !('x' in changes || 'y' in changes)) return false;
  const trackingReason = getPendingMovementTrackingReason(tokenDoc, controlledTokens, options);
  if (!trackingReason) {

    return false;
  }

  const serial = ++pendingMovementSerial;
  const routePositions = buildPendingMovementRoutePositions(tokenDoc, changes, options);
  const position = routePositions[routePositions.length - 1] ?? {
    x: changes.x ?? tokenDoc?.x ?? tokenDoc?.document?.x ?? 0,
    y: changes.y ?? tokenDoc?.y ?? tokenDoc?.document?.y ?? 0,
  };
  const routePoints = sampleMovementRoutePoints(tokenDoc, routePositions);

  clearPendingTokenMovementPosition(tokenId);

  const timeoutId = setTimeout(() => {
    completePendingTokenMovement(tokenId, serial);
  }, PENDING_MOVEMENT_TTL_MS);

  pendingTokenMovementPositions.set(tokenId, {
    tokenDoc,
    position,
    routePositions,
    routePoints,
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

function getPendingTokenMovementEntry(tokenId) {
  cleanupExpiredPendingMovements();
  return pendingTokenMovementPositions.get(tokenId) ?? null;
}

export function completePendingTokenMovement(
  tokenOrId,
  expectedSerial = null,
) {
  const tokenId = typeof tokenOrId === 'string' ? tokenOrId : tokenIdOf(tokenOrId);
  if (!tokenId) return false;

  const entry = pendingTokenMovementPositions.get(tokenId);
  if (!entry) {

    return false;
  }
  if (expectedSerial !== null && entry.serial !== expectedSerial) {

    return false;
  }

  clearPendingTokenMovementPosition(tokenId);
  refreshPendingMovementTokenVisibility([], { ignoreObservedGrace: true });
  schedulePostCompletionRenderRefreshes(tokenId, entry.serial);

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
  const startedAt = Date.now();
  const complete = () => completePendingTokenMovement(tokenId, serial);
  const initialAnimation = (tokenDoc?.object || tokenObjectForId(tokenId))?._animation;

  if (initialAnimation?.promise && movementAnimationIsRunning(initialAnimation)) {
    initialAnimation.promise.finally(complete);
    return true;
  }

  const waitForAnimationOrComplete = () => {
    pendingTokenMovementCompletionTimeouts.delete(tokenId);
    const currentEntry = pendingTokenMovementPositions.get(tokenId);
    if (!currentEntry || currentEntry.serial !== serial) {
      return;
    }

    const token = tokenDoc?.object || tokenObjectForId(tokenId);
    const deferredAnimation = token?._animation;
    const elapsedMs = Date.now() - startedAt;

    if (deferredAnimation?.promise && movementAnimationIsRunning(deferredAnimation)) {

      deferredAnimation.promise.finally(complete);
      return;
    }
    if (
      movementAnimationIsRunning(deferredAnimation) &&
      elapsedMs < PENDING_MOVEMENT_TTL_MS
    ) {

      const timeoutId = setTimeout(
        waitForAnimationOrComplete,
        PENDING_MOVEMENT_ANIMATION_DETECTION_DELAY_MS,
      );
      pendingTokenMovementCompletionTimeouts.set(tokenId, timeoutId);
      return;
    }

    if (elapsedMs < PENDING_MOVEMENT_ANIMATION_DETECTION_SETTLE_MS) {

      const timeoutId = setTimeout(
        waitForAnimationOrComplete,
        PENDING_MOVEMENT_ANIMATION_DETECTION_DELAY_MS,
      );
      pendingTokenMovementCompletionTimeouts.set(tokenId, timeoutId);
      return;
    }

    complete();
  };

  const timeoutId = setTimeout(
    waitForAnimationOrComplete,
    PENDING_MOVEMENT_ANIMATION_DETECTION_DELAY_MS,
  );
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
  const renderLockContext = blockedEntries[0]?.context ?? null;

  return withSuppressedDetectionSources(blockedSources, () => {
    const testPoints = target.document.getVisibilityTestPoints?.();
    const testVisibility = canvas?.visibility?.testVisibility;
    if (!testPoints?.length || !testVisibility) return false;

    const shouldForceInvisible = !testVisibility.call(canvas.visibility, testPoints, {
      tolerance: 0,
      object: target,
    });
    if (shouldForceInvisible && renderLockContext) {
      rememberHiddenForceContext(target, renderLockContext);
    }

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
      const shouldForceInvisible = shouldTemporarilyForceTokenInvisible(token, { hasDetectionWork });
      token?.refresh?.();
      if (shouldForceInvisible) {
        forcePendingMovementTokenInvisible(token);
      } else {
        const restored = restorePendingMovementTokenRendering(token, { ignoreObservedGrace });
        if (!restored && token?.[PENDING_MOVEMENT_RENDER_STATE_KEY]) {
          forcePendingMovementTokenInvisible(token);
        }
      }
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
