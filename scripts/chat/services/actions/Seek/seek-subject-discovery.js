import { MODULE_ID } from '../../../../constants.js';
import { buildHiddenWallSeekSubjects, calculateDistanceToWall } from './seek-wall-subjects.js';

async function loadSharedUtils(deps) {
  if (deps.shouldFilterAlly && deps.hasActiveEncounter && deps.calculateTokenDistance) {
    return deps;
  }

  const shared = await import('../../infra/shared-utils.js');
  return {
    shouldFilterAlly: deps.shouldFilterAlly || shared.shouldFilterAlly,
    hasActiveEncounter: deps.hasActiveEncounter || shared.hasActiveEncounter,
    calculateTokenDistance: deps.calculateTokenDistance || shared.calculateTokenDistance,
  };
}

function getSetting(deps, key) {
  if (typeof deps.getSetting === 'function') return deps.getSetting(key);
  return game.settings.get(MODULE_ID, key);
}

function getActorId(actionData) {
  return actionData?.actor?.id || actionData?.actor?.document?.id || null;
}

function getIgnoreAlliesPreference(actionData) {
  if (actionData?.ignoreAllies === true || actionData?.ignoreAllies === false) {
    return actionData.ignoreAllies;
  }
  return null;
}

function discoverTokenSubjects(actionData, tokens, shouldFilterAlly) {
  const actorId = getActorId(actionData);
  const preferIgnore = getIgnoreAlliesPreference(actionData);

  return (tokens || [])
    .filter((token) => token && token.actor)
    .filter((token) => (actorId ? token.id !== actorId : token !== actionData.actor))
    .filter((token) => {
      if (token.actor?.type === 'hazard' || token.actor?.type === 'loot') return true;
      if (preferIgnore !== true) return true;
      return !shouldFilterAlly(actionData.actor, token, 'enemies', true);
    });
}

function appendHiddenWallSubjects(subjects, walls, defaultWallDC) {
  try {
    return subjects.concat(buildHiddenWallSeekSubjects(walls, defaultWallDC));
  } catch (error) {
    console.error('Error processing walls in discoverSubjects:', error);
    return subjects;
  }
}

function shouldLimitSeekRange(hasActiveEncounter, deps) {
  const inCombat = hasActiveEncounter();
  const limitInCombat = !!getSetting(deps, 'limitSeekRangeInCombat');
  const limitOutOfCombat = !!getSetting(deps, 'limitSeekRangeOutOfCombat');
  const shouldLimit = (inCombat && limitInCombat) || (!inCombat && limitOutOfCombat);
  const maxFeet = Number(
    inCombat ? getSetting(deps, 'customSeekDistance') : getSetting(deps, 'customSeekDistanceOutOfCombat'),
  );

  return { shouldLimit, maxFeet };
}

function applySeekRangeFilter(subjects, actionData, deps) {
  try {
    const { shouldLimit, maxFeet } = shouldLimitSeekRange(deps.hasActiveEncounter, deps);
    if (!shouldLimit || !Number.isFinite(maxFeet) || maxFeet <= 0) return subjects;

    return subjects.filter((subject) => {
      const distance = subject._isWall
        ? calculateDistanceToWall(actionData.actor, subject.wall)
        : deps.calculateTokenDistance(actionData.actor, subject);
      return !Number.isFinite(distance) || distance <= maxFeet;
    });
  } catch {
    return subjects;
  }
}

export async function discoverSeekSubjects(actionData, deps = {}) {
  const shared = await loadSharedUtils(deps);
  const allTokens = deps.tokens || canvas?.tokens?.placeables || [];
  const allWalls = deps.walls || canvas?.walls?.placeables || [];
  const defaultWallDC = Number(getSetting(deps, 'wallStealthDC')) || 15;

  let subjects = discoverTokenSubjects(actionData, allTokens, shared.shouldFilterAlly);
  subjects = appendHiddenWallSubjects(subjects, allWalls, defaultWallDC);

  return applySeekRangeFilter(subjects, actionData, {
    ...deps,
    ...shared,
  });
}
