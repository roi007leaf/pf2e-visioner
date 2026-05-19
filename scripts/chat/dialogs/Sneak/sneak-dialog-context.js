import { MODULE_ID } from '../../../constants.js';
import { ActionQualifier } from '../../../rule-elements/operations/ActionQualifier.js';
import { FeatsHandler } from '../../services/FeatsHandler.js';
import turnSneakTracker from '../../services/TurnSneakTracker.js';
import {
  applySneakVisualFilters,
  getSneakDialogFilteredOutcomes,
} from './sneak-dialog-filtering.js';
import {
  prepareSneakOutcomeContexts,
  recalculateSneakPositionOutcomes,
} from './sneak-outcome-context.js';

export async function prepareSneakDialogContext(app, context) {
  const movementType = getSneakMovementType(app.sneakingToken);

  await app._captureCurrentEndPositionsForOutcomes(app.outcomes);

  const filteredOutcomes = await getSneakDialogFilteredOutcomes(app, {
    includeDefeated: true,
    preserveOverrides: true,
  });

  await app._extractPositionTransitions(filteredOutcomes);
  await recalculateSneakPositionOutcomes(app, filteredOutcomes, {
    refreshLiveEndVisibility: true,
  });
  storeInitialAvsOutcomes(filteredOutcomes);

  const processedOutcomes = prepareSneakOutcomeContexts(app, filteredOutcomes, {
    currentVisibilityMode: 'dialog',
    includeOldVisibility: true,
    oldStatePreference: 'currentFirst',
    useSneakerOverrideFlags: true,
  });
  let sortedOutcomes = app._sortOutcomesByQualification(
    applySneakVisualFilters(processedOutcomes, {
      hideFoundryHidden: app.hideFoundryHidden,
    }),
  );
  sortedOutcomes = applySneakVisualFilters(sortedOutcomes, {
    showChangesOnly: app.showChangesOnly,
  });

  syncSneakActionableState(app, sortedOutcomes);
  assignSneakBaseContext(app, context, sortedOutcomes);
  assignSneakBulkContext(app, context, sortedOutcomes);

  app.outcomes = processedOutcomes;
  context.sneakDistance = await buildSneakDistanceContext(app, movementType);
  context.prereqBadges = await buildSneakPrereqBadges(app, movementType, processedOutcomes);
  assignSneakDeferredContext(app, context, processedOutcomes);

  Object.assign(context, app.buildCommonContext(processedOutcomes));
  context.sneakAllowExtendedEndStates = game.settings.get(
    'pf2e-visioner',
    'sneakAllowHiddenUndetectedEndPosition',
  );

  return context;
}

export function getSneakMovementType(sneakingToken) {
  try {
    const raw = sneakingToken?.document?.movementAction || sneakingToken?.document?.movementType;
    const value = String(raw || '').toLowerCase();
    if (['walk', 'land', 'ground', 'move'].includes(value)) return 'walk';
    if (['stride'].includes(value)) return 'stride';
    if (['leap'].includes(value)) return 'leap';
    if (['climb'].includes(value)) return 'climb';
    if (['fly', 'flying'].includes(value)) return 'fly';
    if (['swim'].includes(value)) return 'swim';
    if (['burrow'].includes(value)) return 'burrow';
    if (['teleport'].includes(value)) return 'teleport';
    if (['deploy'].includes(value)) return 'deploy';
    if (['travel'].includes(value)) return 'travel';
  } catch {
    /* Default to walk */
  }

  return 'walk';
}

function storeInitialAvsOutcomes(outcomes) {
  outcomes.forEach((outcome) => {
    if (outcome._initialAVSOutcome) return;

    outcome._initialAVSOutcome = {
      newVisibility: outcome.newVisibility,
      outcome: outcome.outcome,
      rollTotal: outcome.rollTotal,
    };
  });
}

function syncSneakActionableState(app, sortedOutcomes) {
  sortedOutcomes.forEach((processedOutcome, index) => {
    if (app.outcomes[index]) {
      app.outcomes[index].hasActionableChange = processedOutcome.hasActionableChange;
    }
  });
}

function assignSneakBaseContext(app, context, sortedOutcomes) {
  context.sneaker = {
    name: app.sneakingToken.name,
    image: app.resolveTokenImage(app.sneakingToken),
    actionType: 'sneak',
    actionLabel: app.isEndOfTurnDialog
      ? 'End-of-turn position validation for Sneaky/Very Sneaky feat'
      : 'Enhanced sneak action results with position tracking',
  };

  context.sneakingToken = app.sneakingToken;
  context.outcomes = sortedOutcomes;
  context.ignoreAllies = !!app.ignoreAllies;
  context.hideFoundryHidden = !!app.hideFoundryHidden;
  context.showChangesOnly = !!app.showChangesOnly;
  context.isEndOfTurnDialog = app.isEndOfTurnDialog;
  context.hasPositionData = app._hasPositionData;
  context.positionDisplayMode = app._positionDisplayMode;
  app._lastRenderedOutcomes = sortedOutcomes;
}

function assignSneakBulkContext(app, context, sortedOutcomes) {
  const hasSneakyFeat = turnSneakTracker.hasSneakyFeat(app.sneakingToken);
  const deferableOutcomes = sortedOutcomes.filter(
    (outcome) => outcome.canDefer && !outcome.isDeferred,
  );
  const deferredOutcomes = sortedOutcomes.filter(
    (outcome) => outcome.isDeferred || app._deferredChecks?.has(outcome.token?.id),
  );

  context.canBulkDefer = hasSneakyFeat && !app.isEndOfTurnDialog;
  context.hasDeferableTokens = deferableOutcomes.length > 0;
  context.canBulkUndefer = hasSneakyFeat && !app.isEndOfTurnDialog;
  context.hasDeferredTokens = deferredOutcomes.length > 0;
  context.canProcessEndTurn =
    hasSneakyFeat && !app.isEndOfTurnDialog && deferredOutcomes.length > 0;
  context.deferredChecksCount = deferredOutcomes.length;
}

async function buildSneakDistanceContext(app, movementType) {
  try {
    const { SneakSpeedService } = await import('../../services/SneakSpeedService.js');
    const actor = app.sneakingToken?.actor || app.sneakingToken;
    const baseSpeed = Number(actor?.system?.movement?.speeds?.land?.value ?? 0) || 0;
    const originalSpeed = getOriginalSneakSpeed(app, baseSpeed);
    const maxFeet = await SneakSpeedService.getSneakMaxDistanceFeet(app.sneakingToken);
    const { multiplier, bonusFeet } = getSneakDistanceFeatParts(app);
    const rawTotal = Math.floor(originalSpeed * multiplier) + (bonusFeet || 0);
    const movementLabel = game.i18n.localize(`PF2E_VISIONER.MOVEMENT.${movementType}`);
    const { supported, speedVal } = getSneakMovementSupport(actor, movementType);

    return {
      maxFeet,
      baseSpeed: originalSpeed,
      multiplier,
      bonusFeet,
      tooltip: buildSneakDistanceTooltip(originalSpeed, multiplier, bonusFeet, rawTotal),
      movementType,
      movementLabel,
      movementIcon: getSneakMovementIcon(movementType),
      supported,
      speed: speedVal,
      statusClass: supported ? 'ok' : 'warn',
      supportTooltip: supported
        ? `${movementLabel} speed: ${speedVal} ft`
        : `${movementLabel} speed unavailable for this actor`,
    };
  } catch {
    return undefined;
  }
}

function getOriginalSneakSpeed(app, baseSpeed) {
  try {
    const flagVal = app.sneakingToken?.actor?.getFlag?.(MODULE_ID, 'sneak-original-walk-speed');
    if (Number.isFinite(Number(flagVal)) && Number(flagVal) > 0) return Number(flagVal);
  } catch {
    /* Use base speed */
  }

  return baseSpeed;
}

function getSneakDistanceFeatParts(app) {
  let multiplier = 0.5;
  let bonusFeet = 0;

  try {
    multiplier = FeatsHandler.getSneakSpeedMultiplier(app.sneakingToken) ?? 0.5;
    bonusFeet = FeatsHandler.getSneakDistanceBonusFeet(app.sneakingToken) ?? 0;
  } catch {
    /* Defaults */
  }

  return { multiplier, bonusFeet };
}

function buildSneakDistanceTooltip(originalSpeed, multiplier, bonusFeet, rawTotal) {
  const explanations = [`Base Speed: ${originalSpeed} ft`, `Sneak Multiplier: x${multiplier}`];
  if (bonusFeet) explanations.push(`Feat Bonus: +${bonusFeet} ft`);
  if (rawTotal > originalSpeed) {
    explanations.push(`Capped at base Speed (${originalSpeed} ft)`);
  }

  return explanations.join('\n');
}

function getSneakMovementIcon(movementType) {
  switch (movementType) {
    case 'stride':
      return 'fas fa-running';
    case 'leap':
      return 'fas fa-person-running';
    case 'climb':
      return 'fas fa-mountain';
    case 'fly':
      return 'fas fa-feather';
    case 'swim':
      return 'fas fa-person-swimming';
    case 'burrow':
      return 'fas fa-person-digging';
    case 'teleport':
      return 'fas fa-bolt';
    case 'travel':
      return 'fas fa-route';
    case 'deploy':
      return 'fas fa-box-open';
    case 'walk':
    default:
      return 'fas fa-person-walking';
  }
}

function getSneakMovementSupport(actor, movementType) {
  try {
    const speeds = actor?.system?.movement?.speeds || {};
    const key = movementType === 'walk' ? 'land' : movementType;
    const speedVal = Number(speeds?.[key]?.value ?? 0) || 0;
    return { supported: speedVal > 0, speedVal };
  } catch {
    return { supported: true, speedVal: 0 };
  }
}

async function buildSneakPrereqBadges(app, movementType, processedOutcomes) {
  try {
    const badges = [];
    const actorOrToken = app.sneakingToken;
    const has = (slug) => hasSneakFeat(actorOrToken, slug);

    addSneakyBadge(badges, actorOrToken, has);
    addCeaselessShadowsBadge(badges, has);
    await addCamouflageBadge(badges, actorOrToken, has);
    addLegendarySneakBadge(badges, has);
    addVeryVerySneakyBadge(badges, has);
    await addTerrainStalkerBadge(badges, actorOrToken, has, movementType);
    await addVanishIntoTheLandBadge(badges, actorOrToken, has, movementType);
    addDistractingShadowsBadge(badges, has);
    addSneakAdeptBadge(badges, processedOutcomes);
    addSneakRuleElementBadges(app, badges);

    return badges;
  } catch {
    return [];
  }
}

function hasSneakFeat(actorOrToken, slug) {
  try {
    return FeatsHandler.hasFeat(actorOrToken, slug);
  } catch {
    return false;
  }
}

function addSneakyBadge(badges, actorOrToken, has) {
  if (!has('sneaky') && !has('very-sneaky')) return;

  const isVery = has('very-sneaky');
  const turnState = turnSneakTracker.getTurnSneakState(actorOrToken);
  const sneakCount = turnState?.sneakActions?.length || 0;
  badges.push({
    key: isVery ? 'very-sneaky' : 'sneaky',
    icon: 'fas fa-user-ninja',
    label: isVery ? 'Very Sneaky' : 'Sneaky',
    tooltip:
      sneakCount > 1
        ? `${isVery ? 'Very Sneaky' : 'Sneaky'} feat active - End position checks deferred to turn end (${sneakCount} consecutive sneaks this turn)`
        : `${isVery ? 'Very Sneaky' : 'Sneaky'} feat available - Consecutive sneaks will defer end position checks`,
  });
}

function addCeaselessShadowsBadge(badges, has) {
  if (!has('ceaseless-shadows')) return;

  badges.push({
    key: 'ceaseless-shadows',
    icon: 'fas fa-infinity',
    label: game.i18n.localize(
      'PF2E_VISIONER.SNEAK_AUTOMATION.BADGES.CEASELESS_SHADOWS_LABEL',
    ),
    tooltip: game.i18n.localize(
      'PF2E_VISIONER.SNEAK_AUTOMATION.BADGES.CEASELESS_SHADOWS_TOOLTIP',
    ),
  });
}

async function addCamouflageBadge(badges, actorOrToken, has) {
  try {
    if (!has('camouflage')) return;

    const env = (await import('../../../utils/environment.js')).default;
    const naturalTerrains = [
      'aquatic',
      'arctic',
      'desert',
      'forest',
      'mountain',
      'plains',
      'sky',
      'swamp',
      'underground',
    ];
    const inNaturalTerrain = naturalTerrains.some((terrain) =>
      env.isEnvironmentActive(actorOrToken, terrain),
    );
    if (!inNaturalTerrain) return;

    badges.push({
      key: 'camouflage',
      icon: 'fas fa-tree',
      label: game.i18n.localize('PF2E_VISIONER.SNEAK_AUTOMATION.BADGES.CAMOUFLAGE_LABEL'),
      tooltip: game.i18n.localize(
        'PF2E_VISIONER.SNEAK_AUTOMATION.BADGES.CAMOUFLAGE_TOOLTIP',
      ),
    });
  } catch {
    /* Optional environment badge */
  }
}

function addLegendarySneakBadge(badges, has) {
  if (!has('legendary-sneak')) return;

  badges.push({
    key: 'legendary-sneak',
    icon: 'fas fa-shoe-prints',
    label: game.i18n.localize('PF2E_VISIONER.SNEAK_AUTOMATION.BADGES.LEGENDARY_SNEAK_LABEL'),
    tooltip: game.i18n.localize(
      'PF2E_VISIONER.SNEAK_AUTOMATION.BADGES.LEGENDARY_SNEAK_TOOLTIP',
    ),
  });
}

function addVeryVerySneakyBadge(badges, has) {
  if (!has('very-very-sneaky')) return;

  badges.push({
    key: 'very-very-sneaky',
    icon: 'fas fa-user-ninja',
    label: game.i18n.localize('PF2E_VISIONER.SNEAK_AUTOMATION.BADGES.VERY_VERY_SNEAKY_LABEL'),
    tooltip: game.i18n.localize(
      'PF2E_VISIONER.SNEAK_AUTOMATION.BADGES.VERY_VERY_SNEAKY_TOOLTIP',
    ),
  });
}

async function addTerrainStalkerBadge(badges, actorOrToken, has, movementType) {
  try {
    if (!has('terrain-stalker')) return;

    const selections = FeatsHandler.getTerrainStalkerSelections(actorOrToken) || [];
    const active = selections.filter((selection) => {
      try {
        return FeatsHandler.isEnvironmentActive(actorOrToken, selection);
      } catch {
        return false;
      }
    });
    if (!active.length) return;

    const environmentsText = await getSneakEnvironmentText(actorOrToken, movementType);
    badges.push({
      key: 'terrain-stalker',
      icon: 'fas fa-tree',
      label: game.i18n.localize(
        'PF2E_VISIONER.SNEAK_AUTOMATION.BADGES.TERRAIN_STALKER_LABEL',
      ),
      tooltip: game.i18n.format(
        'PF2E_VISIONER.SNEAK_AUTOMATION.BADGES.TERRAIN_STALKER_TOOLTIP',
        { selection: active.join(', '), environments: environmentsText },
      ),
    });
  } catch {
    /* Optional terrain-stalker badge */
  }
}

async function getSneakEnvironmentText(actorOrToken, movementType) {
  try {
    const env = (await import('../../../utils/environment.js')).default;
    const ctx = env.getActiveContext(actorOrToken, { movementType }) || {};
    const regionTypes = Array.from(ctx.regionTypes || []);
    const sceneFallback = Array.from(ctx.sceneTypes || []);
    const envList = regionTypes.length ? regionTypes : sceneFallback;
    return envList.length ? envList.join(', ') : '--';
  } catch {
    return '--';
  }
}

async function addVanishIntoTheLandBadge(badges, actorOrToken, has, movementType) {
  try {
    if (!has('vanish-into-the-land')) return;

    const selections = FeatsHandler.getTerrainStalkerSelections(actorOrToken) || [];
    let active = false;
    for (const selection of selections) {
      try {
        const env = (await import('../../../utils/environment.js')).default;
        const matches =
          env.getMatchingEnvironmentRegions(actorOrToken, selection, { movementType }) || [];
        if (matches.length > 0) {
          active = true;
          break;
        }
      } catch {
        active = active || FeatsHandler.isEnvironmentActive(actorOrToken, selection);
      }
    }
    if (!active) return;

    badges.push({
      key: 'vanish-into-the-land',
      icon: 'fas fa-leaf',
      label: game.i18n.localize(
        'PF2E_VISIONER.SNEAK_AUTOMATION.BADGES.VANISH_INTO_THE_LAND_LABEL',
      ),
      tooltip: game.i18n.localize(
        'PF2E_VISIONER.SNEAK_AUTOMATION.BADGES.VANISH_INTO_THE_LAND_TOOLTIP',
      ),
    });
  } catch {
    /* Optional vanish badge */
  }
}

function addDistractingShadowsBadge(badges, has) {
  if (!has('distracting-shadows')) return;

  badges.push({
    key: 'distracting-shadows',
    icon: 'fas fa-users',
    label: game.i18n.localize(
      'PF2E_VISIONER.SNEAK_AUTOMATION.BADGES.DISTRACTING_SHADOWS_LABEL',
    ),
    tooltip: game.i18n.localize(
      'PF2E_VISIONER.SNEAK_AUTOMATION.BADGES.DISTRACTING_SHADOWS_TOOLTIP',
    ),
  });
}

function addSneakAdeptBadge(badges, processedOutcomes) {
  try {
    if (!processedOutcomes.some((outcome) => outcome.sneakAdeptApplied)) return;

    badges.push({
      key: 'sneak-adept',
      icon: 'fas fa-arrow-up',
      label: game.i18n.localize('PF2E_VISIONER.SNEAK_ADEPT_FEAT.OUTCOME_UPGRADED'),
      tooltip: game.i18n.localize('PF2E_VISIONER.SNEAK_ADEPT_FEAT.TOOLTIP'),
    });
  } catch {
    /* Optional sneak adept badge */
  }
}

function addSneakRuleElementBadges(app, badges) {
  try {
    const ruleMessages = ActionQualifier.getCustomMessages(app.sneakingToken, 'sneak');
    if (!ruleMessages?.length) return;

    ruleMessages.forEach((message) => {
      badges.push({
        key: 'rule-element-sneak',
        icon: 'fas fa-scroll',
        label: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.BADGE.LABEL'),
        tooltip: message,
      });
    });
  } catch {
    /* Optional rule-element badges */
  }
}

function assignSneakDeferredContext(app, context, processedOutcomes) {
  try {
    const turnState = turnSneakTracker?.getTurnSneakState?.(app.sneakingToken);
    if (!turnState?.isActive) return;

    const hasSneakyFeat = turnSneakTracker.hasSneakyFeat(app.sneakingToken);
    const hasAnyDeferredChecks = processedOutcomes.some((outcome) =>
      turnSneakTracker.shouldDeferEndPositionCheck(app.sneakingToken, outcome.token),
    );

    if (hasSneakyFeat && hasAnyDeferredChecks) {
      context.hasDeferredChecks = true;
      context.consecutiveSneaks = turnState.sneakActions?.length || 1;
    }
  } catch {
    /* Optional deferred context */
  }
}
