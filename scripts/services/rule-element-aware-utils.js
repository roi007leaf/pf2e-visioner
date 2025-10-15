import { getCoverBetween, getVisibilityBetween } from '../utils.js';
import { RuleElementService } from './RuleElementService.js';

let ruleElementServiceInstance = null;

function getRuleElementService() {
  if (!ruleElementServiceInstance) {
    ruleElementServiceInstance = RuleElementService.getInstance();
  }
  return ruleElementServiceInstance;
}

export function getVisibilityBetweenWithRuleElements(observer, target) {
  const baseState = getVisibilityBetween(observer, target);
  
  try {
    const service = getRuleElementService();
    const modified = service.applyVisibilityModifiers(baseState, observer, target);
    return modified;
  } catch (error) {
    console.warn('PF2E Visioner | Failed to apply rule element modifiers to visibility:', error);
    return baseState;
  }
}

export function getCoverBetweenWithRuleElements(observer, target) {
  const baseState = getCoverBetween(observer, target);
  
  try {
    const service = getRuleElementService();
    const modified = service.applyCoverModifiers(baseState, observer, target);
    return modified;
  } catch (error) {
    console.warn('PF2E Visioner | Failed to apply rule element modifiers to cover:', error);
    return baseState;
  }
}
