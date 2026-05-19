import { MODULE_ID } from '../../../constants.js';
import { getDesiredOverrideStatesForAction } from '../../services/data/action-state-config.js';
import { getVisibilityStateConfig } from '../../services/data/visibility-states.js';

const NO_ENCOUNTER_TARGETS_MESSAGE = 'No encounter targets found, showing all';

export function getDefaultConsequencesVisibility() {
  try {
    return game.settings.get(MODULE_ID, 'autoVisibilityEnabled') === true ? 'avs' : 'observed';
  } catch {
    return 'observed';
  }
}

export async function prepareConsequencesDialogContext(app, context) {
  const processedOutcomes = await getProcessedConsequencesOutcomes(app);

  context.attackingToken = {
    ...app.attackingToken,
    image: app.resolveTokenImage(app.attackingToken),
  };
  context.outcomes = processedOutcomes;
  context.ignoreAllies = !!app.ignoreAllies;
  context.hideFoundryHidden = !!app.hideFoundryHidden;

  syncConsequencesSourceOutcomes(app, processedOutcomes);
  Object.assign(context, app.buildCommonContext(processedOutcomes));

  context.avsEnabled = game.settings.get(MODULE_ID, 'autoVisibilityEnabled');
  context.hasExistingOverrides = hasExistingConsequencesOverrides(app, processedOutcomes, context);

  return context;
}

export async function getProcessedConsequencesOutcomes(app) {
  let processedOutcomes = app.applyEncounterFilter(
    app.outcomes,
    'target',
    NO_ENCOUNTER_TARGETS_MESSAGE,
  );

  processedOutcomes = await filterConsequencesAllies(app, processedOutcomes);
  processedOutcomes = await filterConsequencesDetection(app, processedOutcomes);
  processedOutcomes = await filterConsequencesDefeated(processedOutcomes);

  processedOutcomes = processedOutcomes.map((outcome) =>
    buildConsequencesOutcomeContext(app, outcome),
  );

  return applyConsequencesVisualFilters(app, processedOutcomes);
}

async function filterConsequencesAllies(app, outcomes) {
  try {
    const { filterOutcomesByAllies } = await import('../../services/infra/shared-utils.js');
    return filterOutcomesByAllies(outcomes, app.attackingToken, app.ignoreAllies, 'target');
  } catch {
    return outcomes;
  }
}

async function filterConsequencesDetection(app, outcomes) {
  if (!app.filterByDetection || !app.attackingToken) return outcomes;

  try {
    const { filterOutcomesByDetection } = await import('../../services/infra/shared-utils.js');
    return filterOutcomesByDetection(
      outcomes,
      app.attackingToken,
      'target',
      false,
      true,
      'observer_to_target',
    );
  } catch {
    return outcomes;
  }
}

async function filterConsequencesDefeated(outcomes) {
  try {
    const { filterOutcomesByDefeated } = await import('../../services/infra/shared-utils.js');
    return filterOutcomesByDefeated(outcomes, 'target');
  } catch {
    return outcomes;
  }
}

function buildConsequencesOutcomeContext(app, outcome) {
  const effectiveNewState =
    outcome.overrideState || outcome.newVisibility || getDefaultConsequencesVisibility();
  const baseOldState = outcome.currentVisibility;
  const hasActionableChange = app.calculateHasActionableChange({
    ...outcome,
    newVisibility: effectiveNewState,
    currentVisibility: baseOldState,
    overrideState: outcome.overrideState,
  });
  const desired = getDesiredOverrideStatesForAction('consequences');
  const availableStates = app.buildOverrideStates(
    desired,
    { ...outcome, newVisibility: effectiveNewState },
    { selectFrom: 'overrideState', calcFrom: 'newVisibility' },
  );
  const isOldStateAvsControlled = app.isOldStateAvsControlled(outcome);

  return {
    ...outcome,
    newVisibility: effectiveNewState,
    hasActionableChange,
    overrideState: outcome.overrideState || null,
    tokenImage: app.resolveTokenImage(outcome.target),
    oldVisibilityState: getVisibilityStateConfig(baseOldState),
    newVisibilityState: getVisibilityStateConfig(effectiveNewState),
    availableStates,
    isOldStateAvsControlled,
  };
}

function applyConsequencesVisualFilters(app, outcomes) {
  try {
    if (app.hideFoundryHidden) {
      return outcomes.filter((outcome) => outcome?.target?.document?.hidden !== true);
    }
  } catch {
    /* Visual filter is optional */
  }

  return outcomes;
}

function syncConsequencesSourceOutcomes(app, processedOutcomes) {
  try {
    const byId = new Map(processedOutcomes.map((outcome) => [outcome?.target?.id, outcome]));
    for (const outcome of app.outcomes) {
      const processed = byId.get(outcome?.target?.id);
      if (!processed) continue;

      outcome.hasActionableChange = processed.hasActionableChange;
      outcome.newVisibility = processed.newVisibility;
    }
  } catch {
    /* Source sync is best-effort */
  }
}

function hasExistingConsequencesOverrides(app, processedOutcomes, context) {
  if (!context.avsEnabled || !app.attackingToken) return false;

  try {
    for (const outcome of processedOutcomes) {
      const observer = outcome?.target;
      if (!observer?.document?.id) continue;

      const attackerId = app.attackingToken.document.id;
      const observerId = observer.document.id;
      const forwardOverride = app.attackingToken.document.getFlag(
        MODULE_ID,
        `avs-override-from-${observerId}`,
      );
      const reverseOverride = observer.document.getFlag(
        MODULE_ID,
        `avs-override-from-${attackerId}`,
      );

      if (forwardOverride || reverseOverride) return true;
    }
  } catch (err) {
    console.warn('PF2E Visioner | Error checking for existing overrides:', err);
  }

  return false;
}
