import { MODULE_ID } from '../../constants.js';
import { clampCornerPeek, clampDoorPeek } from './peek-geometry.js';
import { readPeekDC } from './peek-door-dc.js';
import { registerDoorPeekInteraction } from './peek-door-control.js';

const PEEK_BAND = 50;
const PEEK_FOV = 10;
const DOOR_FOV = 10;
const DOOR_NUDGE = 5;
const MAX_SWEEP = (40 * Math.PI) / 180;

export class PeekManager {
  constructor({ registry, renderer, socket, recompute, now, rollPeek, readDC }) {
    this._registry = registry;
    this._renderer = renderer;
    this._socket = socket;
    this._recompute = recompute;
    this._now = now || (() => Date.now());
    this._active = new Map();
    this._rollPeek = rollPeek;
    this._readDC = readDC || readPeekDC;
  }

  async tryStartDoorPeek(token, doorDoc, mouse) {
    const id = token.document.id;
    const existing = this._active.get(id);
    if (existing?.kind === 'door' && existing.doorDoc?.id === doorDoc.id) {
      this.endPeek(id, 'toggle');
      return false;
    }
    const dc = this._readDC(doorDoc);
    if (dc != null && this._rollPeek) {
      const { success } = await this._rollPeek({ token, dc });
      if (!success) return false;
    }
    this.startDoorPeek(token, doorDoc, mouse);
    return true;
  }

  startCornerPeek(token, mouse) {
    const geo = clampCornerPeek({ footprint: this._footprint(token), mouse, band: PEEK_BAND, fov: PEEK_FOV, tokenCenter: token.center, maxSweep: MAX_SWEEP });
    this._begin(token, { ...geo, ignoredWallIds: [] }, { kind: 'corner' });
  }

  startDoorPeek(token, doorDoc, mouse) {
    const geo = clampDoorPeek({ door: doorDoc, tokenCenter: token.center, nudge: DOOR_NUDGE, fov: DOOR_FOV, aim: mouse, maxSweep: MAX_SWEEP });
    this._begin(token, { ...geo, ignoredWallIds: [doorDoc.id] }, { kind: 'door', doorDoc });
  }

  updatePeek(tokenId, mouse) {
    const entry = this._active.get(tokenId);
    if (!entry) return;
    const geo = entry.kind === 'door'
      ? clampDoorPeek({ door: entry.doorDoc, tokenCenter: entry.token.center, nudge: DOOR_NUDGE, fov: DOOR_FOV, aim: mouse, maxSweep: MAX_SWEEP })
      : clampCornerPeek({ footprint: this._footprint(entry.token), mouse, band: PEEK_BAND, fov: PEEK_FOV, tokenCenter: entry.token.center, maxSweep: MAX_SWEEP });
    const ignoredWallIds = entry.kind === 'door' ? [entry.doorDoc.id] : [];
    this._registry.set(tokenId, { ...geo, ignoredWallIds }, this._now());
    this._renderer.apply(entry.token, this._registry.get(tokenId));
    this._socket.sendUpdate(tokenId, this._registry.get(tokenId));
    this._recompute(tokenId);
  }

  endPeek(tokenId, reason) {
    if (!this._registry.has(tokenId)) return;
    const entry = this._active.get(tokenId);
    const token = entry?.token;
    this._registry.clear(tokenId);
    this._active.delete(tokenId);
    if (token) this._renderer.clear(token);
    this._socket.sendEnd(tokenId);
    this._recompute(tokenId);
  }

  getActivePeek(tokenId) {
    return this._registry.get(tokenId);
  }

  heartbeat() {
    for (const id of this._active.keys()) {
      const peek = this._registry.get(id);
      if (peek) this._socket.sendUpdate(id, peek);
    }
  }

  _begin(token, data, meta) {
    const id = token.document.id;
    if (this._registry.has(id)) this.endPeek(id, 'restart');
    this._active.set(id, { token, kind: meta.kind, doorDoc: meta.doorDoc });
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
    if (this._initialized) return;
    this._initialized = true;
    if (typeof Hooks === 'undefined') return;
    Hooks.on('updateToken', (doc, change) => this.onTokenUpdate(doc, change));
    Hooks.on('updateWall', (doc, change) => this.onWallUpdate(doc, change));
    Hooks.on('canvasTearDown', () => this.endAll('teardown'));
    registerDoorPeekInteraction(this);
    if (typeof setInterval !== 'undefined') {
      this._heartbeatTimer = setInterval(() => this.heartbeat(), 2000);
    }
    Hooks.on('canvasReady', () => this._attachPointerMove());
    this._attachPointerMove();
  }

  _attachPointerMove() {
    const stage = globalThis.canvas?.stage;
    if (!stage?.on) return;
    if (this._boundStage === stage) return;
    this._boundStage = stage;
    stage.on('pointermove', () => {
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => {
        this._raf = null;
        this.reaimFromPointer(globalThis.canvas?.mousePosition);
      });
    });
  }

  reaimFromPointer(mouse) {
    if (!mouse) return;
    const mod = game.modules.get(MODULE_ID);
    const heldId = mod?._peekKeyHeld;
    if (heldId && this._active.has(heldId)) {
      this.updatePeek(heldId, { x: mouse.x, y: mouse.y });
      return;
    }
    for (const [id, entry] of this._active) {
      if (entry.kind === 'door' && entry.token?.controlled) {
        this.updatePeek(id, { x: mouse.x, y: mouse.y });
      }
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
