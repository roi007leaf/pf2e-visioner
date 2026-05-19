import { MODULE_ID } from '../../../../constants.js';
import { overrideToDisplayVisibility } from '../../../../visibility/perception-profile.js';
import { getDefaultConsequencesVisibility } from './consequences-targets.js';

export async function isConsequencesAvsEnabled() {
  try {
    return game.settings.get('pf2e-visioner', 'autoVisibilityEnabled') === true;
  } catch {
    return false;
  }
}

export async function requestConsequencesTakeCoverExpiration(actionData) {
  try {
    const attacker = actionData?.actorToken || actionData?.actor;
    if (!attacker?.actor) return;
    const { requestTakeCoverExpirationForToken } = await import(
      '../../take-cover-expiration-service.js'
    );
    await requestTakeCoverExpirationForToken(attacker, 'attack');
  } catch (error) {
    console.warn('PF2E Visioner | Failed to request Take Cover expiration prompt:', error);
  }
}

async function loadAvsOverrideManager(provided) {
  if (provided) return provided;
  const { default: AvsOverrideManager } = await import('../../infra/AvsOverrideManager.js');
  return AvsOverrideManager;
}

async function loadOverrideIndicator(provided) {
  if (provided) return provided;
  const { default: indicator } = await import(
    '../../../../scripts/ui/OverrideValidationIndicator.js'
  );
  return indicator;
}

async function loadFilterOutcomesByEncounter(provided) {
  if (provided) return provided;
  const { filterOutcomesByEncounter } = await import('../../infra/shared-utils.js');
  return filterOutcomesByEncounter;
}

function collectExistingOverrides(attacker, observers) {
  const results = [];
  if (!attacker) return results;

  for (const observer of observers) {
    try {
      const observerId = observer?.document?.id;
      const targetId = attacker?.document?.id;
      if (!observerId || !targetId) continue;

      const flagForward = attacker.document.getFlag(MODULE_ID, `avs-override-from-${observerId}`);
      if (flagForward) {
        results.push({
          direction: 'observer_to_attacker',
          observer,
          target: attacker,
          data: flagForward,
        });
      }

      const flagReverse = observer.document.getFlag(MODULE_ID, `avs-override-from-${targetId}`);
      if (flagReverse) {
        results.push({
          direction: 'attacker_to_observer',
          observer: attacker,
          target: observer,
          data: flagReverse,
        });
      }
    } catch { }
  }

  return results;
}

async function removeOverridesForConsequences(attacker, observers, avsOverrideManager) {
  for (const observer of observers) {
    try {
      const observerId = observer?.document?.id;
      const attackerId = attacker?.document?.id;
      if (!observerId || !attackerId) continue;
      await avsOverrideManager.removeOverride(observerId, attackerId);
      await avsOverrideManager.removeOverride(attackerId, observerId);
    } catch (error) {
      console.warn('PF2E Visioner | Consequences override removal issue:', error);
    }
  }
}

async function buildConsequencesOutcomes({ actionData, subjects, analyzeOutcome, applyOverrides }) {
  const outcomes = [];
  for (const subject of subjects) {
    outcomes.push(await analyzeOutcome(actionData, subject));
  }
  applyOverrides(actionData, outcomes);
  return outcomes;
}

async function filterChangedOutcomes(actionData, outcomes, filterOutcomesByEncounter) {
  let changed = outcomes.filter((outcome) => outcome && outcome.changed);
  if (typeof actionData?.encounterOnly === 'boolean') {
    const filter = await loadFilterOutcomesByEncounter(filterOutcomesByEncounter);
    changed = filter(changed, actionData.encounterOnly, 'target');
  }
  return changed;
}

async function createConsequencesOverrides({ changed, attacker, avsOverrideManager }) {
  const createdOverrides = [];

  for (const outcome of changed) {
    try {
      const observer = outcome.target;
      const newVisibility =
        outcome.overrideState || outcome.newVisibility || getDefaultConsequencesVisibility();
      if (newVisibility === 'avs') continue;

      const changesByTarget = new Map([
        [
          attacker.document.id,
          {
            target: attacker,
            state: newVisibility,
            hasCover: false,
            hasConcealment: false,
            expectedCover: null,
          },
        ],
      ]);

      await avsOverrideManager.setPairOverrides(observer, changesByTarget, {
        source: 'consequences_action',
      });

      createdOverrides.push({
        type: 'avs-created',
        observerId: observer.document.id,
        targetId: attacker.document.id,
        state: newVisibility,
      });
    } catch (error) {
      console.warn('PF2E Visioner | Failed to create AVS override for consequences:', error);
    }
  }

  return createdOverrides;
}

async function refreshConsequencesOverrideIndicator(overrideIndicator) {
  try {
    const indicator = await loadOverrideIndicator(overrideIndicator);
    const allTokens = canvas.tokens?.placeables || [];
    const remaining = [];
    for (const token of allTokens) {
      const flags = token.document?.flags?.[MODULE_ID] || {};
      for (const [key, value] of Object.entries(flags)) {
        if (!key.startsWith('avs-override-from-')) continue;
        if (!value || typeof value !== 'object') continue;
        const observerId = key.replace('avs-override-from-', '');
        const targetId = token.document.id;
        remaining.push({
          observerId,
          targetId,
          observerName: value.observerName || observerId,
          targetName: value.targetName || token.document.name,
          state: overrideToDisplayVisibility(value),
          hasCover: value.hasCover,
          hasConcealment: value.hasConcealment,
          expectedCover: value.expectedCover,
          currentVisibility: null,
          currentCover: null,
        });
      }
    }
    if (remaining.length === 0) {
      indicator.hide(true);
      indicator.update([], '');
    } else {
      indicator.update(remaining, 'Overrides');
    }
  } catch (error) {
    console.warn('PF2E Visioner | Consequences: indicator refresh failed:', error);
  }
}

function buildRemovedOverrideEntries(existingOverrides) {
  return existingOverrides.map((record) => ({
    type: 'avs-removed',
    observerId:
      record.direction === 'observer_to_attacker'
        ? record.observer.document.id
        : record.target.document.id,
    targetId:
      record.direction === 'observer_to_attacker'
        ? record.target.document.id
        : record.observer.document.id,
    original: {
      state: overrideToDisplayVisibility(record.data),
      source: record.data?.source,
      hasCover: record.data?.hasCover,
      hasConcealment: record.data?.hasConcealment,
      expectedCover: record.data?.expectedCover,
    },
  }));
}

function cacheConsequencesAvsEntries(cache, messageId, existingOverrides, createdOverrides) {
  if (!cache) return;

  const existingCache = cache.get(messageId) || [];
  const removedEntries = buildRemovedOverrideEntries(existingOverrides);
  cache.set(messageId, existingCache.concat(removedEntries, createdOverrides));
}

export async function applyConsequencesAvs({
  actionData,
  subjects,
  attacker,
  analyzeOutcome,
  applyOverrides,
  cache,
  avsOverrideManager = null,
  overrideIndicator = null,
  filterOutcomesByEncounter = null,
}) {
  const manager = await loadAvsOverrideManager(avsOverrideManager);
  const existingOverrides = collectExistingOverrides(attacker, subjects);
  await removeOverridesForConsequences(attacker, subjects, manager);

  const outcomes = await buildConsequencesOutcomes({
    actionData,
    subjects,
    analyzeOutcome,
    applyOverrides,
  });
  const changed = await filterChangedOutcomes(actionData, outcomes, filterOutcomesByEncounter);
  const createdOverrides = await createConsequencesOverrides({
    changed,
    attacker,
    avsOverrideManager: manager,
  });

  await refreshConsequencesOverrideIndicator(overrideIndicator);
  cacheConsequencesAvsEntries(
    cache,
    actionData.messageId,
    existingOverrides,
    createdOverrides,
  );

  return {
    overridesCreated: createdOverrides.length,
    createdOverrides,
  };
}

export async function revertConsequencesAvs({
  actionData,
  cache,
  getTokenById,
  avsOverrideManager = null,
}) {
  const entries = cache?.get(actionData.messageId) || [];
  const toRestore = entries.filter((entry) => entry.type === 'avs-removed');
  const toRemove = entries.filter((entry) => entry.type === 'avs-created');
  if (toRestore.length === 0 && toRemove.length === 0) {
    return { performed: false, toRestore, toRemove };
  }

  const manager = await loadAvsOverrideManager(avsOverrideManager);
  let actionsPerformed = 0;

  for (const entry of toRemove) {
    try {
      const removed = await manager.removeOverride(entry.observerId, entry.targetId);
      if (removed) actionsPerformed++;
    } catch (error) {
      console.warn('PF2E Visioner | Failed to remove created AVS override:', error);
    }
  }

  for (const entry of toRestore) {
    try {
      const observer = getTokenById(entry.observerId);
      const target = getTokenById(entry.targetId);
      if (!observer || !target) continue;
      const map = new Map([
        [
          target.document.id,
          {
            target,
            state: entry.original?.state,
            hasCover: entry.original?.hasCover,
            hasConcealment: entry.original?.hasConcealment,
            expectedCover: entry.original?.expectedCover,
          },
        ],
      ]);
      await manager.setPairOverrides(observer, map, {
        source: entry.original?.source || 'consequences_action',
      });
      actionsPerformed++;
    } catch (error) {
      console.warn('PF2E Visioner | Failed to restore AVS override:', error);
    }
  }

  if (cache) cache.delete(actionData.messageId);
  return { performed: true, toRestore, toRemove, actionsPerformed };
}
