// Import settings
import { registerKeybindings, registerSettings } from './settings.js';

// Import detection wrapper
import { initializeDetectionWrapper } from './services/detection-wrapper.js';

// Import hooks
import { registerHooks } from './hooks.js';

// Import dialog scroll fix
import { initializeDialogScrollFix } from './services/dialog-scroll-fix.js';
// Import rule elements
import { initializeRuleElements } from './rule-elements/index.js';
// Import cover visualization
import { initCoverVisualization } from './cover/cover-visualization.js';
// Import region behavior registration (executes immediately)
import './regions/register.js';

// Function to update colorblind mode
function updateColorblindMode() {
  try {
    // Check if the setting exists before trying to access it
    if (!game.settings.settings.has('pf2e-visioner.colorblindMode')) {
      return;
    }

    // Get current colorblind mode setting
    const colorblindMode = game.settings.get('pf2e-visioner', 'colorblindMode');

    // Remove any existing colorblind classes from body
    document.body.classList.remove(
      'pf2e-visioner-colorblind-protanopia',
      'pf2e-visioner-colorblind-deuteranopia',
      'pf2e-visioner-colorblind-tritanopia',
      'pf2e-visioner-colorblind-achromatopsia',
    );

    // Apply current colorblind mode to body if set
    if (colorblindMode !== 'none') {
      document.body.classList.add(`pf2e-visioner-colorblind-${colorblindMode}`);
    }

    // Apply to any existing .pf2e-visioner containers
    const containers = document.querySelectorAll('.pf2e-visioner');

    containers.forEach((container) => {
      container.classList.remove(
        'pf2e-visioner-colorblind-protanopia',
        'pf2e-visioner-colorblind-deuteranopia',
        'pf2e-visioner-colorblind-tritanopia',
        'pf2e-visioner-colorblind-achromatopsia',
      );

      if (colorblindMode !== 'none') {
        container.classList.add(`pf2e-visioner-colorblind-${colorblindMode}`);
      }
    });
  } catch (error) {
    console.error('PF2E Visioner: Failed to update colorblind mode:', error);
  }
}

// Initialize the module
Hooks.once('init', async () => {
  try {
    // Register Handlebars helper for default value
    Handlebars.registerHelper('default', function (value, defaultValue) {
      return value !== undefined && value !== null ? value : defaultValue;
    });

    // Register Handlebars helper for capitalizing strings
    Handlebars.registerHelper('capitalize', function (str) {
      if (!str) return '';
      return str.charAt(0).toUpperCase() + str.slice(1);
    });

    // Register Handlebars helper for equality comparison
    Handlebars.registerHelper('eq', function (a, b) {
      return a === b;
    });

    // Preload partials for token manager
    await foundry.applications.handlebars.loadTemplates({
      'pf2e-visioner.observer-info': 'modules/pf2e-visioner/templates/observer-info.hbs',
      'pf2e-visioner.visibility-tab': 'modules/pf2e-visioner/templates/visibility-tab.hbs',
      'pf2e-visioner.cover-tab': 'modules/pf2e-visioner/templates/cover-tab.hbs',
      'pf2e-visioner.action-buttons': 'modules/pf2e-visioner/templates/action-buttons.hbs',
      'pf2e-visioner.visibility-table': 'modules/pf2e-visioner/templates/visibility-table.hbs',
      'pf2e-visioner.cover-table': 'modules/pf2e-visioner/templates/cover-table.hbs',
      'pf2e-visioner.table-section': 'modules/pf2e-visioner/templates/table-section.hbs',
      'pf2e-visioner.bulk-override': 'modules/pf2e-visioner/templates/partials/bulk-override.hbs',
    });

    // Register settings and keybindings
    registerSettings();
    registerKeybindings();

    // Register hooks
    registerHooks();

    // Set up API
    const { api } = await import('./api.js');
    game.modules.get('pf2e-visioner').api = api;

    // Create global API for compatibility with other modules
    window.visioneerApi = {
      getVisibility: api.getVisibility,
      // Add other API functions that may be needed for compatibility
    };

    // Initialize detection wrapper
    initializeDetectionWrapper();

    // Initialize dialog scroll fix
    initializeDialogScrollFix();

    // Initialize rule elements
    initializeRuleElements();

    // Initialize Auto-Visibility System (OPTIMIZED - Zero Delays)
    const { autoVisibilitySystem } = await import('./visibility/auto-visibility/index.js');
    await autoVisibilitySystem.initialize();

    // Apply colorblind mode after settings are registered
    updateColorblindMode();
  } catch (error) {
    console.error('PF2E Visioner: Initialization failed:', error.message);
    console.error('PF2E Visioner: Full error details:', error);
    console.error('PF2E Visioner: Stack trace:', error.stack);

    // Try to show a user notification if possible
    if (typeof ui !== 'undefined' && ui.notifications) {
      ui.notifications.error(`PF2E Visioner failed to initialize: ${error.message}`);
    }
  }
});

// Apply colorblind mode when canvas is ready (most UI elements are rendered by this point)
Hooks.once('canvasReady', () => {
  updateColorblindMode();
});

// Initialize colorblind mode and cleanup effects on ready
Hooks.once('ready', async () => {
  try {
    // Apply initial colorblind mode again to ensure it's set
    updateColorblindMode();

    // Clean up any lingering cover effects from previous sessions
    // Run this on a single authoritative client (GM only) to avoid race conditions
    if (game.user.isGM) {
      try {
        // Register auto-cover detection (GM only to avoid duplicates)
        const { cleanupAllCoverEffects } = await import('./cover/ephemeral.js');
        await cleanupAllCoverEffects();

        // Clean up old party token states (older than 24 hours)
        const { cleanupOldPartyTokenStates } = await import('./services/party-token-state.js');
        await cleanupOldPartyTokenStates();
      } catch (error) {
        console.error('PF2E Visioner: Failed to clean up cover effects:', error);
      }
    }

    // Initialize cover visualization system for all users
    try {
      initCoverVisualization();
    } catch (error) {
      console.error('PF2E Visioner: Failed to initialize cover visualization:', error);
    }
  } catch (error) {
    console.error('PF2E Visioner: Failed to initialize colorblind mode:', error);
  }
});

// Hook to ensure colorblind mode is applied when applications are rendered
Hooks.on('renderApplication', (app, html) => {
  // Check if this is a PF2E Visioner application
  if (html && html[0] && html[0].classList && html[0].classList.contains('pf2e-visioner')) {
    // Apply colorblind mode to this specific application
    const colorblindMode = game.settings.get('pf2e-visioner', 'colorblindMode');

    if (colorblindMode !== 'none') {
      html[0].classList.remove(
        'pf2e-visioner-colorblind-protanopia',
        'pf2e-visioner-colorblind-deuteranopia',
        'pf2e-visioner-colorblind-tritanopia',
        'pf2e-visioner-colorblind-achromatopsia',
      );
      html[0].classList.add(`pf2e-visioner-colorblind-${colorblindMode}`);
    }
  }
});

// Hook to ensure colorblind mode is applied when chat messages are rendered
Hooks.on('renderChatMessageHTML', (message, html) => {
  // Apply colorblind mode to chat messages that contain PF2E Visioner automation panels
  // Ensure html is a jQuery object for FoundryVTT v13+ compatibility
  const $html = $(html);
  const automationPanels = $html.find('.pf2e-visioner-automation-panel');
  if (automationPanels.length > 0) {
    const colorblindMode = game.settings.get('pf2e-visioner', 'colorblindMode');
    if (colorblindMode !== 'none') {
      automationPanels.each((index, panel) => {
        panel.classList.remove(
          'pf2e-visioner-colorblind-protanopia',
          'pf2e-visioner-colorblind-deuteranopia',
          'pf2e-visioner-colorblind-tritanopia',
          'pf2e-visioner-colorblind-achromatopsia',
        );
        panel.classList.add(`pf2e-visioner-colorblind-${colorblindMode}`);
      });
    }
  }
});

// Hook to ensure colorblind mode is applied when any DOM element is added
Hooks.on('renderSidebarTab', (app, html) => {
  // Apply colorblind mode to any PF2E Visioner elements in sidebar tabs
  const visionerElements = html.find('.pf2e-visioner');
  if (visionerElements.length > 0) {
    const colorblindMode = game.settings.get('pf2e-visioner', 'colorblindMode');
    if (colorblindMode !== 'none') {
      visionerElements.each((index, element) => {
        element.classList.remove(
          'pf2e-visioner-colorblind-protanopia',
          'pf2e-visioner-colorblind-deuteranopia',
          'pf2e-visioner-colorblind-tritanopia',
          'pf2e-visioner-colorblind-achromatopsia',
        );
        element.classList.add(`pf2e-visioner-colorblind-${colorblindMode}`);
      });
    }
  }
});

// Hook to ensure colorblind mode is applied to the quick panel specifically
Hooks.on('renderVisionerQuickPanel', (app, html) => {
  // Apply colorblind mode to the quick panel
  const colorblindMode = game.settings.get('pf2e-visioner', 'colorblindMode');
  if (colorblindMode !== 'none') {
    html[0].classList.remove(
      'pf2e-visioner-colorblind-protanopia',
      'pf2e-visioner-colorblind-deuteranopia',
      'pf2e-visioner-colorblind-tritanopia',
      'pf2e-visioner-colorblind-achromatopsia',
    );
    html[0].classList.add(`pf2e-visioner-colorblind-${colorblindMode}`);
  }
});
