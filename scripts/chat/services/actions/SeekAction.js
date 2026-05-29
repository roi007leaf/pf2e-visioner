import { appliedSeekChangesByMessage } from '../data/message-cache.js';
import { ActionHandlerBase } from './BaseAction.js';
import { applySeekChangesInternal } from './Seek/seek-change-application.js';
import { analyzeSeekOutcome } from './Seek/seek-outcome-analysis.js';
import { discoverSeekSubjects } from './Seek/seek-subject-discovery.js';
import { partitionSeekChangesByLOS } from './Seek/seek-los-partition.js';

export class SeekActionHandler extends ActionHandlerBase {
  constructor() {
    super('seek');
    // Store first used sense as an action-level hint; rows keep their own per-target sense.
    this._usedSenseType = null;
    this._usedSensePrecision = null;
  }
  getApplyActionName() {
    return 'apply-now-seek';
  }
  getRevertActionName() {
    return 'revert-now-seek';
  }
  getCacheMap() {
    return appliedSeekChangesByMessage;
  }
  getOutcomeTokenId(outcome) {
    return outcome?.searchExplorationRowId ?? outcome?.target?.id ?? null;
  }

  getOutcomeObserver(actionData, outcome) {
    return (
      outcome?.observerToken ||
      outcome?.observer ||
      outcome?.searchExplorationObserver ||
      actionData.actorToken ||
      actionData.actor
    );
  }

  async ensurePrerequisites(actionData) {
    const { ensureActionRoll } = await import('../infra/roll-utils.js');
    ensureActionRoll(actionData);
  }

  async discoverSubjects(actionData) {
    return discoverSeekSubjects(actionData);
  }

  async analyzeOutcome(actionData, subject) {
    return analyzeSeekOutcome(actionData, subject, {
      recordSenseUsed: (senseType, precision) => {
        if (!this._usedSenseType && senseType) {
          this._usedSenseType = senseType;
          this._usedSensePrecision = precision;
        }
      },
    });
  }


  buildCacheEntryFromChange(change) {
    // Support both token and wall changes in cache
    if (change?.wallId) {
      return {
        wallId: change.wallId,
        observerId: change?.observer?.id ?? null,
        oldVisibility: change.oldVisibility,
      };
    }
    const tid = change?.target?.id || change?.targetId || null;
    return {
      targetId: tid,
      observerId: change?.observer?.id ?? null,
      oldVisibility: change.oldVisibility,
    };
  }

  entriesToRevertChanges(entries, actionData) {
    const changes = [];
    for (const e of entries) {
      const observer = e?.observerId
        ? canvas?.tokens?.get?.(e.observerId) || actionData.actorToken || actionData.actor
        : actionData.actorToken || actionData.actor;
      if (e?.wallId) {
        // Revert wall state on the seeker back to previous visibility (default hidden)
        const prev = typeof e.oldVisibility === 'string' ? e.oldVisibility : 'hidden';
        changes.push({ observer, wallId: e.wallId, newWallState: prev });
      } else if (e?.targetId) {
        const tgt = this.getTokenById(e.targetId);
        if (tgt)
          changes.push({ observer, target: tgt, newVisibility: e.oldVisibility });
      }
    }
    return changes;
  }

  // For walls, return a change describing wallId + desired state instead of token target
  outcomeToChange(actionData, outcome) {
    try {
      if (outcome?._isWall && outcome?.wallId) {
        const effective = outcome?.overrideState || outcome?.newVisibility || null;
        return {
          observer: this.getOutcomeObserver(actionData, outcome),
          wallId: outcome.wallId,
          newWallState: effective,
          oldVisibility: outcome?.oldVisibility || outcome?.currentVisibility || null,
        };
      }
    } catch { }
    return {
      ...super.outcomeToChange(actionData, outcome),
      observer: this.getOutcomeObserver(actionData, outcome),
    };
  }

  // Override base to support wall overrides passed from UI
  applyOverrides(actionData, outcomes) {
    try {
      // Standard token overrides
      const base = super.applyOverrides(actionData, outcomes) || outcomes;
      // Wall overrides delivered as { __wall__: { [wallId]: state } }
      const wallMap = actionData?.overrides?.__wall__;
      if (wallMap && typeof wallMap === 'object') {
        for (const outcome of base) {
          if (outcome?._isWall && outcome?.wallId && wallMap[outcome.wallId]) {
            outcome.newVisibility = wallMap[outcome.wallId];
            outcome.changed =
              outcome.newVisibility !== (outcome.oldVisibility || outcome.currentVisibility);
            outcome.overrideState = wallMap[outcome.wallId];
          }
        }
      }
      return base;
    } catch {
      return outcomes;
    }
  }

  // Apply token visibility changes as usual, and also persist wall visibility for the seeker
  async applyChangesInternal(changes) {
    return applySeekChangesInternal(changes, {
      groupChangesByObserver: (items) => this.groupChangesByObserver(items),
      getApplyDirection: () => this.getApplyDirection(),
      applyBaseChanges: (items) => super.applyChangesInternal(items),
    });
  }

  // Ensure per-row apply with wall overrides is honored (skip base allowedIds filter)
  async apply(actionData, button) {
    try {
      await this.ensurePrerequisites(actionData);

      if (Array.isArray(actionData?.searchExplorationGroupedOutcomes)) {
        return await this.#applySearchExplorationGroupedOutcomes(actionData, button);
      }

      let outcomes = [];
      if (Array.isArray(actionData?.seekPrecomputedOutcomes)) {
        outcomes = actionData.seekPrecomputedOutcomes.map((outcome) => ({ ...outcome }));
      } else {
        const subjects = await this.discoverSubjects(actionData);
        for (const subject of subjects) {
          outcomes.push(await this.analyzeOutcome(actionData, subject));
        }
      }
      // Apply overrides (supports __wall__)
      this.applyOverrides(actionData, outcomes);

      // Keep only changed outcomes, but always include walls for display
      let filtered = outcomes.filter((outcome) =>
        outcome && (this.isOutcomeActionable(actionData, outcome) || outcome._isWall)
      );

      // Filter out allies if ignoreAllies setting is enabled
      try {
        const ignoreAllies = actionData?.ignoreAllies ?? game.settings.get('pf2e-visioner', 'ignoreAllies');
        if (ignoreAllies) {
          const { shouldFilterAlly } = await import('../infra/shared-utils.js');
          filtered = filtered.filter((o) => {
            if (o._isWall) return true;
            return !shouldFilterAlly(actionData.actor, o.target, 'enemies', true);
          });
        }
      } catch { }

      // If overrides specify a particular token/wall, limit to those only (per-row apply)
      try {
        const ov = actionData?.overrides || {};
        const wallMap =
          ov?.__wall__ && typeof ov.__wall__ === 'object'
            ? new Set(Object.keys(ov.__wall__))
            : new Set();
        const tokenMap = new Set(Object.keys(ov).filter((k) => k !== '__wall__'));
        if (wallMap.size > 0 || tokenMap.size > 0) {
          filtered = filtered.filter((o) => {
            if (o?._isWall && o?.wallId) return wallMap.has(o.wallId);
            const id = this.getOutcomeTokenId(o);
            return id ? tokenMap.has(id) : false;
          });
        }
      } catch { }

      if (filtered.length === 0) {
        (await import('../infra/notifications.js')).notify.info('No changes to apply');
        return 0;
      }

      // Build changes for tokens and walls
      const changes = filtered.map((o) => this.outcomeToChange(actionData, o)).filter(Boolean);

      // Partition by LOS: walls always immediate, tokens checked for LOS
      const { immediateChanges, deferredResults } = await this.#partitionByLOS(
        actionData, changes, filtered
      );

      if (immediateChanges.length > 0) {
        await this.applyChangesInternal(immediateChanges);
        this.cacheAfterApply(actionData, immediateChanges);
      }

      if (deferredResults.length > 0) {
        const deferredSeekManager = (await import('../infra/DeferredSeekManager.js')).default;
        const observerId = (actionData.actorToken || actionData.actor)?.document?.id;
        if (observerId) {
          await deferredSeekManager.storeDeferredResults(observerId, deferredResults);
          const { notify } = await import('../infra/notifications.js');
          notify.info(game.i18n.format('PF2E_VISIONER.DIALOG_TITLES.SEEK_DEFERRED_COUNT', {
            count: deferredResults.length,
          }));
        }
      }

      if (immediateChanges.length > 0) {
        this.updateButtonToRevert(button);
      }
      return immediateChanges.length + deferredResults.length;
    } catch (e) {
      (await import('../infra/notifications.js')).log.error(e);
      return 0;
    }
  }

  async #applySearchExplorationGroupedOutcomes(actionData, button) {
    const outcomes = actionData.searchExplorationGroupedOutcomes.map((outcome) => ({ ...outcome }));
    this.applyOverrides(actionData, outcomes);

    let filtered = outcomes.filter(
      (outcome) =>
        outcome && (this.isOutcomeActionable(actionData, outcome) || outcome.hasActionableChange),
    );

    try {
      const overrides = actionData?.overrides || {};
      const allowedIds = new Set(Object.keys(overrides).filter((key) => key !== '__wall__'));
      const wallIds = new Set(Object.keys(overrides.__wall__ || {}));
      if (allowedIds.size > 0 || wallIds.size > 0) {
        filtered = filtered.filter((outcome) => {
          if (outcome?._isWall && outcome?.wallId) return wallIds.has(outcome.wallId);
          const id = this.getOutcomeTokenId(outcome);
          return id ? allowedIds.has(id) : false;
        });
      }
    } catch { }

    if (filtered.length === 0) {
      (await import('../infra/notifications.js')).notify.info('No changes to apply');
      return 0;
    }

    const changes = filtered.map((outcome) => this.outcomeToChange(actionData, outcome)).filter(Boolean);
    await this.applyChangesInternal(changes);
    this.cacheAfterApply(actionData, changes);
    this.updateButtonToRevert(button);
    return changes.length;
  }

  async #partitionByLOS(actionData, changes, outcomes) {
    return partitionSeekChangesByLOS(actionData, changes, outcomes);
  }

}
