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

export function hasSneakAdeptFeat(actor) {
  if (!actor) return false;

  const actualActor = actor.actor ?? actor;
  if (!actualActor) return false;

  const feats =
    actualActor.itemTypes?.feat ?? actualActor.items?.filter?.((i) => i?.type === 'feat') ?? [];
  return feats.some((feat) => {
    const name = feat?.name?.toLowerCase?.() || '';
    const slug = feat?.system?.slug?.toLowerCase?.() || '';
    return name.includes('sneak adept') || slug.includes('sneak-adept');
  });
}

async function applySneakOutcomeAdjustment(actionData, outcome) {
  try {
    const { FeatsHandler } = await import('../../FeatsHandler.js');
    const { shift, notes } = FeatsHandler.getOutcomeAdjustment(actionData.actor, 'sneak');
    if (!shift) {
      return { adjustedOutcome: outcome, featNotes: [] };
    }
    return {
      adjustedOutcome: FeatsHandler.applyOutcomeShift(outcome, shift),
      featNotes: notes,
    };
  } catch (e) {
    console.warn('PF2E Visioner | Feats adjustment failed:', e);
    return { adjustedOutcome: outcome, featNotes: [] };
  }
}

export async function resolveSneakRollOutcome({ actionData, dc }) {
  const baseTotal = Number(actionData?.roll?.total ?? 0);
  const { total, originalTotal, baseRollTotal } = calculateStealthRollTotals(
    baseTotal,
    null,
    actionData,
  );

  const die = getDieResult(actionData);
  const margin = total - dc;
  const originalMargin = originalTotal ? originalTotal - dc : margin;
  const baseMargin = baseRollTotal ? baseRollTotal - dc : margin;
  const outcome = determineOutcome(total, die, dc);
  const originalOutcome = originalTotal ? determineOutcome(originalTotal, die, dc) : outcome;
  const originalOutcomeLabel = originalTotal ? getOutcomeLabel(originalOutcome) : null;
  let { adjustedOutcome, featNotes } = await applySneakOutcomeAdjustment(actionData, outcome);

  let sneakAdeptApplied = false;
  try {
    if (adjustedOutcome === 'failure' && hasSneakAdeptFeat(actionData.actor)) {
      adjustedOutcome = 'success';
      sneakAdeptApplied = true;
      featNotes = [...featNotes, 'Sneak Adept: failure upgraded to success'];
    }
  } catch (e) {
    console.warn('PF2E Visioner | Sneak Adept feat check failed:', e);
  }

  return {
    baseTotal,
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
    sneakAdeptApplied,
  };
}
