import { getDesiredOverrideStatesForAction } from '../../services/data/action-state-config.js';

const NO_ENCOUNTER_OBSERVERS_MESSAGE = 'No encounter observers found, showing all';

export async function prepareCreateADiversionDialogContext(app, context) {
  const processedOutcomes = await getProcessedCreateADiversionOutcomes(app);

  context.divertingToken = {
    ...app.divertingToken,
    image: app.resolveTokenImage(app.divertingToken),
  };
  context.outcomes = processedOutcomes;
  context.ignoreAllies = !!app.ignoreAllies;
  context.hideFoundryHidden = !!app.hideFoundryHidden;
  context.hasDistractingPerformance = !!app.hasDistractingPerformance;
  const beneficiary = app.actionData?.diversionTarget || app.divertingToken;
  context.diversionBeneficiary = beneficiary
    ? { ...beneficiary, image: app.resolveTokenImage(beneficiary) }
    : null;

  app.processedOutcomes = processedOutcomes;

  Object.assign(context, app.buildCommonContext(processedOutcomes));
  context.marginText = app.getMarginText.bind(app);
  context.getOutcomeClass = app.getOutcomeClass.bind(app);
  context.getOutcomeLabel = app.getOutcomeLabel.bind(app);

  return context;
}

export async function getProcessedCreateADiversionOutcomes(app) {
  let processedOutcomes = app.applyEncounterFilter(
    app.outcomes,
    'observer',
    NO_ENCOUNTER_OBSERVERS_MESSAGE,
  );

  processedOutcomes = filterCreateADiversionSelf(app, processedOutcomes);
  processedOutcomes = await filterCreateADiversionAllies(app, processedOutcomes);
  processedOutcomes = await filterCreateADiversionDetection(app, processedOutcomes);
  processedOutcomes = await filterCreateADiversionDefeated(processedOutcomes);

  processedOutcomes = processedOutcomes.map((outcome) =>
    buildCreateADiversionOutcomeContext(app, outcome),
  );

  return applyCreateADiversionVisualFilters(app, processedOutcomes);
}

function filterCreateADiversionSelf(app, outcomes) {
  try {
    const actorId = app.divertingToken?.id || app.divertingToken?.document?.id;
    const beneficiary = app.actionData?.diversionTarget;
    const beneficiaryId = beneficiary?.id || beneficiary?.document?.id;
    if (!actorId && !beneficiaryId) return outcomes;

    return outcomes.filter(
      (outcome) => outcome?.observer?.id !== actorId && outcome?.observer?.id !== beneficiaryId,
    );
  } catch {
    return outcomes;
  }
}

async function filterCreateADiversionAllies(app, outcomes) {
  try {
    const { filterOutcomesByAllies } = await import('../../services/infra/shared-utils.js');
    return filterOutcomesByAllies(outcomes, app.divertingToken, app.ignoreAllies, 'observer');
  } catch {
    return outcomes;
  }
}

async function filterCreateADiversionDetection(app, outcomes) {
  if (!app.filterByDetection || !app.divertingToken) return outcomes;

  try {
    const { filterOutcomesByDetection } = await import('../../services/infra/shared-utils.js');
    return filterOutcomesByDetection(
      outcomes,
      app.actionData?.diversionTarget || app.divertingToken,
      'observer',
      false,
      true,
      'target_to_observer',
    );
  } catch {
    return outcomes;
  }
}

async function filterCreateADiversionDefeated(outcomes) {
  try {
    const { filterOutcomesByDefeated } = await import('../../services/infra/shared-utils.js');
    return filterOutcomesByDefeated(outcomes, 'observer');
  } catch {
    return outcomes;
  }
}

function buildCreateADiversionOutcomeContext(app, outcome) {
  const desired = getDesiredOverrideStatesForAction('create-a-diversion');
  const availableStates = app.buildOverrideStates(desired, outcome).map((state) => ({
    key: state.value,
    icon: state.icon,
    label: state.label,
    selected: state.selected,
    calculatedOutcome: state.calculatedOutcome,
  }));

  const effectiveNewState = outcome.overrideState || outcome.newVisibility;
  const baseOldState = outcome.currentVisibility;
  const hasActionableChange = app.calculateHasActionableChange({
    ...outcome,
    newVisibility: effectiveNewState,
    currentVisibility: baseOldState,
    overrideState: outcome.overrideState,
  });

  return {
    ...outcome,
    availableStates,
    hasActionableChange,
    overrideState: outcome.overrideState || null,
    tokenImage: resolveCreateADiversionObserverImage(outcome),
    outcomeClass: app.getOutcomeClass(outcome.outcome),
    outcomeLabel: app.getOutcomeLabel(outcome.outcome),
  };
}

function resolveCreateADiversionObserverImage(outcome) {
  return (
    outcome.observer.document?.texture?.src || outcome.observer.img || 'icons/svg/mystery-man.svg'
  );
}

function applyCreateADiversionVisualFilters(app, outcomes) {
  let visualOutcomes = outcomes;

  try {
    if (app.hideFoundryHidden) {
      visualOutcomes = visualOutcomes.filter(
        (outcome) => outcome?.observer?.document?.hidden !== true,
      );
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
