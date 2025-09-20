// Apply helpers for chat automation actions

// constants import not required in this module after helper removal
import { ConsequencesActionHandler } from './actions/consequences-action.js';
import { DiversionActionHandler } from './actions/diversion-action.js';
import { HideActionHandler } from './actions/hide-action.js';
import { PointOutActionHandler } from './actions/point-out-action.js';
import { SeekActionHandler } from './actions/seek-action.js';
import { SneakActionHandler } from './actions/sneak-action.js';
import { TakeCoverActionHandler } from './actions/take-cover-action.js';

export async function applyNowSeek(actionData, button) {
  const handler = new SeekActionHandler();
  return handler.apply(actionData, button);
}

export async function applyNowPointOut(actionData, button) {
  const handler = new PointOutActionHandler();
  return handler.apply(actionData, button);
}

export async function applyNowHide(actionData, button) {
  const handler = new HideActionHandler();
  return handler.apply(actionData, button);
}

export async function applyNowSneak(actionData, button) {
  try {
    // For sneak actions, use the dual system application singleton instead of the old handler
    // The module exports a default singleton instance
    const dualModule = await import('./dual-system-result-application.js');
    const dualSystemApplication = dualModule.default;
    
    // Get the cached outcomes from the action handler
    const handler = new SneakActionHandler();
    let allOutcomes = await handler.getCachedOutcomes(actionData) || [];
    // Honor UI overrides (from dialog icon selections) by applying them onto the freshly computed outcomes
    try {
      allOutcomes = handler.applyOverrides(actionData, allOutcomes) || allOutcomes;
    } catch {}
    
    if (allOutcomes.length === 0) {
      console.warn('PF2E Visioner | No cached outcomes found for sneak application');
      // Fallback to original handler
      return handler.apply(actionData, button);
    }
    
    // If overrides are specified, filter to only apply those specific tokens
    let outcomesToApply = allOutcomes;
    if (actionData.overrides && Object.keys(actionData.overrides).length > 0) {
      const overrideTokenIds = Object.keys(actionData.overrides).filter(key => key !== '__wall__');
      outcomesToApply = allOutcomes.filter(outcome => 
        overrideTokenIds.includes(outcome.token?.id)
      );
    }
    
    if (outcomesToApply.length === 0) {
      console.warn('PF2E Visioner | No outcomes found for specified token overrides');
      return 0;
    }
    
    
    // Convert outcomes to the format expected by dual system
    const sneakResults = outcomesToApply.map(outcome => ({
      token: outcome.token,
      actor: actionData.actor,
      newVisibility: outcome.overrideState || outcome.newVisibility,
      oldVisibility: outcome.oldVisibility || outcome.currentVisibility,
      overrideState: outcome.overrideState
    }));
    
    // Apply results with AVS overrides enabled
    const result = await dualSystemApplication.applySneakResults(sneakResults, {
      direction: 'observer_to_target',
      skipEphemeralUpdate: false,
      skipCleanup: false,
      setAVSOverrides: true
    });
    
    if (result.success) {
      handler.updateButtonToRevert(button);
      
      // Only clear sneak-active flag if applying to all tokens (no overrides)
      if (!actionData.overrides || Object.keys(actionData.overrides).length === 0) {
        const sneakingToken = handler._getSneakingToken(actionData);
        if (sneakingToken) {
          await sneakingToken.document.unsetFlag('pf2e-visioner', 'sneak-active');
        }
      }
      
      const appliedCount = outcomesToApply.length;
      const message = appliedCount === 1 
        ? `Sneak change applied to ${outcomesToApply[0].token?.name || 'token'}`
        : `Sneak changes applied to ${appliedCount} tokens`;
      ui.notifications.info(message);
      return appliedCount;
    } else {
      console.error('PF2E Visioner | Dual system application failed:', result.errors);
      ui.notifications.error(`Failed to apply sneak changes: ${result.errors.join('; ')}`);
      return 0;
    }
  } catch (error) {
    console.error('PF2E Visioner | Error in applyNowSneak dual system application:', error);
    // Fallback to original handler
    const handler = new SneakActionHandler();
    return handler.apply(actionData, button);
  }
}

export async function applyNowDiversion(actionData, button) {
  const handler = new DiversionActionHandler();
  return handler.apply(actionData, button);
}

export async function applyNowConsequences(actionData, button) {
  const handler = new ConsequencesActionHandler();
  return handler.apply(actionData, button);
}

export async function applyNowTakeCover(actionData, button) {
  const handler = new TakeCoverActionHandler();
  return handler.apply(actionData, button);
}



// (Removed unused helper functions: visibility/cover icon and label getters)
