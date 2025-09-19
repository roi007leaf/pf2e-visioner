/**
 * Sneak Speed Service
 * - Applies a label-only "Sneaking" effect when Sneak starts (no speed change)
 * - Removes that effect when Sneak ends
 * - Provides a helper to compute max Sneak distance (floor(base*multiplier) + bonuses, capped at Speed)
 *
 * Notes:
 * - We no longer change system.attributes.speed.value during Sneak
 * - A legacy flag (sneak-original-walk-speed) may exist from previous versions and is cleared on restore
 */

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
   * If multiplier resolves to 1.0, we skip any effect/flags entirely (as tests expect).
   * @param {Token|Actor} tokenOrActor
   */
  static async applySneakWalkSpeed(tokenOrActor) {
    try {
      const actor = SneakSpeedService.resolveActor(tokenOrActor);
      if (!actor) return;
      let multiplier = 0.5;
      try {
        const { FeatsHandler } = await import('./feats-handler.js');
        multiplier = FeatsHandler.getSneakSpeedMultiplier(actor) ?? 0.5;
      } catch { /* default multiplier */ }

      // If full-speed Sneak, do nothing (skip effect/flags)
      if (multiplier >= 0.999) return;

      // Otherwise, apply a label-only effect to indicate Sneaking
      await SneakSpeedService.applySneakStartEffect(actor);
    } catch (e) {
      console.debug('PF2E Visioner | applySneakWalkSpeed noop failed (continuing):', e);
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
      if (existingEffectId) return;

      const current = Number(actor.system?.attributes?.speed?.value ?? 0);
      if (!Number.isFinite(current) || current <= 0) return;

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
            flags: { [MODULE_ID]: { sneakSpeedEffect: true } },
          };
          const created = await actor.createEmbeddedDocuments('Item', [effectData]);
          const effect = Array.isArray(created) ? created[0] : null;
          if (effect?.id) {
            await actor.setFlag(MODULE_ID, EFFECT_ID_FLAG, effect.id);
            return; // Done via effect
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
        console.debug('PF2E Visioner | Failed removing sneak speed effect (continuing):', e);
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
    const baseSpeed = Number(original ?? actor.system?.attributes?.speed?.value ?? 0) || 0;
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
