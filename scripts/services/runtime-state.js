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

export function setSuppressPendingMovementVisualRefresh(value = true) {
  return setRuntimeFlag('suppressPendingMovementVisualRefresh', value);
}

export function clearSuppressPendingMovementVisualRefresh() {
  setRuntimeFlag('suppressPendingMovementVisualRefresh', false);
}

export function isPendingMovementVisualRefreshSuppressed() {
  return !!getRuntimeFlag('suppressPendingMovementVisualRefresh');
}

export function setMovementPerformanceDiagnosticsEnabled(value = true) {
  return setRuntimeFlag('enableMovementPerformanceDiagnostics', value);
}

export function clearMovementPerformanceDiagnosticsEnabled() {
  setRuntimeFlag('enableMovementPerformanceDiagnostics', false);
}

export function isMovementPerformanceDiagnosticsEnabled() {
  return !!getRuntimeFlag('enableMovementPerformanceDiagnostics');
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

export function setSuppressTokenMovementLightingRefresh(durationMs = 1000) {
  return setRuntimeFlag('suppressTokenMovementLightingRefreshUntil', Date.now() + durationMs);
}

export function clearSuppressTokenMovementLightingRefresh() {
  clearRuntimeFlag('suppressTokenMovementLightingRefreshUntil');
}

export function isTokenMovementLightingRefreshSuppressed() {
  const until = Number(getRuntimeFlag('suppressTokenMovementLightingRefreshUntil') || 0);
  if (!until) return false;
  if (until > Date.now()) return true;
  clearSuppressTokenMovementLightingRefresh();
  return false;
}

export function setSuppressTokenLightMovementLightingRefresh(durationMs = 2500) {
  return setRuntimeFlag('suppressTokenLightMovementLightingRefreshUntil', Date.now() + durationMs);
}

export function clearSuppressTokenLightMovementLightingRefresh() {
  clearRuntimeFlag('suppressTokenLightMovementLightingRefreshUntil');
}

export function isTokenLightMovementLightingRefreshSuppressed() {
  const until = Number(getRuntimeFlag('suppressTokenLightMovementLightingRefreshUntil') || 0);
  if (!until) return false;
  if (until > Date.now()) return true;
  clearSuppressTokenLightMovementLightingRefresh();
  return false;
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

export function requestFullVisibilityScopeRecalc() {
  return setRuntimeFlag('forceFullVisibilityScopeRecalc', true);
}

export function consumeFullVisibilityScopeRecalc() {
  const requested = !!getRuntimeFlag('forceFullVisibilityScopeRecalc');
  if (requested) clearRuntimeFlag('forceFullVisibilityScopeRecalc');
  return requested;
}
