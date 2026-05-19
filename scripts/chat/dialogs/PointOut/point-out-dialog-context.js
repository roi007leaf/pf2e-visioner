import { getDesiredOverrideStatesForAction } from '../../services/data/action-state-config.js';
import { filterOutcomesByEncounter } from '../../services/infra/shared-utils.js';

const NO_ENCOUNTER_ALLIES_MESSAGE = 'No encounter allies found, showing all';

export async function preparePointOutDialogContext(app, context) {
  const filteredOutcomes = await getPointOutBaseFilteredOutcomes(app);
  const processedOutcomes = applyPointOutVisualFilters(
    app,
    filteredOutcomes.map((outcome) => buildPointOutOutcomeContext(app, outcome)),
  );

  syncPointOutActionableState(app, processedOutcomes);

  context.actorName = app.actorToken.name;
  context.actorImage = app.resolveTokenImage(app.actorToken);
  context.outcomes = processedOutcomes;
  context.changes = app.changes;
  context.hideFoundryHidden = !!app.hideFoundryHidden;
  Object.assign(context, app.buildCommonContext(app.outcomes));
  assignPointOutTargetContext(context, processedOutcomes);

  return context;
}

export async function getPointOutDialogFilteredOutcomes(app) {
  let filtered = filterOutcomesByEncounter(app.outcomes, app.encounterOnly, 'target');

  filtered = await filterPointOutAllies(app, filtered);
  filtered = await filterPointOutDetection(app, filtered);
  filtered = applyPointOutHiddenFilter(app, filtered);

  if (app.showOnlyChanges) {
    filtered = filtered.filter((outcome) => isPointOutStateChange(outcome));
  }

  return filtered;
}

async function getPointOutBaseFilteredOutcomes(app) {
  let filteredOutcomes = app.applyEncounterFilter(
    app.outcomes,
    'target',
    NO_ENCOUNTER_ALLIES_MESSAGE,
  );

  filteredOutcomes = await filterPointOutAllies(app, filteredOutcomes);
  filteredOutcomes = await filterPointOutDetection(app, filteredOutcomes);
  filteredOutcomes = await filterPointOutDefeated(filteredOutcomes);

  return filteredOutcomes;
}

async function filterPointOutAllies(app, outcomes) {
  try {
    const { filterOutcomesByAllies } = await import('../../services/infra/shared-utils.js');
    return filterOutcomesByAllies(outcomes, app.actorToken, app.ignoreAllies, 'target');
  } catch {
    return outcomes;
  }
}

async function filterPointOutDetection(app, outcomes) {
  if (!app.filterByDetection || !app.actorToken) return outcomes;

  try {
    const { filterOutcomesByDetection } = await import('../../services/infra/shared-utils.js');
    return filterOutcomesByDetection(
      outcomes,
      app.actorToken,
      'target',
      false,
      true,
      'observer_to_target',
    );
  } catch {
    return outcomes;
  }
}

async function filterPointOutDefeated(outcomes) {
  try {
    const { filterOutcomesByDefeated } = await import('../../services/infra/shared-utils.js');
    return filterOutcomesByDefeated(outcomes, 'target');
  } catch {
    return outcomes;
  }
}

function buildPointOutOutcomeContext(app, outcome) {
  const desired = getDesiredOverrideStatesForAction('point-out');
  const availableStates = { hidden: app.buildOverrideStates(desired, outcome)[0] };
  const effectiveNewState = outcome.overrideState || outcome.newVisibility;
  const baseOldState = outcome.oldVisibility || outcome.currentVisibility;
  const isOldStateAvsControlled = app.isOldStateAvsControlled(outcome);
  const hasActionableChange = getPointOutActionableChange(app, outcome, {
    baseOldState,
    effectiveNewState,
    isOldStateAvsControlled,
  });

  return {
    ...outcome,
    oldVisibilityState: app.visibilityConfig(baseOldState),
    newVisibilityState: app.visibilityConfig(effectiveNewState),
    tokenImage: app.resolveTokenImage(outcome.target),
    availableStates,
    overrideState: outcome.overrideState || outcome.newVisibility,
    hasActionableChange,
  };
}

function getPointOutActionableChange(app, outcome, state) {
  const { baseOldState, effectiveNewState, isOldStateAvsControlled } = state;

  if (outcome.overrideState === 'avs' && app.isCurrentStateAvsControlled(outcome)) {
    return false;
  }

  const statesMatch = baseOldState === effectiveNewState;
  if (outcome.overrideState) {
    return !statesMatch || (statesMatch && isOldStateAvsControlled);
  }

  return outcome.changed === true || (statesMatch && isOldStateAvsControlled);
}

function applyPointOutVisualFilters(app, outcomes) {
  let visualOutcomes = applyPointOutHiddenFilter(app, outcomes);

  try {
    if (app.showOnlyChanges) {
      visualOutcomes = visualOutcomes.filter((outcome) => !!outcome.hasActionableChange);
    }
  } catch {
    /* Visual filter is optional */
  }

  return visualOutcomes;
}

function applyPointOutHiddenFilter(app, outcomes) {
  try {
    if (app.hideFoundryHidden) {
      return outcomes.filter((outcome) => outcome?.target?.document?.hidden !== true);
    }
  } catch {
    /* Visual filter is optional */
  }

  return outcomes;
}

function syncPointOutActionableState(app, processedOutcomes) {
  const processedByTarget = new Map(
    processedOutcomes.map((outcome) => [outcome?.target?.id, outcome]),
  );

  for (const outcome of app.outcomes || []) {
    const processed = processedByTarget.get(outcome?.target?.id);
    if (processed) outcome.hasActionableChange = processed.hasActionableChange;
  }
}

function assignPointOutTargetContext(context, processedOutcomes) {
  if (processedOutcomes.length === 0) return;

  const firstTargetToken = processedOutcomes[0].targetToken;
  const allSameTarget = processedOutcomes.every(
    (outcome) => outcome.targetToken?.id === firstTargetToken?.id,
  );
  if (!allSameTarget || !firstTargetToken) return;

  context.targetName = firstTargetToken.name;
  context.targetDC = processedOutcomes[0].dc;
}

function isPointOutStateChange(outcome) {
  const effectiveNew = outcome?.overrideState ?? outcome?.newVisibility;
  const baseOld = outcome?.oldVisibility ?? outcome?.currentVisibility;

  return baseOld != null && effectiveNew != null && effectiveNew !== baseOld;
}
