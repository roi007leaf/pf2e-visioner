/**
 * Auto-cover system index
 * Central file that exports all auto-cover system components
 */

import { AutoCoverHooks } from './AutoCoverHooks.js';
import autoCoverSystem from './AutoCoverSystem.js';
import { CoverDetector } from './CoverDetector.js';
import { CoverStateManager } from './CoverStateManager.js';
import { TemplateManager } from './TemplateManager.js';

// Make sure the global namespace exists
if (!window.pf2eVisioner) {
  window.pf2eVisioner = {};
}

// Make sure the systems namespace exists
if (!window.pf2eVisioner.systems) {
  window.pf2eVisioner.systems = {};
}

// Store the auto-cover system in the global namespace
window.pf2eVisioner.systems.autoCover = autoCoverSystem;

// Initialize the system when imported
const initialize = () => {
  // Register hooks when this module is loaded

  // Now that the system is in the global namespace, register hooks
  AutoCoverHooks.registerHooks();

  // Return the system for API access
  return autoCoverSystem;
};

// Export API
export const autocover = initialize();

// Export classes for reference
export { AutoCoverHooks, CoverDetector, CoverStateManager, TemplateManager };
