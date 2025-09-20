/**
 * Handles all condition-related logic for the auto-visibility system
 * Manages PF2E condition rules (invisible, blinded, dazzled), flag tracking, and state transitions
 * SINGLETON PATTERN
 */

export class ConditionManager {
  /** @type {ConditionManager} */
  static #instance = null;

  constructor() {
    if (ConditionManager.#instance) {
      return ConditionManager.#instance;
    }

    // No initialization needed for now
    ConditionManager.#instance = this;
  }

  /**
   * Get the singleton instance
   * @returns {ConditionManager}
   */
  static getInstance() {
    if (!ConditionManager.#instance) {
      ConditionManager.#instance = new ConditionManager();
    }
    return ConditionManager.#instance;
  }

  /**
   * Check if an observer is blinded and cannot see anything
   * @param {Token} observer
   * @returns {boolean}
   */
  isBlinded(observer) {
    // Check if observer has blinded condition - try multiple methods
    const hasConditionMethod = observer.actor?.hasCondition?.('blinded');
    const systemConditionActive = observer.actor?.system?.conditions?.blinded?.active;
    const conditionsHas = observer.actor?.conditions?.has?.('blinded');

    // Also check for the 'blinded' condition in the conditions collection
    let conditionsCollectionHas = false;
    if (observer.actor?.conditions) {
      try {
        conditionsCollectionHas = observer.actor.conditions.some(
          (condition) => condition.slug === 'blinded' || condition.key === 'blinded',
        );
      } catch (e) {
        // Ignore errors in condition checking
      }
    }

    const isBlinded =
      hasConditionMethod || systemConditionActive || conditionsHas || conditionsCollectionHas;

    return isBlinded;
  }

  /**
   * Check if an observer is dazzled (everything appears concealed)
   * @param {Token} observer
   * @returns {boolean}
   */
  isDazzled(observer) {
    // Check if observer has dazzled condition - try multiple methods
    const hasConditionMethod = observer.actor?.hasCondition?.('dazzled');
    const systemConditionActive = observer.actor?.system?.conditions?.dazzled?.active;
    const conditionsHas = observer.actor?.conditions?.has?.('dazzled');

    // Also check for the 'dazzled' condition in the conditions collection
    let conditionsCollectionHas = false;
    if (observer.actor?.conditions) {
      try {
        conditionsCollectionHas = observer.actor.conditions.some(
          (condition) => condition.slug === 'dazzled' || condition.key === 'dazzled',
        );
      } catch (e) {
        // Ignore errors in condition checking
      }
    }

    const isDazzled =
      hasConditionMethod || systemConditionActive || conditionsHas || conditionsCollectionHas;

    return isDazzled;
  }

  /**
   * Check if target is invisible to observer (magical invisibility, etc.)
   * @param {Token} observer
   * @param {Token} target
   * @returns {boolean}
   */
  isInvisibleTo(observer, target) {
    // Check if target has invisibility condition - try multiple methods
    const hasConditionMethod = target.actor?.hasCondition?.('invisible');
    const systemConditionActive = target.actor?.system?.conditions?.invisible?.active;
    const conditionsHas = target.actor?.conditions?.has?.('invisible');

    // Also check for the 'invisible' condition in the conditions collection
    let conditionsCollectionHas = false;
    if (target.actor?.conditions) {
      try {
        conditionsCollectionHas = target.actor.conditions.some(
          (condition) => condition.slug === 'invisible' || condition.key === 'invisible',
        );
      } catch (e) {
        // Ignore errors in condition checking
      }
    }

    const hasInvisible =
      hasConditionMethod || systemConditionActive || conditionsHas || conditionsCollectionHas;

    if (hasInvisible) {
      // Check if observer can see invisibility
      const canSeeInvisible =
        observer.actor?.perception?.senses?.has?.('see-invisibility') ||
        observer.actor?.system?.perception?.senses?.['see-invisibility'];

      return !canSeeInvisible;
    }
    return false;
  }

  /**
   * Determine the visibility state for an invisible target based on PF2E rules
   * @param {Token} observer
   * @param {Token} target
   * @param {Function} hasSneakOverride - Function to check for Sneak overrides
   * @returns {Promise<string>} Visibility state ('hidden' or 'undetected')
   */
  async getInvisibilityState(observer, target, hasSneakOverride, canSeeNormally = false) {
    const observerId = observer?.document?.id;
    const targetId = target?.document?.id;

    if (!observerId || !targetId) return 'undetected';

    // PF2E Invisibility Rules:
    // 1. If you can see normally (darkvision in darkness, etc.) → invisible = 'hidden'
    // 2. If you can't see normally → invisible = 'undetected'
    // 3. If you become invisible while observed → start as 'hidden'
    // 4. You remain 'hidden' until you successfully Sneak → then become 'undetected'
    // 5. You can only become 'observed' while invisible via special abilities/magic

    // Check if there's a flag indicating this creature became invisible while visible
    // This should be set when the invisibility condition is applied
    const invisibilityFlags = target.document.flags?.['pf2e-visioner']?.invisibility || {};
    const wasVisibleWhenInvisible = invisibilityFlags[observerId]?.wasVisible;

    // If observer can see normally in current conditions, invisible = hidden
    if (canSeeNormally) {
      // Check if they've successfully used Sneak to become undetected
      if (await hasSneakOverride(observer, target)) {
        return 'undetected';
      }
      return 'hidden';
    }

    if (wasVisibleWhenInvisible) {
      // They became invisible while visible to this observer → start as 'hidden'
      // Check if they've successfully used Sneak to become undetected
      if (await hasSneakOverride(observer, target)) {
        return 'undetected';
      }
      return 'hidden';
    }

    // Default: invisible creatures are undetected (can't see normally)
    return 'undetected';
  }

  /**
   * Handle invisibility condition changes to set proper flags
   * @param {Actor} actor
   */
  async handleInvisibilityChange(actor) {
    // Find the actor's token(s) on the current scene
    const tokens = canvas.tokens.placeables.filter((token) => token.actor?.id === actor.id);

    for (const token of tokens) {
      // Check if invisibility was added (try multiple methods)
      const hasInvisibility =
        actor.hasCondition?.('invisible') ||
        actor.system?.conditions?.invisible?.active ||
        actor.conditions?.has?.('invisible');

      if (hasInvisibility) {
        // Invisibility was added - record current visibility states
        await this.#recordVisibilityBeforeInvisibility(token);
      } else {
        // Invisibility was removed - clear the flags
        await this.#clearInvisibilityFlags(token);
      }
    }
  }

  /**
   * Record current visibility states before invisibility is applied
   * @param {Token} token
   */
  async #recordVisibilityBeforeInvisibility(token) {
    const { getVisibilityMap } = game.modules.get('pf2e-visioner').api;
    const visibilityMap = getVisibilityMap(token);

    const invisibilityFlags = {};

    // Check visibility from all other tokens to this token
    for (const otherToken of canvas.tokens.placeables) {
      if (otherToken === token || !otherToken.actor) continue;

      const observerId = otherToken.document.id;
      const currentVisibility = visibilityMap[observerId] || 'observed';

      // If currently observed or concealed, mark as "was visible"
      if (currentVisibility === 'observed' || currentVisibility === 'concealed') {
        invisibilityFlags[observerId] = { wasVisible: true };
      }
    }

    // Set the flags on the token
    if (Object.keys(invisibilityFlags).length > 0) {
      await token.document.setFlag('pf2e-visioner', 'invisibility', invisibilityFlags);
    }
  }

  /**
   * Clear invisibility flags when invisibility is removed
   * @param {Token} token
   */
  async #clearInvisibilityFlags(token) {
    await token.document.unsetFlag('pf2e-visioner', 'invisibility');
  }

  /**
   * Clear all invisibility flags for a token (utility method)
   * @param {Token} token
   */
  async clearInvisibilityFlags(token) {
    await this.#clearInvisibilityFlags(token);
  }

  /**
   * Manually set invisibility flags for testing purposes
   * @param {Token} token
   * @param {Object} flags - Invisibility flags to set
   */
  async setInvisibilityFlags(token, flags) {
    await token.document.setFlag('pf2e-visioner', 'invisibility', flags);
  }
}
