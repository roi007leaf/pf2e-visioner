const RULE_ELEMENT_FLAG_KEYS = [
  'distanceBasedVisibility',
  'ruleElementOverride',
  'visibilityReplacement',
  'conditionalState',
  'auraVisibility',
];

function tokenId(token) {
  return token?.document?.id || token?.id || null;
}

function readModuleFlags(token, moduleId) {
  return token?.document?.flags?.[moduleId] || null;
}

function readFlag(token, moduleId, key) {
  const flags = readModuleFlags(token, moduleId);
  if (flags && key in flags) return flags[key];
  return token?.document?.getFlag?.(moduleId, key);
}

function hasObserverScopedSources(stateSource) {
  return Object.values(stateSource?.visibilityByObserver || {}).some(
    (entry) => Array.isArray(entry?.sources) && entry.sources.length > 0,
  );
}

export class RuleElementBatchContext {
  constructor({ checker, tokens = [], moduleId = 'pf2e-visioner' } = {}) {
    this.checker = checker;
    this.moduleId = moduleId;
    this.cache = new Map();
    this.hasRuleElementState = (tokens || []).some((token) => this.#tokenHasRuleElementState(token));
  }

  #tokenHasRuleElementState(token) {
    for (const key of RULE_ELEMENT_FLAG_KEYS) {
      if (readFlag(token, this.moduleId, key)?.active) return true;
    }

    const stateSource = readFlag(token, this.moduleId, 'stateSource');
    return (
      Array.isArray(stateSource?.visibility?.sources) && stateSource.visibility.sources.length > 0
    ) || hasObserverScopedSources(stateSource);
  }

  checkRuleElements(observerToken, targetToken, currentVisibility = null) {
    if (!this.hasRuleElementState) return null;

    const observerId = tokenId(observerToken);
    const targetId = tokenId(targetToken);
    if (!observerId || !targetId) return null;

    const key = `${observerId}->${targetId}:${currentVisibility || ''}`;
    if (!this.cache.has(key)) {
      this.cache.set(
        key,
        this.checker?.checkRuleElements?.(observerToken, targetToken, currentVisibility) || null,
      );
    }
    return this.cache.get(key);
  }

  checkVisibilityReplacement(observerToken, targetToken, currentVisibility = null) {
    if (!this.hasRuleElementState || !currentVisibility) return null;

    const observerId = tokenId(observerToken);
    const targetId = tokenId(targetToken);
    if (!observerId || !targetId) return null;

    const key = `visibilityReplacement:${observerId}->${targetId}:${currentVisibility}`;
    if (!this.cache.has(key)) {
      this.cache.set(
        key,
        this.checker?.checkVisibilityReplacement?.(observerToken, targetToken, currentVisibility) ||
          null,
      );
    }
    return this.cache.get(key);
  }
}
