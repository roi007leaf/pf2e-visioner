/**
 * Optimized FoundryVTT hooks registration - ZERO DELAYS
 * This replaces the original throttled/debounced hooks with immediate processing versions
 */

import { MODULE_ID } from '../constants.js';

/**
 * Register optimized hooks with no artificial delays
 */
export function registerHooks() {
  

  // Optimized controlToken hook - NO DEBOUNCING
  Hooks.on('controlToken', async () => {
    try {
      // Immediate visual update - no timeout/debounce
      const { updateWallVisuals } = await import('../services/optimized-visual-effects.js');
      const id = canvas.tokens.controlled?.[0]?.id || null;
      await updateWallVisuals(id);
  } catch {}
  });

  // Optimized updateToken hook - NO THROTTLING
  Hooks.on('updateToken', async () => {
    try {
      const { updateWallVisuals } = await import('../services/optimized-visual-effects.js');
      const id = canvas.tokens.controlled?.[0]?.id || null;
      await updateWallVisuals(id);
  } catch {}
  });

  // Optimized createToken hook - IMMEDIATE
  Hooks.on('createToken', async () => {
    try {
      const { updateWallVisuals } = await import('../services/optimized-visual-effects.js');
      const id = canvas.tokens.controlled?.[0]?.id || null;
      await updateWallVisuals(id);
  } catch {}
  });

  // Optimized deleteToken hook - IMMEDIATE
  Hooks.on('deleteToken', async () => {
    try {
      const { updateWallVisuals } = await import('../services/optimized-visual-effects.js');
      const id = canvas.tokens.controlled?.[0]?.id || null;
      await updateWallVisuals(id);
  } catch {}
  });

  // Optimized renderTokenConfig hook - IMMEDIATE
  Hooks.on('renderTokenConfig', async (config) => {
    try {
      const { updateWallVisuals } = await import('../services/optimized-visual-effects.js');
      const id = config.token?.id || canvas.tokens.controlled?.[0]?.id || null;
      await updateWallVisuals(id);
  } catch {}
  });

  // Optimized updateWall hook - IMMEDIATE
  Hooks.on('updateWall', async () => {
    try {
      const { updateWallVisuals } = await import('../services/optimized-visual-effects.js');
      const id = canvas.tokens.controlled?.[0]?.id || null;
      await updateWallVisuals(id);
  } catch {}
  });

  // Optimized createWall hook - IMMEDIATE
  Hooks.on('createWall', async () => {
    try {
      const { updateWallVisuals } = await import('../services/optimized-visual-effects.js');
      const id = canvas.tokens.controlled?.[0]?.id || null;
      await updateWallVisuals(id);
  } catch {}
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
  } catch {}
  });

  // Optimized renderWallConfig hook - IMMEDIATE
  Hooks.on('renderWallConfig', async () => {
    try {
      const { updateWallVisuals } = await import('../services/optimized-visual-effects.js');
      const id = canvas.tokens.controlled?.[0]?.id || null;
      await updateWallVisuals(id);
  } catch {}
  });

  // Optimized lighting update hooks - IMMEDIATE
  Hooks.on('updateAmbientLight', async () => {
    try {
      const { updateWallVisuals } = await import('../services/optimized-visual-effects.js');
      const id = canvas.tokens.controlled?.[0]?.id || null;
      await updateWallVisuals(id);
  } catch {}
  });

  Hooks.on('createAmbientLight', async () => {
    try {
      const { updateWallVisuals } = await import('../services/optimized-visual-effects.js');
      const id = canvas.tokens.controlled?.[0]?.id || null;
      await updateWallVisuals(id);
  } catch {}
  });

  Hooks.on('deleteAmbientLight', async () => {
    try {
      const { updateWallVisuals } = await import('../services/optimized-visual-effects.js');
      const id = canvas.tokens.controlled?.[0]?.id || null;
      await updateWallVisuals(id);
  } catch {}
  });

  // Optimized scene hooks - IMMEDIATE
  Hooks.on('canvasReady', async () => {
    try {
      // Small delay only for canvas readiness, not for throttling
      requestAnimationFrame(async () => {
        try {
          const { updateWallVisuals } = await import('../services/optimized-visual-effects.js');
          const id = canvas.tokens.controlled?.[0]?.id || null;
          await updateWallVisuals(id);
  } catch {}
      });
  } catch {}
  });

  // UI hooks for token tool updates - IMMEDIATE
  const refreshTokenTool = () => {
    try {
      requestAnimationFrame(() => {
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
  } catch {}
      });
  } catch {}
  };

  Hooks.on('getSceneControlButtons', refreshTokenTool);
  Hooks.on('renderSceneControls', refreshTokenTool);
  Hooks.on('controlToken', refreshTokenTool);

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
    } catch (_) {}
  });

  
}
