/**
 * Override Validation Dialog - ApplicationV2 with HandlebarsApplicationMixin
 * Shows when manual overrides become invalid due to position/lighting changes
 */

import { COVER_STATES, VISIBILITY_STATES } from '../constants.js';

export class OverrideValidationDialog extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {

  constructor(options = {}) {
    options.window = options.window || {};
    options.window.title = game?.i18n?.localize('PF2E_VISIONER.DIALOG_TITLES.AVS_VALIDATION') || 'AVS Changes Validation';

    super(options);
    this.invalidOverrides = options.invalidOverrides || [];
    this.tokenName = options.tokenName || 'Unknown Token';
    // Prefer explicit moved token id when provided by caller
    this.movedTokenId = options.movedTokenId || null;
    this.isRoundChange = options.isRoundChange || false;
  }

  static DEFAULT_OPTIONS = {
    id: "override-validation-dialog",
    tag: "div",
    window: {
      icon: "fas fa-bolt-auto",
      // Include module root class so shared styles apply consistently
      contentClasses: ["pf2e-visioner", "override-validation-dialog"],
      resizable: true,
    },
    position: {
      width: 600,
      height: 560,
      left: null,
      top: null
    },
    form: {
      closeOnSubmit: false,
      submitOnChange: false
    }
  };

  static PARTS = {
    content: {
      template: "modules/pf2e-visioner/templates/override-validation.hbs"
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // Prepare invalid overrides data for display
    const overrides = this.invalidOverrides.map(override => {
      const src = String(override.source || 'manual_action');
      let badgeLabel = 'Manual Override';
      let badgeIcon = 'fa-user-secret';
      let badgeClass = 'badge-manual';

      if (/sneak/i.test(src)) {
        badgeLabel = 'Sneak Override';
        badgeIcon = 'fa-ninja';
        badgeClass = 'badge-sneak';
      } else if (/seek/i.test(src)) {
        badgeLabel = 'Seek action';
        badgeIcon = 'fa-search';
        badgeClass = 'badge-seek';
      } else if (/point[_-]?out/i.test(src)) {
        badgeLabel = 'Point Out';
        badgeIcon = 'fa-hand-point-right';
        badgeClass = 'badge-pointout';
      } else if (/diversion/i.test(src)) {
        badgeLabel = 'Diversion';
        badgeIcon = 'fa-theater-masks';
        badgeClass = 'badge-diversion';
      } else if (/hide/i.test(src)) {
        badgeLabel = 'Hide Override';
        badgeIcon = 'fa-user-secret';
        badgeClass = 'badge-hide';
      } else if (/manual|popup|dialog|roll/i.test(src)) {
        badgeLabel = 'Manual Override';
        badgeIcon = 'fa-user-edit';
        badgeClass = 'badge-manual';
      } else {
        badgeLabel = 'Override';
        badgeIcon = 'fa-adjust';
        badgeClass = 'badge-generic';
      }
      // Resolve token images if available on the canvas
      // Use actor portrait for consistency with Token Manager
      const observerToken = canvas.tokens?.get(override.observerId);
      const targetToken = canvas.tokens?.get(override.targetId);
      const observerImg = observerToken?.actor?.img ?? observerToken?.document?.texture?.src ?? observerToken?.texture?.src ?? observerToken?.document?.img ?? 'icons/svg/book.svg';
      const targetImg = targetToken?.actor?.img ?? targetToken?.document?.texture?.src ?? targetToken?.texture?.src ?? targetToken?.document?.img ?? 'icons/svg/book.svg';

      console.log(`PF2E Visioner | Image resolution for ${override.observerName} → ${override.targetName}:`, {
        observerImg,
        targetImg,
        hasObserverToken: !!observerToken,
        hasTargetToken: !!targetToken
      });

      // Pick analysis icons from actual current state when provided by validator
      // Prefer current states provided by the validator/caller; fall back to safe defaults
      const visibilityKey = override.currentVisibility || 'observed';
      const coverKey = override.currentCover || 'none';
      const prevVisibilityKey = override.state || (override.hasConcealment ? 'concealed' : 'observed');

      // Debug logging
      if (game.settings.get('pf2e-visioner', 'debug')) {
        console.log(`Override for ${override.observerName} → ${override.targetName}:`, {
          state: override.state,
          currentVisibility: override.currentVisibility,
          prevVisibilityKey,
          visibilityKey
        });
      }
      // Previous/original cover must reflect what the override expected at apply-time,
      // not what the currentCover is now. If we don't have a specific level, assume 'standard'.
      const prevCoverKey = (override.expectedCover != null)
        ? override.expectedCover
        : (override.hasCover ? (override.originalCover || 'standard') : 'none');

      const visCfg = (VISIBILITY_STATES && VISIBILITY_STATES[visibilityKey]) || { icon: 'fas fa-eye', color: '#4caf50', label: 'Observed' };
      const coverCfg = (COVER_STATES && COVER_STATES[coverKey]) || { icon: 'fas fa-shield-slash', color: '#4caf50', label: 'No Cover' };
      const prevVisCfg = (VISIBILITY_STATES && VISIBILITY_STATES[prevVisibilityKey]) || { icon: 'fas fa-eye', color: '#9e9e9e', label: 'Observed' };
      const prevCoverCfg = (COVER_STATES && COVER_STATES[prevCoverKey]) || { icon: 'fas fa-shield', color: '#9e9e9e', label: game.i18n.localize('PF2E_VISIONER.TOKEN_MANAGER.COVER_STATE') };

      return {
        id: `${override.observerId}-${override.targetId}`,
        observerId: override.observerId,
        targetId: override.targetId,
        observerName: override.observerName,
        targetName: override.targetName,
        observerImg,
        targetImg,
        reason: override.reason,
        // Optionally surface a friendly description of current states
        currentVisibilityDescription: (VISIBILITY_STATES && VISIBILITY_STATES[visibilityKey]?.label)
          ? (game?.i18n?.localize?.(VISIBILITY_STATES[visibilityKey].label) + (coverKey && COVER_STATES && COVER_STATES[coverKey]?.label ? ` • ${game?.i18n?.localize?.(COVER_STATES[coverKey].label)}` : ''))
          : undefined,
        state: override.state || 'undetected',
        source: override.source || 'unknown',
        badgeLabel,
        badgeIcon,
        badgeClass,
        prevVisibility: {
          key: prevVisibilityKey,
          icon: prevVisCfg.icon,
          color: prevVisCfg.color,
          label: game?.i18n?.localize?.(prevVisCfg.label) || 'Previous'
        },
        statusVisibility: {
          key: visibilityKey,
          icon: visCfg.icon,
          color: visCfg.color,
          label: game?.i18n?.localize?.(visCfg.label) || 'Observed'
        },
        prevCover: {
          key: prevCoverKey,
          icon: prevCoverCfg.icon,
          color: prevCoverCfg.color,
          label: game?.i18n?.localize?.(prevCoverCfg.label) || 'Previous Cover'
        },
        statusCover: {
          key: coverKey,
          icon: coverCfg.icon,
          color: coverCfg.color,
          label: game?.i18n?.localize?.(coverCfg.label) || 'No Cover'
        }
      };
    });

    // Group into observer- and target-oriented lists for separate tables
    const observerOrientedOverrides = [];
    const targetOrientedOverrides = [];
    let unifiedOverrides = [];

    // In round change mode, deduplicate and use unified view
    if (this.isRoundChange) {
      const seen = new Set();
      for (const o of overrides) {
        const key = `${o.observerId}-${o.targetId}`;
        if (!seen.has(key)) {
          seen.add(key);
          unifiedOverrides.push(o);
        }
      }
    } else {
      // Group relative to the actual mover when available; fallback to global, then header-by-name
      let refTokenId = this.movedTokenId || game?.pf2eVisioner?.lastMovedTokenId || null;
      if (!refTokenId) {
        try {
          const headerTokenByName = canvas.tokens?.placeables?.find(t => t?.document?.name === this.tokenName);
          refTokenId = headerTokenByName?.document?.id || headerTokenByName?.id || null;
        } catch { }
      }

      for (const o of overrides) {
        if (refTokenId) {
          if (o.observerId === refTokenId) observerOrientedOverrides.push(o);
          else if (o.targetId === refTokenId) targetOrientedOverrides.push(o);
          else targetOrientedOverrides.push(o); // if unrelated, keep in target table for review
        } else {
          // If we can't resolve a reference token, default to target table
          targetOrientedOverrides.push(o);
        }
      }
    }

    // Determine header info for target table. Prefer the moved token if available.
    let headerToken = null;
    try { headerToken = canvas.tokens?.placeables?.find(t => t?.document?.name === this.tokenName) || null; } catch { }
    const targetHeader = {
      name: this.tokenName,
      img: headerToken?.actor?.img ?? headerToken?.document?.texture?.src ?? headerToken?.texture?.src ?? headerToken?.document?.img ?? 'icons/svg/book.svg'
    };

    const result = {
      ...context,
      tokenName: this.tokenName,
      overrides,
      observerOrientedOverrides,
      targetOrientedOverrides,
      unifiedOverrides,
      overrideCount: this.isRoundChange ? unifiedOverrides.length : overrides.length,
      hasManualOverrides: overrides.some(o => /manual/i.test(o.source)),
      targetHeader,
      isRoundChange: this.isRoundChange
    };

    console.log('PF2E Visioner | Dialog context prepared:', {
      isRoundChange: this.isRoundChange,
      observerOrientedCount: observerOrientedOverrides.length,
      targetOrientedCount: targetOrientedOverrides.length,
      unifiedCount: unifiedOverrides.length,
      sampleObserverOverride: observerOrientedOverrides[0],
      sampleTargetOverride: targetOrientedOverrides[0],
      sampleUnifiedOverride: unifiedOverrides[0]
    });

    return result;
  }

  _onRender(context, options) {
    super._onRender(context, options);

    // Add event listeners for bulk action buttons
    const clearAllBtn = this.element.querySelector('.btn-clear-all');
    const keepAllBtn = this.element.querySelector('.btn-keep-all');
    const clearObserverBtn = this.element.querySelector('.btn-clear-observer');
    const clearTargetBtn = this.element.querySelector('.btn-clear-target');

    // Add event listeners for individual action buttons
    const individualClearBtns = this.element.querySelectorAll('.btn-clear');
    const individualKeepBtns = this.element.querySelectorAll('.btn-keep');

    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', () => this._onAcceptAll());
    }

    if (keepAllBtn) {
      keepAllBtn.addEventListener('click', () => this._onRejectAll());
    }

    if (clearObserverBtn) {
      clearObserverBtn.addEventListener('click', () => this._onAcceptByGroup('observer'));
    }
    if (clearTargetBtn) {
      clearTargetBtn.addEventListener('click', () => this._onAcceptByGroup('target'));
    }

    // Add listeners for individual clear buttons
    individualClearBtns.forEach(btn => {
      btn.addEventListener('click', (event) => {
        const overrideId = event.currentTarget.dataset.overrideId;
        this._onAcceptIndividual(overrideId);
      });
    });

    // Add listeners for individual keep buttons
    individualKeepBtns.forEach(btn => {
      btn.addEventListener('click', (event) => {
        const overrideId = event.currentTarget.dataset.overrideId;
        this._onRejectIndividual(overrideId);
      });
    });

    // Click a token chip to pan/select that token and highlight the row
    const tokenChips = this.element.querySelectorAll('.chip--token');
    tokenChips.forEach(chip => {
      chip.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const tokenId = chip.dataset.tokenId;
        if (!tokenId) return;
        try {
          const token = canvas.tokens?.get(tokenId);
          if (!token) return;
          // Pan to token and select it
          const center = token.center ?? { x: token.x + (token.w ?? token.width ?? 0) / 2, y: token.y + (token.h ?? token.height ?? 0) / 2 };
          // Animate pan without altering scale
          await canvas.animatePan({ x: center.x, y: center.y, duration: 400 });
          // Select just this token
          try { canvas?.tokens?.selectObjects?.([token], { releaseOthers: true, control: true }); } catch { }

          // Highlight the corresponding row within the same table
          const row = chip.closest('tr.token-row');
          if (row) {
            // Remove highlight from all rows in this dialog so only one is highlighted overall
            this.element.querySelectorAll('tr.token-row.row-hover').forEach(r => r.classList.remove('row-hover'));
            row.classList.add('row-hover');
          }
        } catch (err) {
          console.warn('PF2E Visioner | Failed to pan/select token from override dialog:', err);
        }
      });
    });

    // Click token image cells in normal mode tables to pan to token
    const imageCells = this.element.querySelectorAll('td.target-img, td.observer-img');
    imageCells.forEach(cell => {
      cell.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const tokenId = cell.dataset.tokenId;
        if (!tokenId) return;
        try {
          const token = canvas.tokens?.get(tokenId);
          if (!token) return;
          const center = token.center ?? { x: token.x + (token.w ?? token.width ?? 0) / 2, y: token.y + (token.h ?? token.height ?? 0) / 2 };
          await canvas.animatePan({ x: center.x, y: center.y, duration: 400 });
          try { canvas?.tokens?.selectObjects?.([token], { releaseOthers: true, control: true }); } catch { }
          const row = cell.closest('tr.token-row');
          if (row) {
            this.element.querySelectorAll('tr.token-row.row-hover').forEach(r => r.classList.remove('row-hover'));
            row.classList.add('row-hover');
          }
        } catch (err) {
          console.warn('PF2E Visioner | Failed to pan to token from image cell:', err);
        }
      });
    });

    // Click token images in unified table to pan to token
    const tokenImages = this.element.querySelectorAll('.unified-table .token-info img');
    tokenImages.forEach(img => {
      img.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const tokenInfo = img.closest('.token-info');
        const tokenId = tokenInfo?.dataset?.tokenId;
        if (!tokenId) return;
        try {
          const token = canvas.tokens?.get(tokenId);
          if (!token) return;
          const center = token.center ?? { x: token.x + (token.w ?? token.width ?? 0) / 2, y: token.y + (token.h ?? token.height ?? 0) / 2 };
          await canvas.animatePan({ x: center.x, y: center.y, duration: 400 });
          try { canvas?.tokens?.selectObjects?.([token], { releaseOthers: true, control: true }); } catch { }
          const row = img.closest('tr.token-row');
          if (row) {
            this.element.querySelectorAll('tr.token-row.row-hover').forEach(r => r.classList.remove('row-hover'));
            row.classList.add('row-hover');
          }
        } catch (err) {
          console.warn('PF2E Visioner | Failed to pan to token from unified table:', err);
        }
      });
    });

  }

  async _onAcceptByGroup(group) {
    try {
      const moved = game?.pf2eVisioner?.lastMovedTokenId || null;
      if (!moved) return this._onAcceptAll();
      const toRemove = this.invalidOverrides.filter(o => group === 'observer' ? o.observerId === moved : o.targetId === moved);
      for (const override of toRemove) {
        try {
          const { default: AvsOverrideManager } = await import('../chat/services/infra/AvsOverrideManager.js');
          await AvsOverrideManager.removeOverride(override.observerId, override.targetId);
        } catch (err) {
          console.error('PF2E Visioner | Error removing override:', err);
        }
      }

      // Remove from local state and rerender
      this.invalidOverrides = this.invalidOverrides.filter(o => !(group === 'observer' ? o.observerId === moved : o.targetId === moved));
      await this.render(true);

      ui.notifications.info(game.i18n.format('PF2E_VISIONER.NOTIFICATIONS.AVS_ACCEPTED_IN_TABLE', { count: toRemove.length, group }));
      if (!this.invalidOverrides.length) {
        setTimeout(() => this.close(), 300);
        try { const { default: indicator } = await import('./OverrideValidationIndicator.js'); indicator.hide(true); } catch { }
      }
    } catch (e) {
      console.error('PF2E Visioner | Error during group clear:', e);
      ui.notifications.error(game.i18n.localize('PF2E_VISIONER.NOTIFICATIONS.OVERRIDE_CLEAR_FAILED'));
    }
  }

  async _onRejectIndividual(overrideId) {


    // Find the override by ID
    const override = this.invalidOverrides.find(o => `${o.observerId}-${o.targetId}` === overrideId);
    if (!override) {

      return;
    }

    try {
      // Remove from the dialog's data
      this.invalidOverrides = this.invalidOverrides.filter(o => `${o.observerId}-${o.targetId}` !== overrideId);

      // Disable the row and update status text/icon in the new table-based UI
      const overrideElement = this.element.querySelector(`[data-override-id="${overrideId}"]`);
      if (overrideElement) {
        overrideElement.style.opacity = '0.6';
        overrideElement.style.pointerEvents = 'none';
        const statusSpan = overrideElement.querySelector('.status-description span');
        if (statusSpan) statusSpan.textContent = game.i18n.localize('PF2E_VISIONER.UI.REJECTED_LABEL');
        const statusIcon = overrideElement.querySelector('.status-description i');
        if (statusIcon) {
          statusIcon.classList.remove('fa-check-circle');
          statusIcon.classList.add('fa-info-circle');
          statusIcon.style.color = '#dc3545';
        }
        const icons = overrideElement.querySelector('.status-icons');
        const desc = overrideElement.querySelector('.status-description');
        if (icons) icons.style.display = 'none';
        if (desc) desc.style.display = 'inline-flex';
      }

      // If no more overrides, close the dialog and hide indicator
      if (this.invalidOverrides.length === 0) {
        setTimeout(() => this.close(), 1000);
        try {
          const { default: indicator } = await import('./OverrideValidationIndicator.js');
          indicator.hide(true);
        } catch { }
      }

      ui.notifications.info(game.i18n.format('PF2E_VISIONER.NOTIFICATIONS.AVS_REJECTED_SINGLE', { observerName: override.observerName, targetName: override.targetName }));
    } catch (error) {
      console.error('PF2E Visioner | Error keeping individual override:', error);
      ui.notifications.error(game.i18n.localize('PF2E_VISIONER.NOTIFICATIONS.OVERRIDE_KEEP_FAILED'));
    }
  }

  async _onAcceptIndividual(overrideId) {


    // Find the override by ID
    const override = this.invalidOverrides.find(o => `${o.observerId}-${o.targetId}` === overrideId);
    if (!override) {

      return;
    }

    try {
      const observer = canvas.tokens?.get(override.observerId);
      const target = canvas.tokens?.get(override.targetId);

      if (observer && target) {
        const { default: AvsOverrideManager } = await import('../chat/services/infra/AvsOverrideManager.js');
        await AvsOverrideManager.removeOverride(override.observerId, override.targetId);

        // Remove from the dialog's data
        this.invalidOverrides = this.invalidOverrides.filter(o => `${o.observerId}-${o.targetId}` !== overrideId);

        // Disable the row and update status text/icon in the new table-based UI
        const overrideElement = this.element.querySelector(`[data-override-id="${overrideId}"]`);
        if (overrideElement) {
          overrideElement.style.opacity = '0.6';
          overrideElement.style.pointerEvents = 'none';
          const statusSpan = overrideElement.querySelector('.status-description span');
          if (statusSpan) statusSpan.textContent = game.i18n.localize('PF2E_VISIONER.UI.ACCEPTED_LABEL');
          const statusIcon = overrideElement.querySelector('.status-description i');
          if (statusIcon) {
            statusIcon.classList.remove('fa-info-circle');
            statusIcon.classList.add('fa-check-circle');
            statusIcon.style.color = '#198754';
          }
          const icons = overrideElement.querySelector('.status-icons');
          const desc = overrideElement.querySelector('.status-description');
          if (icons) icons.style.display = 'none';
          if (desc) desc.style.display = 'inline-flex';
        }

        // If no more overrides, close the dialog and hide indicator
        if (this.invalidOverrides.length === 0) {
          setTimeout(() => this.close(), 1000);
          try {
            const { default: indicator } = await import('./OverrideValidationIndicator.js');
            indicator.hide(true);
          } catch { }
        }

        ui.notifications.info(game.i18n.format('PF2E_VISIONER.NOTIFICATIONS.AVS_ACCEPTED_SINGLE', { observerName: override.observerName, targetName: override.targetName }));
      }
    } catch (error) {
      console.error('PF2E Visioner | Error removing individual override:', error);
      ui.notifications.error(game.i18n.localize('PF2E_VISIONER.NOTIFICATIONS.AVS_ACCEPT_FAILED'));
    }
  }

  async _onAcceptAll() {

    // Close dialog first
    await this.close();

    // Remove all invalid overrides
    for (const override of this.invalidOverrides) {
      try {
        const { default: AvsOverrideManager } = await import('../chat/services/infra/AvsOverrideManager.js');
        await AvsOverrideManager.removeOverride(override.observerId, override.targetId);
      } catch (error) {
        console.error('PF2E Visioner | Error removing override:', error);
      }
    }

    ui.notifications.info(game.i18n.format('PF2E_VISIONER.NOTIFICATIONS.AVS_ACCEPTED_COUNT', { count: this.invalidOverrides.length }));
    try {
      const { default: indicator } = await import('./OverrideValidationIndicator.js');
      indicator.hide(true);
    } catch { }
  }

  async _onRejectAll() {

    await this.close();
    ui.notifications.info(game.i18n.localize('PF2E_VISIONER.NOTIFICATIONS.AVS_REJECTED_ALL'));
    try {
      const { default: indicator } = await import('./OverrideValidationIndicator.js');
      indicator.hide(true);
    } catch { }
  }

  /**
   * Static method to show the dialog with invalid overrides
   * @param {Array} invalidOverrides - Array of invalid override objects
   * @param {string} tokenName - Name of the token that moved
   * @param {string|null} movedTokenId - Explicit id of the token that moved (for grouping)
   * @returns {Promise<OverrideValidationDialog>}
   */
  static async show(invalidOverrides, tokenName, movedTokenId = null) {
    if (!invalidOverrides?.length) {
      return null;
    }



    const dialog = new OverrideValidationDialog({
      invalidOverrides,
      tokenName,
      movedTokenId
    });

    await dialog.render(true);
    return dialog;
  }
}

// Register the dialog for global access
window.OverrideValidationDialog = OverrideValidationDialog;