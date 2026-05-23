import { MODULE_ID } from '../constants.js';
import { invalidateCaches } from '../utils/cache-invalidation.js';
import {
  DEFAULT_PERCEPTION_PROFILE,
  normalizePerceptionProfile,
} from '../visibility/perception-profile.js';
import { waitForTokenDocumentUpdateSafe } from './document-update-guard.js';
import {
  buildTokenFlagSetUpdate,
  buildTokenFlagUnsetUpdate,
  getTokenDocument,
  noRenderUpdateOptions,
} from './token-flag-map-persistence.js';

export const VISIBILITY_V2_FLAG = 'visibilityV2';

function getForcedDeletion() {
  return foundry?.data?.operators?.ForcedDeletion ?? null;
}

export function isForcedDeletionValue(value) {
  const forcedDeletion = getForcedDeletion();
  return !!forcedDeletion && value === forcedDeletion;
}

export function isDefaultPerceptionProfile(profile) {
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

  for (const [id, profile] of Object.entries(map ?? {})) {
    if (!id) continue;
    if (id.startsWith?.('-=')) continue;
    if (!profile) continue;
    if (isForcedDeletionValue(profile)) continue;

    const normalizedProfile = normalizePerceptionProfile(profile);
    if (isDefaultPerceptionProfile(normalizedProfile)) continue;
    normalized[id] = normalizedProfile;
  }

  return normalized;
}

export function getRawPerceptionProfileMap(token) {
  const document = getTokenDocument(token);
  const map = document?.getFlag?.(MODULE_ID, VISIBILITY_V2_FLAG) ?? {};
  return normalizePerceptionProfileMap(map);
}

export function getRawPerceptionProfileEntry(token, targetId) {
  if (!targetId) return null;
  const document = getTokenDocument(token);
  const map = document?.getFlag?.(MODULE_ID, VISIBILITY_V2_FLAG) ?? {};
  const profile = map?.[targetId];

  if (!profile) return null;
  if (isForcedDeletionValue(profile)) return null;

  return normalizePerceptionProfile(profile);
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
    noRenderUpdateOptions(),
  );
}

function buildProfileMapPatch(nextProfiles = {}, removedTargetIds = [], forcedDeletion = null) {
  const patch = { ...nextProfiles };
  for (const targetId of removedTargetIds) {
    if (forcedDeletion) {
      patch[targetId] = forcedDeletion;
    } else {
      patch[`-=${targetId}`] = null;
    }
  }
  return patch;
}

export function buildPerceptionProfileFlagUpdatePasses(token, profileMap = {}) {
  const document = getTokenDocument(token);
  if (!document) return [];

  const previousMap = getRawPerceptionProfileMap(token);
  const nextProfiles = normalizePerceptionProfileMap(profileMap);
  const removedTargetIds = Object.keys(previousMap).filter((id) => !(id in nextProfiles));
  const forcedDeletion = getForcedDeletion();

  if (Object.keys(nextProfiles).length === 0) {
    return [[buildTokenFlagUnsetUpdate({
      document,
      moduleId: MODULE_ID,
      flagKey: VISIBILITY_V2_FLAG,
      forcedDeletion,
    })]];
  }

  if (removedTargetIds.length > 0) {
    return [[
      buildTokenFlagSetUpdate({
        document,
        moduleId: MODULE_ID,
        flagKey: VISIBILITY_V2_FLAG,
        value: buildProfileMapPatch(nextProfiles, removedTargetIds, forcedDeletion),
      }),
    ]];
  }

  return [[buildTokenFlagSetUpdate({
    document,
    moduleId: MODULE_ID,
    flagKey: VISIBILITY_V2_FLAG,
    value: nextProfiles,
  })]];
}

export async function setPerceptionProfileFlag(token, profileMap, options = {}) {
  const document = getTokenDocument(token);
  if (!document) return;

  const previousMap = getRawPerceptionProfileMap(token);
  const nextMap = normalizePerceptionProfileMap(profileMap);
  const removedTargetIds = Object.keys(previousMap).filter((id) => !(id in nextMap));
  const forcedDeletion = getForcedDeletion();

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
