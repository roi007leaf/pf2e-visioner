/**
 * UI-related hooks: Token HUD, Token Directory, TokenConfig injection
 */

import { COVER_STATES, MODULE_ID } from '../constants.js';
import { onRenderTokenHUD } from '../services/token-hud.js';

export function registerUIHooks() {
  Hooks.on('renderTokenHUD', onRenderTokenHUD);
  Hooks.on('getTokenDirectoryEntryContext', onGetTokenDirectoryEntryContext);
  Hooks.on('renderWallConfig', onRenderWallConfig);
  // Light config injection: add Heightened Darkness (rank 4+) checkbox
  Hooks.on('renderLightConfig', onRenderLightConfig);
  Hooks.on('renderAmbientLightConfig', onRenderLightConfig);
  // We no longer create a separate Visioner tool; tools are injected into Tokens/Walls below
  // Helper utilities to support both array- and object-shaped tool containers
  const getNamedTool = (toolsContainer, name) => {
    try {
      if (!toolsContainer) return null;
      if (Array.isArray(toolsContainer))
        return toolsContainer.find((t) => t?.name === name) || null;
      if (typeof toolsContainer === 'object') return toolsContainer?.[name] || null;
      return null;
    } catch {
      return null;
    }

  };

  const addTool = (toolsContainer, tool) => {
    try {
      if (!toolsContainer || !tool?.name) return;
      if (Array.isArray(toolsContainer)) toolsContainer.push(tool);
      else if (typeof toolsContainer === 'object') toolsContainer[tool.name] = tool;
    } catch { }
  };
  // Keep Darkness tool icon/title in sync with current selection (Lighting tool)
  const refreshDarknessTool = () => {
    try {
      const lightingTools = ui.controls.controls?.lighting?.tools || ui.controls.controls?.lights?.tools;
      const tool = getNamedTool(lightingTools, 'pf2e-visioner-darkness-mode');
      if (!tool) return;

      const selectedLights = canvas?.lighting?.controlled ?? [];
      const isDarkness = (l) => {
        const cfg = l?.document?.config ?? l?.config;
        return !!(cfg?.negative || cfg?.darkness?.negative);
      };
      const isHeightened = (l) => {
        const flags = l?.document?.flags?.[MODULE_ID] || {};
        const h = !!flags.heightenedDarkness;
        const legacy = !!flags.magicalDarkness;
        const rank = Number(flags.darknessRank || 0);
        return h || legacy || rank >= 4;
      };

      let iconClass = 'fa-regular fa-circle';
      let titleText = 'Set Darkness Mode (Selected Lights)';
      if (selectedLights.length > 0) {
        const darkStatuses = selectedLights.map(isDarkness);
        const heightenedStatuses = selectedLights.map(isHeightened);
        const allDark = darkStatuses.every(Boolean);
        const noneDark = darkStatuses.every((s) => !s);
        const allHeight = heightenedStatuses.every(Boolean);
        const anyHeight = heightenedStatuses.some(Boolean);

        if (allDark && allHeight) {
          iconClass = 'fa-solid fa-moon';
          titleText = 'Heightened Darkness (Rank 4+)';
        } else if (allDark && !anyHeight) {
          iconClass = 'fa-regular fa-moon';
          titleText = 'Darkness Source (non-heightened)';
        } else if (noneDark) {
          iconClass = 'fa-regular fa-lightbulb';
          titleText = 'Not a Darkness Source';
        } else {
          iconClass = 'fa-solid fa-circle-half-stroke';
          titleText = 'Mixed Darkness Modes';
        }
      }

      const changed = tool.icon !== iconClass || tool.title !== titleText;
      tool.icon = iconClass;
      tool.title = titleText;
      if (changed) ui.controls.render();
    } catch { }
  };
  // Update tool icon on light selection and CRUD changes
  // Update on light selection changes (AmbientLight/Light placeables)
  Hooks.on('controlAmbientLight', refreshDarknessTool);
  Hooks.on('controlLight', refreshDarknessTool);
  Hooks.on('createAmbientLight', refreshDarknessTool);
  Hooks.on('updateAmbientLight', refreshDarknessTool);
  Hooks.on('deleteAmbientLight', refreshDarknessTool);
  // Avoid calling refresh from renderSceneControls/canvasReady to prevent re-render loops
  // Keep toolbar toggle states in sync with current selection (Token tool)
  const refreshTokenTool = () => {
    try {
      const tokenTools = ui.controls.controls?.tokens?.tools;
      const tool = getNamedTool(tokenTools, 'pf2e-visioner-cycle-token-cover');
      if (!tool) return;
      const selected = canvas?.tokens?.controlled ?? [];

      if (!selected.length) {
        tool.icon = 'fa-solid fa-bolt-auto';
        tool.title = 'Cycle Token Cover (Selected Tokens)';
        ui.controls.render();
        return;
      }

      // Update icon and title based on first selected token's cover override
      const firstTokenOverride = selected[0]?.document?.getFlag?.(MODULE_ID, 'coverOverride');
      const currentCoverState = firstTokenOverride || 'auto';

      switch (currentCoverState) {
        case 'auto':
          tool.icon = 'fa-solid fa-bolt-auto';
          tool.title = 'Cycle Token Cover: Auto → No Cover';
          break;
        case 'none':
          tool.icon = 'fa-solid fa-shield-slash';
          tool.title = 'Cycle Token Cover: No Cover → Lesser Cover';
          break;
        case 'lesser':
          tool.icon = 'fa-regular fa-shield';
          tool.title = 'Cycle Token Cover: Lesser → Standard Cover';
          break;
        case 'standard':
          tool.icon = 'fa-solid fa-shield-alt';
          tool.title = 'Cycle Token Cover: Standard → Greater Cover';
          break;
        case 'greater':
          tool.icon = 'fa-solid fa-shield';
          tool.title = 'Cycle Token Cover: Greater → Auto';
          break;
      }

      ui.controls.render();
    } catch { }
  };
  // Helper: get cover status info for a wall
  const getWallCoverInfo = (wallDocument) => {
    try {
      const coverOverride = wallDocument?.getFlag?.(MODULE_ID, 'coverOverride');

      if (!coverOverride) {
        // Auto mode - show auto icon
        return {
          icon: 'fas fa-bolt-auto',
          color: 0x888888,
          tooltip: game.i18n.localize('PF2E_VISIONER.TOOLTIPS.AUTO_COVER_DETECTION')
        };
      }

      const coverState = COVER_STATES[coverOverride];
      if (coverState) {
        // Convert CSS color to hex number for PIXI
        let color = 0x888888; // default gray
        if (coverOverride === 'none') color = 0x4caf50; // green
        else if (coverOverride === 'lesser') color = 0xffc107; // yellow
        else if (coverOverride === 'standard') color = 0xff6600; // orange
        else if (coverOverride === 'greater') color = 0xf44336; // red

        return {
          icon: coverState.icon,
          color: color,
          tooltip: `Cover: ${coverOverride.charAt(0).toUpperCase() + coverOverride.slice(1)}`
        };
      }

      return 'auto';
    } catch {
      return 'auto';
    }
  };

  // Track Alt key state
  let isAltPressed = false;

  // Utility: label identifiers and cover status for walls when Alt is held
  const refreshWallIdentifierLabels = () => {
    return Promise.resolve().then(() => {
      const walls = canvas?.walls?.placeables || [];
      const layer = canvas?.controls || canvas?.hud || canvas?.stage;

      // Check if walls tool is active
      const isWallTool = ui.controls?.control?.name === 'walls';

      // Clean up labels that shouldn't exist anymore
      for (const w of walls) {
        const idf = w?.document?.getFlag?.(MODULE_ID, 'wallIdentifier');
        const coverOverride = w?.document?.getFlag?.(MODULE_ID, 'coverOverride');

        // Show identifier if wall is controlled AND walls tool is active AND has identifier
        const shouldShowIdentifier = !!w?.controlled && isWallTool && !!idf;

        // Show cover status if Alt is pressed AND walls tool is active AND has cover override
        const shouldShowCover = isAltPressed && isWallTool && coverOverride !== undefined;

        // Clean up identifier label if it shouldn't show
        if (!shouldShowIdentifier && w._pvIdLabel) {
          try {
            w._pvIdLabel.parent?.removeChild?.(w._pvIdLabel);
          } catch { }
          try {
            w._pvIdLabel.destroy?.();
          } catch { }
          delete w._pvIdLabel;
        }

        // Clean up cover icon if it shouldn't show
        if (!shouldShowCover && w._pvCoverIcon) {
          try {
            w._pvCoverIcon.parent?.removeChild?.(w._pvCoverIcon);
          } catch { }
          try {
            w._pvCoverIcon.destroy?.();
          } catch { }
          delete w._pvCoverIcon;
        }
      }

      // Create/update labels for walls
      for (const w of walls) {
        const idf = w?.document?.getFlag?.(MODULE_ID, 'wallIdentifier');
        const coverInfo = getWallCoverInfo(w.document);

        // Check conditions for showing each type of label
        const shouldShowIdentifier = !!w?.controlled && isWallTool && !!idf;
        const shouldShowCover = isAltPressed && isWallTool && coverInfo;

        // Skip if nothing to show
        if (!shouldShowIdentifier && !shouldShowCover) continue;

        try {
          const [x1, y1, x2, y2] = Array.isArray(w.document?.c)
            ? w.document.c
            : [w.document?.x, w.document?.y, w.document?.x2, w.document?.y2];
          const mx = (Number(x1) + Number(x2)) / 2;
          const my = (Number(y1) + Number(y2)) / 2;

          // Handle identifier text
          if (shouldShowIdentifier) {
            if (!w._pvIdLabel) {
              const style = new PIXI.TextStyle({
                fill: 0xffffff,
                fontSize: 12,
                stroke: 0x000000,
                strokeThickness: 3,
              });
              const text = new PIXI.Text(String(idf), style);
              text.anchor.set(0.5, 1);
              text.zIndex = 10000;
              text.position.set(mx, my - 6);
              // Prefer controls layer; fallback to wall container
              if (layer?.addChild) layer.addChild(text);
              else w.addChild?.(text);
              w._pvIdLabel = text;
            } else {
              w._pvIdLabel.text = String(idf);
              w._pvIdLabel.position.set(mx, my - 6);
            }
          } else if (w._pvIdLabel) {
            // Remove identifier label if no longer needed
            try {
              w._pvIdLabel.parent?.removeChild?.(w._pvIdLabel);
            } catch { }
            try {
              w._pvIdLabel.destroy?.();
            } catch { }
            delete w._pvIdLabel;
          }

          // Handle cover status text
          if (shouldShowCover) {
            const textOffsetX = 0; // Keep text centered
            const textY = shouldShowIdentifier ? my - 24 : my - 18; // Position text above identifier or wall center

            // Get cover text
            let coverText = '';
            if (coverInfo.tooltip.includes('Automatic')) {
              coverText = 'AUTO';
            } else if (coverInfo.tooltip.includes('None')) {
              coverText = 'NONE';
            } else if (coverInfo.tooltip.includes('Lesser')) {
              coverText = 'LESSER';
            } else if (coverInfo.tooltip.includes('Standard')) {
              coverText = 'STANDARD';
            } else if (coverInfo.tooltip.includes('Greater')) {
              coverText = 'GREATER';
            } else {
              coverText = 'AUTO';
            }

            if (!w._pvCoverIcon) {
              // Create a container for the text
              const container = new PIXI.Container();
              container.zIndex = 10001; // Above identifier text

              // Calculate scale based on camera zoom
              const cameraScale = canvas?.stage?.scale?.x || 1;
              const baseScale = Math.max(0.8, Math.min(2.0, 1 / cameraScale)); // Scale inversely with zoom, clamped

              // Create background rectangle for better visibility
              const bg = new PIXI.Graphics();
              bg.beginFill(0x000000, 0.8);
              bg.lineStyle(1, coverInfo.color, 1);

              // Calculate text dimensions for background sizing
              const tempStyle = new PIXI.TextStyle({
                fontFamily: 'Arial, sans-serif',
                fontSize: Math.round(10 * baseScale),
                fill: coverInfo.color,
                fontWeight: 'bold',
              });
              const tempText = new PIXI.Text(coverText, tempStyle);
              const textWidth = tempText.width;
              const textHeight = tempText.height;
              tempText.destroy();

              // Draw rounded rectangle background
              const padding = 3 * baseScale;
              bg.drawRoundedRect(
                -textWidth / 2 - padding,
                -textHeight / 2 - padding,
                textWidth + padding * 2,
                textHeight + padding * 2,
                3 * baseScale
              );
              bg.endFill();
              container.addChild(bg);

              // Create text label
              const textStyle = new PIXI.TextStyle({
                fontFamily: 'Arial, sans-serif',
                fontSize: Math.round(10 * baseScale),
                fill: coverInfo.color,
                stroke: 0x000000,
                strokeThickness: Math.max(1, Math.round(1 * baseScale)),
                fontWeight: 'bold',
              });

              const text = new PIXI.Text(coverText, textStyle);
              text.anchor.set(0.5, 0.5);
              container.addChild(text);

              container.position.set(mx + textOffsetX, textY);
              container.scale.set(baseScale);



              // Store tooltip and scale info
              container._tooltip = coverInfo.tooltip;
              container._baseScale = baseScale;
              container._coverText = coverText;

              // Prefer controls layer; fallback to wall container
              if (layer?.addChild) layer.addChild(container);
              else w.addChild?.(container);
              w._pvCoverIcon = container;
            } else {
              // Update existing text position, scale, and content
              const cameraScale = canvas?.stage?.scale?.x || 1;
              const baseScale = Math.max(0.8, Math.min(2.0, 1 / cameraScale));

              w._pvCoverIcon.position.set(mx + textOffsetX, textY);
              w._pvCoverIcon.scale.set(baseScale);



              // Update text content and color if changed
              const text = w._pvCoverIcon.children[1]; // Text is second child after background
              if (text && (text.text !== coverText || w._pvCoverIcon._coverText !== coverText)) {
                text.text = coverText;
                text.style.fill = coverInfo.color;
                w._pvCoverIcon._coverText = coverText;

                // Update background size and color
                const bg = w._pvCoverIcon.children[0];
                if (bg) {
                  bg.clear();
                  bg.beginFill(0x000000, 0.8);
                  bg.lineStyle(1, coverInfo.color, 1);

                  const textWidth = text.width;
                  const textHeight = text.height;
                  const padding = 3;
                  bg.drawRoundedRect(
                    -textWidth / 2 - padding,
                    -textHeight / 2 - padding,
                    textWidth + padding * 2,
                    textHeight + padding * 2,
                    3
                  );
                  bg.endFill();
                }
              }



              w._pvCoverIcon._tooltip = coverInfo.tooltip;
              w._pvCoverIcon._baseScale = baseScale;
            }
          } else if (w._pvCoverIcon) {
            // Remove cover text if no longer needed
            try {
              w._pvCoverIcon.parent?.removeChild?.(w._pvCoverIcon);
            } catch { }
            try {
              w._pvCoverIcon.destroy?.();
            } catch { }
            delete w._pvCoverIcon;
          }

        } catch {
          /* ignore label errors */
        }
      }
    }).catch(() => { });
  };

  const refreshWallTool = () => {
    try {
      const wallTools = ui.controls.controls?.walls?.tools;
      const selected = canvas?.walls?.controlled ?? [];

      // Cover cycling tool
      const coverTool = getNamedTool(wallTools, 'pf2e-visioner-cycle-wall-cover');
      if (coverTool) {
        if (!selected.length) {
          coverTool.icon = 'fa-solid fa-bolt-auto';
          coverTool.title = 'Cycle Wall Cover (Selected Walls)';
        } else {
          // Update icon and title based on first selected wall's cover override
          const firstWallOverride = selected[0]?.document?.getFlag?.(MODULE_ID, 'coverOverride');
          const currentCoverState = firstWallOverride || 'auto';

          switch (currentCoverState) {
            case 'auto':
              coverTool.icon = 'fa-solid fa-bolt-auto';
              coverTool.title = 'Cycle Wall Cover: Auto → No Cover';
              break;
            case 'none':
              coverTool.icon = 'fa-solid fa-shield-slash';
              coverTool.title = 'Cycle Wall Cover: No Cover → Standard Cover';
              break;
            case 'lesser':
              coverTool.icon = 'fa-regular fa-shield';
              coverTool.title = 'Cycle Wall Cover: Lesser → Standard Cover';
              break;
            case 'standard':
              coverTool.icon = 'fa-solid fa-shield-alt';
              coverTool.title = 'Cycle Wall Cover: Standard → Greater Cover';
              break;
            case 'greater':
              coverTool.icon = 'fa-solid fa-shield';
              coverTool.title = 'Cycle Wall Cover: Greater → Auto';
              break;
          }
        }
      }

      // Hidden Wall toggle state
      const hiddenTool = getNamedTool(wallTools, 'pf2e-visioner-toggle-hidden-wall');
      if (hiddenTool) {
        const hiddenActive =
          selected.length > 0 &&
          selected.every((w) => !!w?.document?.getFlag?.(MODULE_ID, 'hiddenWall'));
        hiddenTool.active = hiddenActive;
        hiddenTool.icon = hiddenActive ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
      }

      // Also refresh identifier labels on the canvas when selection changes
      refreshWallIdentifierLabels().catch(() => { });
      ui.controls.render();
    } catch { }
  };
  Hooks.on('controlToken', (token, controlled) => {
    // CRITICAL: Set global flag to suppress lighting refreshes during token control operations
    try {
      globalThis.game = globalThis.game || {};
      globalThis.game.pf2eVisioner = globalThis.game.pf2eVisioner || {};
      globalThis.game.pf2eVisioner.suppressLightingRefresh = true;

      // Track this controlToken event to prevent AVS from responding to related lighting refreshes
      import('../visibility/auto-visibility/core/LightingEventHandler.js').then(({ LightingEventHandler }) => {
        LightingEventHandler.trackControlTokenEvent();
      });

      // Clear the suppression flag after a short delay
      setTimeout(() => {
        try {
          if (globalThis.game?.pf2eVisioner) {
            globalThis.game.pf2eVisioner.suppressLightingRefresh = false;
          }
        } catch {
          // Best effort
        }
      }, 50);
    } catch {
      // Best effort - continue without tracking if import fails
    }
    refreshTokenTool();
  });
  Hooks.on('deleteToken', refreshTokenTool);
  Hooks.on('createToken', refreshTokenTool);
  Hooks.on('updateToken', refreshTokenTool);
  Hooks.on('controlWall', refreshWallTool);
  Hooks.on('deleteWall', refreshWallTool);
  Hooks.on('createWall', refreshWallTool);
  Hooks.on('updateWall', refreshWallTool);
  // Lighting tool state refresh (selected lights)
  const refreshLightingTool = () => {
    try {
      const controls = ui.controls?.controls || {};
      const lightingTools = controls.lighting?.tools || controls.lights?.tools;
      const tool = getNamedTool(lightingTools, 'pf2e-visioner-toggle-magical-darkness');
      if (!tool) return;

      const selected = canvas?.lighting?.controlled ?? [];
      if (!selected.length) {
        tool.icon = 'fa-regular fa-moon';
        tool.title = 'Toggle Heightened Darkness (Rank 4+)';
        tool.active = false;
        ui.controls.render();
        return;
      }

      const statuses = selected.map((l) => !!(l?.document?.getFlag?.(MODULE_ID, 'heightenedDarkness')));
      const all = statuses.every(Boolean);
      const none = statuses.every((s) => !s);

      if (all) {
        tool.icon = 'fa-solid fa-moon';
        tool.title = 'Disable Heightened Darkness (Rank 4+)';
        tool.active = true;
      } else if (none) {
        tool.icon = 'fa-regular fa-moon';
        tool.title = 'Enable Heightened Darkness (Rank 4+)';
        tool.active = false;
      } else {
        tool.icon = 'fa-solid fa-circle-half-stroke';
        tool.title = 'Mixed: Toggle Heightened Darkness (Rank 4+)';
        tool.active = false;
      }

      ui.controls.render();
    } catch { }
  };
  Hooks.on('controlAmbientLight', refreshLightingTool);
  Hooks.on('deleteAmbientLight', refreshLightingTool);
  Hooks.on('createAmbientLight', refreshLightingTool);
  Hooks.on('updateAmbientLight', refreshLightingTool);

  // Refresh wall labels when camera zoom changes
  let hasPendingCanvasPanUpdate = false;
  Hooks.on('canvasPan', () => {
    refreshWallIdentifierLabels().catch(() => { });
  });

  // Refresh wall labels when active tool changes
  Hooks.on('renderSceneControls', () => {
    refreshWallIdentifierLabels().catch(() => { });
  });

  // Add keyboard event listeners for Alt key
  document.addEventListener('keydown', (event) => {
    if (event.altKey && !isAltPressed) {
      isAltPressed = true;
      refreshWallIdentifierLabels().catch(() => { });
    }
  });

  document.addEventListener('keyup', (event) => {
    if (!event.altKey && isAltPressed) {
      isAltPressed = false;
      refreshWallIdentifierLabels().catch(() => { });
    }
  });
  for (const hook of [
    'renderTokenConfig',
    'renderPrototypeTokenConfig',
    'renderTokenConfigPF2e',
    'renderPrototypeTokenConfigPF2e',
    'renderSceneConfig',
  ]) {
    Hooks.on(hook, (app, root) => {
      try {
        injectPF2eVisionerBox(app, root);
      } catch (e) {
        console.error('[pf2e-visioner]', e);
      }
    });
  }

  // Add controls to Wall and Token tools for GM - consolidated into single hook
  Hooks.on('getSceneControlButtons', (controls) => {
    if (!game.user.isGM) return;
    try {
      // Respect setting to hide Visioner tools from scene controls
      const showTools = game.settings.get(MODULE_ID, 'showVisionerSceneTools');
      if (!showTools) return;

      const groups = Array.isArray(controls) ? controls : Object.values(controls || {});
      // Note: noisy scene/region tools removed

      // === WALL TOOL ADDITIONS ===
      const walls = groups.find((c) => c?.name === 'walls');
      if (walls) {
        // Wall Manager
        addTool(walls.tools, {
          name: 'pf2e-visioner-wall-manager',
          title: game.i18n.localize('PF2E_VISIONER.DIALOG_TITLES.WALL_SETTINGS'),
          icon: 'fas fa-grip-lines-vertical',
          button: true,
          onChange: async () => {
            const { VisionerWallManager } = await import(
              '../managers/wall-manager/WallManager.js'
            );
            new VisionerWallManager().render(true);
          },
        });

        // Toggle Provide Auto-Cover (Selected Walls)
        const selectedWalls = canvas?.walls?.controlled ?? [];

        // Determine current cover state for icon display
        let currentCoverState = 'auto';
        let iconClass = 'fa-solid fa-bolt-auto';
        let titleText = 'Cycle Wall Cover (Selected Walls)';

        if (selectedWalls.length > 0) {
          // Get the cover override of the first selected wall to determine icon
          const firstWallOverride = selectedWalls[0]?.document?.getFlag?.(MODULE_ID, 'coverOverride');
          currentCoverState = firstWallOverride || 'auto';

          switch (currentCoverState) {
            case 'auto':
              iconClass = 'fa-solid fa-bolt-auto';
              titleText = 'Cycle Wall Cover: Auto → No Cover';
              break;
            case 'none':
              iconClass = 'fa-solid fa-shield-slash';
              titleText = 'Cycle Wall Cover: No Cover → Standard Cover';
              break;
            case 'lesser':
              iconClass = 'fa-regular fa-shield';
              titleText = 'Cycle Wall Cover: Lesser → Standard Cover';
              break;
            case 'standard':
              iconClass = 'fa-solid fa-shield-alt';
              titleText = 'Cycle Wall Cover: Standard → Greater Cover';
              break;
            case 'greater':
              iconClass = 'fa-solid fa-shield'
              titleText = 'Cycle Wall Cover: Greater → Auto';
              break;
          }
        }

        addTool(walls.tools, {
          name: 'pf2e-visioner-cycle-wall-cover',
          title: titleText,
          icon: iconClass,
          toggle: false,
          button: true,
          onChange: async () => {
            try {
              const selected = canvas?.walls?.controlled ?? [];
              if (!selected.length) {
                return;
              }

              // Cycle through cover states: auto → none → standard → greater → auto
              const coverCycle = ['auto', 'none', 'standard', 'greater'];

              // Get current state of first wall to determine next state
              const currentOverride = selected[0]?.document?.getFlag?.(MODULE_ID, 'coverOverride');
              const currentIndex = coverCycle.indexOf(currentOverride);
              const nextIndex = (currentIndex + 1) % coverCycle.length;
              const nextCoverOverride = coverCycle[nextIndex];

              await Promise.all(
                selected.map((w) => {
                  const promises = [
                    w?.document?.setFlag?.(MODULE_ID, 'coverOverride', nextCoverOverride),
                    w?.document?.setFlag?.(MODULE_ID, 'provideCover', nextCoverOverride !== 'none')
                  ];
                  return Promise.all(promises.filter(Boolean));
                })
              );

              // Force controls to re-render to update icon
              ui.controls.render(true);
            } catch (e) {
              console.error('PF2E Visioner | Error cycling wall cover:', e);
            }
          },
        });

        // Toggle Hidden Wall (Selected Walls)
        const currentHiddenState =
          selectedWalls.length > 0 &&
          selectedWalls.every((w) => !!w?.document?.getFlag?.(MODULE_ID, 'hiddenWall'));
        addTool(walls.tools, {
          name: 'pf2e-visioner-toggle-hidden-wall',
          title: game.i18n.localize('PF2E_VISIONER.DIALOG_TITLES.TOGGLE_HIDDEN_WALL'),
          icon: currentHiddenState ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye',
          toggle: true,
          active: currentHiddenState,
          onChange: async (_event, toggled) => {
            try {
              const selected = canvas?.walls?.controlled ?? [];
              if (!selected.length) return;

              if (toggled) {
                await Promise.all(
                  selected.map((w) => w?.document?.setFlag?.(MODULE_ID, 'hiddenWall', true)),
                );
              } else {
                for (const w of selected) {
                  try {
                    await w?.document?.unsetFlag?.(MODULE_ID, 'hiddenWall');
                  } catch {
                    try {
                      await w?.document?.setFlag?.(MODULE_ID, 'hiddenWall', false);
                    } catch { }
                  }
                }
              }
              ui.controls.render();
            } catch { }
          },
        });
      }

      // === TOKEN TOOL ADDITIONS ===
      const tokens = groups.find((c) => c?.name === 'tokens' || c?.name === 'token');
      if (tokens) {
        // Quick Edit button (opens Visioner Quick Panel) - only show if setting is disabled
        if (game.settings.get(MODULE_ID, 'showQuickEditTool')) {
          addTool(tokens.tools, {
            name: 'pf2e-visioner-quick-edit',
            title: game.i18n.localize('PF2E_VISIONER.DIALOG_TITLES.QUICK_EDIT'),
            icon: 'fa-solid fa-bolt',
            button: true,
            onChange: async () => {
              try {
                const { VisionerQuickPanel } = await import('../managers/QuickPanel.js');
                if (!game.user?.isGM) return;
                new VisionerQuickPanel({}).render(true);
              } catch { }
            },
          });
        }
        // Toggle Provide Auto-Cover (Selected Tokens)
        const selectedTokens = canvas?.tokens?.controlled ?? [];

        // Determine current cover state for icon display
        let currentCoverState = 'auto';
        let iconClass = 'fa-solid fa-bolt-auto';
        let titleText = 'Cycle Token Cover (Selected Tokens)';

        if (selectedTokens.length > 0) {
          // Get the cover override of the first selected token to determine icon
          const firstTokenOverride = selectedTokens[0]?.document?.getFlag?.(MODULE_ID, 'coverOverride');
          currentCoverState = firstTokenOverride || 'auto';

          switch (currentCoverState) {
            case 'auto':
              iconClass = 'fa-solid fa-bolt-auto';
              titleText = 'Cycle Token Cover: Auto → No Cover';
              break;
            case 'none':
              iconClass = 'fa-solid fa-shield-slash';
              titleText = 'Cycle Token Cover: No Cover → Lesser Cover';
              break;
            case 'lesser':
              iconClass = 'fa-regular fa-shield';
              titleText = 'Cycle Token Cover: Lesser → Standard Cover';
              break;
            case 'standard':
              iconClass = 'fa-solid fa-shield-alt';
              titleText = 'Cycle Token Cover: Standard → Greater Cover';
              break;
            case 'greater':
              iconClass = 'fa-solid fa-shield';
              titleText = 'Cycle Token Cover: Greater → Auto';
              break;
          }
        }

        addTool(tokens.tools, {
          name: 'pf2e-visioner-cycle-token-cover',
          title: titleText,
          icon: iconClass,
          toggle: false,
          button: true,
          onChange: async () => {
            try {
              const selected = canvas?.tokens?.controlled ?? [];
              if (!selected.length) {
                return;
              }

              // Cycle through cover states: auto → none → lesser → standard → greater → auto
              const coverCycle = ['auto', 'none', 'lesser', 'standard', 'greater'];

              // Get current state of first token to determine next state
              const currentOverride = selected[0]?.document?.getFlag?.(MODULE_ID, 'coverOverride');
              const currentIndex = coverCycle.indexOf(currentOverride);
              const nextIndex = (currentIndex + 1) % coverCycle.length;
              const nextCoverOverride = coverCycle[nextIndex];

              await Promise.all(
                selected.map((t) =>
                  t?.document?.setFlag?.(MODULE_ID, 'coverOverride', nextCoverOverride),
                ),
              );

              // Force controls to re-render to update icon
              ui.controls.render(true);
            } catch (e) {
              console.error('PF2E Visioner | Error cycling token cover:', e);
            }
          },
        });

        // Purge: clear all Visioner scene data or selected token data
        addTool(tokens.tools, {
          name: 'pf2e-visioner-purge-scene',
          title: game.i18n.localize('PF2E_VISIONER.DIALOG_TITLES.PURGE_DATA'),
          icon: 'fa-solid fa-trash',
          button: true,
          onChange: async () => {
            try {
              const selectedTokens = canvas.tokens?.controlled ?? [];

              if (selectedTokens.length > 0) {
                // Tokens selected - offer to clear all selected tokens' data
                const tokenNames = selectedTokens.map((t) => t.name).join(', ');
                const { VisionerConfirmDialog } = await import('../ui/dialogs/ConfirmDialog.js');
                const confirmed = await VisionerConfirmDialog.confirm({
                  title: game.i18n.localize('PF2E_VISIONER.MODULE_TITLE'),
                  content: `<p>Clear all PF2E Visioner data for <strong>${selectedTokens.length === 1 ? tokenNames : `${selectedTokens.length} selected tokens`}</strong>? This will reset all visibility and cover relationships for ${selectedTokens.length === 1 ? 'this token' : 'all selected tokens'}.</p>`,
                  yes: 'Clear',
                  no: 'Cancel',
                });
                if (!confirmed) return;
                const { api } = await import('../api.js');

                // Clear data for all selected tokens with comprehensive cleanup
                await api.clearAllDataForSelectedTokens(selectedTokens);
              } else {
                // No tokens or multiple tokens selected - offer to clear entire scene
                const { VisionerConfirmDialog } = await import('../ui/dialogs/ConfirmDialog.js');
                const confirmed = await VisionerConfirmDialog.confirm({
                  title: game.i18n.localize('PF2E_VISIONER.MODULE_TITLE'),
                  content: `<p>Clear all PF2E Visioner data for this scene? This cannot be undone.</p>`,
                  yes: 'Clear Scene',
                  no: 'Cancel',
                });
                if (!confirmed) return;
                const { api } = await import('../api.js');
                await api.clearAllSceneData();
              }
            } catch (e) {
              console.error('[pf2e-visioner] purge scene error', e);
            }
          },
        });
      } else {
        console.warn(
          '[pf2e-visioner] Tokens tool not found. Control groups:',
          groups.map((c) => c?.name),
        );
      }

      // === LIGHTING TOOL ADDITIONS ===
      const lighting = groups.find((c) => c?.name === 'lighting' || c?.name === 'lights');
      if (lighting) {
        // Darkness Mode tool (dialog-based): Plain Darkness vs Heightened Darkness
        const selectedLights = canvas?.lighting?.controlled ?? [];
        const isDarkness = (l) => {
          const cfg = l?.document?.config ?? l?.config;
          return !!(cfg?.negative || cfg?.darkness?.negative);
        };
        const isHeightened = (l) => {
          const flags = l?.document?.flags?.[MODULE_ID] || {};
          const h = !!flags.heightenedDarkness;
          const legacy = !!flags.magicalDarkness;
          const rank = Number(flags.darknessRank || 0);
          return h || legacy || rank >= 4;
        };

        let iconClass = 'fa-regular fa-circle';
        let titleText = 'Set Darkness Mode (Selected Lights)';
        if (selectedLights.length > 0) {
          const darkStatuses = selectedLights.map(isDarkness);
          const heightenedStatuses = selectedLights.map(isHeightened);
          const allDark = darkStatuses.every(Boolean);
          const noneDark = darkStatuses.every((s) => !s);
          const allHeight = heightenedStatuses.every(Boolean);
          const anyHeight = heightenedStatuses.some(Boolean);

          if (allDark && allHeight) {
            iconClass = 'fa-solid fa-moon';
            titleText = 'All: Heightened Darkness (Rank 4+)';
          } else if (allDark && !anyHeight) {
            iconClass = 'fa-regular fa-moon';
            titleText = 'All: Darkness Source (non-heightened)';
          } else if (noneDark) {
            iconClass = 'fa-regular fa-circle';
            titleText = 'None: Not Darkness Source';
          } else {
            iconClass = 'fa-solid fa-circle-half-stroke';
            titleText = 'Mixed Darkness Modes';
          }
        }

        addTool(lighting.tools, {
          name: 'pf2e-visioner-darkness-mode',
          title: titleText,
          icon: iconClass,
          toggle: false,
          button: true,
          onChange: async () => {
            try {
              const selected = canvas?.lighting?.controlled ?? [];
              if (!selected.length) return;
              const refreshAfterChange = async () => {
                try {
                  const { LightingCalculator } = await import('../visibility/auto-visibility/LightingCalculator.js');
                  LightingCalculator.getInstance().invalidateLightCache();
                } catch { }

                // Clear LightingPrecomputer caches for ambient light changes
                try {
                  const { LightingPrecomputer } = await import('../visibility/auto-visibility/core/LightingPrecomputer.js');
                  LightingPrecomputer.clearLightingCaches();
                } catch { }

                canvas.perception.update({ refreshVision: true, initializeVision: true, refreshLighting: true });

                // Trigger AVS recalculation for lighting environment changes
                try {
                  const { autoVisibility } = await import('../api.js');
                  autoVisibility.recalculateAll(true); // Force recalculation
                } catch { }

                // Update tool icon/title immediately
                refreshDarknessTool();
                ui.controls.render(true);
              };
              const { DarknessModeDialog } = await import('../ui/dialogs/DarknessModeDialog.js');
              const choice = await DarknessModeDialog.choose();
              if (!choice) return;

              const applyPlainDarkness = async () => {
                await Promise.all(selected.map(async (l) => {
                  try { await l?.document?.update?.({ 'config.negative': true, 'config.darkness.negative': true }); } catch { }
                  try { await l?.document?.unsetFlag?.(MODULE_ID, 'heightenedDarkness'); } catch { await l?.document?.setFlag?.(MODULE_ID, 'heightenedDarkness', false); }
                }));
              };
              const applyHeightened = async () => {
                await Promise.all(selected.map(async (l) => {
                  try { await l?.document?.update?.({ 'config.negative': true, 'config.darkness.negative': true }); } catch { }
                  try { await l?.document?.setFlag?.(MODULE_ID, 'heightenedDarkness', true); } catch { }
                  try { await l?.document?.setFlag?.(MODULE_ID, 'darknessRank', 4); } catch { }
                }));
              };
              const clearDarkness = async () => {
                await Promise.all(selected.map(async (l) => {
                  try { await l?.document?.update?.({ 'config.negative': false, 'config.darkness.negative': false }); } catch { }
                  try { await l?.document?.unsetFlag?.(MODULE_ID, 'heightenedDarkness'); } catch { await l?.document?.setFlag?.(MODULE_ID, 'heightenedDarkness', false); }
                }));
              };

              if (choice === 'plain') await applyPlainDarkness();
              else if (choice === 'heightened') await applyHeightened();
              else if (choice === 'clear') await clearDarkness();
              await refreshAfterChange();
            } catch (e) {
              console.error('[pf2e-visioner] Darkness Mode dialog failed', e);
            }
          },
        });
      }

      // When selecting walls, show wall identifier if present on the control icon tooltip
      const showWallIdentifierTooltip = async () => {
        try {
          const selected = canvas?.walls?.controlled ?? [];
          if (!selected.length) return;
          const { MODULE_ID } = await import('../constants.js');
          selected.forEach((w) => {
            try {
              const idf = w?.document?.getFlag?.(MODULE_ID, 'wallIdentifier');
              if (idf && w?.controlIcon) w.controlIcon.tooltip = String(idf);
            } catch { }
          });
        } catch { }
      };
      Hooks.on('controlWall', showWallIdentifierTooltip);
    } catch (_) {
      console.error('[pf2e-visioner] getSceneControlButtons error', _);
    }
  });
}

function onGetTokenDirectoryEntryContext(html, options) {
  if (!game.user.isGM) return;
  options.push({
    name: 'PF2E_VISIONER.CONTEXT_MENU.MANAGE_TOKEN',
    icon: '<i class="fas fa-eye"></i>',
    callback: async (li) => {
      const tokenId = li.data('token-id');
      const token = canvas.tokens.get(tokenId);
      if (token) {
        const { openTokenManager } = await import('../api.js');
        await openTokenManager(token);
      }
    },
  });
}

function injectPF2eVisionerBox(app, root) {
  // Scene Config injection
  try {
    if (app?.object?.documentName === 'Scene' || app?.document?.documentName === 'Scene') {
      const container = (root?.jquery ? root[0] : root) || root;
      const form = container?.querySelector?.('form') || container;
      if (form && !form.querySelector('.pf2e-visioner-scene-settings')) {
        const fs = document.createElement('fieldset');
        fs.className = 'pf2e-visioner-scene-settings';
        const scene = app?.object || app?.document || canvas?.scene;
        const current = Number(scene?.getFlag?.(MODULE_ID, 'hiddenIndicatorHalf')) || 10;
        fs.innerHTML = `
          <legend>PF2E Visioner</legend>
          <div class="form-group" style="display:flex; flex-direction:column; gap:6px;">
            <label>Hidden Wall Indicator Width (half, px)</label>
            <div style="display:flex; align-items:center; gap:8px; width:100%;">
              <input type="range" min="1" max="30" step="1" name="flags.${MODULE_ID}.hiddenIndicatorHalf" value="${current}" oninput="this.nextElementSibling.value=this.value" style="flex:1 1 auto; width:100%;">
              <output style="min-width:2ch; text-align:right;">${current}</output>
            </div>
          </div>
        `;
        try {
          const basicsTab = form.querySelector(
            'div.tab[data-tab="basic"], div[data-tab="basics"], section[data-tab="basics"], div.tab:first-child',
          );
          (basicsTab || form).appendChild(fs);
        } catch {
          form.appendChild(fs);
        }
      }
    }
  } catch { }

  // The incoming "app" can represent several shapes depending on which sheet
  // is being rendered: a TokenConfig, PrototypeTokenConfig, or the PF2e
  // specialized PrototypeTokenConfigPF2e which may expose the Actor as
  // `app.object` or provide a `prototypeToken` payload on the actor.
  const tokenDoc = app?.document;

  // Resolve an Actor document robustly across these shapes. Prioritize any
  // explicit actor references on token documents, fall back to parent,
  // then to app.object when the sheet is an actor-based prototype form.
  let actor = null;
  if (tokenDoc?.actor) actor = tokenDoc.actor; // Token document
  else if (tokenDoc?.parent) actor = tokenDoc.parent; // Some token-like documents
  else if (app?.object?.actor) actor = app.object.actor; // sheets that expose object.actor
  else if (app?.object && (app.object.documentName === 'Actor' || tokenDoc?.documentName === 'Actor'))
    actor = app.object || tokenDoc; // actor sheet or prototype where document is the actor

  if (!actor) {
    return;
  }

  const panel = root.querySelector('div.tab[data-group="sheet"][data-tab="vision"]');
  if (!panel || panel.querySelector('.pf2e-visioner-box')) return;

  // Find the detection fieldset (used as an anchor) if present
  const detectionFS = [...panel.querySelectorAll('fieldset')].find((fs) =>
    fs.querySelector('header.detection-mode') ||
    (fs.querySelector('legend')?.textContent || '').trim().toLowerCase().startsWith('detection'),
  );
  const box = document.createElement('fieldset');
  box.className = 'pf2e-visioner-box';

  // Current values: token flags may live on a Token document or inside an Actor's
  // `prototypeToken.flags` for prototype token configuration forms (PF2e).
  const readFlag = (key) => {
    return (
      tokenDoc?.getFlag?.(MODULE_ID, key) ??
      tokenDoc?.flags?.[MODULE_ID]?.[key] ??
      actor?.prototypeToken?.flags?.[MODULE_ID]?.[key]
    );
  };

  const stealthCurrent = readFlag('stealthDC') ?? '';
  const coverOverride = readFlag('coverOverride') || 'auto';
  const minPerceptionRank = Number(readFlag('minPerceptionRank') ?? 0);

  // Build content
  let inner = `
    <legend>PF2E Visioner</legend>
    <div class="form-group">
      <label>Cover</label>
      <div class="cover-override-buttons" style="display: flex; gap: 4px; margin-top: 4px;">
        <button type="button" class="visioner-icon-btn ${!coverOverride ? 'active' : ''}" 
                data-cover-override="auto" data-tooltip="${game.i18n.localize('PF2E_VISIONER.UI.TOKEN_COVER_AUTO_TOOLTIP')}">
          <i class="fas fa-bolt-auto" style="color:#888"></i>
        </button>
        <button type="button" class="visioner-icon-btn ${coverOverride === 'none' ? 'active' : ''}" 
                data-cover-override="none" data-tooltip="${game.i18n.localize('PF2E_VISIONER.UI.TOKEN_COVER_NONE_TOOLTIP')}">
          <i class="fas fa-shield-slash" style="color:var(--cover-none)"></i>
        </button>
        <button type="button" class="visioner-icon-btn ${coverOverride === 'lesser' ? 'active' : ''}" 
                data-cover-override="lesser" data-tooltip="${game.i18n.localize('PF2E_VISIONER.UI.TOKEN_COVER_LESSER_TOOLTIP')}">
          <i class="fa-regular fa-shield" style="color:var(--cover-lesser)"></i>
        </button>
        <button type="button" class="visioner-icon-btn ${coverOverride === 'standard' ? 'active' : ''}" 
                data-cover-override="standard" data-tooltip="${game.i18n.localize('PF2E_VISIONER.UI.TOKEN_COVER_STANDARD_TOOLTIP')}">
          <i class="fas fa-shield-alt" style="color:var(--cover-standard)"></i>
        </button>
        <button type="button" class="visioner-icon-btn ${coverOverride === 'greater' ? 'active' : ''}" 
                data-cover-override="greater" data-tooltip="${game.i18n.localize('PF2E_VISIONER.UI.TOKEN_COVER_GREATER_TOOLTIP')}">
          <i class="fas fa-shield" style="color:var(--cover-greater)"></i>
        </button>
      </div>
      <input type="hidden" name="flags.${MODULE_ID}.coverOverride" value="${coverOverride || ''}">
      <p class="notes">Set how this token provides cover in combat.</p>
    </div>
  `;
  if (actor.type === 'loot') {
    inner += `
      <div class="form-group">
        <label>Stealth DC</label>
        <input type="number" inputmode="numeric" min="0" step="1" name="flags.${MODULE_ID}.stealthDC" value="${Number.isFinite(+stealthCurrent) ? +stealthCurrent : ''}">
      </div>
    `;
  }
  if (actor.type === 'hazard' || actor.type === 'loot') {
    inner += `
      <div class="form-group">
        <label>Minimum Perception Proficiency (to detect)</label>
        <select name="flags.${MODULE_ID}.minPerceptionRank">
          <option value="0" ${minPerceptionRank === 0 ? 'selected' : ''}>Untrained</option>
          <option value="1" ${minPerceptionRank === 1 ? 'selected' : ''}>Trained</option>
          <option value="2" ${minPerceptionRank === 2 ? 'selected' : ''}>Expert</option>
          <option value="3" ${minPerceptionRank === 3 ? 'selected' : ''}>Master</option>
          <option value="4" ${minPerceptionRank === 4 ? 'selected' : ''}>Legendary</option>
        </select>
      </div>
    `;
  }
  box.innerHTML = inner;

  // Add event listeners for cover override buttons
  try {
    const coverButtons = box.querySelectorAll('.cover-override-buttons .visioner-icon-btn');
    const hiddenInput = box.querySelector('input[name$=".coverOverride"]');

    coverButtons.forEach(button => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();

        const coverType = button.getAttribute('data-cover-override');

        // Remove active class from all cover override buttons
        coverButtons.forEach(btn => btn.classList.remove('active'));

        // Always make the clicked button active (no toggle behavior - one must always be selected)
        button.classList.add('active');

        // Update the hidden input for the cover override
        if (hiddenInput) {
          // Set the value (empty string for auto, coverType for specific override)
          hiddenInput.value = coverType === 'auto' ? '' : coverType;
        }
      });
    });
  } catch { }

  if (detectionFS) detectionFS.insertAdjacentElement('afterend', box);
  else panel.appendChild(box);
}

function onRenderWallConfig(app, html) {
  try {
    const root = html?.jquery ? html[0] : html;
    if (!root) return;
    const form = root.querySelector('form') || root;
    // Avoid duplicate injection
    if (form.querySelector('.pf2e-visioner-wall-settings')) return;

    // Build a simple fieldset with just the advanced settings button
    const fs = document.createElement('fieldset');
    fs.className = 'pf2e-visioner-wall-settings';
    fs.innerHTML = `
      <legend>PF2E Visioner</legend>
      <div class="form-group">
        <button type="button" class="visioner-btn" data-action="open-visioner-wall-quick" style="border:1px solid var(--pf2e-visioner-primary)">Open Advanced Wall Settings</button>
        <p class="notes">Configure cover settings, hidden walls, and other advanced options.</p>
      </div>
    `;

    // Append near Door Configuration or at form end
    const doorHeader = Array.from(form.querySelectorAll('label, h3, header, legend')).find((el) =>
      (el.textContent || '').toLowerCase().includes('door configuration'),
    );
    if (doorHeader && doorHeader.parentElement)
      doorHeader.parentElement.insertAdjacentElement('beforebegin', fs);
    else form.appendChild(fs);

    // Bind event handlers
    try {
      // Quick settings button
      const btn = fs.querySelector('[data-action="open-visioner-wall-quick"]');
      if (btn) {
        btn.addEventListener('click', async (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          const { VisionerWallQuickSettings } = await import(
            '../managers/wall-manager/WallQuick.js'
          );
          new VisionerWallQuickSettings(app.document).render(true);
        });
      }


    } catch { }
  } catch { }
}

function onRenderLightConfig(app, html) {
  try {
    const root = html?.jquery ? html[0] : html;
    if (!root) return;
    const form = root.querySelector('form') || root;
    if (!form || form.querySelector('.pf2e-visioner-light-settings')) return;

    const fs = document.createElement('fieldset');
    fs.className = 'pf2e-visioner-light-settings';
    const lightDoc = app?.document || app?.object || null;
    const checked = !!(lightDoc?.getFlag?.(MODULE_ID, 'heightenedDarkness'));
    const derivedRank = Number(lightDoc?.getFlag?.(MODULE_ID, 'darknessRank') ?? 0) || 0;
    const linkedTemplateId = lightDoc?.getFlag?.(MODULE_ID, 'linkedTemplateId') || '';
    fs.innerHTML = `
        <legend>PF2E Visioner</legend>
        <div class="pvv-card">
          <label class="checkbox pvv-title-row">
            <input type="checkbox" name="flags.${MODULE_ID}.heightenedDarkness" ${checked ? 'checked' : ''}>
            <input type="hidden" name="flags.${MODULE_ID}.darknessRank" value="${checked ? 4 : ''}">
            <div class="pvv-title-copy">
              <span class="pvv-title">Treat as Heightened Darkness <em class="pvv-subtle">(rank 4+)</em></span>
              <span class="pvv-subtle">In this area: darkvision sees Concealed; greater darkvision sees normally.</span>
            </div>
          </label>
          ${linkedTemplateId ? `<div class="pvv-chip-row"><span class="pvv-chip" data-tooltip="${game.i18n.localize('PF2E_VISIONER.UI.FROM_LINKED_DARKNESS')}"><i class="fas fa-moon"></i> Derived rank: <strong>${derivedRank || '—'}</strong></span></div>` : ''}
          <div class="pvv-help">Applies the rank 4 Darkness visibility rule.</div>
        </div>
    `;
    // light padding/margins are handled by CSS classes
    // Prefer inserting directly under the native "Is Darkness Source" control
    let inserted = false;
    let negCheckbox = null;
    try {
      // Locate the native darkness checkbox and its form-group container
      negCheckbox = form.querySelector(
        'input[name="config.negative"], input[name$=".negative"], input[name*="darkness"][name*="negative"]'
      );
      const negGroup = negCheckbox?.closest?.('.form-group');
      if (negGroup && negGroup.parentElement) {
        negGroup.insertAdjacentElement('afterend', fs);
        inserted = true;
      }
    } catch { /* fall through to other placements */ }

    // Fallbacks: first (leftmost) tab, then common tab names, then Advanced, then end of form
    if (!inserted) {
      try {
        const nav = form.querySelector('nav.tabs, nav[data-group], .tabs');
        const firstBtn = nav?.querySelector?.('[data-tab]');
        const firstTabName = firstBtn?.getAttribute?.('data-tab');
        if (firstTabName) {
          const firstTabPanel = form.querySelector(
            `div.tab[data-tab="${firstTabName}"], section.tab[data-tab="${firstTabName}"], [data-tab="${firstTabName}"]`
          );
          if (firstTabPanel) {
            firstTabPanel.insertBefore(fs, firstTabPanel.firstChild);
            inserted = true;
          }
        }
      } catch { /* ignore and fallback */ }
    }
    if (!inserted) {
      const basicTab = form.querySelector(
        'div.tab[data-tab="basic"], div.tab[data-tab="basics"], div.tab[data-tab="configuration"], section.tab[data-tab="basic"], section.tab[data-tab="basics"], section.tab[data-tab="configuration"]'
      );
      if (basicTab) {
        try { basicTab.insertBefore(fs, basicTab.firstChild); inserted = true; } catch { }
      }
    }
    if (!inserted) {
      const advTab = form.querySelector('div.tab[data-tab="advanced"], section.tab[data-tab="advanced"], [data-tab="advanced"]');
      if (advTab) {
        try {
          const headings = Array.from(advTab.querySelectorAll('legend,h2,h3,header,label'));
          const lightPlacementHeader = headings.find((h) => /light\s*placement/i.test(h.textContent || ''));
          if (lightPlacementHeader && lightPlacementHeader.parentElement) {
            lightPlacementHeader.parentElement.insertAdjacentElement('beforebegin', fs);
            inserted = true;
          }
        } catch { /* ignore */ }
        if (!inserted) {
          try { advTab.insertBefore(fs, advTab.firstChild); inserted = true; } catch { }
        }
      }
    }
    if (!inserted) form.appendChild(fs);

    // Sync native darkness checkbox when enabling magical darkness in the form
    try {
      // Find the checkbox and darknessRank input we just created
      const magCb = fs.querySelector(`input[name="flags.${MODULE_ID}.heightenedDarkness"]`);
      const darknessRankInput = fs.querySelector(`input[name="flags.${MODULE_ID}.darknessRank"]`);
      // Debug logs removed

      const nativeNeg = () =>
        form.querySelector(
          'input[name="config.negative"], input[name$=".negative"], input[name*="darkness"][name*="negative"]'
        );
      if (magCb && darknessRankInput) {
        magCb.addEventListener('change', async (event) => {
          // Debug logs removed

          if (magCb.checked) {
            const neg = nativeNeg();
            if (neg && !neg.checked) {
              try { neg.checked = true; neg.dispatchEvent(new Event('change', { bubbles: true })); } catch { }
            }
          }

          // Update darknessRank flag based on checkbox state using direct reference
          // Use empty string when unchecked to unset the flag, '4' when checked
          darknessRankInput.value = magCb.checked ? '4' : '';
          // Debug logs removed

          // Update the actual light document immediately for real-time effect
          try {
            if (magCb.checked) {
              // Enable heightened darkness
              await lightDoc?.setFlag?.(MODULE_ID, 'heightenedDarkness', true);
              await lightDoc?.setFlag?.(MODULE_ID, 'darknessRank', 4);
            } else {
              // Disable heightened darkness
              await lightDoc?.unsetFlag?.(MODULE_ID, 'heightenedDarkness');
              await lightDoc?.unsetFlag?.(MODULE_ID, 'darknessRank');
            }
            // Debug logs removed
          } catch (e) {
            console.warn('PF2E Visioner | Failed to update light document flags:', e);
          }

          // Trigger AVS recalculation when heightened darkness checkbox changes
          try {
            // Clear LightingPrecomputer caches for ambient light changes
            const { LightingPrecomputer } = await import('../visibility/auto-visibility/core/LightingPrecomputer.js');
            LightingPrecomputer.clearLightingCaches();

            // Trigger AVS recalculation for lighting environment changes
            const { autoVisibility } = await import('../api.js');
            autoVisibility.recalculateAll(true); // Force recalculation

            // Debug logs removed
          } catch (e) {
            console.warn('PF2E Visioner | Failed to trigger AVS recalculation on heightened darkness change:', e);
          }
        });
      }
      // Hide our fieldset unless the native darkness checkbox is checked
      const neg = negCheckbox || nativeNeg();
      const syncVisibility = () => {
        try { fs.style.display = neg?.checked ? '' : 'none'; } catch { }
      };
      const handleNativeDarknessChange = async () => {
        syncVisibility();

        // Trigger AVS recalculation when native darkness checkbox changes
        try {
          // Clear LightingPrecomputer caches for ambient light changes
          const { LightingPrecomputer } = await import('../visibility/auto-visibility/core/LightingPrecomputer.js');
          LightingPrecomputer.clearLightingCaches();

          // Trigger AVS recalculation for lighting environment changes
          const { autoVisibility } = await import('../api.js');
          autoVisibility.recalculateAll(true); // Force recalculation
        } catch (e) {
          console.warn('PF2E Visioner | Failed to trigger AVS recalculation on native darkness change:', e);
        }
      };
      syncVisibility();
      if (neg) neg.addEventListener('change', handleNativeDarknessChange);
    } catch { }
  } catch { }
}

// Removed: onGetSceneControlButtons for a separate 'visioner' control group
