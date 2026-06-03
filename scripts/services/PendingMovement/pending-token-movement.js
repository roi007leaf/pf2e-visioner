import { LightingLevel, MODULE_ID } from '../../constants.js';
import { scheduleCanvasPerceptionUpdate } from '../../helpers/perception-refresh.js';
import { getWallSenseTypes } from '../../helpers/wall-sense-utils.js';
import { getRawPerceptionProfileEntry } from '../../stores/visibility-profile-flag-persistence.js';
import { LightingCalculator } from '../../visibility/auto-visibility/LightingCalculator.js';
import { VisionAnalyzer } from '../../visibility/auto-visibility/VisionAnalyzer.js';
import {
  isMovementPerformanceDiagnosticsEnabled,
  isPendingMovementVisualRefreshSuppressed,
} from '../runtime-state.js';
import { shouldBypassAvsForGmVision } from '../gm-vision-bypass.js';
import { isSelectAllTokenVisibilityBypassActive } from '../Detection/select-all-token-visibility-bypass.js';
import { drawHiddenTokenEcho, removeHiddenTokenEcho } from '../hidden-token-echoes.js';
import {
  createPendingMovementFinalVisibilityController,
  createPendingVisibilityStateMap,
  mergeMissingPendingVisibilityStateMap,
  normalizePendingVisibilityState as normalizeVisibilityState,
} from './pending-movement-final-visibility.js';
import { createPendingMovementCurrentViewSoundwaveController } from './pending-movement-current-view-soundwave.js';
import { createPendingMovementDecisionContextController } from './pending-movement-decision-context.js';
import { createPendingMovementDetectionFilterRenderingController } from './pending-movement-detection-filter-rendering.js';
import {
  cachePendingMovementEvaluation,
  cachePendingMovementObjectEvaluation,
  withPendingMovementEvaluationCache,
} from './pending-movement-evaluation-cache.js';
import {
  buildPendingMovementRoutePositions,
  centerForToken,
  coreVisibilityTestPoints,
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
  sanitizeCanvasDetectionFilterLists,
  sanitizeDetectionFilterList,
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
const PENDING_MOVEMENT_CURRENT_SIGHT_LINE_GRACE_MS = 2000;
const PENDING_MOVEMENT_ANIMATION_DETECTION_DELAY_MS = 50;
const PENDING_MOVEMENT_ANIMATION_DETECTION_SETTLE_MS = 250;
const PENDING_MOVEMENT_CORE_ANIMATION_VISION_REFRESH_INTERVAL_MS = 100;
const PENDING_MOVEMENT_CORE_ANIMATION_VISION_REBUILD_INTERVAL_MS = 100;
const PENDING_MOVEMENT_OCCLUSION_SUPPRESSION_MS = PENDING_MOVEMENT_TTL_MS;
const PENDING_MOVEMENT_REFRESH_VISIBILITY_PERCEPTION_COALESCE_MS = 3000;
export const DETECTION_BLOCKING_VISIBILITY_STATES = new Set(['hidden', 'undetected', 'unnoticed']);
const RENDER_HIDDEN_FROM_OBSERVER_STATES = new Set(['undetected', 'unnoticed']);
const HIDDEN_STATE_RENDER_HIDDEN_ACTOR_TYPES = new Set(['hazard', 'loot']);
const CORE_LOS_TRANSITION_REFRESH_STATES = new Set(['observed', 'concealed']);
const controlledDragSoundwaveBaselineByObserverId = new Map();
const PENDING_MOVEMENT_SUPPRESSION_KEY = 'pf2eVisionerPendingMovement';
const PENDING_MOVEMENT_CORE_ANIMATION_RENDER_FLAGS = new Set([
  'refreshLightSources',
  'refreshLighting',
  'refreshOccludedSurfaces',
  'refreshOcclusionMask',
  'refreshOcclusionStates',
  'refreshSounds',
  'refreshVision',
  'refreshVisionSources',
  'soundFadeDuration',
]);

const pendingTokenMovementPositions = new Map();
function syncActivePendingMovementGlobalFlag() {
  globalThis.__pf2eVisionerHasActivePendingTokenMovement = pendingTokenMovementPositions.size > 0;
}
const pendingTokenMovementCompletionTimeouts = new Map();
const pendingTokenHiddenForceContexts = new Map();
const pendingMovementCoreVisibleGraceContexts = new Map();
const pendingMovementCurrentSightLineGraceContexts = new Map();
let pendingMovementHiddenStateVisibilityProbeDepth = 0;
let pendingMovementSerial = 0;
const recentCompletedMovementRefreshTargetIds = new Map();
let pendingMovementRefreshTargetIdSetCache = null;
let pendingMovementVisibilityOwnershipTokenIdSetCache = null;
const pendingMovementTokenRefreshSignatures = new WeakMap();
const pendingMovementRefreshVisibilityPerceptionTargets = new WeakMap();
let pendingMovementCoalescedRefresh = null;
let pendingMovementOcclusionOnlyPerceptionSuppression = null;
let pendingMovementTokenRefreshPerceptionCoalescing = null;
let pendingMovementCoreAnimationPerceptionDepth = 0;
let pendingMovementCoreAnimationBypassUntil = 0;
const pendingMovementCoreAnimationVisionRefreshFrames = new Map();
const pendingMovementCoreAnimationVisionRefreshPositionKeys = new Map();
let pendingMovementCanvasVisibilityHandleCache = null;
let pendingMovementBlockedDetectionEntriesCache = null;
let pendingMovementHiddenStateContextCache = null;
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
  getAnimationTargetTokenIds: (tokenId) => getCoreAnimationRefreshTargetIdsForMovement(tokenId),
  getTargetTokenIds: (tokenId) => getAnimationRefreshTargetIdsForMovement(tokenId),
  shouldUseFullAnimationRefreshCadence: (tokenId) => shouldUseFullAnimationRefreshCadence(tokenId),
  shouldUseFullPostCompletionRefreshCadence: (tokenId) =>
    shouldUseFullPostCompletionRefreshCadence(tokenId),
  hasActivePendingMovementForObserver: (tokenId) => hasActivePendingMovementForObserver(tokenId),
  hasRenderWork: () => hasPendingMovementRenderWork(),
  refreshTokenVisibility: (movingTokenIds, options) =>
    refreshPendingMovementTokenVisibility(movingTokenIds, options),
};

function restorePendingMovementOcclusionOnlyPerceptionSuppression() {
  const state = pendingMovementOcclusionOnlyPerceptionSuppression;
  if (!state) return;
  flushThrottledCoreAnimationVisionPerceptionUpdate(state);
  clearThrottledCoreAnimationVisionPerceptionUpdate(state);
  if (state.perception?.update === state.wrappedUpdate) {
    state.perception.update = state.originalUpdate;
  }
  if (state.perception?.applyRenderFlags === state.wrappedApplyRenderFlags) {
    state.perception.applyRenderFlags = state.originalApplyRenderFlags;
  }
  pendingMovementOcclusionOnlyPerceptionSuppression = null;
}

function requestPendingMovementCoreAnimationFrame(callback) {
  if (typeof requestAnimationFrame === 'function') {
    const frameId = requestAnimationFrame(callback);
    return {
      cancel: () => {
        if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frameId);
      },
      frameId,
    };
  }

  const frameId = setTimeout(() => callback(Date.now()), 16);
  return {
    cancel: () => clearTimeout(frameId),
    frameId,
  };
}

function clearCoreAnimationVisionRefresh(tokenId) {
  const frame = pendingMovementCoreAnimationVisionRefreshFrames.get(tokenId);
  if (!frame) return;
  try {
    frame.cancel?.();
  } catch {
    /* best-effort frame cancellation */
  }
  pendingMovementCoreAnimationVisionRefreshFrames.delete(tokenId);
  pendingMovementCoreAnimationVisionRefreshPositionKeys.delete(tokenId);
}

function clearPendingMovementAnimationSuppressionIfIdle({
  preserveCurrentSightLineGrace = false,
  preserveRecentCompletedMovementContext = false,
} = {}) {
  if (pendingTokenMovementPositions.size) return;
  if (preserveCurrentSightLineGrace || preserveRecentCompletedMovementContext) return;

  pendingMovementCoreAnimationBypassUntil = 0;
  restorePendingMovementOcclusionOnlyPerceptionSuppression();
}

const pendingControlledTokenDragIntentAdapter = {
  getRefreshTargetIds: (tokenId) => {
    const observer = tokenObjectForId(tokenId);
    if (!isControlledTokenDragActive(observer)) return [];
    return getControlledObserverDragPreviewSoundwaveTargetIds(observer);
  },
  refreshTokenVisibility: (movingTokenIds, options) =>
    refreshPendingMovementTokenVisibility(movingTokenIds, options),
  tokenIdOf,
};
const pendingFinalVisibilityController = createPendingMovementFinalVisibilityController({
  actorOf,
  detectionBlockingVisibilityStates: DETECTION_BLOCKING_VISIBILITY_STATES,
  getEntry: (tokenId) => pendingTokenMovementPositions.get(tokenId),
  getPlaceableTokens: () => canvas?.tokens?.placeables || [],
  getRefreshTargetIds: (tokenId) => getAnimationRefreshTargetIdsForMovement(tokenId),
  getStoredVisibilityState,
  hasLineOfSightToSampledToken,
  isTokenLikeTarget,
  refreshTokenVisibility: (movingTokenIds, options) =>
    refreshPendingMovementTokenVisibility(movingTokenIds, options),
  renderHiddenFromObserverStates: RENDER_HIDDEN_FROM_OBSERVER_STATES,
  shouldDeferFinalVisibilityPrediction: (tokenId, entry) => {
    const token = tokenObjectForId(tokenId) || entry?.tokenDoc?.object;
    if (!token || !entry?.position) return false;
    return (
      tokenIsAnimating(token) ||
      (entry.deferFinalVisibilityUntilVisualSettled === true &&
        !tokenVisualPositionReached(token, entry.position))
    );
  },
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
  hasActiveAvsOverride,
  hasPendingControlledTokenDragIntent,
  hasPendingMovementDetectionWork,
  hiddenSoundwaveShouldSurviveLimitedWall,
  hiddenSoundwaveShouldSurviveSightBlockedSoundOpen,
  isDragPreviewOnlyActive: isActualControlledDragPreviewOnlyActive,
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
  observedSoundwaveShouldWaitForCore,
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
    hiddenSoundwaveShouldPrimeSightBlockedSoundOpen,
    hiddenSoundwaveShouldSurviveSightBlockedSoundOpen,
    isDragPreviewOnlyActive: isActualControlledDragPreviewOnlyActive,
    observedSoundwaveShouldWaitForCore,
    restorePendingMovementDetectionFilterVisualState,
    shouldAllowCoreHiddenSoundwaveForCurrentView,
    shouldPreserveHiddenSoundwaveForCurrentView,
    shouldTemporarilyForceTokenInvisible,
    tokenHasDetectionFilterMeshVisual,
    tokenHasDetectionFilterVisual,
  });

export function shouldSuppressPendingMovementDetectionFilterVisuals(token, options) {
  return withPendingMovementDecisionCache(() =>
    pendingDetectionFilterRenderingController.shouldSuppressPendingMovementDetectionFilterVisuals(
      token,
      options,
    ),
  );
}

export function shouldPreservePendingMovementDetectionFilterVisuals(token, options) {
  return withPendingMovementDecisionCache(() =>
    pendingDetectionFilterRenderingController.shouldPreservePendingMovementDetectionFilterVisuals(
      token,
      options,
    ),
  );
}

export function shouldPrimePendingMovementDetectionFilterVisuals(token, options) {
  return withPendingMovementDecisionCache(() =>
    pendingDetectionFilterRenderingController.shouldPrimePendingMovementDetectionFilterVisuals(
      token,
      options,
    ),
  );
}

export function shouldStabilizeHiddenDetectionFilterAnimation(token) {
  return pendingDetectionFilterRenderingController.shouldStabilizeHiddenDetectionFilterAnimation(
    token,
  );
}

export function withStableHiddenDetectionFilterAnimation(token, callback, options) {
  return pendingDetectionFilterRenderingController.withStableHiddenDetectionFilterAnimation(
    token,
    callback,
    options,
  );
}

export function primePendingMovementDetectionFilterVisuals(token, options) {
  return withPendingMovementDecisionCache(() =>
    pendingDetectionFilterRenderingController.primePendingMovementDetectionFilterVisuals(
      token,
      options,
    ),
  );
}

export function withPreservedPendingMovementDetectionFilterVisuals(token, callback) {
  return pendingDetectionFilterRenderingController.withPreservedPendingMovementDetectionFilterVisuals(
    token,
    callback,
  );
}

export function withSuppressedPendingMovementDetectionFilterVisuals(token, callback) {
  return pendingDetectionFilterRenderingController.withSuppressedPendingMovementDetectionFilterVisuals(
    token,
    callback,
  );
}

export function withSuppressedPendingMovementDetectionFilterRender(token, callback) {
  return pendingDetectionFilterRenderingController.withSuppressedPendingMovementDetectionFilterRender(
    token,
    callback,
  );
}

function withSuppressedDetectionFilterProbe(token, callback, options) {
  return pendingDetectionFilterRenderingController.withSuppressedDetectionFilterProbe(
    token,
    callback,
    options,
  );
}

export function suppressPendingMovementDetectionFilterVisualsForObservedTransition(token, options) {
  return pendingCurrentViewSoundwaveController.suppressPendingMovementDetectionFilterVisualsForObservedTransition(
    token,
    options,
  );
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

function foundryHiddenRequiresVisionerRenderLock(tokenOrDoc) {
  return !!tokenDocOf(tokenOrDoc)?.hidden && !globalThis.game?.user?.isGM;
}

function gmVisionBypassPendingMovementBlockContext(observer, target) {
  return {
    active: false,
    observerId: tokenIdOf(observer),
    observerName: observer?.name ?? observer?.document?.name,
    targetId: tokenIdOf(target),
    targetName: target?.name ?? target?.document?.name,
    visibilityState: 'observed',
    hiddenByVisioner: false,
    renderHiddenByVisioner: false,
    foundryHidden: false,
    wallBlocked: false,
    soundBlocked: false,
    wallDetectionBlocked: false,
    routeWallBlocked: false,
    blocked: false,
    renderBlocked: false,
    gmVisionBypass: true,
  };
}

function hasActiveAvsOverride(observer, target) {
  const observerId = tokenIdOf(observer);
  if (!observerId) return false;
  const targetFlags = tokenDocOf(target)?.flags?.[MODULE_ID];
  if (!targetFlags) return false;
  const override = targetFlags[`avs-override-from-${observerId}`];
  return !!override;
}

export function targetHasAnyHiddenAvsOverride(target) {
  const targetFlags = tokenDocOf(target)?.flags?.[MODULE_ID];
  if (!targetFlags) return false;
  for (const key of Object.keys(targetFlags)) {
    if (!key.startsWith('avs-override-from-')) continue;
    const override = targetFlags[key];
    if (override?.state === 'hidden') return true;
  }
  return false;
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

function hasPendingMovementDetectionWork({
  visionSources = canvas?.effects?.visionSources || [],
  lightSources = canvas?.effects?.lightSources || [],
} = {}) {
  cleanupExpiredPendingMovements();
  if (pendingTokenMovementPositions.size > 0) return true;
  return false;
}

function cleanupExpiredPendingMovements(now = Date.now()) {
  let removedExpiredMovement = false;
  for (const [tokenId, entry] of pendingTokenMovementPositions.entries()) {
    if (!entry || entry.expiresAt <= now) {
      clearCoreAnimationVisionRefresh(tokenId);
      pendingTokenMovementPositions.delete(tokenId);
      removedExpiredMovement = true;
    }
  }
  if (removedExpiredMovement)
    rebalancePendingMovementRoutePointBudgets(pendingTokenMovementPositions);
  if (removedExpiredMovement) syncActivePendingMovementGlobalFlag();
  pruneExpiredCoreVisibleGraceContexts(now);
  pruneExpiredCurrentSightLineGraceContexts(now);
  pruneExpiredObservedHiddenSoundwaveGraceContexts(now);
}

function hasActivePendingMovementForObserver(observerId) {
  if (!observerId) return false;
  cleanupExpiredPendingMovements();
  return pendingTokenMovementPositions.has(observerId);
}

export function hasActivePendingTokenMovement() {
  cleanupExpiredPendingMovements();
  return pendingTokenMovementPositions.size > 0;
}

export function isPendingMovementDragPreviewOnlyActive() {
  cleanupExpiredPendingMovements();
  if (pendingTokenMovementPositions.size > 0) return false;
  if (recentCompletedMovementRefreshTargetIds.size > 0) return false;
  if (canvas?.tokens?._draggedToken) return true;
  if ((canvas?.tokens?.placeables || []).some((token) => token?.isDragged)) return true;
  const controlledTokens = (canvas?.tokens?.controlled || []).length
    ? canvas.tokens.controlled
    : (canvas?.tokens?.placeables || []).filter((token) => token?.controlled);
  return controlledTokens.some((token) => hasPendingControlledTokenDragIntent(token));
}

export function isActualControlledDragPreviewOnlyActive() {
  cleanupExpiredPendingMovements();
  if (pendingTokenMovementPositions.size > 0) return false;
  return !!canvas?.tokens?._draggedToken;
}

export function getPendingMovementObserverIds() {
  cleanupExpiredPendingMovements();
  return Array.from(pendingTokenMovementPositions.keys());
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

function pendingMovementHookOptionsMayAnimate(options = {}) {
  const hookOptions = options.hookOptions || options.options || options || {};
  if (hookOptions.animate === false || hookOptions.animation === false) return false;
  if (hookOptions.method === 'dragging') return true;
  if (hookOptions._movement) return true;
  if (hookOptions.animate === true || hookOptions.animation) return true;
  return false;
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

export function getControlledObserverDetectionVisualTargetIds(
  observer = canvas?.tokens?.controlled?.[0],
) {
  if (isSelectAllTokenVisibilityBypassActive()) return [];

  const observerId = tokenIdOf(observer);
  if (!observerId) return [];

  return (canvas?.tokens?.placeables || [])
    .filter((token) => {
      const targetId = tokenIdOf(token);
      if (!targetId || targetId === observerId) return false;
      const storedState = getStoredVisibilityState(observer, token);
      if (DETECTION_BLOCKING_VISIBILITY_STATES.has(storedState)) return true;
      if (!CORE_LOS_TRANSITION_REFRESH_STATES.has(storedState)) return false;
      const sightBlockedSoundOpen = currentSightBlockedSoundOpenWall(observer, token);
      if (sightBlockedSoundOpen) return true;
      return tokenHasDetectionFilterVisual(token);
    })
    .map((token) => tokenIdOf(token));
}

export function getControlledObserverDragPreviewSoundwaveTargetIds(
  observer = canvas?.tokens?.controlled?.[0],
) {
  void observer;
  return [];
}

function captureControlledDragSoundwaveBaseline(observer) {
  const observerId = tokenIdOf(observer);
  if (!observerId || controlledDragSoundwaveBaselineByObserverId.has(observerId)) return;

  const targetIds = new Set();
  for (const target of canvas?.tokens?.placeables || []) {
    const targetId = tokenIdOf(target);
    if (!targetId || targetId === observerId) continue;
    if (!tokenHasDetectionFilterVisual(target) && !tokenHasDetectionFilterMeshVisual(target)) {
      continue;
    }
    targetIds.add(targetId);
  }
  controlledDragSoundwaveBaselineByObserverId.set(observerId, targetIds);
}

function clearControlledDragSoundwaveBaseline(observer = null) {
  if (!observer) {
    controlledDragSoundwaveBaselineByObserverId.clear();
    return;
  }

  const observerId = tokenIdOf(observer);
  if (!observerId) return;
  controlledDragSoundwaveBaselineByObserverId.delete(observerId);
}

function dragBaselineIncludesSoundwaveTarget(observer, target) {
  const observerId = tokenIdOf(observer);
  const targetId = tokenIdOf(target);
  if (!observerId || !targetId) return false;
  return controlledDragSoundwaveBaselineByObserverId.get(observerId)?.has(targetId) === true;
}

export function clearControlledObserverDragPreviewAddedSoundwaves(
  observer = canvas?.tokens?.controlled?.[0],
) {
  if (!observer) return 0;
  let cleared = 0;
  for (const target of canvas?.tokens?.placeables || []) {
    if (!target || tokenIdOf(target) === tokenIdOf(observer)) continue;
    const storedState = getStoredVisibilityState(observer, target);
    if (DETECTION_BLOCKING_VISIBILITY_STATES.has(storedState)) continue;
    if (dragBaselineIncludesSoundwaveTarget(observer, target)) continue;
    if (!tokenHasDetectionFilterVisual(target) && !tokenHasDetectionFilterMeshVisual(target)) continue;
    clearDetectionFilterVisuals(target);
    cleared += 1;
  }
  return cleared;
}

function shouldRefreshCoreLosTransitionTarget(observer, target, visibilityState) {
  if (!observer || !target?.document?.id) return false;
  if (!CORE_LOS_TRANSITION_REFRESH_STATES.has(visibilityState)) return false;
  if (!hasCoreOwnedPendingMovement(observer, target)) return false;

  return !currentPendingMovementSightLineSeesTarget(observer, target);
}

export function primePendingControlledTokenDragIntent(tokenOrDoc, options = {}) {
  const existingIntent = hasPendingControlledTokenDragIntent(tokenOrDoc);
  const primed = primeControlledTokenDragIntent(tokenOrDoc, {
    ...pendingControlledTokenDragIntentAdapter,
    ...options,
  });
  if (!primed) return false;
  if (!existingIntent) captureControlledDragSoundwaveBaseline(tokenOrDoc);
  return true;
}

export function refreshPendingControlledTokenDragIntent(tokenOrDoc, options = {}) {
  if (!hasPendingControlledTokenDragIntent(tokenOrDoc)) return false;
  return primePendingControlledTokenDragIntent(tokenOrDoc, options);
}

export function releasePendingControlledTokenDragIntent(tokenOrDoc = null, options = {}) {
  clearControlledDragSoundwaveBaseline(tokenOrDoc);
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
  if (typeof animation === 'object' && Object.keys(animation).length === 0) return true;
  return !!animation.promise || !!animation.active || animation.state !== undefined;
}

function tokenIsAnimating(token) {
  if (!token) return false;
  if (token.animation && typeof token.animation === 'object') {
    if (movementAnimationIsRunning(token.animation)) return true;
  }
  return movementAnimationIsRunning(token._animation);
}

function movementAnimationInfo(animation) {
  if (!animation) return null;
  return {
    state: animation.state ?? null,
    active: animation.active ?? null,
    hasPromise: !!animation.promise,
  };
}

function hasLineOfSightToSampledToken(originPoint, targetPoints, options = {}) {
  if (!originPoint || !targetPoints?.length) return false;
  if (!lineOfSightBlockedByWall(originPoint, targetPoints[0], options)) return true;

  let clearRays = 0;
  for (const targetPoint of targetPoints.slice(1)) {
    if (lineOfSightBlockedByWall(originPoint, targetPoint, options)) continue;
    clearRays += 1;
    if (clearRays >= 2) return true;
  }

  return false;
}

function sceneHasPendingMovementLimitedOrThresholdWallSense(senseType) {
  return cachePendingMovementEvaluation('sceneLimitedOrThresholdWallSense', senseType, () =>
    sceneHasLimitedOrThresholdWallSense(senseType),
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
  if (
    isControlledMovementPreviewToken(canonicalToken) ||
    isControlledTokenDragActive(canonicalToken)
  ) {
    return true;
  }

  const tokenId = tokenIdOf(canonicalToken);
  const token = canonicalToken?.document ? canonicalToken : tokenObjectForId(tokenId);
  if (tokenIsAnimating(token)) return true;
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
  if (
    isControlledMovementPreviewToken(canonicalToken) ||
    isControlledTokenDragActive(canonicalToken)
  ) {
    return true;
  }

  const tokenId = tokenIdOf(canonicalToken);
  const token = canonicalToken?.document ? canonicalToken : tokenObjectForId(tokenId);
  if (tokenIsAnimating(token)) return true;
  if (!entry?.position || !token) return false;

  const currentPosition = tokenVisualMovementPosition(token);
  const startPosition = entry.routePositions?.[0] ?? null;
  return !!(currentPosition && startPosition && !positionsEqual(currentPosition, startPosition));
}

function getStoredVisibilityState(observer, target) {
  const targetId = tokenIdOf(target);
  if (!targetId) return 'observed';

  const profile = getRawPerceptionProfileEntry(observer, targetId);
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

function coreVisibilityTestPointsForPendingTarget(target) {
  return coreVisibilityTestPoints(target);
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
      source?.los?.contains?.(point.x, point.y) || source?.shape?.contains?.(point.x, point.y),
  );
}

function sourceHasVisibilityPolygon(source) {
  return (
    typeof source?.los?.contains === 'function' ||
    typeof source?.shape?.contains === 'function'
  );
}

function lightingLevelForPendingToken(token) {
  const position = centerForToken(token);
  if (!position) return null;
  const key = [
    tokenIdOf(token) || 'token',
    Math.round(position.x ?? 0),
    Math.round(position.y ?? 0),
    token?.document?.elevation ?? token?.elevation ?? 0,
  ].join(':');

  return cachePendingMovementEvaluation('lightingLevel', key, () => {
    try {
      const result = LightingCalculator.getInstance()?.getLightLevelAt?.(position, token);
      if (!result) return null;
      if (result.greaterMagicalDarkness || result.isHeightenedDarkness) {
        return LightingLevel.GREATER_MAGICAL_DARKNESS;
      }
      if (result.magicalDarkness || result.isDarknessSource) {
        return LightingLevel.MAGICAL_DARKNESS;
      }
      return result.level || null;
    } catch {
      return null;
    }
  });
}

function pendingObserverVisionCapabilities(observer) {
  const key = tokenIdOf(observer) || observer;
  return cachePendingMovementEvaluation('observerVisionCapabilities', key, () => {
    try {
      return VisionAnalyzer.getInstance()?.getVisionCapabilities?.(observer) || null;
    } catch {
      return null;
    }
  });
}

function pendingObserverHasPreciseVision(observer, senseType) {
  const capabilities = pendingObserverVisionCapabilities(observer);
  if (!capabilities) return false;
  if (senseType === 'greaterDarkvision') {
    return capabilities.hasGreaterDarkvision === true;
  }
  if (senseType === 'darkvision') {
    return capabilities.hasDarkvision === true;
  }
  if (senseType === 'lowLightVision') {
    return capabilities.hasLowLightVision === true;
  }
  return capabilities.hasVision !== false;
}

function pendingLightingAllowsVisualDetection(observer, target) {
  const targetLighting = lightingLevelForPendingToken(target);
  if (!targetLighting) return true;

  const observerLighting = lightingLevelForPendingToken(observer);
  let effectiveLighting = targetLighting;
  if (observerLighting === LightingLevel.GREATER_MAGICAL_DARKNESS) {
    effectiveLighting = LightingLevel.GREATER_MAGICAL_DARKNESS;
  } else if (
    observerLighting === LightingLevel.MAGICAL_DARKNESS &&
    effectiveLighting !== LightingLevel.GREATER_MAGICAL_DARKNESS
  ) {
    effectiveLighting = LightingLevel.MAGICAL_DARKNESS;
  }

  if (pendingObserverHasPreciseVision(observer, 'greaterDarkvision')) return true;
  if (pendingObserverHasPreciseVision(observer, 'darkvision')) return true;
  if (pendingObserverHasPreciseVision(observer, 'lowLightVision')) {
    return effectiveLighting === LightingLevel.BRIGHT || effectiveLighting === LightingLevel.DIM;
  }
  if (!pendingObserverHasPreciseVision(observer, 'vision')) return false;
  return effectiveLighting === LightingLevel.BRIGHT || effectiveLighting === LightingLevel.DIM;
}

function sourceVisuallyContainsAnyTargetPoint(observer, source, target, targetPoints) {
  if (!sourceContainsAnyTargetPoint(source, targetPoints)) return false;
  return pendingLightingAllowsVisualDetection(observer, target);
}

function sightSourceObserverHasActiveMovement(observer, target) {
  const observerId = tokenIdOf(observer);
  if (!observerId) return false;
  if (hasCoreOwnedPendingMovement(observer, target)) return true;
  if (hasActivePendingMovementForObserver(observerId)) return true;
  return tokenIdOf(canvas?.tokens?._draggedToken) === observerId;
}

function observerHasPendingRevealMovement(observer, target) {
  cleanupExpiredPendingMovements();
  const observerId = tokenIdOf(observer);
  const targetId = tokenIdOf(target);
  const observerEntry = observerId ? pendingTokenMovementPositions.get(observerId) : null;
  const targetEntry = targetId ? pendingTokenMovementPositions.get(targetId) : null;
  return !!(
    (observerEntry?.position &&
      pendingMovementTokenHasCoreOwnedPosition(
        observer,
        observerEntry,
      )) ||
    (targetEntry?.position && pendingMovementTokenHasCoreOwnedPosition(target, targetEntry))
  );
}

export function currentPendingMovementSightLineSeesTargetUncached(observer, target) {
  if (!observer || !target?.document?.id) return false;
  if (!observerHasUsableSight(observer)) return false;

  const coreTargetPoints = coreVisibilityTestPointsForPendingTarget(target);
  if (!coreTargetPoints.length) return false;

  const dragVisualPosition = isControlledTokenDragActive(observer)
    ? tokenVisualMovementPosition(observer)
    : null;
  const originPoint = centerForToken(observer, dragVisualPosition);
  if (!originPoint) return false;

  const sightSources = activeSightSourcesForObserver(observer);
  if (sightSources.length) {
    const activeSourceContainsTarget = sightSources.some((source) =>
      sourceVisuallyContainsAnyTargetPoint(observer, source, target, coreTargetPoints),
    );
    const sightBlockedSoundOpenWallIntersects =
      originPoint &&
      sceneHasPendingMovementSightBlockingSoundOpenWall() &&
      coreTargetPoints.some((targetPoint) =>
        lineIntersectsExplicitSightBlockingSoundOpenWall(originPoint, targetPoint),
      );
    if (
      activeSourceContainsTarget &&
      !sightBlockedSoundOpenWallIntersects &&
      !customSightWallBlocksSampledToken(originPoint, coreTargetPoints)
    ) {
      return true;
    }
    if (sightSources.some(sourceHasVisibilityPolygon)) return false;
    if (
      isControlledTokenDragActive(observer) &&
      !hasActivePendingMovementForObserver(tokenIdOf(observer)) &&
      !hasCoreOwnedPendingMovement(observer, target)
    ) {
      return false;
    }
    if (!sightSourceObserverHasActiveMovement(observer, target)) return false;
  }
  if (!pendingLightingAllowsVisualDetection(observer, target)) return false;

  return coreTargetPoints.some(
    (targetPoint) =>
      !lineOfSightBlockedByWall(originPoint, targetPoint, {
        originToken: observer,
        targetToken: target,
      }),
  );
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
    expiresAt: Date.now() + PENDING_MOVEMENT_CURRENT_SIGHT_LINE_GRACE_MS,
  });
  return true;
}

function pruneExpiredCurrentSightLineGraceContexts(now = Date.now()) {
  for (const [
    targetId,
    contextsByObserver,
  ] of pendingMovementCurrentSightLineGraceContexts.entries()) {
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

  for (const [
    targetId,
    contextsByObserver,
  ] of pendingMovementCurrentSightLineGraceContexts.entries()) {
    contextsByObserver.delete(observerId);
    if (!contextsByObserver.size) pendingMovementCurrentSightLineGraceContexts.delete(targetId);
  }
}

function getCurrentSightLineGraceContextForTarget(target) {
  if (shouldBypassAvsForGmVision()) return null;
  pruneExpiredCurrentSightLineGraceContexts();
  const targetId = tokenIdOf(target);
  if (!targetId || foundryHiddenRequiresVisionerRenderLock(target)) return null;
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
    if (
      !currentPendingMovementSightLineSeesTarget(observer, target) &&
      recentCompletedMovementFinalSightLineSeesTarget(observer, target) !== true
    ) {
      contextsByObserver.delete(observerId);
      continue;
    }
    return context;
  }

  if (!contextsByObserver.size) pendingMovementCurrentSightLineGraceContexts.delete(targetId);
  return null;
}

function currentSightLineGraceCanYieldToCore(observer, target, visibilityState) {
  if (shouldBypassAvsForGmVision()) return true;
  if (!RENDER_HIDDEN_FROM_OBSERVER_STATES.has(visibilityState)) return false;
  if (invisibleUndetectedRenderLockMustStayLocked(target, visibilityState)) return false;
  pruneExpiredCurrentSightLineGraceContexts();

  const observerId = tokenIdOf(observer);
  const targetId = tokenIdOf(target);
  if (!observerId || !targetId || foundryHiddenRequiresVisionerRenderLock(target)) return false;
  if (actorHasConditionSlug(actorOf(target), 'invisible')) return false;

  const contextsByObserver = pendingMovementCurrentSightLineGraceContexts.get(targetId);
  const context = contextsByObserver?.get(observerId);
  if (!context) return false;
  if (
    !currentPendingMovementSightLineSeesTarget(observer, target) &&
    recentCompletedMovementFinalSightLineSeesTarget(observer, target) !== true
  ) {
    contextsByObserver.delete(observerId);
    if (!contextsByObserver.size) pendingMovementCurrentSightLineGraceContexts.delete(targetId);
    return false;
  }

  return true;
}

function pendingMovementObserverCandidates() {
  const candidates = [];
  const add = (token) => {
    if (token) candidates.push(token);
  };

  if (hasActivePendingTokenMovement()) add(canvas?.tokens?._draggedToken);
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

function sceneHasPendingMovementSightBlockingSoundOpenWall() {
  return cachePendingMovementEvaluation('sceneSightBlockingSoundOpenWall', 'active', () =>
    (canvas?.walls?.placeables || []).some((wall) => {
      const doc = wall?.document ?? wall;
      return wallHasNormalSightBlockingSoundOpen(doc);
    }),
  );
}

function wallHasNormalSightBlockingSoundOpen(doc) {
  if (!doc) return false;
  const senseTypes = getWallSenseTypes();
  const normalSight = Number(senseTypes.NORMAL ?? 1);
  const openSound = Number(senseTypes.NONE ?? 0);
  return (
    Number(doc?.sight ?? normalSight) === normalSight &&
    Number(doc?.sound ?? openSound) === openSound
  );
}

function lineIntersectsWallDocument(originPoint, targetPoint, doc) {
  const c = doc?.c;
  if (!originPoint || !targetPoint || !Array.isArray(c) || c.length < 4) return false;
  const wallA = { x: c[0], y: c[1] };
  const wallB = { x: c[2], y: c[3] };
  const foundryIntersects = globalThis.foundry?.utils?.lineSegmentIntersects;
  if (typeof foundryIntersects === 'function') {
    return !!foundryIntersects(originPoint, targetPoint, wallA, wallB);
  }

  const orientation = (a, b, p) =>
    Math.sign((b.y - a.y) * (p.x - b.x) - (b.x - a.x) * (p.y - b.y));
  const onSegment = (a, b, p) =>
    p.x >= Math.min(a.x, b.x) &&
    p.x <= Math.max(a.x, b.x) &&
    p.y >= Math.min(a.y, b.y) &&
    p.y <= Math.max(a.y, b.y);
  const o1 = orientation(originPoint, targetPoint, wallA);
  const o2 = orientation(originPoint, targetPoint, wallB);
  const o3 = orientation(wallA, wallB, originPoint);
  const o4 = orientation(wallA, wallB, targetPoint);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(originPoint, targetPoint, wallA)) return true;
  if (o2 === 0 && onSegment(originPoint, targetPoint, wallB)) return true;
  if (o3 === 0 && onSegment(wallA, wallB, originPoint)) return true;
  if (o4 === 0 && onSegment(wallA, wallB, targetPoint)) return true;
  return false;
}

function lineIntersectsExplicitSightBlockingSoundOpenWall(originPoint, targetPoint) {
  return (canvas?.walls?.placeables || []).some((wall) => {
    const doc = wall?.document ?? wall;
    if (!wallHasNormalSightBlockingSoundOpen(doc)) return false;
    return lineIntersectsWallDocument(originPoint, targetPoint, doc);
  });
}

function lineIntersectsExplicitSoundBlockingWall(originPoint, targetPoint) {
  return (canvas?.walls?.placeables || []).some((wall) => {
    const doc = wall?.document ?? wall;
    if (Number(doc?.sound ?? 0) <= 0) return false;
    return lineIntersectsWallDocument(originPoint, targetPoint, doc);
  });
}

function hiddenSoundwaveShouldSurviveSightBlockedSoundOpen(observer, target, predictedFinalState) {
  const finalState = predictedFinalState ?? getPredictedFinalVisibilityState(observer, target);
  const activePendingPair =
    hasActivePendingMovementForObserver(tokenIdOf(observer)) ||
    hasPendingMovementEntryForPair(observer, target);
  if (activePendingPair && ['undetected', 'unnoticed'].includes(finalState)) return false;

  const context = getPendingMovementBlockContext(observer, target);
  if (
    ['observed', 'hidden'].includes(context?.visibilityState) &&
    context.wallBlocked === true &&
    context.soundBlocked === false &&
    (!activePendingPair || !['undetected', 'unnoticed'].includes(finalState))
  ) {
    return true;
  }

  const dragVisualPosition = isControlledTokenDragActive(observer)
    ? tokenVisualMovementPosition(observer)
    : null;
  const originPoint = centerForToken(observer, dragVisualPosition);
  const targetPoint = centerForToken(target);
  if (!originPoint || !targetPoint) return false;
  if (
    getStoredVisibilityState(observer, target) === 'hidden' &&
    !activePendingPair &&
    !lineIntersectsExplicitSoundBlockingWall(originPoint, targetPoint)
  ) {
    if (!currentPendingMovementSightLineSeesTarget(observer, target)) return true;
    return (
      sceneHasPendingMovementSightBlockingSoundOpenWall() &&
      lineIntersectsExplicitSightBlockingSoundOpenWall(originPoint, targetPoint)
    );
  }

  if (!sceneHasPendingMovementSightBlockingSoundOpenWall()) return false;
  if (lineIntersectsExplicitSoundBlockingWall(originPoint, targetPoint)) return false;
  if (lineIntersectsExplicitSightBlockingSoundOpenWall(originPoint, targetPoint)) return true;
  return !currentPendingMovementSightLineSeesTarget(observer, target);
}

function hiddenSoundwaveShouldPrimeSightBlockedSoundOpen(observer, target, predictedFinalState) {
  const observerId = tokenIdOf(observer);
  const finalState = predictedFinalState ?? getPredictedFinalVisibilityState(observer, target);
  const observerEntry = getPendingTokenMovementEntry(observerId);
  const activePendingPair =
    hasActivePendingMovementForObserver(observerId) ||
    hasPendingMovementEntryForPair(observer, target);
  if (!activePendingPair && !isControlledTokenDragActive(observer)) return false;
  if (
    activePendingPair &&
    observerEntry &&
    pendingMovementEntryVisualReachedDestination(observer, observerEntry) &&
    !DETECTION_BLOCKING_VISIBILITY_STATES.has(finalState)
  ) {
    return false;
  }
  if (activePendingPair && ['observed', 'concealed'].includes(finalState)) return false;
  return hiddenSoundwaveShouldSurviveSightBlockedSoundOpen(observer, target, finalState);
}

function currentSightBlockedSoundOpenWall(observer, target) {
  const dragVisualPosition = isControlledTokenDragActive(observer)
    ? tokenVisualMovementPosition(observer)
    : null;
  const originPoint = centerForToken(observer, dragVisualPosition);
  const targetPoint = centerForToken(target);
  if (!originPoint || !targetPoint) return false;
  if (!sceneHasPendingMovementSightBlockingSoundOpenWall()) return false;
  if (lineIntersectsExplicitSoundBlockingWall(originPoint, targetPoint)) return false;
  if (lineIntersectsExplicitSightBlockingSoundOpenWall(originPoint, targetPoint)) return true;
  return !currentPendingMovementSightLineSeesTarget(observer, target);
}

function currentSightLineSeesHiddenTargetDuringPendingMovement(
  target,
  { hasDetectionWork = null } = {},
) {
  if (!target?.document?.id) return false;
  if (target.controlled) return false;
  if (!isTokenLikeTarget(target)) return false;
  if (foundryHiddenRequiresVisionerRenderLock(target)) return false;
  if (actorHasConditionSlug(actorOf(target), 'invisible')) return false;
  if (hasDetectionWork === false) return false;

  const targetPoints = coreVisibilityTestPointsForPendingTarget(target);
  if (!targetPoints.length) return false;

  for (const source of [
    ...sourceList(canvas?.effects?.visionSources),
    ...sourceList(canvas?.effects?.lightSources),
  ]) {
    if (!source?.active || !source.object) continue;
    const observer = source.object;
    if (!observerHasUsableSight(observer)) continue;
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
    if (hasActiveAvsOverride(stateObserver, target)) continue;
    const predictedFinalState = getPredictedFinalVisibilityState(stateObserver, target);
    if (predictedFinalState === 'hidden') continue;
    if (!predictedFinalState && !observerHasPendingRevealMovement(stateObserver, target)) {
      continue;
    }
    if (
      hiddenSoundwaveShouldSurviveSightBlockedSoundOpen(
        stateObserver,
        target,
        predictedFinalState,
      )
    ) {
      continue;
    }
    if (sourceVisuallyContainsAnyTargetPoint(stateObserver, source, target, targetPoints)) {
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
    if (hasActiveAvsOverride(stateObserver, target)) continue;
    const predictedFinalState = getPredictedFinalVisibilityState(stateObserver, target);
    if (predictedFinalState === 'hidden') continue;
    if (!predictedFinalState && !observerHasPendingRevealMovement(stateObserver, target)) {
      continue;
    }
    if (
      hiddenSoundwaveShouldSurviveSightBlockedSoundOpen(
        stateObserver,
        target,
        predictedFinalState,
      )
    ) {
      continue;
    }
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

function activePreviewCanRevealStoredUndetectedTarget(observer, target, storedVisibilityState) {
  if (storedVisibilityState !== 'undetected') return false;
  if (!hasPendingMovementEntryForPair(observer, target)) return false;
  if (invisibleUndetectedRenderLockMustStayLocked(target, storedVisibilityState)) return false;
  const observerHasDragPreviewOrIntent =
    isControlledTokenDragActive(observer) || hasPendingControlledTokenDragIntent(observer);
  const targetHasDragPreviewOrIntent =
    isControlledTokenDragActive(target) || hasPendingControlledTokenDragIntent(target);
  if (
    !hasActiveControlledMovementPreview(observer, target) &&
    !observerHasDragPreviewOrIntent &&
    !targetHasDragPreviewOrIntent
  ) {
    return false;
  }
  if (
    hasPendingMovementEntryForPair(observer, target) &&
    !observerHasDragPreviewOrIntent &&
    !targetHasDragPreviewOrIntent
  ) {
    return false;
  }
  return currentPendingMovementSightLineSeesTarget(observer, target);
}

function getPendingMovementVisibilityState(observer, target) {
  const predictedFinalState = getPredictedFinalVisibilityState(observer, target);
  const coreOwnedMovement = hasCoreOwnedPendingMovement(observer, target);
  if (coreOwnedMovement) {
    const storedVisibilityState = getStoredVisibilityState(observer, target);
    if (
      hasActiveAvsOverride(observer, target) &&
      DETECTION_BLOCKING_VISIBILITY_STATES.has(storedVisibilityState)
    ) {
      return storedVisibilityState;
    }
    if (activePreviewCanRevealStoredUndetectedTarget(observer, target, storedVisibilityState)) {
      rememberCurrentSightLineGraceContext(observer, target);
      return 'observed';
    }
    if (predictedFinalState) {
      const startingVisibilityState =
        getInitialPendingMovementVisibilityState(observer, target) || storedVisibilityState;
      const storedRenderHidden = visionerStateHidesTargetRendering(storedVisibilityState, target);
      const finalRenderHidden = visionerStateHidesTargetRendering(predictedFinalState, target);
      if (
        startingVisibilityState &&
        !invisibleUndetectedRenderLockMustStayLocked(target, startingVisibilityState) &&
        visionerStateHidesTargetRendering(startingVisibilityState, target) !==
        finalRenderHidden
      ) {
        return renderVisibilityStateForCurrentPolygonTransition(
          observer,
          target,
          startingVisibilityState,
          predictedFinalState,
        );
      }
      if (
        storedRenderHidden &&
        finalRenderHidden &&
        currentSightLineGraceCanYieldToCore(observer, target, storedVisibilityState)
      ) {
        return 'observed';
      }
      if (
        visibleDetectionStateShouldWaitForCurrentPolygon(
          observer,
          target,
          storedVisibilityState,
          predictedFinalState,
        )
      ) {
        return storedVisibilityState;
      }
      return predictedFinalState;
    }
    if (visionerStateHidesTargetRendering(storedVisibilityState, target)) {
      return storedVisibilityState;
    }
    if (
      hasActiveControlledMovementPreview(observer, target) &&
      !hasPendingMovementEntryForPair(observer, target)
    ) {
      return 'observed';
    }
  }

  return getStoredVisibilityState(observer, target);
}

function hiddenStateShouldRenderHideTarget(target) {
  if (!target) return false;
  const actorType = String(actorOf(target)?.type ?? '').toLowerCase();
  return HIDDEN_STATE_RENDER_HIDDEN_ACTOR_TYPES.has(actorType);
}

function visionerStateHidesTargetRendering(visibilityState, target = null) {
  if (RENDER_HIDDEN_FROM_OBSERVER_STATES.has(visibilityState)) return true;
  return visibilityState === 'hidden' && hiddenStateShouldRenderHideTarget(target);
}

function invisibleUndetectedRenderLockMustStayLocked(target, visibilityState) {
  return visibilityState === 'undetected' && actorHasConditionSlug(actorOf(target), 'invisible');
}

function tokenPrimaryRenderIsVisible(target) {
  if (!target) return false;
  if (target.visible === false || target.renderable === false) return false;
  const mesh = target.mesh;
  if (!mesh) return true;
  if (mesh.visible === false || mesh.renderable === false) return false;
  return !(typeof mesh.alpha === 'number' && mesh.alpha <= 0.01);
}

function captureInitialVisibilityStatesByTargetId(observer, movingTokenId) {
  const map = new Map();
  if (!observer) return map;
  for (const target of canvas?.tokens?.placeables || []) {
    const targetId = tokenIdOf(target);
    if (!targetId || targetId === movingTokenId) continue;
    const visibilityState = getCurrentViewRenderHiddenVisibilityState(observer, target);
    if (visibilityState) map.set(targetId, visibilityState);
  }
  return map;
}

function captureInitialVisibilityStatesByObserverId(target, movingTokenId) {
  const map = new Map();
  if (!target) return map;
  for (const observer of canvas?.tokens?.placeables || []) {
    const observerId = tokenIdOf(observer);
    if (!observerId || observerId === movingTokenId) continue;
    const visibilityState = getCurrentViewRenderHiddenVisibilityState(observer, target);
    if (visibilityState) map.set(observerId, visibilityState);
  }
  return map;
}

function getInitialPendingMovementVisibilityState(observer, target) {
  const observerId = tokenIdOf(observer);
  const targetId = tokenIdOf(target);
  if (!observerId || !targetId) return null;

  const observerEntry = pendingTokenMovementPositions.get(observerId);
  const observerInitialState = observerEntry?.initialVisibilityStatesByTargetId?.get(targetId);
  if (observerInitialState) return observerInitialState;

  const targetEntry = pendingTokenMovementPositions.get(targetId);
  const targetInitialState = targetEntry?.initialVisibilityStatesByObserverId?.get(observerId);
  return targetInitialState || null;
}

function currentCoreDetectionPolygonSeesTarget(observer, target, { requirePolygon = false } = {}) {
  const targetPoints = coreVisibilityTestPointsForPendingTarget(target);
  if (!targetPoints.length) return false;

  const sightSources = activeSightSourcesForObserver(observer);
  if (!sightSources.length || !sightSources.some(sourceHasVisibilityPolygon)) {
    if (requirePolygon) return null;
    return currentPendingMovementSightLineSeesTarget(observer, target);
  }

  return sightSources.some((source) =>
    sourceVisuallyContainsAnyTargetPoint(observer, source, target, targetPoints),
  );
}

function renderVisibilityStateForCurrentPolygonTransition(observer, target, fromState, toState) {
  const fromRenderHidden = visionerStateHidesTargetRendering(fromState, target);
  const toRenderHidden = visionerStateHidesTargetRendering(toState, target);
  if (fromRenderHidden === toRenderHidden) return toState;

  const currentPolygonSeesTarget = currentCoreDetectionPolygonSeesTarget(observer, target, {
    requirePolygon: true,
  });
  if (currentPolygonSeesTarget === null) return fromState;
  if (fromRenderHidden && !toRenderHidden) {
    if (currentPolygonSeesTarget) {
      rememberCurrentSightLineGraceContext(observer, target);
      return toState;
    }
    return fromState;
  }
  if (!fromRenderHidden && toRenderHidden) {
    if (currentPolygonSeesTarget) {
      rememberCurrentSightLineGraceContext(observer, target);
      return fromState;
    }
    return toState;
  }

  return toState;
}

function visibleDetectionStateShouldWaitForCurrentPolygon(observer, target, fromState, toState) {
  if (!CORE_LOS_TRANSITION_REFRESH_STATES.has(fromState)) return false;
  if (toState !== 'hidden') return false;
  if (!shouldUseCoreDetectionDuringPendingMovement(observer, target)) return false;
  if (!currentPendingMovementSightLineSeesTarget(observer, target)) return false;

  rememberCurrentSightLineGraceContext(observer, target);
  return true;
}

function getCurrentViewRenderHiddenVisibilityState(observer, target) {
  const storedVisibilityState =
    getInitialPendingMovementVisibilityState(observer, target) ||
    getStoredVisibilityState(observer, target);
  const recentCompletedVisibilityState = getRecentCompletedMovementVisibilityStateForObserver(
    observer,
    target,
  );
  const hasCoreOwnedMovement = hasCoreOwnedPendingMovement(observer, target);

  if (
    hasActiveAvsOverride(observer, target) &&
    DETECTION_BLOCKING_VISIBILITY_STATES.has(storedVisibilityState)
  ) {
    return storedVisibilityState;
  }

  if (!hasCoreOwnedMovement) {
    if (recentCompletedVisibilityState) {
      return renderVisibilityStateForCurrentPolygonTransition(
        observer,
        target,
        storedVisibilityState,
        recentCompletedVisibilityState,
      );
    }
    return storedVisibilityState;
  }

  if (invisibleUndetectedRenderLockMustStayLocked(target, storedVisibilityState)) {
    return storedVisibilityState;
  }
  if (currentSightLineGraceCanYieldToCore(observer, target, storedVisibilityState)) {
    return 'observed';
  }

  const predictedFinalState = getPredictedFinalVisibilityState(observer, target);
  if (!predictedFinalState) {
    if (
      visionerStateHidesTargetRendering(storedVisibilityState, target) &&
      hasActiveControlledMovementPreview(observer, target) &&
      !hasPendingMovementEntryForPair(observer, target)
    ) {
      const currentPolygonSeesTarget = currentCoreDetectionPolygonSeesTarget(observer, target, {
        requirePolygon: true,
      });
      if (currentPolygonSeesTarget === true) {
        rememberCurrentSightLineGraceContext(observer, target);
        return 'observed';
      }
      return storedVisibilityState;
    }
    if (recentCompletedVisibilityState) {
      return renderVisibilityStateForCurrentPolygonTransition(
        observer,
        target,
        storedVisibilityState,
        recentCompletedVisibilityState,
      );
    }
    return storedVisibilityState;
  }

  const storedRenderHidden = visionerStateHidesTargetRendering(storedVisibilityState, target);
  const finalRenderHidden = visionerStateHidesTargetRendering(predictedFinalState, target);
  if (storedRenderHidden === finalRenderHidden) return predictedFinalState;

  return renderVisibilityStateForCurrentPolygonTransition(
    observer,
    target,
    storedVisibilityState,
    predictedFinalState,
  );
}

function shouldKeepVisionerRenderLockDuringPendingMovement(observer, target) {
  return visionerStateHidesTargetRendering(getPendingMovementVisibilityState(observer, target), target);
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

    const finalVisibilityState = entry?.finalVisibilityStatesByTargetId?.get(targetId) ?? null;
    if (
      CORE_LOS_TRANSITION_REFRESH_STATES.has(visibilityState) &&
      DETECTION_BLOCKING_VISIBILITY_STATES.has(finalVisibilityState)
    ) {
      targetIds.add(targetId);
      continue;
    }

    if (shouldRefreshCoreLosTransitionTarget(observer, token, visibilityState)) {
      targetIds.add(targetId);
    }
  }

  return [...targetIds];
}

function getCoreAnimationRefreshTargetIdsForMovement(tokenId) {
  const entry = pendingTokenMovementPositions.get(tokenId);
  const observer = tokenObjectForId(tokenId) || entry?.tokenDoc || null;
  if (!observer) return [];

  const targetIds = new Set();
  for (const token of canvas?.tokens?.placeables || []) {
    const targetId = tokenIdOf(token);
    if (!targetId || targetId === tokenId) continue;

    const visibilityState = getStoredVisibilityState(observer, token);
    const finalVisibilityState = entry?.finalVisibilityStatesByTargetId?.get(targetId) ?? null;
    const observedToHidden =
      CORE_LOS_TRANSITION_REFRESH_STATES.has(visibilityState) &&
      (DETECTION_BLOCKING_VISIBILITY_STATES.has(finalVisibilityState) ||
        shouldRefreshCoreLosTransitionTarget(observer, token, visibilityState));
    if (!observedToHidden) continue;
    if (currentPendingMovementSightLineSeesTarget(observer, token)) continue;
    targetIds.add(targetId);
  }

  return [...targetIds];
}

export function shouldUseFullAnimationRefreshCadence(tokenId) {
  const entry = pendingTokenMovementPositions.get(tokenId);
  const observer = tokenObjectForId(tokenId) || entry?.tokenDoc || null;
  for (const targetId of getAnimationRefreshTargetIdsForMovement(tokenId)) {
    const target = tokenObjectForId(targetId);
    if (!target) continue;
    if (observer) {
      const storedState = getStoredVisibilityState(observer, target);
      if (storedState === 'hidden') return true;
    }
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

function pruneRecentCompletedMovementRefreshTargets(now = Date.now()) {
  for (const [targetId, context] of recentCompletedMovementRefreshTargetIds.entries()) {
    if (!context?.expiresAt || context.expiresAt <= now) {
      recentCompletedMovementRefreshTargetIds.delete(targetId);
    }
  }
}

export function hasRecentCompletedMovementRefreshTargetForObserver(observer, target) {
  pruneRecentCompletedMovementRefreshTargets();
  const observerId = tokenIdOf(observer);
  const targetId = tokenIdOf(target);
  if (!observerId || !targetId) return false;

  const context = recentCompletedMovementRefreshTargetIds.get(targetId);
  return !!context && context.observerId === observerId;
}

export function getRecentCompletedMovementVisibilityStateForObserver(observer, target) {
  pruneRecentCompletedMovementRefreshTargets();
  const observerId = tokenIdOf(observer);
  const targetId = tokenIdOf(target);
  if (!observerId || !targetId) return null;

  const context = recentCompletedMovementRefreshTargetIds.get(targetId);
  if (!context || context.observerId !== observerId) return null;
  return context.finalVisibilityState ?? null;
}

function sightLineFromObserverPositionSeesTarget(observer, target, observerPosition) {
  if (!observer || !target?.document?.id || !observerPosition) return false;
  if (!observerHasUsableSight(observer)) return false;

  const targetPoints = coreVisibilityTestPointsForPendingTarget(target);
  if (!targetPoints.length) return false;

  const originPoint = centerForToken(observer, observerPosition);
  if (!originPoint) return false;

  return targetPoints.some(
    (targetPoint) =>
      !lineOfSightBlockedByWall(originPoint, targetPoint, {
        originToken: observer,
        targetToken: target,
      }),
  );
}

export function recentCompletedMovementFinalSightLineSeesTarget(observer, target) {
  pruneRecentCompletedMovementRefreshTargets();
  const observerId = tokenIdOf(observer);
  const targetId = tokenIdOf(target);
  if (!observerId || !targetId) return null;

  const context = recentCompletedMovementRefreshTargetIds.get(targetId);
  if (!context || context.observerId !== observerId) return null;
  if (!pendingLightingAllowsVisualDetection(observer, target)) return false;
  return sightLineFromObserverPositionSeesTarget(observer, target, context.position);
}

function rememberCurrentSightLineGraceForCompletedMovement(observer, target, finalVisibilityState) {
  if (!observer || !target?.document?.id) return false;
  if (getStoredVisibilityState(observer, target) !== 'hidden') return false;
  if (hasActiveAvsOverride(observer, target)) return false;
  if (DETECTION_BLOCKING_VISIBILITY_STATES.has(finalVisibilityState)) return false;
  if (recentCompletedMovementFinalSightLineSeesTarget(observer, target) !== true) return false;
  return rememberCurrentSightLineGraceContext(observer, target);
}

function pendingMovementTargetSetSignature() {
  return [
    pendingMovementEntriesSignature(),
    [...recentCompletedMovementRefreshTargetIds.keys()].sort().join(','),
  ].join('||');
}

function tokenPositionSignature(tokenOrDoc) {
  const token = tokenOrDoc?.document ? tokenOrDoc : tokenOrDoc?.object || null;
  const doc = tokenOrDoc?.document || tokenOrDoc;
  const x = Number(token?.x ?? doc?.x ?? doc?._source?.x ?? 0);
  const y = Number(token?.y ?? doc?.y ?? doc?._source?.y ?? 0);
  const elevation = Number(doc?.elevation ?? doc?._source?.elevation ?? 0);
  return `${Number.isFinite(x) ? x : 0},${Number.isFinite(y) ? y : 0},${Number.isFinite(elevation) ? elevation : 0}`;
}

function detectionSourceSignature(sources) {
  return sourceList(sources)
    .map((source) => {
      const object = source?.object;
      return [
        source?.active ? 1 : 0,
        tokenIdOf(object) || 'no-object',
        tokenPositionSignature(object),
        object?._animation?.state || '',
      ].join(':');
    })
    .join('|');
}

function cachedMapForPendingMovementSignature(cache, signature) {
  if (cache?.signature === signature) return cache.map;
  return new Map();
}

function rememberPendingMovementCache(map, signature) {
  return { signature, map };
}

function clearPendingMovementVisibilityDecisionCaches() {
  pendingMovementRefreshTargetIdSetCache = null;
  pendingMovementVisibilityOwnershipTokenIdSetCache = null;
  pendingMovementCanvasVisibilityHandleCache = null;
  pendingMovementBlockedDetectionEntriesCache = null;
  pendingMovementHiddenStateContextCache = null;
}

function getPendingMovementRefreshTargetIdSet() {
  const signature = pendingMovementTargetSetSignature();
  if (pendingMovementRefreshTargetIdSetCache?.signature === signature) {
    return pendingMovementRefreshTargetIdSetCache.ids;
  }

  const ids = new Set(getPendingMovementRefreshTargetIds());
  pendingMovementRefreshTargetIdSetCache = { signature, ids };
  return ids;
}

function getActivePendingMovementVisibilityOwnershipTokenIds() {
  pruneRecentCompletedMovementRefreshTargets();
  const signature = pendingMovementTargetSetSignature();
  if (pendingMovementVisibilityOwnershipTokenIdSetCache?.signature === signature) {
    return pendingMovementVisibilityOwnershipTokenIdSetCache.ids;
  }

  const ids = new Set();
  for (const targetId of recentCompletedMovementRefreshTargetIds.keys()) {
    ids.add(targetId);
  }
  for (const [tokenId, entry] of pendingTokenMovementPositions.entries()) {
    ids.add(tokenId);
    for (const targetId of entry?.finalVisibilityStatesByTargetId?.keys?.() || []) {
      ids.add(targetId);
    }
    for (const observerId of entry?.finalVisibilityStatesByObserverId?.keys?.() || []) {
      ids.add(observerId);
    }
  }
  if (pendingTokenMovementPositions.size) {
    for (const targetId of getPendingMovementRefreshTargetIdSet()) {
      ids.add(targetId);
    }
  }

  pendingMovementVisibilityOwnershipTokenIdSetCache = { signature, ids };
  return ids;
}

function pendingMovementCanvasVisibilityHandleSignature() {
  return pendingMovementTargetSetSignature();
}

function hasPendingFinalVisibilityStateForToken(token) {
  const tokenId = tokenIdOf(token);
  if (!tokenId) return false;

  for (const entry of pendingTokenMovementPositions.values()) {
    if (entry?.finalVisibilityStatesByTargetId?.has(tokenId)) return true;
    if (entry?.finalVisibilityStatesByObserverId?.has(tokenId)) return true;
  }

  return false;
}

export function hasActivePendingMovementVisibilityOwnershipForToken(token) {
  const tokenId = tokenIdOf(token);
  if (!tokenId) return false;
  return getActivePendingMovementVisibilityOwnershipTokenIds().has(tokenId);
}

function hasDetectionBlockingPendingVisibilityStateForToken(token) {
  if (!token?.document?.id) return false;
  if (shouldBypassAvsForGmVision()) return false;
  if (foundryHiddenRequiresVisionerRenderLock(token)) return true;

  for (const [observerId, entry] of pendingTokenMovementPositions.entries()) {
    const observer = tokenObjectForId(observerId) || entry?.tokenDoc || { id: observerId };
    if (shouldUseCoreDetectionDuringPendingMovement(observer, token)) continue;
    if (DETECTION_BLOCKING_VISIBILITY_STATES.has(getPendingMovementVisibilityState(observer, token))) {
      return true;
    }
  }

  return false;
}

function hasDetectionBlockingStoredVisibilityStateForToken(token) {
  if (!token?.document?.id) return false;
  for (const observer of pendingMovementObserverCandidates()) {
    if (tokenIdOf(observer) === token.document.id) continue;
    if (DETECTION_BLOCKING_VISIBILITY_STATES.has(getStoredVisibilityState(observer, token))) {
      return true;
    }
  }
  return false;
}

export function targetHasDetectionBlockingStoredVisibilityState(target) {
  return hasDetectionBlockingStoredVisibilityStateForToken(target);
}

function hasHiddenStoredVisibilityStateForToken(token) {
  if (!token?.document?.id) return false;
  for (const observer of pendingMovementObserverCandidates()) {
    if (tokenIdOf(observer) === token.document.id) continue;
    if (getStoredVisibilityState(observer, token) === 'hidden') return true;
  }
  return false;
}

function forceDetectionFilterMeshVisible(token) {
  const detectionFilterMesh = token?.detectionFilterMesh;
  if (!detectionFilterMesh) return false;
  try {
    if ('visible' in detectionFilterMesh) detectionFilterMesh.visible = true;
    if ('renderable' in detectionFilterMesh) detectionFilterMesh.renderable = true;
    if ('alpha' in detectionFilterMesh) detectionFilterMesh.alpha = 1;
    return true;
  } catch {
    return false;
  }
}

function createPendingMovementHearingDetectionFilter() {
  const FilterClass = foundry?.canvas?.rendering?.filters?.OutlineOverlayFilter;
  const filter = FilterClass?.create?.({ wave: true });
  if (!filter) return null;
  try {
    filter.thickness = 1;
  } catch {
    /* best effort */
  }
  return filter;
}

function ensurePendingMovementHearingDetectionVisual(token, { lightweight = false } = {}) {
  if (!token) return false;
  if (!token.detectionFilter) {
    const filter = createPendingMovementHearingDetectionFilter();
    if (filter) {
      try {
        token.detectionFilter = filter;
        sanitizeDetectionFilterList(token);
        if (!lightweight) {
          sanitizeCanvasDetectionFilterLists();
          removeHiddenTokenEcho(token);
        }
        if (!lightweight && !hasPendingMovementDetectionWork()) {
          try {
            (token.renderDetectionFilter || token._renderDetectionFilter)?.call(token);
            sanitizeDetectionFilterList(token);
            sanitizeCanvasDetectionFilterLists();
          } catch {
            /* best effort */
          }
        }
        if (lightweight) forceDetectionFilterMeshVisible(token);
        return true;
      } catch {
        /* fall back to echo */
      }
    }
  }
  if (token.detectionFilter) return true;
  if (token._pvHiddenEcho) return true;
  try {
    drawHiddenTokenEcho(token);
    return !!token._pvHiddenEcho;
  } catch {
    return false;
  }
}

function computeShouldHandlePendingMovementCanvasVisibilityForToken(token) {
  const tokenId = tokenIdOf(token);
  if (!tokenId) return false;

  if (isPendingMovementRenderLocked(token)) return true;
  if (hasPendingRenderState(token)) return true;
  if (hasPendingFinalVisibilityStateForToken(token)) return true;
  if (!getPendingMovementRefreshTargetIdSet().has(tokenId)) return false;
  return (
    hasDetectionBlockingPendingVisibilityStateForToken(token) ||
    hasDetectionBlockingStoredVisibilityStateForToken(token)
  );
}

export function shouldHandlePendingMovementCanvasVisibilityForToken(token) {
  const tokenId = tokenIdOf(token);
  if (!tokenId) return false;
  if (shouldBypassAvsForGmVision()) return false;
  cleanupExpiredPendingMovements();
  if (!hasPendingMovementRenderWork()) return false;

  const signature = pendingMovementCanvasVisibilityHandleSignature();
  const cache = cachedMapForPendingMovementSignature(
    pendingMovementCanvasVisibilityHandleCache,
    signature,
  );
  pendingMovementCanvasVisibilityHandleCache = rememberPendingMovementCache(cache, signature);
  const key = `${tokenId}:${tokenPositionSignature(token)}`;
  if (cache.has(key)) return cache.get(key);

  const shouldHandle = computeShouldHandlePendingMovementCanvasVisibilityForToken(token);
  cache.set(key, shouldHandle);
  return shouldHandle;
}

export function getPendingMovementBlockContext(observer, target) {
  if (shouldBypassAvsForGmVision()) {
    return gmVisionBypassPendingMovementBlockContext(observer, target);
  }
  return pendingDecisionContextController.getPendingMovementBlockContext(observer, target);
}

function contextSuppressesPendingDetectionSource(context) {
  if (!context?.active) return false;
  if (context.foundryHidden || context.renderHiddenByVisioner) return true;
  if (context.visibilityState === 'hidden') return false;

  return !!context.wallBlocked;
}

function getPendingMovementHiddenStateContextUncached(target) {
  if (!target?.document?.id) return null;
  if (shouldBypassAvsForGmVision()) return null;
  cleanupExpiredPendingMovements();

  for (const [observerId, entry] of pendingTokenMovementPositions.entries()) {
    const observer = tokenObjectForId(observerId) || entry?.tokenDoc || { id: observerId };
    if (shouldUseCoreDetectionDuringPendingMovement(observer, target)) continue;

    const visibilityState = getPendingMovementVisibilityState(observer, target);
    const hiddenByVisioner = visionerStateHidesTargetRendering(visibilityState, target);
    const foundryHidden = foundryHiddenRequiresVisionerRenderLock(target);
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

export function targetIsRenderHiddenForCurrentViewObserver(target) {
  if (!target?.document?.id) return false;
  if (shouldBypassAvsForGmVision()) return false;
  if (isSelectAllTokenVisibilityBypassActive()) return false;
  if (target.controlled) return false;
  if (foundryHiddenRequiresVisionerRenderLock(target)) return true;

  const candidates = [];
  const add = (token) => {
    if (token) candidates.push(token);
  };

  add(canvas?.tokens?._draggedToken);
  for (const token of canvas?.tokens?.controlled || []) add(token);
  for (const [observerId, entry] of pendingTokenMovementPositions.entries()) {
    add(tokenObjectForId(observerId) || entry?.tokenDoc);
  }

  const seen = new Set();
  for (const observer of candidates) {
    const observerId = tokenIdOf(observer);
    if (!observerId || seen.has(observerId)) continue;
    seen.add(observerId);
    if (tokenIdOf(observer) === tokenIdOf(target)) continue;
    const state = getCurrentViewRenderHiddenVisibilityState(observer, target);
    const storedVisibilityState = getStoredVisibilityState(observer, target);
    const coreOwnedPendingMovement = hasCoreOwnedPendingMovement(observer, target);
    if (
      !visionerStateHidesTargetRendering(state, target) &&
      RENDER_HIDDEN_FROM_OBSERVER_STATES.has(storedVisibilityState) &&
      !invisibleUndetectedRenderLockMustStayLocked(target, storedVisibilityState) &&
      coreOwnedPendingMovement &&
      currentPendingMovementSightLineSeesTarget(observer, target)
    ) {
      rememberCurrentSightLineGraceContext(observer, target);
    }
    if (visionerStateHidesTargetRendering(state, target)) {
      if (hasActiveAvsOverride(observer, target)) {
        return true;
      }
      if (
        RENDER_HIDDEN_FROM_OBSERVER_STATES.has(state) &&
        !invisibleUndetectedRenderLockMustStayLocked(target, state) &&
        coreOwnedPendingMovement &&
        tokenPrimaryRenderIsVisible(target) &&
        currentPendingMovementSightLineSeesTarget(observer, target)
      ) {
        rememberCurrentSightLineGraceContext(observer, target);
        continue;
      }
      return true;
    }
  }
  return false;
}

export function targetMustStayHiddenDuringPendingMovement(target) {
  if (!target?.document?.id) return false;
  if (shouldBypassAvsForGmVision()) return false;
  if (target.controlled) return false;
  if (foundryHiddenRequiresVisionerRenderLock(target)) return true;
  return false;
}

export function getPendingMovementHiddenStateContext(target) {
  const targetId = tokenIdOf(target);
  if (!targetId) return null;

  const signature = [
    pendingMovementEntriesSignature(),
    storedVisibilitySignatureForToken(target),
    currentSightLineSignatureForToken(target),
  ].join('||');
  const cache = cachedMapForPendingMovementSignature(
    pendingMovementHiddenStateContextCache,
    signature,
  );
  pendingMovementHiddenStateContextCache = rememberPendingMovementCache(cache, signature);
  const key = `${targetId}:${tokenPositionSignature(target)}`;
  if (cache.has(key)) return cache.get(key);

  const context = getPendingMovementHiddenStateContextUncached(target);
  cache.set(key, context);
  return context;
}

export function isPendingMovementHiddenStateVisibilityProbe() {
  return pendingMovementHiddenStateVisibilityProbeDepth > 0;
}

export function shouldBypassPendingMovementVisionerRenderState(observer, target, visibilityState) {
  if (shouldProbeCoreVisibilityForRenderHiddenPendingState(observer, target, visibilityState)) {
    return true;
  }
  if (visibilityState !== 'hidden') return false;
  if (hasActiveAvsOverride(observer, target)) return false;

  const context = getPendingMovementBlockContext(observer, target);
  return context.active && !context.wallBlocked && !context.foundryHidden;
}

function shouldProbeCoreVisibilityForRenderHiddenPendingState(observer, target, visibilityState) {
  if (!RENDER_HIDDEN_FROM_OBSERVER_STATES.has(visibilityState)) return false;
  if (hasActiveAvsOverride(observer, target)) return false;
  if (invisibleUndetectedRenderLockMustStayLocked(target, visibilityState)) return false;
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
    const overrideHiddenActive =
      storedVisibilityState === 'hidden' && hasActiveAvsOverride(source.object, target);
    const preserveWallBlockedHiddenSoundwave =
      storedVisibilityState === 'hidden' && context.wallBlocked;
    if (
      shouldUseCoreDetectionDuringPendingMovement(source.object, target) &&
      context.visibilityState !== 'hidden' &&
      !preserveWallBlockedHiddenSoundwave &&
      !overrideHiddenActive
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
    if (overrideHiddenActive) {
      return {
        ...context,
        visibilityState: 'hidden',
        hiddenByVisioner: true,
        renderHiddenByVisioner: false,
        avsOverrideHidden: true,
      };
    }
    if (
      context.visibilityState === 'hidden' &&
      currentPendingMovementSightLineSeesTarget(source.object, target) &&
      !hiddenSoundwaveShouldSurviveLimitedWall(source.object, target) &&
      !hiddenSoundwaveShouldSurviveSightBlockedSoundOpen(source.object, target)
    ) {
      continue;
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
    canvas?.tokens?._draggedToken,
  ];

  const seenObserverIds = new Set();
  for (const observer of observers) {
    const observerId = tokenIdOf(observer);
    if (!observerId || seenObserverIds.has(observerId)) continue;
    seenObserverIds.add(observerId);
    if (!observer?.controlled && tokenIdOf(observer) !== tokenIdOf(canvas?.tokens?._draggedToken)) continue;

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
      foundryHidden: foundryHiddenRequiresVisionerRenderLock(target),
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
      foundryHidden: foundryHiddenRequiresVisionerRenderLock(target),
      storedObserverFallback: true,
    };
  }

  return null;
}

function getHiddenDetectionFilterPreservationContext(target, { hasDetectionWork = null } = {}) {
  if (!target?.document?.id) return null;
  if (target.controlled) return null;
  if (!isTokenLikeTarget(target)) return null;
  if (hasDetectionWork === false) return null;
  if (getCurrentSightLineGraceContextForTarget(target)) return null;
  if (currentSightLineSeesHiddenTargetDuringPendingMovement(target, { hasDetectionWork })) {
    return null;
  }

  const pendingContext =
    (hasDetectionWork === null || hasDetectionWork === true) && hasPendingMovementDetectionWork()
      ? getPendingMovementDetectionFilterPreservationContext(target)
      : null;
  const shouldUseStoredContext = !pendingContext && !hasPendingMovementDetectionWork();
  const storedContext = shouldUseStoredContext
    ? getStoredHiddenDetectionFilterContext(target)
    : null;
  const context =
    pendingContext || getActiveControlledHiddenDetectionFilterContext(target) || storedContext;
  if (!context) return null;
  if (context.foundryHidden) return null;
  if (context.visibilityState !== 'hidden') return null;
  return context;
}

function getObservedDetectionFilterSuppressionContext(target, { hasDetectionWork = null } = {}) {
  if (!target?.document?.id) return null;
  if (target.controlled) return null;
  if (!isTokenLikeTarget(target)) return null;
  if (isActualControlledDragPreviewOnlyActive()) return null;

  const currentViewObservedContext =
    getCurrentViewObservedDetectionFilterSuppressionContext(target);
  if (currentViewObservedContext) return currentViewObservedContext;

  const hiddenContext = getHiddenDetectionFilterPreservationContext(target, { hasDetectionWork });
  let restrictedObservedObserverId = null;
  if (hiddenContext) {
    const hiddenObserver = tokenObjectForId(hiddenContext.observerId);
    if (getStoredVisibilityState(hiddenObserver, target) !== 'observed') return null;
    restrictedObservedObserverId = hiddenContext.observerId;
  }

  const currentViewObserverIds = new Set(
    getCurrentViewObservers().map((observer) => tokenIdOf(observer)),
  );
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
  if (shouldBypassAvsForGmVision()) return false;
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
  if (shouldBypassAvsForGmVision()) return null;
  if (isSelectAllTokenVisibilityBypassActive()) return null;

  const foundryHidden = foundryHiddenRequiresVisionerRenderLock(target);
  for (const observer of canvas?.tokens?.controlled || []) {
    const observerId = tokenIdOf(observer);
    if (!observerId || observerId === targetId) continue;
    if (shouldUseCoreDetectionDuringPendingMovement(observer, target)) continue;

    const visibilityState = getPendingMovementVisibilityState(observer, target);
    const hiddenByVisioner = visionerStateHidesTargetRendering(visibilityState, target);
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
  pendingMovementCoreVisibleGraceContexts
    .get(targetId)
    .set(normalizedContext.observerId, graceContext);
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
  if (foundryHiddenRequiresVisionerRenderLock(target)) return null;

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
  if (invisibleUndetectedRenderLockMustStayLocked(target, visibilityState)) return false;
  const context = getCoreVisibleGraceContext(observer, target, visibilityState);
  if (!context) return false;
  if (!pendingHiddenTargetIsVisibleFromCurrentSources(target, context)) return false;

  rememberCoreVisibleGraceContext(target, context);
  return true;
}

function rememberCoreVisibleGraceForCoreOwnedPendingObservers(target) {
  if (!target?.document?.id || foundryHiddenRequiresVisionerRenderLock(target)) return false;

  let remembered = false;
  for (const [observerId, entry] of pendingTokenMovementPositions.entries()) {
    const observer = tokenObjectForId(observerId) || entry?.tokenDoc || null;
    if (!observer || !shouldUseCoreDetectionDuringPendingMovement(observer, target)) continue;

    const storedState = getStoredVisibilityState(observer, target);
    if (!RENDER_HIDDEN_FROM_OBSERVER_STATES.has(storedState)) continue;
    if (invisibleUndetectedRenderLockMustStayLocked(target, storedState)) continue;

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
  if (!targetId || foundryHiddenRequiresVisionerRenderLock(target)) return null;

  const contextsByObserver = pendingMovementCoreVisibleGraceContexts.get(targetId);
  if (!contextsByObserver) return null;

  for (const [observerId, context] of contextsByObserver.entries()) {
    if (context?.targetObject && context.targetObject !== target) {
      contextsByObserver.delete(observerId);
      continue;
    }
    if (!context) continue;

    const observer = tokenObjectForId(observerId);
    const currentState = observer
      ? getStoredVisibilityState(observer, target)
      : context.visibilityState;
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
  const reachedObservedDestination = predictedObservedMovementReachedDestination(
    lock.observer,
    token,
  );
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

  const foundryHidden = foundryHiddenRequiresVisionerRenderLock(target);
  if (!foundryHidden && contextShouldYieldToCoreDuringPendingMovement(lockContext, target)) {
    forgetHiddenForceContext(target);
    return null;
  }

  const elapsedMs = Date.now() - Number(lockContext.lastForcedAt ?? 0);
  const withinGrace =
    Number.isFinite(elapsedMs) &&
    elapsedMs >= 0 &&
    elapsedMs < PENDING_MOVEMENT_RENDER_LOCK_GRACE_MS;

  if (lockContext.awaitingDetectionFilter) {
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
    const hiddenByVisioner = visionerStateHidesTargetRendering(visibilityState, target);
    if (!hiddenByVisioner && !foundryHidden) {
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
    !!context && !!observer && pendingHiddenTargetIsVisibleFromCurrentSources(token, context);
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

function hasAwaitingDetectionFilterRenderLock(token) {
  return (
    !!getPendingRenderState(token)?.lastHiddenContext?.awaitingDetectionFilter ||
    !!getRememberedHiddenForceContext(token)?.awaitingDetectionFilter
  );
}

function clearObsoleteAwaitingDetectionFilterRenderLock(token) {
  const state = getPendingRenderState(token);
  forgetHiddenForceContext(token);
  if (state?.lastHiddenContext?.awaitingDetectionFilter) {
    state.lastHiddenContext = null;
  }
  return restorePendingMovementTokenRendering(token, {
    ignoreObservedGrace: true,
    ignoreObserverLocks: true,
  });
}

function meshIsForcedInvisible(mesh) {
  if (!mesh) return true;

  const alpha = Number(mesh.alpha);
  const visible = 'visible' in mesh ? mesh.visible === false : true;
  const renderable = 'renderable' in mesh ? mesh.renderable === false : true;
  const transparent = !('alpha' in mesh) || (Number.isFinite(alpha) && alpha <= 0);

  return visible && renderable && transparent;
}

function shouldSkipForcedInvisibleTokenRefresh(token) {
  const state = getPendingRenderState(token);
  if (!state) return false;

  const context = state.lastHiddenContext || getRememberedHiddenForceContext(token);
  if (context?.awaitingDetectionFilter) return false;
  if (tokenHasDetectionFilterVisual(token)) return false;
  if (invisibleUndetectedRenderLockMustStayLocked(token, context?.visibilityState)) {
    return token.visible === false && token.renderable === false && meshIsForcedInvisible(token.mesh);
  }
  if (!context?.foundryHidden) {
    const observer = tokenObjectForId(context?.observerId);
    const visibilityState = observer ? getPendingMovementVisibilityState(observer, token) : null;
    if (!visionerStateHidesTargetRendering(visibilityState, token)) return false;
  }

  return token.visible === false && token.renderable === false && meshIsForcedInvisible(token.mesh);
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
  const hiddenRenderLockContext = getPendingMovementRenderLockContext(token) || rememberedContext;
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
  if (shouldBypassAvsForGmVision()) return false;
  if (target.controlled) return false;
  if (visibilityState === 'hidden' && hasCoreOwnedPendingMovement(observer, target)) {
    return false;
  }

  if (!visionerStateHidesTargetRendering(visibilityState, target)) {
    return false;
  }

  const context = rememberHiddenForceContext(target, {
    observerId: tokenIdOf(observer),
    observerName: observer?.name ?? observer?.document?.name,
    targetId: tokenIdOf(target),
    targetName: target?.name ?? target?.document?.name,
    visibilityState,
    hiddenByVisioner: true,
    renderHiddenByVisioner: true,
    foundryHidden: foundryHiddenRequiresVisionerRenderLock(target),
    wallBlocked: false,
    awaitingDetectionFilter: false,
    pendingPosition: getPendingTokenMovementPosition(tokenIdOf(observer)),
  });
  if (!context) return false;

  forcePendingMovementTokenInvisible(target);
  return true;
}

export function clearPendingTokenMovementPosition(
  tokenId,
  {
    preserveCurrentSightLineGrace = false,
    preserveRecentCompletedMovementContext = preserveCurrentSightLineGrace,
  } = {},
) {
  if (!tokenId) return;
  clearAnimationRenderRefreshes(tokenId);
  clearCoreAnimationVisionRefresh(tokenId);
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
  syncActivePendingMovementGlobalFlag();
  if (!pendingTokenMovementPositions.size) {
    clearPendingMovementCoalescedRefresh();
  }
  if (!preserveRecentCompletedMovementContext) {
    for (const [targetId, context] of recentCompletedMovementRefreshTargetIds.entries()) {
      if (context?.observerId === tokenId) {
        recentCompletedMovementRefreshTargetIds.delete(targetId);
      }
    }
  }
  if (!preserveCurrentSightLineGrace) {
    forgetCurrentSightLineGraceContextsForObserver(tokenId);
  }
  rebalancePendingMovementRoutePointBudgets(pendingTokenMovementPositions);
  clearPendingMovementAnimationSuppressionIfIdle({
    preserveCurrentSightLineGrace,
    preserveRecentCompletedMovementContext,
  });
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
  const movingToken = tokenObjectForId(tokenId) || tokenDoc;
  const initialVisibilityStatesByTargetId = captureInitialVisibilityStatesByTargetId(
    movingToken,
    tokenId,
  );
  const initialVisibilityStatesByObserverId = captureInitialVisibilityStatesByObserverId(
    movingToken,
    tokenId,
  );

  clearPendingTokenMovementPosition(tokenId, {
    preserveCurrentSightLineGrace: true,
    preserveRecentCompletedMovementContext: true,
  });

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
    initialVisibilityStatesByTargetId,
    initialVisibilityStatesByObserverId,
    finalVisibilityStatesByTargetId,
    finalVisibilityStatesByObserverId,
    finalVisibilityPredictionPending: false,
    deferFinalVisibilityUntilVisualSettled: pendingMovementHookOptionsMayAnimate(options),
    routeWallBlockedCache: new Map(),
    serial,
    expiresAt: Date.now() + PENDING_MOVEMENT_TTL_MS,
    timeoutId,
  });
  syncActivePendingMovementGlobalFlag();
  installOcclusionOnlyPerceptionSuppression(PENDING_MOVEMENT_OCCLUSION_SUPPRESSION_MS);
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

export function hasPendingTokenMovementPosition(tokenOrId) {
  const tokenId = typeof tokenOrId === 'string' ? tokenOrId : tokenIdOf(tokenOrId);
  if (!tokenId) return false;
  cleanupExpiredPendingMovements();
  return pendingTokenMovementPositions.has(tokenId);
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
  if (isControlledMovementPreviewToken(observer) || isControlledTokenDragActive(observer))
    return true;
  if (isControlledMovementPreviewToken(target) || isControlledTokenDragActive(target)) return true;
  if (hasPendingControlledTokenDragIntent(observer) || hasPendingControlledTokenDragIntent(target))
    return true;

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
  if (isControlledMovementPreviewToken(observer) || isControlledTokenDragActive(observer))
    return true;
  if (isControlledMovementPreviewToken(target) || isControlledTokenDragActive(target)) return true;

  return false;
}

export function shouldUseCoreDetectionDuringPendingMovement(observer, target) {
  if (!hasCoreOwnedPendingMovement(observer, target)) return false;

  const storedVisibilityState = getStoredVisibilityState(observer, target);
  if (
    DETECTION_BLOCKING_VISIBILITY_STATES.has(storedVisibilityState) &&
    hasActiveAvsOverride(observer, target)
  ) {
    return false;
  }
  if (invisibleUndetectedRenderLockMustStayLocked(target, storedVisibilityState)) return false;
  if (
    RENDER_HIDDEN_FROM_OBSERVER_STATES.has(storedVisibilityState) &&
    hasActiveControlledMovementPreview(observer, target)
  ) {
    const previewCanReveal = activePreviewCanRevealStoredUndetectedTarget(
      observer,
      target,
      storedVisibilityState,
    );
    if (previewCanReveal || !hasPendingMovementEntryForPair(observer, target)) {
      return previewCanReveal;
    }
  }
  const predictedFinalState = getPredictedFinalVisibilityState(observer, target);
  const storedRenderHidden = visionerStateHidesTargetRendering(storedVisibilityState, target);
  if (storedRenderHidden && !RENDER_HIDDEN_FROM_OBSERVER_STATES.has(storedVisibilityState)) {
    return false;
  }
  if (predictedFinalState) {
    const finalRenderHidden = visionerStateHidesTargetRendering(predictedFinalState, target);
    if (storedRenderHidden && finalRenderHidden) return false;
    return true;
  }

  if (storedRenderHidden) {
    return hasCommittedCoreOwnedPendingMovement(observer, target);
  }

  return true;
}

export function completePendingTokenMovement(tokenOrId, expectedSerial = null) {
  const tokenId = typeof tokenOrId === 'string' ? tokenOrId : tokenIdOf(tokenOrId);
  if (!tokenId) return false;

  const entry = pendingTokenMovementPositions.get(tokenId);
  if (!entry) {
    return false;
  }
  if (expectedSerial !== null && entry.serial !== expectedSerial) {
    return false;
  }
  if (entry.finalVisibilityPredictionPending) {
    if (!pendingTokenMovementCompletionTimeouts.has(tokenId)) {
      const timeoutId = setTimeout(() => {
        pendingTokenMovementCompletionTimeouts.delete(tokenId);
        completePendingTokenMovement(tokenId, expectedSerial);
      }, 16);
      pendingTokenMovementCompletionTimeouts.set(tokenId, timeoutId);
    }
    return false;
  }

  clearPredictedObservedTransitionVisualsForCompletingMovement(tokenId, entry);
  rememberObservedHiddenSoundwaveGraceForCompletingMovement(tokenId, entry);
  const observer = tokenObjectForId(tokenId) || entry?.tokenDoc || null;
  releasePendingControlledTokenDragIntent(observer || { id: tokenId }, { delayMs: 0 });
  const refreshTargetIds = getAnimationRefreshTargetIdsForMovement(tokenId);
  recentCompletedMovementRefreshTargetIds.clear();
  const recentMovementExpiresAt = Date.now() + PENDING_MOVEMENT_RENDER_LOCK_GRACE_MS;
  for (const targetId of refreshTargetIds) {
    const target = tokenObjectForId(targetId);
    const finalVisibilityState = entry.finalVisibilityStatesByTargetId?.get(targetId) ?? null;
    recentCompletedMovementRefreshTargetIds.set(targetId, {
      observerId: tokenId,
      expiresAt: recentMovementExpiresAt,
      finalVisibilityState,
      position: entry.position,
    });
    rememberCurrentSightLineGraceForCompletedMovement(observer, target, finalVisibilityState);
  }
  clearPendingTokenMovementPosition(tokenId, { preserveCurrentSightLineGrace: true });
  refreshPendingMovementTokenVisibility([], {
    ignoreObservedGrace: true,
    skipPerceptionRefresh: true,
    source: 'movement-completion',
    targetTokenIds: refreshTargetIds,
  });
  schedulePostCompletionRenderRefreshes(tokenId, entry.serial, pendingMovementRefreshScheduler);
  try {
    const completedTokenDoc = tokenObjectForId(tokenId)?.document ?? entry.tokenDoc ?? null;
    Hooks.callAll('pf2e-visioner.pendingTokenMovementComplete', {
      tokenId,
      tokenDoc: completedTokenDoc,
      movementChanges: {
        x: entry.position?.x,
        y: entry.position?.y,
      },
    });
  } catch {
    /* best-effort AVS movement completion notification */
  }

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
  activatePendingMovementCoreAnimationBypass();
  installOcclusionOnlyPerceptionSuppression(PENDING_MOVEMENT_OCCLUSION_SUPPRESSION_MS);
  scheduleAnimationRenderRefreshes(tokenId, serial, pendingMovementRefreshScheduler);
  scheduleCoreAnimationVisionRefreshes(tokenId, serial);

  const startedAt = Date.now();
  const complete = () => completePendingTokenMovement(tokenId, serial);
  const initialToken = tokenDoc?.object || tokenObjectForId(tokenId);
  const initialAnimation = initialToken?._animation;
  const watchedAnimationPromises = new Set();

  function scheduleCompletionCheck(delayMs = 0) {
    const existingTimeoutId = pendingTokenMovementCompletionTimeouts.get(tokenId);
    if (existingTimeoutId) clearTimeout(existingTimeoutId);
    const timeoutId = setTimeout(
      waitForAnimationOrComplete,
      Math.max(0, Number(delayMs) || 0),
    );
    pendingTokenMovementCompletionTimeouts.set(tokenId, timeoutId);
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

    if (
      deferredAnimation?.promise &&
      movementAnimationIsRunning(deferredAnimation) &&
      !watchedAnimationPromises.has(deferredAnimation.promise)
    ) {
      watchedAnimationPromises.add(deferredAnimation.promise);
      deferredAnimation.promise.finally(() => scheduleCompletionCheck(0));
      return;
    }
    if ((movementAnimationIsRunning(deferredAnimation) || tokenIsAnimating(token)) && elapsedMs < PENDING_MOVEMENT_TTL_MS) {
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

  if (initialAnimation?.promise && movementAnimationIsRunning(initialAnimation)) {
    watchedAnimationPromises.add(initialAnimation.promise);
    initialAnimation.promise.finally(() => scheduleCompletionCheck(0));
    return true;
  }

  scheduleCompletionCheck(PENDING_MOVEMENT_ANIMATION_DETECTION_DELAY_MS);
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
  const visionSources = options.visionSources ?? canvas?.effects?.visionSources ?? [];
  const lightSources = options.lightSources ?? canvas?.effects?.lightSources ?? [];
  const targetId = tokenIdOf(target);
  if (!targetId) return [];

  const signature = pendingMovementEntriesSignature();
  const cache = cachedMapForPendingMovementSignature(
    pendingMovementBlockedDetectionEntriesCache,
    signature,
  );
  pendingMovementBlockedDetectionEntriesCache = rememberPendingMovementCache(cache, signature);
  const cacheKey = [
    targetId,
    tokenPositionSignature(target),
    detectionSourceSignature(visionSources),
    detectionSourceSignature(lightSources),
  ].join('||');
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const entries = withPendingMovementDecisionCache(() =>
    getPendingMovementBlockedDetectionEntriesUncached(target, {
      ...options,
      visionSources,
      lightSources,
    }),
  );
  cache.set(cacheKey, entries);
  return entries;
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

function shouldTemporarilyForceTokenInvisibleUncached(target, { hasDetectionWork = null } = {}) {
  if (!target?.document?.id) return false;
  if (shouldBypassAvsForGmVision()) return false;
  if (target.controlled) return false;
  if (hasDetectionWork === null && !hasPendingMovementDetectionWork()) return false;
  if (hasDetectionWork === false) return false;

  rememberCoreVisibleGraceForCoreOwnedPendingObservers(target);

  const hiddenStateContext = getPendingMovementHiddenStateContext(target);
  if (hiddenStateContext) {
    const observer = tokenObjectForId(hiddenStateContext.observerId);
    if (
      coreVisibleGraceCanBypassHiddenState(observer, target, hiddenStateContext.visibilityState)
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

    if (
      observer &&
      !invisibleUndetectedRenderLockMustStayLocked(target, hiddenStateContext.visibilityState) &&
      RENDER_HIDDEN_FROM_OBSERVER_STATES.has(hiddenStateContext.visibilityState) &&
      shouldUseCoreDetectionDuringPendingMovement(observer, target)
    ) {
      const currentPolygonSeesTarget = currentCoreDetectionPolygonSeesTarget(observer, target, {
        requirePolygon: true,
      });
      if (currentPolygonSeesTarget === true) {
        rememberCurrentSightLineGraceContext(observer, target);
        forgetHiddenForceContext(target);
        return false;
      }

      const bypassOriginPoint = centerForToken(observer);
      const bypassTargetPoints = coreVisibilityTestPointsForPendingTarget(target);
      if (
        bypassOriginPoint &&
        bypassTargetPoints.length &&
        bypassTargetPoints.some(
          (p) =>
            !lineOfSightBlockedByWall(bypassOriginPoint, p, {
              originToken: observer,
              targetToken: target,
            }),
        )
      ) {
        rememberCurrentSightLineGraceContext(observer, target);
        forgetHiddenForceContext(target);
        return false;
      }
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
  if (recentCompletedMovementRefreshTargetIds.size > 0) return true;
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

function clearPendingMovementCoalescedRefresh() {
  const frameId = pendingMovementCoalescedRefresh?.frameId;
  pendingMovementCoalescedRefresh = null;
  if (frameId == null) return;
  try {
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frameId);
    else clearTimeout(frameId);
  } catch {
    /* best-effort frame cleanup */
  }
}

function shouldKeepStoredHiddenDetectionFilterMeshVisible(token) {
  if (!token?.detectionFilterMesh) return false;
  if (!hasHiddenStoredVisibilityStateForToken(token)) return false;
  if (hasObservedTransitionDetectionFilterSuppression(token)) return false;
  return true;
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
    existingTargetIds || nextTargetIds
      ? [...new Set([...(existingTargetIds ?? []), ...(nextTargetIds ?? [])])]
      : null;

  return {
    movingTokenIds: [...movingTokenIds],
    options: {
      ignoreObservedGrace:
        !!existing.options.ignoreObservedGrace || !!next.options.ignoreObservedGrace,
      skipTokenRefresh: !!existing.options.skipTokenRefresh && !!next.options.skipTokenRefresh,
      skipPerceptionRefresh:
        !!existing.options.skipPerceptionRefresh && !!next.options.skipPerceptionRefresh,
      source:
        existing.options.source === next.options.source ? existing.options.source : 'coalesced',
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
    !!token?.detectionFilterMesh?.visible,
    !!token?.detectionFilterMesh?.renderable,
    token?.detectionFilterMesh?.alpha ?? '',
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

function currentSightLineSignatureForToken(token) {
  const targetId = tokenIdOf(token);
  if (!targetId) return '';
  return pendingMovementObserverCandidates()
    .map((observer) => {
      const observerId = tokenIdOf(observer);
      if (!observerId || observerId === targetId) return null;
      const storedState = getStoredVisibilityState(observer, token);
      const predictedFinalState = getPredictedFinalVisibilityState(observer, token);
      const shouldTrackSightLine =
        DETECTION_BLOCKING_VISIBILITY_STATES.has(storedState) ||
        (CORE_LOS_TRANSITION_REFRESH_STATES.has(storedState) &&
          (tokenHasDetectionFilterVisual(token) ||
            DETECTION_BLOCKING_VISIBILITY_STATES.has(predictedFinalState) ||
            hasPendingMovementEntryForPair(observer, token)));
      if (!shouldTrackSightLine) return null;
      return `${observerId}:${currentPendingMovementSightLineSeesTarget(observer, token) ? 'seen' : 'blocked'}`;
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
    currentSightLineSignatureForToken(token),
    tokenVisualSignature(token),
    context.ignoreObservedGrace ? 'ignore-observed-grace' : '',
    context.forceTokenRefresh ? 'force-token-refresh' : '',
    context.hasDetectionWork ? 'detection-work' : '',
    context.hasSpecialVisualWork ? 'special-visual-work' : '',
  ].join('||');
}

function shouldSkipUnchangedPendingMovementTokenRefresh(token, context) {
  if (!token || context.skipTokenRefresh) return false;
  if (context.forceTokenRefresh) return false;
  if (context.shouldForceInvisible) return false;
  if (context.renderHiddenLockDecision) return false;

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

function enabledPerceptionFlags(flags) {
  if (!flags || typeof flags !== 'object') return false;
  return Object.entries(flags)
    .filter(([, value]) => value === true)
    .map(([key]) => key);
}

function isOcclusionOnlyPerceptionUpdate(flags) {
  const enabledFlags = enabledPerceptionFlags(flags);
  if (!enabledFlags) return false;
  return enabledFlags.length > 0 && enabledFlags.every((key) => key.startsWith('refreshOcclusion'));
}

function isCoreAnimationPerceptionUpdate(flags) {
  if (!flags || typeof flags !== 'object') return false;
  return !!(
    (flags.refreshVision &&
      (flags.refreshLighting ||
        flags.refreshSounds ||
        flags.refreshOcclusionMask ||
        flags.refreshOcclusionStates)) ||
    (flags.refreshSounds && (flags.refreshOcclusionMask || flags.refreshOcclusionStates))
  );
}

function isCoreAnimationVisionRebuildUpdate(flags) {
  if (!flags || typeof flags !== 'object') return false;
  return !!(
    flags.refreshVision &&
    (flags.refreshLighting ||
      flags.initializeVisionModes ||
      flags.initializeVision ||
      flags.initializeVisionSources)
  );
}

function renderFlagsSnapshot(renderFlags) {
  const flags = {};
  try {
    for (const flag of renderFlags || []) {
      flags[flag] = true;
    }
  } catch {
    return null;
  }
  return flags;
}

function canApplyCoreAnimationRenderShortcut(flags) {
  const enabledFlags = enabledPerceptionFlags(flags);
  if (!enabledFlags?.length) return false;
  if (!isCoreAnimationPerceptionUpdate(flags)) return false;
  if (flags.refreshVision) return false;
  return enabledFlags.every((flag) => PENDING_MOVEMENT_CORE_ANIMATION_RENDER_FLAGS.has(flag));
}

function applyCoreAnimationRenderShortcut(perception) {
  const flags = perception?.renderFlags?.clear?.();
  if (!flags) return undefined;

  if (flags.refreshOcclusion) {
    canvas?.masks?.occlusion?._updateOccludableTokens?.();
  }
  if (flags.refreshOccludedSurfaces) {
    canvas?.masks?.occlusion?._updateOccludedSurfaces?.(flags);
  }
  if (flags.refreshLightSources) {
    canvas?.effects?.refreshLightSources?.();
  }
  if (flags.refreshVisionSources) {
    canvas?.effects?.refreshVisionSources?.();
  }
  if (flags.refreshSounds) {
    canvas?.sounds?.refresh?.({ fade: flags.soundFadeDuration ? 250 : 0 });
  }
  if (flags.refreshPrimary) {
    canvas?.primary?.refreshPrimarySpriteMesh?.();
  }
  if (flags.refreshLighting) {
    canvas?.effects?.refreshLighting?.();
  }
  if (flags.refreshVision) rememberCoreAnimationVisionRefreshPositions();
  if (flags.refreshOcclusionMask) {
    canvas?.masks?.occlusion?._updateOcclusionMask?.();
  }
  if (flags.refreshOcclusionStates) {
    canvas?.masks?.occlusion?._updateOccludedObjects?.();
  }
  return undefined;
}

function clearThrottledCoreAnimationVisionPerceptionUpdate(state) {
  if (!state?.coreAnimationVisionPerceptionFlushTimeoutId) return;
  clearTimeout(state.coreAnimationVisionPerceptionFlushTimeoutId);
  state.coreAnimationVisionPerceptionFlushTimeoutId = null;
}

function flushThrottledCoreAnimationVisionPerceptionUpdate(state) {
  const update = state?.throttledCoreAnimationVisionPerceptionUpdate;
  if (!state || !update) return undefined;

  state.throttledCoreAnimationVisionPerceptionUpdate = null;
  clearThrottledCoreAnimationVisionPerceptionUpdate(state);
  state.lastCoreAnimationVisionPerceptionUpdateAt = Date.now();
  return withPendingMovementCoreAnimationPerceptionRefresh(() =>
    state.originalUpdate.call(update.thisArg ?? state.perception, update.flags, ...update.args),
  );
}

function queueThrottledCoreAnimationVisionPerceptionUpdate(state, thisArg, flags, args = []) {
  const now = Date.now();
  const lastUpdateAt = state.lastCoreAnimationVisionPerceptionUpdateAt;
  const elapsedMs = lastUpdateAt == null ? Infinity : now - lastUpdateAt;
  if (elapsedMs >= PENDING_MOVEMENT_CORE_ANIMATION_VISION_REBUILD_INTERVAL_MS) {
    state.lastCoreAnimationVisionPerceptionUpdateAt = now;
    return withPendingMovementCoreAnimationPerceptionRefresh(() =>
      state.originalUpdate.call(thisArg, flags, ...args),
    );
  }

  const queued = state.throttledCoreAnimationVisionPerceptionUpdate;
  state.throttledCoreAnimationVisionPerceptionUpdate = {
    args,
    flags: mergePerceptionUpdateFlags(queued?.flags, flags),
    thisArg,
  };

  if (!state.coreAnimationVisionPerceptionFlushTimeoutId) {
    const delayMs = Math.max(
      0,
      PENDING_MOVEMENT_CORE_ANIMATION_VISION_REBUILD_INTERVAL_MS - elapsedMs,
    );
    state.coreAnimationVisionPerceptionFlushTimeoutId = setTimeout(() => {
      state.coreAnimationVisionPerceptionFlushTimeoutId = null;
      if (pendingMovementOcclusionOnlyPerceptionSuppression !== state) return;
      flushThrottledCoreAnimationVisionPerceptionUpdate(state);
    }, delayMs);
  }

  return undefined;
}

function refreshPendingMovementCoreAnimationView(tokenId, targetTokenIds = null) {
  if (shouldBypassAvsForGmVision()) return;

  if (!tokenObjectForId(tokenId)) return;
  const refreshTargetTokenIds =
    targetTokenIds ?? getCoreAnimationRefreshTargetIdsForMovement(tokenId);
  if (!refreshTargetTokenIds.length) return;
  refreshPendingMovementTokenVisibility([tokenId], {
    forceTokenRefresh: true,
    ignoreObservedGrace: true,
    skipPerceptionRefresh: true,
    source: 'core-animation-vision-refresh',
    targetTokenIds: refreshTargetTokenIds,
  });
}

function coreAnimationVisionSourcePositionKey(tokenId, token) {
  const source = sourceList(canvas?.effects?.visionSources).find(
    (candidate) => tokenIdOf(candidate?.object) === tokenId,
  );
  const sourcePosition = source
    ? { x: source.x ?? source.center?.x, y: source.y ?? source.center?.y }
    : null;
  const position =
    Number.isFinite(Number(sourcePosition?.x)) && Number.isFinite(Number(sourcePosition?.y))
      ? sourcePosition
      : centerForToken(token);
  if (!Number.isFinite(Number(position?.x)) || !Number.isFinite(Number(position?.y))) {
    return null;
  }
  return `${Math.round(Number(position.x) * 10) / 10}:${Math.round(Number(position.y) * 10) / 10}`;
}

function rememberCoreAnimationVisionRefreshPosition(tokenId, token = tokenObjectForId(tokenId)) {
  const positionKey = coreAnimationVisionSourcePositionKey(tokenId, token);
  if (!positionKey) return false;
  pendingMovementCoreAnimationVisionRefreshPositionKeys.set(tokenId, positionKey);
  return true;
}

function rememberCoreAnimationVisionRefreshPositions() {
  for (const [tokenId, entry] of pendingTokenMovementPositions.entries()) {
    rememberCoreAnimationVisionRefreshPosition(tokenId, tokenObjectForId(tokenId) || entry?.tokenDoc);
  }
}

function scheduleCoreAnimationVisionRefreshes(tokenId, serial) {
  if (!tokenId) return;
  clearCoreAnimationVisionRefresh(tokenId);

  const startedAt = Date.now();
  let lastRefreshAt = 0;
  const tick = () => {
    pendingMovementCoreAnimationVisionRefreshFrames.delete(tokenId);
    const entry = pendingTokenMovementPositions.get(tokenId);
    if (!entry || entry.serial !== serial) return;

    const elapsedMs = Date.now() - startedAt;
    const token = tokenObjectForId(tokenId) || entry?.tokenDoc?.object;
    const positionKey = coreAnimationVisionSourcePositionKey(tokenId, token);
    const positionChanged =
      positionKey &&
      pendingMovementCoreAnimationVisionRefreshPositionKeys.get(tokenId) !== positionKey;
    const now = Date.now();
    const refreshIntervalElapsed =
      lastRefreshAt === 0 ||
      now - lastRefreshAt >= PENDING_MOVEMENT_CORE_ANIMATION_VISION_REFRESH_INTERVAL_MS;
    if (refreshIntervalElapsed) {
      const targetTokenIds = getCoreAnimationRefreshTargetIdsForMovement(tokenId);
      lastRefreshAt = now;
      if (positionChanged) rememberCoreAnimationVisionRefreshPosition(tokenId, token);
      if (targetTokenIds.length) {
        withPendingMovementCoreAnimationPerceptionRefresh(() =>
          refreshPendingMovementCoreAnimationView(tokenId, targetTokenIds),
        );
      }
    }

    const visualPositionReached = tokenVisualPositionReached(token, entry.position);
    if (
      elapsedMs >= PENDING_MOVEMENT_TTL_MS ||
      (elapsedMs >= PENDING_MOVEMENT_ANIMATION_DETECTION_SETTLE_MS && visualPositionReached)
    ) {
      return;
    }

    pendingMovementCoreAnimationVisionRefreshFrames.set(
      tokenId,
      requestPendingMovementCoreAnimationFrame(tick),
    );
  };

  pendingMovementCoreAnimationVisionRefreshFrames.set(
    tokenId,
    requestPendingMovementCoreAnimationFrame(tick),
  );
}

function withPendingMovementCoreAnimationPerceptionRefresh(callback) {
  pendingMovementCoreAnimationPerceptionDepth += 1;
  try {
    return callback?.();
  } finally {
    pendingMovementCoreAnimationPerceptionDepth = Math.max(
      0,
      pendingMovementCoreAnimationPerceptionDepth - 1,
    );
  }
}

export function isPendingMovementCoreAnimationPerceptionRefresh() {
  return pendingMovementCoreAnimationPerceptionDepth > 0;
}

function activatePendingMovementCoreAnimationBypass(durationMs = 1800) {
  pendingMovementCoreAnimationBypassUntil = Math.max(
    pendingMovementCoreAnimationBypassUntil,
    Date.now() + durationMs,
  );
}

export function isPendingMovementCoreAnimationBypassActive() {
  return Date.now() <= pendingMovementCoreAnimationBypassUntil;
}

function mergePerceptionUpdateFlags(base, next) {
  const merged = { ...(base ?? {}) };
  for (const [key, value] of Object.entries(next ?? {})) {
    if (value === undefined) continue;
    merged[key] = merged[key] === true || value === true ? true : value;
  }
  return merged;
}

function installOcclusionOnlyPerceptionSuppression(durationMs = 400) {
  const perception = canvas?.perception;
  const originalUpdate = perception?.update;
  const originalApplyRenderFlags = perception?.applyRenderFlags;
  if (typeof originalUpdate !== 'function') return false;

  const now = Date.now();
  if (
    pendingMovementOcclusionOnlyPerceptionSuppression?.perception === perception &&
    perception.update === pendingMovementOcclusionOnlyPerceptionSuppression.wrappedUpdate &&
    (typeof originalApplyRenderFlags !== 'function' ||
      perception.applyRenderFlags ===
        pendingMovementOcclusionOnlyPerceptionSuppression.wrappedApplyRenderFlags)
  ) {
    pendingMovementOcclusionOnlyPerceptionSuppression.expiresAt = Math.max(
      pendingMovementOcclusionOnlyPerceptionSuppression.expiresAt,
      now + durationMs,
    );
    return true;
  }

  const state = {
    originalApplyRenderFlags,
    perception,
    originalUpdate,
    coreAnimationVisionPerceptionFlushTimeoutId: null,
    expiresAt: now + durationMs,
    lastCoreAnimationVisionPerceptionUpdateAt: null,
    throttledCoreAnimationVisionPerceptionUpdate: null,
    wrappedApplyRenderFlags: null,
    wrappedUpdate: null,
  };

  state.wrappedUpdate = function wrappedPendingMovementPerceptionUpdate(flags, ...args) {
    if (Date.now() <= state.expiresAt && isOcclusionOnlyPerceptionUpdate(flags)) {
      return undefined;
    }
    const callOriginal = () => state.originalUpdate.call(this, flags, ...args);
    if (Date.now() <= state.expiresAt && isCoreAnimationVisionRebuildUpdate(flags)) {
      return queueThrottledCoreAnimationVisionPerceptionUpdate(state, this, flags, args);
    }
    if (Date.now() <= state.expiresAt && isCoreAnimationPerceptionUpdate(flags)) {
      return withPendingMovementCoreAnimationPerceptionRefresh(callOriginal);
    }
    return callOriginal();
  };

  state.wrappedApplyRenderFlags = function wrappedPendingMovementApplyRenderFlags(...args) {
    if (Date.now() <= state.expiresAt) {
      const flags = renderFlagsSnapshot(this?.renderFlags);
      if (canApplyCoreAnimationRenderShortcut(flags)) {
        return withPendingMovementCoreAnimationPerceptionRefresh(() =>
          applyCoreAnimationRenderShortcut(this),
        );
      }
    }
    return state.originalApplyRenderFlags?.call(this, ...args);
  };

  const tickRestore = () => {
    const remainingMs = state.expiresAt - Date.now();
    if (remainingMs > 0) {
      setTimeout(tickRestore, remainingMs);
      return;
    }
    if (pendingMovementOcclusionOnlyPerceptionSuppression === state) {
      restorePendingMovementOcclusionOnlyPerceptionSuppression();
    }
  };

  pendingMovementOcclusionOnlyPerceptionSuppression = state;
  perception.update = state.wrappedUpdate;
  if (typeof originalApplyRenderFlags === 'function') {
    perception.applyRenderFlags = state.wrappedApplyRenderFlags;
  }
  setTimeout(tickRestore, durationMs);
  return true;
}

function withCoalescedTokenRefreshPerceptionUpdates(callback, { flushPerception = true } = {}) {
  const perception = canvas?.perception;
  const originalUpdate = perception?.update;
  if (typeof originalUpdate !== 'function') return callback();

  if (
    pendingMovementTokenRefreshPerceptionCoalescing?.perception === perception &&
    perception.update === pendingMovementTokenRefreshPerceptionCoalescing.wrappedUpdate
  ) {
    pendingMovementTokenRefreshPerceptionCoalescing.depth += 1;
    try {
      return callback();
    } finally {
      pendingMovementTokenRefreshPerceptionCoalescing.depth -= 1;
    }
  }

  const state = {
    depth: 1,
    flags: null,
    originalUpdate,
    perception,
    wrappedUpdate: null,
  };
  state.wrappedUpdate = function wrappedPendingMovementTokenRefreshPerceptionUpdate(
    flags,
    ...args
  ) {
    if (isOcclusionOnlyPerceptionUpdate(flags)) return undefined;
    state.flags = mergePerceptionUpdateFlags(state.flags, flags);
    return undefined;
  };

  pendingMovementTokenRefreshPerceptionCoalescing = state;
  perception.update = state.wrappedUpdate;
  try {
    return callback();
  } finally {
    state.depth -= 1;
    if (state.depth <= 0) {
      if (state.perception.update === state.wrappedUpdate) {
        state.perception.update = state.originalUpdate;
      }
      pendingMovementTokenRefreshPerceptionCoalescing = null;
      if (flushPerception && state.flags) {
        scheduleCanvasPerceptionUpdate(state.flags, { perception: state.perception });
      }
    }
  }
}

function rememberPendingMovementRefreshVisibilityPerceptionTarget(token) {
  if (!token) return;
  pendingMovementRefreshVisibilityPerceptionTargets.set(
    token,
    Date.now() + PENDING_MOVEMENT_REFRESH_VISIBILITY_PERCEPTION_COALESCE_MS,
  );
}

export function shouldCoalescePendingMovementRefreshVisibilityPerception(token) {
  const expiresAt = pendingMovementRefreshVisibilityPerceptionTargets.get(token);
  if (!expiresAt) return false;
  if (Date.now() <= expiresAt) return true;
  pendingMovementRefreshVisibilityPerceptionTargets.delete(token);
  return false;
}

export function withCoalescedPendingMovementPerceptionUpdates(callback) {
  return withCoalescedTokenRefreshPerceptionUpdates(callback);
}

function refreshPendingMovementTokenVisibilityUncached(
  movingTokenIds = [],
  {
    ignoreObservedGrace = false,
    forceTokenRefresh = false,
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
  const animationSoundwaveRefresh =
    source === 'animation-refresh' || source === 'core-animation-vision-refresh';
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

  withCoalescedTokenRefreshPerceptionUpdates(() => {
    for (const token of tokens) {
      if (ids.has(tokenIdOf(token))) {
        continue;
      }
      if (trackPerformance) {
        pendingMovementPerformanceCounters.tokensScanned += 1;
        sourceCounters.tokensScanned += 1;
      }
      try {
        if (hasAwaitingDetectionFilterRenderLock(token)) {
          clearObsoleteAwaitingDetectionFilterRenderLock(token);
          continue;
        }

        const shouldForceInvisible =
          shouldTemporarilyForceTokenInvisible(token, { hasDetectionWork }) ||
          targetMustStayHiddenDuringPendingMovement(token) ||
          (!hasActivePendingMovementVisibilityOwnershipForToken(token) &&
            targetIsRenderHiddenForCurrentViewObserver(token));
        if (shouldForceInvisible) {
          forcePendingMovementTokenInvisible(token);
          if (shouldSkipForcedInvisibleTokenRefresh(token)) {
            continue;
          }
        }
        if (
          !shouldForceInvisible &&
          !isActualControlledDragPreviewOnlyActive() &&
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
        if (!shouldForceInvisible && shouldSkipForcedInvisibleTokenRefresh(token)) {
          continue;
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
        const hasDetectionBlockingPendingState =
          hasDetectionBlockingPendingVisibilityStateForToken(token);
        const hasDetectionBlockingStoredState =
          hasDetectionBlockingStoredVisibilityStateForToken(token);
        const hasDetectionFilterVisual =
          tokenHasDetectionFilterVisual(token) || tokenHasDetectionFilterMeshVisual(token);
        const hasSpecialVisualWork =
          hasPendingRenderState(token) ||
          isPendingMovementRenderLocked(token) ||
          hasDetectionBlockingPendingState ||
          hasDetectionBlockingStoredState ||
          hasDetectionFilterVisual;
        const detectionFilterState = shouldForceInvisible
          ? null
          : capturePendingMovementDetectionFilterState(token, { hasDetectionWork });
        const refreshContext = {
          forceTokenRefresh,
          hasDetectionWork,
          ignoreObservedGrace,
          renderHiddenLockDecision: null,
          shouldForceInvisible,
          skipTokenRefresh,
          hasSpecialVisualWork,
        };
        let primedDetectionFilterVisual = false;
        if (!shouldForceInvisible) {
          primedDetectionFilterVisual = primePendingMovementDetectionFilterVisuals(token, {
            hasDetectionWork,
          });
        if (primedDetectionFilterVisual && !token.detectionFilter) {
            ensurePendingMovementHearingDetectionVisual(token, {
              lightweight: animationSoundwaveRefresh,
            });
          }
        }
        if (shouldSkipUnchangedPendingMovementTokenRefresh(token, refreshContext)) {
          continue;
        }
        if (
          animationSoundwaveRefresh &&
          primedDetectionFilterVisual &&
          !shouldForceInvisible
        ) {
          ensurePendingMovementHearingDetectionVisual(token, { lightweight: true });
          const visibleDetectionFilterMesh =
            token?.detectionFilterMesh?.visible === true ||
            token?.detectionFilterMesh?.renderable === true ||
            Number(token?.detectionFilterMesh?.alpha ?? 0) > 0;
          if (tokenHasDetectionFilterVisual(token) || visibleDetectionFilterMesh) {
            forceDetectionFilterMeshVisible(token);
            rememberPendingMovementTokenRefreshSignature(token, {
              ...refreshContext,
              skipTokenRefresh: true,
            });
            continue;
          }
        }
        if (!skipTokenRefresh) {
          rememberPendingMovementRefreshVisibilityPerceptionTarget(token);
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
              const keepPrimedDetectionFilterMesh =
                shouldKeepStoredHiddenDetectionFilterMeshVisible(token);
              if (keepPrimedDetectionFilterMesh) {
                ensurePendingMovementHearingDetectionVisual(token);
                forceDetectionFilterMeshVisible(token);
              } else if (!nativeRecomputedDetectionFilter) {
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
  }, { flushPerception: !skipPerceptionRefresh });

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
