import { recalculateRuntimeAvsTokenIds } from '../services/avs-token-refresh.js';

const RULE_ELEMENT_KEY = 'PF2eVisionerEffect';
const MODULE_ID = 'pf2e-visioner';

function defaultIsGM() {
  return !!globalThis.game?.user?.isGM;
}

function defaultGetTokensForActor(actor) {
  return globalThis.canvas?.tokens?.placeables?.filter((token) => token.actor?.id === actor.id) || [];
}

function defaultScheduler(callback, delayMs) {
  return globalThis.setTimeout(callback, delayMs);
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
  return Object.keys(systemChanges).some((key) => key === 'rules' || key.startsWith('rules.'));
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
