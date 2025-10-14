/**
 * Module settings registration and management
 */

import { reinjectChatAutomationStyles } from './chat/chat-automation-styles.js';
import { DEFAULT_SETTINGS, KEYBINDINGS, MODULE_ID } from './constants.js';

// Grouped layout per redesign spec.
// Each category contains an ordered list of group objects with a title & keys.
// Outside-of-dialog groups (Target Hover Tooltips, Debug Mode etc.) remain native.
const SETTINGS_GROUPS = {
  General: [
    { title: 'General UI', keys: ['useHudButton', 'showVisionerSceneTools', 'showQuickEditTool', 'hiddenWallIndicatorWidth', 'dimLightingThreshold'] },
    {
      title: 'Visioner Dialogs Settings',
      keys: [
        'integrateRollOutcome',
        'defaultEncounterFilter',
        'ignoreAllies',
        'hideFoundryHiddenTokens',
        'sneakAllowHiddenUndetectedEndPosition',
      ],
    },
  ],
  Vision: [
    { title: 'Vision', keys: ['enableAllTokensVision'] },
    { title: 'Hidden Loot Actors', keys: ['includeLootActors', 'lootStealthDC'] },
    { title: 'Hidden Walls', keys: ['hiddenWallsEnabled', 'wallStealthDC'] },
    {
      title: 'Advanced Seek Options',
      keys: [
        'seekUseTemplate',
        'limitSeekRangeInCombat',
        'customSeekDistance',
        'limitSeekRangeOutOfCombat',
        'customSeekDistanceOutOfCombat',
      ],
    },
  ],
  Cover: [
    {
      title: 'Cover',
      // First item acts as parent (Enable Auto-Cover) others depend visually/logic on it
      keys: [
        'autoCover',
        'autoCoverVisualizationOnlyInEncounter',
        'autoCoverVisualizationRespectFogForGM',
      ],
    },
    {
      title: 'Token Auto Cover Settings',
      keys: [
        'autoCoverTokenIntersectionMode',
        'autoCoverIgnoreUndetected',
        'autoCoverIgnoreDead',
        'autoCoverAllowProneBlockers',
        'autoCoverIgnoreAllies',
      ],
    },
    {
      title: 'Wall Auto Cover Settings',
      keys: ['wallCoverStandardThreshold', 'wallCoverAllowGreater', 'wallCoverGreaterThreshold'],
    },
  ],
  'A.V.S. Settings': [
    {
      title: 'A.V.S. Settings',
      keys: [
        'autoVisibilityEnabled',
        'avsChangesIndicatorSize',
        'autoVisibilityDebugMode',
        'disableLineOfSightCalculation',
      ],
    },
  ],
  Advanced: [{ title: 'Advanced', keys: ['keybindingOpensTMInTargetMode'] }],
};

function allGroupedKeys() {
  return Object.values(SETTINGS_GROUPS)
    .flat()
    .flatMap((g) => g.keys);
}

function isGroupedKey(key) {
  return allGroupedKeys().includes(key);
}

let currentVisionerSettingsApp = null;

class VisionerSettingsForm extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: 'pf2e-visioner-settings',
    tag: 'div',
    window: {
      title: 'PF2E Visioner Settings',
      icon: 'fas fa-sliders-h',
      resizable: true,
    },
    position: { width: 640, height: 600 },
    classes: ['pf2e-visioner-settings-window'],
    actions: {
      submit: VisionerSettingsForm._onSubmit,
      switchGroup: VisionerSettingsForm._onSwitchGroup,
    },
  };

  constructor(options = {}) {
    super(options);
    currentVisionerSettingsApp = this;
    // Track unsaved edits across tab switches so the Save button applies all changes
    this._pendingChanges = {};
    // Default to the first defined group
    try {
      if (!this.activeGroupKey) this.activeGroupKey = Object.keys(SETTINGS_GROUPS)[0];
    } catch {
      this.activeGroupKey = 'General';
    }
  }

  async _prepareContext() {
    const isGM = !!game.user?.isGM;
    const keyVisible = (key) => {
      const cfg = DEFAULT_SETTINGS[key];
      if (!cfg) return false;
      if (cfg.restricted && !isGM) return false;
      return true;
    };

    // Only show categories (tabs) that have at least one visible item
    const visibleCategoryKeys = Object.keys(SETTINGS_GROUPS).filter((cat) =>
      (SETTINGS_GROUPS[cat] || []).some((group) => group.keys.some((k) => keyVisible(k))),
    );

    // If current active group has no visible items, switch to the first visible group
    if (!visibleCategoryKeys.includes(this.activeGroupKey)) {
      this.activeGroupKey = visibleCategoryKeys[0] || this.activeGroupKey;
    }

    const categories = visibleCategoryKeys.map((k) => ({
      key: k,
      title: k,
      active: k === this.activeGroupKey,
    }));
    const groups = [];
    const categoryGroups = SETTINGS_GROUPS[this.activeGroupKey] || [];

    // Pre-compute dependency map for indentation (parent -> children)
    const flatDependencyMap = new Map();
    // We'll extend this with the runtime dependency map defined later; replicate keys here for depth calc
    const dependencyPairs = [
      ['includeLootActors', ['lootStealthDC']],
      ['hiddenWallsEnabled', ['wallStealthDC']],
      ['limitSeekRangeInCombat', ['customSeekDistance']],
      ['limitSeekRangeOutOfCombat', ['customSeekDistanceOutOfCombat']],
      ['wallCoverAllowGreater', ['wallCoverGreaterThreshold']],
      [
        'autoVisibilityEnabled',
        ['avsChangesIndicatorSize', 'autoVisibilityDebugMode'],
      ],
      [
        'autoCover',
        [
          'autoCoverVisualizationOnlyInEncounter',
          'autoCoverVisualizationRespectFogForGM',
          'autoCoverTokenIntersectionMode',
          'autoCoverIgnoreUndetected',
          'autoCoverIgnoreDead',
          'autoCoverAllowProneBlockers',
          'autoCoverIgnoreAllies',
          'wallCoverStandardThreshold',
          'wallCoverAllowGreater',
          'wallCoverGreaterThreshold',
        ],
      ],
    ];
    dependencyPairs.forEach(([p, children]) => flatDependencyMap.set(p, children));

    for (const group of categoryGroups) {
      const visibleKeys = group.keys.filter((k) => keyVisible(k));
      if (!visibleKeys.length) continue;
      const items = [];
      for (const key of visibleKeys) {
        const cfg = DEFAULT_SETTINGS[key];
        if (!cfg) continue;
        const pendingRaw = this?._pendingChanges?.[`settings.${key}`];
        const saved = game.settings.get(MODULE_ID, key);
        let current = saved;
        if (pendingRaw !== undefined) {
          if (cfg.type === Boolean) current = !!pendingRaw;
          else if (cfg.type === Number)
            current = pendingRaw !== '' && pendingRaw != null ? Number(pendingRaw) : saved;
          else current = String(pendingRaw);
        }
        let inputType = 'text';
        let choicesList = null;
        if (cfg.choices && typeof cfg.choices === 'object') {
          inputType = 'select';
          try {
            choicesList = Object.entries(cfg.choices).map(([val, label]) => ({
              value: val,
              label,
              selected: String(current) === String(val),
            }));
          } catch {
            choicesList = null;
          }
        } else if (cfg.type === Boolean) inputType = 'checkbox';
        else if (cfg.type === Number) inputType = 'number';

        // Determine depth (indentation) if this key is a child of some earlier parent in the same category
        let depth = 0;
        for (const [parent, children] of flatDependencyMap.entries()) {
          if (children.includes(key)) {
            // ensure parent appears earlier in any group of the same category
            const parentAppearsEarlier = categoryGroups.some((g) => {
              if (!g.keys.includes(parent)) return false;
              // if same group, parent index < key index
              if (
                g === group &&
                g.keys.indexOf(parent) > -1 &&
                g.keys.indexOf(parent) < g.keys.indexOf(key)
              )
                return true;
              // if different group, ensure group's index is earlier
              const catIndexParent = categoryGroups.indexOf(
                categoryGroups.find((cg) => cg.keys.includes(parent)),
              );
              const catIndexChild = categoryGroups.indexOf(group);
              return catIndexParent > -1 && catIndexParent < catIndexChild;
            });
            if (parentAppearsEarlier) depth = 1;
          }
        }

        items.push({
          key,
          name: game.i18n?.localize?.(cfg.name) ?? cfg.name,
          hint: game.i18n?.localize?.(cfg.hint) ?? (cfg.hint || ''),
          value: current,
          inputType,
          choices: choicesList,
          min: cfg.min ?? null,
          max: cfg.max ?? null,
          step: cfg.step ?? 1,
          depth,
        });
      }
      if (items.length) groups.push({ title: group.title, items });
    }
    return { groups, categories };
  }

  async _renderHTML(context, _options) {
    _options; // mark as used to satisfy linter
    return await foundry.applications.handlebars.renderTemplate(
      'modules/pf2e-visioner/templates/settings-menu.hbs',
      context,
    );
  }

  _replaceHTML(result, content, _options) {
    result;
    _options; // mark as used to satisfy linter
    content.innerHTML = result;
    try {
      // Wire tabs for categories
      const tabs = content.querySelectorAll('[data-action="switchGroup"][data-key]');
      tabs.forEach((btn) => {
        btn.addEventListener('click', () => {
          try {
            VisionerSettingsForm._onSwitchGroup(null, btn);
          } catch { }
        });
      });

      // Utility: show/hide a setting's form-group wrapper
      const toggleSettingVisibility = (name, visible) => {
        try {
          const input = content.querySelector(`[name="settings.${name}"]`);
          if (!input) return;
          const group =
            input.closest('.pv-form-row') || input.closest('.form-group') || input.parentElement;
          if (!group) return;
          if (!group.dataset.pvDisplay) {
            const computed = getComputedStyle(group)?.display || '';
            group.dataset.pvDisplay = group.style.display || computed || '';
          }
          group.style.display = visible ? group.dataset.pvDisplay : 'none';
        } catch { }
      };

      // Generic dependency system per redesign
      const dependencyMap = {
        autoCover: [
          'autoCoverVisualizationOnlyInEncounter',
          'autoCoverVisualizationRespectFogForGM',
          'autoCoverTokenIntersectionMode',
          'autoCoverIgnoreUndetected',
          'autoCoverIgnoreDead',
          'autoCoverAllowProneBlockers',
          'autoCoverIgnoreAllies',
          'wallCoverStandardThreshold',
          'wallCoverAllowGreater',
          'wallCoverGreaterThreshold',
        ],
        includeLootActors: ['lootStealthDC'],
        hiddenWallsEnabled: ['wallStealthDC'],
        limitSeekRangeInCombat: ['customSeekDistance'],
        limitSeekRangeOutOfCombat: ['customSeekDistanceOutOfCombat'],
        wallCoverAllowGreater: ['wallCoverGreaterThreshold'],
        autoVisibilityEnabled: [
          'avsChangesIndicatorSize',
          'autoVisibilityDebugMode',
        ],
      };

      // Additional logic: if seekUseTemplate is ON, hide range limit toggles & their children
      const seekTemplateToggle = content.querySelector('[name="settings.seekUseTemplate"]');

      const applyDependencies = () => {
        // First apply parent->child visibility
        for (const [parent, children] of Object.entries(dependencyMap)) {
          const parentEl = content.querySelector(`[name="settings.${parent}"]`);
          const active = !!parentEl?.checked;
          for (const child of children) {
            // Seek template special handling below
            if (parent.startsWith('limitSeekRange') && seekTemplateToggle?.checked) {
              toggleSettingVisibility(child, false);
            } else {
              toggleSettingVisibility(child, active);
            }
          }
        }
        // Seek template case: hide limit toggles and distance inputs when template used
        const templateOn = !!seekTemplateToggle?.checked;
        if (templateOn) {
          toggleSettingVisibility('limitSeekRangeInCombat', false);
          toggleSettingVisibility('limitSeekRangeOutOfCombat', false);
          toggleSettingVisibility('customSeekDistance', false);
          toggleSettingVisibility('customSeekDistanceOutOfCombat', false);
        } else {
          // Ensure limit toggles visible
          toggleSettingVisibility('limitSeekRangeInCombat', true);
          toggleSettingVisibility('limitSeekRangeOutOfCombat', true);
          // Distance inputs re-evaluated by parent dependency pass above
        }
      };

      // Bind listeners for all parents in dependencyMap plus seek template
      const parentKeys = new Set([...Object.keys(dependencyMap), 'seekUseTemplate']);
      parentKeys.forEach((key) => {
        const el = content.querySelector(`[name="settings.${key}"]`);
        if (el) el.addEventListener('change', applyDependencies);
      });
      applyDependencies();

      // Hide deprecated auto-cover coverage settings entirely
      [
        'autoCoverCoverageStandardPct',
        'autoCoverCoverageGreaterPct',
        'autoCoverRespectIgnoreFlag',
      ].forEach((k) => toggleSettingVisibility(k, false));
    } catch { }
    return content;
  }

  static async _onSubmit(event, _button) {
    event;
    _button; // mark as used to satisfy linter
    const app = currentVisionerSettingsApp || this;
    try {
      const formEl = app.element.querySelector('form.pf2e-visioner-settings');
      if (!formEl) return app.close();
      // Capture any unsaved edits from the currently visible group before reading form data
      try {
        app._capturePendingChanges();
      } catch { }
      const fd = new FormData(formEl);
      const rawMap = Object.fromEntries(fd.entries());
      // Merge previously edited values from other tabs
      if (app?._pendingChanges) {
        for (const [name, value] of Object.entries(app._pendingChanges)) {
          if (!(name in rawMap)) rawMap[name] = value;
        }
      }
      const allKeys = allGroupedKeys();
      for (const key of allKeys) {
        const cfg = DEFAULT_SETTINGS[key];
        if (!cfg) continue;
        const formKey = `settings.${key}`;
        const raw = rawMap[formKey];
        // If the key wasn't present in the merged form+pending map, don't touch it
        if (raw === undefined) continue;
        const saved = game.settings.get(MODULE_ID, key);
        let value;
        if (cfg.type === Boolean) value = raw === 'on' || raw === 'true' || raw === true;
        else if (cfg.type === Number) value = raw != null && raw !== '' ? Number(raw) : saved;
        else value = raw != null ? raw : saved;
        if (value !== saved) await game.settings.set(MODULE_ID, key, value);
      }
      // Reset pending after successful save
      try {
        app._pendingChanges = {};
      } catch { }
      try {
        await app.close();
      } catch { }
    } catch (e) {
      e;
      /* noop */ try {
        await app.close();
      } catch { }
    }
  }

  static _onSwitchGroup(_event, button) {
    try {
      const key = button?.dataset?.key;
      if (!key) return;
      const app = currentVisionerSettingsApp;
      if (!app) return;
      // Preserve edits from the current group before switching
      try {
        app._capturePendingChanges();
      } catch { }
      app.activeGroupKey = key;
      app.render({ force: true });
    } catch { }
  }
}

// Instance helpers
VisionerSettingsForm.prototype._capturePendingChanges = function _capturePendingChanges() {
  try {
    const form = this.element?.querySelector?.('form.pf2e-visioner-settings');
    if (!form) return;
    const inputs = form.querySelectorAll('[name^="settings."]');
    inputs.forEach((el) => {
      const name = el.name;
      if (!name) return;
      if (el.type === 'checkbox') this._pendingChanges[name] = !!el.checked;
      else this._pendingChanges[name] = el.value;
    });
  } catch { }
};

/**
 * Register all module settings
 */
export function registerSettings() {
  try {
    // Register each setting from the configuration
    Object.entries(DEFAULT_SETTINGS).forEach(([key, config]) => {
      const settingConfig = { ...config };
      // Hide grouped keys from the default module settings sheet; they will
      // be displayed inside our custom grouped settings menu instead.
      if (isGroupedKey(key)) settingConfig.config = false;

      // Add onChange handler for settings that require restart
      if (key === 'enableHoverTooltips') {
        // Live-apply without world reload
        settingConfig.onChange = async (value) => {
          try {
            const { initializeHoverTooltips, cleanupHoverTooltips } = await import(
              './services/HoverTooltips.js'
            );
            if (value) initializeHoverTooltips();
            else cleanupHoverTooltips();
          } catch { }
        };
      } else if (key === 'allowPlayerTooltips') {
        settingConfig.onChange = () => { };
      } else if (key === 'useHudButton' || key === 'enableHoverTooltips') {
        settingConfig.onChange = () => {
          SettingsConfig.reloadConfirm({
            world: true,
          });
        };
      } else if (key === 'ignoreAllies') {
        settingConfig.onChange = () => { };
      } else if (key === 'defaultEncounterFilter') {
        settingConfig.onChange = () => { };
      } else if (key === 'seekUseTemplate') {
        // No reload needed: panel logic reads this setting at runtime
        settingConfig.onChange = () => { };
      } else if (key === 'limitSeekRangeInCombat') {
        // No reload needed: seek distance is read at runtime
        settingConfig.onChange = () => { };
      } else if (key === 'limitSeekRangeOutOfCombat') {
        // No reload needed: seek distance is read at runtime
        settingConfig.onChange = () => { };
      } else if (key === 'customSeekDistance') {
        // No reload needed: seek distance is read at runtime
        settingConfig.onChange = () => { };
      } else if (key === 'customSeekDistanceOutOfCombat') {
        // No reload needed: seek distance is read at runtime
        settingConfig.onChange = () => { };
      } else if (
        key === 'autoCover' ||
        key === 'autoCoverTokenIntersectionMode' ||
        key === 'autoCoverCoverageStandardPct' ||
        key === 'autoCoverCoverageGreaterPct' ||
        key === 'autoCoverIgnoreUndetected' ||
        key === 'autoCoverIgnoreDead' ||
        key === 'autoCoverIgnoreAllies' ||
        key === 'autoCoverRespectIgnoreFlag' ||
        key === 'autoCoverAllowProneBlockers'
      ) {
        // No reload needed: auto-cover is read at runtime
        settingConfig.onChange = () => { };
      } else if (key === 'blockPlayerTargetTooltips') {
        // No reload: will take effect on next hover; ensure initialized when allowed
        settingConfig.onChange = async () => {
          try {
            const { initializeHoverTooltips } = await import('./services/HoverTooltips.js');
            if (
              game.settings.get(MODULE_ID, 'enableHoverTooltips') &&
              game.settings.get(MODULE_ID, 'allowPlayerTooltips')
            )
              initializeHoverTooltips();
          } catch { }
        };
      } else if (key === 'showVisionerSceneTools') {
        // Rebuild scene controls to add/remove Visioner tools immediately
        settingConfig.onChange = () => {
          try {
            ui.controls.render();
            SettingsConfig.reloadConfirm({
              world: true,
            });
          } catch { }
        };
      } else if (key === 'hiddenWallsEnabled') {
        // Refresh wall visuals when toggled
        settingConfig.onChange = async () => {
          try {
            const { updateWallVisuals } = await import('./services/visual-effects.js');
            await updateWallVisuals();
          } catch { }
        };
      } else if (key === 'tooltipFontSize') {
        settingConfig.onChange = (value) => {
          // Map preset to sizes
          const presets = {
            tiny: { font: 12, icon: 10, border: 2 },
            small: { font: 14, icon: 12, border: 2 },
            medium: { font: 16, icon: 16, border: 3 },
            large: { font: 18, icon: 20, border: 4 },
            xlarge: { font: 20, icon: 24, border: 5 },
          };
          const preset = presets[value] ?? presets.medium;
          document.documentElement.style.setProperty(
            '--pf2e-visioner-tooltip-font-size',
            `${preset.font}px`,
          );
          document.documentElement.style.setProperty(
            '--pf2e-visioner-tooltip-icon-size',
            `${preset.icon}px`,
          );
          document.documentElement.style.setProperty(
            '--pf2e-visioner-tooltip-badge-border',
            `${preset.border}px`,
          );
        };
      } else if (key === 'colorblindMode') {
        settingConfig.onChange = (value) => {
          // Apply colorblind mode CSS class to the body
          document.body.classList.remove(
            'pf2e-visioner-colorblind-protanopia',
            'pf2e-visioner-colorblind-deuteranopia',
            'pf2e-visioner-colorblind-tritanopia',
            'pf2e-visioner-colorblind-achromatopsia',
          );

          if (value !== 'none') {
            document.body.classList.add(`pf2e-visioner-colorblind-${value}`);
          }

          // Apply to any existing .pf2e-visioner containers to ensure immediate effect
          const containers = document.querySelectorAll('.pf2e-visioner');
          containers.forEach((container) => {
            container.classList.remove(
              'pf2e-visioner-colorblind-protanopia',
              'pf2e-visioner-colorblind-deuteranopia',
              'pf2e-visioner-colorblind-tritanopia',
              'pf2e-visioner-colorblind-achromatopsia',
            );

            if (value !== 'none') {
              container.classList.add(`pf2e-visioner-colorblind-${value}`);
            }
          });

          // Re-inject chat automation styles to apply new colorblind colors
          try {
            reinjectChatAutomationStyles();
            console.log(
              `[PF2E Visioner] Re-injected chat automation styles for colorblind mode: ${value}`,
            );
          } catch (error) {
            console.warn(`[PF2E Visioner] Failed to re-inject chat automation styles:`, error);
          }

          // Force immediate visual update by triggering a re-render
          setTimeout(() => {
            const tokenManager = document.querySelector('.pf2e-visioner.token-visibility-manager');
            if (tokenManager) {
              // Force a style recalculation
              tokenManager.style.display = 'none';
              tokenManager.offsetHeight; // Trigger reflow
              tokenManager.style.display = '';
            }
          }, 10);
        };
      } else if (key === 'avsChangesIndicatorSize') {
        // Live-apply by refreshing indicator styles
        settingConfig.onChange = async () => {
          try {
            const { default: indicator } = await import('./ui/OverrideValidationIndicator.js');
            indicator.refreshStyles?.();
          } catch {
            /* noop */
          }
        };
      } else if (key === 'keybindingOpensTMInTargetMode') {
        // No reload needed: swap mode is read at runtime
        settingConfig.onChange = () => { };
      } else if (key === 'autoVisibilityEnabled') {
        // Handle auto-visibility system enable/disable
        settingConfig.onChange = async (value) => {
          try {
            const { autoVisibilitySystem } = await import('./visibility/auto-visibility/index.js');
            if (value) {
              autoVisibilitySystem.enable();
            } else {
              autoVisibilitySystem.disable();
            }
          } catch (error) {
            console.error('PF2E Visioner: Error toggling auto-visibility system:', error);
          }
        };
      } else if (key === 'dimLightingThreshold') {
        // Recalculate AVS when dim lighting threshold changes
        settingConfig.onChange = async () => {
          try {
            const { autoVisibility } = await import('./api.js');
            if (game.settings.get(MODULE_ID, 'autoVisibilityEnabled')) {
              autoVisibility.recalculateAll(true); // Force recalculation
            }
          } catch (error) {
            console.warn('PF2E Visioner: Failed to trigger AVS recalculation on dim threshold change:', error);
          }
        };
      } else if (key === 'hiddenWallIndicatorWidth') {
        // Refresh wall visuals when indicator width changes
        settingConfig.onChange = async () => {
          try {
            const { updateWallVisuals } = await import('./services/visual-effects.js');
            await updateWallVisuals();
          } catch (error) {
            console.warn('PF2E Visioner: Failed to update wall visuals on indicator width change:', error);
          }
        };
      }

      try {
        game.settings.register(MODULE_ID, key, settingConfig);
      } catch (settingError) {
        throw settingError;
      }
    });

    // Register a single grouped settings menu entry
    try {
      game.settings.registerMenu(MODULE_ID, 'groupedSettings', {
        name: 'PF2E Visioner Settings',
        label: 'Open',
        hint: 'Grouped settings by category',
        icon: 'fas fa-sliders-h',
        type: VisionerSettingsForm,
        restricted: true,
      });
    } catch { }
  } catch (error) {
    throw error;
  }
}

/**
 * Register keybindings
 */
export function registerKeybindings() {
  Object.entries(KEYBINDINGS).forEach(([key, config]) => {
    const keybindingConfig = { ...config };

    // Add appropriate handler
    switch (key) {
      case 'openTokenManager':
        keybindingConfig.onDown = async () => {
          const mode = game.settings.get(MODULE_ID, 'keybindingOpensTMInTargetMode')
            ? 'target'
            : 'observer';
          const { api } = await import('./api.js');
          await api.openTokenManager(null, { mode });
        };
        break;
      case 'openQuickPanel':
        keybindingConfig.onDown = async () => {
          try {
            const { VisionerQuickPanel } = await import('./managers/QuickPanel.js');
            const existing =
              VisionerQuickPanel.current ||
              Object.values(ui.windows || {}).find((w) => w instanceof VisionerQuickPanel) ||
              null;
            // Toggle: if open, close it
            if (existing) {
              try {
                await existing.close();
              } catch { }
              return;
            }

            // If minimized floater exists, restore at its position
            const floater = document.getElementById('pf2e-visioner-floating-qp');
            if (floater) {
              const left = parseInt(floater.style.left || '0', 10) || 120;
              const top = parseInt(floater.style.top || '0', 10) || 120;
              const qp = new VisionerQuickPanel();
              qp.position = { ...(qp.position || {}), left, top };
              qp.render(true);
              try {
                qp._removeFloatingButton();
              } catch { }
              return;
            }

            // Otherwise open a new one
            const qp = new VisionerQuickPanel();
            qp.render(true);
          } catch { }
        };
        break;
      case 'openVisibilityManager':
        keybindingConfig.onDown = async () => {
          const { api } = await import('./api.js');
          await api.openVisibilityManager();
        };
        break;
      case 'toggleObserverMode':
        keybindingConfig.onDown = async () => {
          const { setTooltipMode } = await import('./services/HoverTooltips.js');
          setTooltipMode('observer');
        };
        keybindingConfig.onUp = async () => {
          const { setTooltipMode } = await import('./services/HoverTooltips.js');
          setTooltipMode('target');
        };
        break;
      case 'showAutoCoverOverlay':
        keybindingConfig.onDown = async () => {
          try {
            const { HoverTooltips, showAutoCoverComputedOverlay, hideAutoCoverComputedOverlay } =
              await import('./services/HoverTooltips.js');
            // Decide source token: hovered or first controlled
            let token = HoverTooltips.currentHoveredToken;
            if (!token) token = canvas.tokens.controlled?.[0] || null;
            if (!token) return;
            // Render fresh auto-cover computation overlay (cover-only)
            hideAutoCoverComputedOverlay();
            showAutoCoverComputedOverlay(token);
          } catch { }
        };
        keybindingConfig.onUp = async () => {
          try {
            const { hideAutoCoverComputedOverlay } = await import('./services/HoverTooltips.js');
            hideAutoCoverComputedOverlay();
          } catch { }
        };
        break;
      case 'openWallManager':
        keybindingConfig.onDown = async () => {
          const { VisionerWallManager } = await import('./managers/wall-manager/WallManager.js');
          // If already open, bring to front; else open new
          const existing =
            Object.values(ui.windows || {}).find((w) => w instanceof VisionerWallManager) || null;
          if (existing) {
            existing.bringToFront();
          } else {
            const wm = new VisionerWallManager();
            wm.render(true);
          }
        };
        break;
      // Add other keybindings as needed
    }

    game.keybindings.register(MODULE_ID, key, keybindingConfig);
  });
}
