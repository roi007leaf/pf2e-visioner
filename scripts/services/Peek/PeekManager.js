import { MODULE_ID } from '../../constants.js';
import { clampCornerPeek, clampDoorPeek } from './peek-geometry.js';
import { readPeekDC } from './peek-door-dc.js';
import { registerDoorPeekInteraction } from './peek-door-control.js';

const PEEK_BAND = 50;
const PEEK_FOV = 90;
const DOOR_FOV = 60;
const DOOR_NUDGE = 5;

export class PeekManager {
  constructor({ registry, renderer, socket, recompute, now, rollPeek, readDC }) {
    this._registry = registry;
    this._renderer = renderer;
    this._socket = socket;
    this._recompute = recompute;
    this._now = now || (() => Date.now());
    this._tokensById = new Map();
    this._rollPeek = rollPeek;
    this._readDC = readDC || readPeekDC;
  }

  async tryStartDoorPeek(token, doorDoc) {
    const dc = this._readDC(doorDoc);
    if (dc != null && this._rollPeek) {
      const { success } = await this._rollPeek({ token, dc });
      if (!success) return false;
    }
    this.startDoorPeek(token, doorDoc);
    return true;
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

  onTokenUpdate(doc, change) {
    if (!('x' in change) && !('y' in change)) return;
    if (this._registry.has(doc.id)) this.endPeek(doc.id, 'move');
  }

  onWallUpdate(doc, change) {
    if (!('ds' in change) && !('door' in change)) return;
    for (const id of this._registry.ids()) {
      const peek = this._registry.get(id);
      if (peek?.ignoredWallIds?.includes(doc.id)) this.endPeek(id, 'door');
    }
  }

  endAll(reason) {
    for (const id of this._registry.ids()) this.endPeek(id, reason);
  }

  init() {
    if (typeof Hooks === 'undefined') return;
    Hooks.on('updateToken', (doc, change) => this.onTokenUpdate(doc, change));
    Hooks.on('updateWall', (doc, change) => this.onWallUpdate(doc, change));
    Hooks.on('canvasTearDown', () => this.endAll('teardown'));
    registerDoorPeekInteraction(this);
    if (typeof canvas !== 'undefined' && canvas?.stage?.on) {
      canvas.stage.on('pointermove', () => {
        const mod = game.modules.get(MODULE_ID);
        const id = mod?._peekKeyHeld;
        if (!id) return;
        if (this._raf) return;
        this._raf = requestAnimationFrame(() => {
          this._raf = null;
          const m = canvas.mousePosition;
          if (m) this.updatePeek(id, { x: m.x, y: m.y });
        });
      });
    }
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
