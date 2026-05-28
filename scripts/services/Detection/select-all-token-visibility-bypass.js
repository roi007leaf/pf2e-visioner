const selectAllTokenVisibilityBypassState = (globalThis.__pf2eVisionerSelectAllBypass ??= {
  active: false,
  timer: null,
});
const SELECT_ALL_TOKEN_VISIBILITY_BYPASS_MS = 100;

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

export function isSelectAllTokenVisibilityBypassActive() {
  return selectAllTokenVisibilityBypassState.active === true;
}

export function primeSelectAllTokenVisibilityBypassFromKeyboard(event) {
  if (eventTargetsEditableElement(event)) return false;
  if (!tokenLayerIsActive()) return false;
  if (event?.defaultPrevented) return false;
  if (!(event?.ctrlKey || event?.metaKey)) return false;
  if (event?.altKey) return false;
  if (String(event?.key || '').toLowerCase() !== 'a') return false;

  selectAllTokenVisibilityBypassState.active = true;
  if (selectAllTokenVisibilityBypassState.timer) {
    clearTimeout(selectAllTokenVisibilityBypassState.timer);
  }
  selectAllTokenVisibilityBypassState.timer = setTimeout(() => {
    selectAllTokenVisibilityBypassState.active = false;
    selectAllTokenVisibilityBypassState.timer = null;
  }, SELECT_ALL_TOKEN_VISIBILITY_BYPASS_MS);
  return true;
}
