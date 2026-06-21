import { MODULE_ID } from '../../constants.js';
import {
  getPendingMovementHiddenStateBlock,
  isPendingMovementHiddenStateVisibilityProbe,
  pairAllowsLiveImpreciseSoundwave,
  withPendingMovementBlockedDetectionSourcesSuppressed,
} from '../PendingMovement/pending-movement-detection-gate.js';
import { NON_VISUAL_DETECTION_MODE_IDS } from './detection-visibility-context.js';
import {
  capturePendingMovementDetectionFilterVisualState,
  restorePendingMovementDetectionFilterVisualState,
  hasActivePendingTokenMovement,
  isPendingMovementCoreAnimationBypassActive,
  shouldHandlePendingMovementCanvasVisibilityForToken,
  shouldPreservePendingMovementDetectionFilterVisuals,
  shouldSuppressPendingMovementDetectionFilterVisuals,
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

function observerHasEnabledNonVisualDetectionMode(observer) {
  const modes = observer?.document?.detectionModes;
  if (!modes) return false;
  const entries = Array.isArray(modes)
    ? modes.map((mode) => [mode?.id, mode])
    : Object.entries(modes);
  return entries.some(([id, mode]) => !!mode?.enabled && NON_VISUAL_DETECTION_MODE_IDS.has(id));
}

function impreciseSenseDetectionFilter() {
  try {
    return CONFIG?.Canvas?.detectionModes?.hearing?.constructor?.getDetectionFilter?.() ?? null;
  } catch {
    return null;
  }
}

function impreciseSenseFallbackDetects(object) {
  try {
    if (!object?.document) return false;
    if (object.document.getFlag?.(MODULE_ID, 'sneak-active')) return false;
    for (const entry of canvas?.effects?.visionSources ?? []) {
      const source = sourceFromCollectionEntry(entry);
      const observer = source?.object;
      if (!source?.active || !observer || observer === object) continue;
      if (observerHasEnabledNonVisualDetectionMode(observer)) continue;
      if (pairAllowsLiveImpreciseSoundwave(observer, object)) return true;
    }
  } catch {
    /* best-effort */
  }
  return false;
}

function applyImpreciseSenseFallbackDetection(object) {
  if (!impreciseSenseFallbackDetects(object)) return false;
  const detectionFilter = impreciseSenseDetectionFilter();
  if (detectionFilter) object.detectionFilter = detectionFilter;
  return true;
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
  if (isPendingMovementCoreAnimationBypassActive()) {
    return wrapped(points, options) || applyImpreciseSenseFallbackDetection(options?.object);
  }
  const object = options?.object;
  if (!shouldHandlePendingMovementCanvasVisibilityForToken(object)) {
    if (!hasActivePendingTokenMovement() && tokenHasDetectionFilterVisual(object)) {
      return (
        withDetectionFilterVisualPolicy(object, () => wrapped(points, options)) ||
        applyImpreciseSenseFallbackDetection(object)
      );
    }
    return wrapped(points, options) || applyImpreciseSenseFallbackDetection(object);
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
        const wrappedResult = withDetectionFilterVisualPolicy(object, callWrapped);
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

        return wrappedResult || applyImpreciseSenseFallbackDetection(object);
      },
    );
  } catch (error) {
    if (wrappedCalled) throw error;
    return callWrapped();
  }
}

export function wrapCanvasVisibilityRestrictVisibility(wrapped, ...args) {
  return wrapped(...args);
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
