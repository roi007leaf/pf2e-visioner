import { PredicateHelper } from './PredicateHelper.js';

export class RuleElementChecker {
  /**
   * Check all rule element effects for a token pair
   * @param {Token} observerToken - The observing token
   * @param {Token} targetToken - The target token
   * @param {string} currentVisibility - The current visibility state (optional, for replacements)
   * @returns {Object|null} Combined result with highest priority effect
   */
  static checkRuleElements(observerToken, targetToken, currentVisibility = null) {
    if (!observerToken || !targetToken) return null;

    const results = [];

    // Check distance-based visibility
    const distanceResult = this.checkDistanceBasedVisibility(observerToken, targetToken);
    if (distanceResult) {
      results.push(distanceResult);
    }

    // Check rule element overrides
    const overrideResult = this.checkRuleElementOverride(observerToken, targetToken, currentVisibility);
    if (overrideResult) {
      results.push(overrideResult);
    }

    // Check visibility replacements (fromStates → toState)
    if (currentVisibility) {
      const replacementResult = this.checkVisibilityReplacement(
        observerToken,
        targetToken,
        currentVisibility,
      );
      if (replacementResult) {
        results.push(replacementResult);
      }
    }

    // Check conditional states
    const conditionalResult = this.checkConditionalState(observerToken, targetToken);
    if (conditionalResult) {
      results.push(conditionalResult);
    }

    // Return the highest priority result
    if (results.length === 0) return null;

    // Priority resolution with type-based precedence
    // visibilityReplacement > ruleElementOverride > conditionalState > distanceBasedVisibility
    const typePriority = {
      visibilityReplacement: 1000,
      ruleElementOverride: 500,
      conditionalState: 250,
      distanceBasedVisibility: 100,
    };


    const winner = results.reduce((highest, current) => {
      const currentTypePri = typePriority[current.type] || 0;
      const highestTypePri = typePriority[highest.type] || 0;

      if (currentTypePri !== highestTypePri) {
        return currentTypePri > highestTypePri ? current : highest;
      }

      // If same type priority, use numeric priority
      return (current.priority || 100) > (highest.priority || 100) ? current : highest;
    });

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
          if (config.predicate && config.predicate.length > 0) {
            const observerOptions = PredicateHelper.getTokenRollOptions(observerToken);
            const targetOptions = PredicateHelper.getTargetRollOptions(targetToken, observerToken);
            const combinedOptions = PredicateHelper.combineRollOptions(observerOptions, targetOptions);

            if (!PredicateHelper.evaluate(config.predicate, combinedOptions)) {
              return null;
            }
          }

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
          if (config.predicate && config.predicate.length > 0) {
            const targetOptions = PredicateHelper.getTokenRollOptions(targetToken);
            const observerOptions = PredicateHelper.getTargetRollOptions(observerToken, targetToken);
            const combinedOptions = PredicateHelper.combineRollOptions(targetOptions, observerOptions);

            if (!PredicateHelper.evaluate(config.predicate, combinedOptions)) {
              return null;
            }
          }

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
  static checkRuleElementOverride(observerToken, targetToken, currentVisibility = null) {
    try {
      const observerConfig = observerToken.document?.getFlag(
        'pf2e-visioner',
        'ruleElementOverride',
      );
      const targetConfig = targetToken.document?.getFlag('pf2e-visioner', 'ruleElementOverride');

      if (!observerConfig?.active && !targetConfig?.active) {
        return null;
      }

      if (observerConfig?.active) {
        const direction = observerConfig.direction || 'to';
        if (direction === 'to') {
          return {
            state: observerConfig.state,
            source: observerConfig.source,
            priority: observerConfig.priority || 100,
            type: 'ruleElementOverride',
          };
        }
      }

      if (targetConfig?.active) {
        const direction = targetConfig.direction || 'from';
        if (direction === 'from') {
          return {
            state: targetConfig.state,
            source: targetConfig.source,
            priority: targetConfig.priority || 100,
            type: 'ruleElementOverride',
          };
        }
      }

      return null;
    } catch (error) {
      console.warn('PF2E Visioner | Error checking rule element override:', error);
      return null;
    }
  }

  /**
   * Check visibility state replacements (fromStates → toState)
   * @param {Token} observerToken - The observing token
   * @param {Token} targetToken - The target token
   * @param {string} currentVisibility - The current visibility state to check
   * @returns {Object|null} Replacement result if condition matches
   */
  static checkVisibilityReplacement(observerToken, targetToken, currentVisibility) {
    try {
      const observerConfig = observerToken.document?.getFlag(
        'pf2e-visioner',
        'visibilityReplacement',
      );
      const targetConfig = targetToken.document?.getFlag('pf2e-visioner', 'visibilityReplacement');


      if (!observerConfig?.active && !targetConfig?.active) {
        return null;
      }

      // Check observer's visibility replacement (direction: 'to')
      // The observer with direction='to' affects how they see the target
      if (observerConfig?.active) {
        const direction = observerConfig.direction || 'from';
        if (direction === 'to' && observerConfig.fromStates?.includes(currentVisibility)) {
          return {
            state: observerConfig.toState,
            source: observerConfig.source,
            priority: observerConfig.priority || 100,
            type: 'visibilityReplacement',
          };
        }
      }

      // Check target's visibility replacement (direction: 'from')
      // The target with direction='from' affects how others see them
      if (targetConfig?.active) {
        const direction = targetConfig.direction || 'from';
        if (direction === 'from' && targetConfig.fromStates?.includes(currentVisibility)) {

          return {
            state: targetConfig.toState,
            source: targetConfig.source,
            priority: targetConfig.priority || 100,
            type: 'visibilityReplacement',
          };
        }
      }

      return null;
    } catch (error) {
      console.warn('PF2E Visioner | Error checking visibility replacement:', error);
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
