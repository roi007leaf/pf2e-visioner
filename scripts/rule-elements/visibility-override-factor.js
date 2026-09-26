import { RuleElementChecker } from './RuleElementChecker.js';

// Recheck the original state: the stored pair state already contains the replacement.
// This uses the same direction, predicate, range, priority and immunity gates as AVS.
export function getVisibilityOverrideFactor(observer, target, state, profile = {}) {
  const hasSources = [observer, target].some((token) =>
    ['ruleElementOverride', 'visibilityReplacement', 'visibilityReplacements', 'stateSource'].some(
      (key) => token.document?.getFlag?.('pf2e-visioner', key),
    ),
  );
  if (!hasSources) return null;
  if (typeof profile === 'function') profile = profile();
  const replacement = RuleElementChecker.checkVisibilityReplacement(
    observer,
    target,
    profile?.visibilityReplacementOriginalState ?? state,
  );
  const result =
    replacement || RuleElementChecker.checkRuleElementOverride(observer, target, state);
  if (!result || result.state !== state) return null;
  return { source: result.source, label: result.label?.trim() || null };
}
