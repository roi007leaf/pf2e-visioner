/**
 * UI-related hooks: Token HUD, Token Directory, TokenConfig injection
 */

import { COVER_STATES, MODULE_ID } from '../constants.js';
import { onRenderTokenHUD } from '../services/token-hud.js';

export function registerUIHooks() {
  Hooks.on('renderTokenHUD', onRenderTokenHUD);
  Hooks.on('getTokenDirectoryEntryContext', onGetTokenDirectoryEntryContext);
  Hooks.on('renderWallConfig', onRenderWallConfig);
  // We no longer create a separate Visioner tool; tools are injected into Tokens/Walls below
  // Helper utilities to support both array- and object-shaped tool containers
  const getNamedTool = (toolsContainer, name) => {
    try {
      if (!toolsContainer) return null;
      if (Array.isArray(toolsContainer))
        return toolsContainer.find((t) => t?.name === name) || null;
      if (typeof toolsContainer === 'object') return toolsContainer?.[name] || null;
      return null;
    } catch (_) {
      return null;
    }
  };

  const addTool = (toolsContainer, tool) => {
    try {
      if (!toolsContainer || !tool?.name) return;
      if (Array.isArray(toolsContainer)) toolsContainer.push(tool);
      else if (typeof toolsContainer === 'object') toolsContainer[tool.name] = tool;
    } catch (_) {}
  };
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
    } catch (_) {}
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
          tooltip: 'Automatic Cover Detection',
        };
      }

      const coverState = COVER_STATES[coverOverride];
      if (coverState) {
        // Convert CSS color to hex number for PIXI
        let color = 0x888888; // default gray
        if (coverOverride === 'none')
          color = 0x4caf50; // green
        else if (coverOverride === 'lesser')
          color = 0xffc107; // yellow
        else if (coverOverride === 'standard')
          color = 0xff6600; // orange
        else if (coverOverride === 'greater') color = 0xf44336; // red

        return {
          icon: coverState.icon,
          color: color,
          tooltip: `Cover: ${coverOverride.charAt(0).toUpperCase() + coverOverride.slice(1)}`,
        };
      }

      return 'auto';
    } catch (_) {
      return 'auto';
    }
  };

  // Track Alt key state
  let isAltPressed = false;

  // Utility: label identifiers and cover status for walls when Alt is held
  const refreshWallIdentifierLabels = () => {
    try {
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
          } catch (_) {}
          try {
            w._pvIdLabel.destroy?.();
          } catch (_) {}
          delete w._pvIdLabel;
        }

        // Clean up cover icon if it shouldn't show
        if (!shouldShowCover && w._pvCoverIcon) {
          try {
            w._pvCoverIcon.parent?.removeChild?.(w._pvCoverIcon);
          } catch (_) {}
          try {
            w._pvCoverIcon.destroy?.();
          } catch (_) {}
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
            } catch (_) {}
            try {
              w._pvIdLabel.destroy?.();
            } catch (_) {}
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
                3 * baseScale,
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
                    3,
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
            } catch (_) {}
            try {
              w._pvCoverIcon.destroy?.();
            } catch (_) {}
            delete w._pvCoverIcon;
          }
        } catch (_) {
          /* ignore label errors */
        }
      }
    } catch (_) {}
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
      refreshWallIdentifierLabels();
      ui.controls.render();
    } catch (_) {}
  };
  Hooks.on('controlToken', refreshTokenTool);
  Hooks.on('deleteToken', refreshTokenTool);
  Hooks.on('createToken', refreshTokenTool);
  Hooks.on('updateToken', refreshTokenTool);
  Hooks.on('controlWall', refreshWallTool);
  Hooks.on('deleteWall', refreshWallTool);
  Hooks.on('createWall', refreshWallTool);
  Hooks.on('updateWall', refreshWallTool);

  // Refresh wall labels when camera zoom changes
  let hasPendingCanvasPanUpdate = false;
  Hooks.on('canvasPan', () => {
    if (!hasPendingCanvasPanUpdate) return;

    hasPendingCanvasPanUpdate = true;
    canvas.app.ticker.addOnce(
      () => {
        refreshWallIdentifierLabels();
        hasPendingCanvasPanUpdate = false;
      },
      null,
      PIXI.UPDATE_PRIORITY.INTERACTION,
    );
  });

  // Refresh wall labels when active tool changes
  Hooks.on('renderSceneControls', () => {
    refreshWallIdentifierLabels();
  });

  // Add keyboard event listeners for Alt key
  document.addEventListener('keydown', (event) => {
    if (event.altKey && !isAltPressed) {
      isAltPressed = true;
      refreshWallIdentifierLabels();
    }
  });

  document.addEventListener('keyup', (event) => {
    if (!event.altKey && isAltPressed) {
      isAltPressed = false;
      refreshWallIdentifierLabels();
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
      const hideTools = game.settings.get(MODULE_ID, 'hideVisionerSceneTools');
      if (hideTools) return;

      const groups = Array.isArray(controls) ? controls : Object.values(controls || {});
      // === WALL TOOL ADDITIONS ===
      const walls = groups.find((c) => c?.name === 'walls');
      if (walls) {
        // Wall Manager
        addTool(walls.tools, {
          name: 'pf2e-visioner-wall-manager',
          title: 'PF2E Visioner: Wall Settings',
          icon: 'fas fa-grip-lines-vertical',
          button: true,
          onChange: async () => {
            const { VisionerWallManager } = await import(
              '../managers/wall-manager/wall-manager.js'
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
          const firstWallOverride = selectedWalls[0]?.document?.getFlag?.(
            MODULE_ID,
            'coverOverride',
          );
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
              iconClass = 'fa-solid fa-shield';
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
                    w?.document?.setFlag?.(MODULE_ID, 'provideCover', nextCoverOverride !== 'none'),
                  ];
                  return Promise.all(promises.filter(Boolean));
                }),
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
          title: 'Toggle Hidden Wall (Selected Walls)',
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
                  } catch (_) {
                    try {
                      await w?.document?.setFlag?.(MODULE_ID, 'hiddenWall', false);
                    } catch (_) {}
                  }
                }
              }
              ui.controls.render();
            } catch (_) {}
          },
        });
      }

      // === TOKEN TOOL ADDITIONS ===
      const tokens = groups.find((c) => c?.name === 'tokens' || c?.name === 'token');
      if (tokens) {
        // Quick Edit button (opens Visioner Quick Panel) - only show if setting is disabled
        if (!game.settings.get(MODULE_ID, 'hideQuickEditTool')) {
          addTool(tokens.tools, {
            name: 'pf2e-visioner-quick-edit',
            title: 'PF2E Visioner: Quick Edit (Selected ↔ Targeted)',
            icon: 'fa-solid fa-bolt',
            button: true,
            onChange: async () => {
              try {
                const { VisionerQuickPanel } = await import('../managers/quick-panel.js');
                if (!game.user?.isGM) return;
                new VisionerQuickPanel({}).render(true);
              } catch (_) {}
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
          const firstTokenOverride = selectedTokens[0]?.document?.getFlag?.(
            MODULE_ID,
            'coverOverride',
          );
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
          title: 'PF2E Visioner: Purge Data (Scene/Selected Tokens)',
          icon: 'fa-solid fa-trash',
          button: true,
          onChange: async () => {
            try {
              const selectedTokens = canvas.tokens?.controlled ?? [];

              if (selectedTokens.length > 0) {
                // Tokens selected - offer to clear all selected tokens' data
                const tokenNames = selectedTokens.map((t) => t.name).join(', ');
                const confirmed = await Dialog.confirm({
                  title: 'PF2E Visioner',
                  content: `<p>Clear all PF2E Visioner data for <strong>${selectedTokens.length === 1 ? tokenNames : `${selectedTokens.length} selected tokens`}</strong>? This will reset all visibility and cover relationships for ${selectedTokens.length === 1 ? 'this token' : 'all selected tokens'}.</p>`,
                  yes: () => true,
                  no: () => false,
                  defaultYes: false,
                });
                if (!confirmed) return;
                const { api } = await import('../api.js');

                // Clear data for all selected tokens with comprehensive cleanup
                await api.clearAllDataForSelectedTokens(selectedTokens);
              } else {
                // No tokens or multiple tokens selected - offer to clear entire scene
                const confirmed = await Dialog.confirm({
                  title: 'PF2E Visioner',
                  content: `<p>Clear all PF2E Visioner data for this scene? This cannot be undone.</p>`,
                  yes: () => true,
                  no: () => false,
                  defaultYes: false,
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
            } catch (_) {}
          });
        } catch (_) {}
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
        } catch (_) {
          form.appendChild(fs);
        }
      }
    }
  } catch (_) {}

  // The incoming "app" can represent several shapes depending on which sheet
  // is being rendered: a TokenConfig, PrototypeTokenConfig, or the PF2e
  // specialized PrototypeTokenConfigPF2e which may expose the Actor in
  // different places or provide a `prototypeToken` payload on the actor.
  const tokenDoc = app?.document || app?.token || app?.object?.document || null;

  // Resolve an Actor document robustly across these shapes. Try multiple
  // locations to account for PF2e's PrototypeTokenConfigPF2e variants.
  let actor = null;
  // Token document may directly reference its actor
  if (tokenDoc?.actor) actor = tokenDoc.actor;
  // Some token-like documents expose a parent (Actor)
  else if (tokenDoc?.parent) actor = tokenDoc.parent;
  // PF2e PrototypeTokenConfigPF2e sometimes exposes the actor via app.object.actor
  else if (app?.object?.actor) actor = app.object.actor;
  // Some PF2e sheets expose the actor itself as app.object
  else if (app?.object && (app.object.documentName === 'Actor' || app.object?.type))
    actor = app.object;
  // As a last-ditch, check app?.actor or app.options?.actor or app.options?.document
  else if (app?.actor) actor = app.actor;
  else if (app?.options?.actor) actor = app.options.actor;
  else if (app?.options?.document) actor = app.options.document;

  if (!actor) {
    return;
  }

  const panel = root.querySelector('div.tab[data-group="sheet"][data-tab="vision"]');
  if (!panel || panel.querySelector('.pf2e-visioner-box')) return;

  // Find the detection fieldset (used as an anchor) if present
  const detectionFS = [...panel.querySelectorAll('fieldset')].find(
    (fs) =>
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
                data-cover-override="auto" data-tooltip="Automatic Detection - Token provides cover based on coverage thresholds">
          <i class="fas fa-bolt-auto" style="color:#888"></i>
        </button>
        <button type="button" class="visioner-icon-btn ${coverOverride === 'none' ? 'active' : ''}" 
                data-cover-override="none" data-tooltip="No Cover - Token never provides cover regardless of thresholds">
          <i class="fas fa-shield-slash" style="color:var(--cover-none)"></i>
        </button>
        <button type="button" class="visioner-icon-btn ${coverOverride === 'lesser' ? 'active' : ''}" 
                data-cover-override="lesser" data-tooltip="Lesser Cover - Token always provides lesser cover">
          <i class="fa-regular fa-shield" style="color:var(--cover-lesser)"></i>
        </button>
        <button type="button" class="visioner-icon-btn ${coverOverride === 'standard' ? 'active' : ''}" 
                data-cover-override="standard" data-tooltip="Standard Cover - Token always provides standard cover">
          <i class="fas fa-shield-alt" style="color:var(--cover-standard)"></i>
        </button>
        <button type="button" class="visioner-icon-btn ${coverOverride === 'greater' ? 'active' : ''}" 
                data-cover-override="greater" data-tooltip="Greater Cover - Token always provides greater cover">
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

    coverButtons.forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();

        const coverType = button.getAttribute('data-cover-override');

        // Remove active class from all cover override buttons
        coverButtons.forEach((btn) => btn.classList.remove('active'));

        // Always make the clicked button active (no toggle behavior - one must always be selected)
        button.classList.add('active');

        // Update the hidden input for the cover override
        if (hiddenInput) {
          // Set the value (empty string for auto, coverType for specific override)
          hiddenInput.value = coverType === 'auto' ? '' : coverType;
        }
      });
    });
  } catch (_) {}

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
            '../managers/wall-manager/wall-quick.js'
          );
          new VisionerWallQuickSettings(app.document).render(true);
        });
      }
    } catch (_) {}
  } catch (_) {}
}

// Removed: onGetSceneControlButtons for a separate 'visioner' control group
