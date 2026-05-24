import { shouldSuppressPendingMovementOcclusionUpdate } from '../PendingMovement/pending-movement-render-lock.js';

export function wrapCanvasPerceptionUpdate(wrapped, flags = {}, ...args) {
  if (shouldSuppressPendingMovementOcclusionUpdate(flags)) return undefined;

  return wrapped(flags, ...args);
}
