import {
  hasActivePendingTokenMovement as defaultHasActivePendingTokenMovement,
  schedulePendingTokenMovementCompletion as defaultSchedulePendingTokenMovementCompletion,
} from './movement-tracking.js';
import { isRefreshTokenProcessingSuppressed as defaultIsRefreshTokenProcessingSuppressed } from './runtime-state.js';
import {
  getMatchingControlledTokenForRefresh,
  refreshSystemHiddenHighlightsForMovedToken as defaultRefreshSystemHiddenHighlightsForMovedToken,
  refreshSystemHiddenHighlightsForControlledTokens as defaultRefreshSystemHiddenHighlightsForControlledTokens,
  refreshSystemHiddenHighlightsForRenderedToken as defaultRefreshSystemHiddenHighlightsForRenderedToken,
  removeSystemHiddenIndicatorsForObservedTargets as defaultRemoveSystemHiddenIndicatorsForObservedTargets,
} from './system-hidden-token-highlights.js';
import { handlePreUpdateTokenMovement as defaultHandlePreUpdateTokenMovement } from './token-movement-preupdate.js';

function hasPositionChange(changes) {
  return !!changes && ('x' in changes || 'y' in changes);
}

const RENDERED_TOKEN_HIGHLIGHT_REFRESH_MIN_INTERVAL_MS = 100;
const renderedTokenHighlightRefreshTimes = new Map();

function getDefaultControlledTokens() {
  return globalThis.canvas?.tokens?.controlled || [];
}

function tokenIdForRefresh(token) {
  return token?.document?.id ?? token?.id ?? null;
}

export function shouldRefreshRenderedTokenHighlights(
  token,
  controlledTokens = getDefaultControlledTokens(),
) {
  return !!getMatchingControlledTokenForRefresh(token, controlledTokens);
}

export function resetRenderedTokenHighlightRefreshThrottle() {
  renderedTokenHighlightRefreshTimes.clear();
}

export function shouldThrottleRenderedTokenHighlightRefresh(
  token,
  { now = Date.now, minIntervalMs = RENDERED_TOKEN_HIGHLIGHT_REFRESH_MIN_INTERVAL_MS } = {},
) {
  const tokenId = tokenIdForRefresh(token);
  if (!tokenId) return false;

  const currentTime = now();
  const lastRefreshTime = renderedTokenHighlightRefreshTimes.get(tokenId);
  if (lastRefreshTime !== undefined && currentTime - lastRefreshTime < minIntervalMs) {
    return true;
  }

  renderedTokenHighlightRefreshTimes.set(tokenId, currentTime);
  return false;
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
    hasActivePendingTokenMovement = defaultHasActivePendingTokenMovement,
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

    if (!hasActivePendingTokenMovement()) {
      await refreshSystemHiddenHighlightsForMovedToken(tokenDoc, changes);
    }
    return { handled: true };
  } catch (error) {
    warn('PF2E Visioner | updateToken hook failed:', error);
    return { handled: false, reason: 'error' };
  }
}

export function handleTokenRefreshed(
  token,
  {
    isRefreshTokenProcessingSuppressed = defaultIsRefreshTokenProcessingSuppressed,
    shouldRefreshRenderedTokenHighlights: shouldRefreshRenderedTokenHighlightsForToken =
    shouldRefreshRenderedTokenHighlights,
    shouldThrottleRenderedTokenHighlightRefresh: shouldThrottleRenderedTokenHighlightRefreshForToken =
    shouldThrottleRenderedTokenHighlightRefresh,
    refreshSystemHiddenHighlightsForRenderedToken =
    defaultRefreshSystemHiddenHighlightsForRenderedToken,
    warn = console.warn,
  } = {},
) {
  if (isRefreshTokenProcessingSuppressed()) {
    return { handled: false, reason: 'suppressed' };
  }

  if (!shouldRefreshRenderedTokenHighlightsForToken(token)) {
    return { handled: false, reason: 'not-controlled' };
  }

  if (shouldThrottleRenderedTokenHighlightRefreshForToken(token)) {
    return { handled: false, reason: 'throttled' };
  }

  return Promise.resolve(refreshSystemHiddenHighlightsForRenderedToken(token))
    .then(() => ({ handled: true }))
    .catch((error) => {
      warn('PF2E Visioner | refreshToken hook for lifesense indicators failed:', error);
      return { handled: false, reason: 'error' };
    });
}

export async function handleAvsBatchCompleteRefresh({
  refreshSystemHiddenHighlightsForControlledTokens =
  defaultRefreshSystemHiddenHighlightsForControlledTokens,
  removeSystemHiddenIndicatorsForObservedTargets =
  defaultRemoveSystemHiddenIndicatorsForObservedTargets,
} = {}) {
  try {
    await refreshSystemHiddenHighlightsForControlledTokens();
    await removeSystemHiddenIndicatorsForObservedTargets();
    return { handled: true };
  } catch {
    return { handled: false, reason: 'error' };
  }
}
