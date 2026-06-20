import {
  contextBlocksPendingDetection,
  DETECTION_BLOCKING_VISIBILITY_STATES,
  getPendingMovementBlockContext,
  getPendingMovementBlockedDetectionEntries,
  getPendingMovementHiddenStateContext,
  isPendingMovementCoreAnimationBypassActive,
  isPendingMovementCoreAnimationPerceptionRefresh,
  isPendingMovementHiddenStateVisibilityProbe,
  pairAllowsLiveImpreciseSoundwave,
  pendingObserverCanSenseTargetImprecisely,
  shouldBypassPendingMovementVisionerRenderState,
  shouldUseCoreDetectionDuringPendingMovement,
  withSuppressedDetectionSources,
} from './pending-token-movement.js';

export {
  isPendingMovementHiddenStateVisibilityProbe,
  isPendingMovementCoreAnimationBypassActive,
  isPendingMovementCoreAnimationPerceptionRefresh,
  pairAllowsLiveImpreciseSoundwave,
  pendingObserverCanSenseTargetImprecisely,
  shouldBypassPendingMovementVisionerRenderState,
  shouldUseCoreDetectionDuringPendingMovement,
};

export function shouldTemporarilyBlockHiddenDetection(observer, target, visibilityState) {
  if (!DETECTION_BLOCKING_VISIBILITY_STATES.has(visibilityState)) return false;

  return shouldTemporarilyBlockSightDetection(observer, target);
}

export function shouldTemporarilyBlockSightDetection(observer, target) {
  const context = getPendingMovementBlockContext(observer, target);
  if (!context.active) return false;

  return contextBlocksPendingDetection(context);
}

export function getPendingMovementBlockedDetectionSources(target, options = {}) {
  const blockedEntries = getPendingMovementBlockedDetectionEntries(target, options);
  return blockedEntries.map(({ source }) => source);
}

export function withPendingMovementBlockedDetectionSourcesSuppressed(target, callback) {
  const blockedEntries = getPendingMovementBlockedDetectionEntries(target);
  const suppressedEntries = blockedEntries.filter(
    ({ source }) => !shouldUseCoreDetectionDuringPendingMovement(source?.object, target),
  );
  const blockedSources = suppressedEntries.map(({ source }) => source);
  return withSuppressedDetectionSources(
    blockedSources,
    () =>
      callback?.(
        blockedSources,
        suppressedEntries,
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
