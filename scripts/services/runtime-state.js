export function getRuntimeState({ create = true } = {}) {
  const root = globalThis;
  if (!root.game) {
    if (!create) return null;
    root.game = {};
  }
  if (!root.game.pf2eVisioner) {
    if (!create) return null;
    root.game.pf2eVisioner = {};
  }
  return root.game.pf2eVisioner;
}

export function getRuntimeFlag(key) {
  return getRuntimeState({ create: false })?.[key];
}

export function setRuntimeFlag(key, value) {
  getRuntimeState()[key] = value;
  return value;
}

export function clearRuntimeFlag(key) {
  const state = getRuntimeState({ create: false });
  if (state) delete state[key];
}

export function setSuppressLightingRefresh(value = true) {
  return setRuntimeFlag('suppressLightingRefresh', value);
}

export function clearSuppressLightingRefresh() {
  clearRuntimeFlag('suppressLightingRefresh');
}

export function isLightingRefreshSuppressed() {
  return !!getRuntimeFlag('suppressLightingRefresh');
}

export function setSuppressRefreshTokenProcessing(value = true) {
  return setRuntimeFlag('suppressRefreshTokenProcessing', value);
}

export function clearSuppressRefreshTokenProcessing() {
  setRuntimeFlag('suppressRefreshTokenProcessing', false);
}

export function isRefreshTokenProcessingSuppressed() {
  return !!getRuntimeFlag('suppressRefreshTokenProcessing');
}

export function setSuppressLightingRefreshAfterBatch(value = true) {
  return setRuntimeFlag('suppressLightingRefreshAfterBatch', value);
}

export function clearSuppressLightingRefreshAfterBatch() {
  setRuntimeFlag('suppressLightingRefreshAfterBatch', false);
}

export function isLightingRefreshAfterBatchSuppressed() {
  return !!getRuntimeFlag('suppressLightingRefreshAfterBatch');
}

export function setLastMovedTokenId(tokenId) {
  return setRuntimeFlag('lastMovedTokenId', tokenId);
}

export function getLastMovedTokenId() {
  return getRuntimeFlag('lastMovedTokenId') || null;
}

export function clearLastMovedTokenId() {
  clearRuntimeFlag('lastMovedTokenId');
}

export function setPostBatchPerceptionRefreshSuppression(suppression) {
  return setRuntimeFlag('suppressNextAvsPostBatchPerceptionRefresh', suppression);
}

export function getPostBatchPerceptionRefreshSuppression() {
  return getRuntimeFlag('suppressNextAvsPostBatchPerceptionRefresh') || null;
}

export function clearPostBatchPerceptionRefreshSuppression() {
  setRuntimeFlag('suppressNextAvsPostBatchPerceptionRefresh', null);
}
