import { FeatsHandler } from '../../services/FeatsHandler.js';

export const TAKE_COVER_OVERRIDE_STATES = ['none', 'standard', 'greater'];

export function normalizeTakeCoverDialogCover(state, { result = false, baseline = false } = {}) {
  if (state === 'greater') return 'greater';
  if (state === 'standard') return 'standard';
  if (state === 'lesser') return result ? 'standard' : baseline ? 'lesser' : 'none';
  return 'none';
}

export function getTakeCoverDisplayBaseline(outcome) {
  return normalizeTakeCoverDialogCover(
    outcome?.baselineCover ?? outcome?.currentCover ?? outcome?.oldVisibility ?? outcome?.oldCover,
    { baseline: true },
  );
}

export async function getTakeCoverDialogFilteredOutcomes(app) {
  try {
    let filtered = app.applyEncounterFilter(
      app.outcomes || [],
      'target',
      'No encounter observers found for this action',
    );

    filtered = await filterTakeCoverAllies(app, filtered);
    filtered = await filterTakeCoverDetection(app, filtered);
    filtered = applyTakeCoverHiddenFilter(app, filtered);

    if (app.showOnlyChanges) {
      filtered = filtered.filter((outcome) => !!outcome.hasActionableChange);
    }

    return filtered;
  } catch {
    return Array.isArray(app.outcomes) ? app.outcomes : [];
  }
}

export async function prepareTakeCoverDialogContext(app, context) {
  let filteredOutcomes = app.applyEncounterFilter(
    app.outcomes,
    'target',
    'No encounter observers found for this action',
  );
  filteredOutcomes = await filterTakeCoverAllies(app, filteredOutcomes);
  filteredOutcomes = await filterTakeCoverDetection(app, filteredOutcomes);
  filteredOutcomes = await filterTakeCoverDefeated(filteredOutcomes);
  filteredOutcomes = applyTakeCoverHiddenFilter(app, filteredOutcomes);

  const processed = filteredOutcomes.map((outcome) => buildTakeCoverOutcomeContext(app, outcome));
  const displayOutcomes = app.showOnlyChanges
    ? processed.filter((outcome) => !!outcome.hasActionableChange)
    : processed;

  context.actorToken = app.actorToken;
  context.actorTokenImage = app.resolveTokenImage(app.actorToken);
  context.taker = {
    name: app.actorToken?.name || '',
    image: context.actorTokenImage,
  };
  context.outcomes = displayOutcomes;
  Object.assign(context, app.buildCommonContext(displayOutcomes));
  context.bulkOverrideLabel =
    game?.i18n?.localize?.('PF2E_VISIONER.UI.BULK_SET_COVER') || 'Bulk Set Cover';
  context.takeCoverBadges = buildTakeCoverBadges(app);
  context.hideFoundryHidden = !!app.hideFoundryHidden;
  context.ignoreAllies = !!app.ignoreAllies;
  context.filterByDetection = !!app.filterByDetection;
  context.showOnlyChanges = !!app.showOnlyChanges;
  context.encounterOnly = !!app.encounterOnly;

  return context;
}

async function filterTakeCoverAllies(app, outcomes) {
  try {
    const { filterOutcomesByAllies } = await import('../../services/infra/shared-utils.js');
    return filterOutcomesByAllies(outcomes, app.actorToken, app.ignoreAllies, 'target');
  } catch {
    return outcomes;
  }
}

async function filterTakeCoverDetection(app, outcomes) {
  if (!app.filterByDetection || !app.actorToken) return outcomes;

  try {
    const { filterOutcomesByDetection } = await import('../../services/infra/shared-utils.js');
    return filterOutcomesByDetection(
      outcomes,
      app.actorToken,
      'target',
      false,
      true,
      'target_to_observer',
    );
  } catch {
    return outcomes;
  }
}

async function filterTakeCoverDefeated(outcomes) {
  try {
    const { filterOutcomesByDefeated } = await import('../../services/infra/shared-utils.js');
    return filterOutcomesByDefeated(outcomes, 'target');
  } catch {
    return outcomes;
  }
}

function applyTakeCoverHiddenFilter(app, outcomes) {
  try {
    if (app.hideFoundryHidden) {
      return outcomes.filter((outcome) => outcome?.target?.document?.hidden !== true);
    }
  } catch {
    /* Visual filter is optional */
  }

  return outcomes;
}

function buildTakeCoverOutcomeContext(app, outcome) {
  const calculatedNew = normalizeTakeCoverDialogCover(outcome.newVisibility || outcome.newCover, {
    result: true,
  });
  const effectiveNew = normalizeTakeCoverDialogCover(outcome.overrideState || calculatedNew, {
    result: true,
  });
  const baseOld = getTakeCoverDisplayBaseline(outcome);
  const hasActionableChange =
    outcome.takeCoverProneRangedOnly === true ||
    (baseOld != null && effectiveNew != null && effectiveNew !== baseOld);
  const availableStates = TAKE_COVER_OVERRIDE_STATES.map((state) => {
    const config = app.coverConfig(state);
    return {
      value: state,
      label: config.label,
      icon: config.icon,
      color: config.color,
      cssClass: config.cssClass,
      selected: state === effectiveNew,
      calculatedOutcome: state === calculatedNew,
    };
  });

  return {
    ...outcome,
    tokenImage: app.resolveTokenImage(outcome.target),
    oldCoverCfg: app.coverConfig(baseOld),
    newCoverCfg: app.coverConfig(effectiveNew),
    availableStates,
    overrideState: effectiveNew,
    oldVisibility: baseOld,
    currentVisibility: baseOld,
    newVisibility: effectiveNew,
    hasActionableChange,
  };
}

export function buildTakeCoverBadges(app) {
  const badges = [];

  try {
    if (FeatsHandler.hasCeaselessShadows(app.actorToken)) {
      badges.push({
        key: 'ceaseless-shadows',
        icon: 'fas fa-infinity',
        label: game.i18n.localize('PF2E_VISIONER.FEAT.CEASELESS_SHADOWS'),
        tooltip: game.i18n.localize('PF2E_VISIONER.UI.CEASELESS_SHADOWS_TAKE_COVER_TOOLTIP'),
      });
    }
  } catch {
    /* Feat badge is optional */
  }

  return badges;
}
