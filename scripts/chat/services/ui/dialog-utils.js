// Shared helpers for action preview dialogs (Seek, Hide, Sneak, etc.)

export function getOutcomeClass(outcome) {
  switch (outcome) {
    case 'criticalSuccess':
    case 'critical-success':
      return 'critical-success';
    case 'success':
      return 'success';
    case 'failure':
      return 'failure';
    case 'criticalFailure':
    case 'critical-failure':
      return 'critical-failure';
    default:
      return '';
  }
}

export function getOutcomeLabel(outcome) {
  switch (outcome) {
    case 'criticalSuccess':
    case 'critical-success':
      return 'Critical Success';
    case 'success':
      return 'Success';
    case 'failure':
      return 'Failure';
    case 'criticalFailure':
    case 'critical-failure':
      return 'Critical Failure';
    default:
      if (typeof outcome === 'string' && outcome.length > 0) {
        return outcome.charAt(0).toUpperCase() + outcome.slice(1);
      }
      return '';
  }
}

export function updateRowButtonsToApplied(rootElement, outcomes) {
  if (!rootElement || !outcomes) return;
  for (const outcome of outcomes) {
    const tokenId = outcome?.target?.id;
    const wallId = outcome?.wallId;
    let row = null;
    if (tokenId) row = rootElement.querySelector(`tr[data-token-id="${tokenId}"]`);
    if (!row && wallId) row = rootElement.querySelector(`tr[data-wall-id="${wallId}"]`);
    if (!row) continue;
    let applyButton = row.querySelector('.row-action-btn.apply-change');
    let revertButton = row.querySelector('.row-action-btn.revert-change');
    // Fallback to plain classes if unified classes are not present
    if (!applyButton) applyButton = row.querySelector('.apply-change');
    if (!revertButton) revertButton = row.querySelector('.revert-change');
    if (applyButton) {
      applyButton.disabled = true;
      applyButton.innerHTML = '<i class="fas fa-check-circle"></i>';
      applyButton.classList.add('applied');
      applyButton.title = 'Applied';
    }
    if (revertButton) {
      revertButton.disabled = false;
      revertButton.innerHTML = '<i class="fas fa-undo"></i>';
      revertButton.classList.remove('reverted');
      revertButton.title = 'Revert to original visibility';
    }
  }
}

export function updateRowButtonsToReverted(rootElement, outcomes) {
  if (!rootElement || !outcomes) return;
  for (const outcome of outcomes) {
    const tokenId = outcome?.target?.id;
    const wallId = outcome?.wallId;
    let row = null;
    if (tokenId) row = rootElement.querySelector(`tr[data-token-id="${tokenId}"]`);
    if (!row && wallId) row = rootElement.querySelector(`tr[data-wall-id="${wallId}"]`);
    if (!row) continue;
    let applyButton = row.querySelector('.row-action-btn.apply-change');
    let revertButton = row.querySelector('.row-action-btn.revert-change');
    // Fallback to plain classes if unified classes are not present
    if (!applyButton) applyButton = row.querySelector('.apply-change');
    if (!revertButton) revertButton = row.querySelector('.revert-change');
    if (revertButton) {
      revertButton.disabled = true;
      revertButton.innerHTML = '<i class="fas fa-undo-alt"></i>';
      revertButton.classList.add('reverted');
      revertButton.title = 'Reverted';
    }
    if (applyButton) {
      applyButton.disabled = false;
      applyButton.innerHTML = '<i class="fas fa-check"></i>';
      applyButton.classList.remove('applied');
      applyButton.title = 'Apply visibility change';
    }
  }
}

export function updateBulkActionButtons(rootElement, bulkActionState) {
  if (!rootElement) return;
  const applyAllButton = rootElement.querySelector('.bulk-action-btn[data-action="applyAll"]');
  const revertAllButton = rootElement.querySelector('.bulk-action-btn[data-action="revertAll"]');
  if (!applyAllButton || !revertAllButton) return;

  const localize = game.i18n.localize.bind(game.i18n);

  switch (bulkActionState) {
    case 'initial':
      applyAllButton.disabled = false;
      revertAllButton.disabled = true;
      applyAllButton.innerHTML = `<i class="fas fa-check-circle"></i> ${localize('PF2E_VISIONER.UI.APPLY_ALL_BUTTON')}`;
      revertAllButton.innerHTML = `<i class="fas fa-undo"></i> ${localize('PF2E_VISIONER.UI.REVERT_ALL_BUTTON')}`;
      break;
    case 'applied':
      applyAllButton.disabled = true;
      revertAllButton.disabled = false;
      applyAllButton.innerHTML = `<i class="fas fa-check-circle"></i> ${localize('PF2E_VISIONER.UI.APPLIED_BUTTON')}`;
      revertAllButton.innerHTML = `<i class="fas fa-undo"></i> ${localize('PF2E_VISIONER.UI.REVERT_ALL_BUTTON')}`;
      break;
    case 'reverted':
      applyAllButton.disabled = false;
      revertAllButton.disabled = true;
      applyAllButton.innerHTML = `<i class="fas fa-check-circle"></i> ${localize('PF2E_VISIONER.UI.APPLY_ALL_BUTTON')}`;
      revertAllButton.innerHTML = `<i class="fas fa-undo"></i> ${localize('PF2E_VISIONER.UI.REVERTED_BUTTON')}`;
      break;
  }
}

export function updateChangesCount(rootElement, counterClassName) {
  if (!rootElement) return 0;
  let changesCount = 0;
  const rows = rootElement.querySelectorAll('tbody tr[data-token-id], tbody tr[data-wall-id]');
  rows.forEach((row) => {
    let applyButton = row.querySelector('.row-action-btn.apply-change');
    let revertButton = row.querySelector('.row-action-btn.revert-change');
    if (!applyButton) applyButton = row.querySelector('.apply-change');
    if (!revertButton) revertButton = row.querySelector('.revert-change');
    const hasApplicableChanges = applyButton && !applyButton.disabled;
    const hasRevertibleChanges = revertButton && !revertButton.disabled;
    if (hasApplicableChanges || hasRevertibleChanges) changesCount += 1;
  });
  if (counterClassName) {
    const el = rootElement.querySelector(`.${counterClassName}`);
    if (el) el.textContent = String(changesCount);
  }
  return changesCount;
}
