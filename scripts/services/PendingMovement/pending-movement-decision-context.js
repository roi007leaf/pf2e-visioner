import { cachePendingMovementEvaluation } from './pending-movement-evaluation-cache.js';
import { centerForToken } from './pending-movement-geometry.js';
import {
  createPositionedTokenProxy,
  observerCanHearTarget,
} from './pending-movement-observer-senses.js';
import {
  lineOfSightBlockedByWall,
  lineOfSoundBlockedByWall,
  sceneHasBlockingWallSense,
} from './pending-movement-wall-blocking.js';

const wallCollectionIds = new WeakMap();
let nextWallCollectionId = 1;

function pointEvaluationKey(point) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const elevation = Number(point?.elevation ?? point?.z ?? 0);
  return `${x},${y},${Number.isFinite(elevation) ? elevation : 0}`;
}

function pointListEvaluationKey(points) {
  if (!points?.length) return 'none';
  return points.map((point) => pointEvaluationKey(point) ?? 'invalid').join('|');
}

function stableObjectId(object, idMap) {
  if (!object || (typeof object !== 'object' && typeof object !== 'function')) return 'none';

  let id = idMap.get(object);
  if (!id) {
    id = nextWallCollectionId;
    nextWallCollectionId += 1;
    idMap.set(object, id);
  }
  return String(id);
}

function collectionSizeEvaluationKey(collection) {
  if (!collection) return 0;

  const length = Number(collection.length);
  if (Number.isFinite(length)) return length;

  const size = Number(collection.size);
  if (Number.isFinite(size)) return size;

  return 'unknown';
}

function wallCollectionEvaluationKey() {
  const walls = canvas?.walls?.placeables || null;
  const sceneId = canvas?.scene?.id ?? canvas?.scene?._id ?? 'scene';
  const collectionId = stableObjectId(walls, wallCollectionIds);
  return `${sceneId}:${collectionId}:${collectionSizeEvaluationKey(walls)}`;
}

function sceneHasBlockingWallSenseForPendingMovement(senseType) {
  return cachePendingMovementEvaluation(
    'sceneBlockingWallSense',
    senseType,
    () => sceneHasBlockingWallSense(senseType),
  );
}

function getRouteWallBlockedCache(entry) {
  if (!entry) return null;
  if (!entry.routeWallBlockedCache) entry.routeWallBlockedCache = new Map();
  return entry.routeWallBlockedCache;
}

function getWallLineBlockedCache(entry) {
  if (!entry) return null;
  if (!entry.wallLineBlockedCache) entry.wallLineBlockedCache = new Map();
  return entry.wallLineBlockedCache;
}

function wallLineBlockedForPendingMovement({
  entry,
  target,
  targetPoint,
  originPoint,
  senseType,
  tokenIdOf,
  calculate,
}) {
  if (!originPoint || !targetPoint || !senseType || typeof calculate !== 'function') return false;

  const cache = getWallLineBlockedCache(entry);
  const targetId = tokenIdOf(target) || 'unknown';
  const originPointKey = pointEvaluationKey(originPoint) || 'invalid-origin';
  const targetPointKey = pointEvaluationKey(targetPoint) || 'invalid-target';
  const cacheKey = `${entry?.serial ?? 'preview'}:${senseType}:${targetId}:${originPointKey}:${targetPointKey}:${wallCollectionEvaluationKey()}`;
  if (cache?.has(cacheKey)) return cache.get(cacheKey);

  const blocked = calculate();
  cache?.set(cacheKey, blocked);
  return blocked;
}

function routeWallBlockedForPendingMovement({
  entry,
  observer,
  target,
  targetPoint,
  originPoints,
  tokenIdOf,
}) {
  if (!originPoints?.length || !targetPoint) return false;

  const cache = getRouteWallBlockedCache(entry);
  const targetId = tokenIdOf(target) || 'unknown';
  const targetPointKey = pointEvaluationKey(targetPoint) || 'invalid-target';
  const routePointKey = pointListEvaluationKey(originPoints);
  const cacheKey = `${entry?.serial ?? 'preview'}:${targetId}:${targetPointKey}:${routePointKey}:${wallCollectionEvaluationKey()}`;
  if (cache?.has(cacheKey)) return cache.get(cacheKey);

  const blocked = originPoints.some((point) =>
    lineOfSightBlockedByWall(point, targetPoint, { originToken: observer, targetToken: target }),
  );
  cache?.set(cacheKey, blocked);
  return blocked;
}

export function createPendingMovementDecisionContextController({
  getPendingMovementVisibilityState,
  getPendingTokenMovementEntry,
  hasCoreOwnedPendingMovement,
  isControlledMovementPreviewToken,
  isControlledTokenDragActive,
  isTokenLikeTarget,
  tokenDocOf,
  tokenIdOf,
  tokenObjectForId,
  visionerStateBlocksPendingDetection,
  visionerStateHidesTargetRendering,
  withPendingMovementDecisionCache,
} = {}) {
  function observerTargetEvaluationKey(observer, target) {
    const observerId = tokenIdOf(observer);
    const targetId = tokenIdOf(target);
    return observerId && targetId ? `${observerId}>${targetId}` : null;
  }

  function getPendingMovementBlockContextUncached(observer, target) {
    const observerId = tokenIdOf(observer);
    const targetId = tokenIdOf(target);
    if (!isTokenLikeTarget(target)) {
      return {
        active: false,
        observerId,
        targetId,
        targetIsToken: false,
      };
    }

    const pendingMovementEntry = getPendingTokenMovementEntry(observerId);
    const pendingPosition = pendingMovementEntry?.position ?? null;
    const isMovementPreview = isControlledMovementPreviewToken(observer);
    const isControlledDrag = isControlledTokenDragActive(observer);
    if (!pendingPosition && !isMovementPreview && !isControlledDrag) {
      return {
        active: false,
        observerId,
        pendingPosition,
        isMovementPreview,
        isControlledDrag,
      };
    }

    const currentOriginPoint = centerForToken(observer);
    const pendingOriginPoint = centerForToken(observer, pendingPosition || null);
    const useCurrentOriginForCoreMovement = hasCoreOwnedPendingMovement(observer, target);
    const originPoint =
      useCurrentOriginForCoreMovement
        ? currentOriginPoint || pendingOriginPoint
        : pendingOriginPoint;
    const originPoints =
      pendingMovementEntry?.budgetedRoutePoints?.length
        ? pendingMovementEntry.budgetedRoutePoints
        : pendingMovementEntry?.routePoints?.length
          ? pendingMovementEntry.routePoints
          : [originPoint].filter(Boolean);
    const targetPoint = centerForToken(target);
    const routeWallBlocked = routeWallBlockedForPendingMovement({
      entry: pendingMovementEntry,
      observer,
      target,
      targetPoint,
      originPoints,
      tokenIdOf,
    });
    const wallBlocked =
      useCurrentOriginForCoreMovement && originPoint
        ? wallLineBlockedForPendingMovement({
            entry: pendingMovementEntry,
            target,
            targetPoint,
            originPoint,
            senseType: 'sight',
            tokenIdOf,
            calculate: () =>
              lineOfSightBlockedByWall(originPoint, targetPoint, {
                originToken: observer,
                targetToken: target,
              }),
          })
        : routeWallBlocked;
    const hearingObserver =
      useCurrentOriginForCoreMovement || !pendingPosition
        ? observer
        : createPositionedTokenProxy(observer, pendingPosition, {
            getTokenObjectForDocument: tokenObjectForId,
          });
    const hearingCanReachTarget =
      wallBlocked &&
      originPoint &&
      targetPoint &&
      observerCanHearTarget(hearingObserver, target);
    const soundWallBlocked =
      hearingCanReachTarget && sceneHasBlockingWallSenseForPendingMovement('sound')
        ? wallLineBlockedForPendingMovement({
            entry: pendingMovementEntry,
            target,
            targetPoint,
            originPoint,
            senseType: 'sound',
            tokenIdOf,
            calculate: () =>
              lineOfSoundBlockedByWall(originPoint, targetPoint, {
                originToken: hearingObserver,
                targetToken: target,
              }),
          })
        : !hearingCanReachTarget;
    const canHearThroughWall = wallBlocked && !soundWallBlocked;
    const wallDetectionBlocked = wallBlocked && !canHearThroughWall;
    const visibilityState = getPendingMovementVisibilityState(observer, target);
    const hiddenByVisioner = visionerStateBlocksPendingDetection(visibilityState);
    const renderHiddenByVisioner = visionerStateHidesTargetRendering(visibilityState);
    const foundryHidden = !!tokenDocOf(target)?.hidden;
    const blocked = wallBlocked || hiddenByVisioner || foundryHidden;
    const renderBlocked = wallDetectionBlocked || renderHiddenByVisioner || foundryHidden;

    return {
      active: true,
      observerId,
      observerName: observer?.name ?? observer?.document?.name,
      targetId,
      targetName: target?.name ?? target?.document?.name,
      hasPendingPosition: !!pendingPosition,
      isMovementPreview,
      isControlledDrag,
      pendingPosition,
      originPoint,
      originPointCount: originPoints.length,
      targetPoint,
      visibilityState,
      hiddenByVisioner,
      renderHiddenByVisioner,
      foundryHidden,
      wallBlocked,
      soundBlocked: wallBlocked && !canHearThroughWall,
      wallDetectionBlocked,
      routeWallBlocked,
      blocked,
      renderBlocked,
    };
  }

  function getPendingMovementBlockContext(observer, target) {
    return withPendingMovementDecisionCache(() =>
      cachePendingMovementEvaluation(
        'blockContext',
        observerTargetEvaluationKey(observer, target),
        () => getPendingMovementBlockContextUncached(observer, target),
      ),
    );
  }

  return {
    getPendingMovementBlockContext,
  };
}
