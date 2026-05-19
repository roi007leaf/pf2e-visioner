const DEFAULT_MAX_HIGHLIGHT_RETRIES = 30;
const DEFAULT_HIGHLIGHT_RETRY_DELAY_MS = 50;

export function buildTooltipTokenManagerRequest({
  observerToken,
  targetToken,
  mode,
  actualTarget = null,
}) {
  const opensActualTarget = mode === 'target' && !!actualTarget;

  return {
    tokenToOpen: opensActualTarget
      ? actualTarget
      : mode === 'observer'
        ? observerToken
        : targetToken,
    modeToUse: opensActualTarget ? 'target' : mode,
    rowTokenId: opensActualTarget
      ? observerToken.id
      : mode === 'observer'
        ? targetToken.id
        : observerToken.id,
  };
}

function getManagerTokenRows(element) {
  return Array.from(element.querySelectorAll('tr[data-token-id]'));
}

function getRowsForTokenId(element, tokenId) {
  return getManagerTokenRows(element).filter(
    (row) => row.getAttribute('data-token-id') === tokenId,
  );
}

function findFirstVisibleManagerRow(rows, activeTab, getComputedStyleFn) {
  const sectionSelector = activeTab === 'cover' ? '.cover-section' : '.visibility-section';

  for (const row of rows) {
    const section = row.closest(sectionSelector);
    if (section && getComputedStyleFn(section).display !== 'none') {
      return row;
    }
  }

  return rows[0] || null;
}

export function highlightTokenManagerRow({
  app,
  rowTokenId,
  getComputedStyleFn = globalThis.getComputedStyle,
  requestAnimationFrameFn = globalThis.requestAnimationFrame,
} = {}) {
  if (!app?.element) return 'waiting';

  const rows = getRowsForTokenId(app.element, rowTokenId);
  const tablePopulated = getManagerTokenRows(app.element).length > 0;

  if (rows.length === 0) return tablePopulated ? 'missing' : 'waiting';

  app.element
    .querySelectorAll('tr.token-row.row-hover')
    ?.forEach((el) => el.classList.remove('row-hover'));

  rows.forEach((row) => row.classList.add('row-hover'));

  const firstVisibleRow = findFirstVisibleManagerRow(
    rows,
    app.activeTab || 'visibility',
    getComputedStyleFn,
  );

  if (firstVisibleRow) {
    const scroll = () => firstVisibleRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (typeof requestAnimationFrameFn === 'function') {
      requestAnimationFrameFn(scroll);
    } else {
      scroll();
    }
  }

  return 'highlighted';
}

export function scheduleTokenManagerRowHighlight({
  app,
  rowTokenId,
  setTimeoutFn = globalThis.setTimeout,
  maxRetries = DEFAULT_MAX_HIGHLIGHT_RETRIES,
  retryDelayMs = DEFAULT_HIGHLIGHT_RETRY_DELAY_MS,
  getComputedStyleFn,
  requestAnimationFrameFn,
} = {}) {
  const highlightRow = (retries = 0) => {
    try {
      const result = highlightTokenManagerRow({
        app,
        rowTokenId,
        getComputedStyleFn,
        requestAnimationFrameFn,
      });

      if (result === 'waiting' && retries < maxRetries) {
        setTimeoutFn(() => highlightRow(retries + 1), retryDelayMs);
      }
    } catch (_) {
      // Manager is already open; row highlighting is opportunistic.
    }
  };

  highlightRow();
}
