/**
 * Combat-related hooks: reset encounter filter for open dialogs
 */

import { MODULE_ID } from '../constants.js';

export function registerCombatHooks() {
  Hooks.on('combatStart', onCombatStart);
  Hooks.on('combatEnd', onCombatEnd);
  Hooks.on('updateCombat', onUpdateCombat);
  Hooks.on('deleteCombat', onDeleteCombat);
}

function onCombatStart() {
  resetEncounterFiltersInDialogs();
  handleCombatStart();
}

function onCombatEnd(combat) {
  resetEncounterFiltersInDialogs();
  handleCombatEnd(combat);
}

function onUpdateCombat(combat, updateData) {
  if (Object.prototype.hasOwnProperty.call(updateData, 'started') && updateData.started === false) {
    handleCombatEnd(combat);
    resetEncounterFiltersInDialogs();
  }

  const turnChanged = Object.prototype.hasOwnProperty.call(updateData, 'turn') || Object.prototype.hasOwnProperty.call(updateData, 'round');
  if (turnChanged) {
    handleTurnAdvance(combat);
  }
}

function onDeleteCombat(combat) {
  resetEncounterFiltersInDialogs();
  handleCombatEnd(combat);
}

async function handleCombatStart() {
  try {
    const avsOnlyInCombat = game.settings.get(MODULE_ID, 'avsOnlyInCombat');
    if (!avsOnlyInCombat) return;
    if (!game.user.isGM) return;

    const autoVisibilityEnabled = game.settings.get(MODULE_ID, 'autoVisibilityEnabled');
    if (!autoVisibilityEnabled) return;

      try {
        const { autoVisibilitySystem } = await import('../visibility/auto-visibility/index.js');
        await autoVisibilitySystem.recalculateAllVisibility(true);
      } catch (error) {
        console.error('PF2E Visioner: Error recalculating visibility on combat start:', error);
      }
  } catch (error) {
    console.error('PF2E Visioner: Error setting up visibility recalculation on combat start:', error);
  }
}

async function handleCombatEnd(combat = null) {
  try {
    const avsOnlyInCombat = game.settings.get(MODULE_ID, 'avsOnlyInCombat');
    if (!avsOnlyInCombat) return;
    if (!game.user.isGM) return;

    const combatTracker = combat || game.combat;
    if (!combatTracker) return;

    const combatantTokens = new Set();
    for (const combatant of combatTracker.combatants) {
      if (combatant.tokenId) {
        combatantTokens.add(combatant.tokenId);
      }
    }

    let clearedCount = 0;

    for (const tokenId of combatantTokens) {
      const token = canvas.tokens.get(tokenId);
      if (!token?.actor) continue;

      try {
        const currentFlags = token.document.flags?.[MODULE_ID];
        if (!currentFlags) continue;

        if (currentFlags.visibility) {
          await token.document.unsetFlag(MODULE_ID, 'visibility');
        }

        if (currentFlags.detection) {
          await token.document.unsetFlag(MODULE_ID, 'detection');
        }

        try {
          const effects = token.actor.itemTypes.effect;
          const visibilityEffects = effects.filter(
            (e) =>
              e.flags?.[MODULE_ID]?.isEphemeralOffGuard ||
              e.flags?.[MODULE_ID]?.aggregateOffGuard,
          );

          if (visibilityEffects.length > 0) {
            const ids = visibilityEffects.map((e) => e.id).filter((id) => !!id);
            if (ids.length > 0) {
              await token.actor.deleteEmbeddedDocuments('Item', ids);
            }
          }
        } catch {
          /* ignore individual effect clearing errors */
        }

        clearedCount++;
      } catch (error) {
        console.error(`PF2E Visioner: Error clearing flags for token ${token.document.name}:`, error);
      }
    }

    ui.notifications.info(`PF2E Visioner: Cleared flags on ${clearedCount} combatant tokens after combat.`);
  } catch (error) {
    console.error('PF2E Visioner: Error resetting flags after combat:', error);
  }
}

function resetEncounterFiltersInDialogs() {
  const resetDialog = (ctorName) => {
    const dialogs = Object.values(ui.windows).filter((w) => w.constructor.name === ctorName);
    dialogs.forEach((dialog) => {
      if (!dialog.encounterOnly) return;
      dialog.encounterOnly = false;
      const checkbox = dialog.element?.querySelector('input[data-action="toggleEncounterFilter"]');
      if (checkbox) checkbox.checked = false;
      dialog.render({ force: true });
    });
  };
  resetDialog('HidePreviewDialog');
  resetDialog('SeekPreviewDialog');
  resetDialog('PointOutPreviewDialog');
}

async function handleTurnAdvance(combat) {
  try {
    const current = combat?.combatant?.actor;
    if (!current) return;
    
    const actor = current;
    const flag = actor?.getFlag?.('pf2e-visioner', 'echolocation');
    if (flag?.active) {
      const shouldExpire = !flag.expiresOnTurnOf || flag.expiresOnTurnOf === (actor.uuid || actor.id);
      if (shouldExpire) {
        await actor.unsetFlag('pf2e-visioner', 'echolocation');
        try { 
          (await import('../visibility/auto-visibility/PerceptionManager.js')).optimizedPerceptionManager.refreshPerception(); 
        } catch { }
      }
    }
  } catch { /* ignore */ }
}
