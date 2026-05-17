/**
 * AVS Override Manager (Generic)
 * Centralizes how actions set and clear Auto-Visibility System (AVS) overrides.
 *
 * Design goals:
 * - Single choke point for per-action policies (seek, point-out, hide, diversion, consequences, sneak)
 * - Reuse existing hook-based writer setAVSPairOverrides for persistence and EVS integration
 * - Provide clear helpers for both array-of-changes and Map<targetId, changeData> inputs
 */

import { MODULE_ID } from '../../../constants.js';
import {
  setPerceptionProfileBetween,
  setVisibilityBetween as setVisibility,
} from '../../../utils.js';
import {
  legacyVisibilityToProfile,
  normalizePerceptionProfile,
  overrideToDisplayVisibility,
} from '../../../visibility/perception-profile.js';

function buildOverrideProfile(data = {}) {
  const baseProfile = legacyVisibilityToProfile(data.state);
  const coverState = data.coverState ?? data.expectedCover ?? baseProfile.coverState;
  const hasConcealment =
    data.state === 'concealed'
      ? true
      : typeof data.hasConcealment === 'boolean'
        ? data.hasConcealment
        : baseProfile.hasConcealment;

  return normalizePerceptionProfile({
    ...baseProfile,
    detectionState: data.detectionState ?? baseProfile.detectionState,
    awarenessState: data.awarenessState ?? baseProfile.awarenessState,
    coverState,
    detectionSense: data.detectionSense ?? baseProfile.detectionSense,
    hasConcealment,
  });
}

function getTokenId(tokenLike) {
  return tokenLike?.document?.id || tokenLike?.id || null;
}

function resolveTokenPlaceable(tokenLike) {
  if (!tokenLike) return null;
  if (typeof tokenLike === 'string') {
    return globalThis.canvas?.tokens?.get?.(tokenLike) || null;
  }
  if (tokenLike.document?.id) return tokenLike;
  if (tokenLike.object?.document?.id) return tokenLike.object;

  const tokenId = getTokenId(tokenLike);
  const canvasToken = tokenId ? globalThis.canvas?.tokens?.get?.(tokenId) : null;
  if (canvasToken?.document?.id) return canvasToken;

  return tokenLike;
}

function asChangesByTarget(changesInput, defaultState = null) {
  // Accept Map<string, { target, state, hasCover?, hasConcealment?, expectedCover? }>
  if (changesInput instanceof Map) return changesInput;

  const map = new Map();
  const arr = Array.isArray(changesInput) ? changesInput : [changesInput].filter(Boolean);
  for (const ch of arr) {
    if (!ch) continue;
    const target = resolveTokenPlaceable(ch.target || ch.targetToken || null);
    if (!target?.document?.id) continue;
    const coverOnly = ch.coverOnly === true;
    const state = ch.state || ch.overrideState || ch.newVisibility || defaultState;
    if (!state) continue;

    // Skip 'avs' visibility state
    if (state === 'avs' && !coverOnly) continue;

    // Prefer provided flags; otherwise infer conservatively
    const expectedCover = ch.expectedCover;
    const hasCover =
      typeof ch.hasCover === 'boolean'
        ? ch.hasCover
        : expectedCover === 'standard' || expectedCover === 'greater';
    const hasConcealment =
      typeof ch.hasConcealment === 'boolean' ? ch.hasConcealment : ['concealed'].includes(state);

    map.set(target.document.id, {
      target,
      state,
      hasCover,
      hasConcealment,
      expectedCover,
      detectionState: ch.detectionState,
      awarenessState: ch.awarenessState,
      coverState: ch.coverState,
      detectionSense: ch.detectionSense,
      coverOnly,
      coverOverrideSource: ch.coverOverrideSource,
    });
  }
  return map;
}

function hasTakeCoverCoverTracking(data) {
  return (
    data?.coverOnly === true ||
    data?.coverOverrideSource === 'take_cover_action' ||
    (data?.source === 'take_cover_action' && data?.expectedCover)
  );
}

function isRemainingVisibilityOverrideData(flagData) {
  if (!flagData || flagData.takeCoverExpirationPending === true) return false;
  if (flagData.coverOnly === true && hasTakeCoverCoverTracking(flagData)) return false;
  return !!flagData.state && flagData.state !== 'avs';
}

function willKeepVisibilityAfterTakeCoverRemoval(flagData) {
  if (!flagData) return false;
  if (flagData.coverOnly === true) return false;
  return !!flagData.state && flagData.state !== 'avs';
}

function hasRemainingVisibilityOverrideInvolving(tokenLike) {
  const tokenId = getTokenId(tokenLike);
  if (!tokenId) return false;

  const checkFlags = (token) => {
    const tokenTargetId = getTokenId(token);
    const flags = token?.document?.flags?.[MODULE_ID] || {};
    return Object.entries(flags).some(([flagKey, flagData]) => {
      if (!flagKey.startsWith('avs-override-from-')) return false;
      if (!isRemainingVisibilityOverrideData(flagData)) return false;
      const observerId = flagData?.observerId || flagKey.slice('avs-override-from-'.length);
      const targetId = flagData?.targetId || tokenTargetId;
      return observerId === tokenId || targetId === tokenId;
    });
  };

  if (checkFlags(tokenLike)) return true;
  for (const token of globalThis.canvas?.tokens?.placeables || []) {
    if (checkFlags(token)) return true;
  }

  return false;
}

export class AvsOverrideManager {
  // Register the avsOverride hook once
  static registerHooks() {
    try {
      Hooks.off('avsOverride', this.onAVSOverride); // ensure no dupes
    } catch {}
    Hooks.on('avsOverride', this.onAVSOverride.bind(this));
  }
  /**
   * Set AVS pair overrides to prevent automatic recalculation of manually set visibility states
   * Centralized here to keep all override lifecycle in one place.
   * - Sneak: one-way (observer -> target only)
   * - Others: symmetric (both directions)
   * @param {Token} observer
   * @param {Map<string, {target: Token, state: string, hasCover?: boolean, hasConcealment?: boolean, expectedCover?: string}>} changesByTarget
   * @param {{source?: string}} options
   */
  static async setPairOverrides(observer, changesByTarget, options = {}) {
    if (!game.user?.isGM) return false;

    try {
      const src = options.source || 'manual_action';
      // Do not create overrides when the observer is Foundry-hidden
      try {
        if (observer?.document?.hidden === true) return false;
      } catch {}

      // Skip creating overrides for hazard and loot tokens - they don't participate in visibility systems
      const isHazardOrLoot = (token) => {
        try {
          const actorType = token?.actor?.type?.toLowerCase();
          return actorType === 'hazard' || actorType === 'loot';
        } catch {
          return false;
        }
      };

      if (isHazardOrLoot(observer)) {
        return false; // Skip entirely if observer is hazard/loot
      }
      // Only treat as sneak when explicitly requested by source; do not infer from token flags
      // Manual edits must remain symmetric even if the token is currently sneaking
      const isSneakAction = src === 'sneak_action';

      // Direction policy by source:
      // - One-way: sneak, hide, diversion, seek, point-out, manual edits from Token Manager
      //   Rationale: Token Manager already calls this with the correct logical direction
      //   (observer -> target). Making manual_action symmetric here caused double overrides.
      // - Symmetric: region overrides and any other bulk/system-generated sources
      const isOneWayBySource =
        isSneakAction ||
        src === 'hide_action' ||
        src === 'diversion_action' ||
        src === 'seek_action' ||
        src === 'seek_action_deferred' ||
        src === 'point_out_action' ||
        src === 'manual_action' ||
        src === 'take_cover_action' ||
        src === 'encounter_stealth_initiative';

      let appliedCount = 0;
      for (const [, changeData] of changesByTarget) {
        const target = changeData.target;
        const state = changeData.state;

        // Skip if target is hazard/loot
        if (isHazardOrLoot(target)) {
          continue; // Skip this target entirely
        }

        const payload = {
          observer,
          target,
          state,
          source: options.source || (isSneakAction ? 'sneak_action' : 'manual_action'),
          hasCover: typeof changeData.hasCover === 'boolean' ? changeData.hasCover : undefined,
          hasConcealment: changeData.hasConcealment || false,
          expectedCover: changeData.expectedCover,
          detectionState: changeData.detectionState,
          awarenessState: changeData.awarenessState,
          coverState: changeData.coverState,
          detectionSense: changeData.detectionSense,
          timedOverride: changeData.timedOverride || options.timedOverride || null,
          coverOnly: changeData.coverOnly === true || options.coverOnly === true,
          coverOverrideSource: changeData.coverOverrideSource || options.coverOverrideSource,
        };

        if (isOneWayBySource) {
          // One-way only (observer -> target)
          await this.onAVSOverride(payload);
        } else {
          // Symmetric
          await this.onAVSOverride(payload);
          // Skip reverse if the swapped observer (original target) is Foundry-hidden or is hazard/loot
          try {
            if (target?.document?.hidden === true || isHazardOrLoot(target)) continue;
          } catch {}
          await this.onAVSOverride({ ...payload, observer: target, target: observer });
        }
        appliedCount++;
      }

      if (appliedCount > 0 && !options.skipIndicatorRefresh) {
        await this.#refreshSystems({ scope: 'pair', reason: 'set-pair-overrides' });
      }
    } catch (error) {
      console.error('PF2E Visioner | Error setting AVS overrides in manager:', error);
    }
  }

  static async onAVSOverride(overrideData) {
    if (!game.user?.isGM) return false;

    const {
      observer,
      target,
      state,
      source,
      timedOverride,
      detectionState,
      awarenessState,
      coverState,
      detectionSense,
      coverOnly,
    } = overrideData || {};
    let { hasCover, hasConcealment, expectedCover } = overrideData || {};
    if (!observer?.document?.id || !target?.document?.id || !state) {
      console.warn('PF2E Visioner | Invalid AVS override data:', overrideData);
      return;
    }

    // Filter out 'avs' visibility state from override processing
    if (state === 'avs' && coverOnly !== true) {
      return;
    }

    // Skip creating overrides for hazard and loot tokens - they don't participate in visibility systems
    const isHazardOrLoot = (token) => {
      try {
        const actorType = token?.actor?.type?.toLowerCase();
        return actorType === 'hazard' || actorType === 'loot';
      } catch {
        return false;
      }
    };

    if (isHazardOrLoot(observer) || isHazardOrLoot(target)) {
      return; // Skip override creation entirely for hazard/loot tokens
    }
    let profile = null;
    try {
      // If expectedCover isn't provided, compute it once at apply-time ONLY for non-manual sources
      if (!expectedCover && (source || '').toLowerCase() !== 'manual_action') {
        try {
          const { CoverDetector } = await import('../../../cover/auto-cover/CoverDetector.js');
          const coverDetector = new CoverDetector();
          const coverResult = coverDetector.detectBetweenTokens(observer, target);
          // Only persist meaningful levels; ignore 'none' to avoid noise
          if (coverResult === 'standard' || coverResult === 'greater' || coverResult === 'lesser') {
            expectedCover = coverResult;
          }
        } catch {
          // ignore cover computation errors; leave expectedCover undefined
        }
      }
      // If hasCover not explicitly provided, infer from expectedCover only when we have a concrete level
      if (typeof hasCover !== 'boolean' && expectedCover) {
        hasCover = expectedCover !== 'none';
      }
      profile = buildOverrideProfile({
        state,
        detectionState,
        awarenessState,
        coverState,
        detectionSense,
        hasConcealment,
        expectedCover,
      });
      await this.storeOverrideFlag(observer, target, {
        state,
        source: source || 'unknown',
        hasCover: !!hasCover,
        hasConcealment: profile.hasConcealment,
        expectedCover,
        detectionState: profile.detectionState,
        awarenessState: profile.awarenessState,
        coverState: profile.coverState,
        detectionSense: profile.detectionSense,
        timedOverride: timedOverride || null,
        coverOnly: coverOnly === true,
        coverOverrideSource: overrideData.coverOverrideSource || (coverOnly ? source : undefined),
      });
    } catch (e) {
      console.error('PF2E Visioner | Failed to store override flag:', e);
      return false;
    }

    try {
      if (!profile) return;
      await this.clearGlobalCaches();
      if (coverOnly !== true && state !== 'avs') {
        await this.applyOverrideProfileFromFlag(observer, target, profile, {
          source,
          preserveEncounterUnnoticed: source === 'encounter_stealth_initiative',
        });
      }
    } catch (e) {
      console.error('PF2E Visioner | Error applying AVS override from flag:', e);
    }
  }

  static async clearGlobalCaches() {
    try {
      const { autoVisibilitySystem } = await import('../../../visibility/auto-visibility/index.js');
      if (autoVisibilitySystem?.orchestrator?.clearPersistentCaches) {
        autoVisibilitySystem.orchestrator.clearPersistentCaches();
      }
    } catch (e) {}
  }

  static async storeOverrideFlag(observer, target, data) {
    if (!game.user?.isGM) return false;

    const observerDocId = observer.document.id;
    const targetDocId = target.document.id;

    const flagKey = `avs-override-from-${observerDocId}`;
    const existing = target.document.getFlag?.(MODULE_ID, flagKey);
    const isMergingCoverIntoVisibilityOverride =
      data.coverOnly === true &&
      existing &&
      typeof existing === 'object' &&
      !!existing.state &&
      existing.state !== 'avs' &&
      existing.coverOnly !== true;

    const flagData = isMergingCoverIntoVisibilityOverride ? {
      ...existing,
      hasCover: data.hasCover,
      expectedCover: data.expectedCover,
      coverOnly: false,
      coverOverrideSource: data.coverOverrideSource || 'take_cover_action',
      timestamp: Date.now(),
      observerId: observerDocId,
      targetId: targetDocId,
      observerName: observer.name,
      targetName: target.name,
    } : {
      ...data,
      coverOverrideSource:
        data.coverOverrideSource || (data.coverOnly ? data.source || 'take_cover_action' : undefined),
      timestamp: Date.now(),
      observerId: observerDocId,
      targetId: targetDocId,
      observerName: observer.name,
      targetName: target.name,
      timedOverride: data.timedOverride || null,
    };
    await target.document.setFlag(MODULE_ID, flagKey, flagData);
  }

  static async applyOverrideFromFlag(observer, target, state) {
    await setVisibility(observer, target, state, { isAutomatic: true, source: 'avs_override' });
    try {
      Hooks.call(
        'pf2e-visioner.visibilityChanged',
        observer.document.id,
        target.document.id,
        state,
      );
    } catch {}
  }

  static async applyOverrideProfileFromFlag(observer, target, profile, options = {}) {
    const normalized = normalizePerceptionProfile(profile);
    const displayState = overrideToDisplayVisibility({
      ...normalized,
      source: options.source,
    }, {
      preserveEncounterUnnoticed: !!options.preserveEncounterUnnoticed,
    });

    await setPerceptionProfileBetween(observer, target, normalized, {
      isAutomatic: true,
      source: 'avs_override',
      preserveEncounterUnnoticed: !!options.preserveEncounterUnnoticed,
    });
    try {
      Hooks.call(
        'pf2e-visioner.visibilityChanged',
        observer.document.id,
        target.document.id,
        displayState,
      );
    } catch {}
  }

  // Remove a specific override (persistent flag-based)
  static async removeOverride(observerId, targetId, options = {}) {
    if (!game.user?.isGM) return false;

    try {
      const targetToken = canvas.tokens?.get(targetId);
      if (!targetToken) return false;
      const flagKey = `avs-override-from-${observerId}`;
      const flagData = targetToken.document.getFlag(MODULE_ID, flagKey);
      if (flagData) {
        if (
          options.preserveTakeCoverTracking === true &&
          hasTakeCoverCoverTracking(flagData) &&
          flagData.coverOnly !== true
        ) {
          await this.#convertToTakeCoverOnlyOverride(observerId, targetId, flagData, targetToken);
          await this.clearGlobalCaches();
          await this.#syncPairVisibilityToAvs(observerId, targetId);
          try {
            const { eventDrivenVisibilitySystem } = await import(
              '../../../visibility/auto-visibility/EventDrivenVisibilitySystem.js'
            );
            await eventDrivenVisibilitySystem.recalculateForTokens([observerId, targetId]);
          } catch {}
          this.#notifyVisibilityControlReleased(observerId, targetId);
          return true;
        }
        const wasVisibilityOverride = !!flagData.state && flagData.state !== 'avs';
        if (hasTakeCoverCoverTracking(flagData)) {
          await this.#clearTakeCoverMapEntry(observerId, targetId, options);
        }
        await targetToken.document.unsetFlag(MODULE_ID, flagKey);
        await this.clearGlobalCaches();
        if (wasVisibilityOverride) {
          await this.#syncPairVisibilityToAvs(observerId, targetId);
        }
        try {
          const { eventDrivenVisibilitySystem } = await import(
            '../../../visibility/auto-visibility/EventDrivenVisibilitySystem.js'
          );
          // Recalc both sides to be thorough
          await eventDrivenVisibilitySystem.recalculateForTokens([observerId, targetId]);
        } catch {}
        if (wasVisibilityOverride) {
          this.#notifyVisibilityControlReleased(observerId, targetId);
        }
        return true;
      }
    } catch (error) {
      console.error('PF2E Visioner | Failed to remove override flag:', error);
    }
    return false;
  }

  static async #convertToTakeCoverOnlyOverride(observerId, targetId, flagData, targetToken) {
    const flagKey = `avs-override-from-${observerId}`;
    const coverSource = flagData.coverOverrideSource || 'take_cover_action';
    const expectedCover = flagData.expectedCover;
    const hasCover =
      typeof flagData.hasCover === 'boolean'
        ? flagData.hasCover
        : expectedCover === 'standard' || expectedCover === 'greater' || expectedCover === 'lesser';

    const nextFlag = {
      ...flagData,
      observerId,
      targetId,
      state: 'avs',
      source: coverSource,
      hasCover,
      hasConcealment: false,
      coverOnly: true,
      coverOverrideSource: coverSource,
      expectedCover,
      timestamp: Date.now(),
    };

    await targetToken.document.setFlag(MODULE_ID, flagKey, nextFlag);
  }

  static async #syncPairVisibilityToAvs(observerId, targetId) {
    try {
      const observer = canvas.tokens?.get(observerId);
      const target = canvas.tokens?.get(targetId);
      if (!observer || !target) return false;

      const [{ optimizedVisibilityCalculator }, { setVisibilityBetween }] = await Promise.all([
        import('../../../visibility/auto-visibility/index.js'),
        import('../../../stores/visibility-map.js'),
      ]);
      const calculate =
        optimizedVisibilityCalculator?.calculateVisibilityWithoutOverrides ||
        optimizedVisibilityCalculator?.calculateVisibility;
      if (typeof calculate !== 'function' || typeof setVisibilityBetween !== 'function') {
        return false;
      }

      const result = await calculate.call(optimizedVisibilityCalculator, observer, target);
      const state = typeof result === 'object' && result?.state ? result.state : result;
      if (!state) return false;

      await setVisibilityBetween(observer, target, state, {
        isAutomatic: true,
        source: 'avs_control_release',
      });
      return true;
    } catch {
      return false;
    }
  }

  static #notifyVisibilityControlReleased(observerId, targetId) {
    try {
      Hooks.call('pf2e-visioner.visibilityChanged', observerId, targetId, 'avs');
    } catch {}
  }

  static async removeTakeCoverTracking(observerId, targetId, options = {}) {
    try {
      const targetToken = canvas.tokens?.get(targetId);
      if (!targetToken) {
        return false;
      }
      const flagKey = `avs-override-from-${observerId}`;
      const flagData = targetToken.document.getFlag(MODULE_ID, flagKey);
      if (!hasTakeCoverCoverTracking(flagData)) {
        return false;
      }
      if (flagData.coverOnly === true) {
        return this.removeOverride(observerId, targetId, options);
      }

      await this.#clearTakeCoverMapEntry(observerId, targetId, options);

      const nextFlag = { ...flagData };
      delete nextFlag.coverOverrideSource;
      delete nextFlag.expectedCover;
      delete nextFlag.takeCoverExpirationPending;
      delete nextFlag.takeCoverExpirationReason;
      nextFlag.hasCover = false;
      nextFlag.coverOnly = false;
      nextFlag.timestamp = Date.now();
      await targetToken.document.setFlag(MODULE_ID, flagKey, nextFlag);
      await this.clearGlobalCaches();
      return true;
    } catch (error) {
      console.warn('PF2E Visioner | Failed to remove Take Cover tracking:', error);
      return false;
    }
  }

  static async markTakeCoverExpirationPending(tokenLike, reason = 'unknown') {
    try {
      if (!game.user?.isGM) return false;
      const targetToken = resolveTokenPlaceable(tokenLike);
      const targetId = getTokenId(targetToken);
      if (!targetToken?.document || !targetId) return false;

      const flags = targetToken.document.flags?.[MODULE_ID] || {};
      const entries = Object.entries(flags).filter(
        ([flagKey, flagData]) =>
          flagKey.startsWith('avs-override-from-') && hasTakeCoverCoverTracking(flagData),
      );
      if (entries.length === 0) return false;

      for (const [flagKey, flagData] of entries) {
        const nextFlag = {
          ...flagData,
          takeCoverExpirationPending: true,
          takeCoverExpirationReason: reason,
          timestamp: Date.now(),
        };
        await targetToken.document.setFlag(MODULE_ID, flagKey, nextFlag);
      }
      return true;
    } catch (error) {
      console.warn('PF2E Visioner | Failed to mark Take Cover expiration pending:', error);
      return false;
    }
  }

  static async expireTakeCoverForToken(tokenLike, reason = 'unknown', options = {}) {
    try {
      if (!game.user?.isGM) return false;
      const targetToken = resolveTokenPlaceable(tokenLike);
      const targetId = getTokenId(targetToken);
      if (!targetToken?.document || !targetId) return false;

      const observerIds = new Set();
      const flags = targetToken.document.flags?.[MODULE_ID] || {};
      for (const [flagKey, flagData] of Object.entries(flags)) {
        if (!flagKey.startsWith('avs-override-from-')) continue;
        if (!hasTakeCoverCoverTracking(flagData)) continue;
        observerIds.add(flagData?.observerId || flagKey.slice('avs-override-from-'.length));
      }

      for (const token of canvas.tokens?.placeables || []) {
        const observerId = getTokenId(token);
        if (!observerId || observerIds.has(observerId)) continue;
        const flagData = targetToken.document.getFlag?.(MODULE_ID, `avs-override-from-${observerId}`);
        if (hasTakeCoverCoverTracking(flagData)) observerIds.add(observerId);
      }

      if (observerIds.size === 0) return false;

      let removedCount = 0;
      let shouldQueueVisibilityValidation = false;
      const tokenIdsToRefresh = new Set([targetId]);
      for (const observerId of observerIds) {
        const flagData = targetToken.document.getFlag?.(
          MODULE_ID,
          `avs-override-from-${observerId}`,
        );
        if (willKeepVisibilityAfterTakeCoverRemoval(flagData)) {
          shouldQueueVisibilityValidation = true;
        }
        const removed = await this.removeTakeCoverTracking(observerId, targetId, {
          ...options,
          reason,
        });
        if (removed) {
          removedCount++;
          tokenIdsToRefresh.add(observerId);
        }
      }

      if (removedCount > 0 && options.refresh !== false) {
        await this.clearGlobalCaches();
        try {
          const { eventDrivenVisibilitySystem } = await import(
            '../../../visibility/auto-visibility/EventDrivenVisibilitySystem.js'
          );
          await eventDrivenVisibilitySystem.recalculateForTokens(Array.from(tokenIdsToRefresh));
        } catch {}
        try {
          const { default: indicator } = await import('../../../ui/OverrideValidationIndicator.js');
          if (
            shouldQueueVisibilityValidation ||
            hasRemainingVisibilityOverrideInvolving(targetToken)
          ) {
            await this.#queuePostTakeCoverVisibilityValidation(targetId);
          } else {
            indicator?.hide?.(true);
          }
        } catch {}
      }

      return removedCount > 0;
    } catch (error) {
      console.warn('PF2E Visioner | Failed to expire Take Cover tracking:', error);
      return false;
    }
  }

  static async removeAllOverridesInvolving(tokenId) {
    if (!game.user?.isGM) return false;
    if (!tokenId) return;
    if (!canvas?.tokens?.placeables) return;

    const allTokens = canvas.tokens.placeables;
    const tokensToRecalculate = new Set([tokenId]);

    for (const token of allTokens) {
      try {
        const flags = token.document.flags?.[MODULE_ID] || {};
        for (const flagKey of Object.keys(flags)) {
          if (flagKey.startsWith('avs-override-from-')) {
            const overrideData = flags[flagKey];

            if (overrideData?.observerId === tokenId || overrideData?.targetId === tokenId) {
              try {
                if (hasTakeCoverCoverTracking(overrideData)) {
                  const observerId =
                    overrideData?.observerId || flagKey.slice('avs-override-from-'.length);
                  const targetId = overrideData?.targetId || token.document?.id || token.id;
                  await this.#clearTakeCoverMapEntry(observerId, targetId);
                }
                await token.document.unsetFlag(MODULE_ID, flagKey);
                tokensToRecalculate.add(token.id);
              } catch (e) {
                console.warn(
                  `PF2E Visioner | Failed to remove override flag ${flagKey} from token ${token.name}:`,
                  e,
                );
              }
            }
          }
        }
      } catch (e) {
        console.warn(
          `PF2E Visioner | Error processing token ${token?.name || 'unknown'} during override cleanup:`,
          e,
        );
      }
    }

    if (tokensToRecalculate.size > 1) {
      await this.clearGlobalCaches();
      try {
        const { eventDrivenVisibilitySystem } = await import(
          '../../../visibility/auto-visibility/EventDrivenVisibilitySystem.js'
        );
        await eventDrivenVisibilitySystem.recalculateForTokens(Array.from(tokensToRecalculate));
      } catch (e) {
        console.warn('PF2E Visioner | Failed to recalculate visibility after override cleanup:', e);
      }
    }

    try {
      const { default: indicator } = await import('../../../ui/OverrideValidationIndicator.js');
      if (indicator && typeof indicator.hide === 'function') {
        indicator.hide(true);
      }
    } catch (e) {
      console.warn('PF2E Visioner | Failed to hide override indicator after cleanup:', e);
    }
  }

  static async #clearTakeCoverMapEntry(observerId, targetId, options = {}) {
    try {
      const observerToken = canvas.tokens?.get?.(observerId);
      const targetToken = canvas.tokens?.get?.(targetId);
      if (!observerToken || !targetToken) return;
      const { setCoverBetween } = await import('../../../stores/cover-map.js');
      await setCoverBetween(observerToken, targetToken, 'none', {
        skipEphemeralUpdate: false,
        skipTakeCoverTrackingSync: true,
      });
    } catch (error) {
      console.warn('PF2E Visioner | Failed to clear Take Cover manual cover:', error);
    }
  }

  static async #queuePostTakeCoverVisibilityValidation(tokenId) {
    if (!tokenId) return false;
    try {
      const { eventDrivenVisibilitySystem } = await import(
        '../../../visibility/auto-visibility/EventDrivenVisibilitySystem.js'
      );
      const manager = eventDrivenVisibilitySystem?.overrideValidationManager;
      if (!manager) return false;

      if (typeof manager.queueOverrideValidation === 'function') {
        manager.queueOverrideValidation(tokenId, { force: true });
      } else if (typeof manager.queue === 'function') {
        manager.queue(tokenId, { force: true });
      } else {
        return false;
      }

      if (typeof manager.processQueuedValidations === 'function') {
        await manager.processQueuedValidations({ skipMovedFilter: true });
      }
      return true;
    } catch {
      return false;
    }
  }

  // Clear all overrides across all tokens
  static async clearAllOverrides() {
    if (!game.user?.isGM) return false;

    const allTokens = canvas.tokens?.placeables || [];
    for (const token of allTokens) {
      try {
        const flags = token.document.flags?.[MODULE_ID] || {};
        for (const flagKey of Object.keys(flags)) {
          if (flagKey.startsWith('avs-override-from-')) {
            try {
              const overrideData = flags[flagKey];
              if (hasTakeCoverCoverTracking(overrideData)) {
                const observerId =
                  overrideData?.observerId || flagKey.slice('avs-override-from-'.length);
                const targetId = overrideData?.targetId || token.document?.id || token.id;
                await this.#clearTakeCoverMapEntry(observerId, targetId);
              }
              await token.document.unsetFlag(MODULE_ID, flagKey);
            } catch {}
          }
        }
      } catch {}
    }
    // Recalculate everyone once after bulk clear
    try {
      const { eventDrivenVisibilitySystem } = await import(
        '../../../visibility/auto-visibility/EventDrivenVisibilitySystem.js'
      );
      await eventDrivenVisibilitySystem.recalculateAllVisibility(true);
    } catch {}
  }
  static async applyOverrides(observer, changesInput, { source, timedOverride, ...options } = {}) {
    if (!game.user?.isGM) return false;

    const normalizedObserver = resolveTokenPlaceable(observer);
    try {
      if (normalizedObserver?.document?.hidden === true) return false;
    } catch {}
    const map = asChangesByTarget(changesInput);
    if (map.size === 0 || !normalizedObserver?.document?.id) {
      return false;
    }
    await this.setPairOverrides(normalizedObserver, map, {
      source: source || 'manual_action',
      timedOverride,
      ...options,
    });
    return true;
  }

  // Seek: set/update overrides to match outcome; create if missing
  static async applyForSeek(observer, changesInput) {
    return this.applyOverrides(observer, changesInput, { source: 'seek_action' });
  }

  // Point Out: ensure override exists as hidden (upgrade undetected->hidden; create hidden otherwise)
  static async applyForPointOut(allyObserver, targetToken) {
    const map = asChangesByTarget({ target: targetToken, state: 'hidden' });
    return this.applyOverrides(allyObserver, map, { source: 'point_out_action' });
  }

  // Hide: set/update overrides to outcome; create if missing
  static async applyForHide(observer, changesInput) {
    return this.applyOverrides(observer, changesInput, { source: 'hide_action' });
  }

  // Diversion: set/update overrides to outcome; create if missing
  static async applyForDiversion(observer, changesInput) {
    return this.applyOverrides(observer, changesInput, { source: 'diversion_action' });
  }

  // Take Cover: not strictly an AVS state but some flows may tag concealment reasons
  static async applyForTakeCover(observer, changesInput) {
    return this.applyOverrides(observer, changesInput, {
      source: 'take_cover_action',
      coverOnly: true,
      coverOverrideSource: 'take_cover_action',
    });
  }

  // Consequences: clear pair overrides for provided pairs (both directions for safety)
  static async clearForConsequences(observer, targets, { refresh = true } = {}) {
    const arr = Array.isArray(targets) ? targets : [targets].filter(Boolean);
    for (const tgt of arr) {
      try {
        const obsId = observer?.document?.id || observer?.id;
        const tgtId = tgt?.document?.id || tgt?.id;
        if (!obsId || !tgtId) continue;
        await this.removeOverride(obsId, tgtId);
        await this.removeOverride(tgtId, obsId);
      } catch (e) {
        console.warn('PF2E Visioner | Failed to clear AVS override for consequences:', e);
      }
    }
    if (refresh) await this.#refreshSystems({ scope: 'batch', reason: 'clear-consequences' });
    return true;
  }

  // Sneak: one-way overrides from observers to sneaking token(s)
  static async applyForSneak(observer, changesInput, options = {}) {
    if (!game.user?.isGM) return false;

    const map = asChangesByTarget(changesInput);
    if (map.size === 0 || !observer) return false;
    // Mark as sneak so setAVSPairOverrides enforces one-way semantics
    await this.setPairOverrides(observer, map, { source: 'sneak_action', ...options });
    return true;
  }

  /**
   * Centralized post-mutation refresh for perception, token visuals, indicators, and dialogs.
   * Kept private to avoid accidental external heavy refresh calls; callers opt-in via method params.
   * Skips expensive work under Jest or if canvas not ready.
   */
  static async #refreshSystems({ scope = 'pair', reason = 'avs-override-changed' } = {}) {
    // Avoid during tests (unit tests mock minimal canvas) unless explicitly forced in future
    if (globalThis.jest) return;
    if (!globalThis.canvas) return;
    try {
      // 1. Perception refresh (optimized if available)
      try {
        const { forceRefreshEveryonesPerception } = await import(
          '../../../services/optimized-socket.js'
        );
        await forceRefreshEveryonesPerception();
      } catch {
        try {
          const { refreshLocalPerception } = await import('../../../services/socket.js');
          refreshLocalPerception();
        } catch {}
      }

      // 2. Token visuals (safe if no dice animation)
      try {
        const { updateTokenVisuals } = await import('../../../services/visual-effects.js');
        await updateTokenVisuals();
      } catch {}

      // 3. Hover indicators: clear so they repopulate lazily
      try {
        const mod = await import('../../../services/HoverTooltips.js');
        if (typeof mod.hideAllVisibilityIndicators === 'function') {
          mod.hideAllVisibilityIndicators();
        }
      } catch {}

      // 4. Override validation indicator — only update on batch clears, not on every pair set
      if (scope === 'batch') {
        try {
          const { default: indicator } = await import('../../../ui/OverrideValidationIndicator.js');
          indicator.hide(true);
        } catch {}
        try {
          const { default: indicator } = await import('../../../ui/OverrideValidationIndicator.js');
          indicator.update([], '');
        } catch {}
      }
    } catch (err) {
      console.warn('PF2E Visioner | Post-override refresh issue:', err, reason, scope);
    }
  }

  static async getOverride(observer, target) {
    try {
      const overrideData = await this.getOverrideData(observer, target);
      if (overrideData) return overrideToDisplayVisibility(overrideData);
    } catch {
      /* ignore */
    }
  }

  static async getOverrideProfile(observer, target) {
    try {
      const overrideData = await this.getOverrideData(observer, target);
      return overrideData ? normalizePerceptionProfile(overrideData) : null;
    } catch {
      return null;
    }
  }

  static async getOverrideData(observer, target) {
    const observerToken =
      typeof observer === 'string' ? canvas.tokens?.get?.(observer) : observer;
    const targetToken = typeof target === 'string' ? canvas.tokens?.get?.(target) : target;
    if (!observerToken?.document?.id || !targetToken?.document?.getFlag) return null;

    const overrideFlagKey = `avs-override-from-${observerToken.document.id}`;
    return targetToken.document.getFlag('pf2e-visioner', overrideFlagKey) || null;
  }
}

export default AvsOverrideManager;
