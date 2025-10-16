import { PredicateHelper } from '../PredicateHelper.js';
import { SourceTracker } from '../SourceTracker.js';

export class VisibilityOverride {
  static async applyVisibilityOverride(operation, subjectToken, options = {}) {
    
    if (!subjectToken) {
      console.warn('PF2E Visioner | No subject token provided to applyVisibilityOverride');
      return;
    }

    const { observers, direction, state, source, preventConcealment, priority = 100, tokenIds, predicate } = operation;
    
    const observerTokens = this.getObserverTokens(subjectToken, observers, operation.range, tokenIds);

    const sourceData = {
      id: source || `visibility-${Date.now()}`,
      type: source,
      priority,
      state,
      preventConcealment,
      qualifications: operation.qualifications || {}
    };

    for (const observerToken of observerTokens) {
      if (observerToken.id === subjectToken.id) {
        continue;
      }

      const [targetToken, observingToken] = direction === 'from'
        ? [subjectToken, observerToken]
        : [observerToken, subjectToken];
      

      // Check operation-level predicate per target
      if (predicate && predicate.length > 0) {
        const subjectOptions = PredicateHelper.getTokenRollOptions(subjectToken);
        const targetOptions = PredicateHelper.getTargetRollOptions(observerToken, subjectToken);
        const combinedOptions = PredicateHelper.combineRollOptions(subjectOptions, targetOptions);
        
        if (!PredicateHelper.evaluate(predicate, combinedOptions)) {
          continue;
        }
      }

      await this.setVisibilityState(observingToken, targetToken, state, sourceData);
    }

    await subjectToken.document.setFlag('pf2e-visioner', 'ruleElementOverride', {
      active: true,
      source: sourceData.id,
      state
    });
  }

  static async setVisibilityState(observerToken, targetToken, state, sourceData) {
    try {
      const { setVisibilityBetween } = await import('../../stores/visibility-map.js');
      
      await setVisibilityBetween(observerToken, targetToken, state, { 
        skipEphemeralUpdate: false,
        isAutomatic: false
      });
      await SourceTracker.addSourceToState(targetToken, 'visibility', sourceData, observerToken.id);
    } catch (error) {
      console.warn('PF2E Visioner | Failed to set visibility state:', error);
    }
  }

  static async removeVisibilityOverride(operation, subjectToken) {
    if (!subjectToken) return;

    const { source } = operation;
    await SourceTracker.removeSource(subjectToken, source, 'visibility');
    await subjectToken.document.unsetFlag('pf2e-visioner', 'ruleElementOverride');

    // Trigger AVS recalculation after effect removal
    if (window.pf2eVisioner?.services?.autoVisibilitySystem?.recalculateForTokens) {
      await window.pf2eVisioner.services.autoVisibilitySystem.recalculateForTokens([subjectToken.id]);
    } else if (window.pf2eVisioner?.services?.autoVisibilitySystem?.recalculateAll) {
      await window.pf2eVisioner.services.autoVisibilitySystem.recalculateAll();
    } else if (canvas?.perception) {
      canvas.perception.update({ refreshVision: true, refreshOcclusion: true });
    }
  }

  static getObserverTokens(subjectToken, observers, range, tokenIds = null) {
    const allTokens = canvas.tokens?.placeables.filter(t => t.actor && t.id !== subjectToken.id) || [];

    let filteredTokens = [];

    switch (observers) {
      case 'all':
        filteredTokens = allTokens;
        break;
      case 'allies':
        filteredTokens = allTokens.filter(t => this.areAllies(subjectToken.actor, t.actor));
        break;
      case 'enemies':
        filteredTokens = allTokens.filter(t => !this.areAllies(subjectToken.actor, t.actor));
        break;
      case 'selected':
        filteredTokens = canvas.tokens?.controlled.filter(t => t.id !== subjectToken.id) || [];
        break;
      case 'targeted':
        filteredTokens = Array.from(game.user.targets).filter(t => t.id !== subjectToken.id);
        break;
      case 'specific':
        if (tokenIds && tokenIds.length > 0) {
          filteredTokens = allTokens.filter(t => tokenIds.includes(t.document.id));
        }
        break;
      default:
        filteredTokens = allTokens;
    }

    if (range) {
      filteredTokens = filteredTokens.filter(token => {
        const distance = canvas.grid.measureDistance(subjectToken, token);
        return distance <= range;
      });
    }

    return filteredTokens;
  }

  static areAllies(actor1, actor2) {
    if (!actor1 || !actor2) return false;

    const isPCvsPC = actor1.hasPlayerOwner && actor2.hasPlayerOwner;
    const isNPCvsNPC = !actor1.hasPlayerOwner && !actor2.hasPlayerOwner;
    const sameDisposition = actor1.token?.disposition === actor2.token?.disposition;

    return isPCvsPC || (isNPCvsNPC && sameDisposition);
  }

  static async applyConditionalState(operation, subjectToken) {
    if (!subjectToken?.actor) return;

    const { condition, thenState, elseState, stateType = 'visibility' } = operation;
    
    const conditionMet = this.evaluateCondition(subjectToken.actor, condition);
    const targetState = conditionMet ? thenState : elseState;

    if (!targetState) return;

    if (stateType === 'visibility') {
      await this.applyVisibilityOverride({
        ...operation,
        state: targetState
      }, subjectToken);
    }
  }

  static evaluateCondition(actor, condition) {
    if (!actor) return false;

    const conditions = actor.itemTypes?.condition || [];
    
    switch (condition) {
      case 'invisible':
        return conditions.some(c => c.slug === 'invisible');
      case 'concealed':
        return conditions.some(c => c.slug === 'concealed');
      case 'hidden':
        return conditions.some(c => c.slug === 'hidden');
      case 'undetected':
        return conditions.some(c => c.slug === 'undetected');
      default:
        return false;
    }
  }
}

