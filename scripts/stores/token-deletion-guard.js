// A deletion may reach the server before the client collection loses its token.
// Track the local operation across all async pre-delete and socket work.
const pending = new WeakMap();

export function isTokenDocumentPendingDeletion(document) {
  return !!document && pending.has(document);
}

export async function trackTokenDeletion(wrapped, ids, operation = {}) {
  const collection = operation.parent?.tokens;
  const documents = (operation.deleteAll ? [...(collection?.keys?.() ?? [])] : ids ?? [])
    .map(id => collection?.get?.(id)).filter(Boolean);
  for (const document of documents) pending.set(document, (pending.get(document) ?? 0) + 1);
  try {
    return await wrapped(ids, operation);
  } finally {
    // A cancelled or rejected deletion must not strand a live token as unwritable.
    for (const document of documents) {
      const remaining = (pending.get(document) ?? 1) - 1;
      if (remaining) pending.set(document, remaining);
      else pending.delete(document);
    }
  }
}
