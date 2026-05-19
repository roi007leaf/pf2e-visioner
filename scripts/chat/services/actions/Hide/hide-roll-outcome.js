import { calculateStealthRollTotals, determineOutcome } from '../../infra/shared-utils.js';
import { getOutcomeLabel } from '../../ui/dialog-utils.js';

function getDieResult(actionData) {
  return Number(
    actionData?.roll?.dice?.[0]?.results?.[0]?.result ??
      actionData?.roll?.dice?.[0]?.total ??
      actionData?.roll?.terms?.[0]?.total ??
      0,
  );
}

async function applyHideOutcomeAdjustment(actionData, outcome) {
  try {
    const { FeatsHandler } = await import('../../FeatsHandler.js');
    const { shift, notes } = FeatsHandler.getOutcomeAdjustment(actionData.actor, 'hide');
    if (!shift) {
      return { adjustedOutcome: outcome, featNotes: [] };
    }
    return {
      adjustedOutcome: FeatsHandler.applyOutcomeShift(outcome, shift),
      featNotes: notes,
    };
  } catch (e) {
    console.warn('PF2E Visioner | Hide feats adjustment failed:', e);
    return { adjustedOutcome: outcome, featNotes: [] };
  }
}

export async function resolveHideRollOutcome({ actionData, adjustedDC, autoCover }) {
  const baseTotal = Number(actionData?.roll?.total ?? 0);
  const { total, originalTotal, baseRollTotal } = calculateStealthRollTotals(
    baseTotal,
    autoCover,
    actionData,
  );

  const die = getDieResult(actionData);
  const margin = total - adjustedDC;
  const originalMargin = originalTotal ? originalTotal - adjustedDC : margin;
  const baseMargin = baseRollTotal ? baseRollTotal - adjustedDC : margin;
  const outcome = determineOutcome(total, die, adjustedDC);
  const originalOutcome = originalTotal
    ? determineOutcome(originalTotal, die, adjustedDC)
    : outcome;
  const originalOutcomeLabel = originalTotal ? getOutcomeLabel(originalOutcome) : null;
  const { adjustedOutcome, featNotes } = await applyHideOutcomeAdjustment(actionData, outcome);

  return {
    total,
    originalTotal,
    baseRollTotal,
    die,
    margin,
    originalMargin,
    baseMargin,
    outcome,
    adjustedOutcome,
    originalOutcome,
    originalOutcomeLabel,
    featNotes,
  };
}
