/**
 * Optimized FoundryVTT hooks registration - ZERO DELAYS
 * This replaces the original throttled/debounced hooks with immediate processing versions
 */

import { MODULE_ID } from '../constants.js';
import { getLogger } from '../utils/logger.js';

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

  // Optimized createToken hook - IMMEDIATE
  Hooks.on('createToken', async () => {
    try {
      const { updateWallVisuals } = await import('../services/optimized-visual-effects.js');
      const id = canvas.tokens.controlled?.[0]?.id || null;
      await updateWallVisuals(id);
    } catch { }
  });

  // Optimized deleteToken hook - IMMEDIATE
  Hooks.on('deleteToken', async () => {
    try {
      const { updateWallVisuals } = await import('../services/optimized-visual-effects.js');
      const id = canvas.tokens.controlled?.[0]?.id || null;
      await updateWallVisuals(id);
    } catch { }
  });

  // Optimized renderTokenConfig hook - IMMEDIATE
  Hooks.on('renderTokenConfig', async (config) => {
    const log = getLogger('AVS/Hooks');
    log.debug(() => ({
      msg: 'renderTokenConfig fired',
      tokenName: config.token?.name,
      tokenId: config.token?.id,
      stack: new Error().stack,
    }));
    try {
      const { updateWallVisuals } = await import('../services/optimized-visual-effects.js');
      const id = config.token?.id || canvas.tokens.controlled?.[0]?.id || null;
      await updateWallVisuals(id);
    } catch { }
  });

  // Optimized updateWall hook - IMMEDIATE
  Hooks.on('updateWall', async () => {
    try {
      const { updateWallVisuals } = await import('../services/optimized-visual-effects.js');
      const id = canvas.tokens.controlled?.[0]?.id || null;
      await updateWallVisuals(id);
    } catch { }
  });

  // Optimized createWall hook - IMMEDIATE
  Hooks.on('createWall', async () => {
    try {
      const { updateWallVisuals } = await import('../services/optimized-visual-effects.js');
      const id = canvas.tokens.controlled?.[0]?.id || null;
      await updateWallVisuals(id);
    } catch { }
  });

  // Optimized deleteWall hook - IMMEDIATE + cleanup
  Hooks.on('deleteWall', async (wallDocument) => {
    try {
      // Immediate cleanup of deleted wall visuals
      const { cleanupDeletedWallVisuals } = await import('../services/optimized-visual-effects.js');
      await cleanupDeletedWallVisuals(wallDocument);

      // Immediate wall visuals update
      const { updateWallVisuals } = await import('../services/optimized-visual-effects.js');
      const id = canvas.tokens.controlled?.[0]?.id || null;
      await updateWallVisuals(id);
    } catch { }
  });

  // Optimized renderWallConfig hook - IMMEDIATE
  Hooks.on('renderWallConfig', async () => {
    try {
      const { updateWallVisuals } = await import('../services/optimized-visual-effects.js');
      const id = canvas.tokens.controlled?.[0]?.id || null;
      await updateWallVisuals(id);
    } catch { }
  });

  // Optimized lighting update hooks - IMMEDIATE
  Hooks.on('updateAmbientLight', async () => {
    try {
      const { updateWallVisuals } = await import('../services/optimized-visual-effects.js');
      const id = canvas.tokens.controlled?.[0]?.id || null;
      await updateWallVisuals(id);
    } catch { }
  });

  Hooks.on('createAmbientLight', async () => {
    try {
      const { updateWallVisuals } = await import('../services/optimized-visual-effects.js');
      const id = canvas.tokens.controlled?.[0]?.id || null;
      await updateWallVisuals(id);
    } catch { }
  });

  Hooks.on('deleteAmbientLight', async () => {
    try {
      const { updateWallVisuals } = await import('../services/optimized-visual-effects.js');
      const id = canvas.tokens.controlled?.[0]?.id || null;
      await updateWallVisuals(id);
    } catch { }
  });

  // Optimized scene hooks - IMMEDIATE
  Hooks.on('canvasReady', async () => {
    try {
      // Small delay only for canvas readiness, not for throttling
      // Use setTimeout(0) because requestAnimationFrame doesn't fire reliably
      // when the browser tab/window is not focused
      setTimeout(async () => {
        try {
          const { updateWallVisuals } = await import('../services/optimized-visual-effects.js');
          const id = canvas.tokens.controlled?.[0]?.id || null;
          await updateWallVisuals(id);
        } catch { }
      }, 0);
    } catch { }
  });

  // UI hooks for token tool updates - IMMEDIATE
  const refreshTokenTool = () => {
    try {
      // Use setTimeout(0) because requestAnimationFrame doesn't fire reliably
      // when the browser tab/window is not focused
      setTimeout(() => {
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
      }, 0);
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
