import {
  forcePendingMovementTokenInvisible,
  restorePendingMovementTokenRendering,
  shouldTemporarilyForceTokenInvisible,
} from './pending-token-movement.js';

export function wrapTokenRefreshVisibility(wrapped, ...args) {
  const result = wrapped(...args);
  try {
    if (shouldTemporarilyForceTokenInvisible(this)) {
      forcePendingMovementTokenInvisible(this);
    } else {
      restorePendingMovementTokenRendering(this);
    }
  } catch {
    /* keep Foundry visibility if guard fails */
  }
  return result;
}
