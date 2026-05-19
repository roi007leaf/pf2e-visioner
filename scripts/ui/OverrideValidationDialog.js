/**
 * Override Validation Dialog - ApplicationV2 with HandlebarsApplicationMixin
 * Shows when manual overrides become invalid due to position/lighting changes
 */

import { COVER_STATES, VISIBILITY_STATES } from '../constants.js';
import { loadDialogCSS, loadSharedUICSS } from '../css-loader.js';
import { getLastMovedTokenId } from '../services/runtime-state.js';
import { overrideToDisplayVisibility } from '../visibility/perception-profile.js';

function getVisibilityStateLabelKey(state, { manual = false } = {}) {
  const config = VISIBILITY_STATES?.[state];
  if (!config) return String(state ?? '');
  return manual && config.manualLabel ? config.manualLabel : config.label;
}

const AUTO_COVER_DISPLAY = {
  icon: 'fas fa-arrows-rotate',
  color: '#4fc3f7',
  label: 'Auto Cover',
};

function isTakeCoverAutoRelease(override) {
  return (
    override?.coverOnly === true ||
    override?.coverOverrideSource === 'take_cover_action' ||
    override?.source === 'take_cover_action'
  );
}

function shouldSuppressCoverChange(override) {
  return override?.suppressCoverChange === true;
}

function getExpectedCoverKey(override) {
  return override?.expectedCover != null
    ? override.expectedCover
    : override?.hasCover ? (override.originalCover || 'standard') : 'none';
}

function getDisplayCoverKey(override) {
  if (shouldSuppressCoverChange(override)) return getExpectedCoverKey(override);
  return isTakeCoverAutoRelease(override) ? 'auto' : override?.currentCover || 'none';
}

function isAutoCalculatedCoverChange(override) {
  if (shouldSuppressCoverChange(override)) return false;
  if (isTakeCoverAutoRelease(override)) return false;
  const previousCover = getExpectedCoverKey(override);
  const currentCover = override?.currentCover || 'none';
  return (
    override?.coverChangeSource === 'auto' ||
    (currentCover !== previousCover && !!override?.currentCover)
  );
}

function getCoverDisplayConfig(key, fallback = {}) {
  if (key === 'auto') return AUTO_COVER_DISPLAY;
  return (COVER_STATES && COVER_STATES[key]) || fallback;
}

function localizeCoverLabel(config, key, fallback = 'No Cover') {
  const raw = config?.label || fallback;
  const localized = game?.i18n?.localize?.(raw) || raw;
  if (localized !== raw) return localized;
  const words = String(key || fallback)
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1));
  return words.length ? `${words.join(' ')} Cover` : fallback;
}

function resolveTokenImage(token) {
  return token?.document?.texture?.src ??
    token?.actor?.img ??
    token?.actor?.prototypeToken?.texture?.src ??
    token?.texture?.src ??
    token?.document?.img ??
    null;
}

function createTokenLookup() {
  const byId = new Map();
  const byName = new Map();
  const tokens = canvas?.tokens?.placeables || [];
  for (const token of tokens) {
    const id = token?.id || token?.document?.id;
    const name = token?.document?.name || token?.name;
    if (id && !byId.has(id)) byId.set(id, token);
    if (name && !byName.has(name)) byName.set(name, token);
  }
  return {
    get(id) {
      return (id && byId.get(id)) || canvas?.tokens?.get?.(id) || null;
    },
    getByName(name) {
      return (name && byName.get(name)) || null;
    },
  };
}

export class OverrideValidationDialog extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {

  constructor(options = {}) {
    options.window = options.window || {};
    options.window.title = game?.i18n?.localize('PF2E_VISIONER.DIALOG_TITLES.AVS_VALIDATION') || 'AVS Changes Validation';

    loadDialogCSS();
    loadSharedUICSS();
    super(options);
    this.invalidOverrides = options.invalidOverrides || [];
    this.tokenName = options.tokenName || 'Unknown Token';
    // Prefer explicit moved token id when provided by caller
    this.movedTokenId = options.movedTokenId || null;
    this.isTurnChange = options.isTurnChange || false;
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
    const tokenLookup = createTokenLookup();
    const headerTokenByName = tokenLookup.getByName(this.tokenName);

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
      } else if (/seek.*deferred/i.test(src)) {
        badgeLabel = 'Seek (Deferred)';
        badgeIcon = 'fa-search';
        badgeClass = 'badge-seek';
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
      } else if (/take[_-]?cover/i.test(src)) {
        badgeLabel = 'Take Cover';
        badgeIcon = 'fa-shield-alt';
        badgeClass = 'badge-manual';
      } else if (/manual|popup|dialog|roll/i.test(src)) {
        badgeLabel = 'Manual Override';
        badgeIcon = 'fa-user-edit';
        badgeClass = 'badge-manual';
      } else {
        badgeLabel = 'Override';
        badgeIcon = 'fa-adjust';
        badgeClass = 'badge-generic';
      }
      const stealthPositionBypassLabel = override.stealthPositionBypassLabel || null;
      const stealthPositionBypassTooltip =
        override.stealthPositionBypassTooltip || stealthPositionBypassLabel || null;
      // Resolve token images if available on the canvas
      // Use actor portrait for consistency with Token Manager
      const observerToken = tokenLookup.get(override.observerId);
      const targetToken = tokenLookup.get(override.targetId);
      const observerImg = resolveTokenImage(observerToken) || 'icons/svg/book.svg';
      const targetImg = resolveTokenImage(targetToken) || 'icons/svg/book.svg';

      // Pick analysis icons from actual current state when provided by validator
      // Prefer current states provided by the validator/caller; fall back to safe defaults
      const visibilityKey = override.currentVisibility || 'observed';
      const coverOnly = override.coverOnly === true;
      const controlReleaseOnly = override.controlReleaseOnly === true;
      const coverKey = getDisplayCoverKey(override);
      const autoCalculatedCover = isAutoCalculatedCoverChange(override);
      const suppressCoverChange = shouldSuppressCoverChange(override);
      const prevVisibilityKey = coverOnly
        ? visibilityKey
        : overrideToDisplayVisibility(override);

      // Previous/original cover must reflect what the override expected at apply-time,
      // not what the currentCover is now. If we don't have a specific level, assume 'standard'.
      const prevCoverKey = getExpectedCoverKey(override);

      const visCfg = (VISIBILITY_STATES && VISIBILITY_STATES[visibilityKey]) || { icon: 'fas fa-eye', color: '#4caf50', label: 'Observed' };
      const coverCfg = getCoverDisplayConfig(coverKey, { icon: 'fas fa-shield-slash', color: '#4caf50', label: 'No Cover' });
      const prevVisCfg = (VISIBILITY_STATES && VISIBILITY_STATES[prevVisibilityKey]) || { icon: 'fas fa-eye', color: '#9e9e9e', label: 'Observed' };
      const prevCoverCfg = getCoverDisplayConfig(prevCoverKey, { icon: 'fas fa-shield', color: '#9e9e9e', label: game.i18n.localize('PF2E_VISIONER.TOKEN_MANAGER.COVER_STATE') });
      const localizeVisibilityLabel = (key, fallback) => {
        const labelKey = getVisibilityStateLabelKey(key, { manual: true });
        return game?.i18n?.localize?.(labelKey) || fallback;
      };
      const currentVisibilityLabel = localizeVisibilityLabel(visibilityKey, 'Observed');
      const previousVisibilityLabel = localizeVisibilityLabel(prevVisibilityKey, 'Previous');
      const currentVisibilityDescription = controlReleaseOnly
        ? 'Return to AVS control'
        : (VISIBILITY_STATES && VISIBILITY_STATES[visibilityKey]?.label)
          ? (
            currentVisibilityLabel +
            (!suppressCoverChange && coverKey && coverCfg?.label
              ? ` • ${game?.i18n?.localize?.(coverCfg.label)}`
              : '')
          )
          : undefined;

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
        currentVisibilityDescription,
        state: overrideToDisplayVisibility(override) || 'undetected',
        source: override.source || 'unknown',
        coverOnly,
        controlReleaseOnly,
        suppressCoverChange,
        badgeLabel,
        badgeIcon,
        badgeClass,
        stealthPositionBypassFeat: override.stealthPositionBypassFeat || null,
        stealthPositionBypassLabel,
        stealthPositionBypassIcon: override.stealthPositionBypassIcon || 'fas fa-user-ninja',
        stealthPositionBypassTooltip,
        prevVisibility: {
          key: prevVisibilityKey,
          icon: prevVisCfg.icon,
          color: prevVisCfg.color,
          label: previousVisibilityLabel
        },
        statusVisibility: {
          key: visibilityKey,
          icon: visCfg.icon,
          color: visCfg.color,
          label: currentVisibilityLabel
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
          label: autoCalculatedCover
            ? `Auto Cover: ${localizeCoverLabel(coverCfg, coverKey)}`
            : game?.i18n?.localize?.(coverCfg.label) || 'No Cover',
          autoCalculated: autoCalculatedCover,
          autoIcon: AUTO_COVER_DISPLAY.icon,
          autoLabel: 'Auto cover calculation',
        }
      };
    });

    // Group into observer- and target-oriented lists for separate tables
    const observerOrientedOverrides = [];
    const targetOrientedOverrides = [];
    let unifiedOverrides = [];
    let refTokenId = this.movedTokenId || getLastMovedTokenId();

    // In turn change mode, deduplicate and use unified view
    if (this.isTurnChange) {
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
      if (!refTokenId) {
        try {
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
    let headerToken = refTokenId ? tokenLookup.get(refTokenId) : headerTokenByName;
    const headerStealthPositionBypass = refTokenId
      ? overrides.find((o) => o.targetId === refTokenId && o.stealthPositionBypassLabel)
      : null;
    const targetHeader = {
      name: this.tokenName,
      img: resolveTokenImage(headerToken) || 'icons/svg/book.svg',
      stealthPositionBypassFeat: headerStealthPositionBypass?.stealthPositionBypassFeat || null,
      stealthPositionBypassLabel: headerStealthPositionBypass?.stealthPositionBypassLabel || null,
      stealthPositionBypassIcon: headerStealthPositionBypass?.stealthPositionBypassIcon || null,
      stealthPositionBypassTooltip: headerStealthPositionBypass?.stealthPositionBypassTooltip || null,
    };

    const result = {
      ...context,
      tokenName: this.tokenName,
      overrides,
      observerOrientedOverrides,
      targetOrientedOverrides,
      unifiedOverrides,
      overrideCount: this.isTurnChange ? unifiedOverrides.length : overrides.length,
      hasManualOverrides: overrides.some(o => /manual/i.test(o.source)),
      targetHeader,
      isTurnChange: this.isTurnChange
    };

    return result;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this._boundDialogClick ??= (event) => this._onDialogClick(event);
    this.element.addEventListener('click', this._boundDialogClick);
  }

  async _onDialogClick(event) {
    const target = event.target;
    const within = (node) => node && this.element.contains(node);
    const handle = async (callback) => {
      event.preventDefault();
      event.stopPropagation();
      await callback();
    };

    const clearAllBtn = target?.closest?.('.btn-clear-all');
    if (within(clearAllBtn)) return handle(() => this._onAcceptAll());

    const keepAllBtn = target?.closest?.('.btn-keep-all');
    if (within(keepAllBtn)) return handle(() => this._onRejectAll());

    const clearObserverBtn = target?.closest?.('.btn-clear-observer');
    if (within(clearObserverBtn)) return handle(() => this._onAcceptByGroup('observer'));

    const clearTargetBtn = target?.closest?.('.btn-clear-target');
    if (within(clearTargetBtn)) return handle(() => this._onAcceptByGroup('target'));

    const clearBtn = target?.closest?.('.btn-clear[data-override-id]');
    if (within(clearBtn)) {
      return handle(() => this._onAcceptIndividual(clearBtn.dataset.overrideId));
    }

    const keepBtn = target?.closest?.('.btn-keep[data-override-id]');
    if (within(keepBtn)) {
      return handle(() => this._onRejectIndividual(keepBtn.dataset.overrideId));
    }

    const panTarget = this._getPanTargetFromClick(target);
    if (panTarget) {
      return handle(() => this._panToTokenFromRow(panTarget.tokenId, panTarget.row));
    }
  }

  _getPanTargetFromClick(target) {
    const tokenChip = target?.closest?.('.chip--token');
    if (this.element.contains(tokenChip)) {
      return { tokenId: tokenChip.dataset.tokenId, row: tokenChip.closest('tr.token-row') };
    }

    const imageCell = target?.closest?.('td.target-img, td.observer-img');
    if (this.element.contains(imageCell)) {
      return { tokenId: imageCell.dataset.tokenId, row: imageCell.closest('tr.token-row') };
    }

    const unifiedImage = target?.closest?.('.unified-table .token-info img');
    if (this.element.contains(unifiedImage)) {
      const tokenInfo = unifiedImage.closest('.token-info');
      return { tokenId: tokenInfo?.dataset?.tokenId, row: unifiedImage.closest('tr.token-row') };
    }

    return null;
  }

  async _panToTokenFromRow(tokenId, row) {
    if (!tokenId) return;
    try {
      const token = canvas.tokens?.get(tokenId);
      if (!token) return;
      const center = token.center ?? {
        x: token.x + (token.w ?? token.width ?? 0) / 2,
        y: token.y + (token.h ?? token.height ?? 0) / 2,
      };
      await canvas.animatePan({ x: center.x, y: center.y, duration: 400 });
      try { canvas?.tokens?.selectObjects?.([token], { releaseOthers: true, control: true }); } catch { }
      this._markRowHovered(row);
    } catch (err) {
      console.warn('PF2E Visioner | Failed to pan/select token from override dialog:', err);
    }
  }

  _markRowHovered(row) {
    if (!row) return;
    this.element
      .querySelectorAll('tr.token-row.row-hover')
      .forEach((activeRow) => activeRow.classList.remove('row-hover'));
    row.classList.add('row-hover');
  }

  _getAcceptOptions(override) {
    const isTakeCoverTracking =
      override?.coverOnly === true ||
      override?.coverOverrideSource === 'take_cover_action' ||
      override?.source === 'take_cover_action';
    if (!isTakeCoverTracking) return undefined;
    return override?.coverOnly === true
      ? { acceptedCoverState: override.currentCover || 'none' }
      : { preserveTakeCoverTracking: true };
  }

  async _removeAcceptedOverride(override) {
    const { default: AvsOverrideManager } = await import(
      '../chat/services/infra/AvsOverrideManager.js'
    );
    const options = this._getAcceptOptions(override);
    if (options) {
      await AvsOverrideManager.removeOverride(override.observerId, override.targetId, options);
    } else {
      await AvsOverrideManager.removeOverride(override.observerId, override.targetId);
    }
  }

  async _onAcceptByGroup(group) {
    try {
      const moved = getLastMovedTokenId();
      if (!moved) return this._onAcceptAll();
      const toRemove = this.invalidOverrides.filter(o => group === 'observer' ? o.observerId === moved : o.targetId === moved);
      for (const override of toRemove) {
        try {
          await this._removeAcceptedOverride(override);
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
        await this._removeAcceptedOverride(override);

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
        await this._removeAcceptedOverride(override);
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
