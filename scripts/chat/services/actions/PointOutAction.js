import { VISIBILITY_STATES } from '../../../constants.js';
import { appliedPointOutChangesByMessage } from '../data/message-cache.js';
import { ActionHandlerBase } from './BaseAction.js';

export class PointOutActionHandler extends ActionHandlerBase {
  constructor() {
    super('point-out');
  }
  getApplyActionName() {
    return 'apply-now-point-out';
  }
  getRevertActionName() {
    return 'revert-now-point-out';
  }
  getCacheMap() {
    return appliedPointOutChangesByMessage;
  }

  async discoverSubjects(actionData) {
    // Resolve pointer/actor token robustly
    const msg = game.messages.get(actionData?.messageId);
    let pointer =
      actionData?.actor ||
      (msg?.speaker?.token ? canvas.tokens.get(msg.speaker.token) : null) ||
      canvas.tokens.controlled?.[0] ||
      null;

    // Resolve target token:
    // - If the message author is a player, use their explicit target at roll time if available
    // - Then prefer PF2e-Visioner stored target id (GM handoff)
    // - Then PF2e target flag
    // - Finally fallback heuristic
    let target = null;
    try {
      const isFromPlayer = !!msg?.author && msg.author.isGM === false;
      if (isFromPlayer) {
        // Use the author's target stored on the message flags first if present
        const authorTargetId = msg?.flags?.pf2e?.target?.token;
        if (authorTargetId) target = canvas.tokens.get(authorTargetId) || null;
        // If not present, try to read the player's current target only on their client
        if (!target && game.user.id === msg.author.id && game.user.targets?.size)
          target = Array.from(game.user.targets)[0];
      } else {
        // For GM-authored or unknown, fall back to this user's current target first
        if (game.user.targets?.size) target = Array.from(game.user.targets)[0];
      }
    } catch (_) { }
    if (!target) {
      const visFlag = msg?.flags?.['pf2e-visioner']?.pointOut?.targetTokenId;
      if (visFlag) target = canvas.tokens.get(visFlag) || null;
    }
    if (!target) {
      const pf2eFlag = msg?.flags?.pf2e?.target?.token;
      if (pf2eFlag) target = canvas.tokens.get(pf2eFlag) || null;
    }
    if (!target) {
      // Target validation now handled at entry-service level
      return [];
    }
    // Exclude loot targets from Point Out
    try {
      if (target?.actor?.type === 'loot') return [];
    } catch (_) { }

    // Allies are same-disposition tokens that currently cannot see the target
    const { getVisibilityBetween } = await import('../../../utils.js');
    const allies = (canvas?.tokens?.placeables || []).filter((t) => {
      return (
        t &&
        t.actor &&
        (!pointer || t.id !== pointer.id) &&
        (pointer ? t.document?.disposition === pointer.document?.disposition : true) &&
        t.actor?.type !== 'loot'
      );
    });
    const cannotSee = allies.filter((ally) => {
      const vis = getVisibilityBetween(ally, target);
      return vis === 'hidden' || vis === 'undetected';
    });
    return cannotSee.map((ally) => ({ ally, target }));
  }

  async analyzeOutcome(_actionData, subject) {
    const { getVisibilityBetween } = await import('../../../utils.js');
    const current = getVisibilityBetween(subject.ally, subject.target);
    // Point Out reveals target to allies as hidden if they currently cannot see it
    const newVisibility = current === 'hidden' || current === 'undetected' ? 'hidden' : current;
    return {
      target: subject.ally,
      targetToken: subject.target,
      currentVisibility: current,
      oldVisibility: current,
      oldVisibilityLabel: VISIBILITY_STATES[current]?.label || current,
      newVisibility,
      changed: newVisibility !== current,
    };
  }

  outcomeToChange(_actionData, outcome) {
    return {
      observer: outcome.target,
      target: outcome.targetToken,
      newVisibility: outcome.newVisibility,
      oldVisibility: outcome.oldVisibility,
      timedOverride: outcome.timedOverride,
    };
  }

  buildCacheEntryFromChange(change) {
    return {
      allyId: change.observer?.id,
      targetTokenId: change.target?.id,
      oldVisibility: change.oldVisibility,
    };
  }

  entriesToRevertChanges(entries, _actionData) {
    return entries
      .map((e) => ({
        observer: this.getTokenById(e.allyId),
        target: this.getTokenById(e.targetTokenId),
        newVisibility: e.oldVisibility,
      }))
      .filter((c) => c.observer && c.target);
  }
}
