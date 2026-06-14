import { recalculateRuntimeAvsTokenIds } from '../services/avs-token-refresh.js';
import { buildPreparedSensesSignature } from '../visibility/auto-visibility/core/TokenSenseSignatureCache.js';
import { VisionAnalyzer } from '../visibility/auto-visibility/VisionAnalyzer.js';

const RULE_ELEMENT_KEY = 'PF2eVisionerEffect';
const MODULE_ID = 'pf2e-visioner';
const actorPreparedSenseSnapshots = new WeakMap();
const actorPreparedSenseMutationTimers = new WeakMap();
const watchedPreparedSenseObjects = new WeakMap();

function defaultIsGM() {
  return !!globalThis.game?.user?.isGM;
}

function defaultGetTokensForActor(actor) {
  return globalThis.canvas?.tokens?.placeables?.filter((token) => token.actor?.id === actor.id) || [];
}

function defaultScheduler(callback, delayMs) {
  return globalThis.setTimeout(callback, delayMs);
}

function defaultClearVisionCacheForTokenIds(tokenIds) {
  const visionAnalyzer = VisionAnalyzer.getInstance?.();
  if (!visionAnalyzer) return false;

  for (const tokenId of tokenIds || []) {
    visionAnalyzer.clearVisionCache?.(tokenId);
  }

  return true;
}

async function defaultLoadOperationClass(className) {
  switch (className) {
    case 'VisibilityOverride':
      return (await import('./operations/VisibilityOverride.js')).VisibilityOverride;
    case 'DistanceBasedVisibility':
      return (await import('./operations/DistanceBasedVisibility.js')).DistanceBasedVisibility;
    case 'CoverOverride':
      return (await import('./operations/CoverOverride.js')).CoverOverride;
    case 'SenseModifier':
      return (await import('./operations/SenseModifier.js')).SenseModifier;
    case 'DetectionModeModifier':
      return (await import('./operations/DetectionModeModifier.js')).DetectionModeModifier;
    case 'ActionQualifier':
      return (await import('./operations/ActionQualifier.js')).ActionQualifier;
    case 'LightingModifier':
      return (await import('./operations/LightingModifier.js')).LightingModifier;
    case 'OffGuardSuppression':
      return (await import('./operations/OffGuardSuppression.js')).OffGuardSuppression;
    case 'AuraVisibility':
      return (await import('./operations/AuraVisibility.js')).AuraVisibility;
    case 'ShareVision':
      return (await import('./operations/ShareVision.js')).ShareVision;
    default:
      return null;
  }
}

function getVisionerRule(item) {
  return (item?.system?.rules || []).find((rule) => rule?.key === RULE_ELEMENT_KEY) || null;
}

function hasRuleElementChanges(changes) {
  const systemChanges = changes?.system || {};
  return (
    Object.keys(systemChanges).some((key) => key === 'rules' || key.startsWith('rules.')) ||
    Object.keys(changes || {}).some((key) => key === 'system.rules' || key.startsWith('system.rules.'))
  );
}

function normalizeRuleKey(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function tokenIdOf(token) {
  return token?.id || token?.document?.id || null;
}

function ruleLooksSenseRelated(rule) {
  if (!rule || typeof rule !== 'object') return false;

  const key = normalizeRuleKey(rule.key);
  const type = normalizeRuleKey(rule.type);
  const selector = normalizeRuleKey(rule.selector);
  if (key.includes('sense') || type.includes('sense') || selector.includes('sense')) return true;
  if (key.includes('detectionmode') || type.includes('detectionmode')) return true;

  const hasSenseIdentity =
    'sense' in rule ||
    'senses' in rule ||
    'senseType' in rule ||
    'acuity' in rule ||
    'detectionMode' in rule ||
    'detectionModes' in rule;
  return hasSenseIdentity && ('range' in rule || 'value' in rule || 'mode' in rule);
}

function valueContainsSenseRule(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.some((entry) => valueContainsSenseRule(entry, seen));
  }

  if (ruleLooksSenseRelated(value)) return true;

  return Object.values(value).some((entry) => valueContainsSenseRule(entry, seen));
}

function hasRuleChanges(changes) {
  if (!changes || typeof changes !== 'object') return false;
  const systemChanges = changes.system || {};
  if (Object.keys(systemChanges).some((key) => key === 'rules' || key.startsWith('rules.'))) {
    return true;
  }
  return Object.keys(changes).some((key) => key === 'system.rules' || key.startsWith('system.rules.'));
}

function itemSenseChangeAffectsAvs(item, changes) {
  if (getVisionerRule(item)) return false;

  if (!changes || Object.keys(changes).length === 0) {
    return valueContainsSenseRule(item?.system?.rules);
  }

  if (!hasRuleChanges(changes)) return valueContainsSenseRule(changes);
  return valueContainsSenseRule(changes) || valueContainsSenseRule(item?.system?.rules);
}

function getPreparedSenseEntries(senses) {
  if (!senses) return [];

  if (Array.isArray(senses)) {
    return senses.map((sense, index) => [sense?.type ?? sense?.key ?? index, sense]);
  }

  if (Array.isArray(senses.contents)) {
    return senses.contents.map((sense, index) => [sense?.type ?? sense?.key ?? index, sense]);
  }

  if (typeof senses.entries === 'function') {
    try {
      return Array.from(senses.entries());
    } catch {
      // Fall through to other collection shapes.
    }
  }

  if (typeof senses.values === 'function') {
    try {
      return Array.from(senses.values()).map((sense) => [sense?.type ?? sense?.key, sense]);
    } catch {
      // Fall through to other collection shapes.
    }
  }

  if (typeof senses[Symbol.iterator] === 'function') {
    try {
      return Array.from(senses).map((entry) => {
        if (Array.isArray(entry) && entry.length >= 2) return entry;
        return [entry?.type ?? entry?.key, entry];
      });
    } catch {
      // Fall through to object values.
    }
  }

  if (typeof senses === 'object') {
    return Object.entries(senses);
  }

  return [];
}

function scheduleActorTokenIdsAvsRefresh(
  actor,
  {
    isGM = defaultIsGM,
    getTokensForActor = defaultGetTokensForActor,
    scheduler = defaultScheduler,
    delayMs = 500,
    recalculateTokenIds = recalculateRuntimeAvsTokenIds,
    clearVisionCacheForTokenIds = defaultClearVisionCacheForTokenIds,
    warn = console.warn,
    reason = 'sense change',
  } = {},
) {
  try {
    if (!isGM()) return false;
    if (!actor || typeof actor !== 'object') return false;

    const tokenIds = Array.from(
      new Set((getTokensForActor(actor) || []).map(tokenIdOf).filter(Boolean)),
    );
    if (tokenIds.length === 0) return false;

    try {
      clearVisionCacheForTokenIds?.(tokenIds);
    } catch (error) {
      warn(`PF2E Visioner | Failed to clear VisionAnalyzer cache after ${reason}:`, error);
    }

    scheduler(async () => {
      try {
        await recalculateTokenIds(tokenIds);
      } catch (error) {
        warn(`PF2E Visioner | Failed to recalculate AVS after ${reason}:`, error);
      }
    }, delayMs);

    return true;
  } catch (error) {
    warn(`PF2E Visioner | Failed to schedule AVS refresh after ${reason}:`, error);
    return false;
  }
}

function schedulePreparedSenseMutationAvsRefresh(actor, options = {}) {
  if (actorPreparedSenseMutationTimers.has(actor)) return false;

  const scheduled = scheduleActorTokenIdsAvsRefresh(actor, {
    ...options,
    reason: 'prepared sense mutation',
    recalculateTokenIds: async (tokenIds) => {
      actorPreparedSenseMutationTimers.delete(actor);
      return (options.recalculateTokenIds ?? recalculateRuntimeAvsTokenIds)(tokenIds);
    },
  });

  if (scheduled) actorPreparedSenseMutationTimers.set(actor, true);
  return scheduled;
}

function watchPreparedSenseProperty(sense, property, onChange) {
  if (!sense || typeof sense !== 'object') return false;

  let watched = watchedPreparedSenseObjects.get(sense);
  if (!watched) {
    watched = { callbacks: new Set(), properties: new Set() };
    watchedPreparedSenseObjects.set(sense, watched);
  }
  watched.callbacks.add(onChange);
  if (watched.properties.has(property)) return true;

  const descriptor = Object.getOwnPropertyDescriptor(sense, property);
  if (descriptor?.configurable === false) return false;

  let current = descriptor?.get ? descriptor.get.call(sense) : sense[property];
  Object.defineProperty(sense, property, {
    configurable: true,
    enumerable: descriptor?.enumerable ?? true,
    get() {
      return descriptor?.get ? descriptor.get.call(this) : current;
    },
    set(next) {
      const previous = descriptor?.get ? descriptor.get.call(this) : current;
      if (descriptor?.set) {
        descriptor.set.call(this, next);
        current = descriptor?.get ? descriptor.get.call(this) : next;
      } else {
        current = next;
      }

      if (Object.is(previous, next)) return;
      for (const callback of watched.callbacks) callback(property, next, previous);
    },
  });

  watched.properties.add(property);
  return true;
}

export function watchActorPreparedSenses(
  actor,
  {
    isGM = defaultIsGM,
    warn = console.warn,
    ...scheduleOptions
  } = {},
) {
  try {
    if (!isGM()) return false;
    if (!actor || typeof actor !== 'object') return false;

    let watchedAny = false;
    const onChange = () =>
      schedulePreparedSenseMutationAvsRefresh(actor, {
        isGM,
        warn,
        ...scheduleOptions,
      });

    for (const [, sense] of getPreparedSenseEntries(actor?.perception?.senses)) {
      if (!sense || typeof sense !== 'object') continue;
      watchedAny = watchPreparedSenseProperty(sense, 'acuity', onChange) || watchedAny;
      watchedAny = watchPreparedSenseProperty(sense, 'range', onChange) || watchedAny;
    }

    return watchedAny;
  } catch (error) {
    warn('PF2E Visioner | Failed to watch prepared actor senses:', error);
    return false;
  }
}

export function watchCurrentScenePreparedSenses({
  tokens = globalThis.canvas?.tokens?.placeables,
  watchActor = watchActorPreparedSenses,
  ...watchOptions
} = {}) {
  const watchedActors = new Set();
  let watchedAny = false;

  for (const token of tokens || []) {
    const actor = token?.actor;
    if (!actor || watchedActors.has(actor)) continue;
    watchedActors.add(actor);
    watchedAny = watchActor(actor, watchOptions) || watchedAny;
  }

  return watchedAny;
}

export function captureActorPreparedSenseSnapshot(
  actor,
  { isGM = defaultIsGM, warn = console.warn } = {},
) {
  try {
    if (!isGM()) return false;
    if (!actor || typeof actor !== 'object') return false;

    actorPreparedSenseSnapshots.set(actor, buildPreparedSensesSignature(actor));
    return true;
  } catch (error) {
    warn('PF2E Visioner | Failed to capture prepared actor senses:', error);
    return false;
  }
}

export function scheduleActorPreparedSensesAvsRefresh(
  actor,
  changes,
  {
    isGM = defaultIsGM,
    getTokensForActor = defaultGetTokensForActor,
    scheduler = defaultScheduler,
    delayMs = 500,
    recalculateTokenIds = recalculateRuntimeAvsTokenIds,
    warn = console.warn,
  } = {},
) {
  void changes;

  try {
    if (!isGM()) return false;
    if (!actor || typeof actor !== 'object') return false;

    const tokenIds = Array.from(
      new Set((getTokensForActor(actor) || []).map(tokenIdOf).filter(Boolean)),
    );
    if (tokenIds.length === 0) return false;

    const hadSnapshot = actorPreparedSenseSnapshots.has(actor);
    const beforeSignature = hadSnapshot ? actorPreparedSenseSnapshots.get(actor) : null;

    scheduler(async () => {
      try {
        const afterSignature = buildPreparedSensesSignature(actor);
        actorPreparedSenseSnapshots.set(actor, afterSignature);
        watchActorPreparedSenses(actor, {
          isGM,
          getTokensForActor,
          scheduler,
          delayMs,
          recalculateTokenIds,
          warn,
        });
        if (hadSnapshot && afterSignature === beforeSignature) return;

        await recalculateTokenIds(tokenIds);
      } catch (error) {
        warn('PF2E Visioner | Failed to recalculate AVS after prepared sense change:', error);
      }
    }, delayMs);

    return true;
  } catch (error) {
    warn('PF2E Visioner | Failed to schedule prepared sense refresh:', error);
    return false;
  }
}

function withRuleElementSource(operation, ruleElementId) {
  return {
    ...operation,
    source: operation.source || ruleElementId,
  };
}

export function buildRuleElementRegistryValues(operations = []) {
  return operations
    .map((operation) => {
      switch (operation.type) {
        case 'distanceBasedVisibility':
          return 'distanceBasedVisibility';
        case 'overrideVisibility':
          return 'visibilityReplacement';
        case 'modifySenses':
          return 'originalSenses';
        case 'modifyLighting':
          return `lightingModification.${operation.source || 'lighting'}`;
        case 'offGuardSuppression':
          return 'offGuardSuppression';
        case 'auraVisibility':
          return 'auraVisibility';
        case 'shareVision':
          return 'visionSharing';
        default:
          return null;
      }
    })
    .filter(Boolean);
}

async function removeOperation(operation, token, ruleElementId, getOperationClass) {
  switch (operation.type) {
    case 'overrideVisibility':
    case 'conditionalState': {
      const OperationClass = await getOperationClass('VisibilityOverride');
      await OperationClass?.removeVisibilityOverride?.(operation, token, ruleElementId);
      break;
    }
    case 'distanceBasedVisibility': {
      const OperationClass = await getOperationClass('DistanceBasedVisibility');
      await OperationClass?.removeDistanceBasedVisibility?.(operation, token);
      break;
    }
    case 'overrideCover': {
      const OperationClass = await getOperationClass('CoverOverride');
      await OperationClass?.removeCoverOverride?.(operation, token, null);
      break;
    }
    case 'provideCover': {
      const OperationClass = await getOperationClass('CoverOverride');
      await OperationClass?.removeProvideCover?.(token);
      break;
    }
    case 'modifySenses': {
      const OperationClass = await getOperationClass('SenseModifier');
      await OperationClass?.restoreSenses?.(token, ruleElementId);
      break;
    }
    case 'modifyDetectionModes': {
      const OperationClass = await getOperationClass('DetectionModeModifier');
      await OperationClass?.restoreDetectionModes?.(token, ruleElementId);
      break;
    }
    case 'modifyActionQualification': {
      const OperationClass = await getOperationClass('ActionQualifier');
      await OperationClass?.removeActionQualifications?.(operation, token);
      break;
    }
    case 'modifyLighting': {
      const OperationClass = await getOperationClass('LightingModifier');
      await OperationClass?.removeLightingModification?.(operation, token);
      break;
    }
    case 'offGuardSuppression': {
      const OperationClass = await getOperationClass('OffGuardSuppression');
      await OperationClass?.removeOffGuardSuppression?.(operation, token);
      break;
    }
    case 'auraVisibility': {
      const OperationClass = await getOperationClass('AuraVisibility');
      await OperationClass?.removeAuraVisibility?.(operation, token);
      break;
    }
    case 'shareVision': {
      const OperationClass = await getOperationClass('ShareVision');
      await OperationClass?.removeShareVision?.(operation, token);
      break;
    }
  }
}

async function applyOperation(operation, token, ruleElementId, getOperationClass) {
  switch (operation.type) {
    case 'distanceBasedVisibility': {
      const OperationClass = await getOperationClass('DistanceBasedVisibility');
      await OperationClass?.applyDistanceBasedVisibility?.(operation, token);
      break;
    }
    case 'overrideVisibility': {
      const OperationClass = await getOperationClass('VisibilityOverride');
      await OperationClass?.applyVisibilityOverride?.(operation, token);
      break;
    }
    case 'modifySenses': {
      const OperationClass = await getOperationClass('SenseModifier');
      await OperationClass?.applySenseModifications?.(
        token,
        operation.senseModifications,
        ruleElementId,
        operation.predicate,
      );
      break;
    }
    case 'modifyLighting': {
      const OperationClass = await getOperationClass('LightingModifier');
      await OperationClass?.applyLightingModification?.(operation, token);
      break;
    }
    case 'offGuardSuppression': {
      const OperationClass = await getOperationClass('OffGuardSuppression');
      await OperationClass?.applyOffGuardSuppression?.(operation, token);
      break;
    }
    case 'auraVisibility': {
      const OperationClass = await getOperationClass('AuraVisibility');
      await OperationClass?.applyAuraVisibility?.(operation, token);
      break;
    }
    case 'shareVision': {
      const OperationClass = await getOperationClass('ShareVision');
      await OperationClass?.applyShareVision?.(operation, token);
      break;
    }
  }
}

async function clearRegisteredRuleElementFlags(token, registryKey) {
  const flagRegistry = token.document.getFlag(MODULE_ID, 'ruleElementRegistry') || {};
  const flagsToRemove = Array.isArray(flagRegistry[registryKey]) ? flagRegistry[registryKey] : [];
  const updates = {};

  for (const flagPath of flagsToRemove) {
    updates[`flags.${MODULE_ID}.${flagPath}`] = null;
  }

  if (Object.keys(updates).length > 0) {
    await token.document.update(updates);
  }
}

async function refreshTokenRuleElementState({
  item,
  token,
  operations,
  registryKey,
  ruleElementId,
  getOperationClass,
  warn,
}) {
  for (const operation of operations) {
    const operationWithSource = withRuleElementSource(operation, ruleElementId);
    try {
      await removeOperation(operationWithSource, token, ruleElementId, getOperationClass);
    } catch (error) {
      warn(
        `PF2E Visioner | updateItem: Failed to remove operation ${operationWithSource.type}:`,
        error,
      );
    }
  }

  await clearRegisteredRuleElementFlags(token, registryKey);

  for (const operation of operations) {
    const operationWithSource = withRuleElementSource(operation, ruleElementId);
    try {
      await applyOperation(operationWithSource, token, ruleElementId, getOperationClass);
    } catch (error) {
      warn(`PF2E Visioner | Failed to apply operation ${operation.type}:`, error);
    }
  }

  const newRegistry = token.document.getFlag(MODULE_ID, 'ruleElementRegistry') || {};
  newRegistry[registryKey] = buildRuleElementRegistryValues(operations);
  await token.document.setFlag(MODULE_ID, 'ruleElementRegistry', newRegistry);
}

export async function refreshVisionerRuleElementItem(
  item,
  tokens,
  {
    loadOperationClass = defaultLoadOperationClass,
    recalculateTokenIds = recalculateRuntimeAvsTokenIds,
    warn = console.warn,
  } = {},
) {
  const visionerRule = getVisionerRule(item);
  if (!visionerRule) return { refreshed: false, tokenCount: 0 };

  const operations = visionerRule.operations || [];
  const ruleElementId = `${item.id}-${visionerRule.slug || 'effect'}`;
  const registryKey = `item-${item.id}`;
  const operationClassCache = new Map();
  const getOperationClass = async (className) => {
    if (!operationClassCache.has(className)) {
      operationClassCache.set(className, await loadOperationClass(className));
    }
    return operationClassCache.get(className);
  };

  for (const token of tokens || []) {
    await refreshTokenRuleElementState({
      item,
      token,
      operations,
      registryKey,
      ruleElementId,
      getOperationClass,
      warn,
    });
  }

  await recalculateTokenIds((tokens || []).map((token) => token.id));

  return {
    refreshed: true,
    tokenCount: tokens?.length || 0,
  };
}

export function scheduleVisionerRuleElementItemRefresh(
  item,
  changes,
  {
    isGM = defaultIsGM,
    getTokensForActor = defaultGetTokensForActor,
    scheduler = defaultScheduler,
    delayMs = 500,
    refreshVisionerRuleElementItem: refreshItem = refreshVisionerRuleElementItem,
    warn = console.warn,
    ...refreshOptions
  } = {},
) {
  try {
    if (!isGM()) return false;
    if (!getVisionerRule(item)) return false;
    if (!hasRuleElementChanges(changes)) return false;

    const actor = item?.parent;
    if (!actor) return false;

    const tokens = getTokensForActor(actor);
    if (tokens.length === 0) return false;

    scheduler(async () => {
      try {
        await refreshItem(item, tokens, {
          warn,
          ...refreshOptions,
        });
      } catch (error) {
        warn('PF2E Visioner | Failed to process rule element update:', error);
      }
    }, delayMs);

    return true;
  } catch (error) {
    warn('PF2E Visioner | Failed to handle item update for rule elements:', error);
    return false;
  }
}

export function scheduleActorSenseChangeAvsRefresh(
  item,
  changes,
  {
    isGM = defaultIsGM,
    getTokensForActor = defaultGetTokensForActor,
    scheduler = defaultScheduler,
    delayMs = 500,
    recalculateTokenIds = recalculateRuntimeAvsTokenIds,
    warn = console.warn,
  } = {},
) {
  try {
    if (!isGM()) return false;
    if (!itemSenseChangeAffectsAvs(item, changes)) return false;

    const actor = item?.parent;
    if (!actor) return false;

    const tokenIds = Array.from(
      new Set((getTokensForActor(actor) || []).map(tokenIdOf).filter(Boolean)),
    );
    if (tokenIds.length === 0) return false;

    scheduler(async () => {
      try {
        watchActorPreparedSenses(actor, {
          isGM,
          getTokensForActor,
          scheduler,
          delayMs,
          recalculateTokenIds,
          warn,
        });
        await recalculateTokenIds(tokenIds);
      } catch (error) {
        warn('PF2E Visioner | Failed to recalculate AVS after sense item change:', error);
      }
    }, delayMs);

    return true;
  } catch (error) {
    warn('PF2E Visioner | Failed to schedule AVS sense item refresh:', error);
    return false;
  }
}

export function handleActorSenseChangeItemEvent(
  item,
  changes = null,
  options,
  userId,
  {
    scheduleActorSenseChangeAvsRefresh: scheduleSenseRefresh = scheduleActorSenseChangeAvsRefresh,
    warn = console.warn,
    ...scheduleOptions
  } = {},
) {
  void options;
  void userId;

  try {
    return {
      scheduled: scheduleSenseRefresh(item, changes, {
        warn,
        ...scheduleOptions,
      }),
    };
  } catch (error) {
    warn('PF2E Visioner | Failed to handle item sense change:', error);
    return { scheduled: false, reason: 'error' };
  }
}

export function handleVisionerRuleElementItemUpdate(
  item,
  changes,
  options,
  userId,
  {
    scheduleVisionerRuleElementItemRefresh: scheduleItemRefresh = scheduleVisionerRuleElementItemRefresh,
    warn = console.warn,
    ...scheduleOptions
  } = {},
) {
  void options;
  void userId;

  try {
    return {
      scheduled: scheduleItemRefresh(item, changes, {
        warn,
        ...scheduleOptions,
      }),
    };
  } catch (error) {
    warn('PF2E Visioner | Failed to handle item update for rule elements:', error);
    return { scheduled: false, reason: 'error' };
  }
}
