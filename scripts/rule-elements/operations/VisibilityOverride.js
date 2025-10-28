import { PredicateHelper } from '../PredicateHelper.js';
import { SourceTracker } from '../SourceTracker.js';

export class VisibilityOverride {
  static async applyVisibilityOverride(operation, subjectToken, options = {}) {
    if (!subjectToken) {
      console.warn('PF2E Visioner | No subject token provided to applyVisibilityOverride');
      return;
    }

    const {
      observers,
      direction,
      state,
      source,
      applyOffGuard = true,
      fromStates,
      toState,
      priority = 100,
      tokenIds,
      predicate,
      triggerRecalculation = false,
    } = operation;

    const observerTokens = this.getObserverTokens(
      subjectToken,
      observers,
      operation.range,
      tokenIds,
    );


    // If this is a visibility replacement (fromStates → toState), handle it separately
    if (fromStates && fromStates.length > 0 && toState) {
      const sourceData = {
        id: source || `visibility-replacement-${Date.now()}`,
        type: source,
        priority,
        fromStates,
        toState,
        direction,
        predicate,
        range: operation.range,
        levelComparison: operation.levelComparison,
      };

      await subjectToken.document.setFlag('pf2e-visioner', 'visibilityReplacement', {
        active: true,
        ...sourceData,
      });

      if (triggerRecalculation) {
        if (window.pf2eVisioner?.services?.autoVisibilitySystem?.recalculateForTokens) {
          await window.pf2eVisioner.services.autoVisibilitySystem.recalculateForTokens([
            subjectToken.id,
          ]);
        } else if (window.pf2eVisioner?.services?.autoVisibilitySystem?.recalculateAll) {
          await window.pf2eVisioner.services.autoVisibilitySystem.recalculateAll();
        } else if (canvas?.perception) {
          canvas.perception.update({ refreshVision: true, refreshOcclusion: true });
        }
      }
      return;
    }

    // Otherwise, it's a direct state override
    const sourceData = {
      id: source || `visibility-${Date.now()}`,
      type: source,
      priority,
      state,
      qualifications: operation.qualifications || {},
    };

    for (const observerToken of observerTokens) {
      if (observerToken.id === subjectToken.id) {
        continue;
      }

      const [targetToken, observingToken] =
        direction === 'from' ? [subjectToken, observerToken] : [observerToken, subjectToken];


      // Check operation-level predicate per target
      if (predicate && predicate.length > 0) {
        const subjectOptions = PredicateHelper.getTokenRollOptions(subjectToken);
        const targetOptions = PredicateHelper.getTargetRollOptions(observerToken, subjectToken);
        const combinedOptions = PredicateHelper.combineRollOptions(subjectOptions, targetOptions);

        if (!PredicateHelper.evaluate(predicate, combinedOptions)) {
          continue;
        }
      }

      await this.setVisibilityState(observingToken, targetToken, state, sourceData, applyOffGuard);
    }

    await subjectToken.document.setFlag('pf2e-visioner', 'ruleElementOverride', {
      active: true,
      source: sourceData.id,
      state,
      direction,
    });

    // Trigger visibility recalculation to update visibility maps from sources
    if (triggerRecalculation) {
      // Collect all affected token IDs for recalculation
      const affectedTokenIds = [subjectToken.id];
      for (const observerToken of observerTokens) {
        if (observerToken.id !== subjectToken.id && !affectedTokenIds.includes(observerToken.id)) {
          affectedTokenIds.push(observerToken.id);
        }
      }

      // Trigger full recalculation to update visibility maps from sources
      if (window.pf2eVisioner?.services?.autoVisibilitySystem?.recalculateForTokens) {
        await window.pf2eVisioner.services.autoVisibilitySystem.recalculateForTokens(affectedTokenIds);
      } else if (window.pf2eVisioner?.services?.autoVisibilitySystem?.recalculateAll) {
        await window.pf2eVisioner.services.autoVisibilitySystem.recalculateAll();
      } else if (canvas?.perception) {
        canvas.perception.update({ refreshVision: true, refreshOcclusion: true });
      }
    }
  }

  static async setVisibilityState(observerToken, targetToken, state, sourceData, applyOffGuard = true) {
    try {
      // Add the source to the state tracker
      await SourceTracker.addSourceToState(targetToken, 'visibility', sourceData, observerToken.id);

      // Update the visibility map for this specific observer->target pair
      // This is unidirectional: only sets visibility from observer's perspective of target
      const { setVisibilityBetween } = await import('../../stores/visibility-map.js');
      await setVisibilityBetween(observerToken, targetToken, state, {
        skipEphemeralUpdate: !applyOffGuard,
        isAutomatic: false,
        direction: 'observer_to_target', // Explicitly unidirectional
      });
    } catch (error) {
      console.warn('PF2E Visioner | Failed to set visibility state:', error);
    }
  }

  static async removeVisibilityOverride(operation, subjectToken) {
    if (!subjectToken) return;

    let sourceId = operation?.source;
    let direction = operation?.direction;
    let observers = operation?.observers;
    let range = operation?.range;
    let tokenIds = operation?.tokenIds;

    try {
      const existingOverride = subjectToken.document.getFlag('pf2e-visioner', 'ruleElementOverride');
      if (!sourceId && existingOverride?.source) {
        sourceId = existingOverride.source;
      }
      if (!direction && existingOverride?.direction) {
        direction = existingOverride.direction;
      }
      const existingReplacement = subjectToken.document.getFlag('pf2e-visioner', 'visibilityReplacement');
      if (!sourceId && existingReplacement?.id) {
        sourceId = existingReplacement.id;
      }
      if (!direction && existingReplacement?.direction) {
        direction = existingReplacement.direction;
      }
    } catch (_) { }

    // Remove sources from the affected tokens based on direction
    if (sourceId && direction) {
      const observerTokens = this.getObserverTokens(
        subjectToken,
        observers || 'all',
        range,
        tokenIds,
      );

      // Import visibility map functions
      const { setVisibilityBetween } = await import('../../stores/visibility-map.js');

      for (const observerToken of observerTokens) {
        if (observerToken.id === subjectToken.id) continue;

        // Clean up ONLY the current direction's storage location
        // The updateItem hook calls remove with the OLD direction, then apply with the NEW direction
        // So we should only clean where the OLD direction stored data, not both locations

        if (direction === 'from') {
          // Clean up what 'from' creates: sources on subject token with observer IDs
          await SourceTracker.removeSource(subjectToken, sourceId, 'visibility', observerToken.id);
          // Clear visibility map: observer->target (set to 'observed' to remove override)
          await setVisibilityBetween(observerToken, subjectToken, 'observed', {
            skipEphemeralUpdate: true,
            isAutomatic: false,
            direction: 'observer_to_target',
          });
        } else if (direction === 'to') {
          // Clean up what 'to' creates: sources on observer tokens with subject ID
          await SourceTracker.removeSource(observerToken, sourceId, 'visibility', subjectToken.id);
          // Clear visibility map: subject->observer (set to 'observed' to remove override)
          await setVisibilityBetween(subjectToken, observerToken, 'observed', {
            skipEphemeralUpdate: true,
            isAutomatic: false,
            direction: 'observer_to_target',
          });
        }
      }
    } else if (sourceId) {
      // Fallback: if no direction, do a general cleanup (less precise)
      await SourceTracker.removeSource(subjectToken, sourceId);
    }

    await subjectToken.document.unsetFlag('pf2e-visioner', 'ruleElementOverride');
    await subjectToken.document.unsetFlag('pf2e-visioner', 'visibilityReplacement');
  }

  static getObserverTokens(subjectToken, observers, range, tokenIds = null) {
    const allTokens =
      canvas.tokens?.placeables.filter((t) => t.actor && t.id !== subjectToken.id) || [];

    let filteredTokens = [];

    switch (observers) {
      case 'all':
        filteredTokens = allTokens;
        break;
      case 'allies':
        filteredTokens = allTokens.filter((t) => this.areAllies(subjectToken.actor, t.actor));
        break;
      case 'enemies':
        filteredTokens = allTokens.filter((t) => !this.areAllies(subjectToken.actor, t.actor));
        break;
      case 'selected':
        filteredTokens = canvas.tokens?.controlled.filter((t) => t.id !== subjectToken.id) || [];
        break;
      case 'targeted':
        filteredTokens = Array.from(game.user.targets).filter((t) => t.id !== subjectToken.id);
        break;
      case 'specific':
        if (tokenIds && tokenIds.length > 0) {
          filteredTokens = allTokens.filter((t) => tokenIds.includes(t.document.id));
        }
        break;
      default:
        filteredTokens = allTokens;
    }

    if (range) {
      filteredTokens = filteredTokens.filter((token) => {
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

    const { condition, thenState, elseState, stateType = 'visibility', source, direction, observers, priority } = operation;

    const conditionMet = this.evaluateCondition(subjectToken.actor, condition);
    const targetState = conditionMet ? thenState : elseState;

    if (!targetState) return;

    if (stateType === 'visibility') {
      await this.applyVisibilityOverride(
        {
          state: targetState,
          source,
          direction,
          observers,
          priority,
        },
        subjectToken,
      );
    }
  }

  static evaluateCondition(actor, condition) {
    if (!actor) return false;

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
