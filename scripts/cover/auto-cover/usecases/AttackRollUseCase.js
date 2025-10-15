/**
 * AttackRollUseCase.js
 * Handles attack roll contexts for auto-cover
 */

import {
  getCoverBonusByState,
  getCoverImageForState,
  getCoverLabel,
} from '../../../helpers/cover-helpers.js';
import { getCoverBetween } from '../../../utils.js';
import autoCoverSystem from '../AutoCoverSystem.js';
import coverDetector from '../CoverDetector.js';
import { BaseAutoCoverUseCase } from './BaseUseCase.js';
class AttackRollUseCase extends BaseAutoCoverUseCase {
  constructor() {
    super();
    // Use the singleton auto-cover system directly
    this.autoCoverSystem = autoCoverSystem;
  }
  /**
   * Handle a chat message context
   * @param {Object} data - Message data
   * @param {Object} doc - Message document (optional)
   * @returns {Promise<Object>} Result with tokens and cover state
   */
  async handlePreCreateChatMessage(data, doc = null) {
    const speakerTokenId = this.normalizeTokenRef(data?.speaker?.token);
    const targetTokenId = this._resolveTargetTokenIdFromData(data);

    const tokens = canvas?.tokens;

    const attacker = tokens.get(speakerTokenId);

    const target = tokens.get(targetTokenId);

    // Determine base cover state (manual token cover first, then auto-detection)
    let state = null;

    // Fallback to auto-detection if no manual cover
    const manualCover = getCoverBetween(attacker, target);
    if (!state && manualCover === 'none') {
      state = this._detectCover(attacker, target, data?.flags?.pf2e?.context);
    }

    // Preserve original detected state for override comparison
    const originalDetectedState = state;

    // Use the CoverOverrideManager directly
    let wasOverridden = false;
    let overrideSource = null;

    try {
      const overrideManager = this.autoCoverSystem.getOverrideManager();

      // Check for any override for this token pair
      const override = overrideManager.consumeOverride(attacker, target);

      if (override) {
        state = override.state;
        overrideSource = override.source;
        wasOverridden = state !== originalDetectedState;

        // Store override information in chat message flags for the indicator
        if (wasOverridden) {
          try {
            if (!data.flags) data.flags = {};
            if (!data.flags['pf2e-visioner']) data.flags['pf2e-visioner'] = {};

            const overrideData = {
              originalDetected: originalDetectedState,
              finalState: state,
              overrideSource: overrideSource,
              attackerName: attacker.name,
              targetName: target.name,
            };

            data.flags['pf2e-visioner'].coverOverride = overrideData;

            // Also try to update the document source if available
            if (doc && doc.updateSource) {
              try {
                doc.updateSource({ 'flags.pf2e-visioner.coverOverride': overrideData });
              } catch (e) {
                console.warn('PF2E Visioner | Failed to update document source:', e);
              }
            }
          } catch (e) {
            console.warn('PF2E Visioner | Failed to store override info in message flags:', e);
          }
        }
      }
    } catch (e) {
      console.warn('PF2E Visioner | Failed to check cover override:', e);
    }

    try {
      const upgradeRec = coverDetector.consumeFeatCoverUpgrade(speakerTokenId, targetTokenId);
      if (upgradeRec) {
        if (!data.flags) data.flags = {};
        if (!data.flags['pf2e-visioner']) data.flags['pf2e-visioner'] = {};
        data.flags['pf2e-visioner'].coverFeatUpgrade = upgradeRec;
        if (doc && doc.updateSource) {
          try {
            doc.updateSource({ 'flags.pf2e-visioner.coverFeatUpgrade': upgradeRec });
          } catch (_) { }
        }
      }
    } catch (_) { }

    try {
      const ruleElementBlocks = coverDetector.consumeRuleElementBlocks(speakerTokenId, targetTokenId);
      console.log('PF2E Visioner | Consumed rule element blocks:', ruleElementBlocks);
      if (ruleElementBlocks) {
        console.log('PF2E Visioner | Storing rule element blocks in message flags:', ruleElementBlocks);
        if (!data.flags) data.flags = {};
        if (!data.flags['pf2e-visioner']) data.flags['pf2e-visioner'] = {};
        data.flags['pf2e-visioner'].ruleElementBlocks = ruleElementBlocks;
        console.log('PF2E Visioner | Message flags after setting:', data.flags['pf2e-visioner']);
        if (doc && doc.updateSource) {
          try {
            doc.updateSource({ 'flags.pf2e-visioner.ruleElementBlocks': ruleElementBlocks });
          } catch (_) { }
        }
      }
    } catch (e) {
      console.warn('PF2E Visioner | Error storing rule element blocks:', e);
    }
  }

  /**
   * Handle a check modifiers dialog context
   * @param {Object} dialog - Dialog object
   * @param {Object} ctx - Check context
   * @returns {Promise<Object>} Result with tokens and cover state
   */
  async handleCheckDialog(dialog, html) {
    const ctx = dialog?.context || {};

    let attacker = this._resolveAttackerFromCtx(ctx);
    let target = this._resolveTargetFromCtx(ctx);
    if (!attacker || !target) return;
    const manualCover = getCoverBetween(attacker, target);
    let state = this._detectCover(attacker, target, ctx);

    // Delegate dialog UI injection to CoverUIManager
    try {
      await this.coverUIManager.injectDialogCoverUI(
        dialog,
        html,
        state,
        target,
        manualCover,
        ({ chosen, dctx, target: tgt, targetActor: tgtActor }) => {
          try {
            if (attacker && target && manualCover === 'none' && chosen !== state) {
              // Use the correctly resolved token objects from outer scope
              this.autoCoverSystem.setDialogOverride(attacker, target, chosen, state);
            } else {
              console.warn('PF2E Visioner | Could not resolve token objects for dialog override', {
                hasAttacker: !!attacker,
                hasTarget: !!target,
              });
            }
          } catch (e) {
            console.warn('PF2E Visioner | Failed to set dialog override:', e);
          }

          try {
            const bonus = getCoverBonusByState(chosen) || 0;
            let items = foundry.utils.deepClone(tgtActor._source?.items ?? []);
            items = items.filter(
              (i) =>
                !(i?.type === 'effect' && i?.flags?.['pf2e-visioner']?.ephemeralCoverRoll === true),
            );
            if (bonus > 0) {
              const label = getCoverLabel(chosen);
              const img = getCoverImageForState(chosen);
              const effectRules = [];
              effectRules.push({
                key: 'FlatModifier',
                selector: 'ac',
                type: 'circumstance',
                value: bonus,
              });
              const description = `<p>${label}: +${bonus} circumstance bonus to AC for this roll.</p>`;
              items.push({
                name: label,
                type: 'effect',
                system: {
                  description: { value: description, gm: '' },
                  rules: effectRules,
                  traits: { otherTags: [], value: [] },
                  level: { value: 1 },
                  duration: { value: -1, unit: 'unlimited' },
                  tokenIcon: { show: false },
                  unidentified: true,
                  start: { value: 0 },
                  badge: null,
                },
                img,
                flags: { 'pf2e-visioner': { forThisRoll: true, ephemeralCoverRoll: true } },
              });
            }
            tgt.actor = tgtActor.clone({ items }, { keepId: true });
            const dcObj = dctx.dc;
            if (dcObj?.slug) {
              const st = tgt.actor.getStatistic(dcObj.slug)?.dc;
              if (st) {
                dcObj.value = st.value;
                dcObj.statistic = st;
              }
            }
          } catch (_) { }
        },
      );
    } catch (e) {
      console.warn('PF2E Visioner | Failed to inject dialog cover UI via CoverUIManager:', e);
    }
  }

  async handleRenderChatMessage(message, html) {
    const data = message?.toObject?.() || {};
    const attackerIdRaw =
      data?.speaker?.token || data?.flags?.pf2e?.context?.token?.id || data?.flags?.pf2e?.token?.id;
    const attackerId = this.normalizeTokenRef(attackerIdRaw);
    const targetId = this._resolveTargetTokenIdFromData(data);

    // Always call parent method first to handle cover override indicators
    await super.handleRenderChatMessage(message, html);

    if (!attackerId) {
      return;
    }

    const tokens = canvas?.tokens;
    if (!tokens?.get) {
      return;
    }

    const attacker = tokens.get(attackerId);
    if (!attacker) {
      return;
    }

    // Only proceed if this user owns the attacking token or is the GM
    if (!attacker.isOwner && !game.user.isGM) return;

    const targetIds = targetId ? [targetId] : this.autoCoverSystem.consumePairs(attackerId);
    if (targetIds.length === 0) return;
    const targets = targetIds.map((tid) => tokens.get(tid)).filter((t) => !!t);
    if (targets.length === 0) return;
    try {
      for (const target of targets) {
        await this.autoCoverSystem.setCoverBetween(attacker, target, 'none', {
          skipEphemeralUpdate: true,
        });
        // Remove ephemeral cover effects for this specific attacker
        try {
          this.autoCoverSystem.cleanupCover(target, attacker);
        } catch (e) {
          console.warn('PF2E Visioner | Failed to cleanup ephemeral cover effects:', e);
        }
      }
    } catch (_) { }
  }

  /**
   * Handle check roll context
   * @param {Object} check - Check object
   * @param {Object} context - Check context
   * @returns {Promise<Object>} Result with tokens and cover state
   */
  async handleCheckRoll(check, context) {
    try {
      const attacker = this._resolveAttackerFromCtx(context);
      const target = this._resolveTargetFromCtx(context);

      if (attacker && target && (attacker.isOwner || game.user.isGM)) {
        // Ensure visibility-driven off-guard ephemerals are up-to-date on defender before any DC calculation
        try {
          const { getVisibilityBetween, setVisibilityBetween } = await import('../../../utils.js');
          const currentVisEarly = getVisibilityBetween(attacker, target);
          await setVisibilityBetween(attacker, target, currentVisEarly, {
            skipEphemeralUpdate: false,
            direction: 'observer_to_target',
          });
        } catch (_) { }

        const manualCover = getCoverBetween(attacker, target);
        const detected = this._detectCover(attacker, target, context);
        let chosen = null;
        try {
          // Only show popup if keybind is held
          const popupResult = await this.coverUIManager.showPopupAndApply(detected, manualCover);
          chosen = manualCover !== 'none' ? manualCover : popupResult?.chosen;
        } catch (e) {
          console.warn('PF2E Visioner | Popup error (delegated):', e);
        }

        // If popup was used and a choice was made, use it; otherwise, use detected state
        const finalState =
          chosen !== null ? chosen : manualCover !== 'none' ? manualCover : detected;

        // Store the override for onPreCreateChatMessage if popup was used
        if (chosen && manualCover === 'none' && chosen !== detected) {
          this.autoCoverSystem.setPopupOverride(attacker, target, chosen, detected);
        }

        // Apply effect/clone/stat logic for the final state
        await this._applyCoverEphemeralEffect(target, attacker, finalState, context, manualCover);
      }

      return {
        success: true,
      };
    } catch (error) {
      this._log('handleRoll', 'Error processing attack roll', { error }, 'error');
      return { success: false };
    }
  }

  /**
   * Apply ephemeral cover effect and update DC/stat if needed.
   * @private
   */
  async _applyCoverEphemeralEffect(target, attacker, state, context, manualCover) {
    if (!state || state === 'none') return;
    const bonus = getCoverBonusByState(state) || 0;
    if (bonus <= 0) return;
    const tgtActor = target.actor;
    let items = foundry.utils.deepClone(tgtActor._source?.items ?? []);
    // Remove any existing one-roll cover effects we may have added
    items = items.filter(
      (i) => !(i?.type === 'effect' && i?.flags?.['pf2e-visioner']?.ephemeralCoverRoll === true),
    );
    const label = getCoverLabel(state);
    const img = getCoverImageForState(state);
    items.push({
      name: label,
      type: 'effect',
      system: {
        description: {
          value: `<p>${label}: +${bonus} circumstance bonus to AC for this roll.</p>`,
          gm: '',
        },
        rules: [{ key: 'FlatModifier', selector: 'ac', type: 'circumstance', value: bonus }],
        traits: { otherTags: [], value: [] },
        level: { value: 1 },
        duration: { value: -1, unit: 'unlimited' },
        tokenIcon: { show: false },
        unidentified: false,
        start: { value: 0 },
        badge: null,
      },
      img,
      flags: { 'pf2e-visioner': { forThisRoll: true, ephemeralCoverRoll: true } },
    });
    // If defender is hidden/undetected to attacker, add a one-roll Flat-Footed item so it shows on the roll
    try {
      const { getVisibilityBetween } = await import('../../../stores/visibility-map.js');
      const visState = getVisibilityBetween(target, attacker);
      if (['hidden', 'undetected'].includes(visState)) {
        const reason = visState.charAt(0).toUpperCase() + visState.slice(1);
        items.push({
          name: `Off-Guard (${reason})`,
          type: 'effect',
          system: {
            description: {
              value: `<p>Off-Guard (${reason}): -2 circumstance penalty to AC for this roll.</p>`,
              gm: '',
            },
            rules: [{ key: 'FlatModifier', selector: 'ac', type: 'circumstance', value: -2 }],
            traits: { otherTags: [], value: [] },
            level: { value: 1 },
            duration: { value: -1, unit: 'unlimited' },
            tokenIcon: { show: false },
            unidentified: false,
            start: { value: 0 },
            badge: null,
          },
          img: 'icons/svg/terror.svg',
          flags: { 'pf2e-visioner': { forThisRoll: true, ephemeralOffGuardRoll: true } },
        });
      }
    } catch (_) { }
    const clonedActor = tgtActor.clone({ items }, { keepId: true });
    const dcObj = context.dc;
    if (dcObj?.slug) {
      const clonedStat = clonedActor.getStatistic?.(dcObj.slug)?.dc;
      if (clonedStat && manualCover === 'none') {
        dcObj.value = clonedStat.value;
        dcObj.statistic = clonedStat;
      }
    }
  }

  /**
   * Resolve attacker from context
   * @param {Object} ctx - Context object
   * @returns {Object|null}
   * @private
   */
  _resolveAttackerFromCtx(ctx) {
    try {
      // First try to get a token object directly
      const tokenObj = ctx?.token?.object || ctx?.token;
      if (tokenObj?.id && tokenObj.document) {
        // This is already a token object
        return tokenObj;
      }

      if (ctx?.token?.isEmbedded && ctx?.token?.object?.id) {
        return ctx.token.object;
      }

      // Try a variety of sources to get a token ID
      const tokenIdRaw =
        ctx?.token?.id || ctx?.tokenId || ctx?.origin?.tokenId || ctx?.origin?.token;

      const tokenId = this.normalizeTokenRef(tokenIdRaw);
      if (tokenId) {
        const token = canvas?.tokens?.get?.(tokenId);
        if (token) return token;
      }

      // Last resort: if we have an actor, find its active token
      if (ctx?.actor?.getActiveTokens) {
        const activeTokens = ctx.actor.getActiveTokens();
        if (activeTokens.length > 0) {
          return activeTokens[0];
        }
      }

      return null;
    } catch (_) {
      return null;
    }
  }
}

// Singleton instance
const attackRollUseCase = new AttackRollUseCase();
export default attackRollUseCase;

// Also export the class for reference
export { AttackRollUseCase };

