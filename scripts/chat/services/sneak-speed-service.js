/**
 * Sneak Speed Service
 * - Applies a label-only "Sneaking" effect when Sneak starts (n          const effectData = {
            name: label,
            type: 'effect',
            img: 'icons/creatures/mammals/cat-hunched-glowing-red.webp',
            system: {
              slug: 'sneaking',
              rules: [],
              tokenIcon: { show: true },
              unidentified: false,
              // Keep duration flexible; we'll remove explicitly on restore
              duration: { value: -1, unit: 'unlimited', expiry: null, sustained: false },
              start: { value: game.time.worldTime },
              description: { value: 'Currently sneaking. Visual indication of active sneak status.' },
              level: { value: 0 },
              traits: { rarity: 'common', value: [] },
              source: { value: 'pf2e-visioner' },
            },
            flags: { 
              core: { sourceId: null }, 
              [MODULE_ID]: { sneakingEffect: true } 
            },
          };e)
 * - Removes that effect when Sneak ends
 * - Provides a helper to compute max Sneak distance (floor(base*multiplier) + bonuses, capped at Speed)
 *
 * Notes:
 * - We no longer change system.attributes.speed.value during Sneak
 * - A legacy flag (sneak-original-walk-speed) may exist from previous versions and is cleared on restore
 */

import turnSneakTracker from './turn-sneak-tracker.js';

const MODULE_ID = 'pf2e-visioner';
const ORIGINAL_SPEED_FLAG = 'sneak-original-walk-speed';
const EFFECT_ID_FLAG = 'sneak-speed-effect-id';

export class SneakSpeedService {
  /**
   * Resolve an Actor from a token or actor reference.
   * @param {Token|Actor} tokenOrActor
   * @returns {Actor|null}
   */
  static resolveActor(tokenOrActor) {
    if (!tokenOrActor) return null;
    // Token object with actor
    if (tokenOrActor.actor) return tokenOrActor.actor;
    // Token document
    if (tokenOrActor.document?.actor) return tokenOrActor.document.actor;
    // Already an actor
    if (tokenOrActor.system?.attributes) return tokenOrActor;
    return null;
  }

  /**
   * Back-compat shim: legacy API expected to halve speed unless a feat grants full speed.
   * New behavior: we don't change base speed; we apply a label-only effect to indicate Sneaking.
   * We now always create the Sneaking effect for visual indication, regardless of speed multiplier.
   * @param {Token|Actor} tokenOrActor
   */
  static async applySneakWalkSpeed(tokenOrActor) {
    try {
      const actor = SneakSpeedService.resolveActor(tokenOrActor);
      if (!actor) {
        console.warn('PF2E Visioner | applySneakWalkSpeed: Could not resolve actor from', tokenOrActor);
        return;
      }

      console.log(`PF2E Visioner | Creating Sneaking effect for ${actor.name}`);

      // Always apply a label-only effect to indicate Sneaking, regardless of speed multiplier
      await SneakSpeedService.applySneakStartEffect(actor);

      console.log(`PF2E Visioner | Sneaking effect creation completed for ${actor.name}`);
      console.log('PF2E Visioner | To manually clear sneaking effect, run: game.modules.get("pf2e-visioner").api.clearSneakingEffect()');

      // Expose a debug function globally for manual clearing
      if (typeof window !== 'undefined') {
        window.clearSneakingEffectDebug = async () => {
          const controlled = canvas?.tokens?.controlled?.[0];
          if (controlled?.actor) {
            await SneakSpeedService._forceRestoreSneakWalkSpeed(controlled);
            console.log('Cleared sneaking effect for', controlled.name);
          } else {
            console.warn('No token selected. Please select a token first.');
          }
        };
      }
    } catch (e) {
      console.error('PF2E Visioner | applySneakWalkSpeed failed:', e);
      console.error('PF2E Visioner | Stack trace:', e.stack);
    }
  }

  /**
   * Halve walking speed for the provided token/actor.
   * Prefers adding a PF2e effect (ActiveEffectLike multiply 0.5) so the sheet/UI updates properly.
   * Falls back to directly updating system.attributes.speed.value when effects aren't available.
   * Safe to call multiple times; will not stack.
   * @param {Token|Actor} tokenOrActor
   */
  static async applySneakStartEffect(tokenOrActor) {
    try {
      const actor = SneakSpeedService.resolveActor(tokenOrActor);
      if (!actor) return;

      // If already applied effect, do nothing
      const existingEffectId = actor.getFlag?.(MODULE_ID, EFFECT_ID_FLAG);
      if (existingEffectId) {
        // Debug: Check if the effect actually exists and its properties
        const existingEffect = actor.items?.get?.(existingEffectId) || actor.items?.find?.(i => i.id === existingEffectId);
        if (existingEffect) {
          console.log('PF2E Visioner | Existing effect found:', {
            name: existingEffect.name,
            id: existingEffect.id,
            type: existingEffect.type,
            tokenIcon: existingEffect.system?.tokenIcon,
            slug: existingEffect.system?.slug,
            isVisible: existingEffect.system?.tokenIcon?.show
          });
        } else {
          console.warn('PF2E Visioner | Effect ID flagged but effect not found in actor items. Clearing stale flag.');
          await actor.unsetFlag(MODULE_ID, EFFECT_ID_FLAG);
          // Don't return - continue to create new effect
        }

        if (existingEffect) return;
      }

      const current = Number(actor.system?.movement?.speeds?.land?.value ?? 0);
      if (!Number.isFinite(current) || current <= 0) {
        console.warn('PF2E Visioner | applySneakStartEffect: Invalid speed for', actor.name, 'current speed:', current);
        return;
      }

      console.log('PF2E Visioner | applySneakStartEffect: Creating effect for', actor.name, 'with speed:', current);

      // Try to use a PF2e effect with ActiveEffectLike to multiply base speed by the calculated multiplier
      try {
        if (typeof actor.createEmbeddedDocuments === 'function') {
          // Build a helpful label that communicates the estimated max distance for this Sneak action
          const label = 'Sneaking';
          const effectData = {
            name: label,
            type: 'effect',
            img: 'icons/creatures/mammals/cat-hunched-glowing-red.webp',
            system: {
              rules: [],
              tokenIcon: { show: true },
              unidentified: false,
              // Keep duration flexible; we’ll remove explicitly on restore
              duration: { unit: 'unlimited' },
            },
            flags: { [MODULE_ID]: { sneakingEffect: true } },
          };
          console.log('PF2E Visioner | applySneakStartEffect: Calling createEmbeddedDocuments for', actor.name, 'with data:', effectData);

          const created = await actor.createEmbeddedDocuments('Item', [effectData]);
          const effect = Array.isArray(created) ? created[0] : null;

          console.log('PF2E Visioner | applySneakStartEffect: createEmbeddedDocuments result for', actor.name, 'created:', created, 'effect:', effect);

          if (effect?.id) {
            await actor.setFlag(MODULE_ID, EFFECT_ID_FLAG, effect.id);
            console.log('PF2E Visioner | applySneakStartEffect: Successfully created and flagged effect for', actor.name, 'with ID:', effect.id);
            return; // Done via effect
          } else {
            console.warn('PF2E Visioner | applySneakStartEffect: Effect creation failed - no valid effect returned for', actor.name);
          }
        }
      } catch (effectErr) {
        console.error('PF2E Visioner | Could not create Sneak effect (continuing):', effectErr);
      }
    } catch (error) {
      console.warn('PF2E Visioner | Failed to apply sneak walk speed:', error);
    }
  }

  /**
   * Restore the original walking speed if it was halved by applySneakWalkSpeed.
   * Safe to call even if not applied.
   * @param {Token|Actor} tokenOrActor
   */
  static async restoreSneakWalkSpeed(tokenOrActor) {
    try {
      const actor = SneakSpeedService.resolveActor(tokenOrActor);
      if (!actor) return;

      // Check if we should preserve the Sneaking effect for Sneaky/Very Sneaky feat users
      const shouldPreserveEffect = SneakSpeedService._shouldPreserveSneakingEffect(tokenOrActor, actor);

      if (shouldPreserveEffect) {
        console.log(`PF2E Visioner | Preserving Sneaking effect for ${actor.name} until end of turn (Sneaky/Very Sneaky feat)`);
        return; // Don't remove the effect yet
      }

      // Remove created effect if it exists
      try {
        const effectId = actor.getFlag?.(MODULE_ID, EFFECT_ID_FLAG);
        if (effectId) {
          const effectExists = actor.items?.get?.(effectId) || actor.items?.find?.((i) => i.id === effectId);
          if (effectExists && typeof actor.deleteEmbeddedDocuments === 'function') {
            await actor.deleteEmbeddedDocuments('Item', [effectId]);
          }
          await actor.unsetFlag(MODULE_ID, EFFECT_ID_FLAG);
        }
      } catch (e) {
        console.error('PF2E Visioner | Failed removing sneak speed effect (continuing):', e);
      }
      // Clear legacy original speed flag if present (backward compatibility)
      const original = actor.getFlag?.(MODULE_ID, ORIGINAL_SPEED_FLAG);
      if (original !== undefined && original !== null) {
        await actor.unsetFlag(MODULE_ID, ORIGINAL_SPEED_FLAG);
      }
    } catch (error) {
      console.warn('PF2E Visioner | Failed to restore sneak walk speed:', error);
    }
  }

  /**
   * Check if the Sneaking effect should be preserved for Sneaky/Very Sneaky feat users
   * @param {Token|Actor} tokenOrActor - Original token or actor reference
   * @param {Actor} actor - Resolved actor
   * @returns {boolean} True if effect should be preserved until end of turn
   * @private
   */
  static _shouldPreserveSneakingEffect(tokenOrActor, actor) {
    try {
      // If we have the original token, use it directly
      if (tokenOrActor && tokenOrActor.actor && typeof turnSneakTracker?.shouldPreserveSneakActiveFlag === 'function') {
        return turnSneakTracker.shouldPreserveSneakActiveFlag(tokenOrActor);
      }

      // Otherwise, try to find a token for this actor on the current scene
      if (canvas?.tokens?.placeables && actor) {
        const token = canvas.tokens.placeables.find(t => t.actor?.id === actor.id);
        if (token && typeof turnSneakTracker?.shouldPreserveSneakActiveFlag === 'function') {
          return turnSneakTracker.shouldPreserveSneakActiveFlag(token);
        }
      }
    } catch (error) {
      console.warn('PF2E Visioner | Error checking Sneaking effect preservation:', error);
    }

    return false; // Default to not preserving if we can't determine
  }

  /**
   * Force restore sneak walk speed without checking feat preservation
   * Used by TurnSneakTracker for end-of-turn cleanup
   * @param {Token|Actor} tokenOrActor
   * @private
   */
  static async _forceRestoreSneakWalkSpeed(tokenOrActor) {
    try {
      const actor = SneakSpeedService.resolveActor(tokenOrActor);
      if (!actor) return;

      // Force remove created effect if it exists (bypass feat check)
      try {
        const effectId = actor.getFlag?.(MODULE_ID, EFFECT_ID_FLAG);
        if (effectId) {
          const effectExists = actor.items?.get?.(effectId) || actor.items?.find?.((i) => i.id === effectId);
          if (effectExists && typeof actor.deleteEmbeddedDocuments === 'function') {
            await actor.deleteEmbeddedDocuments('Item', [effectId]);
          }
          await actor.unsetFlag(MODULE_ID, EFFECT_ID_FLAG);
        }
      } catch (e) {
        console.error('PF2E Visioner | Failed force removing sneak speed effect (continuing):', e);
      }

      // Clear legacy original speed flag if present (backward compatibility)
      const original = actor.getFlag?.(MODULE_ID, ORIGINAL_SPEED_FLAG);
      if (original !== undefined && original !== null) {
        await actor.unsetFlag(MODULE_ID, ORIGINAL_SPEED_FLAG);
      }
    } catch (error) {
      console.warn('PF2E Visioner | Failed to force restore sneak walk speed:', error);
    }
  }

  /**
   * Compute the maximum distance (in feet) a token can move with a single Sneak action,
   * considering speed multiplier (halved or full) and feat-based flat bonuses.
   * Per Very Sneaky, the total distance cannot exceed the creature's Speed.
   * @param {Token|Actor} tokenOrActor
   * @returns {number} feet
   */
  static async getSneakMaxDistanceFeet(tokenOrActor) {
    const actor = SneakSpeedService.resolveActor(tokenOrActor);
    if (!actor) return 0;
    // Prefer original speed flag if present (so we don't double-apply the effect when Sneak is active)
    const original = actor.getFlag?.(MODULE_ID, ORIGINAL_SPEED_FLAG);
    const baseSpeed = Number(original ?? actor.system?.movement?.speeds?.land?.value ?? 0) || 0;
    if (baseSpeed <= 0) return 0;

    let multiplier = 0.5;
    let bonusFeet = 0;
    try {
      const { FeatsHandler } = await import('./feats-handler.js');
      multiplier = FeatsHandler.getSneakSpeedMultiplier(actor) ?? 0.5;
      bonusFeet = FeatsHandler.getSneakDistanceBonusFeet(actor) ?? 0;
    } catch { }

    const raw = Math.floor(baseSpeed * multiplier) + bonusFeet;
    // Cannot exceed base Speed as per Very Sneaky text
    const capped = Math.min(baseSpeed, raw);
    // Round down to nearest 5 feet per PF2e grid conventions
    const roundedDown5 = Math.floor(capped / 5) * 5;
    return roundedDown5;
  }
}

export default SneakSpeedService;
