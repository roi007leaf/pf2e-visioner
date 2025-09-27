/**
 * Combat-related hooks: reset encounter filter for open dialogs
 */

export function registerCombatHooks() {
  Hooks.on('updateCombat', onUpdateCombat);
  Hooks.on('deleteCombat', onDeleteCombat);
  Hooks.on('updateCombat', onTurnAdvanceExpireEcholocation);
}

function onUpdateCombat(combat, updateData /*, options, userId */) {
  if (Object.prototype.hasOwnProperty.call(updateData, 'started') && updateData.started === false) {
    resetEncounterFiltersInDialogs();
  }
}

function onDeleteCombat(/* combat, options, userId */) {
  resetEncounterFiltersInDialogs();
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

/**
 * Expire echolocation precise-hearing at the start of the actor's next turn
 */
async function onTurnAdvanceExpireEcholocation(combat, updateData) {
  try {
    // We only need to handle when turn/round advances
    const turnChanged = Object.prototype.hasOwnProperty.call(updateData, 'turn') || Object.prototype.hasOwnProperty.call(updateData, 'round');
    if (!turnChanged) return;
    const current = combat?.combatant?.actor;
    if (!current) return;
    const actor = current;
    const flag = actor?.getFlag?.('pf2e-visioner', 'echolocation');
    if (flag?.active) {
      // Expire when the actor's turn starts (i.e., when they become current combatant again)
      // If the stored expiresOnTurnOf matches this actor and combat id aligns, clear it now
      const shouldExpire = !flag.expiresOnTurnOf || flag.expiresOnTurnOf === (actor.uuid || actor.id);
      if (shouldExpire) {
        await actor.unsetFlag('pf2e-visioner', 'echolocation');
        // Also request perception refresh to recalc visibility based on senses
        try { (await import('../visibility/auto-visibility/PerceptionManager.js')).optimizedPerceptionManager.refreshPerception(); } catch { }
      }
    }
  } catch { /* ignore */ }
}
