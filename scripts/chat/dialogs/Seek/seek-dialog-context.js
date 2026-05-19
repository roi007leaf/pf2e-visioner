import { MODULE_ID } from '../../../constants.js';
import {
  applySeekVisualFilters,
  calculateFilteredSeekActionability,
  getSeekDialogFilteredOutcomes,
  isSeekRangeLimited,
  isSeekTemplateMode,
} from './seek-dialog-filtering.js';
import { prepareSeekOutcomeContexts } from './seek-outcome-context.js';
import { buildSeekSenseContext } from './seek-sense-context.js';

export function initializeSeekDialogFilters(app) {
  if (app._hasInitializedFilters) return;

  if (isSeekRangeLimited()) {
    app.filterByDetection = false;
  }

  app._hasInitializedFilters = true;
}

export async function prepareSeekDialogContext(app, context) {
  initializeSeekDialogFilters(app);

  const isSearchGroup = app.isSearchExplorationGroup();
  const filteredOutcomes = await getSeekDialogFilteredOutcomes(app, {
    includeDefeated: true,
    preserveOverrides: true,
  });

  let processedOutcomes = await prepareSeekOutcomeContexts(app, filteredOutcomes);

  processedOutcomes = applySeekVisualFilters(processedOutcomes, {
    hideFoundryHidden: app.hideFoundryHidden,
    showOnlyChanges: app.showOnlyChanges,
    isSearchGroup,
  });

  // Preserve existing Apply All state behavior from the dialog shell.
  processedOutcomes.forEach((processedOutcome, index) => {
    if (app.outcomes[index]) {
      app.outcomes[index].hasActionableChange = processedOutcome.hasActionableChange;
    }
  });

  context.seeker = {
    name: app.actorToken?.name || 'Unknown Actor',
    image: app.resolveTokenImage(app.actorToken),
    actionType: 'seek',
    actionLabel: 'Seek action results analysis',
  };

  Object.assign(
    context,
    await buildSeekSenseContext(app.actorToken, {
      sourceOutcomes: app._originalOutcomes,
      processedOutcomes,
    }),
  );

  const availableReactions = app.getAvailableReactions(processedOutcomes);
  context.availableReactions = availableReactions;
  context.hasReactions = availableReactions.length > 0;
  context.outcomes = processedOutcomes;
  context.ignoreWalls = !!app.ignoreWalls;
  context.ignoreAllies = !!app.ignoreAllies;
  context.hideFoundryHidden = !!app.hideFoundryHidden;

  const templateMode = isSeekTemplateMode(app.actionData);
  context.isTemplateMode = templateMode;
  context.isRangeLimited = isSeekRangeLimited();
  context.detectionFilterDisabled = templateMode || isSearchGroup;
  context.avsEnabled = game.settings?.get?.(MODULE_ID, 'autoVisibilityEnabled') ?? false;

  app.outcomes = processedOutcomes;

  Object.assign(context, app.buildCommonContext(processedOutcomes));
  return context;
}

export async function getSeekDisplayOutcomes(app) {
  try {
    const filtered = await getSeekDialogFilteredOutcomes(app, { preserveOverrides: true });
    if (!Array.isArray(filtered)) return [];

    const processed = filtered.map((outcome) => {
      try {
        const overrideState = outcome.overrideState ?? null;
        return {
          ...outcome,
          rowId: app.getOutcomeTokenId(outcome),
          overrideState,
          hasActionableChange: calculateFilteredSeekActionability(app, outcome, overrideState),
        };
      } catch {
        return { ...outcome };
      }
    });

    return applySeekVisualFilters(processed, {
      hideFoundryHidden: app.hideFoundryHidden,
      showOnlyChanges: app.showOnlyChanges,
      isSearchGroup: app.isSearchExplorationGroup(),
    });
  } catch {
    return Array.isArray(app.outcomes) ? app.outcomes : [];
  }
}
