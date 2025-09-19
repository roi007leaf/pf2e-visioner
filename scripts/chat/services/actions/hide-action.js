import { COVER_STATES, VISIBILITY_STATES } from '../../../constants.js';
import autoCoverSystem from '../../../cover/auto-cover/AutoCoverSystem.js';
import stealthCheckUseCase from '../../../cover/auto-cover/usecases/StealthCheckUseCase.js';
import { getCoverBetween } from '../../../utils.js';
import { appliedHideChangesByMessage } from '../data/message-cache.js';
import { calculateStealthRollTotals, shouldFilterAlly } from '../infra/shared-utils.js';
import { ActionHandlerBase } from './base-action.js';

export class HideActionHandler extends ActionHandlerBase {
  constructor() {
    super('hide');
    // Use the singleton instance to share state with StealthCheckUseCase
    this.autoCoverSystem = autoCoverSystem;
    this.stealthCheckUseCase = stealthCheckUseCase; // Use singleton
    // Use the global singleton override manager directly
  }
  getCacheMap() {
    return appliedHideChangesByMessage;
  }
  getOutcomeTokenId(outcome) {
    return outcome?.target?.id ?? null;
  }
  async ensurePrerequisites(actionData) {
    const { ensureActionRoll } = await import('../infra/roll-utils.js');
    ensureActionRoll(actionData);
  }
  async discoverSubjects(actionData) {
    // Observers are all other tokens; dialog filters encounter as needed
    const tokens = canvas?.tokens?.placeables || [];
    const actorToken = actionData?.actor;
    const actorId = actorToken?.id || actorToken?.document?.id || null;
    const base = tokens
      .filter((t) => t && t.actor)
      .filter((t) => (actorId ? t.id !== actorId : t !== actorToken))
      // Respect ignoreAllies: when enabled, exclude allies from observers for Hide
      // Only apply ignoreAllies when explicitly provided; otherwise let dialog filter live
      .filter(
        (t) =>
          !shouldFilterAlly(
            actorToken,
            t,
            'enemies',
            actionData?.ignoreAllies === true || actionData?.ignoreAllies === false
              ? actionData.ignoreAllies
              : null,
          ),
      )
      // Hide should not list loot or hazards as observers
      .filter((t) => t.actor?.type !== 'loot' && t.actor?.type !== 'hazard');

    return base;
  }
  async analyzeOutcome(actionData, subject) {
    const { getVisibilityBetween } = await import('../../../utils.js');
    const { extractPerceptionDC, determineOutcome } = await import('../infra/shared-utils.js');
    const current = getVisibilityBetween(subject, actionData.actor);

    // Calculate auto-cover from observer's perspective looking at the hiding actor
    let adjustedDC = extractPerceptionDC(subject);

    // Initialize result object for auto-cover data
    const result = {};

    try {
      const hidingToken =
        actionData.actorToken || actionData.actor?.token?.object || actionData.actor;

      let coverState = null;
      let isOverride = false;
      let coverSource = 'none';

      // Compute base cover (manual first, then auto-cover fallback)
      try {
        // First check for manual cover
        const manualDetected = getCoverBetween(subject, hidingToken);
        if (manualDetected && manualDetected !== 'none') {
          coverState = manualDetected;
          coverSource = 'manual';
        } else if (this.autoCoverSystem.isEnabled()) {
          // Fallback to auto-cover detection if no manual cover
          // For cover detection: observer is "attacking" (perceiving) the hiding token
          // So observer is attacker, hiding token is target
          const autoDetected = this.stealthCheckUseCase._detectCover(subject, hidingToken);
          if (autoDetected && autoDetected !== 'none') {
            coverState = autoDetected;
            coverSource = 'automatic';
          }
        }
      } catch (e) {
        console.warn(`PF2E Visioner | Cover calculation failed for Hide action:`, e);
      }

      // Apply overrides last (take precedence over base)
      // Prefer roll-specific override if a rollId exists in the action or message context.
      // Don't delete on consume yet - we need it for all observers
      let originalDetectedState = coverState || 'none'; // Store what we actually detected for this observer
      try {
        const rollId =
          actionData?.context?._visionerRollId ||
          actionData?.context?.rollId ||
          actionData?.message?.flags?.['pf2e-visioner']?.rollId ||
          null;

        // First check if there's a stored modifier for this roll (from StealthCheckUseCase)
        let storedModifier = null;
        if (rollId) {
          storedModifier = this.stealthCheckUseCase?.getOriginalCoverModifier?.(rollId);
        }

        if (storedModifier && storedModifier.isOverride) {
          // Use the stored modifier data to determine override
          // Keep the actually detected state for this observer as the original
          originalDetectedState = coverState || 'none';
          // Apply the override final state
          coverState = storedModifier.finalState;

          // Mark as override since we have a stored override modifier
          isOverride = true;
          coverSource = storedModifier.source || 'dialog';
        } else {
          // Fallback to the old method (but don't consume yet)
          // NOTE: Override parameter order is DIFFERENT from cover detection!
          // Stealth check stores overrides as (hiding token -> observer)
          // Cover detection uses (observer -> hiding token)
          const overrideData = this.autoCoverSystem.consumeCoverOverride(
            hidingToken,
            subject,
            rollId,
            false,
          );
          if (overrideData) {
            // Store the original detected state before applying override
            originalDetectedState = coverState || 'none';
            // Apply the override
            coverState = overrideData.state;

            // Only mark as override if there's actually a difference from what we detected
            if (originalDetectedState !== coverState) {
              isOverride = true;
              coverSource = overrideData.source;
            }
          }
        }
      } catch (e) {
        console.warn('PF2E Visioner | Error checking for cover override:', e);
      }

      // Create autoCover object if we have a cover state OR if there's an override
      if (coverState || isOverride) {
        // Feat: Ceaseless Shadows upgrades cover from a creature's perspective
        try {
          const { FeatsHandler } = await import('../feats-handler.js');
          const upgraded = FeatsHandler.upgradeCoverForCreature(actionData.actor, coverState);
          coverState = upgraded.state;
          var _csCanTakeCover = upgraded.canTakeCover;
        } catch { }
        const coverConfig = COVER_STATES[coverState || 'none'];
        const actualStealthBonus = coverConfig?.bonusStealth || 0;
        result.autoCover = {
          state: coverState || 'none',
          label: game.i18n.localize(coverConfig?.label || 'None'),
          icon: coverConfig?.icon || 'fas fa-shield',
          color: coverConfig?.color || '#999',
          cssClass: coverConfig?.cssClass || '',
          bonus: actualStealthBonus,
          // Ceaseless Shadows: gaining Standard or better allows Take Cover
          canTakeCover: _csCanTakeCover || ((coverState === 'standard' || coverState === 'greater') ? true : undefined),
          isOverride: isOverride && originalDetectedState !== coverState,
          source: coverSource,
          // Add override details for template display (only if actually overridden)
          ...(isOverride && {
            overrideDetails: {
              originalState: originalDetectedState,
              originalLabel: game.i18n.localize(
                COVER_STATES[originalDetectedState]?.label || 'None',
              ),
              originalIcon: COVER_STATES[originalDetectedState]?.icon || 'fas fa-shield',
              originalColor: COVER_STATES[originalDetectedState]?.color || '#999',
              finalState: coverState || 'none',
              finalLabel: game.i18n.localize(coverConfig?.label || 'None'),
              finalIcon: coverConfig?.icon || 'fas fa-shield',
              finalColor: coverConfig?.color || '#999',
              source: coverSource,
            },
          }),
        };
      }
    } catch (e) {
      console.error(`PF2E Visioner | Error in cover calculation for Hide action:`, e);
    }

    // Calculate roll information (stealth vs observer's perception DC)
    const baseTotal = Number(actionData?.roll?.total ?? 0);

    // Use shared utility to calculate stealth roll totals with cover adjustments
    const { total, originalTotal, baseRollTotal } = calculateStealthRollTotals(
      baseTotal,
      result?.autoCover,
      actionData,
    );

    const die = Number(
      actionData?.roll?.dice?.[0]?.results?.[0]?.result ??
      actionData?.roll?.dice?.[0]?.total ??
      actionData?.roll?.terms?.[0]?.total ?? 0,
    );
    const margin = total - adjustedDC;
    const originalMargin = originalTotal ? originalTotal - adjustedDC : margin;
    const baseMargin = baseRollTotal ? baseRollTotal - adjustedDC : margin;
    let outcome = determineOutcome(total, die, adjustedDC);
    const originalOutcome = originalTotal
      ? determineOutcome(originalTotal, die, adjustedDC)
      : outcome;

    // Feat-based outcome shift (parallel to Sneak)
    let adjustedOutcome = outcome;
    let featNotes = [];
    try {
      const { FeatsHandler } = await import('../feats-handler.js');
      // Basic lighting context similar to sneak (dim/dark advantages)
      const { shift, notes } = FeatsHandler.getOutcomeAdjustment(actionData.actor, 'hide');
      if (shift) {
        adjustedOutcome = FeatsHandler.applyOutcomeShift(outcome, shift);
        featNotes = notes;
      }
    } catch (e) {
      console.warn('PF2E Visioner | Hide feats adjustment failed:', e);
    }

    // Generate outcome labels
    const getOutcomeLabel = (outcomeValue) => {
      switch (outcomeValue) {
        case 'critical-success':
          return 'Critical Success';
        case 'success':
          return 'Success';
        case 'failure':
          return 'Failure';
        case 'critical-failure':
          return 'Critical Failure';
        default:
          return outcomeValue?.charAt(0).toUpperCase() + outcomeValue?.slice(1) || '';
      }
    };
    const originalOutcomeLabel = originalTotal ? getOutcomeLabel(originalOutcome) : null;

    // Maintain previous behavior for visibility change while enriching display fields
    // Use centralized mapping for defaults
    const { getDefaultNewStateFor } = await import('../data/action-state-config.js');
    let newVisibility = getDefaultNewStateFor('hide', current, adjustedOutcome) || current;
    // Feat-based post visibility adjustments
    try {
      const { FeatsHandler } = await import('../feats-handler.js');
      const inNatural = (() => { try { return FeatsHandler.isEnvironmentActive(actionData.actor, 'natural'); } catch { return false; } })();
      newVisibility = FeatsHandler.adjustVisibility('hide', actionData.actor, current, newVisibility, {
        inNaturalTerrain: inNatural,
        outcome: adjustedOutcome,
      });
    } catch { }

    // Prerequisite qualification similar to Sneak (start + end with feat overrides)
    let positionQualification = null;
    try {
      const { default: positionTracker } = await import('../position/PositionTracker.js');
      const endSnapshot = await positionTracker._capturePositionState(
        actionData.actor,
        subject,
        Date.now(),
        { forceFresh: true, useCurrentPositionForCover: true }
      );
      const startVisibility = current;
      const endVisibility = endSnapshot?.avsVisibility || current;
      const endCoverState = endSnapshot?.coverState || 'none';
      // Hide: you must have cover or concealment now to attempt (observed without either disqualifies unless feats)
      const startQualifies = (startVisibility === 'hidden' || startVisibility === 'undetected' || startVisibility === 'concealed') || (endCoverState === 'standard' || endCoverState === 'greater');
      const endQualifies = (endCoverState === 'standard' || endCoverState === 'greater') || endVisibility === 'concealed';
      let qualification = { startQualifies, endQualifies, bothQualify: startQualifies && endQualifies, reason: 'Hide prerequisites evaluated' };
      try {
        const { FeatsHandler } = await import('../feats-handler.js');
        const inNatural = (() => { try { return FeatsHandler.isEnvironmentActive(actionData.actor, 'natural'); } catch { return false; } })();
        qualification = FeatsHandler.overridePrerequisites(actionData.actor, qualification, { startVisibility, endVisibility, endCoverState, inNaturalTerrain: inNatural });
      } catch { }
      positionQualification = qualification;
      if (!qualification.endQualifies) newVisibility = 'observed';
    } catch { /* non-fatal prereq */ }

    // Calculate what the visibility change would have been with original outcome
    let originalNewVisibility = originalTotal
      ? getDefaultNewStateFor('hide', current, originalOutcome) || current
      : newVisibility;
    if (originalTotal) {
      try {
        const { FeatsHandler } = await import('../feats-handler.js');
        const inNatural = (() => { try { return FeatsHandler.isEnvironmentActive(actionData.actor, 'natural'); } catch { return false; } })();
        originalNewVisibility = FeatsHandler.adjustVisibility('hide', actionData.actor, current, originalNewVisibility, {
          inNaturalTerrain: inNatural,
          outcome: originalOutcome,
        });
      } catch { }
    }

    // Check if we should show override displays (only if there's a meaningful difference)
    const shouldShowOverride =
      result.autoCover?.isOverride &&
      (total !== originalTotal ||
        margin !== originalMargin ||
        outcome !== originalOutcome ||
        newVisibility !== originalNewVisibility);

    return {
      target: subject,
      dc: adjustedDC,
      rollTotal: total,
      dieResult: die,
      margin,
      originalMargin,
      baseMargin,
      outcome: adjustedOutcome,
      originalOutcome,
      originalOutcomeLabel,
      originalNewVisibility,
      shouldShowOverride,
      currentVisibility: current,
      oldVisibility: current,
      oldVisibilityLabel: VISIBILITY_STATES[current]?.label || current,
      newVisibility,
      changed: newVisibility !== current,
      autoCover: result.autoCover, // Add auto-cover information
      // Add original total for override display
      originalRollTotal: originalTotal,
      // Add base roll total for triple-bracket display
      baseRollTotal: baseRollTotal,
      featNotes,
      positionQualification,
    };
  }
  outcomeToChange(actionData, outcome) {
    return {
      observer: outcome.target,
      target: actionData.actor,
      newVisibility: outcome.newVisibility,
      oldVisibility: outcome.oldVisibility,
    };
  }
  buildCacheEntryFromChange(change) {
    return {
      observerId: change?.observer?.id ?? null,
      oldVisibility: change?.oldVisibility ?? null,
    };
  }
  entriesToRevertChanges(entries, actionData) {
    return entries
      .map((e) => ({
        observer: this.getTokenById(e.observerId),
        target: actionData.actor,
        newVisibility: e.oldVisibility,
      }))
      .filter((c) => c.observer && c.target && c.newVisibility);
  }

  // Ensure fallback revert builds correct direction for Hide (observer -> actor)
  async fallbackRevertChanges(actionData) {
    const subjects = await this.discoverSubjects(actionData);
    const outcomes = [];
    for (const subject of subjects) outcomes.push(await this.analyzeOutcome(actionData, subject));
    const filtered = outcomes.filter(Boolean).filter((o) => o.changed);
    return filtered.map((o) => ({
      observer: o.target,
      target: actionData.actor,
      newVisibility: o.oldVisibility || o.currentVisibility,
    }));
  }
}
