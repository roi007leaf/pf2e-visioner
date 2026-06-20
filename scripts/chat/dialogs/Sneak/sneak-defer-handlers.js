import turnSneakTracker from '../../services/TurnSneakTracker.js';

function toggleSingleDefer(app, button, event) {
  event.preventDefault();
  event.stopPropagation();

  const tokenId = button.dataset.tokenId;
  const row = button.closest('tr');
  if (!tokenId || !row) return;

  const outcome = app.outcomes.find((candidate) => candidate.token?.id === tokenId);
  if (!outcome) return;

  const wasDeferred = app._deferredChecks.has(tokenId);

  if (wasDeferred) {
    app._deferredChecks.delete(tokenId);
    button.classList.remove('deferred', 'active');
    row.classList.remove('row-deferred');
    button.querySelector('i').className = 'fas fa-hourglass-half';
    button.title = 'Defer this check';

    try {
      turnSneakTracker.removeDeferredCheck(app.sneakingToken, outcome.token);
    } catch {
      /* Tracker cleanup is best-effort */
    }

    outcome.isDeferred = false;
    app._recalculateDeferEligibility(outcome);
  } else {
    app._deferredChecks.add(tokenId);
    button.classList.add('deferred', 'active');
    row.classList.add('row-deferred');
    button.querySelector('i').className = 'fas fa-clock';
    button.title = 'Remove defer';

    if (!outcome._featPositionOverride) {
      outcome._featPositionOverride = {
        startQualifies: app._startPositionQualifiesForSneak(outcome.token, outcome),
        endQualifies: app._endPositionQualifiesForSneak(outcome.token, outcome),
        reason: 'Deferred position qualifications',
      };
    }

    outcome.isDeferred = true;

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
      /* Tracker recording is best-effort */
    }
  }

  app._updateBulkDeferButton();
  app._updateEndTurnValidationButton();
}

export function addSneakDeferHandlers(app) {
  if (!app?.element || app.element.dataset.sneakDeferDelegated === 'true') return;
  app.element.dataset.sneakDeferDelegated = 'true';
  app.element.addEventListener('click', (event) => {
    const button = event.target?.closest?.('[data-action]');
    if (!button || !app.element?.contains?.(button)) return;

    if (button.dataset.action === 'toggleDefer') {
      toggleSingleDefer(app, button, event);
      return;
    }

    if (button.dataset.action === 'bulkDefer') {
      event.preventDefault();
      event.stopPropagation();
      app._bulkDeferAllEligible();
      return;
    }

    if (button.dataset.action !== 'bulkUndefer') return;
    event.preventDefault();
    event.stopPropagation();

    if (button.classList.contains('ready-to-restore')) {
      app._bulkRestoreDefers();
    } else {
      app._bulkUndeferAll();
    }
  });
}
