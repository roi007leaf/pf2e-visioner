import {
  CACHE_INVALIDATION_REASONS,
  invalidateCaches,
} from '../utils/cache-invalidation.js';
import { isTokenDocumentPendingDeletion } from './token-deletion-guard.js';

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function getTokenDocument(tokenOrDocument) {
  if (typeof tokenOrDocument?.document?.getFlag === 'function') return tokenOrDocument.document;
  if (typeof tokenOrDocument?.getFlag === 'function') return tokenOrDocument;
  if (typeof tokenOrDocument?.object?.document?.getFlag === 'function') {
    return tokenOrDocument.object.document;
  }
  return null;
}

export function getTokenId(tokenOrDocument) {
  return (
    tokenOrDocument?.document?.id ||
    tokenOrDocument?.id ||
    tokenOrDocument?.object?.document?.id ||
    tokenOrDocument?.object?.id ||
    null
  );
}

export function noRenderUpdateOptions() {
  return { diff: false, render: false };
}

export function areTokenFlagValuesEqual(left, right) {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    if (left.length !== right.length) return false;
    return left.every((entry, index) => areTokenFlagValuesEqual(entry, right[index]));
  }
  if (!isPlainObject(left) || !isPlainObject(right)) return false;

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;

  return leftKeys.every((key) => areTokenFlagValuesEqual(left[key], right[key]));
}

export function hasTokenFlagMapChanged(currentMap = {}, nextMap = {}) {
  return !areTokenFlagValuesEqual(currentMap || {}, nextMap || {});
}

export function buildTokenFlagSetUpdate({ document, moduleId, flagKey, value } = {}) {
  return { _id: document?.id, [`flags.${moduleId}.${flagKey}`]: value };
}

export function buildTokenFlagUnsetUpdate({
  document,
  moduleId,
  flagKey,
  forcedDeletion = null,
} = {}) {
  if (forcedDeletion) {
    return { _id: document?.id, [`flags.${moduleId}.${flagKey}`]: forcedDeletion };
  }
  return { _id: document?.id, [`flags.${moduleId}.-=${flagKey}`]: null };
}

function omitDocumentId(update) {
  const { _id, ...documentUpdate } = update || {};
  return documentUpdate;
}

function normalizeUpdatePasses(updatePasses = []) {
  return updatePasses
    .map((updates) => updates.filter((update) => update?._id))
    .filter((updates) => updates.length > 0);
}

function tokenStillExists(scene, id) {
  return (typeof scene?.tokens?.has !== 'function' || scene.tokens.has(id)) &&
    !isTokenDocumentPendingDeletion(scene?.tokens?.get?.(id));
}

export function buildTokenFlagWriteMetrics({
  requestedEntries = 0,
  updatePasses = [],
} = {}) {
  const passes = normalizeUpdatePasses(updatePasses);
  const updatedTokenIds = new Set();
  for (const updates of passes) {
    for (const update of updates) {
      updatedTokenIds.add(String(update._id));
    }
  }
  const updateCount = passes.reduce((sum, updates) => sum + updates.length, 0);

  return {
    requestedEntries: Number(requestedEntries || 0),
    updatePassCount: passes.length,
    updateCount,
    updatedTokenCount: updatedTokenIds.size,
    skippedEntries: Math.max(0, Number(requestedEntries || 0) - updatedTokenIds.size),
  };
}

export async function applyTokenFlagUpdatePasses({
  updatePasses = [],
  tokensToWaitFor = [],
  requestedEntries = 0,
  waitForToken = async () => {},
  scene = globalThis.canvas?.scene,
  updateOptions = noRenderUpdateOptions(),
  fallback = async () => {},
  invalidate = invalidateCaches,
  invalidationReason = CACHE_INVALIDATION_REASONS.tokenFlagWrite,
  onMetrics = null,
} = {}) {
  const passes = normalizeUpdatePasses(updatePasses);
  if (!passes.length) {
    onMetrics?.(buildTokenFlagWriteMetrics({ requestedEntries }));
    return { written: 0 };
  }

  const uniqueTokens = Array.from(new Set(tokensToWaitFor.filter(Boolean)));
  const waitForTokens = () => Promise.all(uniqueTokens.map((token) => waitForToken(token)));

  const appliedPasses = [];
  if (typeof scene?.updateEmbeddedDocuments === 'function') {
    let waited = false;
    for (const updates of passes) {
      if (!waited) {
        await waitForTokens();
        waited = true;
      }
      // Movement waits and prior writes yield to token deletion. Re-read scene
      // membership immediately before each pass instead of persisting stale IDs.
      const survivingUpdates = updates.filter(update => tokenStillExists(scene, update._id));
      if (!survivingUpdates.length) continue;
      await scene.updateEmbeddedDocuments('Token', survivingUpdates, updateOptions);
      appliedPasses.push(survivingUpdates);
    }
  } else {
    await waitForTokens();
    await fallback();
    appliedPasses.push(...passes);
  }

  const metrics = buildTokenFlagWriteMetrics({ requestedEntries, updatePasses: appliedPasses });
  const written = metrics.updateCount;
  if (written) invalidate?.(invalidationReason, { written });
  onMetrics?.(metrics);
  return { written };
}

export async function setTokenFlagMap({
  token,
  map = {},
  moduleId,
  flagKey,
  waitForToken = async () => {},
  updateOptions = noRenderUpdateOptions(),
  invalidate = invalidateCaches,
  invalidationReason = CACHE_INVALIDATION_REASONS.tokenFlagWrite,
  onMetrics = null,
} = {}) {
  const document = getTokenDocument(token);
  const skippedMetrics = {
    requestedEntries: 1,
    updatePassCount: 0,
    updateCount: 0,
    updatedTokenCount: 0,
    skippedEntries: 1,
  };
  if (!document) {
    onMetrics?.(skippedMetrics);
    return { written: 0, skipped: 1 };
  }

  const currentMap = document.getFlag?.(moduleId, flagKey) ?? {};
  if (!hasTokenFlagMapChanged(currentMap, map)) {
    onMetrics?.(skippedMetrics);
    return { written: 0, skipped: 1 };
  }

  await waitForToken(token);
  if (!tokenStillExists(document.parent, document.id)) {
    onMetrics?.(skippedMetrics);
    return { written: 0, skipped: 1 };
  }
  const update = buildTokenFlagSetUpdate({ document, moduleId, flagKey, value: map });
  await document.update?.(omitDocumentId(update), updateOptions);
  invalidate?.(invalidationReason, { written: 1, flagKey, tokenId: document.id });
  onMetrics?.({
    requestedEntries: 1,
    updatePassCount: 1,
    updateCount: 1,
    updatedTokenCount: 1,
    skippedEntries: 0,
  });
  return { written: 1, skipped: 0 };
}

export async function applyTokenFlagMapUpdates({
  entries = [],
  moduleId,
  flagKey,
  scene = globalThis.canvas?.scene,
  getTokenById = (id) => globalThis.canvas?.tokens?.get?.(id),
  waitForToken = async () => {},
  updateOptions = noRenderUpdateOptions(),
  invalidate = invalidateCaches,
  onMetrics = null,
} = {}) {
  const updates = [];
  const fallbackUpdates = [];

  for (const entry of entries) {
    const tokenId = entry?.tokenId;
    if (!tokenId) continue;

    const token = getTokenById(tokenId);
    const document = getTokenDocument(token);
    if (!document) continue;

    const currentMap = document.getFlag?.(moduleId, flagKey) ?? {};
    const nextMap = entry.map ?? {};
    if (!hasTokenFlagMapChanged(currentMap, nextMap)) continue;

    const update = buildTokenFlagSetUpdate({
      document,
      moduleId,
      flagKey,
      value: nextMap,
    });
    updates.push(update);
    fallbackUpdates.push({ token, document, update });
  }

  if (!updates.length) return { written: 0, skipped: entries.length };

  const result = await applyTokenFlagUpdatePasses({
    updatePasses: [updates],
    tokensToWaitFor: fallbackUpdates.map(({ token }) => token),
    requestedEntries: entries.length,
    waitForToken,
    scene,
    updateOptions,
    invalidate,
    onMetrics,
    fallback: async () => Promise.all(
      fallbackUpdates.map(({ document, update }) =>
        document.update?.(omitDocumentId(update), updateOptions),
      ),
    ),
  });

  return {
    written: result.written,
    skipped: Math.max(0, entries.length - result.written),
  };
}
