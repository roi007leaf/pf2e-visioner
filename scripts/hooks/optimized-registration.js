/**
 * Optimized FoundryVTT hooks registration - ZERO DELAYS
 * This replaces the original throttled/debounced hooks with immediate processing versions
 */

import { MODULE_ID } from '../constants.js';
import {
  getControlledWallVisualObserverId,
  refreshOptimizedWallVisualsForObserverId,
} from '../services/Walls/wall-visual-refresh.js';
import { scheduleTask } from '../utils/scheduler.js';

function getControlledObserverId() {
  return getControlledWallVisualObserverId(globalThis.canvas?.tokens?.controlled || []);
}

async function refreshOptimizedWallVisuals(observerId = getControlledObserverId()) {
  await refreshOptimizedWallVisualsForObserverId(observerId);
}

/**
 * Register optimized hooks with no artificial delays
 */
export function registerHooks() {
  // Removed controlToken hook - was causing excessive updateWallVisuals calls on token selection.
  // Wall visual updates should only occur when wall flags actually change, which is properly
  // handled by TokenEventHandler._handleWallFlagChanges method.

  // NOTE: Removed problematic 'updateToken' hook that was calling updateWallVisuals on every token update
  // This was causing hundreds of calls during movement animation. Wall visual updates are now
  // properly handled by TokenEventHandler._handleWallFlagChanges only when wall flags actually change.

  // Token lifecycle is owned by hooks/token-events.js. Avoid wall-visual refreshes on
  // token create/delete; wall indicators are driven by wall flag changes and explicit UI refreshes.

  // Optimized renderTokenConfig hook - IMMEDIATE
  Hooks.on('renderTokenConfig', async (config) => {
    try {
      await refreshOptimizedWallVisuals(config.token?.id || getControlledObserverId());
    } catch { }
  });

  // Wall document lifecycle is owned by hooks/registration.js so hidden-wall flag sync,
  // door-state refresh, deleted-wall cleanup, and visual refresh stay ordered together.

  // Optimized renderWallConfig hook - IMMEDIATE
  Hooks.on('renderWallConfig', async () => {
    try {
      await refreshOptimizedWallVisuals();
    } catch { }
  });

  // Optimized lighting update hooks - IMMEDIATE
  Hooks.on('updateAmbientLight', async () => {
    try {
      await refreshOptimizedWallVisuals();
    } catch { }
  });

  Hooks.on('createAmbientLight', async () => {
    try {
      await refreshOptimizedWallVisuals();
    } catch { }
  });

  Hooks.on('deleteAmbientLight', async () => {
    try {
      await refreshOptimizedWallVisuals();
    } catch { }
  });

  // Optimized scene hooks - IMMEDIATE
  Hooks.on('canvasReady', async () => {
    try {
      // Small delay only for canvas readiness, not for throttling
      // Use setTimeout instead of requestAnimationFrame to work when window is unfocused
      scheduleTask(async () => {
        try {
          await refreshOptimizedWallVisuals();
        } catch { }
      });
    } catch { }
  });

  // UI hooks for token tool updates - IMMEDIATE
  const refreshTokenTool = () => {
    try {
      // Use setTimeout instead of requestAnimationFrame for UI updates that should work when unfocused
      scheduleTask(() => {
        try {
          const tokenTools = ui.controls.controls?.tokens?.tools;
          if (!tokenTools) return;

          const selected = canvas?.tokens?.controlled ?? [];
          const isGM = !!game.user?.isGM;

          for (const tool of tokenTools) {
            if (tool.name === 'pf2e-visioner-token-tool') {
              tool.visible = isGM && selected.length > 0;
            }
          }

          ui.controls.render();
        } catch { }
      });
    } catch { }
  };

  Hooks.on('getSceneControlButtons', refreshTokenTool);
  Hooks.on('renderSceneControls', refreshTokenTool);
  // Removed controlToken hook to refreshTokenTool - was contributing to excessive hook calls on token selection.

  // Settings-related hooks - IMMEDIATE
  Hooks.on('renderSettingsConfig', async (_app, html) => {
    try {
      // No setTimeout delays - immediate DOM manipulation
      const moduleTab = html.find('[data-tab="modules"]');
      if (!moduleTab.length) return;

      const sectionHeader = moduleTab.find(`h2:contains("${MODULE_ID}")`);
      if (!sectionHeader.length) return;

      const moduleSection = sectionHeader.nextUntil('h2').addBack();
      const settingsContainer = moduleSection.find('.form-group');

      // Immediate settings injection without delays
      for (const container of settingsContainer) {
        const label = container.querySelector('label');
        if (!label?.textContent?.includes('pf2e-visioner')) continue;

        // Add immediate help text and styling
        const setting = label.textContent.replace(/^.*\./, '');
        if (setting === 'enabled') {
          container.style.border = '2px solid #4CAF50';
          container.style.padding = '10px';
          container.style.marginBottom = '15px';
          container.style.borderRadius = '5px';
          container.style.backgroundColor = '#f0f8f0';
        }
      }
    } catch (_) { }
  });


}
