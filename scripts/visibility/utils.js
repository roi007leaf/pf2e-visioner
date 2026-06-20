import { MODULE_ID } from '../constants.js';

export const LOG_PREFIX = `[${MODULE_ID}] Ephemeral`;

const locks = new WeakMap();
const keyedLocks = new Map();
const embeddedItemDeleteStates = new WeakMap();
const keyedEmbeddedItemDeleteStates = new Map();
const RECENTLY_DELETED_ITEM_TTL_MS = 5000;

export function isMissingEmbeddedDocumentError(error) {
  return /\b(Item|Actor|Token|Effect) "[^"]+" does not exist!/.test(String(error?.message ?? error));
}

function actorDocumentKey(actor) {
  return actor?.uuid || actor?.document?.uuid || null;
}

function getActorLock(actor) {
  const key = actorDocumentKey(actor);
  if (key) return { key, previous: keyedLocks.get(key) || Promise.resolve() };
  return { key: null, previous: locks.get(actor) || Promise.resolve() };
}

function setActorLock(actor, key, lock) {
  const stored = lock.catch(() => {});
  if (key) {
    keyedLocks.set(key, stored);
    stored.finally(() => {
      if (keyedLocks.get(key) === stored) keyedLocks.delete(key);
    });
    return;
  }
  locks.set(actor, stored);
}

export async function runWithEffectLock(actor, taskFn) {
  if (!actor) return taskFn();
  const { key, previous: prev } = getActorLock(actor);
  const next = prev.then(async () => {
    try {
      return await taskFn();
    } catch (e) {
      if (!isMissingEmbeddedDocumentError(e)) {
        console.warn(`${LOG_PREFIX}: task error`, e);
      }
      return null;
    }
  });
  setActorLock(actor, key, next);
  return next;
}

function getDeleteState(actor) {
  const key = actorDocumentKey(actor);
  if (key) {
    let state = keyedEmbeddedItemDeleteStates.get(key);
    if (!state) {
      state = { key, pending: new Set(), recentlyDeleted: new Map() };
      keyedEmbeddedItemDeleteStates.set(key, state);
    }
    return state;
  }

  let state = embeddedItemDeleteStates.get(actor);
  if (!state) {
    state = { key: null, pending: new Set(), recentlyDeleted: new Map() };
    embeddedItemDeleteStates.set(actor, state);
  }
  return state;
}

function pruneRecentDeletes(state, now = Date.now()) {
  for (const [id, expiresAt] of state.recentlyDeleted) {
    if (expiresAt <= now) state.recentlyDeleted.delete(id);
  }
}

function rememberDeletedItems(state, ids, now = Date.now()) {
  for (const id of ids) {
    state.recentlyDeleted.set(id, now + RECENTLY_DELETED_ITEM_TTL_MS);
  }
}

export async function deleteExistingEmbeddedItems(actor, ids = []) {
  if (!actor?.deleteEmbeddedDocuments) return [];
  if (!globalThis.game?.user?.isGM) return [];

  const uniqueIds = [...new Set(ids.filter(Boolean))];
  const deleteState = getDeleteState(actor);
  pruneRecentDeletes(deleteState);
  const existingIds =
    typeof actor.items?.get === 'function'
      ? uniqueIds.filter(
          (id) =>
            !deleteState.pending.has(id) &&
            !deleteState.recentlyDeleted.has(id) &&
            !!actor.items.get(id),
        )
      : uniqueIds.filter(
          (id) => !deleteState.pending.has(id) && !deleteState.recentlyDeleted.has(id),
        );
  if (!existingIds.length) return [];

  for (const id of existingIds) deleteState.pending.add(id);
  let didDelete = false;
  try {
    await actor.deleteEmbeddedDocuments('Item', existingIds);
    didDelete = true;
  } catch (error) {
    if (!isMissingEmbeddedDocumentError(error)) throw error;
    didDelete = true;
  } finally {
    for (const id of existingIds) deleteState.pending.delete(id);
    if (didDelete) rememberDeletedItems(deleteState, existingIds);
  }
  return existingIds;
}
