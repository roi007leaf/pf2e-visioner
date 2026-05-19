function cssEscape(value) {
  const raw = String(value ?? '');
  return globalThis.CSS?.escape
    ? globalThis.CSS.escape(raw)
    : raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function tokenRowSelector(tokenId) {
  return `tr[data-token-id="${cssEscape(tokenId)}"]`;
}

function findTokenRow(app, tokenId) {
  return app.element?.querySelector?.(tokenRowSelector(tokenId));
}

function removeNoActionSpan(actionsCell) {
  actionsCell?.querySelector('.no-action')?.remove();
}

function createRowActionButton({ action, className, iconClass, tokenId, tooltip }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `row-action-btn ${className}`;
  button.setAttribute('data-action', action);
  button.setAttribute('data-token-id', tokenId);
  button.setAttribute('data-tooltip', tooltip);
  button.innerHTML = `<i class="${iconClass}"></i>`;
  return button;
}

function ensureNoActionSpan(actionsCell) {
  if (!actionsCell || actionsCell.querySelector('.no-action')) return;

  const noActionSpan = document.createElement('span');
  noActionSpan.className = 'no-action';
  noActionSpan.textContent = game.i18n.localize('PF2E_VISIONER.UI.NO_CHANGE_LABEL');
  actionsCell.appendChild(noActionSpan);
}

function setButtonVisibility(button, visible) {
  if (!button) return;

  button.disabled = !visible;
  button.style.display = visible ? 'inline-flex' : 'none';
}

export function updateSneakVisibilityStateIndicators(row, visibilityState) {
  const selectedState = String(visibilityState ?? '');
  row?.querySelectorAll?.('.state-icon')?.forEach((state) => {
    state.classList.toggle('selected', state.dataset.state === selectedState);
  });
}

export async function updateSneakOutcomeDisplayForToken(app, tokenId, outcome) {
  const row = findTokenRow(app, tokenId);
  if (!row) return;

  const outcomeCell = row.querySelector('.outcome');
  if (outcomeCell) {
    const outcomeClass = app.getOutcomeClass(outcome.outcome);
    const outcomeText = outcomeCell.querySelector('.outcome-text');
    if (outcomeText) outcomeText.textContent = app.getOutcomeLabel(outcome.outcome);

    outcomeCell.className = `outcome ${outcomeClass}`;

    const outcomePrimary = outcomeCell.querySelector('.outcome-primary');
    if (outcomePrimary) {
      outcomePrimary.className = `outcome-primary sneak-result-${outcomeClass}`;
    }
  }

  updateSneakVisibilityStateIndicators(row, outcome.newVisibility);

  const effectiveNewState = outcome.overrideState || outcome.newVisibility;
  const hasChangeFromOldVisibility = effectiveNewState !== outcome.oldVisibility;
  outcome.hasActionableChange = hasChangeFromOldVisibility;
  outcome.hasRevertableChange =
    hasChangeFromOldVisibility ||
    (outcome.oldVisibility !== outcome.currentVisibility &&
      outcome.oldVisibility !== outcome.newVisibility);

  app.updateActionButtonsForToken(tokenId, outcome.hasActionableChange);

  const actionsCell = row.querySelector('.actions');
  let applyButton = row.querySelector('.apply-change');
  let revertButton = row.querySelector('.revert-change');

  if (!applyButton && outcome.hasActionableChange && actionsCell) {
    removeNoActionSpan(actionsCell);
    applyButton = createRowActionButton({
      action: 'applyChange',
      className: 'apply-change',
      iconClass: 'fas fa-check',
      tokenId,
      tooltip: 'Apply this visibility change',
    });
    actionsCell.appendChild(applyButton);
  }

  if (!revertButton && outcome.hasRevertableChange && actionsCell) {
    removeNoActionSpan(actionsCell);
    revertButton = createRowActionButton({
      action: 'revertChange',
      className: 'revert-change',
      iconClass: 'fas fa-undo',
      tokenId,
      tooltip: 'Revert to original visibility',
    });
    actionsCell.appendChild(revertButton);
  }

  setButtonVisibility(applyButton, outcome.hasActionableChange);
  setButtonVisibility(revertButton, outcome.hasRevertableChange);

  if (!outcome.hasActionableChange) ensureNoActionSpan(actionsCell);
}
