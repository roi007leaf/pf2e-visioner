import { SourceTracker } from './SourceTracker.js';

export class RuleElementCoverService {
  static canTokenProvideCoverToTarget(blocker, target, attackContext = null) {
    try {
      const stateSource = target.document.getFlag('pf2e-visioner', 'stateSource');
      const blockerCoverSources = stateSource?.coverByObserver?.[blocker.id];
      
      if (!blockerCoverSources?.sources?.length) {
        return { allowed: true, ruleElement: null };
      }

      const highestPriority = SourceTracker.getHighestPrioritySource(blockerCoverSources.sources);
      
      if (!highestPriority) {
        return { allowed: true, ruleElement: null };
      }

      if (highestPriority.state === 'none' && (highestPriority.preventAutoCover || highestPriority.direction === 'to')) {
        const isRanged = this._isRangedAttack(attackContext);
        
        if (highestPriority.predicate?.some(p => p === 'item:ranged' || p === 'item:trait:ranged')) {
          if (!isRanged) {
            return { allowed: true, ruleElement: null };
          }
        }
        return { 
          allowed: false, 
          ruleElement: {
            blockerId: blocker.id,
            blockerName: blocker.name,
            source: highestPriority.id,
            type: highestPriority.type
          }
        };
      }

      return { allowed: true, ruleElement: null };
    } catch (error) {
      console.warn('PF2E Visioner | Error checking rule element cover for blocker:', error);
      return { allowed: true, ruleElement: null };
    }
  }

  static getCoverFromRuleElements(attacker, target) {
    try {
      const coverSources = target.document.getFlag('pf2e-visioner', 'stateSource')?.coverByObserver?.[attacker.id];
      
      if (!coverSources?.sources?.length) {
        return null;
      }

      const highestPriority = SourceTracker.getHighestPrioritySource(coverSources.sources);
      
      if (!highestPriority) {
        return null;
      }

      if (highestPriority.preventAutoCover) {
        return highestPriority.state || 'none';
      }

      if (highestPriority.state) {
        return highestPriority.state;
      }

      const providedCoverData = target.document.getFlag('pf2e-visioner', 'providesCover');
      if (providedCoverData) {
        const distance = canvas.grid.measureDistance(attacker, target);
        if (!providedCoverData.range || distance <= providedCoverData.range) {
          if (providedCoverData.requiresTakeCover) {
            const hasTakenCover = target.document.getFlag('pf2e-visioner', 'hasTakenCover');
            if (hasTakenCover) {
              return providedCoverData.state;
            }
          } else {
            return providedCoverData.state;
          }
        }
      }

      return null;
    } catch (error) {
      console.warn('PF2E Visioner | Error getting cover from rule elements:', error);
      return null;
    }
  }

  static _isRangedAttack(attackContext) {
    if (!attackContext) {
      return false;
    }

    const rollOptions = attackContext.options;
    if (rollOptions) {
      const hasRanged = Array.isArray(rollOptions) 
        ? rollOptions.includes('item:ranged') || rollOptions.includes('item:trait:ranged')
        : rollOptions instanceof Set
          ? rollOptions.has('item:ranged') || rollOptions.has('item:trait:ranged')
          : false;
      
      if (hasRanged) {
        return true;
      }
    }

    const item = attackContext.item;
    if (item) {
      const category = item.system?.category;
      if (category === 'simple-ranged' || category === 'martial-ranged' || category === 'advanced-ranged' || category === 'unarmed-ranged') {
        return true;
      }

      const traits = item.system?.traits?.value || [];
      if (traits.includes('ranged')) {
        return true;
      }

      const range = item.system?.range?.value || item.system?.range;
      if (range && range > 0) {
        return true;
      }
    }

    return false;
  }
}
