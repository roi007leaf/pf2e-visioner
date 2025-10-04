/**
 * Register region behaviors using multiple approaches to ensure it works
 */

import { ConcealmentRegionBehavior } from './ConcealmentRegionBehavior.js';
import { VisibilityRegionBehavior } from './VisibilityRegionBehavior.js';

import { MODULE_ID } from '../constants.js';

const visibilityBehaviorKey = `${MODULE_ID}.Pf2eVisionerVisibility`;
const concealmentBehaviorKey = `${MODULE_ID}.Pf2eVisionerConcealment`;

function registerBehavior() {
  if (typeof CONFIG !== 'undefined' && CONFIG.RegionBehavior) {
    CONFIG.RegionBehavior.dataModels[visibilityBehaviorKey] = VisibilityRegionBehavior;
    CONFIG.RegionBehavior.typeLabels[visibilityBehaviorKey] = 'PF2E_VISIONER.REGION_BEHAVIOR.TYPES.VISIBILITY.label';
    CONFIG.RegionBehavior.typeIcons[visibilityBehaviorKey] = 'fa-solid fa-eye';

    CONFIG.RegionBehavior.dataModels[concealmentBehaviorKey] = ConcealmentRegionBehavior;
    CONFIG.RegionBehavior.typeLabels[concealmentBehaviorKey] = 'PF2E_VISIONER.REGION_BEHAVIOR.TYPES.CONCEALMENT.label';
    CONFIG.RegionBehavior.typeIcons[concealmentBehaviorKey] = 'fa-solid fa-cloud';
  }
}

// Register labels after translations are loaded
if (typeof Hooks !== 'undefined' && Hooks.once) {
  Hooks.once('ready', () => registerBehavior());
} else {
  // Fallback for environments where Hooks isn't available yet
  registerBehavior();
}
