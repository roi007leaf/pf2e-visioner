function getRow(app, tokenId, opts = {}) {
  let row = opts.row || app.element?.querySelector?.(`tr[data-token-id="${tokenId}"]`);
  if (!row && opts.wallId) row = app.element?.querySelector?.(`tr[data-wall-id="${opts.wallId}"]`);
  return row || null;
}

function getActionsContainer(row) {
  return (
    row.querySelector('td.actions') ||
    row.querySelector('.actions') ||
    row.querySelector('.row-actions') ||
    row.querySelector('.action-buttons')
  );
}

function buildActionButtonsHtml({ tokenId, wallId }) {
  const idAttr = wallId ? `data-wall-id="${wallId}"` : `data-token-id="${tokenId}"`;
  const timerBtn =
    wallId || !tokenId
      ? ''
      : `
          <button type="button" class="row-timer-toggle" data-token-id="${tokenId}" data-tooltip="${game.i18n.localize(
            'PF2E_VISIONER.TIMED_OVERRIDE.SET_DURATION_FOR_ROW',
          )}">
            <i class="fas fa-clock"></i>
          </button>
        `;

  return `${timerBtn}
          <button type="button" class="row-action-btn apply-change" data-action="applyChange" ${idAttr} data-tooltip="${game.i18n.localize('PF2E_VISIONER.UI.APPLY_VISIBILITY_CHANGE')}">
            <i class="fas fa-check"></i>
          </button>
          <button type="button" class="row-action-btn revert-change" data-action="revertChange" ${idAttr} data-tooltip="${game.i18n.localize('PF2E_VISIONER.UI.REVERT_TO_ORIGINAL')}">
            <i class="fas fa-undo"></i>
          </button>
        `;
}

function renderRowActions(app, row, tokenId, hasActionableChange, opts = {}) {
  const container = getActionsContainer(row);
  if (!container) return;

  if (hasActionableChange) {
    container.innerHTML = buildActionButtonsHtml({ tokenId, wallId: opts.wallId });
    if (!opts.wallId && tokenId) {
      try {
        app._attachRowTimerHandlers();
        app._updateRowTimerButton(tokenId);
      } catch { }
    }
    return;
  }

  container.innerHTML = `<span class="no-action">${game.i18n.localize('PF2E_VISIONER.UI.NO_CHANGE_LABEL')}</span>`;
}

function updateChangedOutcomes(app) {
  try {
    app.changes = Array.isArray(app.outcomes)
      ? app.outcomes.filter((o) => {
        const baseOld = o.oldVisibility ?? o.currentVisibility ?? null;
        const baseNew = o.overrideState ?? o.newVisibility ?? null;
        return baseOld != null && baseNew != null && baseOld !== baseNew;
      })
      : [];
  } catch { }
}

function getIconTargetData(icon, overrideIcons) {
  let targetId = icon.dataset.target || icon.dataset.tokenId;
  const wallId =
    overrideIcons?.dataset?.wallId || icon.dataset.wallId || icon.closest('tr')?.dataset?.wallId || null;
  if (!targetId) targetId = icon.closest('tr[data-token-id]')?.dataset?.tokenId;
  return { targetId, wallId, newState: icon.dataset.state };
}

export function updateActionButtonsForToken(app, tokenId, hasActionableChange, opts = {}) {
  try {
    const row = getRow(app, tokenId, opts);
    if (!row) return;
    renderRowActions(app, row, tokenId, hasActionableChange, opts);
  } catch { }
}

export function addIconClickHandlers(app) {
  if (!app.element || app.element.dataset.stateIconDelegated === 'true') return;
  app.element.dataset.stateIconDelegated = 'true';
  app.element.addEventListener('click', (event) => onStateIconClick(app, event));
}

export function onStateIconClick(app, event) {
  const icon = event.target?.closest?.('.state-icon');
  if (!icon || !app.element?.contains?.(icon)) return;

  const overrideIcons = icon.closest('.override-icons');
  if (!overrideIcons) return;

  const { targetId, wallId, newState } = getIconTargetData(icon, overrideIcons);
  overrideIcons.querySelectorAll('.state-icon').forEach((i) => i.classList.remove('selected'));
  icon.classList.add('selected');
  const hiddenInput = overrideIcons?.querySelector('input[type="hidden"]');
  if (hiddenInput) hiddenInput.value = newState;

  let outcome = app.outcomes?.find?.(
    (o) => String(app.getOutcomeTokenId(o)) === String(targetId),
  );
  if (!outcome && wallId) outcome = app.outcomes?.find?.((o) => o?.wallId === wallId);
  if (!outcome) {
    app.updateChangesCount();
    return;
  }

  outcome.overrideState = newState;
  const oldState = outcome.oldVisibility ?? outcome.currentVisibility ?? null;
  const statesMatch = newState === oldState;
  const hasActionableChange =
    (oldState != null && newState != null && !statesMatch) ||
    (statesMatch && app.isOldStateAvsControlled(outcome));

  outcome.hasActionableChange = hasActionableChange;
  const row = icon.closest('tr');
  updateActionButtonsForToken(app, targetId || null, hasActionableChange, { wallId, row });
  updateChangedOutcomes(app);
  app.updateChangesCount();

  try {
    if (app.showOnlyChanges) app.render({ force: true });
  } catch { }
}

export function refreshRowActionButtons(app) {
  try {
    if (!Array.isArray(app.outcomes)) return;
    for (const outcome of app.outcomes) {
      const tokenId = app.getOutcomeTokenId(outcome);
      const wallId = outcome?._isWall ? outcome.wallId : null;
      const row = getRow(app, tokenId, { wallId });
      if (!row) continue;
      updateActionButtonsForToken(app, tokenId || null, !!outcome.hasActionableChange, {
        wallId,
        row,
      });
    }
  } catch { }
}
