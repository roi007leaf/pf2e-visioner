import { MODULE_ID } from '../../../constants.js';
import { appliedConsequencesChangesByMessage } from '../data/message-cache.js';
import { log, notify } from '../infra/notifications.js';
import { ActionHandlerBase } from './BaseAction.js';
import {
  applyConsequencesAvs,
  isConsequencesAvsEnabled,
  requestConsequencesTakeCoverExpiration,
  revertConsequencesAvs,
} from './Consequences/consequences-avs-application.js';
import { applyConsequencesLegacy } from './Consequences/consequences-legacy-application.js';
import {
  buildConsequencesOutcome,
  discoverConsequencesSubjects,
  getDefaultConsequencesVisibility,
} from './Consequences/consequences-targets.js';

export class ConsequencesActionHandler extends ActionHandlerBase {
  constructor() {
    super('consequences');
  }
  getCacheMap() {
    return appliedConsequencesChangesByMessage;
  }
  // Cache entry format additions (AVS mode):
  // { type: 'avs-removed', observerId, targetId, original: { state, source, hasCover, hasConcealment, expectedCover } }
  // Non-AVS path keeps prior structure { observerId, oldVisibility }
  getOutcomeTokenId(outcome) {
    return outcome?.target?.id ?? null;
  }
  isOldStateAvsControlled(outcome, actionData) {
    try {
      const avsEnabled = game.settings.get(MODULE_ID, 'autoVisibilityEnabled');
      if (!avsEnabled) return false;

      const observer = outcome.target;
      const attacker = actionData?.actor;

      if (!observer || !attacker) return false;

      const hasOverride = !!attacker.document?.getFlag(
        MODULE_ID,
        `avs-override-from-${observer.document?.id || observer.id}`,
      );

      return !hasOverride;
    } catch {
      return false;
    }
  }
  async discoverSubjects(actionData) {
    return discoverConsequencesSubjects(actionData);
  }
  async analyzeOutcome(actionData, subject) {
    return buildConsequencesOutcome(actionData, subject);
  }
  outcomeToChange(actionData, outcome) {
    // Use the outcome's newVisibility if set (from overrides), otherwise use the current mode default
    const newVisibility = outcome.newVisibility || getDefaultConsequencesVisibility();
    return {
      observer: outcome.target,
      target: actionData.actorToken || actionData.actor,
      newVisibility,
      oldVisibility: outcome.currentVisibility,
      timedOverride: outcome.timedOverride,
    };
  }
  buildCacheEntryFromChange(change) {
    return { observerId: change.observer?.id, oldVisibility: change.oldVisibility };
  }
  entriesToRevertChanges(entries, actionData) {
    return entries
      .filter((e) => e.type !== 'avs-removed') // ignore AVS removal entries here (handled by custom revert)
      .map((e) => ({
        observer: this.getTokenById(e.observerId),
        target: actionData.actorToken || actionData?.actor || null,
        newVisibility: e.oldVisibility,
      }))
      .filter((c) => c.observer && c.target);
  }
  async fallbackRevertChanges(actionData) {
    // Recompute outcomes and revert observers back to their recorded old/current visibility toward the attacker
    const subjects = await this.discoverSubjects(actionData);
    const outcomes = [];
    for (const subject of subjects) outcomes.push(await this.analyzeOutcome(actionData, subject));
    const filtered = outcomes.filter(Boolean).filter((o) => o.changed);
    return filtered.map((o) => ({
      observer: o.target,
      target: actionData.actorToken || actionData.actor,
      newVisibility: o.currentVisibility,
    }));
  }

  // APPLY: If AVS enabled -> ONLY remove overrides (do not apply visibility states). If AVS disabled -> legacy behavior.
  async apply(actionData, button) {
    try {
      const avsEnabled = await isConsequencesAvsEnabled();
      await this.ensurePrerequisites(actionData);
      await requestConsequencesTakeCoverExpiration(actionData);

      const subjects = await this.discoverSubjects(actionData);
      const attacker = actionData.actor; // use in AVS branch and legacy path (for clarity)

      if (avsEnabled) {
        const { overridesCreated } = await applyConsequencesAvs({
          actionData,
          subjects,
          attacker,
          analyzeOutcome: (data, subject) => this.analyzeOutcome(data, subject),
          applyOverrides: (data, outcomes) => this.applyOverrides(data, outcomes),
          cache: this.getCacheMap(),
        });
        this.updateButtonToRevert(button);
        notify.info(`Applied ${overridesCreated} AVS overrides for consequences`);
        return overridesCreated;
      }

      const result = await applyConsequencesLegacy({
        actionData,
        subjects,
        analyzeOutcome: (data, subject) => this.analyzeOutcome(data, subject),
        applyOverrides: (data, outcomes) => this.applyOverrides(data, outcomes),
        outcomeToChange: (data, outcome) => this.outcomeToChange(data, outcome),
        getOutcomeTokenId: (outcome) => this.getOutcomeTokenId(outcome),
        applyChangesInternal: (changes) => this.applyChangesInternal(changes),
        groupChangesByObserver: (changes) => this.groupChangesByObserver(changes),
        cacheAfterApply: (data, changes) => this.cacheAfterApply(data, changes),
      });
      if (result.noChanges) {
        notify.info('No changes to apply');
        return 0;
      }
      this.updateButtonToRevert(button);
      return result.count;
    } catch (e) {
      log.error(e);
      return 0;
    }
  }

  async revert(actionData, button) {
    try {
      const avsEnabled = await isConsequencesAvsEnabled();
      if (avsEnabled) {
        const result = await revertConsequencesAvs({
          actionData,
          cache: this.getCacheMap(),
          getTokenById: (id) => this.getTokenById(id),
        });
        if (!result.performed) {
          notify.info('Nothing to revert');
          return;
        }
        this.updateButtonToApply(button);

        if (result.toRemove.length > 0 && result.toRestore.length > 0) {
          notify.info(
            `Reverted ${result.toRemove.length} created overrides and restored ${result.toRestore.length} previous overrides`,
          );
        } else if (result.toRemove.length > 0) {
          notify.info(`Removed ${result.toRemove.length} created AVS overrides`);
        } else {
          notify.info(`Restored ${result.toRestore.length} previous AVS overrides`);
        }
        return;
      }
      // Non-AVS revert -> delegate to base logic (visibility state reversion)
      return await super.revert(actionData, button);
    } catch (e) {
      log.error(e);
    }
  }
}
