const selectAllTokenVisibilityBypassState = (globalThis.__pf2eVisionerSelectAllBypass ??= {
  active: false,
  observedAllSelected: false,
  persistWhileAllSelected: false,
  primedAt: 0,
  timer: null,
});
const SELECT_ALL_TOKEN_VISIBILITY_BYPASS_MS = 100;
const SELECT_ALL_TOKEN_SELECTION_ARM_MS = 1000;

function eventTargetsEditableElement(event) {
  const target = event?.target;
  if (!target) return false;
  const tagName = String(target.tagName || '').toLowerCase();
  return (
    target.isContentEditable === true ||
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select'
  );
}

function tokenLayerIsActive() {
  const tokensLayer = globalThis.canvas?.tokens;
  return !globalThis.canvas?.activeLayer || globalThis.canvas.activeLayer === tokensLayer;
}

function tokenIdOf(token) {
  return token?.document?.id ?? token?.id ?? null;
}

function tokenIsSelectableForSelectAll(token) {
  if (!tokenIdOf(token)) return false;
  if (token?.document?.hidden === true) return false;
  if (token?.isPreview === true) return false;
  return true;
}

function currentSelectionCoversAllSelectableTokens() {
  const tokensLayer = globalThis.canvas?.tokens;
  const selectableTokenIds = (tokensLayer?.placeables || [])
    .filter(tokenIsSelectableForSelectAll)
    .map(tokenIdOf);
  if (!selectableTokenIds.length) return false;

  const controlledTokenIds = new Set(
    (tokensLayer?.controlled || []).map(tokenIdOf).filter(Boolean),
  );
  if (controlledTokenIds.size < selectableTokenIds.length) return false;

  return selectableTokenIds.every((id) => controlledTokenIds.has(id));
}

function selectAllSelectionBypassIsActive() {
  if (!selectAllTokenVisibilityBypassState.persistWhileAllSelected) return false;

  if (currentSelectionCoversAllSelectableTokens()) {
    selectAllTokenVisibilityBypassState.observedAllSelected = true;
    return true;
  }

  const primedAt = Number(selectAllTokenVisibilityBypassState.primedAt) || 0;
  const stillSettling = Date.now() - primedAt <= SELECT_ALL_TOKEN_SELECTION_ARM_MS;
  if (!selectAllTokenVisibilityBypassState.observedAllSelected && stillSettling) return false;

  selectAllTokenVisibilityBypassState.persistWhileAllSelected = false;
  selectAllTokenVisibilityBypassState.observedAllSelected = false;
  return false;
}

export function isSelectAllTokenVisibilityBypassActive() {
  return (
    selectAllTokenVisibilityBypassState.active === true ||
    selectAllSelectionBypassIsActive()
  );
}

export function primeSelectAllTokenVisibilityBypassFromKeyboard(event) {
  if (eventTargetsEditableElement(event)) return false;
  if (!tokenLayerIsActive()) return false;
  if (event?.defaultPrevented) return false;
  if (!(event?.ctrlKey || event?.metaKey)) return false;
  if (event?.altKey) return false;
  if (String(event?.key || '').toLowerCase() !== 'a') return false;

  selectAllTokenVisibilityBypassState.active = true;
  selectAllTokenVisibilityBypassState.observedAllSelected = false;
  selectAllTokenVisibilityBypassState.persistWhileAllSelected = true;
  selectAllTokenVisibilityBypassState.primedAt = Date.now();
  if (selectAllTokenVisibilityBypassState.timer) {
    clearTimeout(selectAllTokenVisibilityBypassState.timer);
  }
  selectAllTokenVisibilityBypassState.timer = setTimeout(() => {
    selectAllTokenVisibilityBypassState.active = false;
    selectAllTokenVisibilityBypassState.timer = null;
  }, SELECT_ALL_TOKEN_VISIBILITY_BYPASS_MS);
  return true;
}
