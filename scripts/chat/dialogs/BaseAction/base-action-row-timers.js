export function attachRowTimerHandlers(app) {
  if (!app.element) return;

  injectTimerButtonsIfMissing(app);
  attachDelegatedRowTimerHandler(app);
  refreshRowTimerButtons(app);
}

export function attachDelegatedRowTimerHandler(app) {
  if (!app.element || app.element.dataset.rowTimerDelegated === 'true') return;

  app.element.dataset.rowTimerDelegated = 'true';
  app.element.addEventListener('click', (event) => {
    const button = event.target?.closest?.('.row-timer-toggle');
    if (!button || !app.element?.contains?.(button)) return;
    app._onToggleRowTimer(event, button);
  });
}

export function refreshRowTimerButtons(app) {
  try {
    const all = app.element.querySelectorAll('.row-timer-toggle[data-token-id]');
    all.forEach((button) => {
      const tokenId = button.dataset.tokenId;
      if (tokenId) updateRowTimerButton(app, tokenId);
    });
  } catch {
    /* Timer refresh is visual only */
  }
}

export function injectTimerButtonsIfMissing(app) {
  const actionsCells = app.element.querySelectorAll('td.actions');
  actionsCells.forEach((cell) => {
    if (cell.querySelector('.row-timer-toggle')) return;

    const applyBtn = cell.querySelector('.row-action-btn.apply-change');
    if (!applyBtn) return;

    const tokenId = applyBtn.dataset.tokenId;
    if (!tokenId) return;

    const timerBtn = document.createElement('button');
    timerBtn.type = 'button';
    timerBtn.className = 'row-timer-toggle';
    timerBtn.dataset.tokenId = tokenId;
    timerBtn.dataset.tooltip = game.i18n.localize(
      'PF2E_VISIONER.TIMED_OVERRIDE.SET_DURATION_FOR_ROW',
    );
    timerBtn.innerHTML = '<i class="fas fa-clock"></i>';

    const timerConfig = app.rowTimers?.get(tokenId);
    if (timerConfig) timerBtn.classList.add('active');

    cell.insertBefore(timerBtn, applyBtn);
  });
}

export async function toggleRowTimer(app, event, button = null) {
  event.preventDefault();
  event.stopPropagation();

  const btn = button || event.currentTarget;
  const tokenId = btn.dataset.tokenId;
  if (!tokenId) return;

  if (app.rowTimers.has(tokenId)) {
    app.rowTimers.delete(tokenId);
    updateRowTimerButton(app, tokenId);
    return;
  }

  try {
    const { TimerDurationDialog } = await import('../../../ui/TimerDurationDialog.js');
    const defaultActorId = app.actorToken?.actor?.id || app.actor?.id || null;
    await TimerDurationDialog.show({
      defaultActorId,
      onApply: (timerConfig) => {
        if (!timerConfig) return;
        app.rowTimers.set(tokenId, timerConfig);
        updateRowTimerButton(app, tokenId);
      },
    });
  } catch (error) {
    console.error('PF2E Visioner | Error opening timer duration dialog:', error);
  }
}

export function updateRowTimerButton(app, tokenId) {
  if (!app.element) return;

  const btn = app.element.querySelector(`.row-timer-toggle[data-token-id="${tokenId}"]`);
  if (!btn) return;

  const timerConfig = app.rowTimers.get(tokenId);
  if (timerConfig) {
    btn.classList.add('active');
    let label = '';
    if (timerConfig.type === 'rounds') {
      label = `${timerConfig.rounds}r`;
    } else if (timerConfig.type === 'realtime') {
      label = `${timerConfig.minutes}m`;
    }

    let labelSpan = btn.querySelector('.row-timer-label');
    if (!labelSpan) {
      labelSpan = document.createElement('span');
      labelSpan.className = 'row-timer-label';
      btn.appendChild(labelSpan);
    }
    labelSpan.textContent = label;
    btn.dataset.tooltip = `${label} - Click to clear`;
  } else {
    btn.classList.remove('active');
    const labelSpan = btn.querySelector('.row-timer-label');
    if (labelSpan) labelSpan.remove();
    btn.dataset.tooltip = game.i18n.localize('PF2E_VISIONER.TIMED_OVERRIDE.SET_DURATION_FOR_ROW');
  }
}

export function getRowTimer(app, tokenId) {
  return app.rowTimers.get(tokenId) || null;
}
