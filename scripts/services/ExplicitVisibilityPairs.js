import { MODULE_ID } from '../constants.js';

const FALLBACK_SCENE_ID = 'scene';

function getState() {
  if (!globalThis.game) globalThis.game = {};
  if (!globalThis.game.pf2eVisioner) globalThis.game.pf2eVisioner = {};
  return globalThis.game.pf2eVisioner;
}

function getSceneId() {
  return globalThis.canvas?.scene?.id ?? globalThis.canvas?.scene?._id ?? FALLBACK_SCENE_ID;
}

export function getExplicitVisibilityPairKey(observer, target) {
  const observerId = observer?.document?.id ?? observer?.id ?? null;
  const targetId = target?.document?.id ?? target?.id ?? null;
  if (!observerId || !targetId) return null;
  return `${getSceneId()}:${observerId}->${targetId}`;
}

function getPairSet() {
  const state = getState();
  if (!(state.explicitlyVisiblePairs instanceof Set)) {
    state.explicitlyVisiblePairs = new Set();
  }
  return state.explicitlyVisiblePairs;
}

export function markExplicitVisiblePair(observer, target) {
  const key = getExplicitVisibilityPairKey(observer, target);
  if (!key) return false;
  const pairSet = getPairSet();
  const hadKey = pairSet.has(key);
  pairSet.add(key);
  return !hadKey;
}

export function clearExplicitVisiblePair(observer, target) {
  const key = getExplicitVisibilityPairKey(observer, target);
  if (!key) return false;
  const pairSet = getPairSet();
  const hadKey = pairSet.has(key);
  pairSet.delete(key);
  return hadKey;
}

export function isExplicitVisiblePair(observer, target) {
  try {
    if (globalThis.canvas?.scene?.getFlag?.(MODULE_ID, 'disableAVS')) return false;
  } catch {
    return false;
  }
  const key = getExplicitVisibilityPairKey(observer, target);
  if (!key) return false;
  return getPairSet().has(key);
}
