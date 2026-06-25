/**
 * Visibility map store and helpers
 */

import { MODULE_ID } from '../constants.js';
import { getNativeVisibilityReplacement } from '../chat/services/feats/native-visibility-replacement.js';
import { getBestVisibilityState, getControlledObserverTokens } from '../utils.js';
import { getLogger } from '../utils/logger.js';
import { autoVisibilitySystem } from '../visibility/auto-visibility/index.js';
import { updateEphemeralEffectsForVisibility } from '../visibility/ephemeral.js';
import {
  DEFAULT_PERCEPTION_PROFILE,
  getVisibilityReplacementMetadata,
  hasVisibilityReplacementMetadata,
  legacyVisibilityToProfile,
  normalizePerceptionProfile,
  profileToLegacyVisibility,
} from '../visibility/perception-profile.js';
import { waitForTokenDocumentUpdateSafe } from './document-update-guard.js';
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

function getProfileMetadataByTargetId(options = {}) {
  return options?.profileMetadataByTargetId || options?.profileMetadataMap || {};
}

function profileMetadataForVisibilityReplacement(replacement, originalState) {
  if (!replacement) return {};
  return {
    visibilityReplacementSource: replacement.source,
    visibilityReplacementOriginalState: replacement.fromState ?? originalState,
  };
}

function applyNativeVisibilityReplacementToProfile(observer, target, profile = {}) {
  const currentState =
    profileToLegacyVisibility(profile, { preserveEncounterUnnoticed: true }) || 'observed';
  const replacement = getNativeVisibilityReplacement(observer, target, currentState);
  if (!replacement?.state) return normalizePerceptionProfile(profile);

  return legacyVisibilityToProfile(
    replacement.state,
    profileMetadataForVisibilityReplacement(replacement, currentState),
  );
}

function hasProfileMetadataOverride(metadataByTargetId = {}, targetId) {
  return Object.prototype.hasOwnProperty.call(metadataByTargetId, targetId);
}

function legacyVisibilityMapToProfiles(visibilityMap = {}, previousProfiles = {}, options = {}) {
  const profileMap = {};
  const profileMetadataByTargetId = getProfileMetadataByTargetId(options);

  for (const [id, state] of Object.entries(
    normalizeVisibilityMap(visibilityMap, { includeObserved: options.preserveObserved === true }),
  )) {
    if (!isKnownLegacyVisibilityState(state)) continue;

    const previousProfile = previousProfiles?.[id];
    const hasMetadataOverride = hasProfileMetadataOverride(profileMetadataByTargetId, id);
    if (
      previousProfile &&
      !hasMetadataOverride &&
      profileToLegacyVisibility(previousProfile, { preserveEncounterUnnoticed: true }) === state
    ) {
      profileMap[id] = normalizePerceptionProfile(previousProfile);
      continue;
    }

    profileMap[id] = legacyVisibilityToProfile(state, {
      ...(hasMetadataOverride ? (profileMetadataByTargetId[id] ?? {}) : {}),
      ...(state === 'observed' && options.preserveObserved === true
        ? { detectionSense: AVS_EXPLICIT_VISIBLE_DETECTION_SENSE }
        : {}),
    });
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

  return ids;
}

function shouldClearObservedDetectionFilterForChange(change) {
  const viewObserverIds = getCurrentViewObserverIds();
  if (viewObserverIds.size === 0) return true;
  if (!change?.observerId) return true;
  if (!viewObserverIds.has(change.observerId)) return false;
  // Observed/concealed targets never carry a soundwave filter (core-native
  // contract) — clear it on the transition regardless of move state.
  return true;
}

function clearDetectionFilterVisuals(token) {
  if (!token) return;

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
    mesh.visible === true || mesh.renderable === true || (Number.isFinite(alpha) && alpha > 0);
  const hiddenSignal =
    mesh.visible === false || mesh.renderable === false || (Number.isFinite(alpha) && alpha <= 0);

  return activeSignal && !hiddenSignal;
}

function tokenHasDetectionFilterVisual(token) {
  return (
    !!token?.detectionFilter || tokenHasDetectionFilterMeshVisual(token) || !!token?._pvHiddenEcho
  );
}

function clearObservedDetectionFilterVisualsForChanges(changes = []) {
  for (const change of changes) {
    if (change?.to !== 'observed' && change?.to !== 'concealed') continue;
    if (!shouldClearObservedDetectionFilterForChange(change)) continue;
    const target = tokenObjectById(change.targetId);
    clearDetectionFilterVisuals(target);
  }
}

function visibilityTestPointsForToken(token) {
  const documentPoints = token?.document?.getVisibilityTestPoints?.();
  if (Array.isArray(documentPoints) && documentPoints.length) return documentPoints;

  const centerPoint = token?.center || token?.getCenterPoint?.();
  return centerPoint ? [centerPoint] : [];
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

function refreshHiddenDetectionFilterVisualsForChanges(changes = []) {
  for (const change of changes) {
    if (change?.to !== 'hidden') continue;
    const target = tokenObjectById(change.targetId);
    if (!target || tokenHasDetectionFilterMeshVisual(target) || target._pvHiddenEcho) continue;
    refreshCoreDetectionFilterForHiddenTarget(target);
    if (tokenHasDetectionFilterMeshVisual(target) || target._pvHiddenEcho) continue;

    try {
      primeHiddenDetectionFilterVisuals(target);
      target.refresh?.();
    } catch {
      /* best-effort immediate hidden visual refresh */
    }
  }
}

export function buildVisibilityMapDocumentUpdatePasses(token, visibilityMap, options = {}) {
  const nextMap = normalizeVisibilityMap(visibilityMap, {
    includeObserved: options?.preserveObserved === true,
  });
  const previousProfiles = getPerceptionProfileMap(token);
  const nextProfiles = legacyVisibilityMapToProfiles(nextMap, previousProfiles, {
    ...options,
    preserveObserved: options?.preserveObserved === true,
  });
  return buildPerceptionProfileFlagUpdatePasses(token, nextProfiles);
}

function visibilityMapValueFor(visibilityMap = {}, targetId) {
  if (!targetId) return 'observed';
  return visibilityMap?.[targetId] ?? 'observed';
}

function collectVisibilityReadbackTargetIds(previousMap = {}, nextMap = {}) {
  return Array.from(new Set([...Object.keys(previousMap ?? {}), ...Object.keys(nextMap ?? {})]));
}

function hasVisibilityReadbackMismatch(token, visibilityMap = {}, targetIds = []) {
  const actualMap = getVisibilityMap(token);
  return targetIds.some(
    (targetId) =>
      visibilityMapValueFor(actualMap, targetId) !== visibilityMapValueFor(visibilityMap, targetId),
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
    const entryOptions = {
      ...options,
      profileMetadataByTargetId: entry.profileMetadataByTargetId ?? entry.profileMetadataMap,
    };
    const nextProfiles = legacyVisibilityMapToProfiles(nextMap, previousProfiles, {
      ...entryOptions,
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
      targetIds: collectVisibilityReadbackTargetIds(previousMap, entry.visibilityMap ?? {}),
      changes: buildVisibilityMapDiff(previousMap, nextMap).map((change) => ({
        ...change,
        observerId,
        observerName,
      })),
    });

    const passes = buildVisibilityMapDocumentUpdatePasses(token, entry.visibilityMap, entryOptions);
    rememberPendingPerceptionProfileWrite(token, nextProfiles, {
      removedTargetIds: removedProfileTargetIds,
    });
    passes.forEach((updates, index) => {
      if (!updatePasses[index]) updatePasses[index] = [];
      updatePasses[index].push(...updates);
    });
  }

  for (const entry of readbackEntries) {
    clearObservedDetectionFilterVisualsForChanges(entry.changes);
    refreshHiddenDetectionFilterVisualsForChanges(entry.changes);
  }

  const result = await applyTokenFlagUpdatePasses({
    updatePasses,
    tokensToWaitFor,
    waitForToken: waitForTokenDocumentUpdateSafe,
    scene: canvas?.scene,
    updateOptions: noRenderUpdateOptions(),
    fallback: async () =>
      Promise.all(
        entries.map((entry) =>
          setVisibilityMap(entry.token, entry.visibilityMap, {
            ...options,
            profileMetadataByTargetId: entry.profileMetadataByTargetId ?? entry.profileMetadataMap,
          }),
        ),
      ),
  });
  for (const entry of readbackEntries) {
    refreshHiddenDetectionFilterVisualsForChanges(entry.changes);
  }
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
  clearObservedDetectionFilterVisualsForChanges(observedClearChanges);
  refreshHiddenDetectionFilterVisualsForChanges(changes);
  const result = await setPerceptionProfileFlag(token, nextProfiles, options);
  refreshHiddenDetectionFilterVisualsForChanges(changes);
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
  const effectiveProfile = applyNativeVisibilityReplacementToProfile(observer, target, profile);
  return profileToLegacyVisibility(effectiveProfile, { preserveEncounterUnnoticed: true }) || 'observed';
}

/**
 * Read the canonical perception profile between two tokens.
 * @param {Token} observer
 * @param {Token} target
 */
export function getPerceptionProfileBetween(observer, target) {
  const profile =
    getRawPerceptionProfileEntry(observer, getTokenId(target)) || {
      ...DEFAULT_PERCEPTION_PROFILE,
    };
  return applyNativeVisibilityReplacementToProfile(observer, target, profile);
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
  const suppressionContext =
    options.perceptionProfile ||
    options.profileMetadata ||
    getVisibilityReplacementMetadata(options);
  if (
    OffGuardSuppression.shouldSuppressOffGuardForState(observer, state, target, suppressionContext)
  ) {
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
  } catch (_) {}
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
  const currentProfile = rawProfileMap[targetId] || { ...DEFAULT_PERCEPTION_PROFILE };
  const nextProfile = normalizePerceptionProfile(profile);
  const legacyState =
    options.legacyState ||
    profileToLegacyVisibility(nextProfile, {
      preserveEncounterUnnoticed: !!options.preserveEncounterUnnoticed,
    });
  const currentLegacyState = getVisibilityBetween(observer, target);
  const profileChanged = !areTokenFlagValuesEqual(
    normalizePerceptionProfile(currentProfile),
    nextProfile,
  );
  const missingStoredProfile = !rawProfileMap[targetId] && !isDefaultProfile(nextProfile);

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
    if (legacyState === 'hidden') {
      refreshHiddenDetectionFilterVisualsForChanges([{ to: legacyState, targetId }]);
    }
    notifyVisibilityMapUpdated(observer, target, legacyState, options);
  }

  await applyVisibilitySideEffects(observer, target, legacyState, {
    ...options,
    perceptionProfile: nextProfile,
  });
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

  const hasExplicitProfileMetadata = Object.prototype.hasOwnProperty.call(
    options ?? {},
    'profileMetadata',
  );
  const currentProfile = getPerceptionProfileBetween(observer, target);
  const currentState = profileToLegacyVisibility(currentProfile, {
    preserveEncounterUnnoticed: true,
  });
  const profileMetadata = hasExplicitProfileMetadata
    ? (options.profileMetadata ?? {})
    : currentState === state && hasVisibilityReplacementMetadata(currentProfile)
      ? getVisibilityReplacementMetadata(currentProfile)
      : {};

  await setPerceptionProfileBetween(
    observer,
    target,
    legacyVisibilityToProfile(state, profileMetadata),
    {
      ...options,
      profileMetadata,
      legacyState: state,
      preserveEncounterUnnoticed: state === 'unnoticed' || options.preserveEncounterUnnoticed,
    },
  );
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
