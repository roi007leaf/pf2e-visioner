import { cachePendingMovementEvaluation } from './pending-movement-evaluation-cache.js';

function predictedObservedTransitionState(visibilityState) {
  return visibilityState === 'observed' || visibilityState === 'concealed';
}

function isStoredObservedState(visibilityState) {
  return visibilityState === 'observed' || visibilityState === 'concealed';
}

export function createPendingMovementCurrentViewSoundwaveController({
  clearDetectionFilterVisuals,
  currentPendingMovementSightLineSeesTarget,
  detectionBlockingVisibilityStates,
  getControlledTokens = () => canvas?.tokens?.controlled || [],
  getDraggedToken = () => canvas?.tokens?._draggedToken,
  getPendingMovementCanonicalToken,
  getPendingMovementVisibilityState,
  getPendingTokenMovementEntry,
  getPendingTokenMovementPosition,
  getPredictedFinalVisibilityState,
  getStoredVisibilityState,
  graceMs,
  hasPendingControlledTokenDragIntent,
  hasPendingMovementDetectionWork,
  hiddenSoundwaveShouldSurviveLimitedWall = () => false,
  pendingMovementEntryVisualReachedDestination,
  restorePendingMovementTokenRendering,
  shouldUseCoreDetectionDuringPendingMovement,
  tokenHasDetectionFilterVisual,
  tokenIdOf,
  tokenObjectForId,
} = {}) {
  const observedHiddenSoundwaveGraceContexts = new Map();
  const observedDetectionFilterSuppressionTokens = new WeakMap();

  function buildCurrentViewObservers() {
    const observers = [];
    const seen = new Set();
    const add = (token) => {
      const tokenId = tokenIdOf(token);
      if (!tokenId || seen.has(tokenId)) return;
      seen.add(tokenId);
      observers.push(token);
    };

    add(getDraggedToken());
    for (const token of getControlledTokens()) add(token);
    return observers;
  }

  function getCurrentViewObservers() {
    return cachePendingMovementEvaluation(
      'currentViewObservers',
      'active',
      buildCurrentViewObservers,
    );
  }

  function hasPendingControlledTokenDragIntentForCurrentView() {
    return getCurrentViewObservers().some((observer) => hasPendingControlledTokenDragIntent(observer));
  }

  function rememberObservedHiddenSoundwaveGraceContext(observer, target, context) {
    const observerId = tokenIdOf(observer);
    const targetId = tokenIdOf(target);
    if (!observerId || !targetId) return null;

    const graceContext = {
      observerId,
      observerName: observer?.name ?? observer?.document?.name,
      targetId,
      targetName: target?.name ?? target?.document?.name,
      visibilityState: 'hidden',
      expiresAt: Date.now() + graceMs,
      ...context,
    };
    if (!observedHiddenSoundwaveGraceContexts.has(targetId)) {
      observedHiddenSoundwaveGraceContexts.set(targetId, new Map());
    }
    observedHiddenSoundwaveGraceContexts.get(targetId).set(observerId, graceContext);
    return graceContext;
  }

  function pruneExpiredObservedHiddenSoundwaveGraceContexts(now = Date.now()) {
    for (const [targetId, contextsByObserver] of observedHiddenSoundwaveGraceContexts.entries()) {
      for (const [observerId, context] of contextsByObserver.entries()) {
        if (!context?.expiresAt || context.expiresAt <= now) {
          contextsByObserver.delete(observerId);
        }
      }
      if (!contextsByObserver.size) {
        observedHiddenSoundwaveGraceContexts.delete(targetId);
      }
    }
  }

  function getObservedHiddenSoundwaveGraceContextForCurrentView(target) {
    pruneExpiredObservedHiddenSoundwaveGraceContexts();
    const targetId = tokenIdOf(target);
    if (!targetId) return null;

    const contextsByObserver = observedHiddenSoundwaveGraceContexts.get(targetId);
    if (!contextsByObserver) return null;

    for (const observer of getCurrentViewObservers()) {
      const observerId = tokenIdOf(observer);
      if (!observerId) continue;

      const context = contextsByObserver.get(observerId);
      if (!context) continue;

      const storedVisibilityState = getStoredVisibilityState(observer, target);
      if (!isStoredObservedState(storedVisibilityState)) {
        contextsByObserver.delete(observerId);
        continue;
      }
      if (currentPendingMovementSightLineSeesTarget(observer, target)) {
        contextsByObserver.delete(observerId);
        continue;
      }

      return context;
    }

    if (!contextsByObserver.size) observedHiddenSoundwaveGraceContexts.delete(targetId);
    return null;
  }

  function shouldPreserveHiddenSoundwaveForCurrentView(target) {
    if (!target?.document?.id) return false;

    for (const observer of getCurrentViewObservers()) {
      const predictedFinalState = getPredictedFinalVisibilityState(observer, target);
      if (
        predictedFinalState &&
        !detectionBlockingVisibilityStates.has(predictedFinalState)
      ) {
        continue;
      }

      const storedVisibilityState = getStoredVisibilityState(observer, target);
      if (storedVisibilityState === 'hidden') {
        if (
          !currentPendingMovementSightLineSeesTarget(observer, target) ||
          hiddenSoundwaveShouldSurviveLimitedWall(observer, target)
        ) {
          return true;
        }
        continue;
      }
      if (!isStoredObservedState(storedVisibilityState)) continue;
      if (!tokenHasDetectionFilterVisual(target)) continue;
      if (!currentPendingMovementSightLineSeesTarget(observer, target)) return true;
    }

    return false;
  }

  function shouldAllowCoreHiddenSoundwaveForCurrentView(target) {
    if (!target?.document?.id) return false;

    for (const observer of getCurrentViewObservers()) {
      const storedVisibilityState = getStoredVisibilityState(observer, target);
      if (!isStoredObservedState(storedVisibilityState)) continue;
      if (getPendingMovementVisibilityState(observer, target) !== 'hidden') continue;
      if (!shouldUseCoreDetectionDuringPendingMovement(observer, target)) continue;
      if (!currentPendingMovementSightLineSeesTarget(observer, target)) return true;
    }

    return false;
  }

  function currentObservedSightLineSeesTarget(target) {
    if (!target?.document?.id) return false;

    for (const observer of getCurrentViewObservers()) {
      const visibilityState = getPendingMovementVisibilityState(observer, target);
      if (!isStoredObservedState(visibilityState)) continue;
      if (currentPendingMovementSightLineSeesTarget(observer, target)) return true;
    }

    return false;
  }

  function predictedObservedMovementReachedDestination(observer, target) {
    const visibilityObserver = getPendingMovementCanonicalToken(observer);
    const visibilityTarget = getPendingMovementCanonicalToken(target);
    const observerId = tokenIdOf(visibilityObserver);
    const targetId = tokenIdOf(visibilityTarget);
    if (!observerId || !targetId) return false;

    const observerEntry = getPendingTokenMovementEntry(observerId);
    const observerFinalState = observerEntry?.finalVisibilityStatesByTargetId?.get(targetId);
    if (
      predictedObservedTransitionState(observerFinalState) &&
      pendingMovementEntryVisualReachedDestination(visibilityObserver, observerEntry)
    ) {
      return true;
    }

    const targetEntry = getPendingTokenMovementEntry(targetId);
    const targetFinalState = targetEntry?.finalVisibilityStatesByObserverId?.get(observerId);
    return (
      predictedObservedTransitionState(targetFinalState) &&
      pendingMovementEntryVisualReachedDestination(visibilityTarget, targetEntry)
    );
  }

  function currentViewObservedDetectionShouldYieldToCore(observer, target) {
    if (predictedObservedMovementReachedDestination(observer, target)) return false;

    return (
      (hasPendingMovementDetectionWork() || hasPendingControlledTokenDragIntent(observer)) &&
      !currentPendingMovementSightLineSeesTarget(observer, target)
    );
  }

  function getCurrentViewObservedDetectionFilterSuppressionContext(target) {
    if (!target?.document?.id) return null;

    for (const observer of getCurrentViewObservers()) {
      const visibilityState = getPendingMovementVisibilityState(observer, target);
      if (!isStoredObservedState(visibilityState)) continue;
      if (currentViewObservedDetectionShouldYieldToCore(observer, target)) continue;

      return {
        active: true,
        observerId: tokenIdOf(observer),
        observerName: observer?.name ?? observer?.document?.name,
        targetId: tokenIdOf(target),
        targetName: target?.name ?? target?.document?.name,
        visibilityState,
        observedByVisioner: true,
        currentViewObserver: true,
      };
    }

    return null;
  }

  function suppressPendingMovementDetectionFilterVisualsForObservedTransition(
    token,
    { durationMs = 300 } = {},
  ) {
    if (!token?.document?.id) return false;
    const duration = Math.max(0, Number(durationMs) || 0);
    observedDetectionFilterSuppressionTokens.set(token, Date.now() + duration);
    return true;
  }

  function hasObservedTransitionDetectionFilterSuppression(token) {
    if (!token) return false;

    const expiresAt = observedDetectionFilterSuppressionTokens.get(token);
    if (!expiresAt) return false;
    if (expiresAt > Date.now()) return true;

    observedDetectionFilterSuppressionTokens.delete(token);
    return false;
  }

  function observedSoundwaveShouldWaitForCore(target) {
    for (const observer of getCurrentViewObservers()) {
      const visibilityState = getPendingMovementVisibilityState(observer, target);
      if (!isStoredObservedState(visibilityState)) continue;
      if (currentViewObservedDetectionShouldYieldToCore(observer, target)) return true;
    }
    return false;
  }

  function clearPredictedObservedTransitionVisuals(token) {
    if (!token?.document?.id) return false;
    if (observedSoundwaveShouldWaitForCore(token)) return false;

    restorePendingMovementTokenRendering(token, { ignoreObservedGrace: true });
    clearDetectionFilterVisuals(token);
    suppressPendingMovementDetectionFilterVisualsForObservedTransition(token);
    return true;
  }

  function clearObservedDetectionFilterVisualsForCurrentSightLine(target) {
    if (!tokenHasDetectionFilterVisual(target)) return false;
    if (!currentObservedSightLineSeesTarget(target)) return false;

    return clearPredictedObservedTransitionVisuals(target);
  }

  function clearObservedDetectionFilterVisualsForCurrentView(target) {
    if (!tokenHasDetectionFilterVisual(target)) return false;
    if (getObservedHiddenSoundwaveGraceContextForCurrentView(target)) return false;
    if (shouldAllowCoreHiddenSoundwaveForCurrentView(target)) return false;
    if (!getCurrentViewObservedDetectionFilterSuppressionContext(target)) return false;

    return clearPredictedObservedTransitionVisuals(target);
  }

  function clearPredictedObservedTransitionVisualsForCompletingMovement(tokenId, entry) {
    if (!tokenId || !entry) return false;

    const currentViewObserverIds = new Set(getCurrentViewObservers().map((observer) => tokenIdOf(observer)));
    let cleared = false;

    if (currentViewObserverIds.has(tokenId)) {
      for (const [targetId, visibilityState] of entry.finalVisibilityStatesByTargetId || []) {
        if (!predictedObservedTransitionState(visibilityState)) continue;
        cleared = clearPredictedObservedTransitionVisuals(tokenObjectForId(targetId)) || cleared;
      }
    }

    for (const [observerId, visibilityState] of entry.finalVisibilityStatesByObserverId || []) {
      if (!currentViewObserverIds.has(observerId)) continue;
      if (!predictedObservedTransitionState(visibilityState)) continue;
      cleared = clearPredictedObservedTransitionVisuals(tokenObjectForId(tokenId)) || cleared;
    }

    return cleared;
  }

  function rememberObservedHiddenSoundwaveGrace(observer, target, visibilityState) {
    if (visibilityState !== 'hidden') return false;
    if (!observer || !target?.document?.id) return false;
    if (!tokenHasDetectionFilterVisual(target)) return false;

    const storedVisibilityState = getStoredVisibilityState(observer, target);
    if (!isStoredObservedState(storedVisibilityState)) return false;
    if (currentPendingMovementSightLineSeesTarget(observer, target)) return false;

    rememberObservedHiddenSoundwaveGraceContext(observer, target, {
      storedVisibilityState,
      pendingPosition: getPendingTokenMovementPosition(tokenIdOf(observer)),
    });
    return true;
  }

  function rememberObservedHiddenSoundwaveGraceForCompletingMovement(tokenId, entry) {
    if (!tokenId || !entry) return false;

    const currentViewObserverIds = new Set(getCurrentViewObservers().map((observer) => tokenIdOf(observer)));
    let remembered = false;

    if (currentViewObserverIds.has(tokenId)) {
      const observer = tokenObjectForId(tokenId) || entry?.tokenDoc || null;
      for (const [targetId, visibilityState] of entry.finalVisibilityStatesByTargetId || []) {
        remembered =
          rememberObservedHiddenSoundwaveGrace(observer, tokenObjectForId(targetId), visibilityState) ||
          remembered;
      }
    }

    for (const [observerId, visibilityState] of entry.finalVisibilityStatesByObserverId || []) {
      if (!currentViewObserverIds.has(observerId)) continue;
      remembered =
        rememberObservedHiddenSoundwaveGrace(
          tokenObjectForId(observerId),
          tokenObjectForId(tokenId),
          visibilityState,
        ) || remembered;
    }

    return remembered;
  }

  function hasObservedHiddenSoundwaveGraceContexts() {
    return observedHiddenSoundwaveGraceContexts.size > 0;
  }

  return {
    clearObservedDetectionFilterVisualsForCurrentSightLine,
    clearObservedDetectionFilterVisualsForCurrentView,
    clearPredictedObservedTransitionVisualsForCompletingMovement,
    currentViewObservedDetectionShouldYieldToCore,
    getCurrentViewObservedDetectionFilterSuppressionContext,
    getCurrentViewObservers,
    hasObservedHiddenSoundwaveGraceContexts,
    hasObservedTransitionDetectionFilterSuppression,
    hasPendingControlledTokenDragIntentForCurrentView,
    observedSoundwaveShouldWaitForCore,
    rememberObservedHiddenSoundwaveGraceForCompletingMovement,
    predictedObservedMovementReachedDestination,
    pruneExpiredObservedHiddenSoundwaveGraceContexts,
    shouldAllowCoreHiddenSoundwaveForCurrentView,
    shouldPreserveHiddenSoundwaveForCurrentView,
    suppressPendingMovementDetectionFilterVisualsForObservedTransition,
  };
}
