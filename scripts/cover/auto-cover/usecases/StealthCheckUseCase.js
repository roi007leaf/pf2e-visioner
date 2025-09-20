/**
 * StealthCheckUseCase.js
 * Handles stealth check contexts for auto-cover
 */

import { COVER_STATES } from '../../../constants.js';
import { getCoverLabel, getCoverStealthBonusByState } from '../../../helpers/cover-helpers.js';
import { CoverModifierService } from '../../../services/CoverModifierService.js';
import { getCoverBetween } from '../../../utils.js';
import autoCoverSystem from '../AutoCoverSystem.js';
import { BaseAutoCoverUseCase } from './BaseUseCase.js';

const coverPrecedence = {
  none: 0,
  lesser: 1,
  standard: 2,
  greater: 4,
};

class StealthCheckUseCase extends BaseAutoCoverUseCase {
  constructor() {
    super();
    // Use the singleton auto-cover system directly
    this.autoCoverSystem = autoCoverSystem;
    // Use the singleton cover modifier service
    this.coverModifierService = CoverModifierService.getInstance();
  }
  /**
   * Inject/update/remove the cover modifier on a CheckModifiersDialog's check.
   * - If keepWhenZero=false: keep only when bonus > 1 (standard/greater), otherwise remove.
   * - If keepWhenZero=true: allow 0 to update existing or be shown transiently (used on onChosen path).
   */
  _applyDialogCoverModifier(dialog, bonus, label, { keepWhenZero = false } = {}) {
    try {
      if (!dialog?.check || !Array.isArray(dialog.check.modifiers)) return;
      const mods = dialog.check.modifiers;
      const existing = mods.find((m) => m?.slug === 'pf2e-visioner-cover');

      const shouldKeep = keepWhenZero ? bonus > 1 || bonus === 0 : bonus > 1;

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
                enabled: true, // Explicitly set enabled to true
              });
            } else {
              coverModifier = {
                slug: 'pf2e-visioner-cover',
                label,
                modifier: bonus,
                type: 'circumstance',
                enabled: true, // Explicitly set enabled to true
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
    } catch (_) {}
  }

  /**
   * Handle a chat message context
   * @param {Object} data - Message data
   * @returns {Promise<Object>} Result with tokens and cover state
   */
  async handlePreCreateChatMessage(data, doc = null) {
    try {
      const ctx = data?.flags?.pf2e?.context || {};
      const speakerTokenId = this.normalizeTokenRef(data?.speaker?.token);
      const targetTokenId = this._resolveTargetTokenIdFromData(data);

      const tokens = canvas?.tokens;
      if (!tokens?.get) return;

      let hiderTokenId = speakerTokenId;

      let hider = tokens.get(hiderTokenId);
      if (!hider) return;
      const target = tokens.get(targetTokenId);
      if (!target) return;

      // Only proceed if this user owns the hiding token or is the GM
      if (!hider.isOwner && !game.user.isGM) {
        return;
      }

      // Detect base cover state
      let state;

      // For saving throws, first check our dedicated template data map (preferred source)

      // If a stored template origin was recorded for this attacker, prefer using that point
      try {
        const originRec = window?.pf2eVisionerTemplateOrigins?.get?.(hider.id);
        if (originRec && !state) {
          // Only use this if we haven't already determined state from template data
          state = this._detectCover(originRec.point, target);
        }
      } catch (_) {}

      if (!state) {
        // First check for manual cover between tokens
        try {
          const manualCover = getCoverBetween(hider, target);
          if (manualCover && manualCover !== 'none') {
            state = manualCover;
          }
        } catch (_) {}

        // Fallback to auto-detection if no manual cover
        if (!state) {
          state = this._detectCover(hider, target);
        }
      }

      const originalDetectedState = state;
      let wasOverridden = false;
      let overrideSource = null;
      try {
        // Prefer roll-specific override if a rollId is present in message context
        const rollId = ctx?._visionerRollId || data?.flags?.['pf2e-visioner']?.rollId || null;
        const overrideData = this.autoCoverSystem.consumeCoverOverride(
          hider,
          target,
          rollId,
          false,
        );
        if (overrideData) {
          if (overrideData.state !== originalDetectedState) {
            wasOverridden = true;
            overrideSource = overrideData.source;
          }
          state = overrideData.state;
        }
      } catch (e) {
        console.warn('PF2E Visioner | Failed to check override manager:', e);
      }

      // Store override information in chat message flags for later display
      if (wasOverridden) {
        try {
          if (!data.flags) data.flags = {};
          if (!data.flags['pf2e-visioner']) data.flags['pf2e-visioner'] = {};
          const overrideData = {
            originalDetected: originalDetectedState,
            finalState: state,
            overrideSource: overrideSource,
            hiderName: hider.name,
            targetName: target.name,
          };
          data.flags['pf2e-visioner'].coverOverride = overrideData;

          // Store in temporary map as backup in case flags don't persist
          this.autoCoverSystem.setRollOverride(
            hider,
            target,
            ctx?._visionerRollId,
            overrideData.originalDetected,
            overrideData.finalState,
          );

          // Also try to update the document directly if it exists
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

      // Apply cover if any
      if (state !== 'none') {
        await this.autoCoverSystem.setCoverBetween(hider, target, state, {
          skipEphemeralUpdate: true,
        });
        this.autoCoverSystem.recordPair(hider.id, target.id);
      }
    } catch (e) {
      console.warn('PF2E Visioner | Error in onPreCreateChatMessage:', e);
    }
  }

  /**
   * Handle a check modifiers dialog context
   * @param {Object} dialog - Dialog object
   * @param {Object} ctx - Check context
   * @returns {Promise<Object>} Result with tokens and cover state
   */
  async handleCheckDialog(dialog, html) {
    try {
      const ctx = dialog?.context ?? {};

      let target = null;
      // Resolve hider (actor making the stealth check)
      const hider = ctx?.actor?.getActiveTokens?.()?.[0] || ctx?.token?.object;
      if (!hider) {
        return;
      }

      let detectedState = 'none';
      let highestFoundManualCover = 'none';
      try {
        const observers = (canvas?.tokens?.placeables || []).filter(
          (t) => t && t.actor && t.id !== hider.id,
        );
        for (const obs of observers) {
          // First check for manual cover between tokens
          let s = null;
          try {
            const manualCover = getCoverBetween(obs, hider);
            if (manualCover && manualCover !== 'none') {
              s = manualCover;
              highestFoundManualCover =
                coverPrecedence[manualCover] > coverPrecedence[highestFoundManualCover]
                  ? manualCover
                  : highestFoundManualCover;
            }
          } catch (_) {}

          // Fallback to auto-detection if no manual cover
          if (!s) {
            s = this._detectCover(hider, obs);
          }

          if (s && s !== 'none') {
            target = obs;
            detectedState = coverPrecedence[detectedState] < coverPrecedence[s] ? s : detectedState;
          }
        }
      } catch (_) {}

      // Inject cover override UI, using a callback to apply stealth-specific behavior on chosen state
      try {
        await this.coverUIManager.injectDialogCoverUI(
          dialog,
          html,
          detectedState,
          target,
          highestFoundManualCover,
          async ({ chosen, subject: hider, target: tgt, rollId }) => {
            try {
              // Determine if this will be an override
              if (highestFoundManualCover !== 'none') {
                chosen = highestFoundManualCover;
              }
              const wasChanged = chosen !== detectedState;
              const originalBonus = Number(COVER_STATES?.[detectedState]?.bonusStealth ?? 0);
              const finalBonus = Number(COVER_STATES?.[chosen]?.bonusStealth ?? 0);

              if (rollId) {
                const modifierData = {
                  originalState: detectedState,
                  originalBonus: originalBonus,
                  finalState: chosen,
                  finalBonus: finalBonus,
                  isOverride: wasChanged,
                  source: wasChanged ? 'dialog-override' : 'automatic',
                  timestamp: Date.now(),
                };

                this.coverModifierService.setOriginalCoverModifier(rollId, modifierData);

                // Note: Clean up of old entries removed - could be moved to the service if needed
              }

              if (wasChanged) {
                // Store roll-specific override for this specific hider->observer pair
                if (hider && tgt) {
                  const targetTokenId = tgt.id || tgt.token?.id || null;
                  if (targetTokenId) {
                    this.autoCoverSystem.setRollOverride(hider, tgt, rollId, detectedState, chosen);
                  } else {
                    console.warn(
                      'PF2E Visioner | Could not resolve target token ID for dialog override',
                    );
                  }
                }

                // Additionally store roll-specific overrides for Hide/Sneak across all observers
                if (chosen !== 'none') {
                  const observers = (canvas?.tokens?.placeables || []).filter(
                    (t) => t && t.actor && t.id !== hider?.id,
                  );
                  for (const obs of observers) {
                    this.autoCoverSystem.setRollOverride(hider, obs, rollId, detectedState, chosen);
                  }
                }
                detectedState = chosen;
              }

              // Calculate the new bonus for the chosen state
              const newBonus = getCoverStealthBonusByState(detectedState);

              // Check if this is a sneak action - if so, don't apply cover bonus
              const isSneakAction = this._isSneakAction(dialog.context || {});
              
              if (!isSneakAction) {
                // Update the current dialog's modifiers immediately (in onChosen allow zero to be kept)
                this._applyDialogCoverModifier(dialog, newBonus, getCoverLabel(chosen), {
                  keepWhenZero: true,
                });
              }
              // Apply cover state between tokens (for both attacks and saves)
              if (hider && target && detectedState !== 'none') {
                await this.autoCoverSystem.setCoverBetween(hider, target, detectedState, {
                  skipEphemeralUpdate: true,
                });
                this.autoCoverSystem.recordPair(hider.id, target.id);
              }
            } catch (cbErr) {
              console.error('PF2E Visioner | Stealth onChosen callback error:', cbErr);
            }
          },
        );
        dialog.check.calculateTotal();
      } catch (e) {}
    } catch (_) {}
  }

  async onRenderChatMessage(message, html) {
    super.handleRenderChatMessage(message, html, false);
    const data = message?.toObject?.() || {};
    const attackerIdRaw =
      data?.speaker?.token || data?.flags?.pf2e?.context?.token?.id || data?.flags?.pf2e?.token?.id;
    const attackerId = this.normalizeTokenRef(attackerIdRaw);
    const targetId = this._resolveTargetTokenIdFromData(data);
    if (!attackerId) return;
    const tokens = canvas?.tokens;
    if (!tokens?.get) return;
    const attacker = tokens.get(attackerId);
    if (!attacker) return;

    // Only proceed if this user owns the attacking token or is the GM
    if (!attacker.isOwner && !game.user.isGM) return;

    const targetIds = targetId ? [targetId] : this.consumePairs(attackerId);
    if (targetIds.length === 0) return;
    const targets = targetIds.map((tid) => tokens.get(tid)).filter((t) => !!t);
    if (targets.length === 0) return;
    try {
      for (const target of targets) {
        await this.autoCoverSystem.setCoverBetween(attacker, target, 'none', {
          skipEphemeralUpdate: true,
        });
        try {
          await this.autoCoverSystem.cleanupCover(target, attacker);
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
      // CRITICAL: Capture start positions for movement tracking when stealth check begins
      try {
        
        // Resolve the hider (actor making the stealth check)
        let hider = context?.actor?.getActiveTokens?.()?.[0] || context?.token?.object || null;
        if (!hider) hider = this._resolveStealtherFromCtx(context);
        
        if (hider && (hider.isOwner || game.user.isGM)) {
          
          // Store the current position coordinates for historical tracking
          const storedStartPosition = {
            x: hider.x,
            y: hider.y,
            center: { x: hider.center.x, y: hider.center.y },
            tokenId: hider.id,
            tokenName: hider.name,
            timestamp: Date.now(),
          };
          
          
          // Import sneak action service to capture positions
          const { SneakActionHandler } = await import('../../../chat/services/actions/sneak-action.js');
          const sneakActionService = new SneakActionHandler();
          
          // Create action data for position capture
          const actionData = {
            actor: context.actor || hider.actor,
            messageId: `stealth-check-${Date.now()}`, // Temporary ID until real message is created
            timestamp: Date.now(),
            rollId: context._visionerRollId,
          };
          
          // Capture start positions immediately when stealth check begins, using stored coordinates
          await sneakActionService._captureStartPositions(actionData, storedStartPosition);
          
        }
      } catch (error) {
        console.warn('PF2E Visioner | Failed to capture start positions during stealth check:', error);
      }

      try {
        // Resolve the hider (actor making the stealth check)
        let hider = context?.actor?.getActiveTokens?.()?.[0] || context?.token?.object || null;
        if (!hider) hider = this._resolveStealtherFromCtx(context);
        if (hider && (hider.isOwner || game.user.isGM)) {
          try {
            // Check for a manual override set by the Check Modifiers dialog
            let state = null;
            let isOverride = false;
            try {
              const stealthDialog = Object.values(ui.windows).find(
                (w) => w?.constructor?.name === 'CheckModifiersDialog',
              );
              if (stealthDialog?._pvCoverOverride) {
                state = stealthDialog._pvCoverOverride;
                isOverride = true;
              }
            } catch (_) {}

            // If not overridden, evaluate cover against all other tokens and pick the best (highest stealth bonus)
            const observers = (canvas?.tokens?.placeables || []).filter(
              (t) => t && t.actor && t.id !== hider.id,
            );
            let highestFoundManualCover = 'none';
            if (!state) {
              let detectedState;
              try {
                for (const obs of observers) {
                  try {
                    // First check for manual cover between tokens
                    let s = null;
                    try {
                      const manualCover = getCoverBetween(hider, obs);
                      if (manualCover && manualCover !== 'none') {
                        s = manualCover;
                        highestFoundManualCover =
                          coverPrecedence[manualCover] > coverPrecedence[highestFoundManualCover]
                            ? manualCover
                            : highestFoundManualCover;
                      }
                    } catch (_) {}

                    // Fallback to auto-detection if no manual cover
                    if (!s) {
                      s = this._detectCover(hider, obs);
                    }

                    if (s) {
                      detectedState =
                        coverPrecedence[detectedState] < coverPrecedence[s] ? s : detectedState;
                    }
                  } catch (_) {}
                }
              } catch (_) {}
              state = detectedState;
            }

            // Store the original state before any popup changes
            const originalDetectedState = state;
            const originalBonus = Number(COVER_STATES?.[originalDetectedState]?.bonusStealth ?? 0);

            try {
              const popupResult = await this.coverUIManager.showPopupAndApply(state);
              const { chosen, rollId } = popupResult || {};
              if (chosen) {
                context._visionerRollId = rollId;
                const finalState =
                  highestFoundManualCover !== 'none' ? highestFoundManualCover : chosen;

                // Determine if this was an override
                const wasOverridden = finalState !== originalDetectedState;
                const finalBonus = Number(COVER_STATES?.[finalState]?.bonusStealth ?? 0);

                if (rollId) {
                  const modifierData = {
                    originalState: originalDetectedState,
                    originalBonus: originalBonus,
                    finalState: chosen,
                    finalBonus: finalBonus,
                    isOverride: wasOverridden,
                    source: wasOverridden ? 'popup-override' : 'automatic',
                    timestamp: Date.now(),
                  };

                  this.coverModifierService.setOriginalCoverModifier(rollId, modifierData);

                  // Note: Clean up of old entries removed - could be moved to the service if needed
                }

                // Now update the state to the chosen value
                state = highestFoundManualCover !== 'none' ? highestFoundManualCover : chosen;
                // Only store as override if it actually changed
                if (state !== originalDetectedState) {
                  // Store a roll-specific override so it won't leak into later dialogs
                  observers.map((obs) =>
                    this.autoCoverSystem.setRollOverride(
                      hider,
                      obs,
                      rollId,
                      originalDetectedState,
                      state,
                    ),
                  );
                  isOverride = true;
                }
              }
            } catch (e) {
              console.warn('PF2E Visioner | Popup error (delegated):', e);
            }

            const bonus = Number(COVER_STATES?.[state]?.bonusStealth ?? 0);

            try {
              context._visionerStealth = {
                state,
                bonus,
                isOverride,
                rollId: context?._visionerRollId,
                source: isOverride ? 'override' : 'automatic',
              };
            } catch (_) {}
          } catch (e) {
            console.warn('PF2E Visioner | ⚠️ Stealth cover handling failed', e);
          }
        }
      } catch (e) {
        console.warn('PF2E Visioner | ❌ Error in popup wrapper:', e);
      }

      const coverInfo = context?._visionerStealth;
      const bonus = Number(coverInfo?.bonus) || 0;
      
      // Check if this is a Sneak action (not Hide) to skip cover bonus
      const isSneakAction = this._isSneakAction(context);
      
      if (bonus > 1 && !isSneakAction) {
        const state = coverInfo?.state ?? 'standard';
        // Ensure predicate support
        const optSet = new Set(Array.isArray(context.options) ? context.options : []);
        optSet.add('area-effect');
        context.options = Array.from(optSet);

        const label = getCoverLabel(state);
        let pf2eMod;
        try {
          pf2eMod = game?.pf2e?.Modifier
            ? new game.pf2e.Modifier({
                slug: 'pf2e-visioner-cover',
                label,
                modifier: bonus,
                type: 'circumstance',
                enabled: true, // Explicitly set enabled to true
              })
            : {
                slug: 'pf2e-visioner-cover',
                label,
                modifier: bonus,
                type: 'circumstance',
                enabled: true, // Explicitly set enabled to true
              };
        } catch (_) {
          pf2eMod = {
            slug: 'pf2e-visioner-cover',
            label,
            modifier: bonus,
            type: 'circumstance',
            enabled: true, // Explicitly set enabled to true
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

      return {
        success: true,
      };
    } catch (error) {
      console.error('PF2E Visioner | StealthCheckUseCase.handleRoll error:', error);
      return { success: false };
    }
  }

  /**
   * Get the original cover modifier that was applied to a roll
   * @param {string} rollId - The roll ID
   * @returns {Object|null} Original cover modifier data or null if not found
   */
  getOriginalCoverModifier(rollId) {
    return this.coverModifierService.getOriginalCoverModifier(rollId);
  }

  /**
   * Determines if the current action is a Sneak action (as opposed to Hide)
   * @param {Object} context - Roll context
   * @returns {boolean} True if this is a Sneak action
   * @private
   */
  _isSneakAction(context) {
    try {
      // Check for the standard PF2E sneak action roll option
      const options = context?.options;
      let hasActionSneak = false;
      
      if (options) {
        if (Array.isArray(options)) {
          hasActionSneak = options.includes('action:sneak');
        } else if (options instanceof Set) {
          hasActionSneak = options.has('action:sneak');
        } else if (typeof options.includes === 'function') {
          hasActionSneak = options.includes('action:sneak');
        }
      }
      
      // Debug logging removed - sneak action detection working correctly
      return hasActionSneak;
    } catch (error) {
      console.warn('PF2E Visioner | Error detecting Sneak action:', error);
      return false;
    }
  }

  /**
   * Resolve stealther token from stealth check context
   * @param {Object} ctx - Context object
   * @returns {Object|null}
   * @private
   */
  _resolveStealtherFromCtx(ctx) {
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
const stealthCheckUseCase = new StealthCheckUseCase();
export default stealthCheckUseCase;

// Also export the class for reference
export { StealthCheckUseCase };
