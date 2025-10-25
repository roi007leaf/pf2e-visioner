import { MODULE_ID } from '../constants.js';

export const LOG_PREFIX = `[${MODULE_ID}] Ephemeral`;

const locks = new WeakMap();
const deferredUpdates = new WeakMap();

export async function runWithEffectLock(actor, taskFn) {
  if (!actor) return taskFn();
  const prev = locks.get(actor) || Promise.resolve();
  const next = prev.then(async () => {
    try {
      return await taskFn();
    } catch (e) {
      console.warn(`${LOG_PREFIX}: task error`, e);
      return null;
    }
  });
  locks.set(
    actor,
    next.catch(() => {}),
  );
  return next;
}

/**
 * Defer non-critical effect updates to prevent FPS drops
 * @param {Actor} actor - The actor to defer updates for
 * @param {Function} updateFn - The update function to defer
 * @param {number} delay - Delay in milliseconds (default: 100ms)
 */
export function deferEffectUpdate(actor, updateFn, delay = 100) {
  if (!actor) return;
  
  // Clear any existing deferred update for this actor
  const existingTimeout = deferredUpdates.get(actor);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }
  
  // Schedule new deferred update
  const timeoutId = setTimeout(async () => {
    try {
      await runWithEffectLock(actor, updateFn);
    } catch (error) {
      console.warn(`${LOG_PREFIX}: Deferred update error`, error);
    } finally {
      deferredUpdates.delete(actor);
    }
  }, delay);
  
  deferredUpdates.set(actor, timeoutId);
}
