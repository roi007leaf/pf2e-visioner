const MODULE_ID = 'pf2e-visioner';
const WAITING_FOR_SNEAK_START_SLUG = 'waiting-for-sneak-start';

function getDefaultTokensForActor(actor) {
  return globalThis.canvas?.tokens?.placeables?.filter((token) => token.actor?.id === actor.id) || [];
}

function isDefaultAvsEnabled() {
  return globalThis.game?.settings?.get?.(MODULE_ID, 'autoVisibilityEnabled') ?? false;
}

function isDefaultGM() {
  return !!globalThis.game?.user?.isGM;
}

async function defaultSyncCoverMapsForDeletedCoverEffect(item) {
  const { syncCoverMapsForDeletedCoverEffect } = await import('../cover/cleanup.js');
  return syncCoverMapsForDeletedCoverEffect(item);
}

async function defaultRefreshAvsAfterTokenMapSync(tokenIds) {
  const { refreshAvsAfterTokenMapSync } = await import('./avs-token-refresh.js');
  return refreshAvsAfterTokenMapSync(tokenIds);
}

async function defaultCleanupDeletedVisionerRuleElements(item, tokens, log) {
  const { cleanupDeletedVisionerRuleElements } = await import(
    '../rule-elements/deleted-item-cleanup.js'
  );
  return cleanupDeletedVisionerRuleElements(item, tokens, log);
}

async function defaultGetLogger(name) {
  const { getLogger } = await import('../utils/logger.js');
  return getLogger(name);
}

function hasVisionerRules(item) {
  return (item?.system?.rules || []).some((rule) => rule.key === 'PF2eVisionerEffect');
}

async function syncCoverMaps(item, { syncCoverMapsForDeletedCoverEffect, refreshAvsAfterTokenMapSync, warn }) {
  try {
    const coverSyncResult = await syncCoverMapsForDeletedCoverEffect(item);
    if (coverSyncResult?.changed) {
      await refreshAvsAfterTokenMapSync(coverSyncResult.tokenIds);
      return true;
    }
  } catch (error) {
    warn('PF2E Visioner | cover effect removal cleanup failed:', error);
  }

  return false;
}

async function clearWaitingSneakState(item, tokens) {
  if (item?.system?.slug !== WAITING_FOR_SNEAK_START_SLUG) {
    return 0;
  }

  let cleared = 0;
  for (const token of tokens) {
    if (!token.document.getFlag(MODULE_ID, 'waitingSneak')) continue;

    try {
      await token.document.unsetFlag(MODULE_ID, 'waitingSneak');
      cleared += 1;
    } catch {}

    try {
      if (token.locked) token.locked = false;
    } catch {}
  }

  return cleared;
}

async function clearSneakActiveState(item, tokens, { error }) {
  if (!item?.flags?.[MODULE_ID]?.sneakingEffect) {
    return 0;
  }

  let cleared = 0;
  for (const token of tokens) {
    if (!token.document.getFlag(MODULE_ID, 'sneak-active')) continue;

    try {
      await token.document.unsetFlag(MODULE_ID, 'sneak-active');
      cleared += 1;
    } catch {
      error(`PF2E Visioner | Failed to clear sneak-active flag for ${token.name}`);
    }
  }

  return cleared;
}

async function cleanupVisionerRuleElements(item, tokens, { cleanupDeletedVisionerRuleElements, getLogger }) {
  if (!hasVisionerRules(item)) {
    return false;
  }

  const log = await getLogger('RuleElements/Cleanup');
  log.debug(() => ({
    msg: 'Cleaning up rule elements for deleted effect',
    itemName: item.name,
    itemId: item.id,
    tokenCount: tokens.length,
    ruleElementCount: item.system?.rules?.length || 0,
  }));
  await cleanupDeletedVisionerRuleElements(item, tokens, log);
  return true;
}

export async function cleanupDeletedEffectItem(
  item,
  {
    isGM = isDefaultGM,
    getTokensForActor = getDefaultTokensForActor,
    isAvsEnabled = isDefaultAvsEnabled,
    syncCoverMapsForDeletedCoverEffect = defaultSyncCoverMapsForDeletedCoverEffect,
    refreshAvsAfterTokenMapSync = defaultRefreshAvsAfterTokenMapSync,
    cleanupDeletedVisionerRuleElements = defaultCleanupDeletedVisionerRuleElements,
    getLogger = defaultGetLogger,
    warn = console.warn,
    error = console.error,
  } = {},
) {
  try {
    if (item?.type !== 'effect') return { skipped: true, reason: 'not-effect' };
    if (!isGM()) return { skipped: true, reason: 'not-gm' };

    const actor = item?.parent;
    if (!actor) return { skipped: true, reason: 'no-actor' };

    const tokens = getTokensForActor(actor);
    const coverMapsChanged = await syncCoverMaps(item, {
      syncCoverMapsForDeletedCoverEffect,
      refreshAvsAfterTokenMapSync,
      warn,
    });

    const avsEnabled = isAvsEnabled();
    const waitingSneakCleared = avsEnabled ? await clearWaitingSneakState(item, tokens) : 0;
    const sneakActiveCleared = avsEnabled
      ? await clearSneakActiveState(item, tokens, { error })
      : 0;

    const ruleElementsCleaned = await cleanupVisionerRuleElements(item, tokens, {
      cleanupDeletedVisionerRuleElements,
      getLogger,
    });

    return {
      skipped: false,
      coverMapsChanged,
      waitingSneakCleared,
      sneakActiveCleared,
      ruleElementsCleaned,
      tokenCount: tokens.length,
    };
  } catch (caughtError) {
    warn('PF2E Visioner | deleteItem cleanup failed:', caughtError);
    return { skipped: true, reason: 'error' };
  }
}
