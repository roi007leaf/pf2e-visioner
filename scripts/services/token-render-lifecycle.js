import {
  hasPendingMovementRenderWork as defaultHasPendingMovementRenderWork,
  refreshPendingMovementTokenVisibility as defaultRefreshPendingMovementTokenVisibility,
  schedulePendingTokenMovementCompletion as defaultSchedulePendingTokenMovementCompletion,
} from './pending-token-movement.js';
import { isRefreshTokenProcessingSuppressed as defaultIsRefreshTokenProcessingSuppressed } from './runtime-state.js';
import {
  refreshSystemHiddenHighlightsForMovedToken as defaultRefreshSystemHiddenHighlightsForMovedToken,
  refreshSystemHiddenHighlightsForControlledTokens as defaultRefreshSystemHiddenHighlightsForControlledTokens,
  refreshSystemHiddenHighlightsForRenderedToken as defaultRefreshSystemHiddenHighlightsForRenderedToken,
} from './system-hidden-token-highlights.js';
import { handlePreUpdateTokenMovement as defaultHandlePreUpdateTokenMovement } from './token-movement-preupdate.js';

function hasPositionChange(changes) {
  return !!changes && ('x' in changes || 'y' in changes);
}

export function handleTokenPreUpdate(
  tokenDoc,
  changes,
  options,
  userId,
  {
    handlePreUpdateTokenMovement = defaultHandlePreUpdateTokenMovement,
    warn = console.warn,
  } = {},
) {
  try {
    const result = handlePreUpdateTokenMovement(tokenDoc, changes, options, userId);
    if (result === false) return false;
  } catch (error) {
    warn('PF2E Visioner | preUpdateToken hook failed:', error);
  }

  return undefined;
}

export async function handleTokenUpdated(
  tokenDoc,
  changes,
  {
    schedulePendingTokenMovementCompletion = defaultSchedulePendingTokenMovementCompletion,
    refreshSystemHiddenHighlightsForMovedToken = defaultRefreshSystemHiddenHighlightsForMovedToken,
    warn = console.warn,
  } = {},
) {
  try {
    if (!hasPositionChange(changes)) {
      return { handled: false, reason: 'not-position' };
    }

    try {
      schedulePendingTokenMovementCompletion(tokenDoc);
    } catch {
      /* best effort */
    }

    await refreshSystemHiddenHighlightsForMovedToken(tokenDoc, changes);
    return { handled: true };
  } catch (error) {
    warn('PF2E Visioner | updateToken hook failed:', error);
    return { handled: false, reason: 'error' };
  }
}

export async function handleTokenRefreshed(
  token,
  {
    isRefreshTokenProcessingSuppressed = defaultIsRefreshTokenProcessingSuppressed,
    refreshSystemHiddenHighlightsForRenderedToken =
      defaultRefreshSystemHiddenHighlightsForRenderedToken,
    warn = console.warn,
  } = {},
) {
  if (isRefreshTokenProcessingSuppressed()) {
    return { handled: false, reason: 'suppressed' };
  }

  try {
    await refreshSystemHiddenHighlightsForRenderedToken(token);
    return { handled: true };
  } catch (error) {
    warn('PF2E Visioner | refreshToken hook for lifesense indicators failed:', error);
    return { handled: false, reason: 'error' };
  }
}

export async function handleAvsBatchCompleteRefresh({
  hasPendingMovementRenderWork = defaultHasPendingMovementRenderWork,
  refreshPendingMovementTokenVisibility = defaultRefreshPendingMovementTokenVisibility,
  refreshSystemHiddenHighlightsForControlledTokens =
    defaultRefreshSystemHiddenHighlightsForControlledTokens,
} = {}) {
  try {
    if (!hasPendingMovementRenderWork()) {
      return { handled: false, reason: 'no-pending-work' };
    }

    refreshPendingMovementTokenVisibility([], { ignoreObservedGrace: true });
    await refreshSystemHiddenHighlightsForControlledTokens();
    return { handled: true };
  } catch {
    return { handled: false, reason: 'error' };
  }
}
