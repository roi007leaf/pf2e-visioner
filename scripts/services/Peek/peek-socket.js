import { mergeSweptCone } from './peek-geometry.js';

export { mergeSweptCone };

function roundPoints(points) {
  if (!Array.isArray(points)) return null;
  const out = new Array(points.length);
  for (let i = 0; i < points.length; i++) out[i] = Math.round(points[i]);
  return out;
}

// Read the player's final render state, rather than the GM's omniscient view or
// the swept reveal cone. A detection-filter silhouette is not a seen token.
export function collectSeenPeekTokenIds(observerId) {
  if (globalThis.game?.user?.isGM) return [];
  return (globalThis.canvas?.tokens?.placeables ?? [])
    .filter((token) => {
      const id = token.document?.id ?? token.id;
      return id && id !== observerId && token.visible === true &&
        token.mesh?.visible === true && token.mesh.renderable !== false &&
        token.mesh.worldAlpha !== 0 && !token.detectionFilter &&
        token._pvCurrentViewHardHidden !== true;
    })
    .map((token) => token.document?.id ?? token.id);
}

export class PeekSocketSender {
  constructor({ emit, now, minIntervalMs = 100 }) {
    this._emit = emit;
    this._now = now || (() => Date.now());
    this._minIntervalMs = minIntervalMs;
    this._last = new Map();
    this._pendingTimers = new Map();
    this._pendingPeek = new Map();
  }

  sendUpdate(tokenId, peek) {
    const t = this._now();
    const prev = this._last.get(tokenId);
    if (prev && t - prev.t < this._minIntervalMs) {
      this._queueTrailingSend(tokenId, peek, prev.t);
      return;
    }
    this._sendNow(tokenId, peek, t);
  }

  _sendNow(tokenId, peek, t) {
    this._last.set(tokenId, { t });
    this._clearPendingTimer(tokenId);
    const origin = { x: Math.round(peek.origin.x), y: Math.round(peek.origin.y) };
    this._emit('PeekUpdate', {
      tokenId,
      sceneId: globalThis.canvas?.scene?.id ?? null,
      origin,
      direction: peek.direction,
      fov: peek.fov,
      ignoredWallIds: peek.ignoredWallIds ?? [],
      range: typeof peek.range === 'number' ? peek.range : 0,
      points: roundPoints(peek.points),
      seenTokenIds: collectSeenPeekTokenIds(tokenId),
      userColor: globalThis.game?.user?.color?.toString?.() ?? globalThis.game?.user?.color ?? null,
      userName: globalThis.game?.user?.name ?? null,
      userId: globalThis.game?.user?.id ?? null,
      ts: t,
    });
  }

  _queueTrailingSend(tokenId, peek, lastSentAt) {
    const existingPending = this._pendingPeek.get(tokenId);
    this._pendingPeek.set(tokenId, existingPending ? mergeSweptCone(existingPending, peek) : peek);
    if (this._pendingTimers.has(tokenId) || typeof setTimeout === 'undefined') return;
    const delay = Math.max(0, this._minIntervalMs - (this._now() - lastSentAt));
    const timer = setTimeout(() => {
      this._pendingTimers.delete(tokenId);
      const pending = this._pendingPeek.get(tokenId);
      this._pendingPeek.delete(tokenId);
      if (pending) this._sendNow(tokenId, pending, this._now());
    }, delay);
    this._pendingTimers.set(tokenId, timer);
  }

  _clearPendingTimer(tokenId) {
    const timer = this._pendingTimers.get(tokenId);
    if (timer) {
      try { clearTimeout(timer); } catch (_) {}
      this._pendingTimers.delete(tokenId);
    }
    this._pendingPeek.delete(tokenId);
  }

  sendEnd(tokenId) {
    this._last.delete(tokenId);
    this._clearPendingTimer(tokenId);
    this._emit('PeekEnd', { tokenId, sceneId: globalThis.canvas?.scene?.id ?? null });
  }
}
