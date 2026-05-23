import {
  setPendingTokenMovementPosition,
} from './PendingMovement/pending-token-movement.js';

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
    getConditionManager = getDefaultConditionManager,
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

  recordPendingMovement(tokenDoc, changes, getControlledTokens(), {
    userId,
    hookOptions: options,
    predictFinalVisibility: true,
  });

  clearEstablishedInvisibleStatesForMovement(tokenDoc?.object, getConditionManager);
  return undefined;
}
