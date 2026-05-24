import {
  getPendingMovementHiddenStateBlock,
  isPendingMovementHiddenStateVisibilityProbe,
  withPendingMovementBlockedDetectionSourcesSuppressed,
} from '../PendingMovement/pending-movement-detection-gate.js';
import {
  capturePendingMovementDetectionFilterVisualState,
  restorePendingMovementDetectionFilterVisualState,
  shouldHandlePendingMovementCanvasVisibilityForToken,
  shouldPreservePendingMovementDetectionFilterVisuals,
  shouldSuppressPendingMovementDetectionFilterVisuals,
  withPreservedPendingMovementDetectionFilterVisuals,
  withSuppressedPendingMovementDetectionFilterVisuals,
} from '../PendingMovement/pending-movement-render-lock.js';

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
  if (isPendingMovementHiddenStateVisibilityProbe()) {
    return wrapped(points, options);
  }
  if (!shouldHandlePendingMovementCanvasVisibilityForToken(options?.object)) {
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

        const object = options?.object;
        const detectionFilterState = capturePendingMovementDetectionFilterVisualState(object);
        const suppressDetectionFilterVisuals =
          shouldSuppressPendingMovementDetectionFilterVisuals(object);
        const preserveDetectionFilterVisuals =
          !suppressDetectionFilterVisuals &&
          shouldPreservePendingMovementDetectionFilterVisuals(object);
        const wrappedResult = suppressDetectionFilterVisuals
          ? withSuppressedPendingMovementDetectionFilterVisuals(object, callWrapped)
          : preserveDetectionFilterVisuals
            ? withPreservedPendingMovementDetectionFilterVisuals(object, callWrapped)
            : callWrapped();
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
