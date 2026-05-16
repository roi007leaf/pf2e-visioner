/**
 * AttackRollUseCase.js
 * Handles attack roll contexts for auto-cover
 */

import {
  getCoverBonusByState,
  getCoverImageForState,
  getCoverLabel,
} from '../../../helpers/cover-helpers.js';
import { MODULE_ID } from '../../../constants.js';
import { OffGuardSuppression } from '../../../rule-elements/operations/OffGuardSuppression.js';
import { getCoverBetween, getVisibilityBetween, setVisibilityBetween } from '../../../utils.js';
import { getCoverLevelRollOptions } from '../../batch.js';
import autoCoverSystem from '../AutoCoverSystem.js';
import coverDetector from '../CoverDetector.js';
import { BaseAutoCoverUseCase } from './BaseUseCase.js';

const OFF_GUARD_SUPPRESSION_CHAT = {
  'deny-advantage': { feat: 'deny-advantage', label: 'Deny Advantage' },
  'blind-fight': { feat: 'blind-fight', label: 'Blind-Fight' },
  'starsong-nectar': { feat: 'starsong-nectar', label: 'Starsong Nectar' },
  'off-guard-immunity': { feat: 'off-guard-immunity', label: 'Off-Guard Immunity' },
};

class AttackRollUseCase extends BaseAutoCoverUseCase {
  constructor() {
    super();
    // Use the singleton auto-cover system directly
    this.autoCoverSystem = autoCoverSystem;
  }

  _assignActorToToken(token, clonedActor) {
    if (!token || !clonedActor) return;

    try {
      const actorDescriptor =
        Object.getOwnPropertyDescriptor(token, 'actor') ||
        Object.getOwnPropertyDescriptor(Object.getPrototypeOf(token), 'actor');
      const canAssignActor = !actorDescriptor || !!actorDescriptor.writable || !!actorDescriptor.set;
      if (canAssignActor) {
        token.actor = clonedActor;
      }
    } catch (_) {}
  }

  _syncClonedDefenderIntoContext(token, clonedActor, context) {
    if (!clonedActor) return;

    this._assignActorToToken(token, clonedActor);

    const targetContext = context?.target;
    if (targetContext) {
      targetContext.actor = clonedActor;
      if (targetContext.token) {
        this._assignActorToToken(targetContext.token, clonedActor);
      }
    }
  }

  _syncClonedAttackerIntoContext(token, clonedActor, context, check = null) {
    if (!clonedActor) return;

    this._assignActorToToken(token, clonedActor);

    if (context) {
      context.actor = clonedActor;
      if (context.token) {
        this._assignActorToToken(context.token, clonedActor);
        this._assignActorToToken(context.token.object, clonedActor);
        try {
          if (!context.token.object) context.token.actor = clonedActor;
        } catch (_) {}
      }
      if (context.origin) {
        try {
          context.origin.actor = clonedActor;
        } catch (_) {}
        this._assignActorToToken(context.origin.token, clonedActor);
        this._assignActorToToken(context.origin.token?.object, clonedActor);
      }
    }

    if (check) {
      try {
        check.actor = clonedActor;
      } catch (_) {}
    }
  }

  _createContextModifier({ slug, label, modifier, type = 'circumstance' }) {
    if (!modifier) return null;

    try {
      if (game?.pf2e?.Modifier) {
        return new game.pf2e.Modifier({
          slug,
          label,
          modifier,
          type,
        });
      }
    } catch (_) {}

    return {
      slug,
      label,
      modifier,
      type,
      enabled: true,
    };
  }

  _applyAdjustedDcFromTargetActor(targetActor, dcObj, adjustments = []) {
    if (!targetActor || !dcObj?.slug) return false;

    const activeAdjustments = adjustments.filter((entry) => Number(entry?.modifier));
    if (activeAdjustments.length === 0) return false;

    const statSlug = dcObj.slug === 'ac' ? 'armor' : dcObj.slug;
    const defenseStat =
      targetActor.getStatistic?.(statSlug) ||
      (statSlug === 'armor' || dcObj.slug === 'ac' ? targetActor.armorClass : null);

    const modifiers = activeAdjustments
      .map((entry) => this._createContextModifier(entry))
      .filter(Boolean);

    const clonedDefense =
      typeof defenseStat?.clone === 'function'
        ? defenseStat.clone({ modifiers, rollOptions: [] })
        : null;

    if (clonedDefense?.dc) {
      dcObj.value = clonedDefense.dc.value;
      dcObj.statistic = clonedDefense.dc;
      return true;
    }

    const totalAdjustment = activeAdjustments.reduce(
      (sum, entry) => sum + Number(entry.modifier || 0),
      0,
    );
    dcObj.value = Number(dcObj.value || 0) + totalAdjustment;
    dcObj.statistic = {
      ...(dcObj.statistic || {}),
      value: dcObj.value,
      modifiers: [...(dcObj.statistic?.modifiers || []), ...modifiers],
    };

    return true;
  }

  _isPf2eCheckDialogEnabled() {
    return !!game?.user?.flags?.pf2e?.settings?.showCheckDialogs;
  }

  _getVisibilityStateForAttack(attacker, target) {
    try {
      return getVisibilityBetween(target, attacker);
    } catch (_) {
      return null;
    }
  }

  _isOffGuardSuppressedForAttack(attacker, target, visibilityState = null) {
    const visState = visibilityState ?? this._getVisibilityStateForAttack(attacker, target);
    if (!['hidden', 'undetected'].includes(visState)) return false;
    return OffGuardSuppression.shouldSuppressOffGuardForState(target, visState, attacker);
  }

  _getOffGuardSuppressionChatInfo(attacker, target, visibilityState = null) {
    const visState = visibilityState ?? this._getVisibilityStateForAttack(attacker, target);
    if (!['hidden', 'undetected'].includes(visState)) return null;

    const decision = OffGuardSuppression.getOffGuardSuppressionDecision(target, visState, attacker);
    const sourceInfo = OFF_GUARD_SUPPRESSION_CHAT[decision?.source];
    if (!decision?.result || !sourceInfo) return null;

    return {
      source: decision.source,
      feat: sourceInfo.feat,
      label: sourceInfo.label,
      visibilityState: decision.state,
      preventedModifier: -2,
      attackerName: attacker?.name ?? attacker?.document?.name ?? null,
      defenderName: target?.name ?? target?.document?.name ?? null,
      attackerLevel: decision.attackerLevel,
      defenderLevel: decision.defenderLevel,
    };
  }

  _storeOffGuardSuppressionChatInfo(data, doc, attacker, target) {
    const suppressionInfo = this._getOffGuardSuppressionChatInfo(attacker, target);
    if (!suppressionInfo) return false;

    if (!data.flags) data.flags = {};
    if (!data.flags[MODULE_ID]) data.flags[MODULE_ID] = {};
    data.flags[MODULE_ID].offGuardSuppression = suppressionInfo;

    if (doc?.updateSource) {
      try {
        doc.updateSource({ [`flags.${MODULE_ID}.offGuardSuppression`]: suppressionInfo });
      } catch (_) {}
    }

    return true;
  }

  _getUnsuppressedOffGuardAdjustment(attacker, target, visibilityState = null) {
    const visState = visibilityState ?? this._getVisibilityStateForAttack(attacker, target);
    if (!['hidden', 'undetected'].includes(visState)) return null;
    if (this._isOffGuardSuppressedForAttack(attacker, target, visState)) return null;

    const reason = visState.charAt(0).toUpperCase() + visState.slice(1);
    return {
      slug: 'pf2e-visioner-off-guard',
      label: `Off-Guard (${reason})`,
      modifier: -2,
      type: 'circumstance',
    };
  }

  _createOneRollOffGuardEffect(adjustment) {
    if (!adjustment) return null;
    return {
      name: adjustment.label,
      type: 'effect',
      system: {
        description: {
          value: `<p>${adjustment.label}: -2 circumstance penalty to AC for this roll.</p>`,
          gm: '',
        },
        rules: [
          {
            key: 'FlatModifier',
            selector: 'ac',
            slug: adjustment.slug,
            label: adjustment.label,
            type: adjustment.type,
            value: adjustment.modifier,
          },
        ],
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
    };
  }

  _applyOffGuardAdjustmentToContainer(container, adjustment, attacker, target) {
    if (!container || !adjustment) return false;
    const dcPaths = ['dc', 'context.dc'];
    let changed = false;

    for (const dcPath of dcPaths) {
      const dcObj = foundry.utils.getProperty(container, dcPath);
      if (!dcObj) continue;

      const modifierPaths = [
        `${dcPath}.statistic.modifiers`,
        `${dcPath}.modifiers`,
        `${dcPath}.statistic.check.modifiers`,
      ];
      const hasOffGuard = modifierPaths.some((path) => {
        const modifiers = foundry.utils.getProperty(container, path);
        return (
          Array.isArray(modifiers) &&
          modifiers.some((modifier) => this._isSuppressedOffGuardModifier(modifier))
        );
      });
      if (hasOffGuard) continue;

      const existingPath =
        modifierPaths.find((path) => Array.isArray(foundry.utils.getProperty(container, path))) ||
        `${dcPath}.statistic.modifiers`;
      const modifiers = foundry.utils.getProperty(container, existingPath);
      const nextModifiers = [
        ...(Array.isArray(modifiers) ? modifiers : []),
        this._createContextModifier(adjustment) || adjustment,
      ];
      foundry.utils.setProperty(container, existingPath, nextModifiers);

      const dcValueBefore = dcObj.value ?? null;
      if (Number.isFinite(dcObj.value)) {
        dcObj.value += adjustment.modifier;
      }
      changed = true;

    }

    if (changed) {
      try {
        const check = container.check ?? container.context?.check ?? container;
        check?.calculateTotal?.();
      } catch (_) {}
    }

    return changed;
  }

  _ensureUnsuppressedOffGuardModifier(container, attacker, target) {
    const adjustment = this._getUnsuppressedOffGuardAdjustment(attacker, target);
    return this._applyOffGuardAdjustmentToContainer(container, adjustment, attacker, target);
  }

  _filterSuppressedOffGuardItems(items, attacker, target) {
    if (!this._isOffGuardSuppressedForAttack(attacker, target)) return items;
    return items.filter((item) => {
      const flags = item?.flags?.[MODULE_ID];
      return !(flags?.ephemeralOffGuardRoll === true || flags?.aggregateOffGuard === true);
    });
  }

  _getTokenActorSignature(token) {
    return (
      token?.actor?.signature ||
      token?.document?.actor?.signature ||
      token?.actor?.id ||
      token?.document?.actor?.id ||
      null
    );
  }

  _filterSuppressedAttackerOffGuardItems(items, attacker, target) {
    if (!this._isOffGuardSuppressedForAttack(attacker, target)) {
      return { items, changed: false };
    }

    const filteredItems = items.filter(
      (item) => item?.flags?.[MODULE_ID]?.aggregateOffGuard !== true,
    );
    const changed = filteredItems.length !== items.length;
    return { items: filteredItems, changed };
  }

  _applySuppressedAttackerOffGuardClone(attacker, target, context, check = null) {
    const actor = attacker?.actor;
    if (!actor?.clone) {
      return false;
    }

    const items = foundry.utils.deepClone(actor._source?.items ?? []);
    const aggregateCountBefore = items.filter(
      (item) => item?.flags?.[MODULE_ID]?.aggregateOffGuard === true,
    ).length;
    const { items: filteredItems, changed } = this._filterSuppressedAttackerOffGuardItems(
      items,
      attacker,
      target,
    );
    const aggregateCountAfter = filteredItems.filter(
      (item) => item?.flags?.[MODULE_ID]?.aggregateOffGuard === true,
    ).length;
    if (!changed) return false;

    const clonedActor = actor.clone({ items: filteredItems }, { keepId: true });
    this._syncClonedAttackerIntoContext(attacker, clonedActor, context, check);
    return true;
  }

  _isSuppressedOffGuardModifier(modifier) {
    const slug = String(modifier?.slug ?? modifier?.key ?? modifier?.selector ?? '').toLowerCase();
    const label = String(
      modifier?.label ?? modifier?.name ?? modifier?.title ?? modifier?.source ?? '',
    ).toLowerCase();
    const isVisionerOffGuard =
      slug === 'pf2e-visioner-off-guard' ||
      (slug.includes('pf2e-visioner') && slug.includes('off-guard'));
    const isVisibilityOffGuard =
      label.includes('off-guard') && (label.includes('hidden') || label.includes('undetected'));
    return isVisionerOffGuard || isVisibilityOffGuard;
  }

  _stripSuppressedOffGuardModifiers(container, attacker, target) {
    if (!container) return false;
    if (!this._isOffGuardSuppressedForAttack(attacker, target)) {
      return false;
    }

    const paths = [
      'modifiers',
      'check.modifiers',
      'context.modifiers',
      'context.check.modifiers',
      'dc.modifiers',
      'dc.statistic.modifiers',
      'dc.statistic.check.modifiers',
      'context.dc.modifiers',
      'context.dc.statistic.modifiers',
      'context.dc.statistic.check.modifiers',
    ];
    let changed = false;
    const adjustedDcs = new Set();

    for (const path of paths) {
      const modifiers = foundry.utils.getProperty(container, path);
      if (!Array.isArray(modifiers)) continue;
      const removed = modifiers.filter((modifier) => this._isSuppressedOffGuardModifier(modifier));
      const filtered = modifiers.filter((modifier) => !this._isSuppressedOffGuardModifier(modifier));
      if (filtered.length === modifiers.length) continue;
      const dcPath = path.startsWith('context.dc') ? 'context.dc' : path.startsWith('dc') ? 'dc' : null;
      const dcObj = dcPath ? foundry.utils.getProperty(container, dcPath) : null;
      const dcValueBefore = dcObj?.value ?? null;
      foundry.utils.setProperty(container, path, filtered);
      if (dcPath && !adjustedDcs.has(dcPath)) {
        const removedTotal = removed.reduce(
          (total, modifier) => total + Number(modifier?.modifier || 0),
          0,
        );
        if (Number.isFinite(dcObj?.value) && Number.isFinite(removedTotal)) {
          dcObj.value -= removedTotal;
        }
        adjustedDcs.add(dcPath);
      }
      changed = true;
    }

    if (changed) {
      try {
        const check = container.check ?? container.context?.check ?? container;
        check?.calculateTotal?.();
      } catch (_) {}
    }

    return changed;
  }

  async _refreshDefenderVisibilityEffectsForAttack(attacker, target) {
    if (!attacker || !target) return;
    try {
      const currentVisibility = getVisibilityBetween(target, attacker);
      await setVisibilityBetween(target, attacker, currentVisibility, {
        skipEphemeralUpdate: false,
        direction: 'observer_to_target',
      });
    } catch {}
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

    this._storeOffGuardSuppressionChatInfo(data, doc, attacker, target);

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
          } catch (_) {}
        }
      }
    } catch (_) {}

    try {
      const ruleElementBlocks = coverDetector.consumeRuleElementBlocks(
        speakerTokenId,
        targetTokenId,
      );
      if (ruleElementBlocks) {
        if (!data.flags) data.flags = {};
        if (!data.flags['pf2e-visioner']) data.flags['pf2e-visioner'] = {};
        data.flags['pf2e-visioner'].ruleElementBlocks = ruleElementBlocks;
        if (doc && doc.updateSource) {
          try {
            doc.updateSource({ 'flags.pf2e-visioner.ruleElementBlocks': ruleElementBlocks });
          } catch (_) {}
        }
      }
    } catch (e) {
      console.warn('PF2E Visioner | Error storing rule element blocks:', e);
    }

    try {
      const snipingDuoCoverIgnore = coverDetector.consumeSnipingDuoCoverIgnore(
        speakerTokenId,
        targetTokenId,
      );
      if (snipingDuoCoverIgnore) {
        if (!data.flags) data.flags = {};
        if (!data.flags['pf2e-visioner']) data.flags['pf2e-visioner'] = {};
        data.flags['pf2e-visioner'].snipingDuoCoverIgnore = snipingDuoCoverIgnore;
        if (doc && doc.updateSource) {
          try {
            doc.updateSource({
              'flags.pf2e-visioner.snipingDuoCoverIgnore': snipingDuoCoverIgnore,
            });
          } catch (_) {}
        }
      }
    } catch (_) {}
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
    await this._refreshDefenderVisibilityEffectsForAttack(attacker, target);
    this._stripSuppressedOffGuardModifiers(dialog, attacker, target);
    this._stripSuppressedOffGuardModifiers(ctx, attacker, target);
    this._ensureUnsuppressedOffGuardModifier(dialog, attacker, target);
    this._ensureUnsuppressedOffGuardModifier(ctx, attacker, target);
    const manualCover = getCoverBetween(attacker, target);
    let state = this._detectCover(attacker, target, ctx);

    const snipingDuoCoverIgnore = coverDetector.peekSnipingDuoCoverIgnore(attacker.id, target.id);

    // Delegate dialog UI injection to CoverUIManager
    try {
      await this.coverUIManager.injectDialogCoverUI(
        dialog,
        html,
        state,
        target,
        manualCover,
        snipingDuoCoverIgnore,
        ({ chosen, dctx, target: tgt, targetActor: tgtActor }) => {
          const effectiveTarget = target || tgt;
          const sourceTargetActor = tgtActor || effectiveTarget?.actor;
          const callbackOffGuardAdjustment = this._getUnsuppressedOffGuardAdjustment(
            attacker,
            effectiveTarget,
          );
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
            this._stripSuppressedOffGuardModifiers(dctx, attacker, effectiveTarget);
            const bonus = getCoverBonusByState(chosen) || 0;
            const label = getCoverLabel(chosen);
            let items = foundry.utils.deepClone(sourceTargetActor._source?.items ?? []);
            items = items.filter(
              (i) =>
                !(
                  i?.type === 'effect' &&
                  (i?.flags?.['pf2e-visioner']?.ephemeralCoverRoll === true ||
                    i?.flags?.['pf2e-visioner']?.ephemeralOffGuardRoll === true)
                ),
            );
            items = this._filterSuppressedOffGuardItems(items, attacker, effectiveTarget);
            if (bonus > 0) {
              const img = getCoverImageForState(chosen);
              const effectRules = [
                ...getCoverLevelRollOptions(chosen),
                {
                  key: 'FlatModifier',
                  selector: 'ac',
                  slug: 'cover',
                  type: 'circumstance',
                  value: bonus,
                },
              ];
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
            if (callbackOffGuardAdjustment) {
              const offGuardEffect = this._createOneRollOffGuardEffect(callbackOffGuardAdjustment);
              if (offGuardEffect) items.push(offGuardEffect);
            }
            const clonedActor = sourceTargetActor.clone({ items }, { keepId: true });
            this._syncClonedDefenderIntoContext(effectiveTarget, clonedActor, dctx);
            const dcObj = dctx.dc;
            if (dcObj?.slug) {
              const didAdjustDc = this._applyAdjustedDcFromTargetActor(sourceTargetActor, dcObj, [
                {
                  slug: 'cover',
                  label,
                  modifier: bonus,
                  type: 'circumstance',
                },
              ]);
              const st = didAdjustDc ? null : clonedActor.getStatistic(dcObj.slug)?.dc;
              if (st) {
                dcObj.value = st.value;
                dcObj.statistic = st;
              }
            }
            this._applyOffGuardAdjustmentToContainer(
              dctx,
              callbackOffGuardAdjustment,
              attacker,
              effectiveTarget,
            );
            this._injectCoverRollOptions(dctx, chosen, bonus);
          } catch (_) {}
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
    } catch (_) {}
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
      const checkDialogsEnabled = this._isPf2eCheckDialogEnabled();

      if (attacker && target && (attacker.isOwner || game.user.isGM)) {
        // Ensure visibility-driven off-guard ephemerals are up-to-date on defender before any DC calculation
        await this._refreshDefenderVisibilityEffectsForAttack(attacker, target);
        this._stripSuppressedOffGuardModifiers(check, attacker, target);
        this._stripSuppressedOffGuardModifiers(context, attacker, target);
        this._applySuppressedAttackerOffGuardClone(attacker, target, context, check);
        this._ensureUnsuppressedOffGuardModifier(check, attacker, target);
        this._ensureUnsuppressedOffGuardModifier(context, attacker, target);

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
        const finalState = chosen ?? (manualCover !== 'none' ? manualCover : detected);

        if (checkDialogsEnabled) {
          return { success: true };
        }

        // Store the override for onPreCreateChatMessage if popup was used
        if (chosen != null && manualCover === 'none' && chosen !== detected) {
          this.autoCoverSystem.setPopupOverride(attacker, target, chosen, detected);
        }

        // Apply effect/clone/stat logic for the final state
        await this._applyCoverEphemeralEffect(target, attacker, finalState, context, manualCover);
        this._ensureUnsuppressedOffGuardModifier(context, attacker, target);
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
    const bonus = state && state !== 'none' ? getCoverBonusByState(state) || 0 : 0;
    const hasCoverBonus = bonus > 0;
    const offGuardAdjustment = this._getUnsuppressedOffGuardAdjustment(attacker, target);
    if (!hasCoverBonus && !offGuardAdjustment) return;

    const tgtActor = target.actor;
    const dcAdjustments = [];

    if (hasCoverBonus) {
      dcAdjustments.push({
        slug: 'cover',
        label: getCoverLabel(state),
        modifier: bonus,
        type: 'circumstance',
      });
    }

    if (offGuardAdjustment) {
      dcAdjustments.push(offGuardAdjustment);
    }

    let items = foundry.utils.deepClone(tgtActor._source?.items ?? []);
    // Remove any existing one-roll cover effects we may have added
    items = items.filter(
      (i) =>
        !(
          i?.type === 'effect' &&
          (i?.flags?.['pf2e-visioner']?.ephemeralCoverRoll === true ||
            i?.flags?.['pf2e-visioner']?.ephemeralOffGuardRoll === true)
        ),
    );
    items = this._filterSuppressedOffGuardItems(items, attacker, target);
    const label = getCoverLabel(state);
    const img = getCoverImageForState(state);
    if (hasCoverBonus) {
      items.push({
        name: label,
        type: 'effect',
        system: {
          description: {
            value: `<p>${label}: +${bonus} circumstance bonus to AC for this roll.</p>`,
            gm: '',
          },
          rules: [
            ...getCoverLevelRollOptions(state),
            {
              key: 'FlatModifier',
              selector: 'ac',
              slug: 'cover',
              type: 'circumstance',
              value: bonus,
            },
          ],
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
    }

    if (offGuardAdjustment) {
      const offGuardEffect = this._createOneRollOffGuardEffect(offGuardAdjustment);
      if (offGuardEffect) items.push(offGuardEffect);
    }

    const clonedActor = tgtActor.clone({ items }, { keepId: true });
    this._syncClonedDefenderIntoContext(target, clonedActor, context);
    const dcObj = context.dc;
    if (dcObj?.slug) {
      const activeDcAdjustments =
        manualCover === 'none'
          ? dcAdjustments
          : dcAdjustments.filter((adjustment) => adjustment.slug === 'pf2e-visioner-off-guard');
      const didAdjustDc =
        activeDcAdjustments.length > 0 &&
        this._applyAdjustedDcFromTargetActor(tgtActor, dcObj, activeDcAdjustments);
      const clonedStat = didAdjustDc ? null : clonedActor.getStatistic?.(dcObj.slug)?.dc;
      if (clonedStat && manualCover === 'none') {
        dcObj.value = clonedStat.value;
        dcObj.statistic = clonedStat;
      }
    }
    if (hasCoverBonus) {
      this._injectCoverRollOptions(context, state, bonus);
    }
  }

  _injectCoverRollOptions(context, state, bonus) {
    if (!context) return;
    if (context.options instanceof Set) {
      context.options.add(`target:cover-level:${state}`);
      context.options.add(`target:cover-bonus:${bonus}`);
    } else {
      const optSet = new Set(Array.isArray(context.options) ? context.options : []);
      optSet.add(`target:cover-level:${state}`);
      optSet.add(`target:cover-bonus:${bonus}`);
      context.options = Array.from(optSet);
    }
  }

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
