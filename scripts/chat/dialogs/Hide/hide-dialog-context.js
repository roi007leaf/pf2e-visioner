import { MODULE_TITLE } from '../../../constants.js';
import { ActionQualifier } from '../../../rule-elements/operations/ActionQualifier.js';
import {
  canAttemptHideOrRemainHidden,
  legacyVisibilityToProfile,
} from '../../../visibility/perception-profile.js';
import { getDefaultNewStateFor } from '../../services/data/action-state-config.js';
import { getVisibilityStateConfig } from '../../services/data/visibility-states.js';
import { notify } from '../../services/infra/notifications.js';
import { hasActiveEncounter } from '../../services/infra/shared-utils.js';
import { getHideOverrideVisibility, getTokensForActor } from './hide-override-visibility.js';

const HIDE_ENCOUNTER_EMPTY_MESSAGE = 'No encounter observers found for this action';

export async function prepareHideDialogContext(app, context) {
  let filteredOutcomes = await getBaseFilteredHideOutcomes(app, { includeDefeated: true });
  await applyHidePositionQualification(app, filteredOutcomes);

  if (app.encounterOnly && hasActiveEncounter() && filteredOutcomes.length === 0) {
    notify.info(`${MODULE_TITLE}: ${HIDE_ENCOUNTER_EMPTY_MESSAGE}`);
  }

  filteredOutcomes = preserveHideOverrideSelections(filteredOutcomes, app.outcomes);

  const processedOutcomes = applyHideVisualFilters(
    app,
    processHideDialogOutcomes(app, filteredOutcomes),
  );
  context.prereqBadges = await buildHidePrereqBadges(app);

  app.outcomes = processedOutcomes;

  context.actorToken = app.actorToken;
  context.actorTokenImage = app.resolveTokenImage(app.actorToken);
  context.outcomes = processedOutcomes;
  context.ignoreAllies = !!app.ignoreAllies;
  context.hideFoundryHidden = !!app.hideFoundryHidden;
  context.hasPositionData = processedOutcomes.some((outcome) => outcome.hasPositionData);
  Object.assign(context, app.buildCommonContext(processedOutcomes));

  return context;
}

export async function getHideDialogFilteredOutcomes(app) {
  try {
    const filtered = await getBaseFilteredHideOutcomes(app, { includeDefeated: false });
    if (!Array.isArray(filtered)) return [];

    return applyHideVisualFilters(app, mergeHideFilteredOutcomes(app, filtered));
  } catch {
    return Array.isArray(app.outcomes) ? app.outcomes : [];
  }
}

async function getBaseFilteredHideOutcomes(app, { includeDefeated }) {
  let filteredOutcomes = app.applyEncounterFilter(
    getHideBaseOutcomeList(app),
    'target',
    HIDE_ENCOUNTER_EMPTY_MESSAGE,
  );

  try {
    const { filterOutcomesByAllies } = await import('../../services/infra/shared-utils.js');
    filteredOutcomes = filterOutcomesByAllies(
      filteredOutcomes,
      app.actorToken,
      app.ignoreAllies,
      'target',
    );
  } catch {
    /* Ally filtering is non-critical */
  }

  if (app.filterByDetection && app.actorToken) {
    try {
      const { filterOutcomesByDetection } = await import('../../services/infra/shared-utils.js');
      filteredOutcomes = await filterOutcomesByDetection(
        filteredOutcomes,
        app.actorToken,
        'target',
        false,
        true,
        'target_to_observer',
      );
    } catch {
      /* Viewport filtering is non-critical */
    }
  }

  if (includeDefeated) {
    try {
      const { filterOutcomesByDefeated } = await import('../../services/infra/shared-utils.js');
      filteredOutcomes = filterOutcomesByDefeated(filteredOutcomes, 'target');
    } catch {
      /* Defeated filtering is non-critical */
    }
  }

  return filteredOutcomes;
}

function getHideBaseOutcomeList(app) {
  return Array.isArray(app._originalOutcomes) ? app._originalOutcomes : app.outcomes || [];
}

async function applyHidePositionQualification(app, filteredOutcomes) {
  try {
    const { default: positionTracker } = await import(
      '../../services/position/PositionTracker.js'
    );
    const hider = app.actorToken;

    for (const outcome of filteredOutcomes) {
      try {
        const endPos = await positionTracker._capturePositionState(
          hider,
          outcome.target,
          Date.now(),
          { forceFresh: true, useCurrentPositionForCover: true },
        );
        let qualifies = app._endPositionQualifiesForHide(endPos);
        qualifies = await applyHideFeatQualification(hider, outcome, endPos, qualifies);
        qualifies = await applyHideRuleQualification(hider, qualifies);

        const baseOldState = outcome.oldVisibility || outcome.currentVisibility;
        const baseCalculated =
          getDefaultNewStateFor('hide', baseOldState, outcome.outcome) || baseOldState;

        outcome._calculatedNewVisibility = baseCalculated;
        outcome.positionDisplay = {
          endPosition: {
            visibility: endPos.effectiveVisibility,
            cover: endPos.coverState,
            qualifies,
          },
        };
        outcome.hasPositionData = true;
        outcome.positionTransition = {
          endPosition: {
            effectiveVisibility: endPos.effectiveVisibility,
            coverState: endPos.coverState,
          },
        };

        if (!qualifies) {
          outcome.newVisibility = 'avs';
          outcome.overrideState = null;
        } else {
          outcome.newVisibility = baseCalculated;
        }
      } catch {
        /* Position data is optional */
      }
    }
  } catch {
    /* Optional position tracker */
  }
}

async function applyHideFeatQualification(hider, outcome, endPos, qualifies) {
  try {
    const { FeatsHandler } = await import('../../services/FeatsHandler.js');
    const startVisibility = outcome.oldVisibility || outcome.currentVisibility || 'observed';
    const endVisibility = endPos?.effectiveVisibility || startVisibility;
    const endCoverState = endPos?.coverState || 'none';
    const startProfile = legacyVisibilityToProfile(startVisibility, { coverState: endCoverState });
    const base = {
      startQualifies: canAttemptHideOrRemainHidden(startProfile),
      endQualifies: qualifies,
      bothQualify: false,
      reason: 'Hide (dialog) prerequisites',
    };
    base.bothQualify = base.startQualifies && base.endQualifies;

    const overridden = FeatsHandler.overridePrerequisites(hider, base, {
      startVisibility,
      endVisibility,
      endCoverState,
    });
    outcome.positionQualification = overridden;

    return overridden.endQualifies || qualifies;
  } catch {
    return qualifies;
  }
}

async function applyHideRuleQualification(hider, qualifies) {
  try {
    const { ActionQualificationIntegration } = await import(
      '../../../rule-elements/ActionQualificationIntegration.js'
    );
    const ruleResult = await ActionQualificationIntegration.checkHideWithRuleElements(hider, {
      startQualifies: true,
      endQualifies: qualifies,
      bothQualify: qualifies,
      reason: 'Hide (dialog) prerequisites',
    });

    return ruleResult.endQualifies || qualifies;
  } catch {
    return qualifies;
  }
}

function preserveHideOverrideSelections(filteredOutcomes, previousOutcomes) {
  try {
    const previousByTarget = indexOutcomesByTarget(previousOutcomes);
    return filteredOutcomes.map((outcome) => {
      const existing = previousByTarget.get(outcome?.target?.id);
      const overrideState = existing?.overrideState ?? outcome?.overrideState ?? null;
      return { ...outcome, overrideState };
    });
  } catch {
    return filteredOutcomes;
  }
}

function processHideDialogOutcomes(app, filteredOutcomes) {
  const hidingTokens = getTokensForActor(app.actorToken?.actor?.id);

  return filteredOutcomes.map((outcome) => {
    const observerId = outcome.target?.document?.id || outcome.target?.id;
    let currentVisibility = outcome.oldVisibility || outcome.currentVisibility;
    currentVisibility = getHideOverrideVisibility(hidingTokens, observerId) || currentVisibility;

    const availableStates = app.getAvailableStatesForOutcome(outcome);
    const effectiveNewState = outcome.overrideState ?? outcome.newVisibility;
    const isOldStateAvsControlled = app.isOldStateAvsControlled(outcome);
    const hasActionableChange = getHideActionableChange(
      isOldStateAvsControlled,
      currentVisibility,
      effectiveNewState,
    );

    return {
      ...outcome,
      oldVisibility: currentVisibility,
      positionDisplay: outcome.positionDisplay,
      hasPositionData: !!outcome.hasPositionData,
      availableStates,
      hasActionableChange,
      calculatedOutcome: outcome.newVisibility,
      tokenImage: app.resolveTokenImage(outcome.target),
      outcomeClass: app.getOutcomeClass(outcome.outcome),
      outcomeLabel: app.getOutcomeLabel(outcome.outcome),
      marginText: app.formatMargin(outcome.margin),
      oldVisibilityState: getVisibilityStateConfig(currentVisibility),
      newVisibilityState: getVisibilityStateConfig(effectiveNewState),
      isOldStateAvsControlled,
    };
  });
}

function getHideActionableChange(isOldStateAvsControlled, oldState, effectiveNewState) {
  if (isOldStateAvsControlled && effectiveNewState === 'avs') return false;
  if (isOldStateAvsControlled) return true;

  return oldState !== effectiveNewState;
}

function mergeHideFilteredOutcomes(app, filteredOutcomes) {
  const existingByTarget = indexOutcomesByTarget(app.outcomes);

  return filteredOutcomes.map((outcome) => {
    try {
      const existing = existingByTarget.get(outcome?.target?.id);
      const overrideState = existing?.overrideState ?? outcome?.overrideState ?? null;
      const currentVisibility =
        existing?.oldVisibility ??
        existing?.currentVisibility ??
        outcome.oldVisibility ??
        outcome.currentVisibility ??
        null;
      const newVisibility = existing?.newVisibility ?? outcome.newVisibility ?? currentVisibility;
      const effectiveNewState = overrideState ?? newVisibility ?? currentVisibility;
      const mergedOutcome = { ...outcome, ...existing, overrideState, newVisibility };
      const isOldStateAvsControlled = app.isOldStateAvsControlled(mergedOutcome);
      let hasActionableChange = false;

      if (effectiveNewState === 'avs' && app.isCurrentStateAvsControlled(mergedOutcome)) {
        hasActionableChange = false;
      } else {
        const statesMatch =
          currentVisibility != null &&
          effectiveNewState != null &&
          effectiveNewState === currentVisibility;
        hasActionableChange =
          (currentVisibility != null &&
            effectiveNewState != null &&
            effectiveNewState !== currentVisibility) ||
          (statesMatch && isOldStateAvsControlled);
      }

      return { ...mergedOutcome, hasActionableChange };
    } catch {
      return { ...outcome };
    }
  });
}

function applyHideVisualFilters(app, outcomes) {
  let visualOutcomes = outcomes;

  try {
    if (app.hideFoundryHidden) {
      visualOutcomes = visualOutcomes.filter((outcome) => {
        try {
          return outcome?._isWall || outcome?.target?.document?.hidden !== true;
        } catch {
          return true;
        }
      });
    }
  } catch {
    /* Visual filter is optional */
  }

  try {
    if (app.showOnlyChanges) {
      visualOutcomes = visualOutcomes.filter((outcome) => !!outcome.hasActionableChange);
    }
  } catch {
    /* Visual filter is optional */
  }

  return visualOutcomes;
}

async function buildHidePrereqBadges(app) {
  try {
    const { FeatsHandler } = await import('../../services/FeatsHandler.js');
    const has = (slug) => {
      try {
        return FeatsHandler.hasFeat(app.actorToken, slug);
      } catch {
        return false;
      }
    };
    const badges = [];

    addStaticFeatBadges(badges, has);
    await addCamouflageBadge(app, badges, has);
    await addTerrainStalkerBadge(app, badges, has, FeatsHandler);
    await addVanishIntoTheLandBadge(app, badges, has, FeatsHandler);
    addDistractingShadowsBadge(badges, has);
    addHideRuleElementBadges(app, badges);

    return badges;
  } catch {
    return [];
  }
}

function addStaticFeatBadges(badges, has) {
  if (has('ceaseless-shadows')) {
    badges.push({
      key: 'ceaseless-shadows',
      icon: 'fas fa-infinity',
      label: game.i18n.localize('PF2E_VISIONER.HIDE_AUTOMATION.BADGES.CEASELESS_SHADOWS_LABEL'),
      tooltip: game.i18n.localize(
        'PF2E_VISIONER.HIDE_AUTOMATION.BADGES.CEASELESS_SHADOWS_TOOLTIP',
      ),
    });
  }

  if (has('legendary-sneak')) {
    badges.push({
      key: 'legendary-sneak',
      icon: 'fas fa-shoe-prints',
      label: game.i18n.localize('PF2E_VISIONER.HIDE_AUTOMATION.BADGES.LEGENDARY_SNEAK_LABEL'),
      tooltip: game.i18n.localize(
        'PF2E_VISIONER.HIDE_AUTOMATION.BADGES.LEGENDARY_SNEAK_TOOLTIP',
      ),
    });
  }

  if (has('very-very-sneaky')) {
    badges.push({
      key: 'very-very-sneaky',
      icon: 'fas fa-user-ninja',
      label: game.i18n.localize('PF2E_VISIONER.HIDE_AUTOMATION.BADGES.VERY_VERY_SNEAKY_LABEL'),
      tooltip: game.i18n.localize(
        'PF2E_VISIONER.HIDE_AUTOMATION.BADGES.VERY_VERY_SNEAKY_TOOLTIP',
      ),
    });
  }
}

async function addCamouflageBadge(app, badges, has) {
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
      env.isEnvironmentActive(app.actorToken, terrain),
    );
    if (!inNaturalTerrain) return;

    badges.push({
      key: 'camouflage',
      icon: 'fas fa-tree',
      label: game.i18n.localize('PF2E_VISIONER.HIDE_AUTOMATION.BADGES.CAMOUFLAGE_LABEL'),
      tooltip: game.i18n.localize('PF2E_VISIONER.HIDE_AUTOMATION.BADGES.CAMOUFLAGE_TOOLTIP'),
    });
  } catch {
    /* Optional environment badge */
  }
}

async function addTerrainStalkerBadge(app, badges, has, FeatsHandler) {
  try {
    if (!has('terrain-stalker')) return;

    const selections = FeatsHandler.getTerrainStalkerSelections(app.actorToken) || [];
    const active = selections.filter((selection) => {
      try {
        return FeatsHandler.isEnvironmentActive(app.actorToken, selection);
      } catch {
        return false;
      }
    });
    if (!active.length) return;

    const environmentsText = await getActiveEnvironmentText(app);
    badges.push({
      key: 'terrain-stalker',
      icon: 'fas fa-tree',
      label: game.i18n.localize(
        'PF2E_VISIONER.HIDE_AUTOMATION.BADGES.TERRAIN_STALKER_LABEL',
      ),
      tooltip: game.i18n.format(
        'PF2E_VISIONER.HIDE_AUTOMATION.BADGES.TERRAIN_STALKER_TOOLTIP',
        { selection: active.join(', '), environments: environmentsText },
      ),
    });
  } catch {
    /* Optional terrain-stalker badge */
  }
}

async function getActiveEnvironmentText(app) {
  try {
    const env = (await import('../../../utils/environment.js')).default;
    const ctx = env.getActiveContext(app.actorToken) || {};
    const regionTypes = Array.from(ctx.regionTypes || []);
    const sceneFallback = Array.from(ctx.sceneTypes || []);
    const envList = regionTypes.length ? regionTypes : sceneFallback;

    return envList.length ? envList.join(', ') : '--';
  } catch {
    return '--';
  }
}

async function addVanishIntoTheLandBadge(app, badges, has, FeatsHandler) {
  try {
    if (!has('vanish-into-the-land')) return;

    const selections = FeatsHandler.getTerrainStalkerSelections(app.actorToken) || [];
    let active = false;

    for (const selection of selections) {
      try {
        const env = (await import('../../../utils/environment.js')).default;
        const matches = env.getMatchingEnvironmentRegions(app.actorToken, selection) || [];
        if (matches.length > 0) {
          active = true;
          break;
        }
      } catch {
        active = active || FeatsHandler.isEnvironmentActive(app.actorToken, selection);
        if (active) break;
      }
    }
    if (!active) return;

    badges.push({
      key: 'vanish-into-the-land',
      icon: 'fas fa-leaf',
      label: game.i18n.localize(
        'PF2E_VISIONER.HIDE_AUTOMATION.BADGES.VANISH_INTO_THE_LAND_LABEL',
      ),
      tooltip: game.i18n.localize(
        'PF2E_VISIONER.HIDE_AUTOMATION.BADGES.VANISH_INTO_THE_LAND_TOOLTIP',
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
      'PF2E_VISIONER.HIDE_AUTOMATION.BADGES.DISTRACTING_SHADOWS_LABEL',
    ),
    tooltip: game.i18n.localize(
      'PF2E_VISIONER.HIDE_AUTOMATION.BADGES.DISTRACTING_SHADOWS_TOOLTIP',
    ),
  });
}

function addHideRuleElementBadges(app, badges) {
  try {
    const ruleMessages = ActionQualifier.getCustomMessages(app.hidingToken, 'hide');
    if (!ruleMessages?.length) return;

    ruleMessages.forEach((message) => {
      badges.push({
        key: 'rule-element-hide',
        icon: 'fas fa-scroll',
        label: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.BADGE.LABEL'),
        tooltip: message,
      });
    });
  } catch {
    /* Rule element badge optional */
  }
}

function indexOutcomesByTarget(outcomes) {
  const byTarget = new Map();

  for (const outcome of Array.isArray(outcomes) ? outcomes : []) {
    const targetId = outcome?.target?.id;
    if (targetId && !byTarget.has(targetId)) byTarget.set(targetId, outcome);
  }

  return byTarget;
}
