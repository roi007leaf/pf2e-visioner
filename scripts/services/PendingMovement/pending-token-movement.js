import { MODULE_ID } from '../../constants.js';
import { scheduleCanvasPerceptionUpdate } from '../../helpers/perception-refresh.js';
import {
  isMovementPerformanceDiagnosticsEnabled,
  isPendingMovementVisualRefreshSuppressed,
} from '../runtime-state.js';
import {
  createPendingMovementFinalVisibilityController,
  createPendingVisibilityStateMap,
  mergeMissingPendingVisibilityStateMap,
  normalizePendingVisibilityState as normalizeVisibilityState,
} from './pending-movement-final-visibility.js';
import {
  createPendingMovementCurrentViewSoundwaveController,
} from './pending-movement-current-view-soundwave.js';
import {
  createPendingMovementDecisionContextController,
} from './pending-movement-decision-context.js';
import {
  createPendingMovementDetectionFilterRenderingController,
} from './pending-movement-detection-filter-rendering.js';
import {
  cachePendingMovementEvaluation,
  cachePendingMovementObjectEvaluation,
  withPendingMovementEvaluationCache,
} from './pending-movement-evaluation-cache.js';
import {
  buildPendingMovementRoutePositions,
  centerForToken,
  positionsEqual,
  rebalancePendingMovementRoutePointBudgets,
  sampleMovementRoutePoints,
  tokenSamplePoints,
  tokenVisualMovementPosition,
  tokenVisualPositionReached,
} from './pending-movement-geometry.js';
import {
  captureDetectionFilterMeshState,
  capturePendingMovementDetectionFilterVisualState,
  clearDetectionFilterVisuals,
  restorePendingMovementDetectionFilterState,
  restorePendingMovementDetectionFilterVisualState,
  tokenHasDetectionFilterMeshVisual,
  tokenHasDetectionFilterVisual,
} from './pending-movement-detection-filter-visuals.js';
import {
  hasControlledTokenDragIntent,
  primeControlledTokenDragIntent,
  releaseControlledTokenDragIntent,
} from './pending-movement-controlled-drag-intent.js';
import {
  actorHasConditionSlug,
  observerHasUsableSight,
} from './pending-movement-observer-senses.js';
import {
  clearAnimationRenderRefreshes,
  clearDetectionFilterRestoreTimeouts,
  clearPostCompletionRenderRefreshes,
  scheduleAnimationRenderRefreshes,
  scheduleDetectionFilterRestoreRefreshes,
  schedulePostCompletionRenderRefreshes,
} from './pending-movement-refresh-scheduler.js';
import {
  capturePendingRenderState,
  clearPendingRenderState,
  forceTokenRenderStateInvisible,
  getPendingRenderState,
  hasPendingMovementRenderLocks,
  hasPendingRenderState,
  hideTokenLevelIndicatorSurface,
  isPendingMovementRenderLocked,
  prunePendingMovementRenderLocks,
  restorePendingRenderStateVisuals,
} from './pending-movement-render-state.js';
import {
  lineOfSightBlockedByCustomSightWall,
  lineOfSightBlockedByWall,
  lineIntersectsLimitedWall,
  sceneHasLimitedOrThresholdWallSense,
  withPendingMovementWallRayCache,
} from './pending-movement-wall-blocking.js';

function withPendingMovementDecisionCache(callback) {
  return withPendingMovementEvaluationCache(() => withPendingMovementWallRayCache(callback));
}

export {
  capturePendingMovementDetectionFilterVisualState,
  clearNoObserverDetectionFilterVisuals,
  restorePendingMovementDetectionFilterState,
  restorePendingMovementDetectionFilterVisualState,
} from './pending-movement-detection-filter-visuals.js';

const PENDING_MOVEMENT_TTL_MS = 2500;
const PENDING_MOVEMENT_RENDER_LOCK_GRACE_MS = 1000;
const PENDING_MOVEMENT_ANIMATION_DETECTION_DELAY_MS = 50;
const PENDING_MOVEMENT_ANIMATION_DETECTION_SETTLE_MS = 250;
export const DETECTION_BLOCKING_VISIBILITY_STATES = new Set([
  'hidden',
  'undetected',
  'unnoticed',
]);
const RENDER_HIDDEN_FROM_OBSERVER_STATES = new Set(['undetected', 'unnoticed']);
const CORE_LOS_TRANSITION_REFRESH_STATES = new Set(['observed', 'concealed']);
const VISIBILITY_V2_FLAG = 'visibilityV2';
const PENDING_MOVEMENT_SUPPRESSION_KEY = 'pf2eVisionerPendingMovement';

const pendingTokenMovementPositions = new Map();
const pendingTokenMovementCompletionTimeouts = new Map();
const pendingTokenHiddenForceContexts = new Map();
const pendingMovementCoreVisibleGraceContexts = new Map();
const pendingMovementCurrentSightLineGraceContexts = new Map();
let pendingMovementHiddenStateVisibilityProbeDepth = 0;
let pendingMovementSerial = 0;
const recentCompletedMovementRefreshTargetIds = new Map();
const pendingMovementTokenRefreshSignatures = new WeakMap();
let pendingMovementCoalescedRefresh = null;
const pendingMovementPerformanceCounters = {
  refreshCalls: 0,
  targetedRefreshCalls: 0,
  fullSceneRefreshCalls: 0,
  suppressedRefreshCalls: 0,
  tokensScanned: 0,
  tokensRefreshed: 0,
  bySource: {},
};

function emptyPendingMovementPerformanceSnapshot() {
  return {
    refreshCalls: 0,
    targetedRefreshCalls: 0,
    fullSceneRefreshCalls: 0,
    suppressedRefreshCalls: 0,
    tokensScanned: 0,
    tokensRefreshed: 0,
    bySource: {},
  };
}

const pendingMovementRefreshScheduler = {
  getEntry: (tokenId) => pendingTokenMovementPositions.get(tokenId),
  getTargetTokenIds: (tokenId) => getAnimationRefreshTargetIdsForMovement(tokenId),
  shouldUseFullAnimationRefreshCadence: (tokenId) =>
    shouldUseFullAnimationRefreshCadence(tokenId),
  shouldUseFullPostCompletionRefreshCadence: (tokenId) =>
    shouldUseFullPostCompletionRefreshCadence(tokenId),
  hasActivePendingMovementForObserver: (tokenId) => hasActivePendingMovementForObserver(tokenId),
  hasRenderWork: () => hasPendingMovementRenderWork(),
  refreshTokenVisibility: (movingTokenIds, options) =>
    refreshPendingMovementTokenVisibility(movingTokenIds, options),
};
const pendingControlledTokenDragIntentAdapter = {
  tokenIdOf,
  getRefreshTargetIds: (tokenId) => controlledTokenDragIntentRefreshTargetIds(tokenId),
  refreshTokenVisibility: (movingTokenIds, options) =>
    refreshPendingMovementTokenVisibility(movingTokenIds, options),
};
const pendingFinalVisibilityController = createPendingMovementFinalVisibilityController({
  actorOf,
  detectionBlockingVisibilityStates: DETECTION_BLOCKING_VISIBILITY_STATES,
  getEntry: (tokenId) => pendingTokenMovementPositions.get(tokenId),
  getPlaceableTokens: () => canvas?.tokens?.placeables || [],
  getStoredVisibilityState,
  hasLineOfSightToSampledToken,
  isTokenLikeTarget,
  refreshTokenVisibility: (movingTokenIds, options) =>
    refreshPendingMovementTokenVisibility(movingTokenIds, options),
  renderHiddenFromObserverStates: RENDER_HIDDEN_FROM_OBSERVER_STATES,
  tokenDocOf,
  tokenIdOf,
  tokenObjectForId,
});
const pendingDecisionContextController = createPendingMovementDecisionContextController({
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
});
const pendingCurrentViewSoundwaveController = createPendingMovementCurrentViewSoundwaveController({
  clearDetectionFilterVisuals,
  currentPendingMovementSightLineSeesTarget,
  detectionBlockingVisibilityStates: DETECTION_BLOCKING_VISIBILITY_STATES,
  getPendingMovementCanonicalToken,
  getPendingMovementVisibilityState,
  getPendingTokenMovementEntry,
  getPendingTokenMovementPosition,
  getPredictedFinalVisibilityState,
  getStoredVisibilityState,
  graceMs: PENDING_MOVEMENT_RENDER_LOCK_GRACE_MS,
  hasPendingControlledTokenDragIntent,
  hasPendingMovementDetectionWork,
  hiddenSoundwaveShouldSurviveLimitedWall,
  pendingMovementEntryVisualReachedDestination,
  restorePendingMovementTokenRendering,
  shouldUseCoreDetectionDuringPendingMovement,
  tokenHasDetectionFilterVisual,
  tokenIdOf,
  tokenObjectForId,
});
const {
  clearObservedDetectionFilterVisualsForCurrentSightLine,
  clearObservedDetectionFilterVisualsForCurrentView,
  clearPredictedObservedTransitionVisualsForCompletingMovement,
  currentViewObservedDetectionShouldYieldToCore,
  getCurrentViewObservedDetectionFilterSuppressionContext,
  getCurrentViewObservers,
  hasObservedHiddenSoundwaveGraceContexts,
  hasObservedTransitionDetectionFilterSuppression,
  hasPendingControlledTokenDragIntentForCurrentView,
  rememberObservedHiddenSoundwaveGraceForCompletingMovement,
  predictedObservedMovementReachedDestination,
  pruneExpiredObservedHiddenSoundwaveGraceContexts,
  shouldAllowCoreHiddenSoundwaveForCurrentView,
  shouldPreserveHiddenSoundwaveForCurrentView,
} = pendingCurrentViewSoundwaveController;

const pendingDetectionFilterRenderingController =
  createPendingMovementDetectionFilterRenderingController({
    capturePendingMovementDetectionFilterVisualState,
    clearDetectionFilterVisuals,
    currentSightLineSeesHiddenTargetDuringPendingMovement,
    getCurrentSightLineGraceContextForTarget,
    getCurrentViewObservers,
    getHiddenDetectionFilterPreservationContext,
    getObservedDetectionFilterSuppressionContext,
    getVisibleCoreGraceContextForTarget,
    hasObservedTransitionDetectionFilterSuppression,
    restorePendingMovementDetectionFilterVisualState,
    shouldAllowCoreHiddenSoundwaveForCurrentView,
    shouldPreserveHiddenSoundwaveForCurrentView,
    shouldTemporarilyForceTokenInvisible,
    tokenHasDetectionFilterMeshVisual,
    tokenHasDetectionFilterVisual,
  });

export function shouldSuppressPendingMovementDetectionFilterVisuals(token, options) {
  return withPendingMovementDecisionCache(() =>
    pendingDetectionFilterRenderingController
      .shouldSuppressPendingMovementDetectionFilterVisuals(token, options),
  );
}

export function shouldPreservePendingMovementDetectionFilterVisuals(token, options) {
  return withPendingMovementDecisionCache(() =>
    pendingDetectionFilterRenderingController
      .shouldPreservePendingMovementDetectionFilterVisuals(token, options),
  );
}

export function shouldPrimePendingMovementDetectionFilterVisuals(token, options) {
  return withPendingMovementDecisionCache(() =>
    pendingDetectionFilterRenderingController
      .shouldPrimePendingMovementDetectionFilterVisuals(token, options),
  );
}

export function shouldStabilizeHiddenDetectionFilterAnimation(token) {
  return pendingDetectionFilterRenderingController
    .shouldStabilizeHiddenDetectionFilterAnimation(token);
}

export function shouldApplyDetectionFilterPrimaryMeshTint(token) {
  return withPendingMovementDecisionCache(() =>
    pendingDetectionFilterRenderingController
      .shouldApplyDetectionFilterPrimaryMeshTint(token),
  );
}

export function withStableHiddenDetectionFilterAnimation(token, callback) {
  return pendingDetectionFilterRenderingController
    .withStableHiddenDetectionFilterAnimation(token, callback);
}

export function primePendingMovementDetectionFilterVisuals(token, options) {
  return withPendingMovementDecisionCache(() =>
    pendingDetectionFilterRenderingController
      .primePendingMovementDetectionFilterVisuals(token, options),
  );
}

export function withPreservedPendingMovementDetectionFilterVisuals(token, callback) {
  return pendingDetectionFilterRenderingController
    .withPreservedPendingMovementDetectionFilterVisuals(token, callback);
}

export function withSuppressedPendingMovementDetectionFilterVisuals(token, callback) {
  return pendingDetectionFilterRenderingController
    .withSuppressedPendingMovementDetectionFilterVisuals(token, callback);
}

export function withSuppressedPendingMovementDetectionFilterRender(token, callback) {
  return pendingDetectionFilterRenderingController
    .withSuppressedPendingMovementDetectionFilterRender(token, callback);
}

function withSuppressedDetectionFilterProbe(token, callback, options) {
  return pendingDetectionFilterRenderingController
    .withSuppressedDetectionFilterProbe(token, callback, options);
}

export function suppressPendingMovementDetectionFilterVisualsForObservedTransition(
  token,
  options,
) {
  return pendingCurrentViewSoundwaveController
    .suppressPendingMovementDetectionFilterVisualsForObservedTransition(token, options);
}

function tokenIdOf(tokenOrDoc) {
  return tokenOrDoc?.document?.id || tokenOrDoc?.id || null;
}

function observerTargetEvaluationKey(observer, target) {
  const observerId = tokenIdOf(observer);
  const targetId = tokenIdOf(target);
  return observerId && targetId ? `${observerId}>${targetId}` : null;
}

function tokenDocOf(tokenOrDoc) {
  return tokenOrDoc?.document || tokenOrDoc || null;
}

function actorOf(tokenOrDoc) {
  return tokenOrDoc?.actor || tokenDocOf(tokenOrDoc)?.actor || null;
}

function isTokenLikeTarget(tokenOrDoc) {
  return !!actorOf(tokenOrDoc);
}

function sourceFromCollectionEntry(entry) {
  return Array.isArray(entry) && entry.length === 2 ? entry[1] : entry;
}

function sourceList(sources) {
  if (!sources) return [];
  return cachePendingMovementObjectEvaluation('sourceList', sources, () =>
    Array.from(sources, sourceFromCollectionEntry),
  );
}

function hasActiveControlledMovementSource(sources) {
  for (const source of sourceList(sources)) {
    if (
      source?.active &&
      (isControlledMovementPreviewToken(source.object) ||
        isControlledTokenDragActive(source.object))
    ) {
      return true;
    }
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
    hasActiveControlledMovementSource(visionSources) ||
    hasActiveControlledMovementSource(lightSources)
  );
}

function cleanupExpiredPendingMovements(now = Date.now()) {
  let removedExpiredMovement = false;
  for (const [tokenId, entry] of pendingTokenMovementPositions.entries()) {
    if (!entry || entry.expiresAt <= now) {
      pendingTokenMovementPositions.delete(tokenId);
      removedExpiredMovement = true;
    }
  }
  if (removedExpiredMovement) rebalancePendingMovementRoutePointBudgets(pendingTokenMovementPositions);
  pruneExpiredCoreVisibleGraceContexts(now);
  pruneExpiredCurrentSightLineGraceContexts(now);
  pruneExpiredObservedHiddenSoundwaveGraceContexts(now);
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

function currentGmMovedToken(tokenDoc, userId = null) {
  const currentUser = game?.user;
  if (!tokenDoc || !currentUser?.isGM) return false;
  if (!userId || userId !== currentUser.id) return false;
  return true;
}

function getPendingMovementTrackingReason(tokenDoc, controlledTokens, options = {}) {
  if (isControlledTokenDocument(tokenDoc, controlledTokens)) return 'controlled-token';
  if (currentGmMovedToken(tokenDoc, options.userId)) return 'gm-token';
  if (currentUserOwnsMovedToken(tokenDoc, options.userId)) return 'player-owned-token';
  return null;
}

function isControlledMovementPreviewToken(tokenOrDoc) {
  const token = tokenOrDoc?.document ? tokenOrDoc : null;
  if (!token?.isPreview || !token?._original) return false;
  if (token._previewType === 'config') return false;

  return isControlledTokenDocument(token._original);
}

function isControlledTokenDragActive(tokenOrDoc) {
  const token = tokenOrDoc?.document ? tokenOrDoc : null;
  const draggedToken = canvas?.tokens?._draggedToken;
  if (!token || !draggedToken) return false;
  if (tokenIdOf(token) !== tokenIdOf(draggedToken)) return false;
  return token.controlled === true || isControlledTokenDocument(token);
}

function controlledTokenDragIntentRefreshTargetIds(tokenId) {
  const observer = tokenObjectForId(tokenId);
  return (canvas?.tokens?.placeables || [])
    .filter((token) => {
      const targetId = tokenIdOf(token);
      if (!targetId || targetId === tokenId) return false;
      if (!observer) return true;
      return !RENDER_HIDDEN_FROM_OBSERVER_STATES.has(getStoredVisibilityState(observer, token));
    })
    .map((token) => tokenIdOf(token));
}

function shouldRefreshCoreLosTransitionTarget(observer, target, visibilityState) {
  if (!observer || !target?.document?.id) return false;
  if (!CORE_LOS_TRANSITION_REFRESH_STATES.has(visibilityState)) return false;
  if (!hasCoreOwnedPendingMovement(observer, target)) return false;

  return !currentPendingMovementSightLineSeesTarget(observer, target);
}

export function primePendingControlledTokenDragIntent(
  tokenOrDoc,
  options = {},
) {
  return primeControlledTokenDragIntent(tokenOrDoc, {
    ...pendingControlledTokenDragIntentAdapter,
    ...options,
  });
}

export function releasePendingControlledTokenDragIntent(
  tokenOrDoc = null,
  options = {},
) {
  return releaseControlledTokenDragIntent(tokenOrDoc, {
    tokenIdOf,
    ...options,
  });
}

function hasPendingControlledTokenDragIntent(tokenOrDoc) {
  return hasControlledTokenDragIntent(tokenOrDoc, { tokenIdOf });
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

function hasLineOfSightToSampledToken(originPoint, targetPoints) {
  if (!originPoint || !targetPoints?.length) return false;
  if (!lineOfSightBlockedByWall(originPoint, targetPoints[0])) return true;

  let clearRays = 0;
  for (const targetPoint of targetPoints.slice(1)) {
    if (lineOfSightBlockedByWall(originPoint, targetPoint)) continue;
    clearRays += 1;
    if (clearRays >= 2) return true;
  }

  return false;
}

function sceneHasPendingMovementLimitedOrThresholdWallSense(senseType) {
  return cachePendingMovementEvaluation(
    'sceneLimitedOrThresholdWallSense',
    senseType,
    () => sceneHasLimitedOrThresholdWallSense(senseType),
  );
}

function customSightWallBlocksSampledToken(originPoint, targetPoints) {
  if (!originPoint || !targetPoints?.length) return false;
  if (!sceneHasPendingMovementLimitedOrThresholdWallSense('sight')) return false;

  return targetPoints.every((targetPoint) =>
    lineOfSightBlockedByCustomSightWall(originPoint, targetPoint),
  );
}

function pendingMovementTokenHasCoreOwnedPosition(tokenOrDoc, entry = null) {
  const canonicalToken = getPendingMovementCanonicalToken(tokenOrDoc);
  if (isControlledMovementPreviewToken(canonicalToken) || isControlledTokenDragActive(canonicalToken)) {
    return true;
  }

  const tokenId = tokenIdOf(canonicalToken);
  const token = canonicalToken?.document ? canonicalToken : tokenObjectForId(tokenId);
  if (movementAnimationIsRunning(token?._animation)) return true;
  if (!entry?.position || !token) return false;

  const currentPosition = tokenVisualMovementPosition(token);
  const startPosition = entry.routePositions?.[0] ?? null;
  if (currentPosition && startPosition && !positionsEqual(currentPosition, startPosition)) {
    return true;
  }

  return tokenVisualPositionReached(token, entry.position);
}

function pendingMovementTokenHasCommittedCoreMotion(tokenOrDoc, entry = null) {
  const canonicalToken = getPendingMovementCanonicalToken(tokenOrDoc);
  if (isControlledMovementPreviewToken(canonicalToken) || isControlledTokenDragActive(canonicalToken)) {
    return true;
  }

  const tokenId = tokenIdOf(canonicalToken);
  const token = canonicalToken?.document ? canonicalToken : tokenObjectForId(tokenId);
  if (movementAnimationIsRunning(token?._animation)) return true;
  if (!entry?.position || !token) return false;

  const currentPosition = tokenVisualMovementPosition(token);
  const startPosition = entry.routePositions?.[0] ?? null;
  return !!(currentPosition && startPosition && !positionsEqual(currentPosition, startPosition));
}

function getStoredVisibilityState(observer, target) {
  const targetId = tokenIdOf(target);
  if (!targetId) return 'observed';

  const doc = tokenDocOf(observer);
  const profile = doc?.getFlag?.(MODULE_ID, VISIBILITY_V2_FLAG)?.[targetId];
  if (profile) {
    return normalizeVisibilityState(profile) || 'observed';
  }

  return 'observed';
}

function visibilityTestPointsForPendingTarget(target) {
  const points = target?.document?.getVisibilityTestPoints?.();
  if (Array.isArray(points) && points.length > 1) return points;

  const sampledPoints = tokenSamplePoints(target);
  if (sampledPoints.length) return sampledPoints;
  if (Array.isArray(points) && points.length) return points;

  const center = centerForToken(target);
  return center ? [center] : [];
}

function activeSightSourcesForObserver(observer) {
  const observerId = tokenIdOf(observer);
  if (!observerId) return [];

  return cachePendingMovementEvaluation('activeSightSources', observerId, () =>
    [
      ...sourceList(canvas?.effects?.visionSources),
      ...sourceList(canvas?.effects?.lightSources),
    ].filter((source) => source?.active && tokenIdOf(source.object) === observerId),
  );
}

function sourceContainsAnyTargetPoint(source, targetPoints) {
  return targetPoints.some(
    (point) =>
      source?.los?.contains?.(point.x, point.y) ||
      source?.shape?.contains?.(point.x, point.y),
  );
}

function sightSourceObserverHasActiveMovement(observer, target) {
  const observerId = tokenIdOf(observer);
  if (!observerId) return false;
  if (hasCoreOwnedPendingMovement(observer, target)) return true;
  if (hasActivePendingMovementForObserver(observerId)) return true;
  return tokenIdOf(canvas?.tokens?._draggedToken) === observerId;
}

function currentPendingMovementSightLineSeesTargetUncached(observer, target) {
  if (!observer || !target?.document?.id) return false;

  const targetPoints = visibilityTestPointsForPendingTarget(target);
  if (!targetPoints.length) return false;

  const sightSources = activeSightSourcesForObserver(observer);
  if (sightSources.length) {
    const activeSourceContainsTarget = sightSources.some((source) =>
      sourceContainsAnyTargetPoint(source, targetPoints),
    );
    if (
      activeSourceContainsTarget &&
      !customSightWallBlocksSampledToken(centerForToken(observer), targetPoints)
    ) {
      return true;
    }
    if (!sightSourceObserverHasActiveMovement(observer, target)) return false;
  }

  if (!observerHasUsableSight(observer)) return false;

  const originPoint = centerForToken(observer);
  if (!originPoint) return false;

  return targetPoints.some((targetPoint) => !lineOfSightBlockedByWall(originPoint, targetPoint));
}

export function currentPendingMovementSightLineSeesTarget(observer, target) {
  return withPendingMovementDecisionCache(() =>
    cachePendingMovementEvaluation(
      'currentSightLine',
      observerTargetEvaluationKey(observer, target),
      () => currentPendingMovementSightLineSeesTargetUncached(observer, target),
    ),
  );
}

function rememberCurrentSightLineGraceContext(observer, target) {
  const observerId = tokenIdOf(observer);
  const targetId = tokenIdOf(target);
  if (!observerId || !targetId) return false;

  if (!pendingMovementCurrentSightLineGraceContexts.has(targetId)) {
    pendingMovementCurrentSightLineGraceContexts.set(targetId, new Map());
  }
  pendingMovementCurrentSightLineGraceContexts.get(targetId).set(observerId, {
    observerId,
    targetId,
    expiresAt: Date.now() + PENDING_MOVEMENT_RENDER_LOCK_GRACE_MS,
  });
  return true;
}

function pruneExpiredCurrentSightLineGraceContexts(now = Date.now()) {
  for (const [targetId, contextsByObserver] of pendingMovementCurrentSightLineGraceContexts.entries()) {
    for (const [observerId, context] of contextsByObserver.entries()) {
      if (!context?.expiresAt || context.expiresAt <= now) {
        contextsByObserver.delete(observerId);
      }
    }
    if (!contextsByObserver.size) pendingMovementCurrentSightLineGraceContexts.delete(targetId);
  }
}

function forgetCurrentSightLineGraceContextsForObserver(observerId) {
  if (!observerId) return;

  for (const [targetId, contextsByObserver] of pendingMovementCurrentSightLineGraceContexts.entries()) {
    contextsByObserver.delete(observerId);
    if (!contextsByObserver.size) pendingMovementCurrentSightLineGraceContexts.delete(targetId);
  }
}

function getCurrentSightLineGraceContextForTarget(target) {
  pruneExpiredCurrentSightLineGraceContexts();
  const targetId = tokenIdOf(target);
  if (!targetId || tokenDocOf(target)?.hidden) return null;
  if (actorHasConditionSlug(actorOf(target), 'invisible')) return null;

  const contextsByObserver = pendingMovementCurrentSightLineGraceContexts.get(targetId);
  if (!contextsByObserver) return null;

  for (const [observerId, context] of contextsByObserver.entries()) {
    const observer = tokenObjectForId(observerId);
    if (!observer) {
      contextsByObserver.delete(observerId);
      continue;
    }
    if (getStoredVisibilityState(observer, target) !== 'hidden') {
      contextsByObserver.delete(observerId);
      continue;
    }
    if (!currentPendingMovementSightLineSeesTarget(observer, target)) {
      contextsByObserver.delete(observerId);
      continue;
    }
    return context;
  }

  if (!contextsByObserver.size) pendingMovementCurrentSightLineGraceContexts.delete(targetId);
  return null;
}

function pendingMovementObserverCandidates() {
  const candidates = [];
  const add = (token) => {
    if (token) candidates.push(token);
  };

  add(canvas?.tokens?._draggedToken);
  for (const token of canvas?.tokens?.controlled || []) add(token);
  for (const [observerId, entry] of pendingTokenMovementPositions.entries()) {
    add(tokenObjectForId(observerId) || entry?.tokenDoc);
  }
  for (const source of [
    ...sourceList(canvas?.effects?.visionSources),
    ...sourceList(canvas?.effects?.lightSources),
  ]) {
    if (source?.active && source?.object) add(source.object);
  }

  const seen = new Set();
  return candidates.filter((token) => {
    const tokenId = tokenIdOf(token);
    if (!tokenId || seen.has(tokenId)) return false;
    seen.add(tokenId);
    return true;
  });
}

function hiddenSoundwaveShouldSurviveLimitedWall(observer, target, targetPoints) {
  const hasLimitedSightWall = sceneHasPendingMovementLimitedOrThresholdWallSense('sight');
  const hasLimitedSoundWall = sceneHasPendingMovementLimitedOrThresholdWallSense('sound');
  if (!hasLimitedSightWall && !hasLimitedSoundWall) return false;

  const originPoint = centerForToken(observer);
  if (!originPoint) return false;

  const points = [centerForToken(target), ...(targetPoints || [])].filter(Boolean);
  return points.some(
    (targetPoint) =>
      (hasLimitedSightWall && lineIntersectsLimitedWall(originPoint, targetPoint, 'sight')) ||
      (hasLimitedSoundWall && lineIntersectsLimitedWall(originPoint, targetPoint, 'sound')),
  );
}

function currentSightLineSeesHiddenTargetDuringPendingMovement(
  target,
  { hasDetectionWork = null } = {},
) {
  if (!target?.document?.id) return false;
  if (target.controlled) return false;
  if (!isTokenLikeTarget(target)) return false;
  if (tokenDocOf(target)?.hidden) return false;
  if (actorHasConditionSlug(actorOf(target), 'invisible')) return false;
  if (hasDetectionWork === false) return false;

  const targetPoints = visibilityTestPointsForPendingTarget(target);
  if (!targetPoints.length) return false;

  for (const source of [
    ...sourceList(canvas?.effects?.visionSources),
    ...sourceList(canvas?.effects?.lightSources),
  ]) {
    if (!source?.active || !source.object) continue;
    const observer = source.object;
    if (tokenIdOf(observer) === tokenIdOf(target)) continue;
    if (
      !sightSourceObserverHasActiveMovement(observer, target) &&
      !(observer?.controlled && hasPendingMovementDetectionWork())
    ) {
      continue;
    }
    const stateObserver =
      tokenObjectForId(tokenIdOf(observer)) ||
      getPendingMovementCanonicalToken(observer) ||
      observer;
    if (getStoredVisibilityState(stateObserver, target) !== 'hidden') continue;
    if (sourceContainsAnyTargetPoint(source, targetPoints)) {
      if (hiddenSoundwaveShouldSurviveLimitedWall(stateObserver, target, targetPoints)) {
        continue;
      }
      rememberCurrentSightLineGraceContext(stateObserver, target);
      return true;
    }
  }

  for (const observer of pendingMovementObserverCandidates()) {
    if (!observer || tokenIdOf(observer) === tokenIdOf(target)) continue;
    if (!hasCoreOwnedPendingMovement(observer, target)) continue;
    const stateObserver =
      tokenObjectForId(tokenIdOf(observer)) ||
      getPendingMovementCanonicalToken(observer) ||
      observer;
    if (getStoredVisibilityState(stateObserver, target) !== 'hidden') continue;
    if (currentPendingMovementSightLineSeesTarget(observer, target)) {
      if (hiddenSoundwaveShouldSurviveLimitedWall(stateObserver, target, targetPoints)) {
        continue;
      }
      rememberCurrentSightLineGraceContext(stateObserver, target);
      return true;
    }
  }

  return false;
}

function getPendingMovementCanonicalToken(token) {
  return isControlledMovementPreviewToken(token) && token?._original ? token._original : token;
}

function getPredictedFinalVisibilityState(observer, target) {
  const visibilityObserver = getPendingMovementCanonicalToken(observer);
  const visibilityTarget = getPendingMovementCanonicalToken(target);
  const observerId = tokenIdOf(visibilityObserver);
  const targetId = tokenIdOf(visibilityTarget);
  if (!observerId || !targetId) return null;

  const observerEntry = getPendingTokenMovementEntry(observerId);
  if (observerEntry?.finalVisibilityStatesByTargetId?.has(targetId)) {
    return observerEntry.finalVisibilityStatesByTargetId.get(targetId);
  }

  const targetEntry = getPendingTokenMovementEntry(targetId);
  if (targetEntry?.finalVisibilityStatesByObserverId?.has(observerId)) {
    return targetEntry.finalVisibilityStatesByObserverId.get(observerId);
  }

  return null;
}

export function hasPendingMovementEntryForPair(observer, target) {
  const visibilityObserver = getPendingMovementCanonicalToken(observer);
  const visibilityTarget = getPendingMovementCanonicalToken(target);
  const observerId = tokenIdOf(visibilityObserver);
  const targetId = tokenIdOf(visibilityTarget);

  return !!(
    (observerId && getPendingTokenMovementEntry(observerId)) ||
    (targetId && getPendingTokenMovementEntry(targetId))
  );
}

function hasActiveControlledMovementPreview(observer, target) {
  return (
    isControlledMovementPreviewToken(observer) ||
    isControlledTokenDragActive(observer) ||
    isControlledMovementPreviewToken(target) ||
    isControlledTokenDragActive(target)
  );
}

function getPendingMovementVisibilityState(observer, target) {
  const predictedFinalState = getPredictedFinalVisibilityState(observer, target);
  const coreOwnedMovement = hasCoreOwnedPendingMovement(observer, target);
  if (coreOwnedMovement) {
    if (predictedFinalState) return predictedFinalState;
    if (
      hasActiveControlledMovementPreview(observer, target) &&
      !hasPendingMovementEntryForPair(observer, target)
    ) {
      return 'observed';
    }
  }

  return getStoredVisibilityState(observer, target);
}

function visionerStateHidesTargetRendering(visibilityState) {
  if (!RENDER_HIDDEN_FROM_OBSERVER_STATES.has(visibilityState)) return false;

  return true;
}

function shouldKeepVisionerRenderLockDuringPendingMovement(observer, target) {
  return visionerStateHidesTargetRendering(getPendingMovementVisibilityState(observer, target));
}

function visionerStateBlocksPendingDetection(visibilityState) {
  return DETECTION_BLOCKING_VISIBILITY_STATES.has(visibilityState);
}

function tokenObjectForId(tokenId) {
  if (!tokenId) return null;
  return (
    canvas?.tokens?.get?.(tokenId) ||
    canvas?.tokens?.placeables?.find?.((token) => tokenIdOf(token) === tokenId) ||
    null
  );
}

function getAnimationRefreshTargetIdsForMovement(tokenId) {
  const entry = pendingTokenMovementPositions.get(tokenId);
  const observer = tokenObjectForId(tokenId) || entry?.tokenDoc || null;
  const targetIds = new Set();

  for (const token of canvas?.tokens?.placeables || []) {
    const targetId = tokenIdOf(token);
    if (!targetId || targetId === tokenId) continue;

    if (isPendingMovementRenderLocked(token)) {
      targetIds.add(targetId);
      continue;
    }

    const visibilityState = observer ? getStoredVisibilityState(observer, token) : null;
    if (observer && DETECTION_BLOCKING_VISIBILITY_STATES.has(visibilityState)) {
      targetIds.add(targetId);
      continue;
    }

    if (shouldRefreshCoreLosTransitionTarget(observer, token, visibilityState)) {
      targetIds.add(targetId);
    }
  }

  return [...targetIds];
}

function shouldUseFullAnimationRefreshCadence(tokenId) {
  for (const targetId of getAnimationRefreshTargetIdsForMovement(tokenId)) {
    const target = tokenObjectForId(targetId);
    if (!target) continue;
    if (isPendingMovementRenderLocked(target)) return true;
    if (tokenHasDetectionFilterVisual(target)) return true;
    if (tokenHasDetectionFilterMeshVisual(target)) return true;
  }
  return false;
}

function shouldUseFullPostCompletionRefreshCadence(tokenId) {
  for (const targetId of getPendingMovementRefreshTargetIds(tokenId)) {
    const target = tokenObjectForId(targetId);
    if (!target) continue;
    if (isPendingMovementRenderLocked(target)) return true;
    if (tokenHasDetectionFilterVisual(target)) return true;
    if (tokenHasDetectionFilterMeshVisual(target)) return true;
  }
  return false;
}

export function getPendingMovementRefreshTargetIds(tokenIds = null) {
  const movementTokenIds = tokenIds
    ? (Array.isArray(tokenIds) ? tokenIds : [tokenIds]).filter(Boolean)
    : [...pendingTokenMovementPositions.keys()];
  const targetIds = new Set();

  for (const tokenId of movementTokenIds) {
    for (const targetId of getAnimationRefreshTargetIdsForMovement(tokenId)) {
      targetIds.add(targetId);
    }
  }

  if (!targetIds.size && !tokenIds) {
    for (const targetId of recentCompletedMovementRefreshTargetIds.keys()) {
      targetIds.add(targetId);
    }
  }

  return [...targetIds];
}

export function getPendingMovementBlockContext(observer, target) {
  return pendingDecisionContextController.getPendingMovementBlockContext(observer, target);
}

function contextSuppressesPendingDetectionSource(context) {
  if (!context?.active) return false;
  if (context.foundryHidden || context.renderHiddenByVisioner) return true;
  if (context.visibilityState === 'hidden') return false;

  return !!context.wallBlocked;
}

export function getPendingMovementHiddenStateContext(target) {
  if (!target?.document?.id) return null;
  cleanupExpiredPendingMovements();

  for (const [observerId, entry] of pendingTokenMovementPositions.entries()) {
    const observer = tokenObjectForId(observerId) || entry?.tokenDoc || { id: observerId };
    if (shouldUseCoreDetectionDuringPendingMovement(observer, target)) continue;

    const visibilityState = getPendingMovementVisibilityState(observer, target);
    const hiddenByVisioner = visionerStateHidesTargetRendering(visibilityState);
    const foundryHidden = !!tokenDocOf(target)?.hidden;
    if (!hiddenByVisioner && !foundryHidden) continue;

    return {
      observerId,
      observerName: observer?.name ?? observer?.document?.name,
      targetId: tokenIdOf(target),
      targetName: target?.name ?? target?.document?.name,
      visibilityState,
      hiddenByVisioner,
      renderHiddenByVisioner: hiddenByVisioner,
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
  if (shouldProbeCoreVisibilityForRenderHiddenPendingState(observer, target, visibilityState)) {
    return true;
  }
  if (visibilityState !== 'hidden') return false;

  const context = getPendingMovementBlockContext(observer, target);
  return context.active && !context.wallBlocked && !context.foundryHidden;
}

function shouldProbeCoreVisibilityForRenderHiddenPendingState(observer, target, visibilityState) {
  if (!RENDER_HIDDEN_FROM_OBSERVER_STATES.has(visibilityState)) return false;
  if (!hasCommittedCoreOwnedPendingMovement(observer, target)) return false;

  const predictedFinalState = getPredictedFinalVisibilityState(observer, target);
  const storedVisibilityState = getStoredVisibilityState(observer, target);
  if (
    RENDER_HIDDEN_FROM_OBSERVER_STATES.has(storedVisibilityState) &&
    predictedFinalState &&
    RENDER_HIDDEN_FROM_OBSERVER_STATES.has(predictedFinalState)
  ) {
    return false;
  }

  return true;
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

export function contextBlocksPendingDetection(context) {
  if (!context?.blocked) return false;
  if (!isPendingMovementHiddenStateVisibilityProbe()) return context.blocked;

  return context.foundryHidden;
}

function getPendingMovementDetectionFilterPreservationContext(target) {
  if (!target?.document?.id) return null;
  if (target.controlled) return null;
  if (!isTokenLikeTarget(target)) return null;

  const sources = [
    ...sourceList(canvas?.effects?.visionSources),
    ...sourceList(canvas?.effects?.lightSources),
  ];

  for (const source of sources) {
    if (!source?.active || !source?.object) continue;

    const context = getPendingMovementBlockContext(source.object, target);
    const storedVisibilityState = getStoredVisibilityState(source.object, target);
    const preserveWallBlockedHiddenSoundwave =
      storedVisibilityState === 'hidden' && context.wallBlocked;
    if (
      shouldUseCoreDetectionDuringPendingMovement(source.object, target) &&
      context.visibilityState !== 'hidden' &&
      !preserveWallBlockedHiddenSoundwave
    ) {
      continue;
    }
    if (preserveWallBlockedHiddenSoundwave) {
      return {
        ...context,
        visibilityState: 'hidden',
        hiddenByVisioner: true,
        renderHiddenByVisioner: false,
        storedWallBlockedHidden: true,
      };
    }
    if (contextBlocksPendingDetection(context)) return context;
  }

  return null;
}

function getActiveControlledHiddenDetectionFilterContext(target) {
  if (!target?.document?.id) return null;
  if (target.controlled) return null;
  if (!isTokenLikeTarget(target)) return null;

  const observers = [
    ...sourceList(canvas?.effects?.visionSources)
      .filter((source) => source?.active && source?.object?.controlled)
      .map((source) => source.object),
    ...sourceList(canvas?.effects?.lightSources)
      .filter((source) => source?.active && source?.object?.controlled)
      .map((source) => source.object),
    ...(canvas?.tokens?.controlled || []),
  ];

  const seenObserverIds = new Set();
  for (const observer of observers) {
    const observerId = tokenIdOf(observer);
    if (!observerId || seenObserverIds.has(observerId)) continue;
    seenObserverIds.add(observerId);
    if (!observer?.controlled) continue;

    const visibilityState = getPendingMovementVisibilityState(observer, target);
    if (
      shouldUseCoreDetectionDuringPendingMovement(observer, target) &&
      visibilityState !== 'hidden'
    ) {
      continue;
    }
    if (visibilityState !== 'hidden') continue;

    return {
      active: true,
      observerId,
      observerName: observer?.name ?? observer?.document?.name,
      targetId: tokenIdOf(target),
      targetName: target?.name ?? target?.document?.name,
      visibilityState,
      foundryHidden: !!tokenDocOf(target)?.hidden,
      controlledObserver: true,
    };
  }

  return null;
}

function getStoredHiddenDetectionFilterContext(target) {
  if (!target?.document?.id) return null;
  if (target.controlled) return null;
  if (!isTokenLikeTarget(target)) return null;

  const targetId = tokenIdOf(target);
  for (const observer of canvas?.tokens?.placeables || []) {
    const observerId = tokenIdOf(observer);
    if (!observerId || observerId === targetId) continue;

    const visibilityState = getStoredVisibilityState(observer, target);
    if (visibilityState !== 'hidden') continue;

    return {
      active: true,
      observerId,
      observerName: observer?.name ?? observer?.document?.name,
      targetId,
      targetName: target?.name ?? target?.document?.name,
      visibilityState,
      hiddenByVisioner: true,
      renderHiddenByVisioner: false,
      foundryHidden: !!tokenDocOf(target)?.hidden,
      storedObserverFallback: true,
    };
  }

  return null;
}

function getHiddenDetectionFilterPreservationContext(
  target,
  { hasDetectionWork = null } = {},
) {
  if (!target?.document?.id) return null;
  if (target.controlled) return null;
  if (!isTokenLikeTarget(target)) return null;
  if (hasDetectionWork === false) return null;
  if (getCurrentSightLineGraceContextForTarget(target)) return null;
  if (currentSightLineSeesHiddenTargetDuringPendingMovement(target, { hasDetectionWork })) {
    return null;
  }

  const pendingContext =
    (hasDetectionWork === null || hasDetectionWork === true) &&
      hasPendingMovementDetectionWork()
      ? getPendingMovementDetectionFilterPreservationContext(target)
      : null;
  const shouldUseStoredContext = !pendingContext && !hasPendingMovementDetectionWork();
  const storedContext = shouldUseStoredContext ? getStoredHiddenDetectionFilterContext(target) : null;
  const context =
    pendingContext || getActiveControlledHiddenDetectionFilterContext(target) || storedContext;
  if (!context) return null;
  if (context.foundryHidden) return null;
  if (context.visibilityState !== 'hidden') return null;
  return context;
}

function getObservedDetectionFilterSuppressionContext(
  target,
  { hasDetectionWork = null } = {},
) {
  if (!target?.document?.id) return null;
  if (target.controlled) return null;
  if (!isTokenLikeTarget(target)) return null;

  const currentViewObservedContext = getCurrentViewObservedDetectionFilterSuppressionContext(target);
  if (currentViewObservedContext) return currentViewObservedContext;

  const hiddenContext = getHiddenDetectionFilterPreservationContext(target, { hasDetectionWork });
  let restrictedObservedObserverId = null;
  if (hiddenContext) {
    const hiddenObserver = tokenObjectForId(hiddenContext.observerId);
    if (getStoredVisibilityState(hiddenObserver, target) !== 'observed') return null;
    restrictedObservedObserverId = hiddenContext.observerId;
  }

  const currentViewObserverIds = new Set(getCurrentViewObservers().map((observer) => tokenIdOf(observer)));
  const observers = [
    ...sourceList(canvas?.effects?.visionSources)
      .filter((source) => source?.active && source?.object)
      .map((source) => source.object),
    ...sourceList(canvas?.effects?.lightSources)
      .filter((source) => source?.active && source?.object)
      .map((source) => source.object),
    canvas?.tokens?._draggedToken,
    ...(canvas?.tokens?.controlled || []),
    ...(canvas?.tokens?.placeables || []),
  ];

  const seenObserverIds = new Set();
  for (const observer of observers) {
    const observerId = tokenIdOf(observer);
    if (!observerId || seenObserverIds.has(observerId) || observerId === tokenIdOf(target)) {
      continue;
    }
    if (restrictedObservedObserverId && observerId !== restrictedObservedObserverId) continue;
    seenObserverIds.add(observerId);

    const context = getPendingMovementBlockContext(observer, target);
    const storedVisibilityState = getStoredVisibilityState(observer, target);
    const visibilityState =
      storedVisibilityState === 'observed'
        ? storedVisibilityState
        : context?.active
          ? context.visibilityState
          : storedVisibilityState;
    if (visibilityState !== 'observed') continue;
    if (
      currentViewObserverIds.has(observerId) &&
      currentViewObservedDetectionShouldYieldToCore(observer, target)
    ) {
      continue;
    }

    return {
      ...context,
      active: context?.active ?? true,
      observerId,
      observerName: observer?.name ?? observer?.document?.name,
      targetId: tokenIdOf(target),
      targetName: target?.name ?? target?.document?.name,
      visibilityState,
      observedByVisioner: true,
    };
  }

  return null;
}

export function capturePendingMovementDetectionFilterState(
  token,
  { hasDetectionWork = null } = {},
) {
  if (!token?.document?.id) return null;
  if (!tokenHasDetectionFilterVisual(token)) return null;

  const context = getHiddenDetectionFilterPreservationContext(token, { hasDetectionWork });
  if (!context) return null;

  return {
    hadDetectionFilter: Object.prototype.hasOwnProperty.call(token, 'detectionFilter'),
    detectionFilter: token.detectionFilter,
    detectionFilterMesh: captureDetectionFilterMeshState(token),
  };
}

export function shouldSkipPendingMovementTokenVisibilityRefresh(
  token,
  { hasDetectionWork = null } = {},
) {
  if (!token?.document?.id) return false;
  if (token.controlled) return false;
  if (!tokenHasDetectionFilterVisual(token)) return false;
  return !!getHiddenDetectionFilterPreservationContext(token, { hasDetectionWork });
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

function hasActiveUnblockedObserverDetectionSource(blockedSources = []) {
  const blockedSourceSet = new Set(blockedSources);
  const activeSources = [
    ...sourceList(canvas?.effects?.visionSources),
    ...sourceList(canvas?.effects?.lightSources),
  ];

  return activeSources.some(
    (source) => source?.active && source?.object && !blockedSourceSet.has(source),
  );
}

function getControlledObserverHiddenStateContext(target) {
  const targetId = tokenIdOf(target);
  if (!targetId) return null;

  const foundryHidden = !!tokenDocOf(target)?.hidden;
  for (const observer of canvas?.tokens?.controlled || []) {
    const observerId = tokenIdOf(observer);
    if (!observerId || observerId === targetId) continue;
    if (shouldUseCoreDetectionDuringPendingMovement(observer, target)) continue;

    const visibilityState = getPendingMovementVisibilityState(observer, target);
    const hiddenByVisioner = visionerStateHidesTargetRendering(visibilityState);
    if (!hiddenByVisioner && !foundryHidden) continue;

    return {
      observerId,
      observerName: observer?.name ?? observer?.document?.name,
      targetId,
      targetName: target?.name ?? target?.document?.name,
      visibilityState,
      hiddenByVisioner,
      renderHiddenByVisioner: hiddenByVisioner,
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
    renderHiddenByVisioner: !!context.renderHiddenByVisioner,
    foundryHidden: !!context.foundryHidden,
    wallBlocked: !!context.wallBlocked,
    blocked: !!context.blocked,
    renderBlocked: !!context.renderBlocked,
    awaitingDetectionFilter: !!context.awaitingDetectionFilter,
    pendingPosition: clonePoint(context.pendingPosition),
  };
}

function rememberHiddenForceContext(target, context) {
  const targetId = tokenIdOf(target);
  const normalizedContext = normalizeHiddenRenderLockContext(context);
  if (!targetId || !normalizedContext) return null;

  const existingContext = pendingTokenHiddenForceContexts.get(targetId);
  if (
    existingContext?.awaitingDetectionFilter &&
    !normalizedContext.awaitingDetectionFilter &&
    !tokenHasDetectionFilterVisual(target)
  ) {
    existingContext.lastForcedAt = Date.now();
    return existingContext;
  }

  const rememberedContext = {
    ...normalizedContext,
    lastForcedAt: Date.now(),
  };
  pendingTokenHiddenForceContexts.set(targetId, rememberedContext);
  return rememberedContext;
}

function rememberCoreVisibleGraceContext(target, context) {
  const targetId = tokenIdOf(target);
  const normalizedContext = normalizeHiddenRenderLockContext(context);
  if (!targetId || !normalizedContext?.observerId) return null;

  const now = Date.now();
  const graceContext = {
    ...normalizedContext,
    targetObject: target?.document ? target : null,
    observedDuringGrace: true,
    lastSeenAt: now,
    expiresAt: now + PENDING_MOVEMENT_RENDER_LOCK_GRACE_MS,
  };
  if (!pendingMovementCoreVisibleGraceContexts.has(targetId)) {
    pendingMovementCoreVisibleGraceContexts.set(targetId, new Map());
  }
  pendingMovementCoreVisibleGraceContexts.get(targetId).set(normalizedContext.observerId, graceContext);
  return graceContext;
}

function forgetCoreVisibleGraceContextsForTarget(target) {
  const targetId = tokenIdOf(target);
  if (!targetId) return;
  pendingMovementCoreVisibleGraceContexts.delete(targetId);
}

function pruneExpiredCoreVisibleGraceContexts(now = Date.now()) {
  for (const [targetId, contextsByObserver] of pendingMovementCoreVisibleGraceContexts.entries()) {
    for (const [observerId, context] of contextsByObserver.entries()) {
      if (!context?.expiresAt || context.expiresAt <= now) {
        contextsByObserver.delete(observerId);
      }
    }
    if (!contextsByObserver.size) pendingMovementCoreVisibleGraceContexts.delete(targetId);
  }
}

function getCoreVisibleGraceContext(observer, target, visibilityState) {
  if (!RENDER_HIDDEN_FROM_OBSERVER_STATES.has(visibilityState)) return null;
  if (tokenDocOf(target)?.hidden) return null;

  pruneExpiredCoreVisibleGraceContexts();
  const observerId = tokenIdOf(observer);
  const targetId = tokenIdOf(target);
  if (!observerId || !targetId) return null;

  const context = pendingMovementCoreVisibleGraceContexts.get(targetId)?.get(observerId) ?? null;
  if (context?.targetObject && context.targetObject !== target) {
    pendingMovementCoreVisibleGraceContexts.get(targetId)?.delete(observerId);
    return null;
  }
  return context;
}

function coreVisibleGraceCanBypassHiddenState(observer, target, visibilityState) {
  const context = getCoreVisibleGraceContext(observer, target, visibilityState);
  if (!context) return false;
  if (!pendingHiddenTargetIsVisibleFromCurrentSources(target, context)) return false;

  rememberCoreVisibleGraceContext(target, context);
  return true;
}

function rememberCoreVisibleGraceForCoreOwnedPendingObservers(target) {
  if (!target?.document?.id || tokenDocOf(target)?.hidden) return false;

  let remembered = false;
  for (const [observerId, entry] of pendingTokenMovementPositions.entries()) {
    const observer = tokenObjectForId(observerId) || entry?.tokenDoc || null;
    if (!observer || !shouldUseCoreDetectionDuringPendingMovement(observer, target)) continue;

    const storedState = getStoredVisibilityState(observer, target);
    if (!RENDER_HIDDEN_FROM_OBSERVER_STATES.has(storedState)) continue;

    const predictedState = getPredictedFinalVisibilityState(observer, target);
    if (predictedState && RENDER_HIDDEN_FROM_OBSERVER_STATES.has(predictedState)) continue;
    if (!predictedState && !hasCommittedCoreOwnedPendingMovement(observer, target)) continue;

    const context = {
      observerId,
      observerName: observer?.name ?? observer?.document?.name,
      targetId: tokenIdOf(target),
      targetName: target?.name ?? target?.document?.name,
      visibilityState: storedState,
      hiddenByVisioner: true,
      renderHiddenByVisioner: true,
      foundryHidden: false,
      wallBlocked: false,
      pendingPosition: entry?.position ?? null,
    };
    if (!pendingHiddenTargetIsVisibleFromCurrentSources(target, context)) continue;

    rememberCoreVisibleGraceContext(target, context);
    remembered = true;
  }

  return remembered;
}

function getVisibleCoreGraceContextForTarget(target) {
  pruneExpiredCoreVisibleGraceContexts();
  const targetId = tokenIdOf(target);
  if (!targetId || tokenDocOf(target)?.hidden) return null;

  const contextsByObserver = pendingMovementCoreVisibleGraceContexts.get(targetId);
  if (!contextsByObserver) return null;

  for (const [observerId, context] of contextsByObserver.entries()) {
    if (context?.targetObject && context.targetObject !== target) {
      contextsByObserver.delete(observerId);
      continue;
    }
    if (!context) continue;

    const observer = tokenObjectForId(observerId);
    const currentState = observer ? getStoredVisibilityState(observer, target) : context.visibilityState;
    if (!RENDER_HIDDEN_FROM_OBSERVER_STATES.has(currentState)) {
      contextsByObserver.delete(observerId);
      continue;
    }

    return context;
  }
  if (!contextsByObserver.size) pendingMovementCoreVisibleGraceContexts.delete(targetId);

  return null;
}

function pendingMovementEntryVisualReachedDestination(tokenOrDoc, entry) {
  if (!entry?.position) return false;
  const tokenId = tokenIdOf(tokenOrDoc);
  const token = tokenOrDoc?.document ? tokenOrDoc : tokenObjectForId(tokenId);
  if (!token) return false;
  return tokenVisualPositionReached(token, entry.position);
}

function restoreCoreVisibleGraceRendering(token) {
  if (!getVisibleCoreGraceContextForTarget(token)) return false;

  try {
    if (token.visible !== undefined) token.visible = true;
    token.renderable = true;
    if (token.mesh) {
      if ('visible' in token.mesh) token.mesh.visible = true;
      if ('renderable' in token.mesh) token.mesh.renderable = true;
      if ('alpha' in token.mesh && Number(token.mesh.alpha) === 0) token.mesh.alpha = 1;
    }
    clearDetectionFilterVisuals(token);
    return true;
  } catch {
    return false;
  }
}

function forgetHiddenForceContext(target) {
  const targetId = tokenIdOf(target);
  if (!targetId) return;
  pendingTokenHiddenForceContexts.delete(targetId);
  clearDetectionFilterRestoreTimeouts(targetId);
}

function getRememberedHiddenForceContext(target) {
  const targetId = tokenIdOf(target);
  if (!targetId) return null;
  return pendingTokenHiddenForceContexts.get(targetId) ?? null;
}

function contextShouldYieldToCoreDuringPendingMovement(context, target) {
  if (!context || context.foundryHidden) return false;
  const observer =
    tokenObjectForId(context.observerId) ||
    (context.observerId ? { id: context.observerId } : null);
  return shouldUseCoreDetectionDuringPendingMovement(observer, target);
}

function clearCoreOwnedPendingRenderLock(token, state) {
  const lockContext =
    getRememberedHiddenForceContext(token) ||
    (state?.lastHiddenContext
      ? { ...state.lastHiddenContext, lastForcedAt: state.lastForcedAt }
      : null);
  if (!contextShouldYieldToCoreDuringPendingMovement(lockContext, token)) return false;

  clearHiddenRenderLock(token, state);
  return true;
}

function getCoreOwnedRenderHiddenLockContext(token, state) {
  const context =
    getRememberedHiddenForceContext(token) ||
    (state?.lastHiddenContext
      ? { ...state.lastHiddenContext, lastForcedAt: state.lastForcedAt }
      : null);
  if (!context || context.awaitingDetectionFilter || context.foundryHidden) return null;
  if (!RENDER_HIDDEN_FROM_OBSERVER_STATES.has(context.visibilityState)) return null;

  const observer = tokenObjectForId(context.observerId);
  if (!observer) return null;
  if (!shouldUseCoreDetectionDuringPendingMovement(observer, token)) return null;

  return { context, observer };
}

function getCoreOwnedRenderHiddenLockRefreshDecision(token) {
  const state = getPendingRenderState(token);
  if (!state) return null;

  const lock = getCoreOwnedRenderHiddenLockContext(token, state);
  if (!lock) return null;

  const currentSightSeesTarget = currentPendingMovementSightLineSeesTarget(lock.observer, token);
  const reachedObservedDestination = predictedObservedMovementReachedDestination(lock.observer, token);
  return currentSightSeesTarget || reachedObservedDestination ? 'restore' : 'keep-locked';
}

function getHiddenRenderLockContext(target) {
  const pendingHiddenStateContext = getPendingMovementHiddenStateContext(target);
  if (pendingHiddenStateContext) return pendingHiddenStateContext;

  const controlledHiddenStateContext = getControlledObserverHiddenStateContext(target);
  if (controlledHiddenStateContext) return controlledHiddenStateContext;

  const hiddenBlockedEntry = getPendingMovementRenderLockBlockedEntries(target).find(
    ({ context }) => context.renderHiddenByVisioner || context.foundryHidden,
  );
  return hiddenBlockedEntry?.context ?? null;
}

function getPendingMovementRenderLockContext(target) {
  const hiddenRenderLockContext = getHiddenRenderLockContext(target);
  if (hiddenRenderLockContext) return hiddenRenderLockContext;

  const blockedEntry = getPendingMovementRenderLockBlockedEntries(target)[0];
  if (blockedEntry?.context?.renderBlocked) return blockedEntry.context;

  return getRememberedHiddenForceContext(target);
}

function getStickyHiddenRenderLockContext(target, state) {
  const rememberedLockContext = getRememberedHiddenForceContext(target);
  const stateLockContext = state?.lastHiddenContext
    ? { ...state.lastHiddenContext, lastForcedAt: state.lastForcedAt }
    : null;
  let lockContext;
  if (!tokenHasDetectionFilterVisual(target) && rememberedLockContext?.awaitingDetectionFilter) {
    lockContext = rememberedLockContext;
  } else if (!tokenHasDetectionFilterVisual(target) && stateLockContext?.awaitingDetectionFilter) {
    lockContext = stateLockContext;
  } else {
    lockContext =
      Number(rememberedLockContext?.lastForcedAt ?? -1) >
        Number(stateLockContext?.lastForcedAt ?? -1)
        ? rememberedLockContext
        : stateLockContext;
  }
  if (!lockContext) return null;

  const foundryHidden = !!tokenDocOf(target)?.hidden;
  if (
    !foundryHidden &&
    contextShouldYieldToCoreDuringPendingMovement(lockContext, target)
  ) {
    forgetHiddenForceContext(target);
    return null;
  }

  const elapsedMs = Date.now() - Number(lockContext.lastForcedAt ?? 0);
  const withinGrace =
    Number.isFinite(elapsedMs) &&
    elapsedMs >= 0 &&
    elapsedMs < PENDING_MOVEMENT_RENDER_LOCK_GRACE_MS;

  if (lockContext.awaitingDetectionFilter) {
    if (tokenHasDetectionFilterVisual(target)) {
      forgetHiddenForceContext(target);
      return null;
    }

    if (withinGrace) {
      return {
        ...lockContext,
        foundryHidden: foundryHidden || lockContext.foundryHidden,
        awaitingDetectionFilter: true,
        elapsedMs,
        renderLockGraceMs: PENDING_MOVEMENT_RENDER_LOCK_GRACE_MS,
      };
    }

    forgetHiddenForceContext(target);
    return null;
  }

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
    const visibilityState = getPendingMovementVisibilityState(observer, target);
    const hiddenByVisioner = visionerStateHidesTargetRendering(visibilityState);
    if (!hiddenByVisioner && !foundryHidden) {
      if (visibilityState === 'hidden' && !tokenHasDetectionFilterVisual(target)) {
        const awaitingDetectionFilterContext = rememberHiddenForceContext(target, {
          ...lockContext,
          visibilityState,
          hiddenByVisioner: false,
          renderHiddenByVisioner: false,
          foundryHidden,
          awaitingDetectionFilter: true,
        });
        scheduleDetectionFilterRestoreRefreshes(tokenIdOf(target), pendingMovementRefreshScheduler);
        return {
          ...awaitingDetectionFilterContext,
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
      renderHiddenByVisioner: hiddenByVisioner,
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

export function withSuppressedDetectionSources(sources, callback) {
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

function hiddenRenderLockCanBeBypassedByVisibilityProbe(token, context) {
  if (!hiddenStateVisibilityProbeCanBypassRenderLock(token, context)) return false;

  const observer = tokenObjectForId(context?.observerId);
  const canBypass =
    !!context &&
    !!observer &&
    pendingHiddenTargetIsVisibleFromCurrentSources(token, context);
  if (canBypass) rememberCoreVisibleGraceContext(token, context);
  return canBypass;
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

function canRestoreDetectionFilterPendingRenderLock(token) {
  const context = getPendingRenderState(token)?.lastHiddenContext;
  return !!context?.awaitingDetectionFilter && tokenHasDetectionFilterVisual(token);
}

function hasAwaitingDetectionFilterRenderLock(token) {
  return (
    !!getPendingRenderState(token)?.lastHiddenContext?.awaitingDetectionFilter ||
    !!getRememberedHiddenForceContext(token)?.awaitingDetectionFilter
  );
}

export function restorePendingMovementTokenRendering(
  token,
  { ignoreObservedGrace = false, ignoreObserverLocks = false } = {},
) {
  const state = getPendingRenderState(token);
  if (!token) return false;
  if (!state) return restoreCoreVisibleGraceRendering(token);

  let clearDetectionVisualsAfterRestore = false;
  if (clearCoreOwnedPendingRenderLock(token, state)) {
    clearDetectionVisualsAfterRestore = true;
  }

  if (
    state.lastHiddenContext?.awaitingDetectionFilter ||
    getRememberedHiddenForceContext(token)?.awaitingDetectionFilter
  ) {
    const stickyDetectionFilterContext = getStickyHiddenRenderLockContext(token, state);
    if (stickyDetectionFilterContext?.awaitingDetectionFilter) return false;
  }

  if (ignoreObserverLocks) {
    clearHiddenRenderLock(token, state);
  } else {
    const hiddenStateContext = getPendingMovementHiddenStateContext(token);
    if (hiddenStateContext) {
      if (hiddenRenderLockCanBeBypassedByVisibilityProbe(token, hiddenStateContext)) {
        clearDetectionVisualsAfterRestore = true;
        clearHiddenRenderLock(token, state);
      } else {
        return false;
      }
    }

    const controlledHiddenStateContext = getControlledObserverHiddenStateContext(token);
    if (controlledHiddenStateContext) {
      if (hiddenRenderLockCanBeBypassedByVisibilityProbe(token, controlledHiddenStateContext)) {
        clearDetectionVisualsAfterRestore = true;
        clearHiddenRenderLock(token, state);
      } else {
        return false;
      }
    }

    const stickyHiddenStateContext = getStickyHiddenRenderLockContext(token, state);
    if (stickyHiddenStateContext) {
      if (ignoreObservedGrace && stickyHiddenStateContext.observedDuringGrace) {
        clearDetectionVisualsAfterRestore = true;
        clearHiddenRenderLock(token, state);
      } else if (hiddenRenderLockCanBeBypassedByVisibilityProbe(token, stickyHiddenStateContext)) {
        clearDetectionVisualsAfterRestore = true;
        clearHiddenRenderLock(token, state);
      } else {
        return false;
      }
    }
  }

  try {
    if (!restorePendingRenderStateVisuals(token, state)) return false;
    if (clearDetectionVisualsAfterRestore || getVisibleCoreGraceContextForTarget(token)) {
      clearDetectionFilterVisuals(token);
    }
    clearPendingRenderState(token);
    forgetHiddenForceContext(token);
  } catch {
    return false;
  }

  return true;
}

export function forcePendingMovementTokenInvisible(token) {
  if (!token) return;
  forgetCoreVisibleGraceContextsForTarget(token);

  const state = capturePendingRenderState(token);
  const rememberedContext = getRememberedHiddenForceContext(token);
  const hiddenRenderLockContext =
    rememberedContext?.awaitingDetectionFilter
      ? rememberedContext
      : getPendingMovementRenderLockContext(token) || rememberedContext;
  if (state) {
    state.lastForcedAt = Date.now();
    state.lastHiddenContext = hiddenRenderLockContext
      ? rememberHiddenForceContext(token, hiddenRenderLockContext)
      : null;
  }
  if (!hiddenRenderLockContext) {
    forgetHiddenForceContext(token);
  }

  forceTokenRenderStateInvisible(token);
}

export function forceTokenInvisibleForObserverVisibility(observer, target, visibilityState) {
  if (!observer || !target?.document?.id) return false;
  if (target.controlled) return false;
  if (
    visibilityState === 'hidden' &&
    hasCoreOwnedPendingMovement(observer, target)
  ) {
    return false;
  }

  const awaitingDetectionFilter =
    visibilityState === 'hidden' && !tokenHasDetectionFilterVisual(target);
  if (!RENDER_HIDDEN_FROM_OBSERVER_STATES.has(visibilityState) && !awaitingDetectionFilter) {
    return false;
  }

  const context = rememberHiddenForceContext(target, {
    observerId: tokenIdOf(observer),
    observerName: observer?.name ?? observer?.document?.name,
    targetId: tokenIdOf(target),
    targetName: target?.name ?? target?.document?.name,
    visibilityState,
    hiddenByVisioner: !awaitingDetectionFilter,
    renderHiddenByVisioner: !awaitingDetectionFilter,
    foundryHidden: !!tokenDocOf(target)?.hidden,
    wallBlocked: false,
    awaitingDetectionFilter,
    pendingPosition: getPendingTokenMovementPosition(tokenIdOf(observer)),
  });
  if (!context) return false;

  forcePendingMovementTokenInvisible(target);
  if (awaitingDetectionFilter) {
    scheduleDetectionFilterRestoreRefreshes(tokenIdOf(target), pendingMovementRefreshScheduler);
  }
  return true;
}

export function clearPendingTokenMovementPosition(
  tokenId,
  { preserveCurrentSightLineGrace = false } = {},
) {
  if (!tokenId) return;
  clearAnimationRenderRefreshes(tokenId);
  clearPostCompletionRenderRefreshes(tokenId);

  const completionTimeoutId = pendingTokenMovementCompletionTimeouts.get(tokenId);
  if (completionTimeoutId) {
    clearTimeout(completionTimeoutId);
    pendingTokenMovementCompletionTimeouts.delete(tokenId);
  }

  const entry = pendingTokenMovementPositions.get(tokenId);
  if (entry?.finalVisibilityPredictionTimerId) {
    clearTimeout(entry.finalVisibilityPredictionTimerId);
  }
  if (entry?.timeoutId) {
    clearTimeout(entry.timeoutId);
  }
  pendingTokenMovementPositions.delete(tokenId);
  if (!preserveCurrentSightLineGrace) {
    forgetCurrentSightLineGraceContextsForObserver(tokenId);
  }
  rebalancePendingMovementRoutePointBudgets(pendingTokenMovementPositions);
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

  const finalVisibilityStatesByTargetId = createPendingVisibilityStateMap(
    options.finalVisibilityStatesByTargetId ?? options.finalVisibilityByTargetId,
  );
  const finalVisibilityStatesByObserverId = createPendingVisibilityStateMap(
    options.finalVisibilityStatesByObserverId ?? options.finalVisibilityByObserverId,
  );
  const cheapFinalPrediction = options.predictFinalVisibility
    ? pendingFinalVisibilityController.predictCheapFinalVisibilityStates(tokenDoc, position)
    : null;
  mergeMissingPendingVisibilityStateMap(
    finalVisibilityStatesByTargetId,
    cheapFinalPrediction?.finalVisibilityStatesByTargetId,
  );
  mergeMissingPendingVisibilityStateMap(
    finalVisibilityStatesByObserverId,
    cheapFinalPrediction?.finalVisibilityStatesByObserverId,
  );

  pendingTokenMovementPositions.set(tokenId, {
    tokenDoc,
    position,
    routePositions,
    routePoints,
    budgetedRoutePoints: routePoints,
    finalVisibilityStatesByTargetId,
    finalVisibilityStatesByObserverId,
    finalVisibilityPredictionPending: false,
    routeWallBlockedCache: new Map(),
    serial,
    expiresAt: Date.now() + PENDING_MOVEMENT_TTL_MS,
    timeoutId,
  });
  rebalancePendingMovementRoutePointBudgets(pendingTokenMovementPositions);
  scheduleAnimationRenderRefreshes(tokenId, serial, pendingMovementRefreshScheduler);
  pendingFinalVisibilityController.scheduleFinalVisibilityPrediction(
    tokenId,
    serial,
    tokenDoc,
    position,
    options,
  );

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

function hasCoreOwnedPendingMovement(observer, target) {
  if (!isTokenLikeTarget(target)) return false;

  const observerId = tokenIdOf(observer);
  const targetId = tokenIdOf(target);
  cleanupExpiredPendingMovements();

  if (
    observerId &&
    pendingMovementTokenHasCoreOwnedPosition(
      observer,
      pendingTokenMovementPositions.get(observerId),
    )
  ) {
    return true;
  }
  if (
    targetId &&
    pendingMovementTokenHasCoreOwnedPosition(target, pendingTokenMovementPositions.get(targetId))
  ) {
    return true;
  }
  if (isControlledMovementPreviewToken(observer) || isControlledTokenDragActive(observer)) return true;
  if (isControlledMovementPreviewToken(target) || isControlledTokenDragActive(target)) return true;

  return false;
}

function hasCommittedCoreOwnedPendingMovement(observer, target) {
  if (!isTokenLikeTarget(target)) return false;

  const observerId = tokenIdOf(observer);
  const targetId = tokenIdOf(target);
  cleanupExpiredPendingMovements();

  if (
    observerId &&
    pendingMovementTokenHasCommittedCoreMotion(
      observer,
      pendingTokenMovementPositions.get(observerId),
    )
  ) {
    return true;
  }
  if (
    targetId &&
    pendingMovementTokenHasCommittedCoreMotion(target, pendingTokenMovementPositions.get(targetId))
  ) {
    return true;
  }
  if (isControlledMovementPreviewToken(observer) || isControlledTokenDragActive(observer)) return true;
  if (isControlledMovementPreviewToken(target) || isControlledTokenDragActive(target)) return true;

  return false;
}

export function shouldUseCoreDetectionDuringPendingMovement(observer, target) {
  if (!hasCoreOwnedPendingMovement(observer, target)) return false;

  const storedVisibilityState = getStoredVisibilityState(observer, target);
  const predictedFinalState = getPredictedFinalVisibilityState(observer, target);
  const storedRenderHidden = RENDER_HIDDEN_FROM_OBSERVER_STATES.has(storedVisibilityState);
  if (predictedFinalState) {
    const finalRenderHidden = RENDER_HIDDEN_FROM_OBSERVER_STATES.has(predictedFinalState);
    if (storedRenderHidden && finalRenderHidden) return false;
    return true;
  }

  if (storedRenderHidden) {
    return hasCommittedCoreOwnedPendingMovement(observer, target);
  }

  return true;
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

  clearPredictedObservedTransitionVisualsForCompletingMovement(tokenId, entry);
  rememberObservedHiddenSoundwaveGraceForCompletingMovement(tokenId, entry);
  const refreshTargetIds = getAnimationRefreshTargetIdsForMovement(tokenId);
  recentCompletedMovementRefreshTargetIds.clear();
  for (const targetId of refreshTargetIds) {
    recentCompletedMovementRefreshTargetIds.set(targetId, true);
  }
  clearPendingTokenMovementPosition(tokenId, { preserveCurrentSightLineGrace: true });
  refreshPendingMovementTokenVisibility([], {
    ignoreObservedGrace: true,
    source: 'movement-completion',
    targetTokenIds: refreshTargetIds,
  });
  schedulePostCompletionRenderRefreshes(tokenId, entry.serial, pendingMovementRefreshScheduler);

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
  scheduleAnimationRenderRefreshes(tokenId, serial, pendingMovementRefreshScheduler);

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

    const visualPositionReached = tokenVisualPositionReached(token, currentEntry.position);
    if (
      elapsedMs >= PENDING_MOVEMENT_ANIMATION_DETECTION_SETTLE_MS &&
      !visualPositionReached &&
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

function getPendingMovementBlockedDetectionEntriesUncached(
  target,
  {
    visionSources = canvas?.effects?.visionSources || [],
    lightSources = canvas?.effects?.lightSources || [],
  } = {},
) {
  if (!target?.document?.id) return [];
  if (!isTokenLikeTarget(target)) return [];
  if (!hasPendingMovementDetectionWork({ visionSources, lightSources })) return [];

  const blockedEntries = [];
  for (const source of [...sourceList(visionSources), ...sourceList(lightSources)]) {
    if (!source?.active || !source?.object) continue;

    const context = getPendingMovementBlockContext(source.object, target);
    if (!context.active) continue;

    if (contextSuppressesPendingDetectionSource(context)) {
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

export function getPendingMovementBlockedDetectionEntries(target, options = {}) {
  return withPendingMovementDecisionCache(() =>
    getPendingMovementBlockedDetectionEntriesUncached(target, options),
  );
}

function getPendingMovementRenderLockBlockedEntries(target) {
  return getPendingMovementBlockedDetectionEntries(target).filter(
    ({ source }) => !shouldUseCoreDetectionDuringPendingMovement(source?.object, target),
  );
}

function pendingHiddenTargetIsVisibleFromCurrentSources(target, hiddenStateContext) {
  const testPoints = target?.document?.getVisibilityTestPoints?.();
  const testVisibility = canvas?.visibility?.testVisibility;
  if (!testPoints?.length || !testVisibility) return false;

  try {
    return withPendingMovementHiddenStateVisibilityProbe(() =>
      withOnlyDetectionSourcesForObserver(hiddenStateContext?.observerId, () =>
        withSuppressedDetectionFilterProbe(
          target,
          () =>
            !!testVisibility.call(canvas.visibility, testPoints, {
              tolerance: 0,
              object: target,
            }),
          { clearWhenTruthy: true },
        ),
      ),
    );
  } catch {
    return false;
  }
}

function shouldTemporarilyForceTokenInvisibleUncached(
  target,
  { hasDetectionWork = null } = {},
) {
  if (!target?.document?.id) return false;
  if (target.controlled) return false;
  if (hasDetectionWork === null && !hasPendingMovementDetectionWork()) return false;
  if (hasDetectionWork === false) return false;

  rememberCoreVisibleGraceForCoreOwnedPendingObservers(target);

  const hiddenStateContext = getPendingMovementHiddenStateContext(target);
  if (hiddenStateContext) {
    const observer = tokenObjectForId(hiddenStateContext.observerId);
    if (
      coreVisibleGraceCanBypassHiddenState(
        observer,
        target,
        hiddenStateContext.visibilityState,
      )
    ) {
      forgetHiddenForceContext(target);
      return false;
    }

    if (
      hiddenStateVisibilityProbeCanBypassRenderLock(target, hiddenStateContext) &&
      pendingHiddenTargetIsVisibleFromCurrentSources(target, hiddenStateContext)
    ) {
      rememberCoreVisibleGraceContext(target, hiddenStateContext);
      forgetHiddenForceContext(target);
      return false;
    }

    rememberHiddenForceContext(target, hiddenStateContext);
    return true;
  }

  const blockedEntries = getPendingMovementRenderLockBlockedEntries(target);
  if (!blockedEntries.length) return false;

  const hiddenBlockedEntry = blockedEntries.find(
    ({ context }) => context.renderHiddenByVisioner || context.foundryHidden,
  );
  if (hiddenBlockedEntry) {
    rememberHiddenForceContext(target, hiddenBlockedEntry.context);
    return true;
  }

  const renderBlockedEntries = blockedEntries.filter(({ context }) => context.renderBlocked);
  if (!renderBlockedEntries.length) return false;

  const blockedSources = renderBlockedEntries.map(({ source }) => source);
  const renderLockContext = renderBlockedEntries[0]?.context ?? null;
  if (!hasActiveUnblockedObserverDetectionSource(blockedSources)) {
    if (renderLockContext) {
      rememberHiddenForceContext(target, renderLockContext);
    }
    return true;
  }

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

export function shouldTemporarilyForceTokenInvisible(target, options = {}) {
  return withPendingMovementDecisionCache(() =>
    shouldTemporarilyForceTokenInvisibleUncached(target, options),
  );
}

export function hasPendingMovementRenderWork() {
  cleanupExpiredPendingMovements();
  if (pendingTokenMovementPositions.size > 0) return true;
  if (pendingTokenMovementCompletionTimeouts.size > 0) return true;
  if (pendingTokenHiddenForceContexts.size > 0) return true;
  if (pendingMovementCoreVisibleGraceContexts.size > 0) return true;
  if (pendingMovementCurrentSightLineGraceContexts.size > 0) return true;
  if (hasObservedHiddenSoundwaveGraceContexts()) return true;
  if (!hasPendingMovementRenderLocks()) return false;

  const sceneTokens = new Set(canvas?.tokens?.placeables || []);
  return prunePendingMovementRenderLocks(sceneTokens) > 0;
}

export function resetPendingMovementPerformanceCounters() {
  pendingMovementPerformanceCounters.refreshCalls = 0;
  pendingMovementPerformanceCounters.targetedRefreshCalls = 0;
  pendingMovementPerformanceCounters.fullSceneRefreshCalls = 0;
  pendingMovementPerformanceCounters.suppressedRefreshCalls = 0;
  pendingMovementPerformanceCounters.tokensScanned = 0;
  pendingMovementPerformanceCounters.tokensRefreshed = 0;
  pendingMovementPerformanceCounters.bySource = {};
  pendingMovementCoalescedRefresh = null;
}

export function getPendingMovementPerformanceSnapshot() {
  if (!isMovementPerformanceDiagnosticsEnabled()) {
    return emptyPendingMovementPerformanceSnapshot();
  }

  return {
    ...pendingMovementPerformanceCounters,
    bySource: Object.fromEntries(
      Object.entries(pendingMovementPerformanceCounters.bySource).map(([source, counters]) => [
        source,
        { ...counters },
      ]),
    ),
  };
}

function getPendingMovementSourceCounters(source) {
  const sourceKey = source || 'unspecified';
  if (!pendingMovementPerformanceCounters.bySource[sourceKey]) {
    pendingMovementPerformanceCounters.bySource[sourceKey] = {
      refreshCalls: 0,
      targetedRefreshCalls: 0,
      fullSceneRefreshCalls: 0,
      suppressedRefreshCalls: 0,
      tokensScanned: 0,
      tokensRefreshed: 0,
    };
  }
  return pendingMovementPerformanceCounters.bySource[sourceKey];
}

function requestPendingMovementRefreshFrame(callback) {
  if (typeof requestAnimationFrame !== 'function') {
    callback();
    return null;
  }
  return requestAnimationFrame(callback);
}

function normalizeRefreshIds(value) {
  return (Array.isArray(value) ? value : [value]).filter(Boolean);
}

function mergePendingMovementRefreshOptions(existing, next) {
  const movingTokenIds = new Set([
    ...normalizeRefreshIds(existing.movingTokenIds),
    ...normalizeRefreshIds(next.movingTokenIds),
  ]);
  const existingTargetIds = existing.options.targetTokenIds
    ? normalizeRefreshIds(existing.options.targetTokenIds)
    : null;
  const nextTargetIds = next.options.targetTokenIds
    ? normalizeRefreshIds(next.options.targetTokenIds)
    : null;
  const targetTokenIds =
    existingTargetIds && nextTargetIds
      ? [...new Set([...existingTargetIds, ...nextTargetIds])]
      : null;

  return {
    movingTokenIds: [...movingTokenIds],
    options: {
      ignoreObservedGrace:
        !!existing.options.ignoreObservedGrace || !!next.options.ignoreObservedGrace,
      skipTokenRefresh:
        !!existing.options.skipTokenRefresh && !!next.options.skipTokenRefresh,
      skipPerceptionRefresh:
        !!existing.options.skipPerceptionRefresh && !!next.options.skipPerceptionRefresh,
      source: existing.options.source === next.options.source
        ? existing.options.source
        : 'coalesced',
      ...(targetTokenIds ? { targetTokenIds } : {}),
    },
  };
}

function scheduleCoalescedPendingMovementRefresh(movingTokenIds, options) {
  const next = { movingTokenIds, options: { ...options, coalesceFrame: false } };
  if (pendingMovementCoalescedRefresh) {
    pendingMovementCoalescedRefresh = {
      ...mergePendingMovementRefreshOptions(pendingMovementCoalescedRefresh, next),
      frameId: pendingMovementCoalescedRefresh.frameId,
    };
    return;
  }

  pendingMovementCoalescedRefresh = next;
  const frameId = requestPendingMovementRefreshFrame(() => {
    const refresh = pendingMovementCoalescedRefresh;
    pendingMovementCoalescedRefresh = null;
    if (!refresh) return;
    refreshPendingMovementTokenVisibility(refresh.movingTokenIds, refresh.options);
  });
  if (pendingMovementCoalescedRefresh) pendingMovementCoalescedRefresh.frameId = frameId;
}

function pendingMovementEntriesSignature() {
  return [...pendingTokenMovementPositions.entries()]
    .map(([tokenId, entry]) => {
      const position = entry?.position || {};
      return `${tokenId}:${entry?.serial ?? 0}:${Number(position.x ?? 0)}:${Number(position.y ?? 0)}`;
    })
    .sort()
    .join('|');
}

function tokenVisualSignature(token) {
  return [
    !!token?.visible,
    !!token?.renderable,
    !!token?.mesh?.visible,
    !!token?.mesh?.renderable,
    token?.mesh?.alpha ?? '',
    !!token?.detectionFilter,
    !!token?.detectionFilterMesh,
  ].join(':');
}

function storedVisibilitySignatureForToken(token) {
  const targetId = tokenIdOf(token);
  if (!targetId) return '';
  return pendingMovementObserverCandidates()
    .map((observer) => {
      const observerId = tokenIdOf(observer);
      if (!observerId || observerId === targetId) return null;
      return `${observerId}:${getStoredVisibilityState(observer, token) || ''}`;
    })
    .filter(Boolean)
    .sort()
    .join('|');
}

function pendingMovementTokenRefreshSignature(token, context) {
  return [
    tokenIdOf(token) || '',
    pendingMovementEntriesSignature(),
    storedVisibilitySignatureForToken(token),
    tokenVisualSignature(token),
    context.ignoreObservedGrace ? 'ignore-observed-grace' : '',
    context.hasDetectionWork ? 'detection-work' : '',
  ].join('||');
}

function shouldSkipUnchangedPendingMovementTokenRefresh(token, context) {
  if (!token || context.skipTokenRefresh) return false;
  if (context.shouldForceInvisible) return false;
  if (context.renderHiddenLockDecision) return false;
  if (context.hasSpecialVisualWork) return false;

  const signature = pendingMovementTokenRefreshSignature(token, context);
  if (pendingMovementTokenRefreshSignatures.get(token) !== signature) {
    return false;
  }
  return true;
}

function rememberPendingMovementTokenRefreshSignature(token, context) {
  if (!token || context.skipTokenRefresh) return;
  pendingMovementTokenRefreshSignatures.set(
    token,
    pendingMovementTokenRefreshSignature(token, context),
  );
}

function refreshPendingMovementTokenVisibilityUncached(
  movingTokenIds = [],
  {
    ignoreObservedGrace = false,
    skipTokenRefresh = false,
    skipPerceptionRefresh = false,
    source = 'unspecified',
    targetTokenIds = null,
  } = {},
) {
  const ids = new Set(
    (Array.isArray(movingTokenIds) ? movingTokenIds : [movingTokenIds]).filter(Boolean),
  );
  const targetIds = targetTokenIds
    ? new Set((Array.isArray(targetTokenIds) ? targetTokenIds : [targetTokenIds]).filter(Boolean))
    : null;
  const tokens = targetIds
    ? (canvas?.tokens?.placeables || []).filter((token) => targetIds.has(tokenIdOf(token)))
    : canvas?.tokens?.placeables || [];
  const hasDetectionWork = hasPendingMovementDetectionWork();
  const trackPerformance = isMovementPerformanceDiagnosticsEnabled();
  const sourceCounters = trackPerformance ? getPendingMovementSourceCounters(source) : null;
  if (trackPerformance) {
    pendingMovementPerformanceCounters.refreshCalls += 1;
    sourceCounters.refreshCalls += 1;
    if (targetIds) {
      pendingMovementPerformanceCounters.targetedRefreshCalls += 1;
      sourceCounters.targetedRefreshCalls += 1;
    } else {
      pendingMovementPerformanceCounters.fullSceneRefreshCalls += 1;
      sourceCounters.fullSceneRefreshCalls += 1;
    }
  }

  if (isPendingMovementVisualRefreshSuppressed()) {
    if (trackPerformance) {
      pendingMovementPerformanceCounters.suppressedRefreshCalls += 1;
      sourceCounters.suppressedRefreshCalls += 1;
    }
    return;
  }

  for (const token of tokens) {
    if (ids.has(tokenIdOf(token))) {
      continue;
    }
    if (trackPerformance) {
      pendingMovementPerformanceCounters.tokensScanned += 1;
      sourceCounters.tokensScanned += 1;
    }
    try {
      if (canRestoreDetectionFilterPendingRenderLock(token)) {
        restorePendingMovementTokenRendering(token, { ignoreObservedGrace });
        continue;
      }

      if (
        hasAwaitingDetectionFilterRenderLock(token) &&
        !tokenHasDetectionFilterVisual(token)
      ) {
        forcePendingMovementTokenInvisible(token);
        continue;
      }

      const shouldForceInvisible = shouldTemporarilyForceTokenInvisible(token, { hasDetectionWork });
      if (shouldForceInvisible) {
        forcePendingMovementTokenInvisible(token);
      }
      if (
        !shouldForceInvisible &&
        (clearObservedDetectionFilterVisualsForCurrentView(token) ||
          clearObservedDetectionFilterVisualsForCurrentSightLine(token))
      ) {
        continue;
      }
      if (!shouldForceInvisible) {
        const renderHiddenLockDecision = getCoreOwnedRenderHiddenLockRefreshDecision(token);
        if (renderHiddenLockDecision === 'restore') {
          restorePendingMovementTokenRendering(token, { ignoreObservedGrace });
          continue;
        }
        if (renderHiddenLockDecision === 'keep-locked') {
          forcePendingMovementTokenInvisible(token);
          continue;
        }
      }
      if (
        !shouldForceInvisible &&
        !skipTokenRefresh &&
        !!token?.detectionFilter &&
        shouldStabilizeHiddenDetectionFilterAnimation(token)
      ) {
        withStableHiddenDetectionFilterAnimation(token, () => undefined);
        continue;
      }
      const detectionFilterState = shouldForceInvisible
        ? null
        : capturePendingMovementDetectionFilterState(token, { hasDetectionWork });
      const refreshContext = {
        hasDetectionWork,
        ignoreObservedGrace,
        renderHiddenLockDecision: null,
        shouldForceInvisible,
        skipTokenRefresh,
        hasSpecialVisualWork:
          !!detectionFilterState ||
          hasPendingRenderState(token) ||
          isPendingMovementRenderLocked(token),
      };
      if (shouldSkipUnchangedPendingMovementTokenRefresh(token, refreshContext)) {
        continue;
      }
      if (!skipTokenRefresh) {
        token?.refresh?.();
        if (trackPerformance) {
          pendingMovementPerformanceCounters.tokensRefreshed += 1;
          sourceCounters.tokensRefreshed += 1;
        }
        hideTokenLevelIndicatorSurface(token);
        if (shouldForceInvisible) {
          forcePendingMovementTokenInvisible(token);
        } else {
          const restored = restorePendingMovementTokenRendering(token, { ignoreObservedGrace });
          if (!restored && hasPendingRenderState(token)) {
            forcePendingMovementTokenInvisible(token);
          } else {
            const nativeRecomputedDetectionFilter =
              detectionFilterState &&
              token.detectionFilter &&
              token.detectionFilter !== detectionFilterState.detectionFilter;
            if (!nativeRecomputedDetectionFilter) {
              restorePendingMovementDetectionFilterState(token, detectionFilterState);
            }
          }
        }
        rememberPendingMovementTokenRefreshSignature(token, refreshContext);
      }
    } catch {
      /* best-effort visual refresh */
    }
  }

  if (!skipTokenRefresh && !skipPerceptionRefresh) {
    try {
      scheduleCanvasPerceptionUpdate({ refreshVision: true, refreshOcclusion: true });
    } catch {
      /* best-effort perception refresh */
    }
  }
}

export function refreshPendingMovementTokenVisibility(movingTokenIds = [], options = {}) {
  if (options?.coalesceFrame) {
    scheduleCoalescedPendingMovementRefresh(movingTokenIds, options);
    return undefined;
  }

  return withPendingMovementDecisionCache(() =>
    refreshPendingMovementTokenVisibilityUncached(movingTokenIds, options),
  );
}
