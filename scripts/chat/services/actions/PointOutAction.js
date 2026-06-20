import { getVisibilityStateLabelKey } from '../../../constants.js';
import { appliedPointOutChangesByMessage } from '../data/message-cache.js';
import { ActionHandlerBase } from './BaseAction.js';
import { discoverPointOutSubjects } from './PointOut/point-out-subject-discovery.js';

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
    return discoverPointOutSubjects(actionData);
  }

  async analyzeOutcome(_actionData, subject) {
    let current = subject.currentVisibility;
    if (!current) {
      const { getVisibilityBetween } = await import('../../../utils.js');
      current = getVisibilityBetween(subject.ally, subject.target);
    }
    // Point Out reveals target to allies as hidden if they currently cannot see it
    const newVisibility = current === 'hidden' || current === 'undetected' ? 'hidden' : current;
    return {
      target: subject.ally,
      targetToken: subject.target,
      currentVisibility: current,
      oldVisibility: current,
      oldVisibilityLabel: getVisibilityStateLabelKey(current, { manual: true }) || current,
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
