// Revert helpers for chat automation actions

import { ConsequencesActionHandler } from './actions/ConsequencesAction.js';
import { DiversionActionHandler } from './actions/DiversionAction.js';
import { HideActionHandler } from './actions/HideAction.js';
import { PointOutActionHandler } from './actions/PointOutAction.js';
import { SeekActionHandler } from './actions/SeekAction.js';
import { SneakActionHandler } from './actions/SneakAction.js';
import { TakeCoverActionHandler } from './actions/TakeCoverAction.js';
import { log } from './infra/notifications.js';

export async function revertNowSeek(actionData, button) {
  const handler = new SeekActionHandler();
  await handler.revert(actionData, button);
}

export async function revertNowPointOut(actionData, button) {
  const handler = new PointOutActionHandler();
  await handler.revert(actionData, button);
}

export async function revertNowHide(actionData, button) {
  const handler = new HideActionHandler();
  try {
    await handler.revert(actionData, button);
  } catch (e) {
    log.error(e);
  }
}

export async function revertNowSneak(actionData, button) {
  // Revert visibility states using the stored start states from message flags
  try {
    const message = actionData?.message || game.messages?.get(actionData?.messageId);
    const startStates = message?.flags?.['pf2e-visioner']?.sneakStartStates;
    const sneakingToken = _resolveSneakingTokenForRevert(null, actionData);

    if (startStates && sneakingToken) {
      const { applyVisibilityChanges } = await import('./infra/shared-utils.js');
      const changes = [];
      for (const [observerId, state] of Object.entries(startStates)) {
        const observer = canvas.tokens.placeables.find((t) => t.id === observerId);
        if (observer && state.visibility) {
          changes.push({
            observer,
            target: sneakingToken,
            newVisibility: state.visibility,
          });
        }
      }
      if (changes.length > 0) {
        const groups = {};
        for (const c of changes) {
          const id = c.observer.id;
          if (!groups[id]) groups[id] = { observer: c.observer, items: [] };
          groups[id].items.push({ target: c.target, newVisibility: c.newVisibility });
        }
        for (const group of Object.values(groups)) {
          try {
            await applyVisibilityChanges(group.observer, group.items, {
              direction: 'observer_to_target',
              source: 'sneak-revert',
              setAVSOverrides: false,
            });
          } catch { }
        }
        // Clear AVS pair overrides so AVS resumes control
        try {
          const api = game.modules.get('pf2e-visioner')?.api;
          if (api?.clearOverridesForToken) {
            await api.clearOverridesForToken(sneakingToken.id);
          }
        } catch { }
      }
      if (button) {
        try {
          button
            .html('<i class="fas fa-check-double"></i> Apply Changes')
            .attr('data-action', 'apply-now-sneak');
        } catch { }
      }
    } else {
      const handler = new SneakActionHandler();
      try { await handler.revert(actionData, button); } catch { }
    }
  } catch (e) {
    log.error(e);
  }

  // Always clean up sneak state
  try {
    const sneakingToken = _resolveSneakingTokenForRevert(null, actionData);
    if (sneakingToken) {
      await sneakingToken.document.unsetFlag('pf2e-visioner', 'sneak-active');
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
      const { SneakSpeedService } = await import('./SneakSpeedService.js');
      await SneakSpeedService.restoreSneakWalkSpeed(sneakingToken);
    }
  } catch (cleanupErr) {
    console.warn('PF2E Visioner | Failed sneak revert cleanup:', cleanupErr);
  }
}

function _resolveSneakingTokenForRevert(handler, actionData) {
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

export async function revertNowDiversion(actionData, button) {
  const handler = new DiversionActionHandler();
  try {
    await handler.revert(actionData, button);
  } catch (e) {
    log.error(e);
  }
}

export async function revertNowConsequences(actionData, button) {
  const handler = new ConsequencesActionHandler();
  try {
    await handler.revert(actionData, button);
  } catch (e) {
    log.error(e);
  }
}

export async function revertNowTakeCover(actionData, button) {
  const handler = new TakeCoverActionHandler();
  try {
    await handler.revert(actionData, button);
  } catch (e) {
    log.error(e);
  }
}
