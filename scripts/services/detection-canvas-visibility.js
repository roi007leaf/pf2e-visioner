import {
  getPendingMovementHiddenStateBlock,
  isPendingMovementHiddenStateVisibilityProbe,
  withPendingMovementBlockedDetectionSourcesSuppressed,
} from './pending-movement-detection-gate.js';

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
                ({ context }) => context?.hiddenByVisioner || context?.foundryHidden,
              )?.context ||
              getPendingMovementHiddenStateBlock(options?.object);

        const wrappedResult = callWrapped();
        if (sourceHiddenStateContext) {
          return false;
        }

        if (
          wrappedResult &&
          blockedSources?.length &&
          !hasActiveUnblockedDetectionSource(blockedSources)
        ) {
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
