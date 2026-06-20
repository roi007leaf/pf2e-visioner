/**
 * Helpers for resolving and expanding connected hidden walls.
 */

import { MODULE_ID } from '../../constants.js';

function normalizeIdentifier(id) {
  return String(id || '').trim();
}

export function getConnectedWallDocsBySourceId(wallId) {
  try {
    const wall = canvas.walls?.get?.(wallId);
    const doc = wall?.document || canvas.scene?.walls?.get?.(wallId);
    if (!doc) return [];
    const placeables = canvas.walls?.placeables || [];

    // Forward: this doc lists other identifiers
    const forwardList = doc.getFlag?.(MODULE_ID, 'connectedWalls') || [];
    const forwardMatch = new Set(
      (Array.isArray(forwardList) ? forwardList : []).map(normalizeIdentifier).filter(Boolean),
    );

    // Reverse: any wall that lists this doc's identifier
    const myIdent = normalizeIdentifier(doc.getFlag?.(MODULE_ID, 'wallIdentifier'));

    const resultsById = new Map();
    for (const w of placeables) {
      const d = w.document;
      if (!d || d.id === doc.id) continue;
      const ident = normalizeIdentifier(d.getFlag?.(MODULE_ID, 'wallIdentifier'));
      // Forward match: my connectedWalls contain their identifier
      if (ident && forwardMatch.has(ident)) resultsById.set(d.id, d);
      // Reverse match: their connectedWalls contain my identifier
      try {
        const theirs = d.getFlag?.(MODULE_ID, 'connectedWalls') || [];
        if (myIdent && Array.isArray(theirs) && theirs.map(normalizeIdentifier).includes(myIdent)) {
          resultsById.set(d.id, d);
        }
      } catch (_) { }
    }
    return Array.from(resultsById.values());
  } catch (_) {
    return [];
  }
}

export function expandWallIdWithConnected(wallId) {
  const ids = new Set([wallId]);
  try {
    // BFS to include chains of connections in either direction
    const queue = [wallId];
    const seen = new Set();
    while (queue.length > 0) {
      const currentId = queue.shift();
      if (seen.has(currentId)) continue;
      seen.add(currentId);
      ids.add(currentId);
      const neighbors = getConnectedWallDocsBySourceId(currentId) || [];
      for (const nd of neighbors) {
        if (!seen.has(nd.id)) queue.push(nd.id);
      }
    }
  } catch (_) { }
  return ids;
}

export async function mirrorHiddenFlagToConnected(sourceDoc, hidden) {
  try {
    const connectedDocs = getConnectedWallDocsBySourceId(sourceDoc.id);
    if (connectedDocs.length === 0) return;
    const updates = [];
    for (const d of connectedDocs) {
      updates.push({ _id: d.id, [`flags.${MODULE_ID}.hiddenWall`]: !!hidden });
    }
    if (updates.length)
      await canvas.scene?.updateEmbeddedDocuments?.('Wall', updates, { diff: false });
  } catch (_) { }
}
