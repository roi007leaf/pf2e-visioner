import { MODULE_ID, VISIBILITY_STATES } from '../../../constants.js';
import { appliedConsequencesChangesByMessage } from '../data/message-cache.js';
import { log, notify } from '../infra/notifications.js';
import { shouldFilterAlly } from '../infra/shared-utils.js';
import { ActionHandlerBase } from './base-action.js';

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
  async discoverSubjects(actionData) {
    const tokens = canvas?.tokens?.placeables || [];
    const attacker = actionData?.actor || null;

    // Exclude attacker itself, hazards, and loot tokens from observers
    let potential = tokens.filter((t) => {
      try {
        if (!t || !t.actor) return false;
        if (attacker && t.id === attacker.id) return false;
        const type = t.actor?.type;
        if (type === 'hazard' || type === 'loot') return false;
        // Only apply ignoreAllies when explicitly provided; otherwise let dialog filter live
        if (
          shouldFilterAlly(
            attacker,
            t,
            'enemies',
            actionData?.ignoreAllies === true || actionData?.ignoreAllies === false
              ? actionData.ignoreAllies
              : null,
          )
        )
          return false;
        return true;
      } catch {
        return false;
      }
    });

    // Apply RAW enforcement if enabled
    const { getVisibilityBetween } = await import('../../../utils.js');

    // Filter to only include targets that the attacker is Hidden or Undetected from
    potential = potential.filter((subject) => {
      try {
        // Check visibility state from the subject's perspective toward the attacker
        const visibility = getVisibilityBetween(subject, attacker);
        const isValidTarget = visibility === 'undetected' || visibility === 'hidden';

        return isValidTarget;
      } catch (error) {
        console.warn('Error checking visibility for RAW enforcement:', error);
        // If we can't determine visibility, exclude the target to be safe
        return false;
      }
    });

    // If no valid targets found after RAW filtering, notify the user
    if (potential.length === 0) {
      notify.warn(
        'No valid targets found for Attack Consequences. According to RAW, you can only see consequences from targets that you are Hidden or Undetected from.',
      );
    }

    return potential;
  }
  async analyzeOutcome(actionData, subject) {
    const { getVisibilityBetween } = await import('../../../utils.js');
    const currentVisibility = getVisibilityBetween(subject, actionData.actor);
    return {
      target: subject,
      currentVisibility,
      oldVisibility: currentVisibility,
      oldVisibilityLabel: VISIBILITY_STATES[currentVisibility]?.label || currentVisibility,
      changed: currentVisibility === 'hidden' || currentVisibility === 'undetected',
      newVisibility: 'avs',
    };
  }
  outcomeToChange(actionData, outcome) {
    // Use the outcome's newVisibility if set (from overrides), otherwise default to AVS
    const newVisibility = outcome.newVisibility || 'avs';
    return {
      observer: outcome.target,
      target: actionData.actor,
      newVisibility,
      oldVisibility: outcome.currentVisibility,
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
        target: actionData?.actor || null,
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
      target: actionData.actor,
      newVisibility: o.currentVisibility,
    }));
  }

  async #isAVSEnabled() {
    try {
      return game.settings.get('pf2e-visioner', 'autoVisibilityEnabled') === true;
    } catch {
      return false;
    }
  }

  async #collectExistingOverrides(attacker, observers) {
    // Gather any AVS override flags that reference observer->attacker or attacker->observer
    const results = [];
    if (!attacker) return results;
    for (const obs of observers) {
      try {
        const obsId = obs?.document?.id;
        const tgtId = attacker?.document?.id;
        if (!obsId || !tgtId) continue;
        // Flags live on the TARGET token with key avs-override-from-<observerId>
        const flagForward = attacker.document.getFlag(MODULE_ID, `avs-override-from-${obsId}`);
        if (flagForward) {
          results.push({
            direction: 'observer_to_attacker',
            observer: obs,
            target: attacker,
            data: flagForward,
          });
        }
        const flagReverse = obs.document.getFlag(MODULE_ID, `avs-override-from-${tgtId}`);
        if (flagReverse) {
          results.push({
            direction: 'attacker_to_observer',
            observer: attacker,
            target: obs,
            data: flagReverse,
          });
        }
      } catch {}
    }
    return results;
  }

  async #removeOverridesForConsequences(attacker, observers) {
    const removed = [];
    const { default: AvsOverrideManager } = await import('../infra/avs-override-manager.js');
    for (const obs of observers) {
      try {
        const obsId = obs?.document?.id;
        const atkId = attacker?.document?.id;
        if (!obsId || !atkId) continue;
        // Remove both directions for safety
        const forward = await AvsOverrideManager.removeOverride(obsId, atkId); // observer -> attacker
        const reverse = await AvsOverrideManager.removeOverride(atkId, obsId); // attacker -> observer
        if (forward || reverse) {
          removed.push({ observer: obs, target: attacker, forward, reverse });
        }
      } catch (e) {
        console.warn('PF2E Visioner | Consequences override removal issue:', e);
      }
    }
    return removed;
  }

  // APPLY: If AVS enabled -> ONLY remove overrides (do not apply visibility states). If AVS disabled -> legacy behavior.
  async apply(actionData, button) {
    try {
      const avsEnabled = await this.#isAVSEnabled();
      await this.ensurePrerequisites(actionData);

      const subjects = await this.discoverSubjects(actionData);
      const attacker = actionData.actor; // use in AVS branch and legacy path (for clarity)

      if (avsEnabled) {
        // 1. Collect existing overrides so we can recreate on revert.
        const existing = await this.#collectExistingOverrides(attacker, subjects);
        // 2. Remove all existing overrides for these pairs first.
        await this.#removeOverridesForConsequences(attacker, subjects);

        // 3. Create new AVS overrides based on the visibility changes
        const { default: AvsOverrideManager } = await import('../infra/avs-override-manager.js');
        let overridesCreated = 0;

        // Get outcomes and apply any UI overrides
        const outcomes = [];
        for (const subject of subjects)
          outcomes.push(await this.analyzeOutcome(actionData, subject));
        this.applyOverrides(actionData, outcomes);

        // Filter to changed outcomes and apply encounter/ally filters
        let changed = outcomes.filter((o) => o && o.changed);
        try {
          if (typeof actionData?.encounterOnly === 'boolean') {
            const { filterOutcomesByEncounter } = await import('../infra/shared-utils.js');
            changed = filterOutcomesByEncounter(changed, actionData.encounterOnly, 'target');
          }
        } catch {}

        // Create overrides for each observer->attacker pair and cache them for revert
        const createdOverrides = [];
        for (const outcome of changed) {
          try {
            const observer = outcome.target;
            const newVisibility = outcome.overrideState || outcome.newVisibility || 'observed';

            // Only create override if the new state differs from current
            if (newVisibility !== outcome.currentVisibility) {
              const changesByTarget = new Map([
                [
                  attacker.document.id,
                  {
                    target: attacker,
                    state: newVisibility,
                    hasCover: false, // Consequences don't typically involve cover
                    hasConcealment: false,
                    expectedCover: null,
                  },
                ],
              ]);

              await AvsOverrideManager.setPairOverrides(observer, changesByTarget, {
                source: 'consequences_action',
              });

              // Cache this created override for revert
              createdOverrides.push({
                type: 'avs-created',
                observerId: observer.document.id,
                targetId: attacker.document.id,
                state: newVisibility,
              });

              overridesCreated++;
            }
          } catch (err) {
            console.warn('PF2E Visioner | Failed to create AVS override for consequences:', err);
          }
        }

        // 4. Refresh override validation indicator
        try {
          const { default: indicator } = await import(
            '../../../../scripts/ui/override-validation-indicator.js'
          );
          const allTokens = canvas.tokens?.placeables || [];
          const remaining = [];
          for (const t of allTokens) {
            const flags = t.document?.flags?.[MODULE_ID] || {};
            for (const [k, v] of Object.entries(flags)) {
              if (!k.startsWith('avs-override-from-')) continue;
              if (!v || typeof v !== 'object') continue;
              const observerId = k.replace('avs-override-from-', '');
              const targetId = t.document.id;
              remaining.push({
                observerId,
                targetId,
                observerName: v.observerName || observerId,
                targetName: v.targetName || t.document.name,
                state: v.state,
                hasCover: v.hasCover,
                hasConcealment: v.hasConcealment,
                expectedCover: v.expectedCover,
                currentVisibility: null,
                currentCover: null,
              });
            }
          }
          if (remaining.length === 0) {
            indicator.hide(true);
            indicator.update([], '');
          } else {
            indicator.update(remaining, 'Overrides');
          }
        } catch (indErr) {
          console.warn('PF2E Visioner | Consequences: indicator refresh failed:', indErr);
        }

        // 5. Cache both removal and creation entries for revert.
        const cache = this.getCacheMap();
        if (cache) {
          const existingCache = cache.get(actionData.messageId) || [];

          // Cache removed overrides (to restore on revert)
          const removedEntries = existing.map((r) => ({
            type: 'avs-removed',
            observerId:
              r.direction === 'observer_to_attacker'
                ? r.observer.document.id
                : r.target.document.id,
            targetId:
              r.direction === 'observer_to_attacker'
                ? r.target.document.id
                : r.observer.document.id,
            original: {
              state: r.data?.state,
              source: r.data?.source,
              hasCover: r.data?.hasCover,
              hasConcealment: r.data?.hasConcealment,
              expectedCover: r.data?.expectedCover,
            },
          }));

          // Combine removed and created entries
          const allEntries = removedEntries.concat(createdOverrides);
          cache.set(actionData.messageId, existingCache.concat(allEntries));
        }
        this.updateButtonToRevert(button);
        notify.info(`Applied ${overridesCreated} AVS overrides for consequences`);
        return overridesCreated;
      }

      // --- Non-AVS path: original legacy application (visibility changes + persistence) ---
      const outcomes = [];
      for (const subject of subjects) outcomes.push(await this.analyzeOutcome(actionData, subject));
      this.applyOverrides(actionData, outcomes);

      // Start with changed outcomes
      const changed = outcomes.filter((o) => o && o.changed);

      // Respect encounter filter if requested
      let filtered = changed;
      try {
        if (typeof actionData?.encounterOnly === 'boolean') {
          const { filterOutcomesByEncounter } = await import('../infra/shared-utils.js');
          filtered = filterOutcomesByEncounter(changed, actionData.encounterOnly, 'target');
        }
      } catch {}

      if (filtered.length === 0) {
        notify.info('No changes to apply');
        return 0;
      }

      // Build changes, prefer any override provided for that token id
      let overridesMap = null;
      try {
        if (actionData?.overrides && typeof actionData.overrides === 'object') {
          overridesMap = new Map(Object.entries(actionData.overrides));
        }
      } catch {}
      const changes = filtered
        .map((o) => {
          const ch = this.outcomeToChange(actionData, o);
          if (overridesMap) {
            const id = this.getOutcomeTokenId(o);
            if (id && overridesMap.has(id)) ch.overrideState = overridesMap.get(id);
          }
          return ch;
        })
        .filter(Boolean);

      await this.applyChangesInternal(changes);

      // Explicitly persist visibility maps for observers toward attacker in one scene batch
      try {
        const { getVisibilityMap } = await import('../../../utils.js');
        const groups = this.groupChangesByObserver(changes);
        const updates = [];
        for (const group of groups) {
          const observer = group.observer;
          if (!observer?.document?.id) continue;
          const current = { ...(getVisibilityMap(observer) || {}) };
          for (const item of group.items) {
            const targetId = item?.target?.id;
            if (!targetId) continue;
            const state = item?.overrideState || item?.newVisibility;
            if (!state || state === 'observed') delete current[targetId];
            else current[targetId] = state;
          }
          const update = { _id: observer.document.id };
          if (Object.keys(current).length === 0) update[`flags.${MODULE_ID}.-=visibility`] = null;
          else update[`flags.${MODULE_ID}.visibility`] = current;
          updates.push(update);
        }
        if (updates.length) await canvas.scene.updateEmbeddedDocuments('Token', updates);
      } catch {}

      // Do NOT auto-clear AVS overrides here. This action now strictly applies visibility
      // changes. Clearing overrides is available as a separate explicit user action
      // from the Consequences Preview dialog ("Remove Overrides"). This avoids mixing
      // concerns and unexpected override state toggling during apply.

      this.cacheAfterApply(actionData, changes);
      this.updateButtonToRevert(button);
      return changes.length;
    } catch (e) {
      log.error(e);
      return 0;
    }
  }

  async revert(actionData, button) {
    try {
      const avsEnabled = await this.#isAVSEnabled();
      if (avsEnabled) {
        const cache = this.getCacheMap();
        const entries = cache?.get(actionData.messageId) || [];

        // Separate removed and created entries
        const toRestore = entries.filter((e) => e.type === 'avs-removed');
        const toRemove = entries.filter((e) => e.type === 'avs-created');

        if (toRestore.length === 0 && toRemove.length === 0) {
          notify.info('Nothing to revert');
          return;
        }

        const { default: AvsOverrideManager } = await import('../infra/avs-override-manager.js');
        let actionsPerformed = 0;

        // 1. Remove newly created overrides
        for (const entry of toRemove) {
          try {
            const removed = await AvsOverrideManager.removeOverride(
              entry.observerId,
              entry.targetId,
            );
            if (removed) actionsPerformed++;
          } catch (err) {
            console.warn('PF2E Visioner | Failed to remove created AVS override:', err);
          }
        }

        // 2. Restore previously removed overrides
        for (const entry of toRestore) {
          try {
            const observer = this.getTokenById(entry.observerId);
            const target = this.getTokenById(entry.targetId);
            if (!observer || !target) continue;
            const map = new Map([
              [
                target.document.id,
                {
                  target,
                  state: entry.original?.state,
                  hasCover: entry.original?.hasCover,
                  hasConcealment: entry.original?.hasConcealment,
                  expectedCover: entry.original?.expectedCover,
                },
              ],
            ]);
            // Direction depends on whether original was observer->attacker or attacker->observer. We stored pair as observerId->targetId.
            await AvsOverrideManager.setPairOverrides(observer, map, {
              source: entry.original?.source || 'consequences_action',
            });
            actionsPerformed++;
          } catch (err) {
            console.warn('PF2E Visioner | Failed to restore AVS override:', err);
          }
        }

        // Clear all entries from cache
        if (cache) cache.delete(actionData.messageId);
        this.updateButtonToApply(button);

        if (toRemove.length > 0 && toRestore.length > 0) {
          notify.info(
            `Reverted ${toRemove.length} created overrides and restored ${toRestore.length} previous overrides`,
          );
        } else if (toRemove.length > 0) {
          notify.info(`Removed ${toRemove.length} created AVS overrides`);
        } else {
          notify.info(`Restored ${toRestore.length} previous AVS overrides`);
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
