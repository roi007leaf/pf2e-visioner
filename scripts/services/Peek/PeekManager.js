import { MODULE_ID } from '../../constants.js';
import { clampCornerPeek, clampDoorPeek, pullBackOrigin } from './peek-geometry.js';
import { readPeekDC } from './peek-door-dc.js';
import { registerDoorPeekInteraction } from './peek-door-control.js';

const PEEK_BAND = 50;
const DOOR_NUDGE = 5;

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

  _slitAngle() {
    try { const v = Number(game.settings.get(MODULE_ID, 'peekSlitAngle')); return Number.isFinite(v) && v > 0 ? v : 10; } catch (_) { return 10; }
  }

  _maxSweep() {
    try { const v = Number(game.settings.get(MODULE_ID, 'peekSweepAngle')); const deg = Number.isFinite(v) && v >= 0 ? v : 20; return (deg * Math.PI) / 180; } catch (_) { return (20 * Math.PI) / 180; }
  }

  _rangePx() {
    try {
      const feet = Number(game.settings.get(MODULE_ID, 'peekRange'));
      if (!Number.isFinite(feet) || feet <= 0) return 0;
      const size = globalThis.canvas?.dimensions?.size ?? globalThis.canvas?.grid?.size ?? 100;
      const dist = globalThis.canvas?.dimensions?.distance ?? 5;
      return (feet / dist) * size;
    } catch (_) { return 0; }
  }

  startCornerPeek(token, mouse) {
    const geo = clampCornerPeek({ footprint: this._footprint(token), mouse, band: PEEK_BAND, fov: this._slitAngle(), tokenCenter: token.center, maxSweep: this._maxSweep() });
    geo.origin = this._clampOriginToWalls(token.center, geo.origin);
    this._begin(token, { ...geo, ignoredWallIds: [], range: 0 }, { kind: 'corner' });
  }

  _clampOriginToWalls(from, origin) {
    try {
      const backend =
        globalThis.CONFIG?.Canvas?.polygonBackends?.sight ?? globalThis.canvas?.walls;
      const hit = backend?.testCollision?.(from, origin, { type: 'sight', mode: 'closest' });
      if (hit) return pullBackOrigin(from, origin, hit, 2);
    } catch (_) {}
    return origin;
  }

  startDoorPeek(token, doorDoc, mouse) {
    const geo = clampDoorPeek({ door: doorDoc, tokenCenter: token.center, nudge: DOOR_NUDGE, fov: this._slitAngle(), aim: mouse, maxSweep: this._maxSweep() });
    this._begin(token, { ...geo, ignoredWallIds: [doorDoc.id], range: this._rangePx() }, { kind: 'door', doorDoc });
  }

  updatePeek(tokenId, mouse) {
    const entry = this._active.get(tokenId);
    if (!entry) return;
    let geo;
    if (entry.kind === 'door') {
      geo = clampDoorPeek({ door: entry.doorDoc, tokenCenter: entry.token.center, nudge: DOOR_NUDGE, fov: this._slitAngle(), aim: mouse, maxSweep: this._maxSweep() });
    } else {
      geo = clampCornerPeek({ footprint: this._footprint(entry.token), mouse, band: PEEK_BAND, fov: this._slitAngle(), tokenCenter: entry.token.center, maxSweep: this._maxSweep() });
      geo.origin = this._clampOriginToWalls(entry.token.center, geo.origin);
    }
    const ignoredWallIds = entry.kind === 'door' ? [entry.doorDoc.id] : [];
    const range = entry.kind === 'door' ? this._rangePx() : 0;
    this._registry.set(tokenId, { ...geo, ignoredWallIds, range }, this._now());
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
    this._attachPointerMove();
  }

  _attachPointerMove() {
    if (typeof document === 'undefined' || this._pointerBound) return;
    this._pointerBound = true;
    document.addEventListener(
      'pointermove',
      () => {
        if (this._raf) return;
        this._raf = requestAnimationFrame(() => {
          this._raf = null;
          this.reaimFromPointer(globalThis.canvas?.mousePosition);
        });
      },
      true,
    );
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
