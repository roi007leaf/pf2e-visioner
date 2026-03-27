// Apply helpers for chat automation actions

// constants import not required in this module after helper removal
import { ConsequencesActionHandler } from './actions/ConsequencesAction.js';
import { DiversionActionHandler } from './actions/DiversionAction.js';
import { HideActionHandler } from './actions/HideAction.js';
import { PointOutActionHandler } from './actions/PointOutAction.js';
import { SeekActionHandler } from './actions/SeekAction.js';
import { SneakActionHandler } from './actions/SneakAction.js';
import { TakeCoverActionHandler } from './actions/TakeCoverAction.js';

function resolveSneakingToken(handler, actionData) {
  // Prioritize the token ID stored when "Start Sneak" was clicked — it's the most reliable
  // source since actionData.actor can resolve to the wrong unlinked token
  try {
    const message = actionData?.message || game.messages?.get(actionData?.messageId);
    const tokenId = message?.flags?.['pf2e-visioner']?.sneakStartPosition?.tokenId;
    if (tokenId) {
      const token = canvas?.tokens?.placeables?.find((t) => t.id === tokenId);
      if (token) return token;
    }
  } catch { }
  try {
    const token = handler._getSneakingToken(actionData);
    if (token) return token;
  } catch { }
  return null;
}

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
  let appliedCount = 0;
  try {
    const dualModule = await import('./DualSystemResultApplication.js');
    const dualSystemApplication = dualModule.default;

    const handler = new SneakActionHandler();
    let allOutcomes = await handler.getCachedOutcomes(actionData) || [];
    try {
      allOutcomes = handler.applyOverrides(actionData, allOutcomes) || allOutcomes;
    } catch { }

    if (allOutcomes.length > 0) {
      let outcomesToApply = allOutcomes;
      if (actionData.overrides && Object.keys(actionData.overrides).length > 0) {
        const overrideTokenIds = Object.keys(actionData.overrides).filter(key => key !== '__wall__');
        outcomesToApply = allOutcomes.filter(outcome =>
          overrideTokenIds.includes(outcome.token?.id)
        );
      }

      if (outcomesToApply.length > 0) {
        const sneakResults = outcomesToApply.map(outcome => ({
          token: outcome.token,
          actor: actionData.actor,
          newVisibility: outcome.overrideState || outcome.newVisibility,
          oldVisibility: outcome.oldVisibility || outcome.currentVisibility,
          overrideState: outcome.overrideState,
          timedOverride: outcome.timedOverride
        }));

        const result = await dualSystemApplication.applySneakResults(sneakResults, {
          direction: 'observer_to_target',
          skipEphemeralUpdate: false,
          skipCleanup: false,
          setAVSOverrides: true
        });

        if (result.success) {
          handler.updateButtonToRevert(button);
          appliedCount = outcomesToApply.length;
        }
      }
    }
  } catch (error) {
    console.error('PF2E Visioner | Error in applyNowSneak:', error);
  }

  await cleanupSneakState(actionData);
  return appliedCount;
}

async function cleanupSneakState(actionData) {
  try {
    const handler = new SneakActionHandler();
    const sneakingToken = resolveSneakingToken(handler, actionData);
    if (!sneakingToken) return;

    await sneakingToken.document.unsetFlag('pf2e-visioner', 'sneak-active');

    try {
      const actor = sneakingToken.actor;
      if (actor) {
        const sneakEffect = actor.itemTypes?.effect?.find(
          (e) => e.flags?.['pf2e-visioner']?.sneakingEffect === true
        ) ?? actor.itemTypes?.effect?.find(
          (e) => e.name === 'Sneaking'
        );
        if (sneakEffect) {
          await actor.deleteEmbeddedDocuments('Item', [sneakEffect.id]);
        }
      }
    } catch { }

    const { SneakSpeedService } = await import('./SneakSpeedService.js');
    await SneakSpeedService.restoreSneakWalkSpeed(sneakingToken);
  } catch { }
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
