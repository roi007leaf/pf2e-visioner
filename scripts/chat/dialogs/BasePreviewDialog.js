/**
 * BasePreviewDialog
 * Common behaviors shared by all chat action preview dialogs.
 * - Selection-based row highlighting synced with controlled tokens
 * - Safe hook attachment/cleanup
 */

import {
  addTokenImageClickHandlers,
  panToAndSelectToken,
  panToWall,
} from '../../ui/shared-ui-utils.js';

export class BasePreviewDialog extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  constructor(options = {}) {
    super(options);
    this._selectionHookId = null;
    this._targetHookId = null;
  }

  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    this._attachSelectionHandlers();
    this._applySelectionHighlight();
    // Ensure action preview dialogs have a fixed height and inner scroll area
    try { this._ensureActionDialogScrollLayout(); } catch { }
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    this._applySelectionHighlight();
    // Re-apply layout enforcement on rerenders
    try { this._ensureActionDialogScrollLayout(); } catch { }
    // Live re-filtering for per-dialog Ignore Allies checkbox
    try {
      const cb = this.element.querySelector('input[data-action="toggleIgnoreAllies"]');
      if (cb) {
        cb.addEventListener('change', () => {
          this.ignoreAllies = !!cb.checked;
          this.render({ force: true });
        });
      }
    } catch { }

    // Add token image click handlers for panning and selection
    try {
      addTokenImageClickHandlers(this.element, this);
    } catch { }
  }

  async close(options) {
    this._detachSelectionHandlers();
    return super.close(options);
  }

  _attachSelectionHandlers() {
    if (this._selectionHookId && this._targetHookId) return;
    if (!this._selectionHookId)
      this._selectionHookId = Hooks.on('controlToken', () => this._applySelectionHighlight());
    if (!this._targetHookId)
      this._targetHookId = Hooks.on('targetToken', () => this._applySelectionHighlight());
  }

  _detachSelectionHandlers() {
    try {
      if (this._selectionHookId) Hooks.off('controlToken', this._selectionHookId);
    } catch { }
    try {
      if (this._targetHookId) Hooks.off('targetToken', this._targetHookId);
    } catch { }
    this._selectionHookId = null;
    this._targetHookId = null;
  }

  _applySelectionHighlight() {
    try {
      // Clear previous highlights
      this.element
        .querySelectorAll('tr.token-row.row-hover')
        ?.forEach((el) => el.classList.remove('row-hover'));

      const selectedTokens = Array.from(canvas?.tokens?.controlled ?? []);
      const targetedTokens = Array.from(game?.user?.targets ?? []);
      const focusTokens = [...new Set([...selectedTokens, ...targetedTokens])];
      if (!focusTokens.length) return;

      let firstRow = null;
      for (const token of focusTokens) {
        const row = this.element.querySelector(`tr[data-token-id="${token.id}"]`);
        if (row) {
          row.classList.add('row-hover');
          if (!firstRow) firstRow = row;
        }
      }

      // Do not auto-scroll to wall rows; only scroll to token rows
      if (firstRow && typeof firstRow.scrollIntoView === 'function') {
        firstRow.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }
    } catch { }
  }

  // Token image click handlers
  panToAndSelectToken(token) {
    return panToAndSelectToken(token);
  }

  panToWall(wall) {
    return panToWall(wall);
  }

  /**
   * Enforce a consistent scrollable layout for action preview dialogs.
   * Ensures the dialog has a bounded height and the results container scrolls vertically.
   */
  _ensureActionDialogScrollLayout() {
    const root = this.element;
    if (!root) return;

    // Only apply to Visioner action dialogs (seek/hide/sneak/etc.) that contain tables
    const isActionDialog = root.classList.contains('pf2e-visioner') &&
      (
        root.classList.contains('seek-preview-dialog') ||
        root.classList.contains('hide-preview-dialog') ||
        root.classList.contains('sneak-preview-dialog') ||
        root.classList.contains('point-out-preview-dialog') ||
        root.classList.contains('create-a-diversion-preview-dialog') ||
        root.classList.contains('consequences-preview-dialog') ||
        root.classList.contains('take-cover-preview-dialog')
      );
    if (!isActionDialog) return;

    // Fix overall height if not constrained (avoid expanding to content and losing inner scrollbars)
    try {
      const currentH = root.style.height?.trim();
      if (!currentH || currentH === 'auto') {
        root.style.height = '600px';
        root.style.maxHeight = '85vh';
      }
    } catch { }

    // Window content should not scroll; inner container will handle scrolling
    const wc = root.querySelector('.window-content');
    if (wc) {
      wc.style.height = '100%';
      wc.style.minHeight = '0';
      wc.style.overflow = 'hidden';
      // Prefer a little padding for aesthetics if not already set inline
      if (!wc.style.padding) wc.style.padding = '10px';
    }

    // Content wrapper must be a flex column that fills available height
    const contentWrapper = root.querySelector(
      '.seek-preview-content, .hide-preview-content, .sneak-preview-content, .point-out-preview-content, .create-a-diversion-preview-content, .consequences-preview-content, .take-cover-preview-content'
    );
    if (contentWrapper) {
      contentWrapper.style.display = 'flex';
      contentWrapper.style.flexDirection = 'column';
      contentWrapper.style.height = '100%';
      contentWrapper.style.minHeight = '0';
      contentWrapper.style.overflow = 'hidden';
    }

    // Results container should scroll vertically inside the flex column
    const containers = root.querySelectorAll('.results-table-container');
    containers.forEach((el) => {
      el.style.flex = '1 1 auto';
      el.style.minHeight = '0';
      el.style.maxHeight = '100%';
      el.style.overflowY = 'auto';
      // Do not force overflowX here; allow CSS (e.g., enhanced-position-tracking) to control horizontal scroll
    });
  }
}
