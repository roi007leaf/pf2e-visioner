/**
 * SavingThrowUseCase.js
 * Handles saving throw contexts for auto-cover
 */

import { getCoverImageForState, getCoverLabel } from '../../../helpers/cover-helpers.js';
import { getCoverBetween } from '../../../utils.js';
import autoCoverSystem from '../AutoCoverSystem.js';
import coverUIManager from '../CoverUIManager.js';
import templateManager from '../TemplateManager.js';
import { BaseAutoCoverUseCase } from './BaseUseCase.js';

const coverPredecende = {
  greater: 4,
  standard: 2,
  none: 0,
};

class SavingThrowUseCase extends BaseAutoCoverUseCase {
  constructor() {
    super();
    this.autoCoverSystem = autoCoverSystem.default || autoCoverSystem;
    this.coverUIManager = coverUIManager.default || coverUIManager;
    this.templateManager = templateManager.default || templateManager;
  }

  // Lightweight helper that determines whether the current context represents an area effect
  _isAreaEffect(context) {
    try {
      const hasArea =
        context?.traits?.has?.('area') ||
        (Array.isArray(context?.traits) && context.traits.includes('area')) ||
        (Array.isArray(context?.options) && context.options.includes('area-effect')) ||
        (context?.options?.has && context.options.has('area-effect'));
      return !!hasArea;
    } catch (e) {
      return false;
    }
  }

  /**
   * Handle a chat message context
   * @param {Object} data - Message data
   * @param {Object} doc - Message document (optional)
   * @returns {Promise<Object>} Result with tokens and cover state
   */
  async handlePreCreateChatMessage(data, doc = null) {
    return;
  }

  /**
   * Handle a chat message context
   * @param {Object} data - Message data
   * @returns {Promise<Object>} Result with tokens and cover state
   */
  async handleRenderChatMessage(message, html) {
    await super.handleRenderChatMessage(message, html, false);
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

    // Check for active template data with precalculated cover state
    let state;
    const savedTemplateData = this.templateManager.getTemplatesData();

    if (savedTemplateData && savedTemplateData.size > 0) {
      // Find the most recent template that contains this target
      let mostRecentTemplate = null;
      let mostRecentTs = 0;

      for (const [id, data] of savedTemplateData.entries()) {
        // Check if this target is in the template's targets
        if (data.targets && data.targets[target.id]) {
          // Found a match - check if it's the most recent
          if (data.timestamp > mostRecentTs) {
            mostRecentTemplate = { id, data };
            mostRecentTs = data.timestamp;
          }
        }
      }

      if (mostRecentTemplate) {
        const { data } = mostRecentTemplate;
        state = data.targets[target.id].state;
      }
    }

    let highestFoundManualCover = 'none';
    // Fallback to direct token calculation if no template data
    if (!state) {
      // First check for manual cover between tokens
      try {
        const manualCover = getCoverBetween(attacker, target);
        if (manualCover && manualCover !== 'none') {
          state = manualCover;
          highestFoundManualCover =
            coverPredecende[manualCover] > coverPredecende[highestFoundManualCover]
              ? manualCover
              : highestFoundManualCover;
        }
      } catch (_) {}

      // Fallback to auto-detection if no manual cover
      if (!state) {
        state = this._detectCover(attacker, target);
      }
    }

    try {
      await this.coverUIManager.injectDialogCoverUI(
        dialog,
        html,
        state,
        target,
        highestFoundManualCover,
        ({ chosen }) => {
          if (!dialog?.check || !Array.isArray(dialog.check.modifiers)) return;
          const mods = dialog.check.modifiers;
          const existing = mods.find((m) => m?.slug === 'pf2e-visioner-cover');

          const bonus = this.autoCoverSystem.getCoverBonusByState(chosen);
          const label = getCoverLabel(chosen);
          const shouldKeep = bonus > 1 || bonus === 0;

          if (shouldKeep) {
            if (existing) {
              try {
                if ('modifier' in existing) existing.modifier = bonus;
              } catch (_) {}
              try {
                if ('value' in existing) existing.value = bonus;
              } catch (_) {}
              try {
                if ('label' in existing) existing.label = label;
              } catch (_) {}
              try {
                if ('name' in existing) existing.name = label;
              } catch (_) {}
              try {
                existing.enabled = true;
              } catch (_) {}
            } else {
              let coverModifier;
              try {
                if (game?.pf2e?.Modifier) {
                  coverModifier = new game.pf2e.Modifier({
                    slug: 'pf2e-visioner-cover',
                    label,
                    modifier: bonus,
                    type: 'circumstance',
                  });
                } else {
                  coverModifier = {
                    slug: 'pf2e-visioner-cover',
                    label,
                    modifier: bonus,
                    type: 'circumstance',
                  };
                }
                if (typeof dialog.check.push === 'function') {
                  dialog.check.push(coverModifier);
                } else {
                  mods.push(coverModifier);
                }
              } catch (e) {
                console.warn('PF2E Visioner | Failed to create cover modifier:', e);
              }
            }
          } else if (existing) {
            const idx = mods.indexOf(existing);
            if (idx >= 0) mods.splice(idx, 1);
          }

          try {
            if (typeof dialog.check.calculateTotal === 'function') dialog.check.calculateTotal();
          } catch (e) {
            console.warn('PF2E Visioner | Failed to recalculate dialog total:', e);
          }

          try {
            dialog.render(false);
          } catch (e) {
            console.warn('PF2E Visioner | Dialog re-render failed:', e);
          }
        },
      );
    } catch (e) {
      console.warn('PF2E Visioner | Failed to inject dialog cover UI via CoverUIManager:', e);
    }
  }

  /**
   * Handle check roll context
   * @param {Object} check - Check object
   * @param {Object} context - Check context
   * @returns {Promise<Object>} Result with tokens and cover state
   */
  async handleCheckRoll(check, context) {
    try {
      // For reflex saves, the actor making the save is the "target" (defender)
      let target = context.actor?.getActiveTokens?.()?.[0];
      if (!target) {
        // Fallback: try to resolve from context
        target = this._resolveTargetFromCtx(context);
      }

      if (!target) {
        return;
      }

      // Find the attacker (origin of the area effect) and template data
      let attacker = null;
      let isTargetInTemplate = false;
      let templateId = null;
      let templateData = null;

      // First check our dedicated template data map
      const savedTemplateData = this.templateManager.getTemplatesData();

      if (savedTemplateData && savedTemplateData.size > 0) {
        // Find the most recent template that contains this target
        let mostRecentTemplate = null;
        let mostRecentTs = 0;

        for (const [id, data] of savedTemplateData.entries()) {
          // Check if this target is in the template's targets
          if (data.targets && data.targets[target.id]) {
            // Found a match - check if it's the most recent
            if (data.timestamp > mostRecentTs) {
              mostRecentTemplate = { id, data };
              mostRecentTs = data.timestamp;
            }
          }
        }

        if (mostRecentTemplate) {
          const { id, data } = mostRecentTemplate;
          templateId = id;
          templateData = data;
          isTargetInTemplate = true;

          // Track that this template is being used for a reflex save
          this.templateManager.addActiveReflexSaveTemplate(id);

          // Try to get the attacker token if creator ID is available
          if (data.creatorId && !data.creatorId.startsWith('actor:')) {
            attacker = canvas.tokens.get(data.creatorId) || null;
          }
        }
      }

      // Mark that this target's save has been processed for this template
      if (templateData && templateData.targets && templateData.targets[target.id]) {
        templateData.targets[target.id].saveProcessed = true;

        // Check if all targets have been processed
        const allProcessed = Object.values(templateData.targets).every((t) => t.saveProcessed);

        if (allProcessed) {
          // Schedule cleanup if all targets have been processed
          setTimeout(() => {
            try {
              const templateData = this.templateManager.getTemplateData(templateId);
              // Only clean up if it hasn't been cleaned up already
              if (templateData) {
                // Only remove template data from our maps, don't delete templates from canvas
                this.templateManager.removeTemplateData(templateId);

                const activeReflexSaveTemplate =
                  this.templateManager.getActiveReflexSaveTemplate(templateId);

                if (activeReflexSaveTemplate) {
                  this.templateManager.removeActiveReflexSaveTemplate(templateId);
                }
              }
            } catch (e) {
              console.error('PF2E Visioner | Error cleaning up template data:', e);
            }
          }, 5000); // Give a 5 second buffer to ensure all related operations complete
        }
      }

      if (!attacker || !isTargetInTemplate) {
        const area = this._isAreaEffect(context);
        if (area) {
          if (!attacker) {
            // Prefer the spell's caster when available (template creator or context origin),
            // falling back to controlled/targeted token.
            let caster = null;
            try {
              // 1) Try template creator ID (may be a UUID like Scene.X.Token.Y or Actor.X)
              if (templateData?.creatorId) {
                try {
                  const resolved = templateData.creatorId;
                  caster = resolved?.document?.object ?? resolved ?? null;
                } catch (_) {
                  // fallback: try normalizing to a token id
                  const norm = this.normalizeTokenRef(templateData.creatorId);
                  caster = norm ? canvas.tokens.get(norm) : null;
                }
              }

              // 2) Try context origin (often a UUID for the originating item/actor/token)
              if (!caster && context?.origin) {
                const resolved = context?.origin?.token;
                caster = resolved?.document?.object ?? resolved ?? null;
              }

              // 3) Try context.token (embedded token object) or actor's active token
              if (!caster) {
                caster = context?.token?.object ?? canvas.tokens.get(context?.token?.id) ?? null;
              }
              if (!caster && context?.actor?.getActiveTokens) {
                caster = context.actor.getActiveTokens()?.[0] ?? null;
              }

              // 4) Final fallbacks: controlled token or first targeted token
              if (!caster) {
                caster = canvas.tokens.controlled?.[0] || targeted;
              }
            } catch (e) {
              // Ensure we at least fall back if something goes wrong resolving UUIDs
              caster = canvas.tokens.controlled?.[0] || targeted;
            }

            attacker = caster;
            const targeted = Array.from(game.user.targets || [])?.[0]?.document?.object;
          }
          isTargetInTemplate = true;
        }
      }

      let state;
      let highestFoundManualCover = 'none';

      // If we found a template and it has precalculated cover for this target, use it
      if (templateData && templateData.targets && templateData.targets[target.id]) {
        state = templateData.targets[target.id].state;
        const manualCover = getCoverBetween(target, attacker);
        if (manualCover && manualCover !== 'none') {
          state = manualCover;
          highestFoundManualCover =
            coverPredecende[manualCover] > coverPredecende[highestFoundManualCover]
              ? manualCover
              : highestFoundManualCover;
        }
      }
      // If we have an attacker token, use standard calculation
      else if (attacker) {
        // First check for manual cover between tokens
        try {
          const manualCover = getCoverBetween(target, attacker);
          if (manualCover && manualCover !== 'none') {
            state = manualCover;
            highestFoundManualCover =
              coverPredecende[manualCover] > coverPredecende[highestFoundManualCover]
                ? manualCover
                : highestFoundManualCover;
          }
        } catch (_) {}

        // Fallback to auto-detection if no manual cover
        if (!state) {
          state = this.autoCoverSystem.detectCoverBetweenTokens(attacker, target);
        }
      }

      if (!state) {
        return;
      }

      // Persist cover info early so it's available for final safety injection
      try {
        const earlyBonus = this.autoCoverSystem.getCoverBonusByState(state) || 0;
        context._visionerCover = { state, bonus: earlyBonus };
      } catch (e) {
        console.error('PF2E Visioner | Error persisting cover info:', e);
      }

      let chosen = null;
      try {
        const selectedState = highestFoundManualCover !== 'none' ? highestFoundManualCover : state;
        // Only show popup if keybind is held
        const popupResult = await this.coverUIManager.showPopupAndApply(
          selectedState,
          highestFoundManualCover,
        );
        chosen = highestFoundManualCover !== 'none' ? highestFoundManualCover : popupResult.chosen;
      } catch (e) {
        console.warn('PF2E Visioner | Popup error (delegated):', e);
      }

      // If popup was used and a choice was made, use it; otherwise, use detected state
      state = chosen !== null ? chosen : state;

      // Store the override for onPreCreateChatMessage if popup was used
      if (chosen !== null) {
        this.autoCoverSystem.setPopupOverride(attacker, target, chosen, state);
      }

      if (state !== 'none') {
        const bonus = this.autoCoverSystem.getCoverBonusByState(state) || 0;

        if (bonus > 0) {
          const tgtActor = target.actor;
          const items = foundry.utils.deepClone(tgtActor._source?.items ?? []);

          // Remove any existing one-roll cover effects
          const filteredItems = items.filter(
            (i) =>
              !(i?.type === 'effect' && i?.flags?.['pf2e-visioner']?.ephemeralCoverRoll === true),
          );

          const label = getCoverLabel(state);
          const img = getCoverImageForState(state);

          // Add the cover effect with rules for both AC and reflex saves
          const coverEffect = {
            name: label,
            type: 'effect',
            system: {
              description: {
                value: `<p>${label}: +${bonus} circumstance bonus to AC and Reflex saves vs area effects.</p>`,
                gm: '',
              },
              rules: [
                {
                  key: 'FlatModifier',
                  selector: 'reflex',
                  type: 'circumstance',
                  value: bonus,
                  predicate: ['area-effect'],
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
            flags: {
              'pf2e-visioner': { forThisRoll: true, ephemeralCoverRoll: true },
            },
          };

          filteredItems.push(coverEffect);

          // Clone the actor with the temporary cover effect
          const clonedActor = tgtActor.clone({ items: filteredItems }, { keepId: true });

          // Ensure area-effect is in the roll options to trigger the predicate
          if (!context.options) context.options = [];
          // Handle both arrays and Sets for context.options
          if (Array.isArray(context.options)) {
            if (!context.options.includes('area-effect')) {
              context.options.push('area-effect');
            }
          } else if (context.options?.has && !context.options.has('area-effect')) {
            // If it's a Set, we need to convert it to an array to add the option
            context.options = Array.from(context.options);
            context.options.push('area-effect');
          } else if (!context.options) {
            context.options = ['area-effect'];
          }

          // Store computed cover for final pre-roll safety injection
          try {
            context._visionerCover = { state, bonus };
          } catch (_) {}

          // CRITICAL: Mark this reflex save as handled by popup wrapper
          // Use a time-based global flag that doesn't depend on context

          // CRITICAL: Store the original context actor for comparison
          context.actor = clonedActor;

          // IMPORTANT: Rebuild the CheckModifier using the cloned actor's statistic
          try {
            // Decide statistic slug and enforce in context
            let statSlug =
              context?.statistic ||
              (Array.isArray(context?.domains) && context.domains.includes('reflex')
                ? 'reflex'
                : null);
            if (!statSlug) statSlug = 'reflex';
            context.statistic = statSlug;

            // Ensure required domains and options
            const domSet = new Set(Array.isArray(context.domains) ? context.domains : []);
            domSet.add('saving-throw');
            domSet.add(statSlug);
            const optSet = new Set(
              Array.isArray(context.options)
                ? context.options
                : context.options instanceof Set
                  ? context.options
                  : [],
            );
            optSet.add('area-effect');
            context.domains = Array.from(domSet);
            context.options = Array.from(optSet);

            const statObj = context.actor?.getStatistic?.(statSlug);
            // Use the correct method for creating checks in current PF2E system version
            if (statObj?.check?.clone) {
              const rebuildCtx = {
                domains: context.domains,
                options: new Set(context.options),
                type: 'saving-throw',
              };
              const rebuilt = statObj.check.clone(rebuildCtx);
              check = rebuilt;

              // Fallback: if the rebuilt check still doesn't include our cover, inject directly
              try {
                const alreadyHas =
                  Array.isArray(check?.modifiers) &&
                  check.modifiers.some((m) => m?.slug === 'pf2e-visioner-cover');
                if (!alreadyHas && (bonus || 0) > 0) {
                  const label =
                    state === 'greater'
                      ? 'Greater Cover'
                      : state === 'standard'
                        ? 'Cover'
                        : 'Lesser Cover';
                  let pf2eMod;
                  try {
                    pf2eMod = game?.pf2e?.Modifier
                      ? new game.pf2e.Modifier({
                          slug: 'pf2e-visioner-cover',
                          label,
                          modifier: bonus,
                          type: 'circumstance',
                          predicate: { any: ['area-effect'] },
                        })
                      : {
                          slug: 'pf2e-visioner-cover',
                          label,
                          modifier: bonus,
                          type: 'circumstance',
                          enabled: true,
                        };
                  } catch (_) {
                    pf2eMod = {
                      slug: 'pf2e-visioner-cover',
                      label,
                      modifier: bonus,
                      type: 'circumstance',
                      enabled: true,
                    };
                  }
                  // Push onto the check's modifiers array if present
                  if (Array.isArray(check.modifiers)) check.modifiers.push(pf2eMod);
                }
              } catch (injErr) {
                console.error(
                  'PF2E Visioner | ⚠️ Failed fallback injection of cover modifier:',
                  injErr,
                );
              }
            }
          } catch (rebuildErr) {
            console.error(
              'PF2E Visioner | ❌ Failed to rebuild CheckModifier for reflex save:',
              rebuildErr,
            );
          }
        }
      }
    } catch (e) {
      console.error('PF2E Visioner | ❌ Error in popup wrapper:', e);
    }

    // (Moved earlier) off-guard ephemerals ensured before calculation

    // FINAL REFLEX COVER INJECTION (minimal): push cover modifier into the Check
    try {
      const coverInfo = context?._visionerCover;
      const bonus = Number(coverInfo?.bonus) || 0;
      if (bonus > 1) {
        const state = coverInfo?.state ?? 'standard';
        // Ensure predicate support
        const optSet = new Set(
          Array.isArray(context.options)
            ? context.options
            : context.options instanceof Set
              ? context.options
              : [],
        );
        optSet.add('area-effect');
        context.options = Array.from(optSet);

        // Build PF2E Modifier
        const label =
          state === 'greater'
            ? 'Greater Cover'
            : state === 'standard'
              ? 'Standard Cover'
              : 'Lesser Cover';
        let pf2eMod;
        try {
          pf2eMod = game?.pf2e?.Modifier
            ? new game.pf2e.Modifier({
                slug: 'pf2e-visioner-cover',
                label,
                modifier: bonus,
                type: 'circumstance',
                predicate: ['area-effect'],
              })
            : {
                slug: 'pf2e-visioner-cover',
                label,
                modifier: bonus,
                type: 'circumstance',
                predicate: ['area-effect'],
                enabled: true,
              };
        } catch (_) {
          pf2eMod = {
            slug: 'pf2e-visioner-cover',
            label,
            modifier: bonus,
            type: 'circumstance',
            enabled: true,
          };
        }

        const already = !!(
          check?.modifiers &&
          typeof check.modifiers.some === 'function' &&
          check.modifiers.some((m) => m?.slug === 'pf2e-visioner-cover')
        );
        if (!already && check && typeof check.push === 'function') {
          check.push(pf2eMod);
        }
      }
    } catch (finalErr) {
      console.error('PF2E Visioner | ⚠️ Minimal reflex injection failed', finalErr);
    }
  }

  /**
   * Resolve stealther token from stealth check context
   * @param {Object} ctx - Context object
   * @returns {Object|null}
   * @private
   */
  _resolveAttackerFromCtx(ctx) {
    try {
      const tokenObj = ctx?.token?.object || ctx?.token;
      if (tokenObj?.id) return tokenObj;
      if (ctx?.token?.isEmbedded && ctx?.token?.object?.id) return ctx.token.object;
      // Try a variety of sources, including origin.token (UUID like Scene.X.Token.Y)
      const tokenIdRaw =
        ctx?.token?.id ||
        ctx?.tokenId ||
        ctx?.origin?.tokenId ||
        ctx?.origin?.token ||
        ctx?.actor?.getActiveTokens?.()?.[0]?.id;
      const tokenId = this.normalizeTokenRef(tokenIdRaw);
      return tokenId ? canvas?.tokens?.get?.(tokenId) || null : null;
    } catch (_) {
      return null;
    }
  }
}

// Singleton instance
const savingThrowUseCase = new SavingThrowUseCase();
export default savingThrowUseCase;

// Also export the class for reference
export { SavingThrowUseCase };
