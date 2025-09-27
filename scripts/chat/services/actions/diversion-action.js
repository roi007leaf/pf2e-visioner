import { VISIBILITY_STATES } from '../../../constants.js';
import { appliedDiversionChangesByMessage } from '../data/message-cache.js';
import { shouldFilterAlly } from '../infra/shared-utils.js';
import { ActionHandlerBase } from './base-action.js';

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
  async discoverSubjects(actionData) {
    // Observers are all other tokens; exclude acting token, loot, and hazards
    const tokens = canvas?.tokens?.placeables || [];
    const actorId = actionData?.actor?.id || actionData?.actor?.document?.id || null;
    return (
      tokens
        .filter((t) => t && t.actor)
        .filter((t) => (actorId ? t.id !== actorId : t !== actionData.actor))
        // Only apply ignoreAllies when explicitly provided; otherwise let dialog filter live
        .filter(
          (t) =>
            !shouldFilterAlly(
              actionData.actor,
              t,
              'enemies',
              actionData?.ignoreAllies === true || actionData?.ignoreAllies === false
                ? actionData.ignoreAllies
                : null,
            ),
        )
        .filter((t) => t.actor?.type !== 'loot' && t.actor?.type !== 'hazard')
    );
  }
  async analyzeOutcome(actionData, subject) {
    const { getVisibilityBetween } = await import('../../../utils.js');
    const { extractPerceptionDC, determineOutcome } = await import('../infra/shared-utils.js');
    const current = getVisibilityBetween(subject, actionData.actor);

    // Diversion roll vs observer Perception DC
    const dc = extractPerceptionDC(subject);
    const total = Number(actionData?.roll?.total ?? 0);
    const die = Number(
      actionData?.roll?.dice?.[0]?.results?.[0]?.result ??
      actionData?.roll?.dice?.[0]?.total ??
      actionData?.roll?.terms?.[0]?.total ?? 0,
    );
    const margin = total - dc;
    const outcome = determineOutcome(total, die, dc);

    // Default new state via centralized mapping
    const { getDefaultNewStateFor } = await import('../data/action-state-config.js');
    let newVisibility = getDefaultNewStateFor('create-a-diversion', current, outcome) || current;
    try {
      const { FeatsHandler } = await import('../feats-handler.js');
      newVisibility = FeatsHandler.adjustVisibility('create-a-diversion', actionData.actor, current, newVisibility, {
        outcome,
      });
    } catch { }

    return {
      observer: subject,
      dc,
      rollTotal: total,
      dieResult: die,
      margin,
      outcome,
      currentVisibility: current,
      oldVisibility: current,
      oldVisibilityLabel: VISIBILITY_STATES[current]?.label || current,
      newVisibility,
      changed: newVisibility !== current,
    };
  }
  outcomeToChange(actionData, outcome) {
    const observer = outcome.observer || outcome.token || outcome.target;
    return {
      observer,
      target: actionData.actor,
      newVisibility: outcome.newVisibility,
      oldVisibility: outcome.currentVisibility,
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
  async fallbackRevertChanges(actionData) {
    const subjects = await this.discoverSubjects(actionData);
    const outcomes = [];
    for (const subject of subjects) outcomes.push(await this.analyzeOutcome(actionData, subject));
    const filtered = outcomes.filter(Boolean).filter((o) => o.changed);
    return filtered.map((o) => ({
      observer: o.observer || o.token || o.target,
      target: actionData.actor,
      newVisibility: o.oldVisibility || o.currentVisibility,
    }));
  }
}
