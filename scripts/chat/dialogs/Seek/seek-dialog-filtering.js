import { MODULE_ID } from '../../../constants.js';
import { getVisibilityBetween } from '../../../utils.js';
import {
  filterOutcomesByAllies,
  filterOutcomesByDefeated,
  filterOutcomesByDetection,
  filterOutcomesBySeekDistance,
  filterOutcomesByTemplate,
  hasActiveEncounter,
} from '../../services/infra/shared-utils.js';

export function isSeekTemplateMode(actionData = {}) {
  return !!(actionData.seekTemplateCenter && actionData.seekTemplateRadiusFeet);
}

export function isSeekRangeLimited() {
  try {
    const inCombat = hasActiveEncounter();
    const applyInCombat = !!game.settings.get(MODULE_ID, 'limitSeekRangeInCombat');
    const applyOutOfCombat = !!game.settings.get(MODULE_ID, 'limitSeekRangeOutOfCombat');
    return (inCombat && applyInCombat) || (!inCombat && applyOutOfCombat);
  } catch {
    return false;
  }
}

function sameOutcome(left, right, getOutcomeTokenId) {
  if (left?._isWall && left?.wallId) return right?._isWall && right?.wallId === left.wallId;
  return getOutcomeTokenId(right) === getOutcomeTokenId(left);
}

function getOutcomePreservationKey(outcome, getOutcomeTokenId) {
  if (outcome?._isWall && outcome?.wallId) return `wall:${outcome.wallId}`;
  const tokenId = getOutcomeTokenId(outcome);
  return tokenId ? `token:${tokenId}` : null;
}

export function preserveSeekOverrides(outcomes = [], previousOutcomes = [], getOutcomeTokenId) {
  if (!Array.isArray(outcomes)) return [];
  const previous = Array.isArray(previousOutcomes) ? previousOutcomes : [];
  const previousByKey = new Map();
  for (const candidate of previous) {
    const key = getOutcomePreservationKey(candidate, getOutcomeTokenId);
    if (key && !previousByKey.has(key)) previousByKey.set(key, candidate);
  }

  return outcomes.map((outcome) => {
    const key = getOutcomePreservationKey(outcome, getOutcomeTokenId);
    const existing = key
      ? previousByKey.get(key)
      : previous.find((candidate) => sameOutcome(outcome, candidate, getOutcomeTokenId));
    const overrideState = existing?.overrideState ?? outcome?.overrideState ?? null;
    return { ...outcome, overrideState };
  });
}

export function applySeekVisualFilters(
  outcomes = [],
  { hideFoundryHidden = false, showOnlyChanges = false, isSearchGroup = false } = {},
) {
  let visual = Array.isArray(outcomes) ? outcomes : [];

  if (hideFoundryHidden && !isSearchGroup) {
    visual = visual.filter((outcome) => {
      try {
        return outcome?._isWall || outcome?.target?.document?.hidden !== true;
      } catch {
        return true;
      }
    });
  }

  if (showOnlyChanges) {
    visual = visual.filter((outcome) => !!outcome.hasActionableChange);
  }

  return visual;
}

export function calculateFilteredSeekActionability(dialog, outcome, overrideState) {
  try {
    let currentVisibility = outcome.oldVisibility || outcome.currentVisibility || null;
    if (!outcome?._isWall) {
      const observerToken = outcome.observerToken || outcome.observer || dialog.actorToken;
      if (observerToken) {
        currentVisibility = getVisibilityBetween(observerToken, outcome.target) || currentVisibility;
      }
    }

    const effectiveNewState = overrideState || outcome.newVisibility || currentVisibility;
    const baseOldState = outcome.oldVisibility || currentVisibility;
    const isOldStateAvsControlled = dialog.isOldStateAvsControlled(outcome);
    const statesMatch = effectiveNewState === baseOldState;

    return (
      (baseOldState != null && effectiveNewState != null && !statesMatch) ||
      (statesMatch && isOldStateAvsControlled)
    );
  } catch {
    return !!outcome?.hasActionableChange;
  }
}

export async function getSeekDialogFilteredOutcomes(
  dialog,
  { includeDetection = true, includeDefeated = false, preserveOverrides = false } = {},
) {
  const baseList = Array.isArray(dialog._originalOutcomes)
    ? dialog._originalOutcomes
    : dialog.outcomes || [];
  const isSearchGroup = dialog.isSearchExplorationGroup();

  let filtered = isSearchGroup
    ? [...baseList]
    : dialog.applyEncounterFilter(baseList, 'target', 'No encounter targets found, showing all');

  try {
    if (dialog.actorToken && !isSearchGroup) {
      filtered = filterOutcomesByAllies(filtered, dialog.actorToken, dialog.ignoreAllies, 'target');
    }
  } catch {
    /* Ally filtering is non-critical */
  }

  if (dialog.ignoreWalls === true) {
    filtered = Array.isArray(filtered)
      ? filtered.filter((outcome) => !outcome?._isWall && !outcome?.wallId)
      : filtered;
  }

  if (!isSearchGroup && isSeekTemplateMode(dialog.actionData)) {
    try {
      filtered = filterOutcomesByTemplate(
        filtered,
        dialog.actionData.seekTemplateCenter,
        dialog.actionData.seekTemplateRadiusFeet,
        'target',
        dialog.actionData.seekTemplateType || 'circle',
        dialog.actionData.messageId,
        dialog.actorToken?.id || dialog.actionData.actor?.id,
      );
    } catch {
      /* Template filtering is non-critical */
    }
  }

  try {
    if (dialog.actorToken && !isSearchGroup) {
      filtered = filterOutcomesBySeekDistance(filtered, dialog.actorToken, 'target');
    }
  } catch {
    /* Distance filtering is non-critical */
  }

  if (
    includeDetection &&
    dialog.actorToken &&
    !isSearchGroup &&
    !isSeekTemplateMode(dialog.actionData) &&
    dialog.filterByDetection
  ) {
    try {
      filtered = await filterOutcomesByDetection(
        filtered,
        dialog.actorToken,
        'target',
        true,
        dialog.filterByDetection,
        'observer_to_target',
      );
    } catch {
      /* Viewport filtering is non-critical */
    }
  }

  if (includeDefeated) {
    try {
      filtered = filterOutcomesByDefeated(filtered, 'target');
    } catch {
      /* Defeated filtering is non-critical */
    }
  }

  return preserveOverrides
    ? preserveSeekOverrides(filtered, dialog.outcomes, (outcome) => dialog.getOutcomeTokenId(outcome))
    : filtered;
}
