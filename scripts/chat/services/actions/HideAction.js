import { MODULE_ID, getVisibilityStateLabelKey } from '../../../constants.js';
import autoCoverSystem from '../../../cover/auto-cover/AutoCoverSystem.js';
import stealthCheckUseCase from '../../../cover/auto-cover/usecases/StealthCheckUseCase.js';
import { appliedHideChangesByMessage } from '../data/message-cache.js';
import { ActionHandlerBase } from './BaseAction.js';
import { buildHideAutoCoverData } from './Hide/hide-cover-analysis.js';
import {
  applyHidePrerequisiteFallback,
  resolveHidePositionQualification,
} from './Hide/hide-position-qualification.js';
import { resolveHideRollOutcome } from './Hide/hide-roll-outcome.js';
import { discoverHideSubjects } from './Hide/hide-subject-discovery.js';
import { resolveHideVisibilityOutcomes } from './Hide/hide-visibility-outcome.js';
export {
  applyHidePrerequisiteFallback,
  evaluateHidePrerequisites,
} from './Hide/hide-position-qualification.js';

export function isHideVisibilityChangeActionable(
  currentVisibility,
  newVisibility,
  isOldStateAvsControlled = false,
) {
  if (!newVisibility || newVisibility === 'avs') return false;
  if (currentVisibility == null) return true;
  return newVisibility !== currentVisibility || !!isOldStateAvsControlled;
}

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
  isOldStateAvsControlled(outcome, actionData) {
    try {
      const avsEnabled = game.settings.get(MODULE_ID, 'autoVisibilityEnabled');
      if (!avsEnabled) return false;

      const observer = outcome.target;
      const actor = actionData?.actor;

      if (!observer || !actor) return false;

      const hasOverride = !!actor.document?.getFlag(
        MODULE_ID,
        `avs-override-from-${observer.document?.id || observer.id}`,
      );

      return !hasOverride;
    } catch {
      return false;
    }
  }
  async ensurePrerequisites(actionData) {
    const { ensureActionRoll } = await import('../infra/roll-utils.js');
    ensureActionRoll(actionData);
  }
  async discoverSubjects(actionData) {
    return discoverHideSubjects(actionData);
  }
  async analyzeOutcome(actionData, subject) {
    const { getVisibilityBetween } = await import('../../../utils.js');
    const { extractPerceptionDC } = await import('../infra/shared-utils.js');
    const current = getVisibilityBetween(subject, actionData.actor);

    // Calculate auto-cover from observer's perspective looking at the hiding actor
    const adjustedDC = extractPerceptionDC(subject);
    const autoCover = await buildHideAutoCoverData({
      actionData,
      subject,
      autoCoverSystem: this.autoCoverSystem,
      stealthCheckUseCase: this.stealthCheckUseCase,
    });

    const rollOutcome = await resolveHideRollOutcome({ actionData, adjustedDC, autoCover });
    const {
      total,
      originalTotal,
      baseRollTotal,
      die,
      margin,
      originalMargin,
      baseMargin,
      outcome,
      adjustedOutcome,
      originalOutcome,
      originalOutcomeLabel,
      featNotes,
    } = rollOutcome;

    let { newVisibility, originalNewVisibility } = await resolveHideVisibilityOutcomes({
      actionData,
      current,
      adjustedOutcome,
      originalOutcome,
      originalTotal,
    });

    const positionQualification = await resolveHidePositionQualification({
      actionData,
      subject,
      current,
    });
    if (positionQualification) {
      newVisibility = applyHidePrerequisiteFallback(newVisibility, positionQualification);
    }

    // Check if we should show override displays (only if there's a meaningful difference)
    const shouldShowOverride =
      autoCover?.isOverride &&
      (total !== originalTotal ||
        margin !== originalMargin ||
        outcome !== originalOutcome ||
        newVisibility !== originalNewVisibility);

    const oldStateAvsControlled = this.isOldStateAvsControlled(
      {
        target: subject,
        currentVisibility: current,
        oldVisibility: current,
      },
      actionData,
    );

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
      oldVisibilityLabel: getVisibilityStateLabelKey(current, { manual: true }) || current,
      newVisibility,
      changed: isHideVisibilityChangeActionable(current, newVisibility, oldStateAvsControlled),
      autoCover,
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
      target: actionData.actorToken || actionData.actor,
      newVisibility: outcome.newVisibility,
      oldVisibility: outcome.oldVisibility,
      timedOverride: outcome.timedOverride,
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
        target: actionData.actorToken || actionData.actor,
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
      target: actionData.actorToken || actionData.actor,
      newVisibility: o.oldVisibility || o.currentVisibility,
    }));
  }
}
