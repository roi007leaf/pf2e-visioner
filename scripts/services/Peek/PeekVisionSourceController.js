export class PeekVisionSourceController {
  constructor({ refreshPerception } = {}) {
    this._refresh = refreshPerception || defaultRefresh;
    this._overrides = new Map();
  }

  apply(token, peek) {
    const id = token.document.id;
    this._overrides.set(id, {
      origin: peek.origin,
      direction: peek.direction,
      fov: peek.fov,
      ignoredWallIds: peek.ignoredWallIds ?? [],
    });
    this._reinitialize(token);
  }

  clear(token) {
    const id = token.document.id;
    if (!this._overrides.has(id)) return;
    this._overrides.delete(id);
    this._reinitialize(token);
  }

  getOverride(tokenId) {
    return this._overrides.get(tokenId) ?? null;
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
