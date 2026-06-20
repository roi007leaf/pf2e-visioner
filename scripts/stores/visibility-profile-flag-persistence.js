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
const PENDING_PROFILE_WRITE_GRACE_MS = 1000;
const PENDING_PROFILE_WRITE_STORE_KEY = Symbol.for(
  'pf2e-visioner.pendingPerceptionProfileWrites',
);
const pendingPerceptionProfileWrites =
  (globalThis[PENDING_PROFILE_WRITE_STORE_KEY] ??= new Map());

function getForcedDeletionOperator() {
  return foundry?.data?.operators?.ForcedDeletion ?? null;
}

function createForcedDeletionValue() {
  const ForcedDeletion = getForcedDeletionOperator();
  if (!ForcedDeletion) return null;
  return typeof ForcedDeletion === 'function' ? new ForcedDeletion() : ForcedDeletion;
}

export function isForcedDeletionValue(value) {
  const ForcedDeletion = getForcedDeletionOperator();
  return !!ForcedDeletion && (
    value === ForcedDeletion ||
    (typeof ForcedDeletion === 'function' && value instanceof ForcedDeletion)
  );
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

function tokenIdOf(token) {
  return getTokenDocument(token)?.id ?? null;
}

function prunePendingPerceptionProfileWrites(now = Date.now()) {
  for (const [tokenId, entry] of pendingPerceptionProfileWrites.entries()) {
    if (!entry?.expiresAt || entry.expiresAt <= now) {
      pendingPerceptionProfileWrites.delete(tokenId);
    }
  }
}

function getPendingPerceptionProfileWrite(token) {
  prunePendingPerceptionProfileWrites();
  const tokenId = tokenIdOf(token);
  if (!tokenId) return null;
  return pendingPerceptionProfileWrites.get(tokenId) ?? null;
}

function readDocumentProfileMap(token) {
  const document = getTokenDocument(token);
  const map = document?.getFlag?.(MODULE_ID, VISIBILITY_V2_FLAG) ?? {};
  return normalizePerceptionProfileMap(map);
}

function readDocumentProfileEntry(token, targetId) {
  if (!targetId) return null;
  const document = getTokenDocument(token);
  const map = document?.getFlag?.(MODULE_ID, VISIBILITY_V2_FLAG) ?? {};
  const profile = map?.[targetId];

  if (!profile) return null;
  if (isForcedDeletionValue(profile)) return null;

  return normalizePerceptionProfile(profile);
}

export function getDocumentPerceptionProfileMap(token) {
  return readDocumentProfileMap(token);
}

export function getDocumentPerceptionProfileEntry(token, targetId) {
  return readDocumentProfileEntry(token, targetId);
}

function mergePendingProfileWrite(token, pendingWrite) {
  const merged = readDocumentProfileMap(token);
  for (const targetId of pendingWrite?.removedTargetIds || []) {
    delete merged[targetId];
  }
  return {
    ...merged,
    ...normalizePerceptionProfileMap(pendingWrite?.map),
  };
}

export function clearPendingPerceptionProfileWrites() {
  pendingPerceptionProfileWrites.clear();
}

export function rememberPendingPerceptionProfileWrite(
  token,
  profileMap = {},
  { graceMs = PENDING_PROFILE_WRITE_GRACE_MS, removedTargetIds = [] } = {},
) {
  const tokenId = tokenIdOf(token);
  if (!tokenId) return false;

  const normalized = normalizePerceptionProfileMap(profileMap);
  const expiresAt = Date.now() + Math.max(0, Number(graceMs) || 0);
  pendingPerceptionProfileWrites.set(tokenId, {
    map: normalized,
    removedTargetIds: new Set(removedTargetIds.filter(Boolean).map(String)),
    expiresAt,
  });
  setTimeout(() => {
    const entry = pendingPerceptionProfileWrites.get(tokenId);
    if (entry?.expiresAt === expiresAt) {
      pendingPerceptionProfileWrites.delete(tokenId);
    }
  }, Math.max(0, Number(graceMs) || 0));
  return true;
}

export function getRawPerceptionProfileMap(token) {
  const pendingWrite = getPendingPerceptionProfileWrite(token);
  if (pendingWrite) return mergePendingProfileWrite(token, pendingWrite);

  return readDocumentProfileMap(token);
}

export function getRawPerceptionProfileEntry(token, targetId) {
  if (!targetId) return null;
  const pendingWrite = getPendingPerceptionProfileWrite(token);
  if (pendingWrite) {
    if (pendingWrite.removedTargetIds?.has(String(targetId))) return null;
    return pendingWrite.map?.[targetId]
      ? normalizePerceptionProfile(pendingWrite.map[targetId])
      : readDocumentProfileEntry(token, targetId);
  }

  return readDocumentProfileEntry(token, targetId);
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

function buildProfileMapPatch(nextProfiles = {}, removedTargetIds = [], forcedDeletion = null) {
  const patch = { ...nextProfiles };
  for (const targetId of removedTargetIds) {
    if (forcedDeletion) {
      patch[targetId] = createForcedDeletionValue();
    } else {
      patch[`-=${targetId}`] = null;
    }
  }
  return patch;
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

export function buildPerceptionProfileFlagUpdatePasses(token, profileMap = {}) {
  const document = getTokenDocument(token);
  if (!document) return [];

  const previousMap = readDocumentProfileMap(token);
  const nextProfiles = normalizePerceptionProfileMap(profileMap);
  const removedTargetIds = Object.keys(previousMap).filter((id) => !(id in nextProfiles));
  const forcedDeletion = createForcedDeletionValue();

  if (Object.keys(nextProfiles).length === 0) {
    return [[buildTokenFlagUnsetUpdate({
      document,
      moduleId: MODULE_ID,
      flagKey: VISIBILITY_V2_FLAG,
      forcedDeletion,
    })]];
  }

  if (removedTargetIds.length > 0) {
    return [[buildTokenFlagSetUpdate({
      document,
      moduleId: MODULE_ID,
      flagKey: VISIBILITY_V2_FLAG,
      value: buildProfileMapPatch(nextProfiles, removedTargetIds, forcedDeletion),
    })]];
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

  const previousMap = readDocumentProfileMap(token);
  const nextMap = normalizePerceptionProfileMap(profileMap);
  const removedTargetIds = Object.keys(previousMap).filter((id) => !(id in nextMap));
  const forcedDeletion = createForcedDeletionValue();

  rememberPendingPerceptionProfileWrite(token, nextMap, { removedTargetIds });
  await waitForTokenDocumentUpdateSafe(token);

  if (Object.keys(nextMap).length === 0) {
    const result = await unsetDocumentFlag(token, VISIBILITY_V2_FLAG, forcedDeletion, options);
    invalidateCaches('visibility-profile-flag-write', { tokenId: document?.id });
    return result;
  }

  if (removedTargetIds.length > 0) {
    const result = await setDocumentFlag(
      token,
      VISIBILITY_V2_FLAG,
      buildProfileMapPatch(nextMap, removedTargetIds, forcedDeletion),
      options,
    );
    invalidateCaches('visibility-profile-flag-write', { tokenId: document?.id });
    return result;
  }

  const result = await setDocumentFlag(token, VISIBILITY_V2_FLAG, nextMap, options);
  invalidateCaches('visibility-profile-flag-write', { tokenId: document?.id });
  return result;
}
