import turnSneakTracker from '../../services/TurnSneakTracker.js';

function notifyInfo(message) {
  if (typeof ui !== 'undefined' && ui.notifications) ui.notifications.info(message);
}

function notifyWarn(message) {
  if (typeof ui !== 'undefined' && ui.notifications) ui.notifications.warn(message);
}

function getDeferButton(app, tokenId) {
  return app.element.querySelector(`[data-action="toggleDefer"][data-token-id="${tokenId}"]`);
}

function setDeferRowState(button, deferred) {
  const row = button?.closest('tr');
  if (!button || !row) return false;

  button.classList.toggle('deferred', deferred);
  button.classList.toggle('active', deferred);
  row.classList.toggle('row-deferred', deferred);
  button.querySelector('i').className = deferred ? 'fas fa-clock' : 'fas fa-hourglass-half';
  button.title = deferred ? 'Remove defer' : 'Defer this check';

  if (deferred) row.setAttribute('data-deferred', 'true');
  else row.removeAttribute('data-deferred');

  return true;
}

function getOriginalStoredOutcome(app, outcome) {
  try {
    const combatantId = turnSneakTracker._getCombatantId(app.sneakingToken);
    if (!combatantId) return null;

    const turnState = turnSneakTracker._turnSneakStates.get(combatantId);
    if (!turnState) return null;

    const observerId = outcome.token.document?.id || outcome.token.id;
    const deferredData = turnState.deferredChecks.get(observerId);
    return deferredData?.originalOutcome || null;
  } catch {
    return null;
  }
}

function recordDeferredCheck(app, outcome) {
  try {
    const positionTransition = app._getPositionTransitionForToken(outcome.token);
    const positionData = {
      position: positionTransition?.endPosition,
      visibility: outcome.newVisibility,
      coverState: outcome.endCover || 'none',
    };

    turnSneakTracker.recordDeferredCheck(
      app.sneakingToken,
      outcome.token,
      positionData,
      outcome,
    );
  } catch {
    /* Tracker recording is best effort */
  }
}

export function bulkDeferAllEligible(app) {
  const visibleOutcomes = app._lastRenderedOutcomes || [];
  let deferredCount = 0;

  visibleOutcomes.forEach((outcome) => {
    const tokenId = outcome.token?.id;
    if (!tokenId) return;
    if (app._deferredChecks.has(tokenId) || outcome.isDeferred) return;
    if (!outcome.canDefer) return;

    const button = getDeferButton(app, tokenId);
    if (!setDeferRowState(button, true)) return;

    app._deferredChecks.add(tokenId);
    recordDeferredCheck(app, outcome);
    deferredCount++;
  });

  if (deferredCount > 0) {
    updateBulkDeferButton(app);
    updateEndTurnValidationButton(app);
    notifyInfo(
      `Deferred ${deferredCount} eligible position check${
        deferredCount !== 1 ? 's' : ''
      } to end of turn (Sneaky feat).`,
    );
    return;
  }

  notifyWarn(
    'No eligible outcomes found for deferral. Sneaky feat only applies to successful sneaks with failing end positions.',
  );
}

export function bulkUndeferAll(app) {
  const visibleOutcomes = app._lastRenderedOutcomes || [];
  let undeferredCount = 0;

  visibleOutcomes.forEach((outcome) => {
    const tokenId = outcome.token?.id;
    if (!tokenId) return;
    if (!app._deferredChecks.has(tokenId) && !outcome.isDeferred) return;

    const originalStoredOutcome = getOriginalStoredOutcome(app, outcome);
    app._deferredChecks.delete(tokenId);
    setDeferRowState(getDeferButton(app, tokenId), false);

    try {
      turnSneakTracker.removeDeferredCheck(app.sneakingToken, outcome.token);
    } catch {
      /* Tracker cleanup is best effort */
    }

    app._bulkUndeferredOutcomes.set(tokenId, { ...outcome });

    if (originalStoredOutcome) {
      try {
        const positionTransition = app._getPositionTransitionForToken(outcome.token);
        const endQualifies = positionTransition
          ? app._endPositionQualifiesForSneak(outcome.token, positionTransition.endPosition)
          : false;
        const outcomeIndex = app.outcomes.findIndex((candidate) => candidate.token?.id === tokenId);

        if (outcomeIndex >= 0) {
          app.outcomes[outcomeIndex] = {
            ...app.outcomes[outcomeIndex],
            startQualifies: originalStoredOutcome.startQualifies,
            startCover: originalStoredOutcome.startCover,
            startVisibility: originalStoredOutcome.startVisibility,
            endQualifies,
            isDeferred: false,
          };
        }
      } catch {
        /* Selective recalculation is best effort */
      }
    }

    undeferredCount++;
  });

  if (undeferredCount > 0) {
    updateBulkDeferButton(app);
    updateEndTurnValidationButton(app);
    setBulkUndeferButtonToRestoreMode(app);
    app.render(false, { force: true }).catch(() => undefined);
    notifyInfo(`Bulk undeferred ${undeferredCount} token${undeferredCount === 1 ? '' : 's'}`);
    return;
  }

  notifyWarn(game.i18n.localize('PF2E_VISIONER.NOTIFICATIONS.NO_DEFERRED_TOKENS'));
}

export function bulkRestoreDefers(app) {
  let restoredCount = 0;

  app._bulkUndeferredOutcomes.forEach((originalOutcome, tokenId) => {
    const outcomeIndex = app.outcomes.findIndex((outcome) => outcome.token?.id === tokenId);
    if (outcomeIndex < 0) return;

    app.outcomes[outcomeIndex] = { ...originalOutcome };
    app._deferredChecks.add(tokenId);
    setDeferRowState(getDeferButton(app, tokenId), true);
    recordDeferredCheck(app, originalOutcome);
    restoredCount++;
  });

  app._bulkUndeferredOutcomes.clear();

  if (restoredCount > 0) {
    forceResetBulkUndeferButton(app);
    updateBulkDeferButton(app);
    updateEndTurnValidationButton(app);
    app.render(false, { force: true }).catch(() => undefined);
    notifyInfo(
      game.i18n.format('PF2E_VISIONER.NOTIFICATIONS.SNEAK_DEFERRED_RESTORED', {
        count: restoredCount,
      }),
    );
    return;
  }

  notifyWarn(game.i18n.localize('PF2E_VISIONER.NOTIFICATIONS.NO_UNDEFERRED_TOKENS'));
}

export function updateBulkDeferButton(app) {
  const bulkDeferButton = app.element.querySelector('[data-action="bulkDefer"]');
  const bulkUndeferButton = app.element.querySelector('[data-action="bulkUndefer"]');
  const visibleOutcomes = app._lastRenderedOutcomes || [];
  const hasEligible = visibleOutcomes.some((outcome) => outcome.canDefer && !outcome.isDeferred);
  const hasDeferred = visibleOutcomes.some(
    (outcome) => outcome.isDeferred || app._deferredChecks.has(outcome.token?.id),
  );

  bulkDeferButton?.classList.toggle('available', hasEligible);
  bulkUndeferButton?.classList.toggle(
    'available',
    hasDeferred || app._bulkUndeferredOutcomes.size > 0,
  );
}

export function updateEndTurnValidationButton(app) {
  const endTurnButton = app.element.querySelector('[data-action="processEndTurnValidation"]');
  if (!endTurnButton) return;

  const visibleOutcomes = app._lastRenderedOutcomes || [];
  const deferredCount = visibleOutcomes.filter(
    (outcome) => outcome.isDeferred || app._deferredChecks.has(outcome.token?.id),
  ).length;
  const hasDeferred = deferredCount > 0;
  const buttonContainer = endTurnButton.closest('.bulk-action-group');

  if (buttonContainer) {
    buttonContainer.style.display = hasDeferred ? '' : 'none';
    endTurnButton.classList.toggle('available', hasDeferred);
  }

  const countSpan = endTurnButton.querySelector('span');
  if (countSpan) countSpan.textContent = `End Turn Validation (${deferredCount})`;

  const tooltip = `Process ${deferredCount} deferred position check${
    deferredCount === 1 ? '' : 's'
  } for end-of-turn validation`;
  endTurnButton.setAttribute('data-tooltip', tooltip);
}

export function updateDeferButtonForToken(app, tokenId, canDefer) {
  if (!app.element) return;

  const row = app.element.querySelector(`tr[data-token-id="${tokenId}"]`);
  if (!row) return;

  const deferButton = row.querySelector('[data-action="toggleDefer"]');
  if (deferButton) {
    deferButton.classList.toggle('hidden', !canDefer);
    deferButton.disabled = !canDefer;
  }

  updateBulkDeferButton(app);
  updateEndTurnValidationButton(app);
}

export function resetBulkUndeferButton(app) {
  const bulkUndeferButton = app.element.querySelector('[data-action="bulkUndefer"]');
  if (!bulkUndeferButton) return;

  const localize = game.i18n.localize.bind(game.i18n);
  const restoreMode = app._bulkUndeferButtonState === 'restore';
  bulkUndeferButton.classList.toggle('ready-to-restore', restoreMode);
  bulkUndeferButton.innerHTML = restoreMode
    ? `<i class="fas fa-undo"></i> ${localize('PF2E_VISIONER.UI.RESTORE_DEFERS_BUTTON')}`
    : `<i class="fas fa-clock"></i> ${localize('PF2E_VISIONER.UI.UNDEFER_ALL_BUTTON')}`;
  bulkUndeferButton.setAttribute(
    'data-tooltip',
    restoreMode
      ? 'Restore all previously deferred tokens to deferred state'
      : 'Undefer all currently deferred tokens and restore their original state',
  );
  app.element.querySelectorAll('tr.pending-restore').forEach((row) => {
    row.classList.remove('pending-restore');
  });
}

export function setBulkUndeferButtonToRestoreMode(app) {
  app._bulkUndeferButtonState = 'restore';
  resetBulkUndeferButton(app);
}

export function forceResetBulkUndeferButton(app) {
  app._bulkUndeferButtonState = 'undefer';
  app._bulkUndeferredOutcomes.clear();
  resetBulkUndeferButton(app);
}
