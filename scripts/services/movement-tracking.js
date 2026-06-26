const PENDING_MOVEMENT_TTL_MS = 2500;
const PENDING_MOVEMENT_ANIMATION_DETECTION_DELAY_MS = 50;
const PENDING_MOVEMENT_ANIMATION_DETECTION_SETTLE_MS = 250;
const PENDING_MOVEMENT_VISUAL_POSITION_TOLERANCE_PX = 1;

const pendingTokenMovementPositions = new Map();
const pendingTokenMovementCompletionTimeouts = new Map();
let pendingMovementSerial = 0;

function tokenIdOf(tokenOrDoc) {
  return tokenOrDoc?.document?.id || tokenOrDoc?.id || null;
}

function tokenObjectForId(tokenId) {
  if (!tokenId) return null;
  return (
    canvas?.tokens?.get?.(tokenId) ||
    canvas?.tokens?.placeables?.find?.((token) => tokenIdOf(token) === tokenId) ||
    null
  );
}

function finiteCoordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function tokenVisualPositionReached(token, position) {
  if (!token || !position) return true;

  const tokenX = finiteCoordinate(token.x ?? token.document?.x);
  const tokenY = finiteCoordinate(token.y ?? token.document?.y);
  const positionX = finiteCoordinate(position.x);
  const positionY = finiteCoordinate(position.y);
  if (tokenX === null || tokenY === null || positionX === null || positionY === null) return true;

  return (
    Math.abs(tokenX - positionX) <= PENDING_MOVEMENT_VISUAL_POSITION_TOLERANCE_PX &&
    Math.abs(tokenY - positionY) <= PENDING_MOVEMENT_VISUAL_POSITION_TOLERANCE_PX
  );
}

function movementAnimationIsRunning(animation) {
  if (!animation || animation.state === 'completed') return false;
  if (typeof animation === 'object' && Object.keys(animation).length === 0) return true;
  return !!animation.promise || !!animation.active || animation.state !== undefined;
}

function tokenIsAnimating(token) {
  if (!token) return false;
  if (token.animation && typeof token.animation === 'object') {
    if (movementAnimationIsRunning(token.animation)) return true;
  }
  return movementAnimationIsRunning(token._animation);
}

function isControlledTokenDocument(tokenDoc, controlledTokens = canvas?.tokens?.controlled || []) {
  const tokenId = tokenIdOf(tokenDoc);
  if (!tokenId) return false;

  return controlledTokens.some((token) => tokenIdOf(token) === tokenId);
}

function currentUserOwnsMovedToken(tokenDoc, userId = null) {
  const currentUser = game?.user;
  if (!tokenDoc || !currentUser || currentUser.isGM) return false;
  if (userId && userId !== currentUser.id) return false;

  try {
    if (tokenDoc.testUserPermission?.(currentUser, 'OWNER')) return true;
  } catch {
    /* fall through to local ownership hints */
  }

  const ownerLevel = Number(globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3);
  const ownershipValue = Number(
    tokenDoc.ownership?.[currentUser.id] ?? tokenDoc.actor?.ownership?.[currentUser.id],
  );
  return (
    tokenDoc.isOwner === true ||
    tokenDoc.object?.isOwner === true ||
    tokenDoc.actor?.isOwner === true ||
    (Number.isFinite(ownershipValue) && ownershipValue >= ownerLevel)
  );
}

function currentGmMovedToken(tokenDoc, userId = null) {
  const currentUser = game?.user;
  if (!tokenDoc || !currentUser?.isGM) return false;
  if (!userId || userId !== currentUser.id) return false;
  return true;
}

function getPendingMovementTrackingReason(tokenDoc, controlledTokens, options = {}) {
  if (isControlledTokenDocument(tokenDoc, controlledTokens)) return 'controlled-token';
  if (currentGmMovedToken(tokenDoc, options.userId)) return 'gm-token';
  if (currentUserOwnsMovedToken(tokenDoc, options.userId)) return 'player-owned-token';
  return null;
}

function syncActivePendingMovementGlobalFlag() {
  globalThis.__pf2eVisionerHasActivePendingTokenMovement = pendingTokenMovementPositions.size > 0;
}

function cleanupExpiredPendingMovements(now = Date.now()) {
  let removedExpiredMovement = false;
  for (const [tokenId, entry] of pendingTokenMovementPositions.entries()) {
    if (!entry || entry.expiresAt <= now) {
      pendingTokenMovementPositions.delete(tokenId);
      removedExpiredMovement = true;
    }
  }
  if (removedExpiredMovement) syncActivePendingMovementGlobalFlag();
}

export function hasActivePendingTokenMovement() {
  cleanupExpiredPendingMovements();
  return pendingTokenMovementPositions.size > 0;
}

export function hasPendingTokenMovementPosition(tokenOrId) {
  const tokenId = typeof tokenOrId === 'string' ? tokenOrId : tokenIdOf(tokenOrId);
  if (!tokenId) return false;
  cleanupExpiredPendingMovements();
  return pendingTokenMovementPositions.has(tokenId);
}

export function getPendingTokenMovementPosition(tokenOrId) {
  const tokenId = typeof tokenOrId === 'string' ? tokenOrId : tokenIdOf(tokenOrId);
  if (!tokenId) return null;
  const entry = pendingTokenMovementPositions.get(tokenId);
  return entry?.position ?? null;
}

export function clearPendingTokenMovementPosition(tokenId) {
  if (!tokenId) return;

  const completionTimeoutId = pendingTokenMovementCompletionTimeouts.get(tokenId);
  if (completionTimeoutId) {
    clearTimeout(completionTimeoutId);
    pendingTokenMovementCompletionTimeouts.delete(tokenId);
  }

  const entry = pendingTokenMovementPositions.get(tokenId);
  if (entry?.timeoutId) {
    clearTimeout(entry.timeoutId);
  }
  pendingTokenMovementPositions.delete(tokenId);
  syncActivePendingMovementGlobalFlag();
}

export function setPendingTokenMovementPosition(
  tokenDoc,
  changes = {},
  controlledTokens = canvas?.tokens?.controlled || [],
  options = {},
) {
  const tokenId = tokenIdOf(tokenDoc);
  if (!tokenId || !('x' in changes || 'y' in changes)) return false;
  const trackingReason = getPendingMovementTrackingReason(tokenDoc, controlledTokens, options);
  if (!trackingReason) {
    return false;
  }

  const serial = ++pendingMovementSerial;
  const position = {
    x: changes.x ?? tokenDoc?.x ?? tokenDoc?.document?.x ?? 0,
    y: changes.y ?? tokenDoc?.y ?? tokenDoc?.document?.y ?? 0,
  };

  clearPendingTokenMovementPosition(tokenId);

  const timeoutId = setTimeout(() => {
    completePendingTokenMovement(tokenId, serial);
  }, PENDING_MOVEMENT_TTL_MS);

  pendingTokenMovementPositions.set(tokenId, {
    tokenDoc,
    position,
    serial,
    expiresAt: Date.now() + PENDING_MOVEMENT_TTL_MS,
    timeoutId,
  });
  syncActivePendingMovementGlobalFlag();

  return true;
}

export function completePendingTokenMovement(tokenOrId, expectedSerial = null) {
  const tokenId = typeof tokenOrId === 'string' ? tokenOrId : tokenIdOf(tokenOrId);
  if (!tokenId) return false;

  const entry = pendingTokenMovementPositions.get(tokenId);
  if (!entry) {
    return false;
  }
  if (expectedSerial !== null && entry.serial !== expectedSerial) {
    return false;
  }

  clearPendingTokenMovementPosition(tokenId);
  try {
    const completedTokenDoc = tokenObjectForId(tokenId)?.document ?? entry.tokenDoc ?? null;
    Hooks.callAll('pf2e-visioner.pendingTokenMovementComplete', {
      tokenId,
      tokenDoc: completedTokenDoc,
      movementChanges: {
        x: entry.position?.x,
        y: entry.position?.y,
      },
    });
  } catch {
    /* best-effort AVS movement completion notification */
  }

  return true;
}

export function schedulePendingTokenMovementCompletion(tokenDoc) {
  const tokenId = tokenIdOf(tokenDoc);
  if (!tokenId) return false;

  const entry = pendingTokenMovementPositions.get(tokenId);
  if (!entry) return false;

  const completionTimeoutId = pendingTokenMovementCompletionTimeouts.get(tokenId);
  if (completionTimeoutId) {
    clearTimeout(completionTimeoutId);
    pendingTokenMovementCompletionTimeouts.delete(tokenId);
  }

  const serial = entry.serial;
  const startedAt = Date.now();
  const complete = () => completePendingTokenMovement(tokenId, serial);
  const initialToken = tokenDoc?.object || tokenObjectForId(tokenId);
  const initialAnimation = initialToken?._animation;
  const watchedAnimationPromises = new Set();

  function scheduleCompletionCheck(delayMs = 0) {
    const existingTimeoutId = pendingTokenMovementCompletionTimeouts.get(tokenId);
    if (existingTimeoutId) clearTimeout(existingTimeoutId);
    const timeoutId = setTimeout(waitForAnimationOrComplete, Math.max(0, Number(delayMs) || 0));
    pendingTokenMovementCompletionTimeouts.set(tokenId, timeoutId);
  }

  const waitForAnimationOrComplete = () => {
    pendingTokenMovementCompletionTimeouts.delete(tokenId);
    const currentEntry = pendingTokenMovementPositions.get(tokenId);
    if (!currentEntry || currentEntry.serial !== serial) {
      return;
    }

    const token = tokenDoc?.object || tokenObjectForId(tokenId);
    const deferredAnimation = token?._animation;
    const elapsedMs = Date.now() - startedAt;

    if (
      deferredAnimation?.promise &&
      movementAnimationIsRunning(deferredAnimation) &&
      !watchedAnimationPromises.has(deferredAnimation.promise)
    ) {
      watchedAnimationPromises.add(deferredAnimation.promise);
      deferredAnimation.promise.finally(() => scheduleCompletionCheck(0));
      return;
    }
    if (
      (movementAnimationIsRunning(deferredAnimation) || tokenIsAnimating(token)) &&
      elapsedMs < PENDING_MOVEMENT_TTL_MS
    ) {
      const timeoutId = setTimeout(
        waitForAnimationOrComplete,
        PENDING_MOVEMENT_ANIMATION_DETECTION_DELAY_MS,
      );
      pendingTokenMovementCompletionTimeouts.set(tokenId, timeoutId);
      return;
    }

    const visualPositionReached = tokenVisualPositionReached(token, currentEntry.position);
    if (
      elapsedMs >= PENDING_MOVEMENT_ANIMATION_DETECTION_SETTLE_MS &&
      !visualPositionReached &&
      elapsedMs < PENDING_MOVEMENT_TTL_MS
    ) {
      const timeoutId = setTimeout(
        waitForAnimationOrComplete,
        PENDING_MOVEMENT_ANIMATION_DETECTION_DELAY_MS,
      );
      pendingTokenMovementCompletionTimeouts.set(tokenId, timeoutId);
      return;
    }

    if (elapsedMs < PENDING_MOVEMENT_ANIMATION_DETECTION_SETTLE_MS) {
      const timeoutId = setTimeout(
        waitForAnimationOrComplete,
        PENDING_MOVEMENT_ANIMATION_DETECTION_DELAY_MS,
      );
      pendingTokenMovementCompletionTimeouts.set(tokenId, timeoutId);
      return;
    }

    complete();
  };

  if (initialAnimation?.promise && movementAnimationIsRunning(initialAnimation)) {
    watchedAnimationPromises.add(initialAnimation.promise);
    initialAnimation.promise.finally(() => scheduleCompletionCheck(0));
    return true;
  }

  scheduleCompletionCheck(PENDING_MOVEMENT_ANIMATION_DETECTION_DELAY_MS);
  return true;
}
