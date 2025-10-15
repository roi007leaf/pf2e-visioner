/**
 * Helper class for evaluating PF2e predicates using the built-in system
 * 
 * Note: This class primarily uses PF2e's native predicate system.
 * For rule element level predicates, use the rule element's built-in test() method.
 */
export class PredicateHelper {
  /**
   * Evaluate a predicate against roll options using PF2e's built-in system
   * @param {Array<string|Object>} predicate - PF2e predicate array
   * @param {Set<string>|Array<string>} rollOptions - Available roll options
   * @returns {boolean} Whether the predicate passes
   */
  static evaluate(predicate, rollOptions) {
    if (!predicate || predicate.length === 0) return true;
    if (!rollOptions) return false;

    try {
      // Use PF2e's built-in predicate system
      const predicateInstance = new game.pf2e.Predicate(predicate);
      const optionsArray = Array.isArray(rollOptions) ? rollOptions : Array.from(rollOptions);
      return predicateInstance.test(optionsArray);
    } catch (error) {
      console.warn('PF2E Visioner | PF2e predicate system unavailable, using fallback:', error);
      // Fallback to simple implementation if PF2e system unavailable (e.g., during tests)
      const optionsSet = rollOptions instanceof Set ? rollOptions : new Set(rollOptions);
      return this._evaluateStatement(predicate, optionsSet);
    }
  }

  /**
   * Get roll options for a token using PF2e's built-in method
   * @param {Token} token - The token to get options for
   * @returns {Array<string>} Roll options
   */
  static getTokenRollOptions(token) {
    if (!token?.actor) return [];

    try {
      // Use PF2e's built-in roll options
      return token.actor.getRollOptions(['all']);
    } catch (error) {
      console.warn('PF2E Visioner | Error getting token roll options:', error);
      return [];
    }
  }

  /**
   * Get roll options for a target token using PF2e's built-in method
   * @param {Token} targetToken - The target token
   * @param {Token} observerToken - The observer token (for relative options)
   * @returns {Array<string>} Roll options with target: prefix
   */
  static getTargetRollOptions(targetToken, observerToken = null) {
    if (!targetToken?.actor) return [];

    try {
      // Get PF2e roll options and add target: prefix
      const actorOptions = targetToken.actor.getRollOptions(['all']);
      const targetOptions = actorOptions.map(opt => `target:${opt}`);

      // Add disposition relative to observer using PF2e's alliance system
      if (observerToken?.actor) {
        const isAlly = observerToken.actor.isAllyOf?.(targetToken.actor) ?? false;
        if (isAlly) {
          targetOptions.push('target:ally');
        } else {
          targetOptions.push('target:enemy');
        }
      }

      return targetOptions;
    } catch (error) {
      console.warn('PF2E Visioner | Error getting target roll options:', error);
      return [];
    }
  }

  /**
   * Combine roll options from multiple sources
   * @param {...(Set<string>|Array<string>)} optionSets - Sets/arrays of options to combine
   * @returns {Array<string>} Combined options
   */
  static combineRollOptions(...optionSets) {
    const combined = new Set();
    
    for (const set of optionSets) {
      if (set instanceof Set) {
        set.forEach(opt => combined.add(opt));
      } else if (Array.isArray(set)) {
        set.forEach(opt => combined.add(opt));
      }
    }

    return Array.from(combined);
  }

  /**
   * Internal: Fallback predicate evaluation for when PF2e system is unavailable
   * @private
   */
  static _evaluateStatement(statement, rollOptions) {
    if (Array.isArray(statement)) {
      // Array means AND logic by default
      return statement.every(term => this._evaluateTerm(term, rollOptions));
    } else if (typeof statement === 'object' && statement !== null) {
      // Object with special operators
      if ('and' in statement) {
        return statement.and.every(term => this._evaluateTerm(term, rollOptions));
      }
      if ('or' in statement) {
        return statement.or.some(term => this._evaluateTerm(term, rollOptions));
      }
      if ('not' in statement) {
        return !this._evaluateTerm(statement.not, rollOptions);
      }
    }
    
    return this._evaluateTerm(statement, rollOptions);
  }

  /**
   * Internal: Evaluate a single predicate term (fallback)
   * @private
   */
  static _evaluateTerm(term, rollOptions) {
    if (Array.isArray(term)) {
      return this._evaluateStatement(term, rollOptions);
    }
    
    if (typeof term === 'object' && term !== null) {
      return this._evaluateStatement(term, rollOptions);
    }

    if (typeof term === 'string') {
      // Handle negation with 'not:' prefix
      if (term.startsWith('not:')) {
        return !rollOptions.has(term.slice(4));
      }
      
      return rollOptions.has(term);
    }

    return false;
  }

  /**
   * Test helper: Create predicate from simple conditions
   * Useful for testing and simple use cases
   * @param {Object} conditions - Simple condition object
   * @returns {Array} Predicate array
   */
  static createPredicate(conditions) {
    const predicateTerms = [];

    if (conditions.hasTrait) {
      predicateTerms.push(`self:trait:${conditions.hasTrait}`);
    }
    if (conditions.hasCondition) {
      predicateTerms.push(`self:condition:${conditions.hasCondition}`);
    }
    if (conditions.targetHasTrait) {
      predicateTerms.push(`target:trait:${conditions.targetHasTrait}`);
    }
    if (conditions.targetHasCondition) {
      predicateTerms.push(`target:condition:${conditions.targetHasCondition}`);
    }

    return predicateTerms;
  }
}

