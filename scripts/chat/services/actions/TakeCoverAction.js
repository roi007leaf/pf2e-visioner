import { COVER_STATES } from '../../../constants.js';
import { appliedTakeCoverChangesByMessage } from '../data/message-cache.js';
import { shouldFilterAlly } from '../infra/shared-utils.js';
import { ActionHandlerBase } from './BaseAction.js';

// Take Cover raises the cover level that the ACTOR (taking cover) has AGAINST each other token (observers).
// Cover storage/orientation is observer -> target. For Take Cover that means:
//   observer = subject row token, target = actor taking cover
// New cover state mapping follows RAW: standard -> greater, lesser/none -> standard.
export class TakeCoverActionHandler extends ActionHandlerBase {
  constructor() {
    super('take-cover');
  }
  getApplyActionName() {
    return 'apply-now-take-cover';
  }
  getRevertActionName() {
    return 'revert-now-take-cover';
  }
  getCacheMap() {
    return appliedTakeCoverChangesByMessage;
  }
  // For overrides and UI selection, token id lives under `target` (the observer of the actor)
  getOutcomeTokenId(outcome) {
    return outcome?.target?.id ?? null;
  }
  getApplyDirection() {
    return 'observer_to_target';
  }

  async discoverSubjects(actionData) {
    const allTokens = canvas?.tokens?.placeables || [];
    const actorId = actionData?.actor?.id || actionData?.actor?.document?.id || null;
    const subjects = allTokens
      .filter((t) => t && t.actor)
      .filter((t) => (actorId ? t.id !== actorId : t !== actionData.actor))
      // Respect Ignore Allies: when enabled, exclude allies from observers list
      .filter((t) => !shouldFilterAlly(actionData.actor, t, 'enemies'))
      // Exclude loot and hazards from observers for Take Cover
      .filter((t) => t.actor?.type !== 'loot' && t.actor?.type !== 'hazard');

    return subjects;
  }

  async analyzeOutcome(actionData, subject) {
    const { getCoverBetween } = await import('../../../utils.js');
    // Orientation: observer = subject (row token), target = actor (taking cover)
    let current = getCoverBetween(subject, actionData.actor) || 'none';

    // Check for PF2e system cover effect on the actor taking cover
    let hasPF2eEffect = false;
    if (game.user?.isGM) {
      // Try different ways to access the actor
      let actor = actionData.actor?.actor || actionData.actor;

      if (actor?.itemTypes?.effect) {
        const allEffects = actor.itemTypes.effect.map((e) => ({ slug: e.slug, name: e.name }));
        const coverEffect = actor.itemTypes.effect.find((e) => e.slug === 'effect-cover');

        if (coverEffect) {
          const coverLevel = coverEffect.flags?.pf2e?.rulesSelections?.cover?.level;
          if (coverLevel) {
            current = coverLevel;
            hasPF2eEffect = true;
          }
        }
      }
    }

    let newCover;
    let originalCurrent = current;

    if (hasPF2eEffect) {
      // PF2e effect present: use the PF2e level as final result (GM has already calculated it)
      // Compare against existing Visioner cover (not the PF2e effect level)
      const existingVisionerCover = getCoverBetween(subject, actionData.actor) || 'none';
      newCover = current; // Use PF2e effect level as new cover
      const changed = newCover !== existingVisionerCover;

      return {
        target: subject,
        currentCover: existingVisionerCover,
        oldCover: existingVisionerCover,
        newCover,
        // Visibility-aligned aliases so shared UI helpers work
        currentVisibility: existingVisionerCover,
        oldVisibility: existingVisionerCover,
        newVisibility: newCover,
        changed,
      };
    } else {
      // No PF2e effect: apply normal Take Cover upgrade rules
      newCover = current;
      if (current === 'lesser' || current === 'none') newCover = 'standard';
      else if (current === 'standard') newCover = 'greater';
      // If already greater, no change
    }

    const changed = newCover !== current;

    // Mirror fields to align with BaseActionDialog utilities
    return {
      target: subject,
      currentCover: current,
      oldCover: current,
      newCover,
      // Visibility-aligned aliases so shared UI helpers work
      currentVisibility: current,
      oldVisibility: current,
      oldVisibilityLabel: COVER_STATES[current]?.label || current,
      newVisibility: newCover,
      changed,
    };
  }

  // Map to cover change call via utility
  outcomeToChange(actionData, outcome) {
    const desired = outcome?.overrideState || outcome?.newVisibility || outcome?.newCover;
    return {
      // Orientation: observer = subject (row token), target = actor (taking cover)
      observer: outcome.target,
      target: actionData.actor,
      newCover: desired,
      oldCover: outcome.oldCover || outcome.oldVisibility || outcome.currentCover,
    };
  }

  async applyChangesInternal(changes) {
    const { setCoverBetween } = await import('../../../utils.js');

    for (const ch of changes) {
      await setCoverBetween(ch.observer, ch.target, ch.newCover, { skipEphemeralUpdate: false });
    }

    // Remove PF2e cover effect from the actor taking cover to avoid conflicts
    if (changes.length > 0 && game.user?.isGM) {
      const actorTakingCover = changes[0]?.target; // All changes should have the same target (actor taking cover)
      if (actorTakingCover?.actor) {
        const coverEffect = actorTakingCover.actor.itemTypes?.effect?.find?.(
          (e) => e.slug === 'effect-cover',
        );
        if (coverEffect) {
          try {
            await coverEffect.delete();
          } catch (error) {
            console.warn(
              `[PF2E-Visioner] Failed to remove PF2e cover effect from ${actorTakingCover.name}:`,
              error,
            );
          }
        }
      }
    }
  }

  buildCacheEntryFromChange(change) {
    // Cache observer id (row token) and the old cover to enable precise revert
    return { observerId: change.observer?.id, oldCover: change.oldCover };
  }

  entriesToRevertChanges(entries, actionData) {
    // Revert orientation: observer = cached observer token, target = actor (taking cover)
    return entries
      .map((e) => ({
        observer: this.getTokenById(e.observerId),
        target: actionData.actor,
        newCover: e.oldCover,
      }))
      .filter((c) => c.observer);
  }

  async revert(actionData, button) {
    const { setCoverBetween } = await import('../../../utils.js');
    const changesFromCache = await this.buildChangesFromCache(actionData);
    if (!changesFromCache.length) return;
    for (const ch of changesFromCache) {
      await setCoverBetween(ch.observer, ch.target, ch.newCover, { skipEphemeralUpdate: false });
    }
    this.clearCache(actionData);
    this.updateButtonToApply(button);
  }
}
