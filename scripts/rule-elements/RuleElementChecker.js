/**
 * Centralized rule element checker for AVS integration
 * Handles all rule element operations that need dynamic updates
 */
export class RuleElementChecker {
  /**
   * Check all rule element effects for a token pair
   * @param {Token} observerToken - The observing token
   * @param {Token} targetToken - The target token
   * @returns {Object|null} Combined result with highest priority effect
   */
  static checkRuleElements(observerToken, targetToken) {
    if (!observerToken || !targetToken) return null;

    const results = [];

    // Check distance-based visibility
    const distanceResult = this.checkDistanceBasedVisibility(observerToken, targetToken);
    if (distanceResult) {
      results.push(distanceResult);
    }

    // Check rule element overrides
    const overrideResult = this.checkRuleElementOverride(observerToken, targetToken);
    if (overrideResult) {
      results.push(overrideResult);
    }

    // Check conditional states
    const conditionalResult = this.checkConditionalState(observerToken, targetToken);
    if (conditionalResult) {
      results.push(conditionalResult);
    }

    // Return the highest priority result
    if (results.length === 0) return null;

    // Priority resolution: higher priority wins
    const winner = results.reduce((highest, current) =>
      (current.priority || 100) > (highest.priority || 100) ? current : highest,
    );

    return winner;
  }

  /**
   * Get all active rule element effects for a token pair (for debugging/inspection)
   * @param {Token} observerToken - The observing token
   * @param {Token} targetToken - The target token
   * @returns {Array} All active effects sorted by priority (highest first)
   */
  static getAllRuleElements(observerToken, targetToken) {
    if (!observerToken || !targetToken) return [];

    const results = [];

    const distanceResult = this.checkDistanceBasedVisibility(observerToken, targetToken);
    if (distanceResult) results.push(distanceResult);

    const overrideResult = this.checkRuleElementOverride(observerToken, targetToken);
    if (overrideResult) results.push(overrideResult);

    const conditionalResult = this.checkConditionalState(observerToken, targetToken);
    if (conditionalResult) results.push(conditionalResult);

    // Sort by priority (highest first)
    return results.sort((a, b) => (b.priority || 100) - (a.priority || 100));
  }

  /**
   * Check distance-based visibility effects
   */
  static checkDistanceBasedVisibility(observerToken, targetToken) {
    try {
      const observerConfig = observerToken.document?.getFlag(
        'pf2e-visioner',
        'distanceBasedVisibility',
      );
      const targetConfig = targetToken.document?.getFlag(
        'pf2e-visioner',
        'distanceBasedVisibility',
      );

      if (!observerConfig?.active && !targetConfig?.active) {
        return null;
      }

      const distance = observerToken.distanceTo(targetToken);

      if (observerConfig?.active) {
        const config = observerConfig;
        if (config.direction === 'to') {
          const applicableBand = this.getApplicableDistanceBand(distance, config.distanceBands);
          if (applicableBand) {
            return {
              state: applicableBand.state,
              source: config.source,
              priority: config.priority || 100,
              distance,
              type: 'distanceBasedVisibility',
            };
          }
        }
      }

      if (targetConfig?.active) {
        const config = targetConfig;
        if (config.direction === 'from') {
          const applicableBand = this.getApplicableDistanceBand(distance, config.distanceBands);
          if (applicableBand) {
            return {
              state: applicableBand.state,
              source: config.source,
              priority: config.priority || 100,
              distance,
              type: 'distanceBasedVisibility',
            };
          }
        }
      }

      return null;
    } catch (error) {
      console.warn('PF2E Visioner | Error checking distance-based visibility:', error);
      return null;
    }
  }

  /**
   * Check rule element override effects
   */
  static checkRuleElementOverride(observerToken, targetToken) {
    try {
      const observerConfig = observerToken.document?.getFlag(
        'pf2e-visioner',
        'ruleElementOverride',
      );
      const targetConfig = targetToken.document?.getFlag('pf2e-visioner', 'ruleElementOverride');

      if (!observerConfig?.active && !targetConfig?.active) {
        return null;
      }

      // Check observer's override (direction: 'to')
      if (observerConfig?.active) {
        return {
          state: observerConfig.state,
          source: observerConfig.source,
          priority: observerConfig.priority || 100,
          type: 'ruleElementOverride',
        };
      }

      // Check target's override (direction: 'from')
      if (targetConfig?.active) {
        return {
          state: targetConfig.state,
          source: targetConfig.source,
          priority: targetConfig.priority || 100,
          type: 'ruleElementOverride',
        };
      }

      return null;
    } catch (error) {
      console.warn('PF2E Visioner | Error checking rule element override:', error);
      return null;
    }
  }

  /**
   * Check conditional state effects
   */
  static checkConditionalState(observerToken, targetToken) {
    try {
      const observerConfig = observerToken.document?.getFlag('pf2e-visioner', 'conditionalState');
      const targetConfig = targetToken.document?.getFlag('pf2e-visioner', 'conditionalState');

      if (!observerConfig?.active && !targetConfig?.active) {
        return null;
      }

      // Check observer's conditional state (direction: 'to')
      if (observerConfig?.active) {
        const conditionMet = this.evaluateCondition(observerToken.actor, observerConfig.condition);
        const targetState = conditionMet ? observerConfig.thenState : observerConfig.elseState;

        return {
          state: targetState,
          source: observerConfig.source,
          priority: observerConfig.priority || 100,
          type: 'conditionalState',
          conditionMet,
        };
      }

      // Check target's conditional state (direction: 'from')
      if (targetConfig?.active) {
        const conditionMet = this.evaluateCondition(targetToken.actor, targetConfig.condition);
        const targetState = conditionMet ? targetConfig.thenState : targetConfig.elseState;

        return {
          state: targetState,
          source: targetConfig.source,
          priority: targetConfig.priority || 100,
          type: 'conditionalState',
          conditionMet,
        };
      }

      return null;
    } catch (error) {
      console.warn('PF2E Visioner | Error checking conditional state:', error);
      return null;
    }
  }

  /**
   * Get applicable distance band for a given distance
   */
  static getApplicableDistanceBand(distance, distanceBands) {
    if (!distanceBands || !Array.isArray(distanceBands)) return null;

    const result = distanceBands.find((band) => {
      const minDistance = band.minDistance || 0;
      const maxDistance = band.maxDistance || Infinity;
      return distance >= minDistance && distance < maxDistance;
    });

    return result || null;
  }

  /**
   * Evaluate condition for conditional state effects
   */
  static evaluateCondition(actor, condition) {
    if (!actor || !condition) return false;

    const conditions = actor.itemTypes?.condition || [];

    switch (condition) {
      case 'invisible':
        return conditions.some((c) => c.slug === 'invisible');
      case 'concealed':
        return conditions.some((c) => c.slug === 'concealed');
      case 'hidden':
        return conditions.some((c) => c.slug === 'hidden');
      case 'undetected':
        return conditions.some((c) => c.slug === 'undetected');
      default:
        return false;
    }
  }
}
