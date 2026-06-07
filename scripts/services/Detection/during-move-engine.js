export const DURING_MOVE_RENDER_MODES = Object.freeze({
  CORE: 'core',
  SOUNDWAVE: 'soundwave',
  HARD_HIDE: 'hard-hide',
});

export const DETECTION_BLOCKING_STATES = new Set(['hidden', 'undetected', 'unnoticed']);
export const RENDER_HIDDEN_STATES = new Set(['undetected', 'unnoticed']);
export const CORE_LOS_STATES = new Set(['observed', 'concealed']);
const HIDDEN_RENDER_HIDDEN_ACTOR_TYPES = new Set(['hazard', 'loot']);

function normalizeState(state, fallback = 'observed') {
  return typeof state === 'string' && state ? state : fallback;
}

function targetTypeOf(targetTypeOrToken) {
  if (typeof targetTypeOrToken === 'string') return targetTypeOrToken.toLowerCase();
  return String(
    targetTypeOrToken?.actor?.type ??
      targetTypeOrToken?.document?.actor?.type ??
      targetTypeOrToken?.type ??
      '',
  ).toLowerCase();
}

export function stateBlocksDetection(state) {
  return DETECTION_BLOCKING_STATES.has(normalizeState(state, null));
}

export function stateHidesTargetRendering(state, targetTypeOrToken = null) {
  const normalized = normalizeState(state, null);
  if (RENDER_HIDDEN_STATES.has(normalized)) return true;
  return normalized === 'hidden' && HIDDEN_RENDER_HIDDEN_ACTOR_TYPES.has(targetTypeOf(targetTypeOrToken));
}

export function visualModeForVisibilityState(state, targetTypeOrToken = null) {
  const normalized = normalizeState(state);
  if (stateHidesTargetRendering(normalized, targetTypeOrToken)) {
    return DURING_MOVE_RENDER_MODES.HARD_HIDE;
  }
  if (normalized === 'hidden') return DURING_MOVE_RENDER_MODES.SOUNDWAVE;
  return DURING_MOVE_RENDER_MODES.CORE;
}

function currentLosSeesTarget(value) {
  return value === true;
}

function currentLosKnown(value) {
  return value === true || value === false;
}

function holdStateForLosTransition(fromState, toState, currentLosSees) {
  const from = normalizeState(fromState);
  const to = normalizeState(toState);
  if (from === to) return false;

  if (CORE_LOS_STATES.has(to) && stateBlocksDetection(from)) {
    return !currentLosSeesTarget(currentLosSees);
  }

  if (to === 'hidden' && CORE_LOS_STATES.has(from)) {
    return currentLosSeesTarget(currentLosSees);
  }

  if (RENDER_HIDDEN_STATES.has(to) && !RENDER_HIDDEN_STATES.has(from)) {
    return currentLosSeesTarget(currentLosSees);
  }

  if (stateHidesTargetRendering(from) !== stateHidesTargetRendering(to)) {
    return !currentLosKnown(currentLosSees);
  }

  return false;
}

function buildDecision({ visibilityState, renderMode, reason, usesObserverLos = false }) {
  return {
    visibilityState,
    renderMode,
    hardHide: renderMode === DURING_MOVE_RENDER_MODES.HARD_HIDE,
    soundwave: renderMode === DURING_MOVE_RENDER_MODES.SOUNDWAVE,
    usesObserverLos,
    reason,
  };
}

export function resolveDuringMoveDecision({
  storedState = 'observed',
  initialState = null,
  finalState = null,
  recentCompletedState = null,
  movementActive = false,
  movementCommitted = true,
  selectionBypass = false,
  noObserverGm = false,
  activeAvsOverride = false,
  activePreviewCanReveal = false,
  currentSightLineGraceCanYield = false,
  currentLosSeesTarget = null,
  invisible = false,
  targetType = null,
} = {}) {
  const stored = normalizeState(storedState);
  const fromState = normalizeState(initialState, stored);

  if (selectionBypass || noObserverGm) {
    return buildDecision({
      visibilityState: 'observed',
      renderMode: DURING_MOVE_RENDER_MODES.CORE,
      reason: selectionBypass ? 'selection-bypass' : 'no-observer-gm',
      usesObserverLos: false,
    });
  }

  if (activeAvsOverride && stateBlocksDetection(stored)) {
    return buildDecision({
      visibilityState: stored,
      renderMode: visualModeForVisibilityState(stored, targetType),
      reason: 'avs-override',
    });
  }

  if (!movementActive) {
    const state = recentCompletedState || stored;
    return buildDecision({
      visibilityState: state,
      renderMode: visualModeForVisibilityState(state, targetType),
      reason: recentCompletedState ? 'recent-completed' : 'stored-avs',
      usesObserverLos: false,
    });
  }

  if (!movementCommitted) {
    return buildDecision({
      visibilityState: stored,
      renderMode: visualModeForVisibilityState(stored, targetType),
      reason: 'preview-only',
      usesObserverLos: false,
    });
  }

  if (invisible && fromState === 'undetected') {
    return buildDecision({
      visibilityState: fromState,
      renderMode: DURING_MOVE_RENDER_MODES.HARD_HIDE,
      reason: 'invisible-undetected',
    });
  }

  if (activePreviewCanReveal || currentSightLineGraceCanYield) {
    return buildDecision({
      visibilityState: 'observed',
      renderMode: DURING_MOVE_RENDER_MODES.CORE,
      reason: activePreviewCanReveal ? 'preview-reveal' : 'sight-line-grace',
      usesObserverLos: true,
    });
  }

  const final = normalizeState(finalState, null);
  if (!final) {
    return buildDecision({
      visibilityState: stored,
      renderMode: visualModeForVisibilityState(stored, targetType),
      reason: 'no-final-state',
      usesObserverLos: false,
    });
  }

  const state = holdStateForLosTransition(fromState, final, currentLosSeesTarget)
    ? fromState
    : final;
  return buildDecision({
    visibilityState: state,
    renderMode: visualModeForVisibilityState(state, targetType),
    reason: state === final ? 'final-state' : 'live-los-transition',
    usesObserverLos: visualModeForVisibilityState(state, targetType) === DURING_MOVE_RENDER_MODES.CORE,
  });
}
