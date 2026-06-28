import { PredicateHelper } from '../rule-elements/PredicateHelper.js';

const COVER_ORDER = ['none', 'lesser', 'standard', 'greater'];
const COVER_BONUS = { none: 0, lesser: 1, standard: 2, greater: 4 };

export function adjustCoverState(state, adjustment) {
  if (adjustment?.mode === 'step') {
    const index = Math.max(0, COVER_ORDER.indexOf(state));
    const next = Math.max(0, Math.min(index + Number(adjustment.steps ?? 0), COVER_ORDER.length - 1));
    return COVER_ORDER[next];
  }
  if (adjustment?.mode === 'bonus') {
    const bonus = Math.max(0, (COVER_BONUS[state] ?? 0) + Number(adjustment.amount ?? 0));
    if (bonus >= 4) return 'greater';
    if (bonus >= 2) return 'standard';
    if (bonus >= 1) return 'lesser';
    return 'none';
  }
  return state;
}

export function applyCoverAdjustments(state, adjustments, rollOptions) {
  const applied = [];
  let current = state;
  const sorted = [...(adjustments || [])].sort((a, b) => (b?.priority ?? 100) - (a?.priority ?? 100));
  for (const adjustment of sorted) {
    if (adjustment?.predicate?.length && !PredicateHelper.evaluate(adjustment.predicate, rollOptions || [])) {
      continue;
    }
    current = adjustCoverState(current, adjustment);
    applied.push(adjustment.id);
  }
  return { state: current, applied };
}
