export class PeekSocketSender {
  constructor({ emit, now, minIntervalMs = 100 }) {
    this._emit = emit;
    this._now = now || (() => Date.now());
    this._minIntervalMs = minIntervalMs;
    this._last = new Map();
  }

  sendUpdate(tokenId, peek) {
    const t = this._now();
    const prev = this._last.get(tokenId);
    const origin = { x: Math.round(peek.origin.x), y: Math.round(peek.origin.y) };
    if (prev && t - prev.t < this._minIntervalMs) return;
    this._last.set(tokenId, { t });
    this._emit('PeekUpdate', {
      tokenId,
      sceneId: globalThis.canvas?.scene?.id ?? null,
      origin,
      direction: peek.direction,
      fov: peek.fov,
      ignoredWallIds: peek.ignoredWallIds ?? [],
      ts: t,
    });
  }

  sendEnd(tokenId) {
    this._last.delete(tokenId);
    this._emit('PeekEnd', { tokenId, sceneId: globalThis.canvas?.scene?.id ?? null });
  }
}
