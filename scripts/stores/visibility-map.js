/**
 * Visibility map store and helpers
 */

import { MODULE_ID } from '../constants.js';
import { getBestVisibilityState, getControlledObserverTokens } from '../utils.js';
import { getLogger } from '../utils/logger.js';
import { invalidateCaches } from '../utils/cache-invalidation.js';
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
  areTokenFlagValuesEqual,
  applyTokenFlagUpdatePasses,
  buildTokenFlagSetUpdate,
  buildTokenFlagUnsetUpdate,
  getTokenDocument,
  getTokenId,
  noRenderUpdateOptions,
} from './token-flag-map-persistence.js';

const log = getLogger('AVS/VisibilityMap');
export const VISIBILITY_V2_FLAG = 'visibilityV2';
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

function isDefaultProfile(profile) {
  const normalized = normalizePerceptionProfile(profile);
  return (
    normalized.detectionState === DEFAULT_PERCEPTION_PROFILE.detectionState &&
    normalized.hasConcealment === DEFAULT_PERCEPTION_PROFILE.hasConcealment &&
    normalized.coverState === DEFAULT_PERCEPTION_PROFILE.coverState &&
    normalized.detectionSense === DEFAULT_PERCEPTION_PROFILE.detectionSense &&
    normalized.awarenessState === DEFAULT_PERCEPTION_PROFILE.awarenessState
  );
}

export function normalizePerceptionProfileMap(map = {}) {
  const normalized = {};
  const forcedDeletion = foundry?.data?.operators?.ForcedDeletion;

  for (const [id, profile] of Object.entries(map ?? {})) {
    if (!id) continue;
    if (id.startsWith?.('-=')) continue;
    if (!profile) continue;
    if (forcedDeletion && profile === forcedDeletion) continue;

    const normalizedProfile = normalizePerceptionProfile(profile);
    if (isDefaultProfile(normalizedProfile)) continue;
    normalized[id] = normalizedProfile;
  }

  return normalized;
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
  const forcedDeletion = foundry?.data?.operators?.ForcedDeletion;

  for (const [id, state] of Object.entries(map ?? {})) {
    if (!id) continue;
    if (id.startsWith?.('-=')) continue;
    if (!state) continue;
    if (state === 'observed' && options.includeObserved !== true) continue;
    if (forcedDeletion && state === forcedDeletion) continue;
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

async function unsetDocumentFlag(token, flagKey, forcedDeletion, options = {}) {
  const document = getTokenDocument(token);
  if (!document) return;
  const suppressRender = options?.suppressRender === true;

  if (!suppressRender && typeof document.unsetFlag === 'function') {
    return document.unsetFlag(MODULE_ID, flagKey);
  }

  if (typeof document.update !== 'function') {
    return typeof document.unsetFlag === 'function'
      ? document.unsetFlag(MODULE_ID, flagKey)
      : undefined;
  }

  const path = `flags.${MODULE_ID}.${flagKey}`;
  if (forcedDeletion) {
    return document.update({ [path]: forcedDeletion }, noRenderUpdateOptions());
  }

  return document.update({ [`flags.${MODULE_ID}.-=${flagKey}`]: null }, noRenderUpdateOptions());
}

async function setDocumentFlag(token, flagKey, value, options = {}) {
  const document = getTokenDocument(token);
  if (!document) return;
  if (options?.suppressRender === true && typeof document.update === 'function') {
    return document.update({ [`flags.${MODULE_ID}.${flagKey}`]: value }, noRenderUpdateOptions());
  }

  if (typeof document.setFlag === 'function') {
    return document.setFlag(MODULE_ID, flagKey, value);
  }

  return document.update(
    { [`flags.${MODULE_ID}.${flagKey}`]: value },
    { diff: false, render: false, animate: false },
  );
}

function getRawPerceptionProfileMap(token) {
  const document = getTokenDocument(token);
  const map = document?.getFlag?.(MODULE_ID, VISIBILITY_V2_FLAG) ?? {};
  return normalizePerceptionProfileMap(map);
}

function getRawPerceptionProfileEntry(token, targetId) {
  if (!targetId) return null;
  const document = getTokenDocument(token);
  const map = document?.getFlag?.(MODULE_ID, VISIBILITY_V2_FLAG) ?? {};
  const forcedDeletion = foundry?.data?.operators?.ForcedDeletion;
  const profile = map?.[targetId];

  if (!profile) return null;
  if (forcedDeletion && profile === forcedDeletion) return null;

  return normalizePerceptionProfile(profile);
}

async function setPerceptionProfileFlag(token, profileMap, options = {}) {
  const document = getTokenDocument(token);
  if (!document) return;

  const previousMap = getRawPerceptionProfileMap(token);
  const nextMap = normalizePerceptionProfileMap(profileMap);
  const removedTargetIds = Object.keys(previousMap).filter((id) => !(id in nextMap));
  const forcedDeletion = foundry?.data?.operators?.ForcedDeletion ?? null;

  await waitForTokenDocumentUpdateSafe(token);

  if (Object.keys(nextMap).length === 0) {
    const result = await unsetDocumentFlag(token, VISIBILITY_V2_FLAG, forcedDeletion, options);
    invalidateCaches('visibility-profile-flag-write', { tokenId: document?.id });
    return result;
  }

  if (removedTargetIds.length > 0) {
    await unsetDocumentFlag(token, VISIBILITY_V2_FLAG, forcedDeletion, options);
    const result = await setDocumentFlag(token, VISIBILITY_V2_FLAG, nextMap, options);
    invalidateCaches('visibility-profile-flag-write', { tokenId: document?.id });
    return result;
  }

  const result = await setDocumentFlag(token, VISIBILITY_V2_FLAG, nextMap, options);
  invalidateCaches('visibility-profile-flag-write', { tokenId: document?.id });
  return result;
}

export function buildVisibilityMapDocumentUpdatePasses(token, visibilityMap, options = {}) {
  const document = getTokenDocument(token);
  if (!document) return [];

  const previousMap = getRawPerceptionProfileMap(token);
  const nextMap = normalizeVisibilityMap(visibilityMap, {
    includeObserved: options?.preserveObserved === true,
  });
  const previousProfiles = getPerceptionProfileMap(token);
  const nextProfiles = legacyVisibilityMapToProfiles(nextMap, previousProfiles, {
    preserveObserved: options?.preserveObserved === true,
  });
  const removedTargetIds = Object.keys(previousMap).filter((id) => !(id in nextProfiles));
  const forcedDeletion = foundry?.data?.operators?.ForcedDeletion ?? null;

  if (Object.keys(nextProfiles).length === 0) {
    return [[buildTokenFlagUnsetUpdate({
      document,
      moduleId: MODULE_ID,
      flagKey: VISIBILITY_V2_FLAG,
      forcedDeletion,
    })]];
  }

  if (removedTargetIds.length > 0) {
    return [
      [buildTokenFlagUnsetUpdate({
        document,
        moduleId: MODULE_ID,
        flagKey: VISIBILITY_V2_FLAG,
        forcedDeletion,
      })],
      [buildTokenFlagSetUpdate({
        document,
        moduleId: MODULE_ID,
        flagKey: VISIBILITY_V2_FLAG,
        value: nextProfiles,
      })],
    ];
  }

  return [[buildTokenFlagSetUpdate({
    document,
    moduleId: MODULE_ID,
    flagKey: VISIBILITY_V2_FLAG,
    value: nextProfiles,
  })]];
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
    tokensToWaitFor.push(token);
    readbackEntries.push({
      token,
      visibilityMap: entry.visibilityMap ?? {},
      targetIds: collectVisibilityReadbackTargetIds(
        getVisibilityMap(token),
        entry.visibilityMap ?? {},
      ),
    });

    const passes = buildVisibilityMapDocumentUpdatePasses(token, entry.visibilityMap, options);
    passes.forEach((updates, index) => {
      if (!updatePasses[index]) updatePasses[index] = [];
      updatePasses[index].push(...updates);
    });
  }

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
  return setPerceptionProfileFlag(token, nextProfiles, options);
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
    notifyVisibilityMapUpdated(observer, target, legacyState, options);
  }

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
