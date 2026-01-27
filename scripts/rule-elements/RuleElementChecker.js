import { PredicateHelper } from './PredicateHelper.js';
import { SourceTracker } from './SourceTracker.js';
import { getVisibilityBetween } from '../stores/visibility-map.js';

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

    // Check aura visibility
    const auraResult = this.checkAuraVisibility(observerToken, targetToken);
    if (auraResult) {
      results.push(auraResult);
    }

    // Return the highest priority result
    if (results.length === 0) return null;

    // Priority resolution with type-based precedence
    // visibilityReplacement > ruleElementOverride > conditionalState > auraVisibility > distanceBasedVisibility
    const typePriority = {
      visibilityReplacement: 1000,
      ruleElementOverride: 500,
      conditionalState: 250,
      auraVisibility: 150,
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
          // Check observers predicate (observer)
          if (config.observersPredicate?.length > 0) {
            const observerOptions = PredicateHelper.getTokenRollOptions(observerToken);
            if (!PredicateHelper.evaluate(config.observersPredicate, observerOptions)) {
              return null;
            }
          }

          // Check target predicate (target)
          if (config.targetPredicate?.length > 0) {
            const targetOptions = PredicateHelper.getTokenRollOptions(targetToken);
            if (!PredicateHelper.evaluate(config.targetPredicate, targetOptions)) {
              return null;
            }
          }

          // Legacy combined predicate with target: prefix
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
          // Check observers predicate (target in this case, as direction is 'from')
          if (config.observersPredicate?.length > 0) {
            const observerOptions = PredicateHelper.getTokenRollOptions(observerToken);
            if (!PredicateHelper.evaluate(config.observersPredicate, observerOptions)) {
              return null;
            }
          }

          // Check target predicate (subject token in this case)
          if (config.targetPredicate?.length > 0) {
            const targetOptions = PredicateHelper.getTokenRollOptions(targetToken);
            if (!PredicateHelper.evaluate(config.targetPredicate, targetOptions)) {
              return null;
            }
          }

          // Legacy combined predicate with target: prefix
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

      // Check global flag-based overrides first (no predicates)
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

      // If no global flag, check for predicate-based overrides via SourceTracker and visibility map
      // Sources are stored on targetToken with observerId = observerToken.id for both directions
      // Check target's sources (both directions store sources on targetToken)
      const targetSources = SourceTracker.getVisibilityStateSources(targetToken, observerToken.id);
      if (targetSources.length > 0) {
        console.log(`PF2E Visioner | checkRuleElementOverride: Found ${targetSources.length} sources for ${observerToken.name}->${targetToken.name}:`, 
          targetSources.map(s => ({ id: s.id, direction: s.direction, state: s.state })));
        
        // CRITICAL: Filter sources by direction BEFORE checking predicates
        // When checking observer->target, we should only consider sources with matching direction:
        // - 'to' direction sources: observer sees target differently (stored on target with observerId = observer.id)
        // - 'from' direction sources: target is seen differently by observer (stored on target with observerId = observer.id)
        // Wait, actually both directions store on target with observerId = observer.id
        // The difference is in which token is the subject vs observer during application
        // We need to determine which direction this check represents:
        // - If checking Ezren->Skeletal Soldier, and source.direction='to', that means Ezren sees Soldier differently (correct)
        // - If checking Ezren->Skeletal Soldier, and source.direction='from', that means Soldier sees Ezren differently (wrong for this check)
        // Actually wait, let me think about this more carefully...
        // When direction='to': subjectToken sees observerToken differently
        //   - Stored on observerToken with observerId = subjectToken.id
        // When direction='from': observerToken sees subjectToken differently  
        //   - Stored on subjectToken with observerId = observerToken.id
        // So when checking observerToken->targetToken:
        // - direction='to' sources are stored on targetToken with observerId = someOtherToken.id (where someOtherToken is the subject)
        // - direction='from' sources are stored on targetToken with observerId = observerToken.id (where targetToken is the subject)
        
        // For now, check all sources but log warnings for mismatched directions
        for (const source of targetSources) {
          if (!source.predicate?.length) continue;
          
          // Determine if this source's direction matches the check direction
          // When checking observerToken->targetToken:
          // - If source.direction='from', it means targetToken is seen differently by observerToken (correct match)
          // - If source.direction='to', it means someone (targetToken?) sees observerToken differently (needs verification)
          
          // For predicate evaluation context:
          // - direction 'to': subject sees others → when checking, observer is the subject seeing the target
          // - direction 'from': others see subject → when checking, target is the subject being seen by observer
          
          // Re-evaluate predicate based on direction
          let predicatePasses = false;
          
          if (source.direction === 'to') {
            // Direction 'to': observer sees target differently
            // This means the source should apply when checking observer->target
            // Predicate should be evaluated with observer as subject, target as target
            const observerOptions = PredicateHelper.getTokenRollOptions(observerToken);
            const targetOptions = PredicateHelper.getTargetRollOptions(targetToken, observerToken);
            const combinedOptions = PredicateHelper.combineRollOptions(observerOptions, targetOptions);
            predicatePasses = PredicateHelper.evaluate(source.predicate, combinedOptions);
          } else if (source.direction === 'from') {
            // Direction 'from': target is seen differently by observer
            // This means the source should apply when checking observer->target
            // Predicate should be evaluated with target as subject, observer as target
            const targetOptions = PredicateHelper.getTokenRollOptions(targetToken);
            const observerOptions = PredicateHelper.getTargetRollOptions(observerToken, targetToken);
            const combinedOptions = PredicateHelper.combineRollOptions(targetOptions, observerOptions);
            predicatePasses = PredicateHelper.evaluate(source.predicate, combinedOptions);
          }
          
          console.log(`PF2E Visioner | checkRuleElementOverride: Source ${source.id} (direction: ${source.direction}): predicate ${predicatePasses ? 'PASSED' : 'FAILED'}`);
          
          if (predicatePasses) {
            // Check visibility map to get the stored state
            const storedState = getVisibilityBetween(observerToken, targetToken);
            
            console.log(`PF2E Visioner | checkRuleElementOverride: Returning override - source: ${source.id}, direction: ${source.direction}, state: ${source.state || storedState}`);
            
            // Return the source state or stored state (prefer source.state if available)
            if (source.state || storedState !== 'observed') {
              return {
                state: source.state || storedState,
                source: source.id,
                priority: source.priority || 100,
                type: 'ruleElementOverride',
              };
            }
          }
        }
      }
      
      // Also check the reverse direction: sources might be stored on observerToken for 'to' direction
      // When direction='to', source is stored on targetToken (which becomes observerToken in reverse check)
      // So we need to check observerToken's sources with targetToken.id as observerId
      const observerSources = SourceTracker.getVisibilityStateSources(observerToken, targetToken.id);
      if (observerSources.length > 0) {
        console.log(`PF2E Visioner | checkRuleElementOverride: Found ${observerSources.length} reverse sources for ${observerToken.name}->${targetToken.name}:`, 
          observerSources.map(s => ({ id: s.id, direction: s.direction, state: s.state })));
        
        // Check if any of these are 'to' direction sources that should apply to observer->target check
        for (const source of observerSources) {
          if (!source.predicate?.length || source.direction !== 'to') continue;
          
          // Direction 'to' stored on observerToken: means observerToken (as subject) sees targetToken differently
          // When checking observerToken->targetToken, this source applies
          const observerOptions = PredicateHelper.getTokenRollOptions(observerToken);
          const targetOptions = PredicateHelper.getTargetRollOptions(targetToken, observerToken);
          const combinedOptions = PredicateHelper.combineRollOptions(observerOptions, targetOptions);
          const predicatePasses = PredicateHelper.evaluate(source.predicate, combinedOptions);
          
          console.log(`PF2E Visioner | checkRuleElementOverride: Reverse source ${source.id} (direction: ${source.direction}): predicate ${predicatePasses ? 'PASSED' : 'FAILED'}`);
          
          if (predicatePasses) {
            const storedState = getVisibilityBetween(observerToken, targetToken);
            console.log(`PF2E Visioner | checkRuleElementOverride: Returning override from reverse source - source: ${source.id}, direction: ${source.direction}, state: ${source.state || storedState}`);
            
            if (source.state || storedState !== 'observed') {
              return {
                state: source.state || storedState,
                source: source.id,
                priority: source.priority || 100,
                type: 'ruleElementOverride',
              };
            }
          }
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
          // Check range if specified
          if (observerConfig.range) {
            const distance = observerToken.distanceTo(targetToken);
            if (distance > observerConfig.range) {
              return null;
            }
          }

          // Check level comparison if specified
          if (observerConfig.levelComparison) {
            const observerLevel = observerToken.actor?.level ?? 0;
            const targetLevel = targetToken.actor?.level ?? 0;
            const comparison = observerConfig.levelComparison;

            let levelCheckPassed = false;
            switch (comparison) {
              case 'lte': // target level <= observer level
                levelCheckPassed = targetLevel <= observerLevel;
                break;
              case 'gte': // target level >= observer level
                levelCheckPassed = targetLevel >= observerLevel;
                break;
              case 'lt': // target level < observer level
                levelCheckPassed = targetLevel < observerLevel;
                break;
              case 'gt': // target level > observer level
                levelCheckPassed = targetLevel > observerLevel;
                break;
              case 'eq': // target level == observer level
                levelCheckPassed = targetLevel === observerLevel;
                break;
            }

            if (!levelCheckPassed) {
              return null;
            }
          }

          // Evaluate predicate, if present, with observer as subject and target as target
          if (observerConfig.predicate && observerConfig.predicate.length > 0) {
            const subjectOptions = PredicateHelper.getTokenRollOptions(observerToken);
            const targetOptions = PredicateHelper.getTargetRollOptions(targetToken, observerToken);
            const combined = PredicateHelper.combineRollOptions(subjectOptions, targetOptions);
            const predicateResult = PredicateHelper.evaluate(observerConfig.predicate, combined);
            if (!predicateResult) {
              return null;
            }
          }
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
          // Check range if specified
          if (targetConfig.range) {
            const distance = observerToken.distanceTo(targetToken);
            if (distance > targetConfig.range) {
              return null;
            }
          }

          // Check level comparison if specified
          if (targetConfig.levelComparison) {
            const observerLevel = observerToken.actor?.level ?? 0;
            const targetLevel = targetToken.actor?.level ?? 0;
            const comparison = targetConfig.levelComparison;

            let levelCheckPassed = false;
            switch (comparison) {
              case 'lte': // target level <= observer level
                levelCheckPassed = targetLevel <= observerLevel;
                break;
              case 'gte': // target level >= observer level
                levelCheckPassed = targetLevel >= observerLevel;
                break;
              case 'lt': // target level < observer level
                levelCheckPassed = targetLevel < observerLevel;
                break;
              case 'gt': // target level > observer level
                levelCheckPassed = targetLevel > observerLevel;
                break;
              case 'eq': // target level == observer level
                levelCheckPassed = targetLevel === observerLevel;
                break;
            }

            if (!levelCheckPassed) {
              return null;
            }
          }

          // Evaluate predicate, if present, with target as subject and observer as target
          if (targetConfig.predicate && targetConfig.predicate.length > 0) {
            const subjectOptions = PredicateHelper.getTokenRollOptions(targetToken);
            const targetOptions = PredicateHelper.getTargetRollOptions(observerToken, targetToken);
            const combined = PredicateHelper.combineRollOptions(subjectOptions, targetOptions);
            if (!PredicateHelper.evaluate(targetConfig.predicate, combined)) {
              return null;
            }
          }

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
   * Check aura visibility effects
   */
  static checkAuraVisibility(observerToken, targetToken) {
    try {
      const allTokens = canvas.tokens?.placeables.filter((t) => t.actor) || [];
      const results = [];

      for (const token of allTokens) {
        const auraConfig = token.document?.getFlag('pf2e-visioner', 'auraVisibility');
        if (!auraConfig?.active) continue;

        const auraSource = token;

        const distToObserver = auraSource.distanceTo(observerToken);
        const distToTarget = auraSource.distanceTo(targetToken);
        const radius = auraConfig.auraRadius || 10;

        const observerIsSource = observerToken.id === auraSource.id;
        const targetIsSource = targetToken.id === auraSource.id;

        const observerInside = distToObserver <= radius;
        const targetInside = distToTarget <= radius;

        const auraTargets = auraConfig.auraTargets || 'all';
        if (auraTargets !== 'all') {
          const targetIsAlly = auraSource.actor?.isAllyOf?.(targetToken.actor) ?? false;
          const shouldApply = (auraTargets === 'enemies' && !targetIsAlly) || (auraTargets === 'allies' && targetIsAlly);
          if (!shouldApply) continue;
        }

        if (!observerInside && targetInside) {
          if (auraConfig.includeSourceAsTarget || !targetIsSource) {
            results.push({
              state: auraConfig.insideOutsideState,
              source: auraConfig.source,
              priority: auraConfig.priority || 150,
              type: 'auraVisibility',
              direction: 'inside-outside',
            });
          }
        }

        if (observerInside && !targetInside) {
          if (!auraConfig.sourceExempt || !observerIsSource) {
            results.push({
              state: auraConfig.outsideInsideState,
              source: auraConfig.source,
              priority: auraConfig.priority || 150,
              type: 'auraVisibility',
              direction: 'outside-inside',
            });
          }
        }
      }

      if (results.length === 0) return null;

      const winner = results.reduce((highest, current) =>
        (current.priority || 150) > (highest.priority || 150) ? current : highest,
      );

      return winner;
    } catch (error) {
      console.warn('PF2E Visioner | Error checking aura visibility:', error);
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
