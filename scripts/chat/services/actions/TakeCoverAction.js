import { COVER_STATES } from '../../../constants.js';
import autoCoverSystem from '../../../cover/auto-cover/AutoCoverSystem.js';
import { appliedTakeCoverChangesByMessage } from '../data/message-cache.js';
import { shouldFilterAlly } from '../infra/shared-utils.js';
import { ActionHandlerBase } from './BaseAction.js';

function getTakeCoverResultForBaselineCover(coverState) {
  return coverState === 'standard' || coverState === 'greater' ? 'greater' : 'standard';
}

function isProneToken(token) {
  const actor = token?.actor;
  try {
    if (token?.isProne === true) return true;
    if (actor?.statuses?.has?.('prone')) return true;
    if (actor?.itemTypes?.condition?.some?.((condition) => condition?.slug === 'prone')) return true;
    if (actor?.conditions?.conditions?.some?.((condition) => condition?.slug === 'prone')) return true;
    if (Array.isArray(actor?.conditions) && actor.conditions.some((condition) => condition?.slug === 'prone')) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function hasTakeCoverProneRangedOnlyEffect(token) {
  try {
    return token?.actor?.itemTypes?.effect?.some?.(
      (effect) => effect.flags?.['pf2e-visioner']?.takeCoverProneRangedOnly === true,
    ) === true;
  } catch {
    return false;
  }
}

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
    const takingCoverToken = actionData.actorToken || actionData.actor;
    // Orientation: observer = subject (row token), target = actor (taking cover)
    const storedCover = getCoverBetween(subject, takingCoverToken) || 'none';
    let baselineCover = storedCover;

    try {
      if (autoCoverSystem?.isEnabled?.() !== false) {
        baselineCover = autoCoverSystem.detectCoverBetweenTokens(subject, takingCoverToken) || 'none';
      }
    } catch {
      baselineCover = storedCover;
    }

    const takeCoverProneRangedOnly = baselineCover === 'none' && isProneToken(takingCoverToken);
    const calculatedCover = takeCoverProneRangedOnly
      ? 'none'
      : getTakeCoverResultForBaselineCover(baselineCover);
    const changed = takeCoverProneRangedOnly || calculatedCover !== storedCover;

    // Mirror fields to align with BaseActionDialog utilities
    return {
      target: subject,
      currentCover: storedCover,
      oldCover: storedCover,
      newCover: calculatedCover,
      // Visibility-aligned aliases so shared UI helpers work
      currentVisibility: storedCover,
      oldVisibility: storedCover,
      oldVisibilityLabel: COVER_STATES[storedCover]?.label || storedCover,
      newVisibility: calculatedCover,
      changed,
      takeCoverProneRangedOnly,
    };
  }

  // Map to cover change call via utility
  outcomeToChange(actionData, outcome) {
    const desired = outcome?.overrideState || outcome?.newVisibility || outcome?.newCover;
    return {
      // Orientation: observer = subject (row token), target = actor (taking cover)
      observer: outcome.target,
      target: actionData.actorToken || actionData.actor,
      newCover: desired,
      oldCover: outcome.oldCover || outcome.oldVisibility || outcome.currentCover,
      takeCoverProneRangedOnly: outcome.takeCoverProneRangedOnly === true,
    };
  }

  async applyChangesInternal(changes) {
    const { setCoverBetween } = await import('../../../utils.js');
    const { applyTakeCoverProneRangedOnlyEffect } = await import('../../../cover/batch.js');
    let appliedProneRangedOnly = false;


    for (const ch of changes) {
      if (ch.takeCoverProneRangedOnly === true) {
        if (!appliedProneRangedOnly) {
          await applyTakeCoverProneRangedOnlyEffect(ch.target);
          appliedProneRangedOnly = true;
        }
        continue;
      }
      await setCoverBetween(ch.observer, ch.target, ch.newCover, {
        skipEphemeralUpdate: false,
        takeCover: true,
        takeCoverProneRangedOnly: false,
      });
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

  applyOverrides(actionData, outcomes) {
    const result = super.applyOverrides(actionData, outcomes);
    for (const outcome of result || []) {
      if (outcome?.takeCoverProneRangedOnly === true) {
        outcome.changed = true;
      }
    }
    return result;
  }

  getDirectApplyOutcomes(outcomes) {
    const changed = (outcomes || []).filter((outcome) => outcome?.changed);
    if (changed.length === 0) return [];
    return changed.every((outcome) => outcome.takeCoverProneRangedOnly === true) ? changed : [];
  }

  shouldApplyWithoutDialog(outcomes, actionData = null) {
    const takingCoverToken = actionData?.actorToken || actionData?.actor;
    const isProne = isProneToken(takingCoverToken);
    if (isProne && hasTakeCoverProneRangedOnlyEffect(takingCoverToken)) return false;
    if (isProne) return true;
    if (this.getDirectApplyOutcomes(outcomes).length > 0) return true;
    return (outcomes || []).length === 0 && isProne;
  }

  async applyOutcomesDirectly(actionData, outcomes, button = null) {
    const directOutcomes = this.getDirectApplyOutcomes(outcomes);
    const takingCoverToken = actionData.actorToken || actionData.actor;
    if (directOutcomes.length === 0 && !isProneToken(takingCoverToken)) {
      return 0;
    }

    const { applyTakeCoverProneRangedOnlyEffect } = await import('../../../cover/batch.js');
    await applyTakeCoverProneRangedOnlyEffect(takingCoverToken);
    const changes = directOutcomes.length
      ? directOutcomes.map((outcome) => this.outcomeToChange(actionData, outcome))
      : [{ target: takingCoverToken, takeCoverProneRangedOnly: true, oldCover: 'none' }];
    this.cacheAfterApply(actionData, changes);
    this.updateButtonToRevert(button);
    try {
      const { notify } = await import('../infra/notifications.js');
      notify.info('Applied Take Cover: greater cover against ranged attacks while prone');
    } catch { }
    return changes.length;
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
        target: actionData.actorToken || actionData.actor,
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
