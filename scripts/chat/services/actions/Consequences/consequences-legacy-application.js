import { MODULE_ID } from '../../../../constants.js';

async function loadFilterOutcomesByEncounter(provided) {
  if (provided) return provided;
  const { filterOutcomesByEncounter } = await import('../../infra/shared-utils.js');
  return filterOutcomesByEncounter;
}

async function loadPerceptionProfileMap(provided) {
  if (provided) return provided;
  const { getPerceptionProfileMap } = await import('../../../../utils.js');
  return getPerceptionProfileMap;
}

async function loadLegacyVisibilityToProfile(provided) {
  if (provided) return provided;
  const { legacyVisibilityToProfile } = await import(
    '../../../../visibility/perception-profile.js'
  );
  return legacyVisibilityToProfile;
}

async function buildConsequencesOutcomes({ actionData, subjects, analyzeOutcome, applyOverrides }) {
  const outcomes = [];
  for (const subject of subjects) {
    outcomes.push(await analyzeOutcome(actionData, subject));
  }
  applyOverrides(actionData, outcomes);
  return outcomes;
}

async function filterChangedOutcomes(
  actionData,
  outcomes,
  filterOutcomesByEncounter,
  isOutcomeActionable,
) {
  const changed = outcomes.filter((outcome) =>
    typeof isOutcomeActionable === 'function'
      ? isOutcomeActionable(actionData, outcome)
      : outcome && outcome.changed,
  );
  if (typeof actionData?.encounterOnly !== 'boolean') return changed;

  const filter = await loadFilterOutcomesByEncounter(filterOutcomesByEncounter);
  return filter(changed, actionData.encounterOnly, 'target');
}

function buildConsequencesChanges({
  actionData,
  filtered,
  outcomeToChange,
  getOutcomeTokenId,
}) {
  let overridesMap = null;
  try {
    if (actionData?.overrides && typeof actionData.overrides === 'object') {
      overridesMap = new Map(Object.entries(actionData.overrides));
    }
  } catch { }

  return filtered
    .map((outcome) => {
      const change = outcomeToChange(actionData, outcome);
      if (overridesMap) {
        const id = getOutcomeTokenId(outcome);
        if (id && overridesMap.has(id)) change.overrideState = overridesMap.get(id);
      }
      return change;
    })
    .filter(Boolean);
}

async function persistConsequencesVisibilityMaps({
  changes,
  groupChangesByObserver,
  getPerceptionProfileMap,
  legacyVisibilityToProfile,
}) {
  try {
    const getProfileMap = await loadPerceptionProfileMap(getPerceptionProfileMap);
    const toProfile = await loadLegacyVisibilityToProfile(legacyVisibilityToProfile);
    const groups = groupChangesByObserver(changes);
    const updates = [];

    for (const group of groups) {
      const observer = group.observer;
      if (!observer?.document?.id) continue;
      const current = { ...(getProfileMap(observer) || {}) };
      for (const item of group.items) {
        const targetId = item?.target?.id;
        if (!targetId) continue;
        const state = item?.overrideState || item?.newVisibility;
        if (!state || state === 'observed') delete current[targetId];
        else current[targetId] = toProfile(state);
      }
      const update = { _id: observer.document.id };
      if (Object.keys(current).length === 0) update[`flags.${MODULE_ID}.-=visibilityV2`] = null;
      else update[`flags.${MODULE_ID}.visibilityV2`] = current;
      updates.push(update);
    }

    if (updates.length) await canvas.scene.updateEmbeddedDocuments('Token', updates);
  } catch { }
}

export async function applyConsequencesLegacy({
  actionData,
  subjects,
  analyzeOutcome,
  applyOverrides,
  outcomeToChange,
  getOutcomeTokenId,
  applyChangesInternal,
  groupChangesByObserver,
  cacheAfterApply,
  isOutcomeActionable = null,
  filterOutcomesByEncounter = null,
  getPerceptionProfileMap = null,
  legacyVisibilityToProfile = null,
}) {
  const outcomes = await buildConsequencesOutcomes({
    actionData,
    subjects,
    analyzeOutcome,
    applyOverrides,
  });
  const filtered = await filterChangedOutcomes(
    actionData,
    outcomes,
    filterOutcomesByEncounter,
    isOutcomeActionable,
  );
  if (filtered.length === 0) return { count: 0, noChanges: true };

  const changes = buildConsequencesChanges({
    actionData,
    filtered,
    outcomeToChange,
    getOutcomeTokenId,
  });
  await applyChangesInternal(changes);
  await persistConsequencesVisibilityMaps({
    changes,
    groupChangesByObserver,
    getPerceptionProfileMap,
    legacyVisibilityToProfile,
  });
  cacheAfterApply(actionData, changes);

  return { count: changes.length, noChanges: false };
}
