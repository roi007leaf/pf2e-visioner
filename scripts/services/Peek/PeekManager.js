import { MODULE_ID } from '../../constants.js';
import { clampCornerPeek, clampDoorPeek, mergeSweptCone, pullBackOrigin } from './peek-geometry.js';
import { readPeekDC } from './peek-door-dc.js';
import { registerDoorPeekInteraction } from './peek-door-control.js';

const PEEK_BAND = 25;
const DOOR_NUDGE = 5;
const DEFAULT_REAIM_MIN_INTERVAL_MS = 50;
// Corner peeks move the vision source's own origin every re-aim tick, so Foundry fully rebuilds
// the vision/light source from a new vantage point each time - unlike door peeks, whose origin
// is fixed and only reapply a stable cone. Rendered at the full reaim cadence, that rebuild reads
// as a flicker. Door peeks (numeric fov) skip this and always render at full cadence; only the
// origin-driven corner-peek rebuild is throttled here, independent of the reveal/AVS cadence.
const DEFAULT_RENDER_THROTTLE_MS = 150;
const POINT_EPSILON_PX = 0.5;
const ANGLE_EPSILON_RAD = 1e-4;

export class PeekManager {
  constructor({
    registry,
    renderer,
    socket,
    recompute,
    now,
    rollPeek,
    readDC,
    approvalRequester,
    reaimMinIntervalMs = DEFAULT_REAIM_MIN_INTERVAL_MS,
    renderThrottleMs = DEFAULT_RENDER_THROTTLE_MS,
  }) {
    this._registry = registry;
    this._renderer = renderer;
    this._socket = socket;
    this._recompute = recompute;
    this._now = now || (() => Date.now());
    this._active = new Map();
    this._pendingDoorApprovals = new Map();
    this._rollPeek = rollPeek;
    this._readDC = readDC || readPeekDC;
    this._approvalRequester = approvalRequester;
    this._reaimMinIntervalMs = Math.max(0, Number(reaimMinIntervalMs) || 0);
    this._renderThrottleMs = Math.max(0, Number(renderThrottleMs) || 0);
    this._lastReaimAt = null;
    this._pendingReaimMouse = null;
    this._pendingReaimTimer = null;
    this._pendingSweptGeo = new Map();
    this._lastRenderAt = new Map();
  }

  async tryStartDoorPeek(token, doorDoc, mouse, { skipApproval = false } = {}) {
    const id = token.document.id;
    const existing = this._active.get(id);
    if (existing?.kind === 'door' && existing.doorDoc?.id === doorDoc.id) {
      this.endPeek(id, 'toggle');
      return false;
    }
    if (!skipApproval && this._requiresDoorPeekApproval()) {
      return this._requestDoorPeekApproval(token, doorDoc, mouse);
    }
    const dc = this._readDC(doorDoc);
    if (dc != null && this._rollPeek) {
      const { success } = await this._rollPeek({ token, dc });
      if (!success) return false;
    }
    this.startDoorPeek(token, doorDoc, mouse);
    return true;
  }

  _requiresDoorPeekApproval() {
    try {
      if (globalThis.game?.user?.isGM) return false;
      return !!globalThis.game?.settings?.get?.(MODULE_ID, 'requireGmApprovalForDoorPeek');
    } catch (_) {
      return false;
    }
  }

  _requestDoorPeekApproval(token, doorDoc, mouse) {
    if (!this._approvalRequester || !token?.document?.id || !doorDoc?.id) {
      globalThis.ui?.notifications?.warn?.(
        globalThis.game?.i18n?.localize?.('PF2E_VISIONER.PEEK.APPROVAL_UNAVAILABLE') ??
          'GM approval is unavailable.',
      );
      return false;
    }
    const requestId = `${token.document.id}.${doorDoc.id}.${Date.now()}.${Math.random().toString(36).slice(2)}`;
    const request = {
      requestId,
      token,
      doorDoc,
      mouse: mouse ? { x: mouse.x, y: mouse.y } : null,
    };
    this._pendingDoorApprovals.set(requestId, request);
    const sent = this._approvalRequester({
      requestId,
      sceneId: globalThis.canvas?.scene?.id ?? null,
      tokenId: token.document.id,
      tokenName: token.name ?? token.document.name ?? token.actor?.name ?? token.document.id,
      wallId: doorDoc.id,
      userId: globalThis.game?.user?.id ?? globalThis.game?.userId ?? null,
      userName: globalThis.game?.user?.name ?? null,
      mouse: request.mouse,
    });
    if (!sent) {
      this._pendingDoorApprovals.delete(requestId);
      globalThis.ui?.notifications?.warn?.(
        globalThis.game?.i18n?.localize?.('PF2E_VISIONER.PEEK.APPROVAL_UNAVAILABLE') ??
          'GM approval is unavailable.',
      );
      return false;
    }
    globalThis.ui?.notifications?.info?.(
      globalThis.game?.i18n?.localize?.('PF2E_VISIONER.PEEK.APPROVAL_REQUESTED') ??
        'Door peek approval requested.',
    );
    return true;
  }

  async handleDoorPeekApprovalResponse({ requestId, approved } = {}) {
    const pending = this._pendingDoorApprovals.get(requestId);
    if (!pending) return false;
    this._pendingDoorApprovals.delete(requestId);
    if (!approved) {
      globalThis.ui?.notifications?.warn?.(
        globalThis.game?.i18n?.localize?.('PF2E_VISIONER.PEEK.APPROVAL_DENIED') ??
          'Door peek denied by GM.',
      );
      return false;
    }
    return this.tryStartDoorPeek(pending.token, pending.doorDoc, pending.mouse, {
      skipApproval: true,
    });
  }

  _slitAngle() {
    try { const v = Number(globalThis.game?.settings?.get?.(MODULE_ID, 'peekSlitAngle')); return Number.isFinite(v) && v > 0 ? v : 10; } catch (_) { return 10; }
  }

  _maxSweep() {
    try { const v = Number(globalThis.game?.settings?.get?.(MODULE_ID, 'peekSweepAngle')); const deg = Number.isFinite(v) && v >= 0 ? v : 20; return (deg * Math.PI) / 180; } catch (_) { return (20 * Math.PI) / 180; }
  }

  _rangePx() {
    try {
      const feet = Number(globalThis.game?.settings?.get?.(MODULE_ID, 'peekRange'));
      if (!Number.isFinite(feet) || feet <= 0) return 0;
      const size = globalThis.canvas?.dimensions?.size ?? globalThis.canvas?.grid?.size ?? 100;
      const dist = globalThis.canvas?.dimensions?.distance ?? 5;
      return (feet / dist) * size;
    } catch (_) { return 0; }
  }

  startCornerPeek(token, mouse) {
    const geo = clampCornerPeek({ footprint: this._footprint(token), mouse, band: PEEK_BAND, fov: null });
    geo.origin = this._clampOriginToWalls(token.center, geo.origin);
    this._begin(token, { ...geo, ignoredWallIds: [], range: 0 }, { kind: 'corner' });
  }

  toggleCornerPeek(token, mouse) {
    const id = token.document.id;
    const existing = this._active.get(id);
    if (existing?.kind === 'corner') {
      this.endPeek(id, 'toggle');
      return false;
    }
    this.startCornerPeek(token, mouse);
    return true;
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

  _computeNextGeo(entry, mouse) {
    let geo;
    if (entry.kind === 'door') {
      geo = clampDoorPeek({ door: entry.doorDoc, tokenCenter: entry.token.center, nudge: DOOR_NUDGE, fov: this._slitAngle(), aim: mouse, maxSweep: this._maxSweep() });
    } else {
      geo = clampCornerPeek({ footprint: this._footprint(entry.token), mouse, band: PEEK_BAND, fov: null });
      geo.origin = this._clampOriginToWalls(entry.token.center, geo.origin);
    }
    return {
      ...geo,
      ignoredWallIds: entry.kind === 'door' ? [entry.doorDoc.id] : [],
      range: entry.kind === 'door' ? this._rangePx() : 0,
    };
  }

  // Door peeks keep the vision source's origin fixed and just reapply a stable cone every tick,
  // which is cheap and never visibly jumps. Corner peeks move the origin itself, so re-rendering
  // at full reaim cadence forces Foundry to rebuild the vision/light source from a different
  // vantage point ~20x/sec, which reads as a flicker. Throttle only that case; the reveal/AVS
  // data path (registry + socket update below) always stays at full fidelity either way.
  _shouldRerender(tokenId, next, now) {
    if (typeof next.fov === 'number') return true;
    const last = this._lastRenderAt.get(tokenId);
    return last == null || now - last >= this._renderThrottleMs;
  }

  updatePeek(tokenId, mouse, sweptGeo = null) {
    const entry = this._active.get(tokenId);
    if (!entry) return;
    let next = this._computeNextGeo(entry, mouse);
    if (sweptGeo) next = mergeSweptCone(sweptGeo, next);
    if (this._peekDataMatches(this._registry.get(tokenId), next)) return false;
    this._registry.set(tokenId, next, this._now());
    const now = this._now();
    if (this._shouldRerender(tokenId, next, now)) {
      this._lastRenderAt.set(tokenId, now);
      this._renderer.apply(entry.token, this._registry.get(tokenId));
    }
    this._socket.sendUpdate(tokenId, { ...this._registry.get(tokenId), points: this._polygonPoints(entry.token) });
    this._recompute(tokenId);
    return true;
  }

  endPeek(tokenId, reason) {
    if (!this._registry.has(tokenId)) return;
    const entry = this._active.get(tokenId);
    const token = entry?.token;
    this._registry.clear(tokenId);
    this._active.delete(tokenId);
    this._pendingSweptGeo.delete(tokenId);
    this._lastRenderAt.delete(tokenId);
    if (token) this._renderer.clear(token);
    this._socket.sendEnd(tokenId);
    this._recompute(tokenId);
  }

  getActivePeek(tokenId) {
    return this._registry.get(tokenId);
  }

  heartbeat() {
    for (const [id, entry] of this._active) {
      const peek = this._registry.get(id);
      if (peek) this._socket.sendUpdate(id, { ...peek, points: this._polygonPoints(entry.token) });
    }
  }

  _begin(token, data, meta) {
    const id = token.document.id;
    if (this._registry.has(id)) this.endPeek(id, 'restart');
    this._active.set(id, { token, kind: meta.kind, doorDoc: meta.doorDoc });
    this._registry.set(id, data, this._now());
    this._lastRenderAt.set(id, this._now());
    this._renderer.apply(token, this._registry.get(id));
    this._socket.sendUpdate(id, { ...this._registry.get(id), points: this._polygonPoints(token) });
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
    this._clearPendingReaim();
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

  reaimFromPointer(mouse, { force = false } = {}) {
    if (!mouse) return;
    const now = this._now();
    if (!force && this._lastReaimAt != null && now - this._lastReaimAt < this._reaimMinIntervalMs) {
      this._queueReaim(mouse);
      return;
    }
    this._runReaim(mouse, now);
  }

  _runReaim(mouse, now = this._now()) {
    this._lastReaimAt = now;
    const swept = this._pendingSweptGeo;
    this._pendingSweptGeo = new Map();
    this._clearPendingReaim();
    for (const [id, entry] of this._active) {
      if (entry.token?.controlled) {
        this.updatePeek(id, { x: mouse.x, y: mouse.y }, swept.get(id) ?? null);
      }
    }
  }

  // Between two processed reaim samples, our own throttle can leave a target briefly
  // in view without ever registering it (the aim is only re-evaluated on the *next*
  // sample). Accumulating the cone swept by every intermediate mouse position - even
  // the ones this throttle skips running through updatePeek - keeps a fast sweep from
  // silently losing a target it passed through.
  _accumulateSweptGeo(mouse) {
    for (const [id, entry] of this._active) {
      if (!entry.token?.controlled) continue;
      const geo = this._computeNextGeo(entry, { x: mouse.x, y: mouse.y });
      const existing = this._pendingSweptGeo.get(id);
      this._pendingSweptGeo.set(id, existing ? mergeSweptCone(existing, geo) : geo);
    }
  }

  _queueReaim(mouse) {
    this._pendingReaimMouse = { x: mouse.x, y: mouse.y };
    this._accumulateSweptGeo(mouse);
    if (this._pendingReaimTimer || typeof setTimeout === 'undefined') return;
    const elapsed = this._lastReaimAt == null ? this._reaimMinIntervalMs : this._now() - this._lastReaimAt;
    const delay = Math.max(0, this._reaimMinIntervalMs - elapsed);
    this._pendingReaimTimer = setTimeout(() => {
      const pending = this._pendingReaimMouse;
      this._pendingReaimTimer = null;
      this._pendingReaimMouse = null;
      if (pending) this.reaimFromPointer(pending, { force: true });
    }, delay);
  }

  _clearPendingReaim() {
    this._pendingSweptGeo = new Map();
    if (!this._pendingReaimTimer) return;
    try {
      clearTimeout(this._pendingReaimTimer);
    } catch (_) {}
    this._pendingReaimTimer = null;
    this._pendingReaimMouse = null;
  }

  _peekDataMatches(a, b) {
    if (!a || !b) return false;
    if (!pointsNear(a.origin, b.origin)) return false;
    if (!numbersNear(a.direction, b.direction, ANGLE_EPSILON_RAD)) return false;
    if (!numbersNear(a.fov, b.fov, ANGLE_EPSILON_RAD)) return false;
    if (!numbersNear(a.range ?? 0, b.range ?? 0, POINT_EPSILON_PX)) return false;
    const aWalls = a.ignoredWallIds ?? [];
    const bWalls = b.ignoredWallIds ?? [];
    if (aWalls.length !== bWalls.length) return false;
    return aWalls.every((wallId, index) => wallId === bWalls[index]);
  }

  _polygonPoints(token) {
    try {
      const pts = token?.vision?.los?.points;
      return Array.isArray(pts) ? pts : null;
    } catch (_) { return null; }
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

function numbersNear(a, b, epsilon) {
  if (a == null || b == null) return a == null && b == null;
  return Math.abs(Number(a) - Number(b)) <= epsilon;
}

function pointsNear(a, b) {
  if (!a || !b) return false;
  return (
    numbersNear(a.x, b.x, POINT_EPSILON_PX) &&
    numbersNear(a.y, b.y, POINT_EPSILON_PX) &&
    numbersNear(a.elevation, b.elevation, POINT_EPSILON_PX)
  );
}
