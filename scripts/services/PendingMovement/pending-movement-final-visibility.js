import { profileToLegacyVisibility } from '../../visibility/perception-profile.js';
import { centerForToken, coreVisibilityTestPoints } from './pending-movement-geometry.js';
import {
  actorHasConditionSlug,
  createPositionedTokenProxy,
  observerCanHearTarget,
  observerHasWallBypassImpreciseSenseInRange,
  observerHasUsableSight,
} from './pending-movement-observer-senses.js';
import {
  lineOfSoundBlockedByWall,
  sceneHasBlockingWallSense,
} from './pending-movement-wall-blocking.js';

const PENDING_MOVEMENT_FINAL_VISIBILITY_PREDICTION_DELAY_MS = 250;
const PENDING_MOVEMENT_FINAL_VISIBILITY_PREDICTION_RETRY_DELAY_MS = 50;
const PENDING_MOVEMENT_FINAL_VISIBILITY_PREDICTION_MAX_DEFER_MS = 3000;
const DEFAULT_DETECTION_BLOCKING_VISIBILITY_STATES = new Set([
  'hidden',
  'undetected',
  'unnoticed',
]);
const DEFAULT_RENDER_HIDDEN_FROM_OBSERVER_STATES = new Set(['undetected', 'unnoticed']);
const DEFAULT_CORE_LOS_FINAL_PREDICTION_STATES = new Set(['observed', 'concealed']);
const PENDING_MOVEMENT_FINAL_VISIBILITY_INCREMENTAL_REFRESH_DELAY_MS = 16;

export function normalizePendingVisibilityState(value) {
  if (!value) return null;
  if (typeof value === 'object') {
    if (value.state) return normalizePendingVisibilityState(value.state);
    return profileToLegacyVisibility(value, { preserveEncounterUnnoticed: true }) || null;
  }
  return String(value);
}

export function createPendingVisibilityStateMap(value) {
  const map = new Map();
  if (!value) return map;

  const entries =
    value instanceof Map
      ? value.entries()
      : typeof value === 'object'
        ? Object.entries(value)
        : [];

  for (const [tokenId, visibilityState] of entries) {
    const state = normalizePendingVisibilityState(visibilityState);
    if (tokenId && state) map.set(String(tokenId), state);
  }

  return map;
}

export function mergeMissingPendingVisibilityStateMap(targetMap, sourceMap) {
  if (!targetMap || !sourceMap) return;
  for (const [tokenId, visibilityState] of sourceMap) {
    if (!targetMap.has(tokenId)) targetMap.set(tokenId, visibilityState);
  }
}

export function createPendingMovementFinalVisibilityController(adapter = {}) {
  const detectionBlockingVisibilityStates =
    adapter.detectionBlockingVisibilityStates ?? DEFAULT_DETECTION_BLOCKING_VISIBILITY_STATES;
  const renderHiddenFromObserverStates =
    adapter.renderHiddenFromObserverStates ?? DEFAULT_RENDER_HIDDEN_FROM_OBSERVER_STATES;
  const tokenIdOf = adapter.tokenIdOf ?? ((tokenOrDoc) => tokenOrDoc?.document?.id || tokenOrDoc?.id || null);
  const tokenDocOf = adapter.tokenDocOf ?? ((tokenOrDoc) => tokenOrDoc?.document || tokenOrDoc || null);
  const actorOf =
    adapter.actorOf ?? ((tokenOrDoc) => tokenOrDoc?.actor || tokenDocOf(tokenOrDoc)?.actor || null);
  const isTokenLikeTarget = adapter.isTokenLikeTarget ?? ((tokenOrDoc) => !!actorOf(tokenOrDoc));
  const tokenObjectForId =
    adapter.tokenObjectForId ??
    ((tokenId) =>
      canvas?.tokens?.get?.(tokenId) ||
      canvas?.tokens?.placeables?.find?.((token) => tokenIdOf(token) === tokenId) ||
      null);
  const getPlaceableTokens = adapter.getPlaceableTokens ?? (() => canvas?.tokens?.placeables || []);
  const getStoredVisibilityState = adapter.getStoredVisibilityState ?? (() => 'observed');
  const hasLineOfSightToSampledToken = adapter.hasLineOfSightToSampledToken ?? (() => false);
  const observerHasWallBypassImpreciseSense =
    adapter.observerHasWallBypassImpreciseSenseInRange ??
    observerHasWallBypassImpreciseSenseInRange;
  const getEntry = adapter.getEntry ?? (() => null);
  const getRefreshTargetIds = adapter.getRefreshTargetIds ?? (() => []);
  const refreshTokenVisibility = adapter.refreshTokenVisibility ?? (() => undefined);
  const warn = adapter.warn ?? ((...args) => console.warn(...args));
  const predictionDelayMs =
    adapter.predictionDelayMs ?? PENDING_MOVEMENT_FINAL_VISIBILITY_PREDICTION_DELAY_MS;
  const incrementalRefreshDelayMs =
    adapter.incrementalRefreshDelayMs ??
    PENDING_MOVEMENT_FINAL_VISIBILITY_INCREMENTAL_REFRESH_DELAY_MS;
  const finalPredictionRetryDelayMs =
    adapter.finalPredictionRetryDelayMs ??
    PENDING_MOVEMENT_FINAL_VISIBILITY_PREDICTION_RETRY_DELAY_MS;
  const finalPredictionMaxDeferMs =
    adapter.finalPredictionMaxDeferMs ??
    PENDING_MOVEMENT_FINAL_VISIBILITY_PREDICTION_MAX_DEFER_MS;
  const shouldDeferFinalVisibilityPrediction =
    adapter.shouldDeferFinalVisibilityPrediction ?? (() => false);

  const getTokenObjectForDocument = (tokenDoc) =>
    tokenDoc?.object || tokenObjectForId(tokenIdOf(tokenDoc));

  const calculateCheapFinalRenderVisibilityState = (
    observer,
    target,
    storedState,
    { soundCanBeBlocked = true } = {},
  ) => {
    const normalizedStoredState = normalizePendingVisibilityState(storedState);
    if (tokenDocOf(target)?.hidden) return normalizedStoredState;

    const originPoint = centerForToken(observer);
    const targetPoint = centerForToken(target);
    if (!originPoint || !targetPoint) return null;
    const targetPoints = coreVisibilityTestPoints(target);

    const targetInvisible = actorHasConditionSlug(actorOf(target), 'invisible');
    if (
      !targetInvisible &&
      observerHasUsableSight(observer) &&
      hasLineOfSightToSampledToken(originPoint, targetPoints, {
        originToken: observer,
        targetToken: target,
      })
    ) {
      return renderHiddenFromObserverStates.has(normalizedStoredState) ? 'observed' : null;
    }

    const canDetectByWallBypassImpreciseSense =
      observerHasWallBypassImpreciseSense(observer, target);
    const canHearAtFinalPosition =
      observerCanHearTarget(observer, target) &&
      (!soundCanBeBlocked ||
        !lineOfSoundBlockedByWall(originPoint, targetPoint, {
          originToken: observer,
          targetToken: target,
        }));

    if (canDetectByWallBypassImpreciseSense || canHearAtFinalPosition) {
      if (
        renderHiddenFromObserverStates.has(normalizedStoredState) ||
        DEFAULT_CORE_LOS_FINAL_PREDICTION_STATES.has(normalizedStoredState)
      ) {
        return 'hidden';
      }
      return null;
    }

    if (DEFAULT_CORE_LOS_FINAL_PREDICTION_STATES.has(normalizedStoredState)) {
      return 'undetected';
    }

    if (renderHiddenFromObserverStates.has(normalizedStoredState)) {
      return normalizedStoredState;
    }

    if (detectionBlockingVisibilityStates.has(normalizedStoredState)) {
      return 'hidden';
    }

    return null;
  };

  const predictCheapFinalVisibilityStates = (tokenDoc, position) => {
    const movingToken = getTokenObjectForDocument(tokenDoc);
    if (!movingToken && !tokenDoc) return null;

    const movingTokenId = tokenIdOf(tokenDoc);
    const movedToken = createPositionedTokenProxy(movingToken || tokenDoc, {
      x: position?.x,
      y: position?.y,
      elevation: tokenDoc?.elevation,
    });
    const finalVisibilityStatesByTargetId = new Map();
    const finalVisibilityStatesByObserverId = new Map();
    const soundCanBeBlocked = sceneHasBlockingWallSense('sound');

    for (const token of getPlaceableTokens()) {
      const tokenId = tokenIdOf(token);
      if (!tokenId || tokenId === movingTokenId || !isTokenLikeTarget(token)) continue;

      const targetStoredState = getStoredVisibilityState(movedToken, token);
      const targetState = calculateCheapFinalRenderVisibilityState(
        movedToken,
        token,
        targetStoredState,
        { soundCanBeBlocked },
      );
      if (targetState) finalVisibilityStatesByTargetId.set(tokenId, targetState);

      const observerStoredState = getStoredVisibilityState(token, movedToken);
      const observerState = calculateCheapFinalRenderVisibilityState(
        token,
        movedToken,
        observerStoredState,
        { soundCanBeBlocked },
      );
      if (observerState) finalVisibilityStatesByObserverId.set(tokenId, observerState);
    }

    return {
      finalVisibilityStatesByTargetId,
      finalVisibilityStatesByObserverId,
    };
  };

  const calculateFinalVisibilityState = async (observer, target, options = {}) => {
    if (typeof options.calculateFinalVisibility === 'function') {
      return normalizePendingVisibilityState(await options.calculateFinalVisibility(observer, target));
    }

    const [{ calculateVisibilityFromTokens }, { optimizedVisibilityCalculator }] = await Promise.all([
      import('../../visibility/VisibilityCalculatorAdapter.js'),
      import('../../visibility/auto-visibility/VisibilityCalculator.js'),
    ]);
    const components = optimizedVisibilityCalculator?.getComponents?.() ?? {};
    const conditionManager = components.conditionManager ?? components.ConditionManager;
    if (!components.lightingCalculator || !components.visionAnalyzer || !conditionManager) {
      return null;
    }

    const result = await calculateVisibilityFromTokens(
      observer,
      target,
      {
        lightingCalculator: components.lightingCalculator,
        visionAnalyzer: components.visionAnalyzer,
        conditionManager,
        lightingRasterService: components.lightingRasterService,
      },
      options.calculationOptions || {},
    );

    return normalizePendingVisibilityState(result);
  };

  const shouldPrioritizeFinalVisibilityPrediction = (movingToken, token) => {
    const storedState = getStoredVisibilityState(movingToken, token);
    return detectionBlockingVisibilityStates.has(storedState);
  };

  const sortFinalVisibilityPredictionTokens = (movingToken, tokens) =>
    [...tokens].sort((left, right) => {
      const leftPriority = shouldPrioritizeFinalVisibilityPrediction(movingToken, left) ? 1 : 0;
      const rightPriority = shouldPrioritizeFinalVisibilityPrediction(movingToken, right) ? 1 : 0;
      return rightPriority - leftPriority;
    });

  const predictFinalVisibilityStates = async (tokenDoc, position, options = {}) => {
    if (typeof options.predictFinalVisibility === 'function') {
      return options.predictFinalVisibility(tokenDoc, position, options);
    }

    const movingToken = getTokenObjectForDocument(tokenDoc);
    if (!movingToken && !tokenDoc) return null;

    const movingTokenId = tokenIdOf(tokenDoc);
    const movedToken = createPositionedTokenProxy(movingToken || tokenDoc, {
      x: position?.x,
      y: position?.y,
      elevation: tokenDoc?.elevation,
    });
    const tokens = sortFinalVisibilityPredictionTokens(movingToken || tokenDoc, getPlaceableTokens());
    const finalVisibilityStatesByTargetId = new Map();
    const finalVisibilityStatesByObserverId = new Map();
    const publishState = options.onPredictedFinalVisibilityState;

    for (const token of tokens) {
      const tokenId = tokenIdOf(token);
      if (!tokenId || tokenId === movingTokenId || !isTokenLikeTarget(token)) continue;

      const targetState = await calculateFinalVisibilityState(movedToken, token, options);
      if (targetState) {
        finalVisibilityStatesByTargetId.set(tokenId, targetState);
        publishState?.({
          direction: 'target',
          tokenId,
          visibilityState: targetState,
        });
      }

      const observerState = await calculateFinalVisibilityState(token, movedToken, options);
      if (observerState) {
        finalVisibilityStatesByObserverId.set(tokenId, observerState);
        publishState?.({
          direction: 'observer',
          tokenId,
          visibilityState: observerState,
        });
      }
    }

    return {
      finalVisibilityStatesByTargetId,
      finalVisibilityStatesByObserverId,
    };
  };

  const mergeFinalVisibilityStates = (entry, prediction) => {
    if (!entry || !prediction) return false;

    const byTargetId = createPendingVisibilityStateMap(
      prediction.finalVisibilityStatesByTargetId ??
      prediction.byTargetId ??
      prediction.targetStates,
    );
    const byObserverId = createPendingVisibilityStateMap(
      prediction.finalVisibilityStatesByObserverId ??
      prediction.byObserverId ??
      prediction.observerStates,
    );

    for (const [targetId, visibilityState] of byTargetId) {
      entry.finalVisibilityStatesByTargetId.set(targetId, visibilityState);
    }
    for (const [observerId, visibilityState] of byObserverId) {
      entry.finalVisibilityStatesByObserverId.set(observerId, visibilityState);
    }

    return byTargetId.size > 0 || byObserverId.size > 0;
  };

  const filterAffectedRefreshTargetIds = (movingTokenId, targetIds) => {
    const affectedTargetIds = new Set(getRefreshTargetIds(movingTokenId) || []);
    if (!affectedTargetIds.size) return [];
    return targetIds.filter((targetId) => affectedTargetIds.has(targetId));
  };

  const finalVisibilityRefreshTargetIds = (movingTokenId, prediction) => {
    const targetIds = new Set();
    const byTargetId = createPendingVisibilityStateMap(
      prediction?.finalVisibilityStatesByTargetId ??
      prediction?.byTargetId ??
      prediction?.targetStates,
    );
    const byObserverId = createPendingVisibilityStateMap(
      prediction?.finalVisibilityStatesByObserverId ??
      prediction?.byObserverId ??
      prediction?.observerStates,
    );

    for (const targetId of byTargetId.keys()) {
      targetIds.add(targetId);
    }
    if (movingTokenId && byObserverId.size > 0) {
      targetIds.add(movingTokenId);
    }

    return filterAffectedRefreshTargetIds(movingTokenId, [...targetIds]);
  };

  const publishFinalVisibilityState = (entry, update) => {
    if (!entry || !update?.tokenId) return false;

    const visibilityState = normalizePendingVisibilityState(update.visibilityState);
    if (!visibilityState) return false;

    if (update.direction === 'observer') {
      entry.finalVisibilityStatesByObserverId.set(update.tokenId, visibilityState);
      return true;
    }

    entry.finalVisibilityStatesByTargetId.set(update.tokenId, visibilityState);
    return true;
  };

  const scheduleFinalVisibilityPrediction = (tokenId, serial, tokenDoc, position, options = {}) => {
    if (!options?.predictFinalVisibility) return;
    const entry = getEntry(tokenId);
    if (!entry) return;
    entry.finalVisibilityPredictionPending = true;

    let incrementalRefreshTimerId = null;
    const incrementalRefreshTargetIds = new Set();
    const flushIncrementalRefresh = () => {
      incrementalRefreshTimerId = null;
      const targetTokenIds = [...incrementalRefreshTargetIds];
      incrementalRefreshTargetIds.clear();
      if (!targetTokenIds.length) return;

      const currentEntry = getEntry(tokenId);
      if (!currentEntry || currentEntry.serial !== serial) return;
      refreshTokenVisibility([tokenId], {
        ignoreObservedGrace: true,
        skipPerceptionRefresh: true,
        source: 'final-visibility-incremental',
        targetTokenIds,
      });
    };
    const queueIncrementalRefresh = (targetTokenId) => {
      if (!targetTokenId) return;
      incrementalRefreshTargetIds.add(targetTokenId);
      if (incrementalRefreshTimerId !== null) return;
      incrementalRefreshTimerId = setTimeout(
        flushIncrementalRefresh,
        incrementalRefreshDelayMs,
      );
    };
    const clearIncrementalRefresh = () => {
      if (incrementalRefreshTimerId !== null) {
        clearTimeout(incrementalRefreshTimerId);
        incrementalRefreshTimerId = null;
      }
      incrementalRefreshTargetIds.clear();
    };

    const publishIncrementalState = (update) => {
      const currentEntry = getEntry(tokenId);
      if (!currentEntry || currentEntry.serial !== serial) return;
      if (!publishFinalVisibilityState(currentEntry, update)) return;

      const targetTokenId = update.direction === 'observer' ? tokenId : update.tokenId;
      const [affectedTargetId] = filterAffectedRefreshTargetIds(tokenId, [targetTokenId]);
      queueIncrementalRefresh(affectedTargetId);
    };

    const scheduledAt = Date.now();
    const runPrediction = () => {
      const scheduledEntry = getEntry(tokenId);
      if (!scheduledEntry || scheduledEntry.serial !== serial) return;
      if (
        Date.now() - scheduledAt < finalPredictionMaxDeferMs &&
        shouldDeferFinalVisibilityPrediction(tokenId, scheduledEntry, {
          position,
          tokenDoc,
          options,
        })
      ) {
        scheduledEntry.finalVisibilityPredictionTimerId = setTimeout(
          runPrediction,
          finalPredictionRetryDelayMs,
        );
        return;
      }
      scheduledEntry.finalVisibilityPredictionTimerId = null;

      Promise.resolve()
        .then(() =>
          predictFinalVisibilityStates(tokenDoc, position, {
            ...options,
            onPredictedFinalVisibilityState: publishIncrementalState,
          }),
        )
        .then((prediction) => {
          const currentEntry = getEntry(tokenId);
          if (!currentEntry || currentEntry.serial !== serial) return;
          currentEntry.finalVisibilityPredictionPending = false;
          const changed = mergeFinalVisibilityStates(currentEntry, prediction);
          if (changed) {
            clearIncrementalRefresh();
            const targetTokenIds = finalVisibilityRefreshTargetIds(tokenId, prediction);
            refreshTokenVisibility([tokenId], {
              ignoreObservedGrace: true,
              source: 'final-visibility-prediction',
              ...(targetTokenIds.length ? { targetTokenIds } : {}),
            });
          }
        })
        .catch((error) => {
          const currentEntry = getEntry(tokenId);
          if (currentEntry?.serial === serial) {
            currentEntry.finalVisibilityPredictionPending = false;
          }
          clearIncrementalRefresh();
          warn('PF2E Visioner | pending movement final visibility prediction failed:', error);
        });
    };
    const timerId = setTimeout(runPrediction, predictionDelayMs);
    entry.finalVisibilityPredictionTimerId = timerId;
  };

  return {
    predictCheapFinalVisibilityStates,
    predictFinalVisibilityStates,
    scheduleFinalVisibilityPrediction,
  };
}
