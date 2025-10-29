import { PredicateHelper } from '../PredicateHelper.js';

export class OffGuardSuppression {
  static async applyOffGuardSuppression(operation, subjectToken) {
    if (!subjectToken) return;

    const { suppressedStates = [], source, priority = 100, predicate } = operation;

    if (predicate && predicate.length > 0) {
      const rollOptions = PredicateHelper.getTokenRollOptions(subjectToken);
      const predicateResult = PredicateHelper.evaluate(predicate, rollOptions);
      if (!predicateResult) {
        return;
      }
    }

    if (!Array.isArray(suppressedStates) || suppressedStates.length === 0) {
      console.warn('PF2E Visioner | offGuardSuppression requires suppressedStates array');
      return;
    }

    const suppressionData = {
      id: source || `off-guard-suppression-${Date.now()}`,
      type: source,
      priority,
      suppressedStates,
    };

    await subjectToken.document.setFlag(
      'pf2e-visioner',
      `offGuardSuppression.${suppressionData.id}`,
      suppressionData
    );
  }

  static async removeOffGuardSuppression(operation, subjectToken) {
    if (!subjectToken) return;

    const { source } = operation;
    const suppressions = subjectToken.document.getFlag('pf2e-visioner', 'offGuardSuppression') || {};

    if (suppressions[source]) {
      await subjectToken.document.unsetFlag('pf2e-visioner', `offGuardSuppression.${source}`);
    }
  }

  static shouldSuppressOffGuardForState(token, visibilityState) {
    if (!token?.document || !visibilityState) return false;

    const suppressions = token.document.getFlag('pf2e-visioner', 'offGuardSuppression') || {};
    const suppressionArray = Object.values(suppressions);

    if (suppressionArray.length === 0) return false;

    return suppressionArray.some(suppression =>
      suppression.suppressedStates?.includes(visibilityState)
    );
  }

  static getSuppressedStates(token) {
    if (!token?.document) return [];

    const suppressions = token.document.getFlag('pf2e-visioner', 'offGuardSuppression') || {};
    const allSuppressedStates = new Set();

    Object.values(suppressions).forEach(suppression => {
      if (Array.isArray(suppression.suppressedStates)) {
        suppression.suppressedStates.forEach(state => allSuppressedStates.add(state));
      }
    });

    return Array.from(allSuppressedStates);
  }
}
