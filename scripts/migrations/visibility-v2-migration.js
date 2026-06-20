import { MODULE_ID } from '../constants.js';
import {
  VISIBILITY_V2_FLAG,
  normalizePerceptionProfileMap,
  normalizeVisibilityMap,
} from '../stores/visibility-map.js';
import { legacyVisibilityToProfile } from '../visibility/perception-profile.js';

export const VISIBILITY_V2_MIGRATION_SETTING = 'visibilityV2MigrationVersion';
export const VISIBILITY_V2_MIGRATION_VERSION = 3;
const KNOWN_LEGACY_VISIBILITY_STATES = new Set(['concealed', 'hidden', 'undetected', 'unnoticed']);
const MIGRATION_LABEL = 'PF2E Visioner: Migrating visibility data';

function collectionToArray(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection.contents)) return collection.contents;
  try {
    return Array.from(collection);
  } catch {
    return [];
  }
}

function getDocumentFlag(document, key) {
  return document?.getFlag?.(MODULE_ID, key) ?? document?.flags?.[MODULE_ID]?.[key] ?? null;
}

function getMigrationCompleteMessage(result) {
  const tokenLabel = result.updatedTokens === 1 ? 'token' : 'tokens';
  const overrideLabel = result.updatedOverrides === 1 ? 'override' : 'overrides';
  return `PF2E Visioner: Migrated ${result.updatedTokens} ${tokenLabel} and ${result.updatedOverrides} ${overrideLabel} to visibility v2.`;
}

function ensureProgressNotification(progressState, options) {
  if (options?.showProgress === false) return null;
  if (progressState.notification !== undefined) return progressState.notification;

  const notification = globalThis.ui?.notifications?.info?.(MIGRATION_LABEL, { progress: true });
  progressState.notification =
    notification && typeof notification.update === 'function' ? notification : null;
  return progressState.notification;
}

function reportMigrationProgress(options, progressState, pct) {
  const progress = {
    label: MIGRATION_LABEL,
    pct: Math.max(0, Math.min(100, Math.round(pct))),
  };

  options?.onProgress?.(progress);
  if (options?.showProgress === false) return;

  const notification = ensureProgressNotification(progressState, options);
  if (notification) {
    notification.update({ pct: progress.pct / 100, message: MIGRATION_LABEL });
    return;
  }

  globalThis.SceneNavigation?.displayProgressBar?.(progress);
}

function notifyMigrationComplete(result, progressState) {
  if ((result.updatedTokens ?? 0) <= 0 && (result.updatedOverrides ?? 0) <= 0) return;

  const message = getMigrationCompleteMessage(result);
  if (progressState.notification) {
    progressState.notification.update({ pct: 1, message });
    return;
  }

  globalThis.ui?.notifications?.info?.(message);
}

function buildMigratedProfileMap(tokenDocument) {
  const legacyMap = normalizeVisibilityMap(getDocumentFlag(tokenDocument, 'visibility') ?? {});
  const existingProfiles = normalizePerceptionProfileMap(
    getDocumentFlag(tokenDocument, VISIBILITY_V2_FLAG) ?? {},
  );
  const migratedProfiles = { ...existingProfiles };

  for (const [targetId, legacyState] of Object.entries(legacyMap)) {
    if (migratedProfiles[targetId]) continue;
    if (!KNOWN_LEGACY_VISIBILITY_STATES.has(legacyState)) continue;
    migratedProfiles[targetId] = legacyVisibilityToProfile(legacyState);
  }

  return migratedProfiles;
}

function getModuleFlags(document) {
  return document?.flags?.[MODULE_ID] ?? {};
}

function buildMigratedOverrideData(overrideData) {
  if (!overrideData || typeof overrideData !== 'object') return null;
  if (!KNOWN_LEGACY_VISIBILITY_STATES.has(overrideData.state)) return null;

  const profile = legacyVisibilityToProfile(overrideData.state, overrideData);
  const migrated = {
    ...overrideData,
    detectionState: overrideData.detectionState ?? profile.detectionState,
    awarenessState: overrideData.awarenessState ?? profile.awarenessState,
    coverState: overrideData.coverState ?? profile.coverState,
    detectionSense: overrideData.detectionSense ?? profile.detectionSense,
    hasConcealment:
      overrideData.state === 'concealed'
        ? true
        : typeof overrideData.hasConcealment === 'boolean'
          ? overrideData.hasConcealment
          : profile.hasConcealment,
  };
  delete migrated.state;

  return JSON.stringify(migrated) === JSON.stringify(overrideData) ? null : migrated;
}

async function setTokenProfileMap(tokenDocument, profileMap) {
  if (typeof tokenDocument?.setFlag === 'function') {
    return tokenDocument.setFlag(MODULE_ID, VISIBILITY_V2_FLAG, profileMap);
  }

  return tokenDocument?.update?.(
    { [`flags.${MODULE_ID}.${VISIBILITY_V2_FLAG}`]: profileMap },
    { diff: false, render: false, animate: false },
  );
}

async function unsetLegacyVisibilityMap(tokenDocument) {
  if (typeof tokenDocument?.unsetFlag === 'function') {
    return tokenDocument.unsetFlag(MODULE_ID, 'visibility');
  }

  return tokenDocument?.update?.(
    { [`flags.${MODULE_ID}.-=visibility`]: null },
    { diff: false, render: false, animate: false },
  );
}

async function migrateOverrideFlagsForToken(tokenDocument) {
  let updatedOverrides = 0;
  const moduleFlags = getModuleFlags(tokenDocument);

  for (const [flagKey, overrideData] of Object.entries(moduleFlags)) {
    if (!flagKey.startsWith('avs-override-from-')) continue;

    const migratedOverride = buildMigratedOverrideData(overrideData);
    if (!migratedOverride) continue;

    await tokenDocument.setFlag?.(MODULE_ID, flagKey, migratedOverride);
    updatedOverrides += 1;
  }

  return updatedOverrides;
}

export async function runVisibilityV2MigrationIfNeeded(options = {}) {
  if (!game.user?.isGM) {
    return { skipped: true, reason: 'not-gm', updatedTokens: 0 };
  }

  const currentVersion = Number(
    game.settings?.get?.(MODULE_ID, VISIBILITY_V2_MIGRATION_SETTING) ?? 0,
  );
  if (currentVersion >= VISIBILITY_V2_MIGRATION_VERSION) {
    return { skipped: true, reason: 'current', updatedTokens: 0 };
  }

  const scenes = collectionToArray(options.scenes ?? game.scenes?.contents);
  const totalTokens = scenes.reduce(
    (total, scene) => total + collectionToArray(scene?.tokens).length,
    0,
  );
  let updatedTokens = 0;
  let updatedOverrides = 0;
  let scannedTokens = 0;
  const progressState = {};

  if (totalTokens > 0) reportMigrationProgress(options, progressState, 0);

  for (const scene of scenes) {
    const tokenDocuments = collectionToArray(scene?.tokens);
    for (const tokenDocument of tokenDocuments) {
      if (!tokenDocument?.id) {
        scannedTokens += 1;
        reportMigrationProgress(options, progressState, (scannedTokens / totalTokens) * 100);
        continue;
      }
      scannedTokens += 1;

      const legacyMap = normalizeVisibilityMap(getDocumentFlag(tokenDocument, 'visibility') ?? {});
      const profileMap = buildMigratedProfileMap(tokenDocument);
      let tokenUpdated = false;

      if (Object.keys(legacyMap).length > 0 && Object.keys(profileMap).length > 0) {
        await setTokenProfileMap(tokenDocument, profileMap);
        await unsetLegacyVisibilityMap(tokenDocument);
        tokenUpdated = true;
      } else if (Object.keys(legacyMap).length > 0) {
        await unsetLegacyVisibilityMap(tokenDocument);
        tokenUpdated = true;
      }

      const tokenOverrideUpdates = await migrateOverrideFlagsForToken(tokenDocument);
      updatedOverrides += tokenOverrideUpdates;
      tokenUpdated ||= tokenOverrideUpdates > 0;

      if (tokenUpdated) updatedTokens += 1;
      reportMigrationProgress(options, progressState, (scannedTokens / totalTokens) * 100);
    }
  }

  await game.settings?.set?.(
    MODULE_ID,
    VISIBILITY_V2_MIGRATION_SETTING,
    VISIBILITY_V2_MIGRATION_VERSION,
  );

  const result = {
    skipped: false,
    scannedTokens,
    updatedTokens,
    updatedOverrides,
  };
  notifyMigrationComplete(result, progressState);
  return result;
}
