function isAvsExcludedOutcome(outcome) {
  if (outcome?._isLoot || outcome?._isHazard || outcome?._isWall) return true;

  const token = outcome?.target || outcome?.token;
  return token?.actor?.type === 'loot' || token?.actor?.type === 'hazard';
}

function dataAttributeSelector(name, value) {
  const raw = String(value ?? '');
  const escaped = globalThis.CSS?.escape
    ? globalThis.CSS.escape(raw)
    : raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `[${name}="${escaped}"]`;
}

export function filterSeekOverrideStatesForOutcome(states = [], outcome) {
  return isAvsExcludedOutcome(outcome) ? states.filter((state) => state.value !== 'avs') : states;
}

export function isOldSeekStateAvsControlled(app, outcome) {
  try {
    if (isAvsExcludedOutcome(outcome)) return false;

    const avsEnabled = game.settings.get('pf2e-visioner', 'autoVisibilityEnabled');
    if (!avsEnabled) return false;

    const target = outcome.target;
    if (!target) return false;

    const seekerToken = outcome.observerToken || outcome.observer || app.actorToken;
    if (!seekerToken) return false;

    const seekerId = seekerToken.document?.id || seekerToken.id;
    const flagKey = `avs-override-from-${seekerId}`;

    return !target.document?.getFlag('pf2e-visioner', flagKey);
  } catch {
    return false;
  }
}

export function isCurrentSeekStateAvsControlled(outcome, baseIsCurrentStateAvsControlled) {
  if (isAvsExcludedOutcome(outcome)) return false;
  return baseIsCurrentStateAvsControlled(outcome);
}

export function findSeekOverrideOutcome(app, { tokenId, wallId }) {
  return app.outcomes.find((outcome) => {
    if (wallId) return outcome._isWall && outcome.wallId === wallId;
    return app.getOutcomeTokenId(outcome) === tokenId;
  });
}

export function updateSeekIconSelection(app, identifier, selectedState, isWall = false) {
  const attribute = isWall ? 'data-wall-id' : 'data-token-id';
  const selector = dataAttributeSelector(attribute, identifier);
  const row = app.element.querySelector(selector)?.closest('tr');
  if (!row) return;

  row.querySelectorAll('.state-icon').forEach((icon) => {
    icon.classList.toggle('selected', icon.dataset.state === selectedState);
  });

  const hiddenInput = row.querySelector('input[type="hidden"]');
  if (hiddenInput) hiddenInput.value = selectedState || '';
}

export function applySeekOverrideState(app, target) {
  if (!app) return;

  const tokenId = target.dataset.target || target.dataset.tokenId;
  const wallId = target.dataset.wallId;
  const newState = target.dataset.state;

  if (!tokenId && !wallId) return;

  const outcome = findSeekOverrideOutcome(app, { tokenId, wallId });
  if (!outcome) return;

  outcome.overrideState = outcome.overrideState === newState ? null : newState;
  outcome.hasActionableChange = app.calculateHasActionableChange(outcome);

  const identifier = wallId || tokenId;
  app.updateIconSelection(identifier, outcome.overrideState, !!wallId);
  app.updateActionButtonsForToken(identifier, outcome.hasActionableChange, { isWall: !!wallId });
  app.updateChangesCount();
}
