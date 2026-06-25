import { setPendingTokenMovementPosition } from './movement-tracking.js';
import { ensureDuringMoveSoundwaveRefresh } from './during-move-soundwave.js';

function hasPositionChange(changes) {
  return !!changes && ('x' in changes || 'y' in changes);
}

function getDefaultControlledTokens() {
  return globalThis.canvas?.tokens?.controlled || [];
}

function isDefaultAvsEnabled() {
  return globalThis.game?.settings?.get?.('pf2e-visioner', 'autoVisibilityEnabled') ?? false;
}

function isDefaultUserGm(userId) {
  return !!globalThis.game?.users?.get?.(userId)?.isGM;
}

function isDefaultCurrentUserGm() {
  return !!globalThis.game?.user?.isGM;
}

function notifyDefaultWarn(message) {
  return globalThis.ui?.notifications?.warn?.(message);
}

function getDefaultConditionManager() {
  return globalThis.game?.modules?.get?.('pf2e-visioner')?.api?.getConditionManager?.();
}

export function shouldBlockWaitingSneakMovement(
  tokenDoc,
  changes,
  userId,
  {
    isAvsEnabled = isDefaultAvsEnabled,
    isUserGm = isDefaultUserGm,
  } = {},
) {
  if (!hasPositionChange(changes)) return false;
  if (!isAvsEnabled()) return false;
  if (isUserGm(userId)) return false;

  const actor = tokenDoc?.actor;
  if (!actor) return false;

  const hasWaitingFlag = tokenDoc.getFlag?.('pf2e-visioner', 'waitingSneak');
  if (hasWaitingFlag) return true;

  const waitingEffect = actor.itemTypes?.effect?.find?.(
    (effect) => effect?.system?.slug === 'waiting-for-sneak-start',
  );
  return !!waitingEffect;
}

function isInvisibleToken(token) {
  return !!(
    token?.actor &&
    (token.actor.hasCondition?.('invisible') ||
      token.actor.system?.conditions?.invisible?.active ||
      token.actor.conditions?.has?.('invisible'))
  );
}

function clearEstablishedInvisibleStatesForMovement(token, getConditionManager) {
  if (!isInvisibleToken(token)) return;

  const conditionManager = getConditionManager?.();
  if (typeof conditionManager?.clearEstablishedInvisibleStates === 'function') {
    conditionManager.clearEstablishedInvisibleStates(token).catch(() => { });
  }
}

export function handlePreUpdateTokenMovement(
  tokenDoc,
  changes,
  options,
  userId,
  {
    isAvsEnabled = isDefaultAvsEnabled,
    isUserGm = isDefaultUserGm,
    notifyWarn = notifyDefaultWarn,
    getControlledTokens = getDefaultControlledTokens,
    setPendingTokenMovementPosition: recordPendingMovement = setPendingTokenMovementPosition,
    startDuringMoveSoundwaves = ensureDuringMoveSoundwaveRefresh,
    getConditionManager = getDefaultConditionManager,
    isCurrentUserGm = isDefaultCurrentUserGm,
  } = {},
) {
  if (!hasPositionChange(changes)) return undefined;

  if (
    shouldBlockWaitingSneakMovement(tokenDoc, changes, userId, {
      isAvsEnabled,
      isUserGm,
    })
  ) {
    notifyWarn('You cannot move until Sneak has started.');
    return false;
  }

  // Freeze+settle contract: record the move so `_canDetect` becomes move-aware
  // (core drives live rendering); start the live soundwave loop. No per-frame
  // visioner visibility recompute — the persisted state re-derives at move-end.
  const movementRecorded = recordPendingMovement(tokenDoc, changes, getControlledTokens(), {
    userId,
    hookOptions: options,
  });

  if (movementRecorded) {
    try {
      startDuringMoveSoundwaves();
    } catch {
      /* never block the move */
    }
  }

  if (isCurrentUserGm()) {
    clearEstablishedInvisibleStatesForMovement(tokenDoc?.object, getConditionManager);
  }
  return undefined;
}
