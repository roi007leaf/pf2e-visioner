import { MODULE_ID, getVisibilityStateLabelKey } from '../../../constants.js';
import { appliedDiversionChangesByMessage } from '../data/message-cache.js';
import { ActionHandlerBase } from './BaseAction.js';
import {
  discoverDiversionSubjects,
  resolveTargetedDiversionBeneficiary,
} from './Diversion/diversion-subject-discovery.js';

export function getDiversionBeneficiary(actionData) {
  return actionData?.diversionTarget || actionData?.actorToken || actionData?.actor || null;
}

export function getDiversionResultVisibility(actionData, current, outcome, mappedVisibility) {
  const performer = actionData?.actorToken || actionData?.actor;
  const beneficiary = getDiversionBeneficiary(actionData);
  const performerId = performer?.id || performer?.document?.id;
  const beneficiaryId = beneficiary?.id || beneficiary?.document?.id;
  const appliesToAlly = beneficiary && performer && beneficiaryId !== performerId;
  const succeeded = outcome === 'success' || outcome === 'critical-success';

  return appliesToAlly && !succeeded ? current : mappedVisibility;
}

export class DiversionActionHandler extends ActionHandlerBase {
  constructor() {
    super('create-a-diversion');
  }
  getCacheMap() {
    return appliedDiversionChangesByMessage;
  }
  getOutcomeTokenId(outcome) {
    return outcome?.observer?.id ?? outcome?.target?.id ?? null;
  }
  isOldStateAvsControlled(outcome, actionData) {
    try {
      const avsEnabled = game.settings.get(MODULE_ID, 'autoVisibilityEnabled');
      if (!avsEnabled) return false;

      const observer = outcome.observer || outcome.token || outcome.target;
      const actor = getDiversionBeneficiary(actionData);

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
    if (actionData?.diversionTarget) return;

    const { FeatsHandler } = await import('../FeatsHandler.js');
    if (!FeatsHandler.hasFeat(actionData?.actor, 'distracting-performance')) return;

    const targetedAlly = resolveTargetedDiversionBeneficiary(actionData.actor, game.user?.targets);
    actionData.diversionTarget = targetedAlly || actionData.actorToken || actionData.actor;
  }
  async discoverSubjects(actionData) {
    return discoverDiversionSubjects(actionData);
  }
  async analyzeOutcome(actionData, subject) {
    const { getVisibilityBetween } = await import('../../../utils.js');
    const { extractPerceptionDC, determineOutcome } = await import('../infra/shared-utils.js');
    const beneficiary = getDiversionBeneficiary(actionData);
    const current = getVisibilityBetween(subject, beneficiary);

    // Diversion roll vs observer Perception DC
    const dc = extractPerceptionDC(subject);
    const total = Number(actionData?.roll?.total ?? 0);
    const die = Number(
      actionData?.roll?.dice?.[0]?.results?.[0]?.result ??
        actionData?.roll?.dice?.[0]?.total ??
        actionData?.roll?.terms?.[0]?.total ??
        0,
    );
    const margin = total - dc;
    const outcome = determineOutcome(total, die, dc);

    // Default new state via centralized mapping
    const { getDefaultNewStateFor } = await import('../data/action-state-config.js');
    let newVisibility = getDefaultNewStateFor('create-a-diversion', current, outcome) || current;
    newVisibility = getDiversionResultVisibility(actionData, current, outcome, newVisibility);
    try {
      const { FeatsHandler } = await import('../FeatsHandler.js');
      newVisibility = FeatsHandler.adjustVisibility(
        'create-a-diversion',
        actionData.actor,
        current,
        newVisibility,
        {
          outcome,
        },
      );
    } catch {}

    return {
      observer: subject,
      dc,
      rollTotal: total,
      dieResult: die,
      margin,
      outcome,
      currentVisibility: current,
      oldVisibility: current,
      oldVisibilityLabel: getVisibilityStateLabelKey(current, { manual: true }) || current,
      newVisibility,
      changed: newVisibility !== current,
    };
  }
  outcomeToChange(actionData, outcome) {
    const observer = outcome.observer || outcome.token || outcome.target;
    return {
      observer,
      target: getDiversionBeneficiary(actionData),
      newVisibility: outcome.newVisibility,
      oldVisibility: outcome.currentVisibility,
      timedOverride: outcome.timedOverride,
    };
  }
  buildCacheEntryFromChange(change) {
    return {
      observerId: change?.observer?.id ?? null,
      targetId: change?.target?.id ?? null,
      oldVisibility: change?.oldVisibility ?? null,
    };
  }
  entriesToRevertChanges(entries, actionData) {
    return entries
      .map((e) => ({
        observer: this.getTokenById(e.observerId),
        target:
          (e.targetId ? this.getTokenById(e.targetId) : null) ||
          getDiversionBeneficiary(actionData),
        newVisibility: e.oldVisibility,
      }))
      .filter((c) => c.observer && c.target && c.newVisibility);
  }
  async fallbackRevertChanges(actionData) {
    const subjects = await this.discoverSubjects(actionData);
    const outcomes = [];
    for (const subject of subjects) outcomes.push(await this.analyzeOutcome(actionData, subject));
    const filtered = outcomes.filter((outcome) => this.isOutcomeActionable(actionData, outcome));
    return filtered.map((o) => ({
      observer: o.observer || o.token || o.target,
      target: getDiversionBeneficiary(actionData),
      newVisibility: o.oldVisibility || o.currentVisibility,
    }));
  }
}
