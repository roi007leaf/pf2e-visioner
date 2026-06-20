import { notify } from '../../services/infra/notifications.js';

export function calculateSneakOutcome(margin) {
  if (margin >= 10) return 'critical-success';
  if (margin >= 0) return 'success';
  if (margin <= -10) return 'critical-failure';
  return 'failure';
}

function updateOutcomeCell(app, row, outcome, newOutcome) {
  const outcomeCell = row.querySelector('.outcome');
  const outcomeText = outcomeCell?.querySelector('.outcome-text');
  if (outcomeText) {
    outcomeText.textContent = app.getOutcomeLabel(newOutcome);
  }

  if (outcomeCell) {
    outcomeCell.className = `outcome ${app.getOutcomeClass(newOutcome)}`;
    const outcomePrimary = outcomeCell.querySelector('.outcome-primary');
    if (outcomePrimary) {
      outcomePrimary.className = `outcome-primary sneak-result-${app.getOutcomeClass(newOutcome)}`;
    }
  }
}

async function recalculateCoverBonusOutcome(app, outcome, row, bonus) {
  const rollTotalElement = row.querySelector('.roll-total');
  const baseTotal =
    parseInt(rollTotalElement.dataset.baseTotal, 10) ||
    outcome.baseRollTotal ||
    outcome.rollTotal;
  const newTotal = baseTotal + bonus;

  if (!rollTotalElement.dataset.baseTotal) {
    rollTotalElement.dataset.baseTotal = outcome.rollTotal;
  }

  rollTotalElement.textContent = newTotal;
  outcome.rollTotal = newTotal;

  const newOutcome = calculateSneakOutcome(newTotal - outcome.dc);
  outcome.outcome = newOutcome;
  updateOutcomeCell(app, row, outcome, newOutcome);

  try {
    if (typeof app._recalculateNewVisibilityForOutcome === 'function') {
      await app._recalculateNewVisibilityForOutcome(outcome);
    }
  } catch {
    /* Recalculation is best-effort for immediate UI feedback */
  }

  app._updateVisibilityStateIndicators(row, outcome.newVisibility);
  return newTotal;
}

export async function setSneakCoverBonus(app, target) {
  if (!app) return;

  const tokenId = target.dataset.tokenId;
  const bonus = parseInt(target.dataset.bonus, 10);
  if (!tokenId || Number.isNaN(bonus)) return;

  const outcome = app.outcomes.find((candidate) => candidate.token.id === tokenId);
  if (!outcome) return;

  outcome.appliedCoverBonus = bonus;

  const row = target.closest('tr');
  const coverButtons = row.querySelectorAll('.cover-bonus-btn');
  coverButtons.forEach((button) => button.classList.remove('active'));
  target.classList.add('active');

  const newTotal = await recalculateCoverBonusOutcome(app, outcome, row, bonus);
  notify.info(
    `Applied +${bonus} cover bonus to ${outcome.token.name} (Roll: ${newTotal} vs DC ${outcome.dc})`,
  );
}

export async function applyAllSneakCoverBonus(app, target) {
  if (!app) return;

  const bonus = parseInt(target.dataset.bonus, 10);
  if (Number.isNaN(bonus)) return;

  let appliedCount = 0;

  for (const outcome of app.outcomes) {
    if (!outcome.token) continue;

    outcome.appliedCoverBonus = bonus;
    const row = app.element.querySelector(`tr[data-token-id="${outcome.token.id}"]`);
    if (!row) continue;

    const coverButtons = row.querySelectorAll('.cover-bonus-btn');
    coverButtons.forEach((button) => {
      button.classList.remove('active');
      if (parseInt(button.dataset.bonus, 10) === bonus) {
        button.classList.add('active');
      }
    });

    await recalculateCoverBonusOutcome(app, outcome, row, bonus);
    appliedCount++;
  }

  const applyAllButtons = app.element.querySelectorAll('.apply-all-cover-btn');
  applyAllButtons.forEach((button) => button.classList.remove('active'));
  target.classList.add('active');
  applyAllButtons.forEach((button) => button.classList.remove('active'));

  notify.info(`Applied +${bonus} cover bonus to all ${appliedCount} observers`);
}

export function resetSneakCoverBonusButtonStates(app) {
  const coverButtons = app.element.querySelectorAll('.cover-bonus-btn');
  coverButtons.forEach((button) => {
    button.classList.remove('active');
    if (button.dataset.bonus === '0') {
      button.classList.add('active');
    }
  });

  const applyAllButtons = app.element.querySelectorAll('.apply-all-cover-btn');
  applyAllButtons.forEach((button) => button.classList.remove('active'));
}
