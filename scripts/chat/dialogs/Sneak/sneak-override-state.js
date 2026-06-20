import { overrideToDisplayVisibility } from '../../../visibility/perception-profile.js';
import {
  calculateSneakOutcomeActionability,
  collectSneakerOverrideFlagsByObserverId,
} from './sneak-outcome-context.js';

function dataAttributeSelector(name, value) {
  const raw = String(value ?? '');
  const escaped = globalThis.CSS?.escape
    ? globalThis.CSS.escape(raw)
    : raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `[${name}="${escaped}"]`;
}

function findOutcomeByTokenId(app, tokenId) {
  return app.outcomes?.find?.((outcome) => String(app.getOutcomeTokenId(outcome)) === String(tokenId));
}

function resolveOverrideAwareOldVisibility(app, outcome) {
  let currentVisibility =
    app.getVisibilityBetween?.(outcome.token, app.sneakingToken) ||
    outcome.oldVisibility ||
    outcome.currentVisibility;
  const observerId = outcome.token?.document?.id || outcome.token?.id;
  const overrideFlag = collectSneakerOverrideFlagsByObserverId(app).get(observerId);
  const overrideVisibility = overrideFlag ? overrideToDisplayVisibility(overrideFlag) : null;

  return outcome.oldVisibility || overrideVisibility || currentVisibility;
}

export function applySneakOverrideState(app, target) {
  if (!app) return;

  const tokenId = target.dataset.target || target.dataset.tokenId;
  const newState = target.dataset.state;
  if (!tokenId) return;

  const outcome = findOutcomeByTokenId(app, tokenId);
  if (!outcome) return;

  outcome.overrideState = outcome.overrideState === newState ? null : newState;

  const baseOldState = resolveOverrideAwareOldVisibility(app, outcome);
  const effectiveNewState = outcome.overrideState || outcome.newVisibility;
  const isOldStateAvsControlled = app.isOldStateAvsControlled(outcome);
  const hasActionableChange = calculateSneakOutcomeActionability(app, outcome, {
    effectiveNewState,
    baseOldState,
    isOldStateAvsControlled,
  });

  outcome.hasActionableChange = hasActionableChange;
  app.updateIconSelection(tokenId, outcome.overrideState, false);
  app.updateActionButtonsForToken(tokenId, hasActionableChange, { row: target.closest('tr') });
  app.updateChangesCount();
}

export function updateSneakIconSelection(app, identifier, selectedState, isWall = false) {
  const attribute = isWall ? 'data-wall-id' : 'data-token-id';
  const row = app.element.querySelector(dataAttributeSelector(attribute, identifier))?.closest('tr');
  if (!row) return;

  row.querySelectorAll('.state-icon').forEach((icon) => {
    icon.classList.toggle('selected', icon.dataset.state === selectedState);
  });

  const hiddenInput = row.querySelector('input[type="hidden"]');
  if (hiddenInput) hiddenInput.value = selectedState || '';
}

function calculateIconClickActionability(app, outcome, newState) {
  const oldState = outcome.oldVisibility ?? outcome.currentVisibility ?? null;
  const isOldStateAvsControlled = app.isOldStateAvsControlled(outcome);
  const statesMatch = oldState != null && newState != null && newState === oldState;

  return (
    (oldState != null && newState != null && newState !== oldState) ||
    (statesMatch && isOldStateAvsControlled)
  );
}

export function addSneakIconClickHandlers(app) {
  if (!app?.element || app.element.dataset.sneakStateIconDelegated === 'true') return;
  app.element.dataset.sneakStateIconDelegated = 'true';
  app.element.addEventListener('click', (event) => {
    const icon = event.target?.closest?.('.state-icon');
    if (!icon || !app.element?.contains?.(icon)) return;

    const overrideIcons = icon.closest('.override-icons');
    if (!overrideIcons) return;

    let targetId = icon.dataset.target || icon.dataset.tokenId;
    if (!targetId) {
      const row = icon.closest('tr[data-token-id]');
      targetId = row?.dataset?.tokenId;
    }

    const newState = icon.dataset.state;
    overrideIcons
      .querySelectorAll('.state-icon')
      .forEach((candidate) => candidate.classList.remove('selected'));
    icon.classList.add('selected');

    const hiddenInput = overrideIcons?.querySelector('input[type="hidden"]');
    if (hiddenInput) hiddenInput.value = newState;

    const outcome = findOutcomeByTokenId(app, targetId);
    if (!outcome) return;

    outcome.overrideState = newState;
    outcome.hasActionableChange = calculateIconClickActionability(app, outcome, newState);

    try {
      app.updateActionButtonsForToken(targetId || null, outcome.hasActionableChange, {
        row: icon.closest('tr'),
      });
    } catch { }
  });
}
