/**
 * Selection and hover highlighting helpers for the Token Manager
 */

import { scheduleTask } from '../../utils/scheduler.js';

export function attachSelectionHandlers(TokenManagerClass) {
  if (TokenManagerClass._selectionHookId) return;
  TokenManagerClass._selectionHookId = Hooks.on('controlToken', () => {
    applySelectionHighlight(TokenManagerClass);
  });
}

export function detachSelectionHandlers(TokenManagerClass) {
  if (TokenManagerClass._selectionHookId) {
    try {
      Hooks.off('controlToken', TokenManagerClass._selectionHookId);
    } catch (_) {}
    TokenManagerClass._selectionHookId = null;
  }
}

export function applySelectionHighlight(TokenManagerClass) {
  const app = TokenManagerClass.currentInstance;
  if (!app || !app.element) return;
  try {
    app.element
      .querySelectorAll('tr.token-row.row-hover')
      ?.forEach((el) => el.classList.remove('row-hover'));
    const selected = Array.from(canvas?.tokens?.controlled ?? []);
    if (!selected.length) return;
    const activeTab = app.activeTab || 'visibility';
    const sectionSelector = activeTab === 'cover' ? '.cover-section' : '.visibility-section';
    let firstRow = null;
    for (const tok of selected) {
      const rows = app.element.querySelectorAll(`tr[data-token-id="${tok.id}"]`);
      if (rows && rows.length) {
        rows.forEach((r) => r.classList.add('row-hover'));
        if (!firstRow) {
          for (const r of rows) {
            const section = r.closest(sectionSelector);
            const visible = section && getComputedStyle(section).display !== 'none';
            if (section && visible) {
              firstRow = r;
              break;
            }
          }
          if (!firstRow) firstRow = rows[0];
        }
      }
    }
    if (firstRow) {
      // Find the nearest scrollable ancestor to avoid overscrolling
      const findScrollParent = (el) => {
        let node = el?.parentElement;
        while (node && node !== document.body) {
          const style = getComputedStyle(node);
          const canScrollY = /(auto|scroll)/.test(style.overflowY);
          if (canScrollY && node.scrollHeight > node.clientHeight + 1) return node;
          node = node.parentElement;
        }
        return null;
      };
      const scroller =
        findScrollParent(firstRow) || app.element.querySelector('.tables-content') || app.element;
      // Use setTimeout instead of requestAnimationFrame for UI updates that should work when unfocused
      scheduleTask(() => {
        try {
          const rowRect = firstRow.getBoundingClientRect();
          const scrRect = scroller.getBoundingClientRect();
          const padding = 8;
          let target = scroller.scrollTop;

          // If row is above the visible area, scroll up just enough
          if (rowRect.top < scrRect.top + padding) {
            target -= scrRect.top + padding - rowRect.top;
          }
          // If row is below the visible area, scroll down just enough
          else if (rowRect.bottom > scrRect.bottom - padding) {
            target += rowRect.bottom - (scrRect.bottom - padding);
          }

          // Clamp target between 0 and max scroll
          target = Math.max(0, Math.min(target, scroller.scrollHeight - scroller.clientHeight));

          if (typeof scroller.scrollTo === 'function')
            scroller.scrollTo({ top: target, behavior: 'smooth' });
          else scroller.scrollTop = target;
        } catch (_) {}
      });
    }
  } catch (_) {}
}

export function attachCanvasHoverHandlers(TokenManagerClass) {
  // Disabled by design: Do not highlight/scroll rows on canvas hover. Only selection highlights rows.
  // Ensure any previously attached hover handlers are removed.
  try {
    detachCanvasHoverHandlers(TokenManagerClass);
  } catch (_) {}
  if (!TokenManagerClass._canvasHoverHandlers) TokenManagerClass._canvasHoverHandlers = new Map();
}

export function detachCanvasHoverHandlers(TokenManagerClass) {
  if (!canvas?.tokens) return;
  TokenManagerClass._canvasHoverHandlers?.forEach((handlers, id) => {
    const token = canvas.tokens.get(id);
    if (token) {
      try {
        token.off('pointerover', handlers.over);
      } catch (_) {}
      try {
        token.off('pointerout', handlers.out);
      } catch (_) {}
    }
  });
  TokenManagerClass._canvasHoverHandlers?.clear?.();
}
