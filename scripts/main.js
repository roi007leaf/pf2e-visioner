// Import settings
import { registerKeybindings, registerSettings } from "./settings.js";

// Import effects coordinator
import { initializeMechanicalEffects } from "./effects-coordinator.js";

// Import detection wrapper
import { initializeDetectionWrapper } from "./detection-wrapper.js";

// Import hooks
import { registerHooks } from "./hooks.js";

// Import rule elements
import { initializeRuleElements } from "./rule-elements/index.js";

// Initialize the module
Hooks.once("init", async () => {
  try {
    console.log('PF2E Visioner | Initializing module');
    
    // Register settings and keybindings
    registerSettings();
    registerKeybindings();
    
    // Register hooks
    registerHooks();
    
    // Set up API
    const { api } = await import("./api.js");
    game.modules.get("pf2e-visioner").api = api;
    
    // Initialize effects
    initializeMechanicalEffects();
    
    // Initialize detection wrapper
    initializeDetectionWrapper();
    
    // Initialize rule elements
    initializeRuleElements();
    
    console.log('PF2E Visioner | Initialization complete');
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