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
      const result = predicateInstance.test(optionsArray);
      
      // Debug logging for complex predicates
      if (predicate.some(p => typeof p === 'object' && (p.or || p.and || p.not))) {
        const allTraitOptions = optionsArray.filter(o => o.includes('trait'));
        const targetTraitOptions = optionsArray.filter(o => o.includes('target:trait'));
        const undeadOptions = optionsArray.filter(o => o.includes('undead'));
        const giantOptions = optionsArray.filter(o => o.includes('giant'));
        
        console.log('PF2E Visioner | Evaluating complex predicate:', {
          predicate,
          predicateString: JSON.stringify(predicate),
          optionsCount: optionsArray.length,
          allTraitOptions: allTraitOptions.slice(0, 15),
          targetTraitOptions: targetTraitOptions.slice(0, 15),
          undeadOptions: undeadOptions,
          giantOptions: giantOptions,
          result,
        });
      }
      
      return result;
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
      // Get PF2e roll options - these come in various formats:
      // - 'trait:undead' (base trait)
      // - 'self:trait:undead' (self-domain with trait)
      // - 'item:trait:undead' (item-domain with trait)
      // We need to create target: domain options that match predicate expectations
      const actorOptions = targetToken.actor.getRollOptions(['all']);
      const targetOptions = new Set();

      // First, prefix all options with target:
      for (const opt of actorOptions) {
        targetOptions.add(`target:${opt}`);
      }

      // Extract and add direct trait options (most important for predicates like "target:trait:undead")
      // Look for patterns like 'self:trait:X', 'item:trait:X', 'trait:X', etc.
      for (const opt of actorOptions) {
        // Match trait: followed by trait name (may be at start, or after a domain like self:, item:, etc.)
        const traitMatch = opt.match(/trait:([^:]+)/);
        if (traitMatch) {
          const traitName = traitMatch[1];
          const directTraitOption = `target:trait:${traitName}`;
          targetOptions.add(directTraitOption);
        }
      }

      // Add disposition relative to observer using PF2e's alliance system
      if (observerToken?.actor) {
        const isAlly = observerToken.actor.isAllyOf?.(targetToken.actor) ?? false;
        if (isAlly) {
          targetOptions.add('target:ally');
        } else {
          targetOptions.add('target:enemy');
        }
      }

      return Array.from(targetOptions);
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

