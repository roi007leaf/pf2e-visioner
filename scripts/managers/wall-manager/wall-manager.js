/**
 * Visioner Wall Manager - ApplicationV2 dialog to manage per-wall settings in bulk
 */

import { MODULE_ID } from '../../constants.js';
import { getWallImage } from '../../utils.js';

export class VisionerWallManager extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: 'pf2e-visioner-wall-manager',
    tag: 'div',
    classes: ['pf2e-visioner'],
    window: {
      title: 'PF2E Visioner: Wall Settings',
      icon: 'fas fa-grip-lines-vertical',
      resizable: true,
    },
    position: { width: 700, height: 600 },
    actions: {
      apply: VisionerWallManager._onApply,
      close: VisionerWallManager._onClose,
      bulkHiddenOn: VisionerWallManager._onBulkHiddenOn,
      bulkHiddenOff: VisionerWallManager._onBulkHiddenOff,
      bulkCoverAuto: VisionerWallManager._onBulkCoverAuto,
      bulkCoverNone: VisionerWallManager._onBulkCoverNone,
      bulkCoverStandard: VisionerWallManager._onBulkCoverStandard,
      bulkCoverGreater: VisionerWallManager._onBulkCoverGreater,
      setCoverOverride: VisionerWallManager._onSetCoverOverride,
      selectWall: VisionerWallManager._onSelectWall,
    },
  };

  static PARTS = {
    content: { template: 'modules/pf2e-visioner/templates/wall-manager.hbs' },
  };

  constructor(options = {}) {
    super(options);
  }

  async _prepareContext() {
    const scene = canvas?.scene;
    const walls = (canvas?.walls?.placeables || []).map((w) => w.document);
    const rows = walls.map((d) => {
      const doorType = Number(d?.door) || 0; // 0 wall, 1 door, 2 secret door
      const provideCover = d.getFlag?.(MODULE_ID, 'provideCover');
      const hiddenWall = d.getFlag?.(MODULE_ID, 'hiddenWall');
      const identifier = d.getFlag?.(MODULE_ID, 'wallIdentifier');
      const dc = d.getFlag?.(MODULE_ID, 'stealthDC');
      const coverOverride = d.getFlag?.(MODULE_ID, 'coverOverride'); // 'none', 'lesser', 'standard', 'greater', or null/undefined for auto
      return {
        id: d.id,
        doorType,
        provideCover: provideCover !== false,
        hiddenWall: !!hiddenWall,
        identifier: identifier || '',
        dc: Number(dc) || '',
        coverOverride: coverOverride || null,
        img: getWallImage(doorType),
      };
    });
    return { rows };
  }

  async _renderHTML(context, _options) {
    return await foundry.applications.handlebars.renderTemplate(
      this.constructor.PARTS.content.template,
      context,
    );
  }

  _replaceHTML(result, content, _options) {
    content.innerHTML = result;
    try {
      this._bindSelectionSync(content);
      this._bindCoverToggle(content);
      this._bindSearchAndFilter(content);
    } catch (_) { }
    return content;
  }

  static async _onApply(event, _button) {
    const app = this; // ApplicationV2 instance
    try {
      const form = app.element?.querySelector?.('form.pf2e-visioner-wall-manager');
      if (!form) return app.close();

      // Close dialog early to show progress
      try {
        await app.close();
      } catch (error) {
        console.warn('Wall Manager: Error closing dialog:', error);
      }

      const updates = [];
      const byId = new Map();
      // Read inputs directly so unchecked checkboxes are captured as false
      const inputs = form.querySelectorAll(
        'input[name^="wall."], select[name^="wall."], button[data-wall-id][data-cover-override]',
      );
      inputs.forEach((input) => {
        const name = input.getAttribute('name') || '';
        const m = name.match(/^wall\.(?<id>[^.]+)\.(?<field>hiddenWall|identifier|dc|doorType)$/);
        if (m) {
          const { id, field } = m.groups;
          if (!byId.has(id)) byId.set(id, {});
          let value;
          if (field === 'hiddenWall') {
            value = !!input.checked;
          } else if (field === 'identifier') {
            value = String(input.value || '');
          } else if (field === 'dc') {
            const n = Number(input.value);
            value = Number.isFinite(n) && n > 0 ? n : null;
          } else if (field === 'doorType') {
            value = Number(input.value);
          }
          byId.get(id)[field] = value;
        }

        // Handle cover override buttons
        if (input.hasAttribute('data-wall-id') && input.hasAttribute('data-cover-override')) {
          const wallId = input.getAttribute('data-wall-id');
          const coverValue = input.getAttribute('data-cover-override');
          const isActive = input.classList.contains('active');

          if (isActive) {
            if (!byId.has(wallId)) byId.set(wallId, {});
            const wallData = byId.get(wallId);
            // Set override: null for auto, coverValue for specific override
            wallData.coverOverride = coverValue === 'auto' ? null : coverValue;
            // Set provideCover based on cover override (false only if explicitly set to 'none')
            wallData.provideCover = coverValue !== 'none';
          }
        }
      });

      // Prepare update patches - only include walls that actually have changes
      const walls = (canvas?.walls?.placeables || []).map((w) => w.document);
      const wallsById = new Map(walls.map((w) => [w.id, w]));

      for (const [id, data] of byId.entries()) {
        const wallDoc = wallsById.get(id);
        if (!wallDoc) continue; // Skip if wall doesn't exist

        const patch = { _id: id };
        let hasChanges = false;

        // Check provideCover changes
        if (data.provideCover !== undefined) {
          const currentProvideCover = wallDoc.getFlag?.(MODULE_ID, 'provideCover') !== false;
          const newProvideCover = !!data.provideCover;
          if (currentProvideCover !== newProvideCover) {
            patch[`flags.${MODULE_ID}.provideCover`] = newProvideCover;
            hasChanges = true;
          }
        }

        // Check hiddenWall changes
        if (data.hiddenWall !== undefined) {
          const currentHiddenWall = !!wallDoc.getFlag?.(MODULE_ID, 'hiddenWall');
          const newHiddenWall = !!data.hiddenWall;
          if (currentHiddenWall !== newHiddenWall) {
            patch[`flags.${MODULE_ID}.hiddenWall`] = newHiddenWall;
            hasChanges = true;
          }
        }

        // Check identifier changes
        if (data.identifier !== undefined) {
          const currentIdentifier = wallDoc.getFlag?.(MODULE_ID, 'wallIdentifier') || '';
          const newIdentifier = String(data.identifier || '');
          if (currentIdentifier !== newIdentifier) {
            patch[`flags.${MODULE_ID}.wallIdentifier`] = newIdentifier;
            hasChanges = true;
          }
        }

        // Check stealth DC changes
        if (data.dc !== undefined) {
          const currentDC = wallDoc.getFlag?.(MODULE_ID, 'stealthDC');
          const newDC = data.dc;
          if (currentDC !== newDC) {
            patch[`flags.${MODULE_ID}.stealthDC`] = newDC;
            hasChanges = true;
          }
        }

        // Check cover override changes
        if (data.coverOverride !== undefined) {
          const currentCoverOverride = wallDoc.getFlag?.(MODULE_ID, 'coverOverride');
          const newCoverOverride = data.coverOverride;
          if (currentCoverOverride !== newCoverOverride) {
            patch[`flags.${MODULE_ID}.coverOverride`] = newCoverOverride;
            hasChanges = true;
          }
        }

        // Check door type changes
        if (data.doorType !== undefined) {
          const currentDoorType = Number(wallDoc.door) || 0;
          const newDoorType = Number(data.doorType);
          if (currentDoorType !== newDoorType) {
            patch.door = newDoorType;
            hasChanges = true;
          }
        }

        // Only add to updates if there are actual changes
        if (hasChanges) {
          updates.push(patch);
        }
      }

      // Apply updates with progress (only if there are changes)
      if (updates.length > 0) {
        // Import progress system after we know we have work to do
        const { VisionerProgress } = await import('../progress.js');

        // Use larger batches for better performance
        const batchSize = Math.max(50, Math.min(100, Math.ceil(updates.length / 10))); // Adaptive batch size
        const wallBatches = [];
        for (let i = 0; i < updates.length; i += batchSize) {
          wallBatches.push(updates.slice(i, i + batchSize));
        }

        // Create progress bar with batch count instead of individual walls
        const progressBar = new VisionerProgress(
          `Applying Changes to ${updates.length} Walls`,
          wallBatches.length + 1,
        );

        try {
          progressBar.render(true);

          // Process each batch with minimal progress updates
          for (let batchIndex = 0; batchIndex < wallBatches.length; batchIndex++) {
            const batch = wallBatches[batchIndex];
            const start = batchIndex * batchSize + 1;
            const end = Math.min((batchIndex + 1) * batchSize, updates.length);

            // Update progress only at batch boundaries
            progressBar.setProgress(batchIndex, wallBatches.length + 1);

            // Process the entire batch at once
            await canvas.scene?.updateEmbeddedDocuments?.('Wall', batch, { diff: false });
          }

          // Visual effects update - skip for large updates to improve performance
          progressBar.setProgress(wallBatches.length, wallBatches.length + 1);

          if (updates.length <= 50) {
            // Only update visuals for smaller batches to maintain performance
            try {
              const { updateWallVisuals } = await import('../../services/visual-effects.js');
              await updateWallVisuals();
            } catch (visualError) {
              console.warn(
                `[${MODULE_ID}] Visual effects update failed (non-critical):`,
                visualError,
              );
            }
          } else {
            ui.notifications?.info?.(
              `Applied changes to ${updates.length} walls. Refresh the scene if visual effects need updating.`,
            );
          }

          progressBar.close();

          if (updates.length <= 50) {
            ui.notifications?.info?.(`Applied changes to ${updates.length} walls successfully!`);
          }
          // Note: notification for large batches is already shown above
        } catch (error) {
          progressBar.close();
          ui.notifications?.error?.(`Failed to apply wall changes: ${error.message}`);
          throw error;
        }
      } else {
        // No changes to apply
        ui.notifications?.info?.('No wall changes to apply');
      }
    } catch (e) {
      console.error(`[${MODULE_ID}] Wall Manager apply failed`, e);
      try {
        await app.close();
      } catch (_) { }
    }
  }

  static async _onClose(_event, _button) {
    try {
      await this.close();
    } catch (_) { }
  }

  static async _onSelectWall(event, button) {
    try {
      const wallId = button?.dataset?.wallId;
      if (!wallId) return;

      // Find the wall on canvas
      const wall =
        canvas?.walls?.get?.(wallId) ||
        (canvas?.walls?.placeables || []).find(
          (w) => w?.id === wallId || w?.document?.id === wallId,
        );

      if (!wall) {
        ui.notifications?.warn?.(`Wall with ID ${wallId} not found on canvas`);
        return;
      }

      try {
        // Release all currently selected walls
        wall.layer?.releaseAll?.();
      } catch (_) { }

      try {
        // Select the target wall
        wall.control?.({ releaseOthers: true });
      } catch (_) {
        try {
          wall.control?.();
        } catch (_) { }
      }

      try {
        // Calculate wall center and pan to it
        const d = wall.document;
        const coords = Array.isArray(d?.c) ? d.c : [d?.x, d?.y, d?.x2, d?.y2];
        const [x1, y1, x2, y2] = coords.map((n) => Number(n) || 0);
        const centerX = (x1 + x2) / 2;
        const centerY = (y1 + y2) / 2;

        // Animate pan to wall center
        canvas?.animatePan?.({ x: centerX, y: centerY, duration: 350 });

        // Visual feedback
        button.style.color = 'var(--color-text-hyperlink)';
        setTimeout(() => {
          button.style.color = '';
        }, 1000);
      } catch (_) { }
    } catch (e) {
      console.warn(`[${MODULE_ID}] Select wall failed`, e);
    }
  }

  static _setAll(form, selector, checked) {
    const els = form.querySelectorAll(selector);
    els.forEach((el) => {
      el.checked = !!checked;
    });
  }

  static _setAllCoverOverride(form, coverType) {
    // Remove active class from all cover override buttons
    const allButtons = form.querySelectorAll('button[data-cover-override]');
    allButtons.forEach((btn) => btn.classList.remove('active'));

    // Add active class to buttons matching the cover type
    const targetButtons = form.querySelectorAll(`button[data-cover-override="${coverType}"]`);
    targetButtons.forEach((btn) => btn.classList.add('active'));
  }

  static async _onBulkHiddenOn(event, _button) {
    const form = this.element?.querySelector?.('form.pf2e-visioner-wall-manager');
    if (form) this.constructor._setAll(form, 'input[name$=".hiddenWall"]', true);
  }
  static async _onBulkHiddenOff(event, _button) {
    const form = this.element?.querySelector?.('form.pf2e-visioner-wall-manager');
    if (form) this.constructor._setAll(form, 'input[name$=".hiddenWall"]', false);
  }

  static async _onBulkCoverAuto(event, _button) {
    const form = this.element?.querySelector?.('form.pf2e-visioner-wall-manager');
    if (form) this.constructor._setAllCoverOverride(form, 'auto');
  }
  static async _onBulkCoverNone(event, _button) {
    const form = this.element?.querySelector?.('form.pf2e-visioner-wall-manager');
    if (form) this.constructor._setAllCoverOverride(form, 'none');
  }
  static async _onBulkCoverStandard(event, _button) {
    const form = this.element?.querySelector?.('form.pf2e-visioner-wall-manager');
    if (form) this.constructor._setAllCoverOverride(form, 'standard');
  }
  static async _onBulkCoverGreater(event, _button) {
    const form = this.element?.querySelector?.('form.pf2e-visioner-wall-manager');
    if (form) this.constructor._setAllCoverOverride(form, 'greater');
  }

  static async _onSetCoverOverride(event, button) {
    try {
      const wallId = button?.dataset?.wallId;
      const coverType = button?.dataset?.coverOverride;
      if (!wallId || !coverType) return;

      // Remove active class from all cover override buttons for this wall
      const form = this.element?.querySelector?.('form.pf2e-visioner-wall-manager');
      if (form) {
        const wallButtons = form.querySelectorAll(
          `button[data-wall-id="${wallId}"][data-cover-override]`,
        );
        wallButtons.forEach((btn) => btn.classList.remove('active'));
      }

      // Always make the clicked button active (no toggle behavior - one must always be selected)
      button.classList.add('active');
    } catch (e) {
      console.warn(`[${MODULE_ID}] Set cover override failed`, e);
    }
  }

  _bindSelectionSync(root) {
    try {
      // Clear any old binding
      this._unbindSelectionSync?.();
      const table = root?.querySelector?.('table.visibility-table tbody');
      if (!table) return;
      const highlight = () => {
        try {
          const selected = new Set(
            (canvas?.walls?.controlled || []).map((w) => w?.id || w?.document?.id),
          );
          table.querySelectorAll('tr[data-wall-id]').forEach((tr) => {
            const id = tr.getAttribute('data-wall-id');
            const on = selected.has(id);
            tr.classList.toggle('row-hover', on);
            tr.style.outline = on ? '2px solid var(--color-text-hyperlink, #ff9800)' : '';
            tr.style.background = on ? 'rgba(255, 152, 0, 0.12)' : '';
          });
        } catch (_) { }
      };
      const onControl = () => highlight();
      const onDelete = async (wallDocument) => {
        try {
          // Clean up visual effects for deleted wall first
          const { cleanupDeletedWallVisuals } = await import('../../services/visual-effects.js');
          await cleanupDeletedWallVisuals(wallDocument);
        } catch (_) { }
        highlight();
      };
      Hooks.on('controlWall', onControl);
      Hooks.on('deleteWall', onDelete);
      Hooks.on('createWall', onControl);
      Hooks.on('updateWall', onControl);
      highlight();
      this._unbindSelectionSync = () => {
        try {
          Hooks.off('controlWall', onControl);
        } catch (_) { }
        try {
          Hooks.off('deleteWall', onDelete);
        } catch (_) { }
        try {
          Hooks.off('createWall', onControl);
        } catch (_) { }
        try {
          Hooks.off('updateWall', onControl);
        } catch (_) { }
        this._unbindSelectionSync = null;
      };
      this.once?.('close', () => {
        try {
          this._unbindSelectionSync?.();
        } catch (_) { }
      });
    } catch (_) { }
  }

  _bindCoverToggle(root) {
    // No longer needed - cover override buttons are always visible
    // This method is kept for compatibility but does nothing
  }

  _bindSearchAndFilter(root) {
    try {
      const searchInput = root?.querySelector?.('#wall-search');
      const typeFilter = root?.querySelector?.('#wall-type-filter');
      const hiddenFilter = root?.querySelector?.('#hidden-filter');
      const coverFilter = root?.querySelector?.('#cover-filter');
      const clearButton = root?.querySelector?.('#clear-filters');
      const table = root?.querySelector?.('table.visibility-table tbody');
      const totalCountSpan = root?.querySelector?.('#wall-count-total');
      const visibleCountSpan = root?.querySelector?.('#wall-count-visible');

      if (!table || !searchInput) return;

      const allRows = Array.from(table.querySelectorAll('tr[data-wall-id]'));
      const totalCount = allRows.length;

      // Set initial total count
      if (totalCountSpan) totalCountSpan.textContent = totalCount;

      const applyFilters = () => {
        try {
          const searchTerm = (searchInput.value || '').toLowerCase().trim();
          const typeValue = typeFilter?.value || '';
          const hiddenValue = hiddenFilter?.value || '';
          const coverValue = coverFilter?.value || '';

          let visibleCount = 0;

          allRows.forEach((row) => {
            const wallId = row.getAttribute('data-wall-id') || '';
            const identifierInput = row.querySelector('input[name$=".identifier"]');
            const identifier = (identifierInput?.value || '').toLowerCase();
            const hiddenCheckbox = row.querySelector('input[name$=".hiddenWall"]');
            const isHidden = hiddenCheckbox?.checked || false;

            // Get wall type from the hidden input
            const typeInput = row.querySelector('input[name$=".doorType"]');
            const wallType = typeInput?.value || '0';

            // Get cover override from active button
            const activeCoverButton = row.querySelector(
              '.cover-override-buttons .active[data-cover-override]',
            );
            const coverOverride = activeCoverButton?.getAttribute('data-cover-override') || 'auto';

            // Apply filters
            let matches = true;

            // Search filter (identifier or wall ID)
            if (searchTerm) {
              const matchesIdentifier = identifier.includes(searchTerm);
              const matchesWallId = wallId.toLowerCase().includes(searchTerm);
              matches = matches && (matchesIdentifier || matchesWallId);
            }

            // Type filter
            if (typeValue !== '') {
              matches = matches && wallType === typeValue;
            }

            // Hidden filter
            if (hiddenValue !== '') {
              const expectedHidden = hiddenValue === 'true';
              matches = matches && isHidden === expectedHidden;
            }

            // Cover filter
            if (coverValue !== '') {
              matches = matches && coverOverride === coverValue;
            }

            // Show/hide row
            row.style.display = matches ? '' : 'none';
            if (matches) visibleCount++;
          });

          // Update visible count
          if (visibleCountSpan) visibleCountSpan.textContent = visibleCount;
        } catch (e) {
          console.warn(`[${MODULE_ID}] Filter application failed`, e);
        }
      };

      // Debounced search for performance
      let searchTimeout;
      const debouncedSearch = () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(applyFilters, 150);
      };

      // Bind events
      searchInput.addEventListener('input', debouncedSearch);
      typeFilter?.addEventListener('change', applyFilters);
      hiddenFilter?.addEventListener('change', applyFilters);
      coverFilter?.addEventListener('change', applyFilters);

      // Clear filters
      clearButton?.addEventListener('click', () => {
        searchInput.value = '';
        if (typeFilter) typeFilter.value = '';
        if (hiddenFilter) hiddenFilter.value = '';
        if (coverFilter) coverFilter.value = '';
        applyFilters();
      });

      // Also apply filters when cover override buttons are clicked
      const coverButtons = table.querySelectorAll(
        '.cover-override-buttons button[data-cover-override]',
      );
      coverButtons.forEach((button) => {
        button.addEventListener('click', () => {
          // Small delay to let the active class update first
          setTimeout(applyFilters, 50);
        });
      });

      // Apply filters when wall type buttons are clicked
      const typeButtons = table.querySelectorAll('.wall-type-button');
      typeButtons.forEach((button) => {
        button.addEventListener('click', (event) => {
          event.preventDefault();
          this._cycleWallType(button, event.button === 2); // true for right-click
          applyFilters();
        });

        // Prevent context menu on right-click
        button.addEventListener('contextmenu', (event) => {
          event.preventDefault();
          this._cycleWallType(button, true); // right-click cycles backwards
          applyFilters();
        });
      });

      // Initial filter application
      applyFilters();
    } catch (e) {
      console.warn(`[${MODULE_ID}] Search and filter binding failed`, e);
    }
  }

  _updateWallTypeImage(select) {
    try {
      const doorType = Number(select.value);
      const container = select.closest('.wall-type-container');
      const img = container?.querySelector('img');

      if (!img) return;

      // Import the getWallImage utility
      import('../../utils.js')
        .then(({ getWallImage }) => {
          const newSrc = getWallImage(doorType);
          img.src = newSrc;

          // Update tooltip
          let tooltipText = 'Wall';
          if (doorType === 1) tooltipText = 'Door';
          else if (doorType === 2) tooltipText = 'Secret Door';
          img.setAttribute('data-tooltip', tooltipText);
        })
        .catch((e) => {
          console.warn(`[${MODULE_ID}] Failed to update wall image`, e);
        });
    } catch (e) {
      console.warn(`[${MODULE_ID}] Wall type image update failed`, e);
    }
  }

  _cycleWallType(button, backwards = false) {
    try {
      const currentType = Number(button.getAttribute('data-current-type') || 0);
      const img = button.querySelector('img');
      const hiddenInput = button.parentElement.querySelector('input[name$=".doorType"]');

      if (!img || !hiddenInput) return;

      // Cycle through types: 0 -> 1 -> 2 -> 0 (forward) or 0 -> 2 -> 1 -> 0 (backward)
      let newType;
      if (backwards) {
        newType = currentType === 0 ? 2 : currentType - 1;
      } else {
        newType = (currentType + 1) % 3;
      }

      // Update button data attribute
      button.setAttribute('data-current-type', newType.toString());

      // Update hidden input value
      hiddenInput.value = newType.toString();

      // Update image
      const newSrc = getWallImage(newType);
      img.src = newSrc;

      // Update alt text
      let altText = 'Wall';
      if (newType === 1) altText = 'Door';
      else if (newType === 2) altText = 'Secret Door';
      img.setAttribute('alt', altText);
    } catch (e) {
      console.warn(`[${MODULE_ID}] Wall type cycling failed`, e);
    }
  }
}
