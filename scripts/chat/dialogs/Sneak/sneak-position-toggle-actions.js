import turnSneakTracker from '../../services/TurnSneakTracker.js';
import { notify } from '../../services/infra/notifications.js';

function findOutcome(app, tokenId) {
  return app.outcomes?.find?.((outcome) => outcome.token?.id === tokenId);
}

function getPosition(outcome, positionType) {
  return positionType === 'start'
    ? outcome.positionDisplay?.startPosition
    : outcome.positionDisplay?.endPosition;
}

function isCurrentlyDeferred(app, outcome) {
  return (
    app._deferredChecks?.has(outcome.token.id) ||
    turnSneakTracker?.isObserverDeferred?.(app.sneakingToken, outcome.token)
  );
}

function updatePositionButtonState(target, positionType, qualifies) {
  const icon = target.querySelector('i');
  if (qualifies) {
    target.className = 'position-requirement-btn position-check active';
    if (icon) icon.className = 'fas fa-check';
    target.setAttribute('data-tooltip', `${positionType} position qualifies for sneak`);
    return;
  }

  target.className = 'position-requirement-btn position-x';
  if (icon) icon.className = 'fas fa-times';
  target.setAttribute('data-tooltip', `${positionType} position does not qualify for sneak`);
}

function updateAutoUndeferredRow(target) {
  const row = target.closest('tr');
  const deferButton = row?.querySelector('[data-action="toggleDefer"]');
  if (deferButton) {
    deferButton.classList.remove('deferred', 'active');
    const icon = deferButton.querySelector('i');
    if (icon) icon.className = 'fas fa-hourglass';
    deferButton.title = 'Defer this check';
    deferButton.disabled = false;
  }

  row?.classList.remove('row-deferred', 'deferred-row');
  row?.removeAttribute('data-deferred');
}

function notifyAutoUndeferFallback(outcome, positionType, qualifies) {
  notify.info(
    `${outcome.token.name} ${positionType} position ${
      qualifies ? 'now qualifies' : 'no longer qualifies'
    } for sneak`,
  );
}

function autoUndeferQualifiedEndPosition(app, target, outcome, positionType, wasDeferred) {
  if (positionType !== 'end') return;
  if (!outcome.positionDisplay?.endPosition?.qualifies || !wasDeferred) return;

  try {
    app._deferredChecks?.delete(outcome.token.id);
    turnSneakTracker.removeDeferredCheck(app.sneakingToken, outcome.token);
    updateAutoUndeferredRow(target);
    outcome.isDeferred = false;
    app._updateBulkDeferButton();
    app._updateEndTurnValidationButton();
  } catch {
    notifyAutoUndeferFallback(outcome, positionType, outcome.positionDisplay.endPosition.qualifies);
  }
}

export async function toggleSneakPosition(app, target, positionType) {
  if (!app) return;

  const tokenId = target.dataset.tokenId;
  if (!tokenId) return;

  const outcome = findOutcome(app, tokenId);
  if (!outcome?.hasPositionData) return;

  const position = getPosition(outcome, positionType);
  if (!position) return;

  position.qualifies = !position.qualifies;

  const wasDeferred = isCurrentlyDeferred(app, outcome);
  if (outcome._featPositionOverride && !wasDeferred) delete outcome._featPositionOverride;

  updatePositionButtonState(target, positionType, position.qualifies);

  await app._recalculateNewVisibilityForOutcome(outcome);
  app._recalculateDeferEligibility(outcome);
  autoUndeferQualifiedEndPosition(app, target, outcome, positionType, wasDeferred);
}
