/**
 * CoverStateManager.js
 * Manages token cover state flags, separating auto-cover from manual cover
 */

import { MODULE_ID } from '../../constants.js';
import { getCoverBonusByState } from '../../helpers/cover-helpers.js';
import { ruleElementService } from '../../services/RuleElementService.js';

export class CoverStateManager {
  /**
   * Flag scope for auto-cover
   * @type {string}
   * @readonly
   */
  static FLAG_SCOPE = MODULE_ID;

  /**
   * Flag key for auto-cover map
   * @type {string}
   * @readonly
   */
  static FLAG_KEY = 'autoCoverMap';

  /**
   * Gets the current auto-cover state between source and target tokens
   * @param {Object} source - The source token (attacker)
   * @param {Object} target - The target token
   * @returns {string} The cover state ('none', 'lesser', 'standard', 'greater')
   */
  getCoverBetween(source, target) {
    if (!source?.document || !target?.document) return 'none';

    try {
      // Get the cover map from the source token
      const coverMap =
        source.document.getFlag(CoverStateManager.FLAG_SCOPE, CoverStateManager.FLAG_KEY) || {};

      // Ensure coverMap is an object
      if (typeof coverMap !== 'object' || coverMap === null) {
        return 'none';
      }

      // Return the state for this specific target, or 'none' if not set
      return coverMap[target.document.id] || 'none';
    } catch (error) {
      console.warn('PF2E Visioner | Error getting cover state:', error);
      return 'none';
    }
  }

  /**
   * Sets the auto-cover state between source and target tokens
   * @param {Object} source - The source token (attacker)
   * @param {Object} target - The target token
   * @param {string} state - The cover state to set
   * @returns {Promise}
   */
  async setCoverBetween(source, target, state, options = {}) {
    if (!source?.document || !target?.document) return;

    let modifiedState = ruleElementService.applyCoverModifiers(source, target, state);

    // Get current cover map for source
    const coverMap =
      source.document.getFlag(CoverStateManager.FLAG_SCOPE, CoverStateManager.FLAG_KEY) || {};

    // Get current state for this target
    const currentState = coverMap[target.document.id] || 'none';

    // If no change needed, skip the update
    if (currentState === modifiedState) return;

    state = modifiedState;

    // Create updated map
    const updatedMap = { ...coverMap };

    // If state is 'none', remove this target entry
    if (state === 'none') {
      delete updatedMap[target.document.id];
    } else {
      // Otherwise set the new state
      updatedMap[target.document.id] = state;
    }

    // Update the flag with the new map
    if (Object.keys(updatedMap).length === 0) {
      // If map is empty, remove the flag entirely
      await source.document.unsetFlag(CoverStateManager.FLAG_SCOPE, CoverStateManager.FLAG_KEY);
    } else {
      // Otherwise update with the new map
      await source.document.setFlag(
        CoverStateManager.FLAG_SCOPE,
        CoverStateManager.FLAG_KEY,
        updatedMap,
      );
    }

    // Apply ephemeral effects if needed
    if (!options.skipEphemeralUpdate) {
      await this._updateEphemeralEffects(source, target, state);
    }
  }

  /**
   * Legacy method - gets current auto-cover state for a token (not recommended)
   * @param {Object} token - The token to check
   * @returns {string} The cover state ('none', 'lesser', 'standard', 'greater')
   * @deprecated Use getCoverBetween instead
   */
  getCoverState(token) {
    console.warn('PF2E Visioner | getCoverState is deprecated, use getCoverBetween instead');
    if (!token?.document) return 'none';

    // For backward compatibility, check for the old flag structure
    const oldState = token.document.getFlag(CoverStateManager.FLAG_SCOPE, 'autoCoverState');
    if (oldState) return oldState;

    return 'none';
  }

  /**
   * Removes all auto-cover flags from a token
   * @param {Object} token - The token to clean
   * @returns {Promise}
   */
  async clearCover(token) {
    if (!token?.document) return;
    await token.document.unsetFlag(CoverStateManager.FLAG_SCOPE, CoverStateManager.FLAG_KEY);
    // Remove any ephemeral effects
    try {
      const actor = token.actor;
      if (actor && actor.rules) {
        const rulesToRemove = actor.rules.filter(
          (rule) => rule.key === 'AutoCoverBonus' && rule.predicate?.all?.includes('auto-cover'),
        );

        for (const rule of rulesToRemove) {
          await actor.deleteEmbeddedDocuments('Rule', [rule.id]);
        }
      }
    } catch (error) {
      console.error('PF2E Visioner | Error removing ephemeral effects:', error);
    }
  }

  /**
   * Updates ephemeral effects for a target based on cover state
   * @param {Object} attacker - The attacker token
   * @param {Object} target - The target token
   * @param {string} state - The cover state
   * @returns {Promise}
   * @private
   */
  async _updateEphemeralEffects(attacker, target, state) {
    try {
      const actor = target.actor;
      if (!actor) return;

      // Check if effect already exists for this attacker
      const existingEffect = actor.itemTypes.effect.find(
        (e) =>
          e.flags?.[MODULE_ID]?.isEphemeralCover &&
          e.flags?.[MODULE_ID]?.observerActorSignature === attacker.actor.signature,
      );

      // Remove existing effect if found
      if (existingEffect) {
        await actor.deleteEmbeddedDocuments('Item', [existingEffect.id]);
      }

      // If no cover or removing cover, just return after cleaning up
      if (state === 'none') return;

      // Get the bonus for the current cover state
      const bonus = getCoverBonusByState(state);
      if (bonus <= 0) return;

      // Pick a representative image per cover level
      const coverEffectImageByState = {
        lesser: 'systems/pf2e/icons/equipment/shields/buckler.webp',
        standard: 'systems/pf2e/icons/equipment/shields/steel-shield.webp',
        greater: 'systems/pf2e/icons/equipment/shields/tower-shield.webp',
      };

      const effectImg =
        coverEffectImageByState[state] || 'systems/pf2e/icons/equipment/shields/steel-shield.webp';

      // Create a new effect item
      const ephemeralEffect = {
        name: `Cover against ${attacker.name}`,
        type: 'effect',
        system: {
          description: {
            value: `<p>You have ${state} cover against ${attacker.name}, granting a +${bonus} circumstance bonus to AC.</p>`,
            gm: '',
          },
          rules: [
            {
              key: 'RollOption',
              domain: 'all',
              option: `cover-against:${attacker.id}`,
            },
            {
              key: 'FlatModifier',
              selector: 'ac',
              type: 'circumstance',
              value: bonus,
              predicate: [
                `origin:signature:${attacker.actor.signature || attacker.actor.id}`,
                `cover-against:${attacker.id}`,
              ],
            },
          ],
          slug: null,
          traits: {
            otherTags: [],
            value: [],
          },
          level: {
            value: 1,
          },
          duration: {
            value: -1,
            unit: 'unlimited',
            expiry: null,
            sustained: false,
          },
          tokenIcon: {
            show: false,
          },
          unidentified: true,
          start: {
            value: 0,
            initiative: null,
          },
          badge: null,
        },
        img: effectImg,
        flags: {
          [MODULE_ID]: {
            isEphemeralCover: true,
            observerActorSignature: attacker.actor.signature,
            observerTokenId: attacker.id,
            coverState: state,
          },
        },
      };

      // Add reflex and stealth bonuses for standard and greater cover
      if (state === 'standard' || state === 'greater') {
        const reflexBonus = state === 'standard' ? 2 : 4;
        const stealthBonus = state === 'standard' ? 2 : 4;

        ephemeralEffect.system.rules.push(
          {
            key: 'FlatModifier',
            selector: 'reflex',
            type: 'circumstance',
            value: reflexBonus,
            predicate: ['area-effect'],
          },
          {
            key: 'FlatModifier',
            predicate: ['action:hide', 'action:sneak', 'avoid-detection'],
            selector: 'stealth',
            type: 'circumstance',
            value: stealthBonus,
          },
        );
      }

      // Create the effect on the actor
      await actor.createEmbeddedDocuments('Item', [ephemeralEffect]);
    } catch (error) {
      console.error('PF2E Visioner | Error updating ephemeral effects:', error);
    }
  }
}

const coverStateManager = new CoverStateManager();
export default coverStateManager;
