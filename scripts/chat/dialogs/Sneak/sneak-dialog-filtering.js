import {
  filterOutcomesByAllies,
  filterOutcomesByDefeated,
  filterOutcomesByDetection,
} from '../../services/infra/shared-utils.js';

export function preserveSneakOverrides(outcomes = [], previousOutcomes = []) {
  if (!Array.isArray(outcomes)) return [];
  const previous = Array.isArray(previousOutcomes) ? previousOutcomes : [];
  return outcomes.map((outcome) => {
    const existing = previous.find((candidate) => candidate?.token?.id === outcome?.token?.id);
    const overrideState = existing?.overrideState ?? outcome?.overrideState ?? null;
    return { ...outcome, overrideState };
  });
}

export async function getSneakDialogFilteredOutcomes(
  dialog,
  { includeDefeated = false, preserveOverrides = false } = {},
) {
  const baseList = Array.isArray(dialog._originalOutcomes)
    ? dialog._originalOutcomes
    : dialog.outcomes || [];

  let filtered = dialog.applyEncounterFilter(
    baseList,
    'token',
    'No encounter observers found, showing all',
  );

  try {
    filtered = filterOutcomesByAllies(filtered, dialog.sneakingToken, dialog.ignoreAllies, 'token');
  } catch {
    /* Ally filtering is non-critical */
  }

  if (dialog.filterByDetection && dialog.sneakingToken) {
    try {
      filtered = await filterOutcomesByDetection(
        filtered,
        dialog.sneakingToken,
        'token',
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
      filtered = filterOutcomesByDefeated(filtered, 'token');
    } catch {
      /* Defeated filtering is non-critical */
    }
  }

  return preserveOverrides ? preserveSneakOverrides(filtered, dialog.outcomes) : filtered;
}

export function applySneakVisualFilters(
  outcomes = [],
  { hideFoundryHidden = false, showChangesOnly = false } = {},
) {
  let visual = Array.isArray(outcomes) ? outcomes : [];

  if (hideFoundryHidden) {
    visual = visual.filter((outcome) => {
      try {
        return outcome?.token?.document?.hidden !== true;
      } catch {
        return true;
      }
    });
  }

  if (showChangesOnly) {
    visual = visual.filter((outcome) => !!outcome.hasActionableChange);
  }

  return visual;
}
