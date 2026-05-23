import { MODULE_ID } from '../constants.js';

export const LOG_PREFIX = `[${MODULE_ID}] Ephemeral`;

const locks = new WeakMap();
const pendingEmbeddedItemDeletes = new WeakMap();

export function isMissingEmbeddedDocumentError(error) {
  return /\b(Item|Actor|Token|Effect) "[^"]+" does not exist!/.test(String(error?.message ?? error));
}

export async function runWithEffectLock(actor, taskFn) {
  if (!actor) return taskFn();
  const prev = locks.get(actor) || Promise.resolve();
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
  locks.set(
    actor,
    next.catch(() => {}),
  );
  return next;
}

export async function deleteExistingEmbeddedItems(actor, ids = []) {
  if (!actor?.deleteEmbeddedDocuments) return [];

  const uniqueIds = [...new Set(ids.filter(Boolean))];
  let pendingDeletes = pendingEmbeddedItemDeletes.get(actor);
  if (!pendingDeletes) {
    pendingDeletes = new Set();
    pendingEmbeddedItemDeletes.set(actor, pendingDeletes);
  }
  const existingIds =
    typeof actor.items?.get === 'function'
      ? uniqueIds.filter((id) => !pendingDeletes.has(id) && !!actor.items.get(id))
      : uniqueIds.filter((id) => !pendingDeletes.has(id));
  if (!existingIds.length) return [];

  for (const id of existingIds) pendingDeletes.add(id);
  try {
    await actor.deleteEmbeddedDocuments('Item', existingIds);
  } catch (error) {
    if (!isMissingEmbeddedDocumentError(error)) throw error;
  } finally {
    for (const id of existingIds) pendingDeletes.delete(id);
    if (pendingDeletes.size === 0) pendingEmbeddedItemDeletes.delete(actor);
  }
  return existingIds;
}
