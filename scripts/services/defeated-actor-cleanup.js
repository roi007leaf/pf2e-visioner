import { MODULE_ID } from '../constants.js';
import { scheduleCanvasPerceptionUpdate } from '../helpers/perception-refresh.js';

const DEFEAT_SLUGS = new Set(['unconscious', 'dead', 'dying']);
const DEFEAT_NAME_PARTS = ['dead', 'unconscious', 'dying'];
const VISION_SHARING_FLAGS = [
  'visionMasterTokenId',
  'visionMasterActorUuid',
  'visionSharingMode',
  'visionSharingSources',
];

export function isDefeatEffect(effect) {
  const effectName = effect?.name?.toLowerCase?.() || '';
  const effectSlug = effect?.system?.slug || effect?.slug || '';
  return DEFEAT_SLUGS.has(effectSlug) || DEFEAT_NAME_PARTS.some((name) => effectName.includes(name));
}

function isDefaultCurrentUserGm() {
  return !!globalThis.game?.user?.isGM;
}

function isDefaultAvsEnabled() {
  return globalThis.game?.settings?.get?.(MODULE_ID, 'autoVisibilityEnabled') ?? false;
}

function getDefaultTokens() {
  return globalThis.canvas?.tokens?.placeables || [];
}

async function loadDefaultAvsOverrideManager() {
  const { default: AvsOverrideManager } = await import(
    '../chat/services/infra/AvsOverrideManager.js'
  );
  return AvsOverrideManager;
}

async function loadDefaultTakeCoverExpirationService() {
  return import('../chat/services/take-cover-expiration-service.js');
}

function updateDefaultPerception(updateData) {
  return scheduleCanvasPerceptionUpdate(updateData);
}

async function clearVisionSharingForDefeatedTokens(defeatedTokens, allTokens, { warn = console.warn } = {}) {
  const defeatedTokenIds = new Set(defeatedTokens.map((token) => token?.id).filter(Boolean));
  if (defeatedTokenIds.size === 0) return;

  for (const token of allTokens) {
    const visionMasterId = token?.document?.getFlag?.(MODULE_ID, 'visionMasterTokenId');
    if (!defeatedTokenIds.has(visionMasterId)) continue;

    try {
      for (const flag of VISION_SHARING_FLAGS) {
        await token.document.unsetFlag(MODULE_ID, flag);
      }
    } catch (error) {
      warn(`[PF2E Visioner] Failed to cleanup vision sharing for ${token?.name}:`, error);
    }
  }
}

export async function cleanupAvsOverridesForDefeatedActor(
  actor,
  {
    getTokens = getDefaultTokens,
    getAllTokens = getDefaultTokens,
    loadAvsOverrideManager = loadDefaultAvsOverrideManager,
    loadTakeCoverExpirationService = loadDefaultTakeCoverExpirationService,
    updatePerception = updateDefaultPerception,
    warn = console.warn,
    error = console.error,
  } = {},
) {
  try {
    const tokens = (getTokens() || []).filter((token) => token?.actor?.id === actor?.id);
    if (tokens.length === 0) return;

    const AvsOverrideManager = await loadAvsOverrideManager();

    for (const token of tokens) {
      try {
        const { requestTakeCoverExpirationForToken } = await loadTakeCoverExpirationService();
        await requestTakeCoverExpirationForToken(token, 'unconscious');
      } catch {
        /* best effort */
      }
      await AvsOverrideManager.removeAllOverridesInvolving(token.document.id);
    }

    await clearVisionSharingForDefeatedTokens(tokens, getAllTokens() || [], { warn });

    updatePerception({ initializeVision: true, refreshLighting: true });
  } catch (caughtError) {
    error('PF2E Visioner | Failed to clean up AVS overrides for defeated actor:', caughtError);
  }
}

export async function handleDefeatEffectCreated(
  effect,
  {
    isCurrentUserGm = isDefaultCurrentUserGm,
    isAvsEnabled = isDefaultAvsEnabled,
    cleanupDefeatedActor = cleanupAvsOverridesForDefeatedActor,
    cleanupAvsOverridesForDefeatedActor: injectedCleanupDefeatedActor,
    warn = console.warn,
  } = {},
) {
  try {
    if (!isCurrentUserGm()) {
      return { cleaned: false, reason: 'not-gm' };
    }

    if (!isAvsEnabled()) {
      return { cleaned: false, reason: 'avs-disabled' };
    }

    const actor = effect?.parent;
    if (!actor) {
      return { cleaned: false, reason: 'no-actor' };
    }

    if (!isDefeatEffect(effect)) {
      return { cleaned: false, reason: 'not-defeat-effect' };
    }

    const cleanup = injectedCleanupDefeatedActor ?? cleanupDefeatedActor;
    await cleanup(actor);
    return { cleaned: true };
  } catch (caughtError) {
    warn('PF2E Visioner | Error handling ActiveEffect creation:', caughtError);
    return { cleaned: false, reason: 'error' };
  }
}
