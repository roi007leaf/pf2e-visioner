import turnSneakTracker from '../../services/TurnSneakTracker.js';
import { notify } from '../../services/infra/notifications.js';

function notifyMissingApp() {
  ui.notifications.error(game.i18n.localize('PF2E_VISIONER.NOTIFICATIONS.NO_SNEAK_DIALOG'));
}

function notifyMissingToken() {
  ui.notifications.error(game.i18n.localize('PF2E_VISIONER.NOTIFICATIONS.NO_TOKEN_ID'));
}

function findOutcome(app, tokenId) {
  return app.outcomes?.find?.((outcome) => outcome.token?.id === tokenId);
}

function getOriginalStoredOutcome(app, outcome) {
  try {
    const combatantId = turnSneakTracker._getCombatantId(app.sneakingToken);
    if (!combatantId) return null;

    const turnState = turnSneakTracker._turnSneakStates.get(combatantId);
    if (!turnState) return null;

    const observerId = outcome.token.document?.id || outcome.token.id;
    return turnState.deferredChecks.get(observerId)?.originalOutcome || null;
  } catch {
    return null;
  }
}

function updateUndeferredRow(target) {
  const row = target.closest('tr');
  const deferButton = row?.querySelector('[data-action="toggleDefer"]');
  if (deferButton) {
    deferButton.classList.remove('deferred', 'active');
    const icon = deferButton.querySelector('i');
    if (icon) icon.className = 'fas fa-hourglass-half';
    deferButton.title = 'Defer this check';
  }

  row?.classList.remove('row-deferred', 'deferred-row');
  row?.removeAttribute('data-deferred');
}

function removeTrackerDefer(app, outcome) {
  try {
    turnSneakTracker.removeDeferredCheck(app.sneakingToken, outcome.token);
  } catch {
    /* Tracker cleanup is best effort */
  }
}

function fallbackRecalculate(app) {
  try {
    app.outcomes = app._enrichOutcomes(app.outcomes);
  } catch {
    /* Fallback recalculation is best effort */
  }
}

function updateOutcomeAfterUndefer(app, outcome, tokenId, originalStoredOutcome) {
  try {
    if (!originalStoredOutcome) {
      fallbackRecalculate(app);
      return;
    }

    const positionTransition = app._getPositionTransitionForToken(outcome.token);
    const endQualifies = positionTransition
      ? app._endPositionQualifiesForSneak(outcome.token, positionTransition.endPosition)
      : false;
    const outcomeIndex = app.outcomes.findIndex((candidate) => candidate.token?.id === tokenId);
    if (outcomeIndex < 0) return;

    app.outcomes[outcomeIndex] = {
      ...app.outcomes[outcomeIndex],
      startQualifies: originalStoredOutcome.startQualifies,
      startCover: originalStoredOutcome.startCover,
      startVisibility: originalStoredOutcome.startVisibility,
      endQualifies,
      isDeferred: false,
    };
  } catch {
    fallbackRecalculate(app);
  }
}

async function renderUndeferUpdate(app) {
  try {
    await app.render(false, { force: true });
  } catch {
    /* Render refresh is best effort */
  }
}

export async function undeferSneakCheck(app, target) {
  if (!app) {
    notifyMissingApp();
    return;
  }

  const tokenId = target.dataset.tokenId;
  if (!tokenId) {
    notifyMissingToken();
    return;
  }

  const outcome = findOutcome(app, tokenId);
  if (!outcome) return;

  const isLocallyDeferred = app._deferredChecks.has(tokenId);
  const isTrackerDeferred = turnSneakTracker.isObserverDeferred(app.sneakingToken, outcome.token);
  if (!isLocallyDeferred && !isTrackerDeferred) return;

  if (isLocallyDeferred) app._deferredChecks.delete(tokenId);
  updateUndeferredRow(target);

  const originalStoredOutcome = getOriginalStoredOutcome(app, outcome);
  removeTrackerDefer(app, outcome);
  app._updateBulkDeferButton();
  app._updateEndTurnValidationButton();
  updateOutcomeAfterUndefer(app, outcome, tokenId, originalStoredOutcome);
  await renderUndeferUpdate(app);

  notify.info(`Undeferred check for ${outcome.token.name}`);
}
