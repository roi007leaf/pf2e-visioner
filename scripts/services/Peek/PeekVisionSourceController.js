export class PeekVisionSourceController {
  constructor({ refreshPerception } = {}) {
    this._refresh = refreshPerception || defaultRefresh;
    this._overrides = new Map();
    this._edgeSightBackup = new Map();
  }

  apply(token, peek) {
    const id = token.document.id;
    const ignoredWallIds = peek.ignoredWallIds ?? [];
    this._overrides.set(id, {
      origin: peek.origin,
      direction: peek.direction,
      fov: peek.fov,
      range: peek.range,
      ignoredWallIds,
    });
    this._excludeEdges(ignoredWallIds);
    this._reinitialize(token);
  }

  clear(token) {
    const id = token.document.id;
    if (!this._overrides.has(id)) return;
    this._overrides.delete(id);
    if (this._overrides.size === 0) this._restoreEdges();
    this._reinitialize(token);
  }

  getOverride(tokenId) {
    return this._overrides.get(tokenId) ?? null;
  }

  _edgeFor(wallId) {
    return globalThis.canvas?.walls?.get?.(wallId)?.edge ?? null;
  }

  _excludeEdges(wallIds) {
    for (const wallId of wallIds) {
      if (this._edgeSightBackup.has(wallId)) continue;
      const edge = this._edgeFor(wallId);
      if (!edge) continue;
      this._edgeSightBackup.set(wallId, edge.sight);
      try {
        edge.sight = 0;
      } catch (_) {}
    }
  }

  _restoreEdges() {
    for (const [wallId, sight] of this._edgeSightBackup) {
      const edge = this._edgeFor(wallId);
      if (edge) {
        try {
          edge.sight = sight;
        } catch (_) {}
      }
    }
    this._edgeSightBackup.clear();
  }

  _reinitialize(token) {
    try {
      token.initializeVisionSource?.();
    } catch (_) {}
    this._refresh();
  }
}

function defaultRefresh() {
  try {
    globalThis.canvas?.perception?.update?.({ initializeVision: true, refreshVision: true });
  } catch (_) {}
}
