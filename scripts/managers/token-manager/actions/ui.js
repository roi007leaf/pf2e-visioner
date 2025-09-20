/**
 * UI-focused Token Manager actions: mode/tab switching, encounter filter, and icon handlers.
 */

import { MODULE_ID } from '../../../constants.js';
import {
  addTokenImageClickHandlers,
  panToAndSelectToken,
  panToWall,
} from '../../../ui/shared-ui-utils.js';
import { getSceneTargets, showNotification } from '../../../utils.js';

export async function toggleStateSelector(event, button) {
  // Remove selected class from all state selector buttons in the same container
  const container = button.closest('.bulk-state-buttons');
  if (container) {
    const allButtons = container.querySelectorAll('.state-selector-button');
    allButtons.forEach((btn) => btn.classList.remove('selected'));
  }

  // Add selected class to clicked button
  button.classList.add('selected');
}

export async function toggleMode(event, button) {
  const app = this;
  try {
    if (app?.observer?.actor?.type === 'loot') return;
  } catch (_) { }

  const currentPosition = app.position;
  try {
    const visibilityInputs = app.element.querySelectorAll('input[name^="visibility."]');
    const coverInputs = app.element.querySelectorAll('input[name^="cover."]');
    if (!app._savedModeData) app._savedModeData = {};
    if (!app._savedModeData[app.mode])
      app._savedModeData[app.mode] = { visibility: {}, cover: {}, walls: {} };
    if (!app._savedModeData[app.mode].visibility) app._savedModeData[app.mode].visibility = {};
    if (!app._savedModeData[app.mode].cover) app._savedModeData[app.mode].cover = {};
    if (!app._savedModeData[app.mode].walls) app._savedModeData[app.mode].walls = {};
    visibilityInputs.forEach((input) => {
      const tokenId = input.name.replace('visibility.', '');
      app._savedModeData[app.mode].visibility[tokenId] = input.value;
    });
    coverInputs.forEach((input) => {
      const tokenId = input.name.replace('cover.', '');
      app._savedModeData[app.mode].cover[tokenId] = input.value;
    });
  } catch (error) {
    console.error('Token Manager: Error saving form state:', error);
  }

  const newMode = app.mode === 'observer' ? 'target' : 'observer';
  app.mode = newMode;
  await app.render({ force: true });

  try {
    if (app._savedModeData && app._savedModeData[newMode]) {
      const visibilityInputs = app.element.querySelectorAll('input[name^="visibility."]');
      const coverInputs = app.element.querySelectorAll('input[name^="cover."]');
      visibilityInputs.forEach((input) => {
        const tokenId = input.name.replace('visibility.', '');
        if (app._savedModeData[newMode].visibility[tokenId]) {
          input.value = app._savedModeData[newMode].visibility[tokenId];
          const iconContainer = input.closest('.icon-selection');
          if (iconContainer) {
            const icons = iconContainer.querySelectorAll('.state-icon');
            icons.forEach((icon) => icon.classList.remove('selected'));
            const targetIcon = iconContainer.querySelector(`[data-state="${input.value}"]`);
            if (targetIcon) targetIcon.classList.add('selected');
          }
        }
      });
      coverInputs.forEach((input) => {
        const tokenId = input.name.replace('cover.', '');
        if (app._savedModeData[newMode].cover[tokenId]) {
          input.value = app._savedModeData[newMode].cover[tokenId];
          const iconContainer = input.closest('.icon-selection');
          if (iconContainer) {
            const icons = iconContainer.querySelectorAll('.state-icon');
            icons.forEach((icon) => icon.classList.remove('selected'));
            const targetIcon = iconContainer.querySelector(`[data-state="${input.value}"]`);
            if (targetIcon) targetIcon.classList.add('selected');
          }
        }
      });
    }
  } catch (error) {
    console.error('Token Manager: Error restoring saved form state:', error);
  }

  if (currentPosition) {
    app.setPosition({
      left: currentPosition.left,
      top: currentPosition.top,
      width: currentPosition.width,
    });
  }
}

export async function toggleTab(event, button) {
  const app = this;
  const newTab = button.dataset.tab;
  if (newTab && newTab !== app.activeTab) {
    try {
      const visibilityInputs = app.element.querySelectorAll('input[name^="visibility."]');
      const coverInputs = app.element.querySelectorAll('input[name^="cover."]');
      if (!app._savedModeData) app._savedModeData = {};
      if (!app._savedModeData[app.mode])
        app._savedModeData[app.mode] = { visibility: {}, cover: {} };
      visibilityInputs.forEach((input) => {
        const tokenId = input.name.replace('visibility.', '');
        app._savedModeData[app.mode].visibility[tokenId] = input.value;
      });
      coverInputs.forEach((input) => {
        const tokenId = input.name.replace('cover.', '');
        app._savedModeData[app.mode].cover[tokenId] = input.value;
      });
    } catch (error) {
      console.error('Token Manager: Error saving tab state:', error);
    }
    app.activeTab = newTab;
    await app.render({ force: true });
    try {
      if (app._savedModeData && app._savedModeData[app.mode]) {
        const visibilityInputs = app.element.querySelectorAll('input[name^="visibility."]');
        const coverInputs = app.element.querySelectorAll('input[name^="cover."]');
        visibilityInputs.forEach((input) => {
          const tokenId = input.name.replace('visibility.', '');
          const saved = app._savedModeData[app.mode].visibility[tokenId];
          if (saved) {
            input.value = saved;
            const iconContainer = input.closest('.icon-selection');
            if (iconContainer) {
              const icons = iconContainer.querySelectorAll('.state-icon');
              icons.forEach((icon) => icon.classList.remove('selected'));
              const targetIcon = iconContainer.querySelector(`[data-state="${saved}"]`);
              if (targetIcon) targetIcon.classList.add('selected');
            }
          }
        });
        coverInputs.forEach((input) => {
          const tokenId = input.name.replace('cover.', '');
          const saved = app._savedModeData[app.mode].cover[tokenId];
          if (saved) {
            input.value = saved;
            const iconContainer = input.closest('.icon-selection');
            if (iconContainer) {
              const icons = iconContainer.querySelectorAll('.state-icon');
              icons.forEach((icon) => icon.classList.remove('selected'));
              const targetIcon = iconContainer.querySelector(`[data-state="${saved}"]`);
              if (targetIcon) targetIcon.classList.add('selected');
            }
          }
        });
      }
    } catch (error) {
      console.error('Token Manager: Error restoring tab state:', error);
    }
    try {
      const { applySelectionHighlight } = await import('../highlighting.js');
      applySelectionHighlight(this.constructor);
    } catch (_) { }
  }
}

export async function toggleEncounterFilter(event, button) {
  const app = this;
  app.encounterOnly = !app.encounterOnly;
  const newTargets = getSceneTargets(app.observer, app.encounterOnly);
  if (newTargets.length === 0 && app.encounterOnly) {
    ui.notifications.info(`${MODULE_ID}: No encounter tokens found. Filter disabled.`);
    app.encounterOnly = false;
    return;
  }
  await app.render({ force: true });
}

export async function toggleIgnoreAllies(event, button) {
  const app = this;
  app.ignoreAllies = !app.ignoreAllies;
  await app.render({ force: true });
}

export async function toggleIgnoreWalls(event, button) {
  const app = this;
  app.ignoreWalls = !app.ignoreWalls;
  await app.render({ force: true });
}

export async function toggleHideFoundryHidden(event, button) {
  const app = this;
  // Flip local state
  app.hideFoundryHidden = !app.hideFoundryHidden;
  try {
    // Persist per-user preference
    await game.settings.set(MODULE_ID, 'hideFoundryHiddenTokens', !!app.hideFoundryHidden);
  } catch (_) { }
  await app.render({ force: true });
}

export async function bulkSetVisibilityState(event, button) {
  try {
    const state = button.dataset.state;
    const targetType = button.dataset.targetType;
    if (!state) return;

    // Add loading state to the button
    button.classList.add('loading');
    button.disabled = true;
    const originalText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

    const targetEl = button || event?.currentTarget || event?.target || null;
    const form =
      (targetEl && typeof targetEl.closest === 'function' ? targetEl.closest('form') : null) ||
      this?.element?.querySelector?.('form') ||
      this?.element ||
      null;

    if (!form) {
      // Restore button state on error
      button.classList.remove('loading');
      button.disabled = false;
      button.innerHTML = originalText;
      return;
    }

    // Find the section that contains this bulk action button
    const section = button.closest('.table-section');
    if (!section) {
      // Restore button state if no section found
      button.classList.remove('loading');
      button.disabled = false;
      button.innerHTML = originalText;
      return;
    }

    // Use the section to find icon selections
    const iconSelections = section.querySelectorAll('.icon-selection');

    // Pre-cache all elements that need updates
    const updates = [];
    const iconSelectionsArray = Array.from(iconSelections);

    // Process in chunks to avoid blocking the main thread
    const chunkSize = 100;
    for (let i = 0; i < iconSelectionsArray.length; i += chunkSize) {
      const chunk = iconSelectionsArray.slice(i, i + chunkSize);

      chunk.forEach((iconSelection) => {
        const hiddenInput = iconSelection.querySelector('input[type="hidden"]');
        const current = hiddenInput?.value;

        // Skip if already in target state
        if (current === state) return;

        const currentSelected = iconSelection.querySelector('.state-icon.selected');
        const targetIcon = iconSelection.querySelector(`[data-state="${state}"]`);

        if (hiddenInput && targetIcon) {
          updates.push({
            hiddenInput,
            currentSelected,
            targetIcon,
          });
        }
      });

      // Yield control to main thread every chunk
      if (i + chunkSize < iconSelectionsArray.length) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    // Batch all DOM updates in a single animation frame
    if (updates.length > 0) {
      requestAnimationFrame(() => {
        updates.forEach((update) => {
          if (update.currentSelected) {
            update.currentSelected.classList.remove('selected');
          }
          update.targetIcon.classList.add('selected');
          update.hiddenInput.value = state;
        });
      });
    }

    // Restore button state after operation completes
    setTimeout(() => {
      button.classList.remove('loading');
      button.disabled = false;
      button.innerHTML = originalText;
    }, 100);
  } catch (error) {
    console.error('Error in bulk set visibility state:', error);
    showNotification('An error occurred while setting bulk visibility state', 'error');

    // Restore button state on error
    if (button) {
      button.classList.remove('loading');
      button.disabled = false;
      button.innerHTML = button.dataset.originalText || 'Error';
    }
  }
}

export async function bulkSetCoverState(event, button) {
  try {
    const state = button.dataset.state;
    const targetType = button.dataset.targetType;
    if (!state) return;

    // Add loading state to the button
    button.classList.add('loading');
    button.disabled = true;
    const originalText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

    const targetEl = button || event?.currentTarget || event?.target || null;
    const form =
      (targetEl && typeof targetEl.closest === 'function' ? targetEl.closest('form') : null) ||
      this?.element?.querySelector?.('form') ||
      this?.element ||
      null;

    if (!form) {
      // Restore button state on error
      button.classList.remove('loading');
      button.disabled = false;
      button.innerHTML = originalText;
      return;
    }

    // Find the section that contains this bulk action button
    const section = button.closest('.table-section');
    if (!section) {
      // Restore button state if no section found
      button.classList.remove('loading');
      button.disabled = false;
      button.innerHTML = originalText;
      return;
    }

    // Use the section to find icon selections
    const iconSelections = section.querySelectorAll('.icon-selection');

    // Pre-cache all elements that need updates
    const updates = [];
    const iconSelectionsArray = Array.from(iconSelections);

    // Process in chunks to avoid blocking the main thread
    const chunkSize = 100;
    for (let i = 0; i < iconSelectionsArray.length; i += chunkSize) {
      const chunk = iconSelectionsArray.slice(i, i + chunkSize);

      chunk.forEach((iconSelection) => {
        const hiddenInput = iconSelection.querySelector('input[type="hidden"]');
        const current = hiddenInput?.value;

        // Skip if already in target state
        if (current === state) return;

        const currentSelected = iconSelection.querySelector('.state-icon.selected');
        const targetIcon = iconSelection.querySelector(`[data-state="${state}"]`);

        if (hiddenInput && targetIcon) {
          updates.push({
            hiddenInput,
            currentSelected,
            targetIcon,
          });
        }
      });

      // Yield control to main thread every chunk
      if (i + chunkSize < iconSelectionsArray.length) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    // Batch all DOM updates in a single animation frame
    if (updates.length > 0) {
      requestAnimationFrame(() => {
        updates.forEach((update) => {
          if (update.currentSelected) {
            update.currentSelected.classList.remove('selected');
          }
          update.targetIcon.classList.add('selected');
          update.hiddenInput.value = state;
        });
      });
    }

    // Restore button state after operation completes
    setTimeout(() => {
      button.classList.remove('loading');
      button.disabled = false;
      button.innerHTML = originalText;
    }, 100);
  } catch (error) {
    console.error('Error in bulk set cover state:', error);
    showNotification('An error occurred while setting bulk cover state', 'error');

    // Restore button state on error
    if (button) {
      button.classList.remove('loading');
      button.disabled = false;
      button.innerHTML = button.dataset.originalText || 'Error';
    }
  }
}

export function bindDomIconHandlers(TokenManagerClass) {
  TokenManagerClass.prototype.addIconClickHandlers = function addIconClickHandlers() {
    const element = this.element;
    if (!element) return;
    const stateIcons = element.querySelectorAll('.state-icon');
    stateIcons.forEach((icon) => {
      icon.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const targetId = icon.dataset.target;
        const newState = icon.dataset.state;
        if (!targetId || !newState) return;
        const iconSelection = icon.closest('.icon-selection');
        if (!iconSelection) return;
        const allIcons = iconSelection.querySelectorAll('.state-icon');
        allIcons.forEach((i) => i.classList.remove('selected'));
        icon.classList.add('selected');
        const hiddenInput = iconSelection.querySelector('input[type="hidden"]');
        if (hiddenInput) hiddenInput.value = newState;
      });
    });

    // Attach remove override handlers
    const removeButtons = element.querySelectorAll('button.remove-override[data-action="removeAvsOverride"]');
    removeButtons.forEach((btn) => {
      btn.addEventListener('click', async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const rowTokenId = btn.dataset.tokenId;
        if (!rowTokenId) return;
        try {
          const { default: AvsOverrideManager } = await import('../../../chat/services/infra/avs-override-manager.js');
          const app = this; // VisionerTokenManager instance
          if (!app?.observer) return;
          if (app.mode === 'observer') {
            // Remove override observer -> row token
            await AvsOverrideManager.removeOverride(app.observer.document.id, rowTokenId);
          } else {
            // Target mode: override stored on observed (app.observer) from row token id
            await AvsOverrideManager.removeOverride(rowTokenId, app.observer.document.id);
          }

          // Attempt to refresh override indicator badge count immediately
          try {
            const { default: indicator } = await import('../../../ui/override-validation-indicator.js');
            // Recompute remaining overrides affecting observer or row token
            const allTokens = canvas.tokens?.placeables || [];
            const remaining = [];
            for (const t of allTokens) {
              const flags = t.document?.flags?.['pf2e-visioner'] || {};
              for (const [k, v] of Object.entries(flags)) {
                if (!k.startsWith('avs-override-from-')) continue;
                const observerId = k.replace('avs-override-from-', '');
                if (!v || typeof v !== 'object') continue;
                const targetId = t.document.id;
                // Basic shape expected by indicator (subset)
                remaining.push({
                  observerId,
                  targetId,
                  observerName: v.observerName || observerId,
                  targetName: v.targetName || t.document.name,
                  state: v.state,
                  hasCover: v.hasCover,
                  hasConcealment: v.hasConcealment,
                  expectedCover: v.expectedCover,
                  currentVisibility: null,
                  currentCover: null,
                });
              }
            }
            if (remaining.length === 0) {
              indicator.hide(true);
              indicator.update([], '');
            } else {
              // Provide a generic tokenName context
              indicator.update(remaining, 'Overrides');
            }
          } catch (indErr) {
            console.warn('Token Manager: override indicator refresh failed:', indErr);
          }
          // Re-render to update button visibility
          this.render({ force: true });
        } catch (e) {
          console.warn('Token Manager: failed to remove AVS override:', e);
          ui.notifications?.warn?.('PF2E Visioner: Failed to remove AVS override');
        }
      });
    });
  };

  TokenManagerClass.prototype.addTokenImageClickHandlers =
    function addTokenImageClickHandlersMethod() {
      const element = this.element;
      if (!element) return;
      addTokenImageClickHandlers(element, this);
    };

  // Pan methods moved to shared utility (scripts/ui/shared-ui-utils.js)
  TokenManagerClass.prototype.panToWall = panToWall;
  TokenManagerClass.prototype.panToAndSelectToken = panToAndSelectToken;

  // Add override icon click handlers
  TokenManagerClass.prototype.addOverrideIconClickHandlers =
    function addOverrideIconClickHandlersMethod() {
      const element = this.element;
      if (!element) return;
      const app = this;

      // Add bulk state selection handlers (only for overrides tab state selection)
      const bulkStateButtons = element.querySelectorAll(
        '.overrides-section .bulk-state-buttons .bulk-state-header:not([data-action])',
      );
      bulkStateButtons.forEach((button) => {
        button.removeEventListener('click', button._bulkStateHandler);
        button._bulkStateHandler = (event) => selectBulkState.call(app, event, button);
        button.addEventListener('click', button._bulkStateHandler);
      });

      // Add state selector button handlers (for toggleStateSelector data-action)
      const stateSelectorButtons = element.querySelectorAll(
        '.overrides-section .bulk-state-buttons .bulk-state-header[data-action="toggleStateSelector"]',
      );
      stateSelectorButtons.forEach((button) => {
        button.removeEventListener('click', button._stateSelectorHandler);
        button._stateSelectorHandler = (event) => toggleStateSelector.call(app, event, button);
        button.addEventListener('click', button._stateSelectorHandler);
      });
    };

  async function handleOverrideIconClick(event) {
    event.preventDefault();
    event.stopPropagation();

    const icon = event.currentTarget;
    const targetId = icon.dataset.target;
    const action = icon.dataset.action;
    const newState = icon.dataset.state;
    const app = this;

    if (!targetId || !action || !newState || !app?.observer) {
      showNotification(
        'Missing required data for override action. Please try again or contact support.',
        'warning',
      );
      return;
    }
  }
}

/**
 * Handle bulk state selection (like visibility/cover tabs)
 */
export async function selectBulkState(event, button) {
  event.preventDefault();
  event.stopPropagation();

  const container = button.closest('.bulk-state-buttons');
  if (!container) return;

  // Remove selection from all state buttons
  const allButtons = container.querySelectorAll('.bulk-state-header');
  allButtons.forEach((btn) => btn.classList.remove('selected'));

  // Mark this button as selected
  button.classList.add('selected');
}

/**
 * Deselect the bulk state after applying a bulk action
 * This prevents accidental re-application of the same bulk change
 */
function deselectBulkState(app) {
  if (!app?.element) return;

  // Find all bulk state selector buttons and remove their selected class
  const bulkStateButtons = app.element.querySelectorAll(
    '.bulk-state-buttons .bulk-state-header.selected',
  );
  bulkStateButtons.forEach((button) => button.classList.remove('selected'));

  // Also deselect any state selector buttons in the overrides section
  const stateSelectorButtons = app.element.querySelectorAll(
    '.overrides-section .state-selector-button.selected',
  );
  stateSelectorButtons.forEach((button) => button.classList.remove('selected'));
}
