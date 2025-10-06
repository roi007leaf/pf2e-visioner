/**
 * Handles all condition-related logic for the auto-visibility system
 * Manages PF2E condition rules (invisible, blinded, dazzled), flag tracking, and state transitions
 * SINGLETON PATTERN
 */

import { VisionAnalyzer } from './VisionAnalyzer.js';

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
   * Check if an observer is deafened (cannot hear anything)
   * @param {Token} observer
   * @returns {boolean}
   */
  isDeafened(observer) {
    // Check if observer has deafened condition - try multiple methods
    const hasConditionMethod = observer.actor?.hasCondition?.('deafened');
    const systemConditionActive = observer.actor?.system?.conditions?.deafened?.active;
    const conditionsHas = observer.actor?.conditions?.has?.('deafened');

    // Also check for the 'deafened' condition in the conditions collection
    let conditionsCollectionHas = false;
    if (observer.actor?.conditions) {
      try {
        conditionsCollectionHas = observer.actor.conditions.some(
          (condition) => condition.slug === 'deafened' || condition.key === 'deafened',
        );
      } catch (e) {
        // Ignore errors in condition checking
      }
    }

    const isDeafened =
      hasConditionMethod || systemConditionActive || conditionsHas || conditionsCollectionHas;

    return isDeafened;
  }

  /**
   * Check if target is invisible to observer (magical invisibility, etc.)
   * Based on PF2E rules: "A creature with the invisible condition is automatically
   * undetected to any creatures relying on sight as their only precise sense.
   * Precise senses other than sight ignore the invisible condition"
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

    if (!hasInvisible) {
      return false;
    }

    // Target has invisible condition - check if observer can overcome it

    // Check if observer has precise non-visual senses that can detect the target
    // PF2E Rule: "Precise senses other than sight ignore the invisible condition"
    // This includes see-invisibility, echolocation, tremorsense, etc.
    try {
      // Get VisionAnalyzer instance to check for precise non-visual senses
      const visionAnalyzer = VisionAnalyzer.getInstance();
      if (visionAnalyzer && visionAnalyzer.hasPreciseNonVisualInRange) {
        const hasPreciseNonVisual = visionAnalyzer.hasPreciseNonVisualInRange(observer, target);
        if (hasPreciseNonVisual) {
          return false; // Precise non-visual sense ignores invisibility
        }
      }
    } catch (e) {
      // If we can't check precise non-visual senses, fall back to treating as invisible
    }

    // Target is invisible and observer has no way to overcome it
    return true;
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

    // PF2E Invisibility Rules with proper state transitions:
    // 1. observed/concealed → hidden
    // 2. hidden → undetected
    // 3. undetected → undetected (no change)
    // 4. Special case: if observer can see normally in current conditions → hidden (minimum)
    // 5. Sneak can upgrade any state to undetected

    // Check if there's a flag indicating the previous visibility state
    const invisibilityFlags = target.document.flags?.['pf2e-visioner']?.invisibility || {};
    const observerFlags = invisibilityFlags[observerId] || {};
    const wasVisibleWhenInvisible = observerFlags.wasVisible;
    const previousState = observerFlags.previousState;

    // Check if they've successfully used Sneak to become undetected (overrides everything)
    if (await hasSneakOverride(observer, target)) {
      return 'undetected';
    }

    // If observer can see normally in current conditions, invisible = hidden (minimum)
    if (canSeeNormally) {
      return 'hidden';
    }

    // Apply PF2E invisible condition state transitions based on previous state
    if (previousState) {
      switch (previousState) {
        case 'observed':
        case 'concealed':
          return 'hidden';
        case 'hidden':
          return 'undetected';
        case 'undetected':
        default:
          return 'undetected';
      }
    }

    // Fallback: use the old wasVisible logic for backward compatibility
    if (wasVisibleWhenInvisible) {
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

      // Debug: Show all condition detection methods

      if (hasInvisibility) {
        // Invisibility was added - record current visibility states and clear established states
        await this.#recordVisibilityBeforeInvisibility(token);
      } else {
        // Invisibility was removed - clear established states to allow normal visibility calculation
        await this.clearEstablishedInvisibleStates(token);

        // Also clear all invisibility flags since condition is completely removed
        await this.#clearInvisibilityFlags(token);
      }

      // Trigger perception refresh to immediately apply visibility changes
      try {
        await this.#triggerPerceptionRefresh(token);
      } catch (error) {
        console.error(
          `🔍 INVISIBLE CONDITION CHANGE: Perception refresh failed for ${token.name}:`,
          error,
        );
      }
    }
  }

  /**
   * Record current visibility states before invisibility is applied
   * @param {Token} token
   */
  async #recordVisibilityBeforeInvisibility(token) {
    // Get visibility map with proper error handling
    let visibilityMap = {};
    try {
      const api = game.modules.get('pf2e-visioner')?.api;
      if (api && api.getVisibilityMap) {
        visibilityMap = api.getVisibilityMap(token);
      } else {
        console.warn('PF2E Visioner | API not available, using fallback visibility map');
        // Fallback: use the store directly
        const { getVisibilityBetween } = await import('../../stores/visibility-map.js');
        // Build visibility map manually
        for (const otherToken of canvas.tokens.placeables) {
          if (otherToken === token || !otherToken.actor) continue;
          const observerId = otherToken.document.id;
          visibilityMap[observerId] = getVisibilityBetween(otherToken, token);
        }
      }
    } catch (error) {
      console.error('PF2E Visioner | Failed to get visibility map:', error);
      visibilityMap = {};
    }

    const invisibilityFlags = {};

    // Check visibility from all other tokens to this token
    for (const otherToken of canvas.tokens.placeables) {
      if (otherToken === token || !otherToken.actor) continue;

      const observerId = otherToken.document.id;
      const currentVisibility = visibilityMap[observerId] || 'observed';

      // Record the current visibility state for all observers
      // This allows us to apply proper PF2E invisible condition transitions:
      // observed/concealed → hidden, hidden → undetected, undetected → undetected
      invisibilityFlags[observerId] = {
        wasVisible: currentVisibility === 'observed' || currentVisibility === 'concealed',
        previousState: currentVisibility,
        // Clear any previously established states when invisibility is reapplied
        establishedState: null,
        establishedAt: null,
      };
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
   * Clear established invisible states when creature takes action (like moving)
   * This allows the invisible creature to be re-detected through sound/movement
   * @param {Token} token - The invisible token that took action
   */
  async clearEstablishedInvisibleStates(token) {
    try {
      const invisibilityFlags = token.document.flags?.['pf2e-visioner']?.invisibility || {};
      const updatedFlags = {};

      // Keep the original visibility data but clear established states
      for (const [observerId, flags] of Object.entries(invisibilityFlags)) {
        updatedFlags[observerId] = {
          ...flags,
          establishedState: null,
          establishedAt: null,
        };
      }

      if (Object.keys(updatedFlags).length > 0) {
        await token.document.setFlag('pf2e-visioner', 'invisibility', updatedFlags);
      }
    } catch (error) {
      console.error('Failed to clear established invisible states:', error);
    }
  }

  /**
   * Handle special case: invisible token being un-Foundry-hidden
   * Vision-based observers should start from undetected, non-vision observers from their normal state
   */
  async handleFoundryUnhideInvisible(token) {
    try {
      // Import VisionAnalyzer to check observer capabilities
      const { VisionAnalyzer } = await import('./VisionAnalyzer.js');
      const visionAnalyzer = new VisionAnalyzer();

      // First, clear any existing established states to ensure fresh calculation
      await this.clearEstablishedInvisibleStates(token);

      const invisibilityFlags = {};

      // Check visibility from all other tokens to this token
      for (const otherToken of canvas.tokens.placeables) {
        if (otherToken === token || !otherToken.actor) continue;

        const observerId = otherToken.document.id;

        // Check if observer has non-visual senses that could detect the token even when Foundry-hidden
        const hasNonVisualSenses =
          visionAnalyzer.hasPreciseNonVisualInRange(otherToken, token) ||
          visionAnalyzer.canDetectViaTremor(otherToken, token);

        if (hasNonVisualSenses) {
          // Non-visual observers: Use normal invisible condition logic (hidden state)
          invisibilityFlags[observerId] = {
            wasVisible: false, // They couldn't see it visually when Foundry-hidden
            previousState: 'hidden', // Non-visual detection gives hidden
            establishedState: null,
            establishedAt: null,
          };
        } else {
          // Vision-based observers: They couldn't detect it at all when Foundry-hidden → undetected
          invisibilityFlags[observerId] = {
            wasVisible: false, // They couldn't see it when Foundry-hidden
            previousState: 'undetected', // Complete lack of detection
            establishedState: 'undetected', // Establish undetected state immediately
            establishedAt: Date.now(),
          };
        }
      }

      // Set the flags on the token
      if (Object.keys(invisibilityFlags).length > 0) {
        await token.document.setFlag('pf2e-visioner', 'invisibility', invisibilityFlags);
      }

      // Trigger perception refresh
      await this.#triggerPerceptionRefresh(token);
    } catch (error) {
      console.error('Failed to handle Foundry unhide for invisible token:', error);
    }
  }

  /**
   * Manually set invisibility flags for testing purposes
   * @param {Token} token
   * @param {Object} flags - Invisibility flags to set
   */
  async setInvisibilityFlags(token, flags) {
    await token.document.setFlag('pf2e-visioner', 'invisibility', flags);
  }

  /**
   * Trigger perception refresh to immediately apply visibility changes
   * @param {Token} token
   */
  async #triggerPerceptionRefresh(token) {
    try {
      // Try multiple approaches to trigger perception refresh

      // Approach 1: Use the module's API if available
      const api = game.modules.get('pf2e-visioner')?.api;
      if (api?.refreshPerception) {
        await api.refreshPerception();
        return;
      }

      // Approach 2: Direct canvas perception update
      if (canvas?.perception?.update) {
        await canvas.perception.update({
          refreshVision: true,
          refreshLighting: false,
          refreshTiles: false,
        });
        return;
      }

      // Approach 3: Token-specific vision refresh
      if (token?.updateVisionSource) {
        token.updateVisionSource();
        return;
      }
    } catch (error) {
      console.error('Failed to trigger perception refresh:', error);

      // Final fallback: Force a scene update
      try {
        if (canvas?.scene) {
          canvas.scene.update({}, { diff: false, render: true });
        }
      } catch (fallbackError) {
        console.warn('All perception refresh methods failed:', fallbackError);
      }
    }
  }
}
