/**
 * Visibility map store and helpers
 */

import { MODULE_ID } from '../constants.js';
import { getBestVisibilityState, getControlledObserverTokens } from '../utils.js';
import { getLogger } from '../utils/logger.js';
import { autoVisibilitySystem } from '../visibility/auto-visibility/index.js';
import { updateEphemeralEffectsForVisibility } from '../visibility/ephemeral.js';
import {
  DEFAULT_PERCEPTION_PROFILE,
  legacyVisibilityToProfile,
  normalizePerceptionProfile,
  profileToLegacyVisibility,
} from '../visibility/perception-profile.js';
import { waitForTokenDocumentUpdateSafe } from './document-update-guard.js';
import {
  currentPendingMovementSightLineSeesTarget,
  getPendingMovementObserverIds,
  hasActivePendingTokenMovement,
  hasPendingMovementRenderWork,
  isPendingMovementDragPreviewOnlyActive,
  primePendingMovementDetectionFilterVisuals,
  shouldPrimePendingMovementDetectionFilterVisuals,
  shouldSuppressPendingMovementDetectionFilterVisuals,
  suppressPendingMovementDetectionFilterVisualsForObservedTransition,
} from '../services/PendingMovement/pending-movement-render-lock.js';
import {
  areTokenFlagValuesEqual,
  applyTokenFlagUpdatePasses,
  getTokenDocument,
  getTokenId,
  noRenderUpdateOptions,
} from './token-flag-map-persistence.js';
import {
  buildPerceptionProfileFlagUpdatePasses,
  getDocumentPerceptionProfileMap,
  getRawPerceptionProfileEntry,
  getRawPerceptionProfileMap,
  isDefaultPerceptionProfile as isDefaultProfile,
  isForcedDeletionValue,
  normalizePerceptionProfileMap,
  rememberPendingPerceptionProfileWrite,
  setPerceptionProfileFlag,
} from './visibility-profile-flag-persistence.js';

export {
  VISIBILITY_V2_FLAG,
  normalizePerceptionProfileMap,
} from './visibility-profile-flag-persistence.js';

const log = getLogger('AVS/VisibilityMap');
export const AVS_EXPLICIT_VISIBLE_DETECTION_SENSE = 'avs-visible';
const DETECTION_FILTER_VISUAL_RETRY_DELAYS_MS = Object.freeze([
  0,
  16,
  ...Array.from({ length: 88 }, (_value, index) => 25 + index * 25),
]);
const DETECTION_FILTER_VISUAL_RETRY_DURATION_MS =
  DETECTION_FILTER_VISUAL_RETRY_DELAYS_MS[DETECTION_FILTER_VISUAL_RETRY_DELAYS_MS.length - 1];
const KNOWN_LEGACY_VISIBILITY_STATES = new Set([
  'observed',
  'concealed',
  'hidden',
  'undetected',
  'unnoticed',
]);

function isKnownLegacyVisibilityState(state) {
  return KNOWN_LEGACY_VISIBILITY_STATES.has(state);
}

function profilesToLegacyVisibilityMap(profileMap = {}, options = {}) {
  const visibilityMap = {};
  for (const [id, profile] of Object.entries(normalizePerceptionProfileMap(profileMap))) {
    const legacyState = profileToLegacyVisibility(profile, options);
    if (!legacyState || legacyState === 'observed') continue;
    visibilityMap[id] = legacyState;
  }
  return visibilityMap;
}

function legacyVisibilityMapToProfiles(visibilityMap = {}, previousProfiles = {}, options = {}) {
  const profileMap = {};

  for (const [id, state] of Object.entries(
    normalizeVisibilityMap(visibilityMap, { includeObserved: options.preserveObserved === true }),
  )) {
    if (!isKnownLegacyVisibilityState(state)) continue;

    const previousProfile = previousProfiles?.[id];
    if (
      previousProfile &&
      profileToLegacyVisibility(previousProfile, { preserveEncounterUnnoticed: true }) === state
    ) {
      profileMap[id] = normalizePerceptionProfile(previousProfile);
      continue;
    }

    profileMap[id] = legacyVisibilityToProfile(
      state,
      state === 'observed' && options.preserveObserved === true
        ? { detectionSense: AVS_EXPLICIT_VISIBLE_DETECTION_SENSE }
        : {},
    );
  }

  return profileMap;
}

export function normalizeVisibilityMap(map = {}, options = {}) {
  const normalized = {};

  for (const [id, state] of Object.entries(map ?? {})) {
    if (!id) continue;
    if (id.startsWith?.('-=')) continue;
    if (!state) continue;
    if (state === 'observed' && options.includeObserved !== true) continue;
    if (isForcedDeletionValue(state)) continue;
    normalized[id] = state;
  }

  return normalized;
}

function buildVisibilityMapDiff(previousMap = {}, nextMap = {}) {
  const ids = new Set([...Object.keys(previousMap ?? {}), ...Object.keys(nextMap ?? {})]);
  const changes = [];

  for (const id of ids) {
    const before = previousMap?.[id] ?? 'observed';
    const after = nextMap?.[id] ?? 'observed';
    if (before === after) continue;

    const target = canvas?.tokens?.get?.(id);
    changes.push({
      targetId: id,
      targetName: target?.name ?? target?.document?.name ?? id,
      from: before,
      to: after,
    });
  }

  return changes;
}

function tokenObjectById(tokenId) {
  if (!tokenId) return null;
  return (
    canvas?.tokens?.get?.(tokenId) ||
    canvas?.tokens?.placeables?.find?.((token) => getTokenId(token) === tokenId) ||
    null
  );
}

function getCurrentViewObserverIds() {
  const ids = new Set();
  const addToken = (token) => {
    const id = getTokenId(token);
    if (id) ids.add(id);
  };

  addToken(canvas?.tokens?._draggedToken);
  for (const token of canvas?.tokens?.controlled || []) {
    addToken(token);
  }
  for (const id of getPendingMovementObserverIds()) {
    if (id) ids.add(id);
  }

  return ids;
}

function shouldClearObservedDetectionFilterForChange(change) {
  const viewObserverIds = getCurrentViewObserverIds();
  if (viewObserverIds.size === 0) return true;
  if (!change?.observerId) return true;
  if (!viewObserverIds.has(change.observerId)) return false;
  if (!hasPendingMovementRenderWork()) return true;

  const observer = tokenObjectById(change.observerId);
  const target = tokenObjectById(change.targetId);
  if (!observer || !target) return true;
  return currentPendingMovementSightLineSeesTarget(observer, target);
}

function clearDetectionFilterVisuals(token) {
  if (!token) return;
  if (
    (isPendingMovementDragPreviewOnlyActive() ||
      (canvas?.tokens?.placeables || []).some((placeable) => placeable?.isDragged)) &&
    globalThis.__pf2eVisionerHasActivePendingTokenMovement !== true
  ) {
    return;
  }

  try {
    token.detectionFilter = null;
  } catch {
    /* best-effort filter clear */
  }

  const detectionFilterMesh = token.detectionFilterMesh;
  if (detectionFilterMesh) {
    try {
      if ('visible' in detectionFilterMesh) detectionFilterMesh.visible = false;
      if ('renderable' in detectionFilterMesh) detectionFilterMesh.renderable = false;
      if ('alpha' in detectionFilterMesh) detectionFilterMesh.alpha = 0;
    } catch {
      /* best-effort filter mesh clear */
    }
  }

  if (token._pvHiddenEcho) {
    try {
      if ('visible' in token._pvHiddenEcho) token._pvHiddenEcho.visible = false;
    } catch {
      /* best-effort hidden echo clear */
    }
  }
}

function tokenHasDetectionFilterMeshVisual(token) {
  const mesh = token?.detectionFilterMesh;
  if (!mesh) return false;

  const alpha = Number(mesh.alpha);
  const activeSignal =
    mesh.visible === true ||
    mesh.renderable === true ||
    (Number.isFinite(alpha) && alpha > 0);
  const hiddenSignal =
    mesh.visible === false ||
    mesh.renderable === false ||
    (Number.isFinite(alpha) && alpha <= 0);

  return activeSignal && !hiddenSignal;
}

function tokenHasDetectionFilterVisual(token) {
  return (
    !!token?.detectionFilter ||
    tokenHasDetectionFilterMeshVisual(token) ||
    !!token?._pvHiddenEcho
  );
}

function clearObservedDetectionFilterVisualsForChanges(changes = []) {
  for (const change of changes) {
    if (change?.to !== 'observed' && change?.to !== 'concealed') continue;
    if (!shouldClearObservedDetectionFilterForChange(change)) continue;
    const target = tokenObjectById(change.targetId);
    clearDetectionFilterVisuals(target);
    suppressPendingMovementDetectionFilterVisualsForObservedTransition(target);
  }
}

function scheduleObservedDetectionFilterVisualClears(changes = []) {
  if (isPendingMovementDragPreviewOnlyActive()) return;
  const observedChanges = changes.filter(
    (change) => change?.to === 'observed' || change?.to === 'concealed',
  );
  if (!observedChanges.length) return;

  clearObservedDetectionFilterVisualsForChanges(observedChanges);
  refreshDetectionFilterVisualsForCurrentRenderDecision();
  scheduleDetectionFilterVisualFrameRetries(() => {
    if (isPendingMovementDragPreviewOnlyActive()) return;
    clearObservedDetectionFilterVisualsForChanges(observedChanges);
    refreshDetectionFilterVisualsForCurrentRenderDecision();
  });
  for (const delayMs of DETECTION_FILTER_VISUAL_RETRY_DELAYS_MS) {
    setTimeout(() => {
      if (isPendingMovementDragPreviewOnlyActive()) return;
      clearObservedDetectionFilterVisualsForChanges(observedChanges);
    }, delayMs);
  }
}

function visibilityTestPointsForToken(token) {
  const documentPoints = token?.document?.getVisibilityTestPoints?.();
  if (Array.isArray(documentPoints) && documentPoints.length) return documentPoints;

  const centerPoint = token?.center || token?.getCenterPoint?.();
  return centerPoint ? [centerPoint] : [];
}

function centerForToken(token) {
  const doc = getTokenDocument(token);
  if (!doc) return null;
  const gridSize = Number(canvas?.grid?.size ?? 0);
  return {
    x: Number(doc.x ?? token?.x ?? 0) + Number(doc.width ?? 1) * gridSize / 2,
    y: Number(doc.y ?? token?.y ?? 0) + Number(doc.height ?? 1) * gridSize / 2,
  };
}

function lineIntersectsSightOnlySoundOpenWall(origin, target) {
  if (!origin || !target) return false;
  const intersects = foundry?.utils?.lineSegmentIntersects;
  if (typeof intersects !== 'function') return false;

  return (canvas?.walls?.placeables || []).some((wall) => {
    const doc = wall?.document ?? wall;
    const c = doc?.c;
    if (!Array.isArray(c) || c.length < 4) return false;
    if (Number(doc?.sight ?? 0) <= 0 || Number(doc?.sound) !== 0) return false;
    return !!intersects(origin, target, { x: c[0], y: c[1] }, { x: c[2], y: c[3] });
  });
}

function hasActiveVisionSourceForObserver(observer) {
  const observerId = getTokenId(observer);
  if (!observerId) return false;
  const sources = Array.from(canvas?.effects?.visionSources || [], (entry) =>
    Array.isArray(entry) ? entry[1] : entry,
  );
  return sources.some((source) => source?.active !== false && getTokenId(source?.object) === observerId);
}

function shouldPrimeHiddenDetectionFilterForObserver(observer, target) {
  if (!hasActiveVisionSourceForObserver(observer)) return true;
  if (!currentPendingMovementSightLineSeesTarget(observer, target)) return true;
  return lineIntersectsSightOnlySoundOpenWall(centerForToken(observer), centerForToken(target));
}

function refreshCoreDetectionFilterForHiddenTarget(target) {
  const testVisibility = canvas?.visibility?.testVisibility;
  if (!target || typeof testVisibility !== 'function') return false;

  const points = visibilityTestPointsForToken(target);
  if (!points.length) return false;

  try {
    testVisibility.call(canvas.visibility, points, { object: target });
    return !!target.detectionFilter;
  } catch {
    return false;
  }
}

function primeHiddenDetectionFilterVisuals(target) {
  if (!target || tokenHasDetectionFilterMeshVisual(target) || target._pvHiddenEcho) return false;

  const detectionFilterMesh = target.detectionFilterMesh;
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

function shouldRefreshHiddenDetectionFilterTarget(change = {}) {
  if (!hasActivePendingTokenMovement()) return true;
  const pendingObserverIds = getPendingMovementObserverIds();
  if (change?.targetId && pendingObserverIds.includes(change.targetId)) return false;
  if (!change?.observerId) return false;
  return !pendingObserverIds.includes(change.observerId);
}

function hiddenDetectionFilterChangeStillApplies(change, target) {
  if (change?.to !== 'hidden' || !target) return false;
  const observerId = change?.observerId;
  if (!observerId) return true;

  const observer = tokenObjectById(observerId);
  if (!observer) return false;
  if (getVisibilityBetween(observer, target) !== 'hidden') return false;
  return shouldPrimeHiddenDetectionFilterForObserver(observer, target);
}

function refreshHiddenDetectionFilterVisualsForChanges(changes = []) {
  for (const change of changes) {
    const target = tokenObjectById(change.targetId);
    if (!hiddenDetectionFilterChangeStillApplies(change, target)) continue;
    if (!target || tokenHasDetectionFilterMeshVisual(target) || target._pvHiddenEcho) continue;
    refreshCoreDetectionFilterForHiddenTarget(target);
    if (tokenHasDetectionFilterMeshVisual(target) || target._pvHiddenEcho) continue;

    try {
      primeHiddenDetectionFilterVisuals(target);
      if (shouldRefreshHiddenDetectionFilterTarget(change)) target.refresh?.();
      primeHiddenDetectionFilterVisuals(target);
    } catch {
      /* best-effort immediate hidden visual refresh */
    }
  }
}

function refreshHiddenDetectionFilterVisualsForCurrentObservers({ allowTokenRefresh = false } = {}) {
  const observers = getControlledObserverTokens();
  if (!observers.length) return;

  for (const observer of observers) {
    const observerId = getTokenId(observer);
    if (!observerId) continue;
    for (const target of canvas?.tokens?.placeables || []) {
      const targetId = getTokenId(target);
      if (!targetId || targetId === observerId) continue;
      if (getVisibilityBetween(observer, target) !== 'hidden') continue;
      if (!shouldPrimeHiddenDetectionFilterForObserver(observer, target)) {
        clearDetectionFilterVisuals(target);
        continue;
      }
      refreshCoreDetectionFilterForHiddenTarget(target);
      primeHiddenDetectionFilterVisuals(target);
      if (
        allowTokenRefresh &&
        !hasActivePendingTokenMovement() &&
        !target?.detectionFilter &&
        !target._pvHiddenEcho
      ) {
        try {
          target.refresh?.();
          primeHiddenDetectionFilterVisuals(target);
        } catch {
          /* best-effort current hidden visual refresh */
        }
      }
    }
  }
}

function refreshDetectionFilterVisualsForCurrentRenderDecision() {
  if (isPendingMovementDragPreviewOnlyActive()) return;
  if (!canvas?.tokens?._draggedToken && !(canvas?.tokens?.controlled || []).length) return;
  for (const token of canvas?.tokens?.placeables || []) {
    if (shouldSuppressPendingMovementDetectionFilterVisuals(token)) {
      clearDetectionFilterVisuals(token);
      continue;
    }
    if (shouldPrimePendingMovementDetectionFilterVisuals(token)) {
      primePendingMovementDetectionFilterVisuals(token);
    }
  }
}

function scheduleHiddenDetectionFilterVisualRefreshes(changes = []) {
  if (isPendingMovementDragPreviewOnlyActive()) return;
  const hiddenChanges = changes.filter((change) => change?.to === 'hidden');
  if (!hiddenChanges.length) return;

  refreshHiddenDetectionFilterVisualsForChanges(hiddenChanges);
  refreshHiddenDetectionFilterVisualsForCurrentObservers();
  refreshDetectionFilterVisualsForCurrentRenderDecision();
  scheduleDetectionFilterVisualFrameRetries(() => {
    if (isPendingMovementDragPreviewOnlyActive()) return;
    refreshHiddenDetectionFilterVisualsForChanges(hiddenChanges);
    refreshHiddenDetectionFilterVisualsForCurrentObservers();
    refreshDetectionFilterVisualsForCurrentRenderDecision();
  });
  for (const delayMs of DETECTION_FILTER_VISUAL_RETRY_DELAYS_MS) {
    setTimeout(() => {
      if (isPendingMovementDragPreviewOnlyActive()) return;
      refreshHiddenDetectionFilterVisualsForChanges(hiddenChanges);
      refreshHiddenDetectionFilterVisualsForCurrentObservers();
    }, delayMs);
  }
}

function scheduleDetectionFilterVisualFrameRetries(callback) {
  if (typeof callback !== 'function') return;
  const startedAt = Date.now();
  const scheduleFrame =
    typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (frameCallback) => setTimeout(frameCallback, 16);
  const tick = () => {
    callback();
    if (Date.now() - startedAt >= DETECTION_FILTER_VISUAL_RETRY_DURATION_MS) return;
    scheduleFrame(tick);
  };
  scheduleFrame(tick);
}

function refreshHiddenDetectionFilterVisualsForPair(observer, target, state) {
  if (state !== 'hidden' || !target) return;
  const refresh = () => {
    if (observer && getVisibilityBetween(observer, target) !== 'hidden') return;
    refreshHiddenDetectionFilterVisualsForChanges([
      {
        targetId: getTokenId(target),
        targetName: target?.name ?? getTokenDocument(target)?.name ?? getTokenId(target),
        observerId: getTokenId(observer),
        to: 'hidden',
      },
    ]);
  };

  refresh();
  for (const delayMs of DETECTION_FILTER_VISUAL_RETRY_DELAYS_MS) {
    setTimeout(() => {
      if (isPendingMovementDragPreviewOnlyActive()) return;
      refresh();
    }, delayMs);
  }
}

export function buildVisibilityMapDocumentUpdatePasses(token, visibilityMap, options = {}) {
  const nextMap = normalizeVisibilityMap(visibilityMap, {
    includeObserved: options?.preserveObserved === true,
  });
  const previousProfiles = getPerceptionProfileMap(token);
  const nextProfiles = legacyVisibilityMapToProfiles(nextMap, previousProfiles, {
    preserveObserved: options?.preserveObserved === true,
  });
  return buildPerceptionProfileFlagUpdatePasses(token, nextProfiles);
}

function visibilityMapValueFor(visibilityMap = {}, targetId) {
  if (!targetId) return 'observed';
  return visibilityMap?.[targetId] ?? 'observed';
}

function collectVisibilityReadbackTargetIds(previousMap = {}, nextMap = {}) {
  return Array.from(new Set([
    ...Object.keys(previousMap ?? {}),
    ...Object.keys(nextMap ?? {}),
  ]));
}

function hasVisibilityReadbackMismatch(token, visibilityMap = {}, targetIds = []) {
  const actualMap = getVisibilityMap(token);
  return targetIds.some(
    (targetId) =>
      visibilityMapValueFor(actualMap, targetId) !==
      visibilityMapValueFor(visibilityMap, targetId),
  );
}

async function repairStaleVisibilityBatchReadback(entries = [], options = {}) {
  const staleEntries = entries.filter(({ token, visibilityMap, targetIds }) =>
    hasVisibilityReadbackMismatch(token, visibilityMap, targetIds),
  );
  if (!staleEntries.length) return 0;

  await Promise.all(
    staleEntries.map(({ token, visibilityMap }) => setVisibilityMap(token, visibilityMap, options)),
  );
  return staleEntries.length;
}

export async function setVisibilityMapsBatch(entries = [], options = {}) {
  if (!game.user.isGM || entries.length === 0) return { written: 0 };

  const updatePasses = [];
  const tokensToWaitFor = [];
  const readbackEntries = [];

  for (const entry of entries) {
    const token = entry?.token;
    if (!getTokenDocument(token)) continue;
    const previousMap = getVisibilityMap(token);
    const nextMap = normalizeVisibilityMap(entry.visibilityMap ?? {}, {
      includeObserved: options?.preserveObserved === true,
    });
    const previousProfiles = getPerceptionProfileMap(token);
    const nextProfiles = legacyVisibilityMapToProfiles(nextMap, previousProfiles, {
      preserveObserved: options?.preserveObserved === true,
    });
    const removedProfileTargetIds = Object.keys(previousProfiles).filter(
      (id) => !(id in nextProfiles),
    );
    tokensToWaitFor.push(token);
    const observerId = getTokenId(token);
    const observerName = token?.name ?? getTokenDocument(token)?.name ?? observerId;
    readbackEntries.push({
      token,
      visibilityMap: entry.visibilityMap ?? {},
      targetIds: collectVisibilityReadbackTargetIds(
        previousMap,
        entry.visibilityMap ?? {},
      ),
      changes: buildVisibilityMapDiff(previousMap, nextMap).map((change) => ({
        ...change,
        observerId,
        observerName,
      })),
    });

    const passes = buildVisibilityMapDocumentUpdatePasses(token, entry.visibilityMap, options);
    rememberPendingPerceptionProfileWrite(token, nextProfiles, {
      removedTargetIds: removedProfileTargetIds,
    });
    passes.forEach((updates, index) => {
      if (!updatePasses[index]) updatePasses[index] = [];
      updatePasses[index].push(...updates);
    });
  }

  for (const entry of readbackEntries) {
    scheduleObservedDetectionFilterVisualClears(entry.changes);
    scheduleHiddenDetectionFilterVisualRefreshes(entry.changes);
  }
  refreshHiddenDetectionFilterVisualsForCurrentObservers({ allowTokenRefresh: true });

  const result = await applyTokenFlagUpdatePasses({
    updatePasses,
    tokensToWaitFor,
    waitForToken: waitForTokenDocumentUpdateSafe,
    scene: canvas?.scene,
    updateOptions: noRenderUpdateOptions(),
    fallback: async () => Promise.all(
      entries.map((entry) => setVisibilityMap(entry.token, entry.visibilityMap, options)),
    ),
  });
  for (const entry of readbackEntries) {
    scheduleObservedDetectionFilterVisualClears(entry.changes);
    scheduleHiddenDetectionFilterVisualRefreshes(entry.changes);
  }
  refreshHiddenDetectionFilterVisualsForCurrentObservers({ allowTokenRefresh: true });
  const repaired = await repairStaleVisibilityBatchReadback(readbackEntries, options);
  return { ...result, repaired };
}

/**
 * Get the visibility map for a token
 * @param {Token} token
 * @returns {Record<string,string>}
 */
export function getVisibilityMap(token) {
  const profileLegacyMap = profilesToLegacyVisibilityMap(getRawPerceptionProfileMap(token), {
    preserveEncounterUnnoticed: true,
  });
  return profileLegacyMap;
}

export function getDocumentVisibilityMap(token) {
  const profileLegacyMap = profilesToLegacyVisibilityMap(getDocumentPerceptionProfileMap(token), {
    preserveEncounterUnnoticed: true,
  });
  return profileLegacyMap;
}

/**
 * Get the canonical perception profile map for a token.
 * @param {Token} token
 * @returns {Record<string, import('../visibility/perception-profile.js').DEFAULT_PERCEPTION_PROFILE>}
 */
export function getPerceptionProfileMap(token) {
  return getRawPerceptionProfileMap(token);
}

/**
 * Persist the visibility map for a token
 * @param {Token} token
 * @param {Record<string,string>} visibilityMap
 */
export async function setVisibilityMap(token, visibilityMap, options = {}) {
  const document = getTokenDocument(token);
  if (!document) return;
  // Only GMs can update token documents
  if (!game.user.isGM) {
    console.warn('PF2E Visioner | setVisibilityMap: Not GM, skipping visibility map update');
    return;
  }

  const previousMap = getVisibilityMap(token);
  const nextMap = normalizeVisibilityMap(visibilityMap, {
    includeObserved: options?.preserveObserved === true,
  });
  const changes = buildVisibilityMapDiff(previousMap, nextMap);
  const observerId = getTokenId(token);
  const observerName = token?.name ?? document?.name ?? observerId;
  const observedClearChanges = changes.map((change) => ({
    ...change,
    observerId,
    observerName,
  }));
  if (changes.length) {
    log.debug(() => ({
      msg: 'persist-visibility-map',
      observerId: document.id,
      observerName: token.name ?? document.name ?? document.id,
      changeCount: changes.length,
      changes,
    }));
  }

  const previousProfiles = getPerceptionProfileMap(token);
  const nextProfiles = legacyVisibilityMapToProfiles(nextMap, previousProfiles, {
    preserveObserved: options?.preserveObserved === true,
  });
  scheduleObservedDetectionFilterVisualClears(observedClearChanges);
  scheduleHiddenDetectionFilterVisualRefreshes(observedClearChanges);
  const result = await setPerceptionProfileFlag(token, nextProfiles, options);
  scheduleHiddenDetectionFilterVisualRefreshes(observedClearChanges);
  return result;
}

/**
 * Persist the canonical perception profile map for a token.
 * @param {Token} token
 * @param {Record<string, Object>} profileMap
 * @param {{syncLegacy?: boolean, preserveEncounterUnnoticed?: boolean}} options
 */
export async function setPerceptionProfileMap(token, profileMap, options = {}) {
  const document = getTokenDocument(token);
  if (!document) return;
  if (!game.user.isGM) {
    console.warn('PF2E Visioner | setPerceptionProfileMap: Not GM, skipping visibility map update');
    return;
  }

  const nextProfiles = normalizePerceptionProfileMap(profileMap);
  return setPerceptionProfileFlag(token, nextProfiles, options);
}

/**
 * Read visibility state between two tokens
 * @param {Token} observer
 * @param {Token} target
 */
export function getVisibilityBetween(observer, target) {
  const targetId = getTokenId(target);
  const profile = getRawPerceptionProfileEntry(observer, targetId);
  if (!profile) return 'observed';
  return profileToLegacyVisibility(profile, { preserveEncounterUnnoticed: true }) || 'observed';
}

/**
 * Read the canonical perception profile between two tokens.
 * @param {Token} observer
 * @param {Token} target
 */
export function getPerceptionProfileBetween(observer, target) {
  return getRawPerceptionProfileEntry(observer, getTokenId(target)) || {
    ...DEFAULT_PERCEPTION_PROFILE,
  };
}

async function applyVisibilitySideEffects(observer, target, state, options = {}) {
  // Skip ephemeral effects for socket-triggered processing to avoid permission errors
  // or if explicitly requested
  if (options.skipEphemeralUpdate || options.fromSocket) {
    return;
  }

  // Always evaluate ephemeral effects, even if state hasn't changed
  // This is important when suppression flags change (e.g., Blind-Fight added/removed)
  // Check if off-guard effects should be suppressed for this visibility state
  // The suppression is on the OBSERVER (the one with Blind-Fight feat)
  const { OffGuardSuppression } = await import(
    '../rule-elements/operations/OffGuardSuppression.js'
  );
  if (OffGuardSuppression.shouldSuppressOffGuardForState(observer, state, target)) {
    // Remove any existing off-guard effects
    try {
      if (autoVisibilitySystem) {
        autoVisibilitySystem.setUpdatingEffects(true);
      }
      // Force removal of all ephemeral effects for this pair when suppression is active
      await updateEphemeralEffectsForVisibility(observer, target, state, {
        ...options,
        removeAllEffects: true,
      });
    } catch (error) {
      console.error('PF2E Visioner: Error removing off-guard effects:', error);
    } finally {
      if (autoVisibilitySystem) {
        autoVisibilitySystem.setUpdatingEffects(false);
      }
    }
    return;
  }

  // Apply ephemeral effects if not suppressed
  try {
    // Set flag to prevent auto-visibility system from reacting to its own effect changes
    if (autoVisibilitySystem) {
      autoVisibilitySystem.setUpdatingEffects(true);
    }

    await updateEphemeralEffectsForVisibility(observer, target, state, options);
  } catch (error) {
    console.error('PF2E Visioner: Error updating off-guard effects:', error);
  } finally {
    // Always clear the flag, even if there was an error
    if (autoVisibilitySystem) {
      autoVisibilitySystem.setUpdatingEffects(false);
    }
  }
}

function notifyVisibilityMapUpdated(observer, target, state, options = {}) {
  try {
    const observerId = getTokenId(observer);
    const targetId = getTokenId(target);
    Hooks.callAll?.('pf2e-visioner.visibilityMapUpdated', {
      observerId,
      targetId,
      state,
      direction: options.direction || 'observer_to_target',
    });
  } catch (_) { }
}

function logVisibilityPairChange(observer, target, from, to, options = {}) {
  const observerId = getTokenId(observer);
  const targetId = getTokenId(target);
  const observerDocument = getTokenDocument(observer);
  const targetDocument = getTokenDocument(target);
  log.debug(() => ({
    msg: 'set-visibility-between',
    observerId,
    observerName: observer.name ?? observerDocument?.name ?? observerId,
    targetId,
    targetName: target.name ?? targetDocument?.name ?? targetId,
    from,
    to,
    options,
  }));
}

async function setUnknownLegacyVisibilityBetween(observer, target, state, options = {}) {
  log.warn?.(() => ({
    msg: 'ignore-unknown-legacy-visibility-state',
    observerId: getTokenId(observer),
    targetId: getTokenId(target),
    state,
  }));
  await applyVisibilitySideEffects(observer, target, 'observed', options);
}

/**
 * Write a canonical perception profile between two tokens and update ephemeral effects.
 * @param {Token} observer
 * @param {Token} target
 * @param {Object|string} profile
 * @param {Object} options
 */
export async function setPerceptionProfileBetween(
  observer,
  target,
  profile,
  options = { skipEphemeralUpdate: false, direction: 'observer_to_target', skipCleanup: false },
) {
  const observerId = getTokenId(observer);
  const targetId = getTokenId(target);
  if (!observerId || !targetId) return;

  const profileMap = { ...getPerceptionProfileMap(observer) };
  const rawProfileMap = getRawPerceptionProfileMap(observer);
  const currentProfile = getPerceptionProfileBetween(observer, target);
  const nextProfile = normalizePerceptionProfile(profile);
  const legacyState =
    options.legacyState ||
    profileToLegacyVisibility(nextProfile, {
      preserveEncounterUnnoticed: !!options.preserveEncounterUnnoticed,
    });
  const currentLegacyState = getVisibilityBetween(observer, target);
  const profileChanged =
    !areTokenFlagValuesEqual(normalizePerceptionProfile(currentProfile), nextProfile);
  const missingStoredProfile = !rawProfileMap[targetId] && !isDefaultProfile(nextProfile);
  const hiddenVisualChange =
    legacyState === 'hidden'
      ? {
          targetId,
          targetName: target?.name ?? getTokenDocument(target)?.name ?? targetId,
          from: currentLegacyState ?? 'observed',
          to: legacyState,
        }
      : null;

  if (hiddenVisualChange) refreshHiddenDetectionFilterVisualsForPair(observer, target, legacyState);

  if (profileChanged || missingStoredProfile) {
    if (isDefaultProfile(nextProfile)) {
      delete profileMap[targetId];
    } else {
      profileMap[targetId] = nextProfile;
    }

    logVisibilityPairChange(
      observer,
      target,
      currentLegacyState ?? 'observed',
      legacyState,
      options,
    );
    await setPerceptionProfileMap(observer, profileMap, {
      preserveEncounterUnnoticed: !!options.preserveEncounterUnnoticed,
    });
    if (
      (legacyState === 'observed' || legacyState === 'concealed') &&
      shouldClearObservedDetectionFilterForChange({
        observerId,
        targetId,
        targetName: target?.name ?? getTokenDocument(target)?.name ?? targetId,
        to: legacyState,
      })
    ) {
      clearDetectionFilterVisuals(target);
    }
    notifyVisibilityMapUpdated(observer, target, legacyState, options);
  }

  if (hiddenVisualChange) refreshHiddenDetectionFilterVisualsForPair(observer, target, legacyState);

  await applyVisibilitySideEffects(observer, target, legacyState, options);
}

/**
 * Write visibility state between two tokens and update ephemeral effects
 * @param {Token} observer
 * @param {Token} target
 * @param {string} state
 * @param {Object} options
 */
export async function setVisibilityBetween(
  observer,
  target,
  state,
  options = { skipEphemeralUpdate: false, direction: 'observer_to_target', skipCleanup: false },
) {
  if (!getTokenId(observer) || !getTokenId(target)) return;

  if (!isKnownLegacyVisibilityState(state)) {
    await setUnknownLegacyVisibilityBetween(observer, target, state, options);
    return;
  }

  await setPerceptionProfileBetween(observer, target, legacyVisibilityToProfile(state), {
    ...options,
    legacyState: state,
    preserveEncounterUnnoticed: state === 'unnoticed' || options.preserveEncounterUnnoticed,
  });
}

/**
 * Get visibility state between tokens with flexible parameter handling for compatibility
 * @param {Token|string} observer - Observer token or token ID
 * @param {Token|string} target - Target token or token ID
 * @param {string} direction - Direction of visibility (observer_to_target or target_to_observer)
 * @returns {string} Visibility state
 */
export function getVisibility(observer, target, direction = 'observer_to_target') {
  try {
    // Resolve tokens if IDs are provided
    let observerToken = observer;
    let targetToken = target;

    if (typeof observer === 'string') {
      observerToken = canvas.tokens.get(observer);
      if (!observerToken) {
        console.warn(`PF2E Visioner: Observer token with ID '${observer}' not found`);
        return 'observed'; // Default to observed if token not found
      }
    }

    if (typeof target === 'string') {
      targetToken = canvas.tokens.get(target);
      if (!targetToken) {
        console.warn(`PF2E Visioner: Target token with ID '${target}' not found`);
        return 'observed'; // Default to observed if token not found
      }
    }

    // Handle direction (for bidirectional visibility systems)
    if (direction === 'target_to_observer') {
      // Swap observer and target for reverse direction lookup
      return getVisibilityBetweenWithAggregation(targetToken, observerToken);
    }

    // Default: observer_to_target
    return getVisibilityBetweenWithAggregation(observerToken, targetToken);
  } catch (error) {
    console.error('PF2E Visioner: Error in getVisibility function:', error);
    return 'observed'; // Default fallback value
  }
}

/**
 * Get visibility between tokens with optional aggregation for camera vision.
 * If camera vision aggregation is enabled and observer has multiple permission tokens,
 * returns the best (most permissive) visibility state across all observers.
 * @param {Token} observer - Observer token
 * @param {Token} target - Target token
 * @returns {string} Visibility state
 */
function getVisibilityBetweenWithAggregation(observer, target) {
  if (!observer || !target) {
    return getVisibilityBetween(observer, target);
  }

  // Check if camera vision aggregation is enabled
  try {
    const aggregationEnabled = game.settings.get(MODULE_ID, 'enableCameraVisionAggregation');
    if (!aggregationEnabled) {
      return getVisibilityBetween(observer, target);
    }
  } catch (e) {
    return getVisibilityBetween(observer, target);
  }

  // Get all tokens with observer permissions (or selected tokens for GM)
  const observerTokens = getControlledObserverTokens();
  if (observerTokens.length <= 1) {
    // Only one or no observer tokens, no aggregation needed
    if (observerTokens.length === 1) {
      return getVisibilityBetween(observerTokens[0], target);
    } else {
      return getVisibilityBetween(observer, target);
    }
  }

  // Multiple observer tokens - aggregate visibility from all of them
  // Get the best visibility state from all observer tokens
  const visibilityStates = observerTokens
    .map((observerToken) => getVisibilityBetween(observerToken, target))
    .filter((state) => state !== undefined && state !== null);

  if (visibilityStates.length === 0) {
    return 'observed';
  }

  // Use the helper function to get the best (most permissive) state
  return getBestVisibilityState(visibilityStates);
}
