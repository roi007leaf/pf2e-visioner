import { clampCornerPeek, clampDoorPeek } from './peek-geometry.js';

const PEEK_BAND = 50;
const PEEK_FOV = 90;
const DOOR_FOV = 60;
const DOOR_NUDGE = 5;

export class PeekManager {
  constructor({ registry, renderer, socket, recompute, now }) {
    this._registry = registry;
    this._renderer = renderer;
    this._socket = socket;
    this._recompute = recompute;
    this._now = now || (() => Date.now());
    this._tokensById = new Map();
  }

  startCornerPeek(token, mouse) {
    const footprint = this._footprint(token);
    const geo = clampCornerPeek({ footprint, mouse, band: PEEK_BAND, fov: PEEK_FOV });
    this._begin(token, { ...geo, ignoredWallIds: [], kind: 'corner' });
  }

  startDoorPeek(token, doorDoc) {
    const geo = clampDoorPeek({ door: doorDoc, tokenCenter: token.center, nudge: DOOR_NUDGE, fov: DOOR_FOV });
    this._begin(token, { ...geo, ignoredWallIds: [doorDoc.id], kind: 'door' });
  }

  updatePeek(tokenId, mouse) {
    const token = this._tokensById.get(tokenId);
    if (!token) return;
    const footprint = this._footprint(token);
    const geo = clampCornerPeek({ footprint, mouse, band: PEEK_BAND, fov: PEEK_FOV });
    this._registry.set(tokenId, { ...geo, ignoredWallIds: [] }, this._now());
    this._renderer.apply(token, this._registry.get(tokenId));
    this._socket.sendUpdate(tokenId, this._registry.get(tokenId));
    this._recompute(tokenId);
  }

  endPeek(tokenId, reason) {
    if (!this._registry.has(tokenId)) return;
    const token = this._tokensById.get(tokenId);
    this._registry.clear(tokenId);
    this._tokensById.delete(tokenId);
    if (token) this._renderer.clear(token);
    this._socket.sendEnd(tokenId);
    this._recompute(tokenId);
  }

  getActivePeek(tokenId) {
    return this._registry.get(tokenId);
  }

  _begin(token, data) {
    const id = token.document.id;
    if (this._registry.has(id)) this.endPeek(id, 'restart');
    this._tokensById.set(id, token);
    this._registry.set(id, data, this._now());
    this._renderer.apply(token, this._registry.get(id));
    this._socket.sendUpdate(id, this._registry.get(id));
    this._recompute(id);
  }

  _footprint(token) {
    const gridSize = globalThis.canvas?.grid?.size ?? 100;
    return {
      x: token.document.x,
      y: token.document.y,
      width: (token.document.width ?? 1) * gridSize,
      height: (token.document.height ?? 1) * gridSize,
      elevation: token.document.elevation ?? 0,
    };
  }
}
