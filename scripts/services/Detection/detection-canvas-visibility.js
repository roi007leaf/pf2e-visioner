import {
  getPendingMovementHiddenStateBlock,
  isPendingMovementHiddenStateVisibilityProbe,
  withPendingMovementBlockedDetectionSourcesSuppressed,
} from '../PendingMovement/pending-movement-detection-gate.js';
import {
  capturePendingMovementDetectionFilterVisualState,
  restorePendingMovementDetectionFilterVisualState,
  hasActivePendingTokenMovement,
  isPendingMovementCoreAnimationBypassActive,
  primePendingMovementDetectionFilterVisuals,
  shouldHandlePendingMovementCanvasVisibilityForToken,
  shouldForceHiddenSoundwaveCanvasVisibility,
  shouldPreservePendingMovementDetectionFilterVisuals,
  shouldPrimePendingMovementDetectionFilterVisuals,
  shouldSuppressPendingMovementDetectionFilterVisuals,
  showHiddenSoundwaveCanvasVisibilityTarget,
  withPreservedPendingMovementDetectionFilterVisuals,
  withSuppressedPendingMovementDetectionFilterVisuals,
} from '../PendingMovement/pending-movement-render-lock.js';
import { tokenHasDetectionFilterVisual } from '../PendingMovement/pending-movement-detection-filter-visuals.js';
import { shouldBypassAvsForGmVision } from '../gm-vision-bypass.js';
import { isSelectAllTokenVisibilityBypassActive } from './select-all-token-visibility-bypass.js';

function sourceFromCollectionEntry(entry) {
  return Array.isArray(entry) && entry.length === 2 ? entry[1] : entry;
}

function detectionSourceList(sources) {
  return Array.from(sources || [], sourceFromCollectionEntry);
}

function hasActiveUnblockedDetectionSource(blockedSources = []) {
  const blockedSourceSet = new Set(blockedSources);
  const activeSources = [
    ...detectionSourceList(canvas?.effects?.visionSources),
    ...detectionSourceList(canvas?.effects?.lightSources),
  ];

  return activeSources.some(
    (source) => source?.active && source?.object && !blockedSourceSet.has(source),
  );
}

export function wrapCanvasVisibilityTest(wrapped, points, options = {}) {
  if (isSelectAllTokenVisibilityBypassActive()) {
    return wrapped(points, options);
  }
  if (shouldBypassAvsForGmVision()) {
    return wrapped(points, options);
  }
  if (isPendingMovementHiddenStateVisibilityProbe()) {
    return wrapped(points, options);
  }
  const object = options?.object;
  if (isPendingMovementCoreAnimationBypassActive()) {
    if (shouldForceHiddenSoundwaveCanvasVisibility(object)) {
      withDetectionFilterVisualPolicy(object, () => wrapped(points, options));
      if (shouldPrimePendingMovementDetectionFilterVisuals(object)) {
        primePendingMovementDetectionFilterVisuals(object);
      }
      showHiddenSoundwaveCanvasVisibilityTarget(object);
      return true;
    }
    return wrapped(points, options);
  }
  if (!shouldHandlePendingMovementCanvasVisibilityForToken(object)) {
    if (shouldForceHiddenSoundwaveCanvasVisibility(object)) {
      withDetectionFilterVisualPolicy(object, () => wrapped(points, options));
      if (shouldPrimePendingMovementDetectionFilterVisuals(object)) {
        primePendingMovementDetectionFilterVisuals(object);
      }
      showHiddenSoundwaveCanvasVisibilityTarget(object);
      return true;
    }
    if (!hasActivePendingTokenMovement() && tokenHasDetectionFilterVisual(object)) {
      return withDetectionFilterVisualPolicy(object, () => wrapped(points, options));
    }
    return wrapped(points, options);
  }

  let wrappedCalled = false;
  const callWrapped = () => {
    wrappedCalled = true;
    return wrapped(points, options);
  };

  try {
    return withPendingMovementBlockedDetectionSourcesSuppressed(
      options?.object,
      (blockedSources, blockedEntries = [], hiddenStateContext = null) => {
        const probingHiddenState = isPendingMovementHiddenStateVisibilityProbe();
        const sourceHiddenStateContext =
          probingHiddenState
            ? null
            : hiddenStateContext ||
            blockedEntries.find(
              ({ context }) => context?.renderHiddenByVisioner || context?.foundryHidden,
            )?.context ||
            getPendingMovementHiddenStateBlock(options?.object);

        const detectionFilterState = capturePendingMovementDetectionFilterVisualState(object);
        const forceHiddenSoundwaveCanvasVisibility =
          shouldForceHiddenSoundwaveCanvasVisibility(object);
        const wrappedResult = withDetectionFilterVisualPolicy(object, callWrapped);
        if (forceHiddenSoundwaveCanvasVisibility) {
          const coreCreatedDetectionFilter =
            wrappedResult &&
            object?.detectionFilter &&
            object.detectionFilter !== detectionFilterState?.detectionFilter;
          if (coreCreatedDetectionFilter) return true;
          restorePendingMovementDetectionFilterVisualState(object, detectionFilterState);
          if (shouldPrimePendingMovementDetectionFilterVisuals(object)) {
            primePendingMovementDetectionFilterVisuals(object);
          }
          showHiddenSoundwaveCanvasVisibilityTarget(object);
          return true;
        }
        if (sourceHiddenStateContext) {
          restorePendingMovementDetectionFilterVisualState(object, detectionFilterState);
          return false;
        }

        if (
          wrappedResult &&
          blockedSources?.length &&
          !hasActiveUnblockedDetectionSource(blockedSources)
        ) {
          restorePendingMovementDetectionFilterVisualState(object, detectionFilterState);
          return false;
        }

        return wrappedResult;
      },
    );
  } catch (error) {
    if (wrappedCalled) throw error;
    return callWrapped();
  }
}

function withDetectionFilterVisualPolicy(object, callWrapped) {
  const suppressDetectionFilterVisuals =
    shouldSuppressPendingMovementDetectionFilterVisuals(object);
  const preserveDetectionFilterVisuals =
    !suppressDetectionFilterVisuals &&
    shouldPreservePendingMovementDetectionFilterVisuals(object);

  if (suppressDetectionFilterVisuals) {
    return withSuppressedPendingMovementDetectionFilterVisuals(object, callWrapped);
  }
  if (preserveDetectionFilterVisuals) {
    return withPreservedPendingMovementDetectionFilterVisuals(object, callWrapped);
  }
  return callWrapped();
}
