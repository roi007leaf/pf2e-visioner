import { MODULE_ID } from '../../constants.js';

const FLAG = 'slowDoor';
const queues = new Map();
let registered = false;

function slowDoorStepDegrees() {
  try {
    const value = Number(globalThis.game?.settings?.get?.(MODULE_ID, 'slowDoorStepDegrees'));
    if (Number.isFinite(value) && value > 0) return Math.max(1, Math.min(45, Math.round(value)));
  } catch (_) {}
  return 1;
}

function states() {
  return globalThis.CONST?.WALL_DOOR_STATES ?? { CLOSED: 0, OPEN: 1, LOCKED: 2 };
}

function enqueue(doc, work) {
  const key = doc.uuid ?? `${doc.parent?.id}:${doc.id}`;
  const pending = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(work);
  queues.set(key, pending);
  const cleanup = () => { if (queues.get(key) === pending) queues.delete(key); };
  pending.then(cleanup, cleanup);
  return pending;
}

export function slowDoorCoordinates(closed, angle, animation = {}) {
  if (angle === 0 || angle === 90) return [...closed];
  const [x1, y1, x2, y2] = closed;
  // Foundry's single-door swing always pivots at ray.A. Flip mirrors the
  // texture vertically; only Open Direction controls the swing side.
  const hinge = [x1, y1];
  const tip = [x2, y2];
  const radians = angle * Math.PI / 180 * (animation?.direction === -1 ? -1 : 1);
  const dx = tip[0] - hinge[0];
  const dy = tip[1] - hinge[1];
  const moved = [
    Math.round(hinge[0] + dx * Math.cos(radians) - dy * Math.sin(radians)),
    Math.round(hinge[1] + dx * Math.sin(radians) + dy * Math.cos(radians)),
  ];
  return [...hinge, ...moved];
}

export function adjustSlowDoor(doc, direction, user) {
  return enqueue(doc, async () => {
    if (!doc.door || doc.ds === states().LOCKED || !user?.can?.('WALL_DOORS')) return false;
    if (!user.isGM && (game.paused || !user.hasRole?.('PLAYER') || doc.door === (globalThis.CONST?.WALL_DOOR_TYPES?.SECRET ?? 2))) return false;
    if (direction !== 1 && direction !== -1) return false;
    const saved = doc.getFlag(MODULE_ID, FLAG);
    const closed = saved?.closed ?? [...doc.c];
    if (!Array.isArray(closed) || closed.length !== 4 || !closed.every(Number.isFinite)) return false;
    const current = saved?.angle ?? (doc.ds === states().OPEN ? 90 : 0);
    const angle = Math.max(0, Math.min(90, current + direction * slowDoorStepDegrees()));
    if (angle === current) return false;
    await doc.update({
      c: slowDoorCoordinates(closed, angle, doc.animation),
      ds: angle === 90 ? states().OPEN : states().CLOSED,
      [`flags.${MODULE_ID}.${FLAG}`]: { closed, angle },
    }, { visionerSlowDoor: true, sound: false, animate: false });
    return true;
  });
}

// Socketlib supplies the caller identity; never accept it from the payload.
export function slowDoorStepHandler(payload) {
  if (!globalThis.game?.user?.isGM) return false;
  const callerId = this?.socketdata?.userId;
  const user = callerId ? game.users?.get?.(callerId) : game.user;
  const scene = game.scenes?.get?.(payload?.sceneId);
  const doc = scene?.walls?.get?.(payload?.wallId);
  if (!doc || !user) return false;
  return adjustSlowDoor(doc, payload.direction, user);
}

export function handleSlowDoorWheel(event, control, requestStep) {
  const doc = control?.wall?.document;
  // Browsers can convert Shift-wheel to horizontal scrolling. Match Foundry's
  // MouseManager normalization before its window listener rotates tokens.
  const delta = event.deltaY || event.deltaX || event.delta;
  if (!event.shiftKey || !Number.isFinite(delta) || !delta || !doc?.door) return false;
  if (!game.user?.can?.('WALL_DOORS') || (game.paused && !game.user.isGM)) return false;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (doc.ds === states().LOCKED) return true;
  Promise.resolve(requestStep({ sceneId: canvas.scene.id, wallId: doc.id, direction: delta < 0 ? 1 : -1 }))
    .catch((error) => { console.warn('[PF2E-Visioner] Slow door update failed:', error); });
  return true;
}

export function findSlowDoorControl(event) {
  const board = globalThis.canvas;
  const view = board?.app?.view ?? board?.app?.canvas;
  const rect = view?.getBoundingClientRect?.();
  if (!rect || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return null;
  const screen = board.app.renderer?.screen;
  const x = (event.clientX - rect.left) * (rect.width > 0 ? (screen?.width ?? rect.width) / rect.width : 1);
  const y = (event.clientY - rect.top) * (rect.height > 0 ? (screen?.height ?? rect.height) / rect.height : 1);
  for (const control of [...(board.controls?.doors?.children ?? [])].reverse()) {
    if (control.visible === false || control.renderable === false || !control.wall?.document?.door) continue;
    const bounds = control.getBounds?.();
    if (!bounds) continue;
    if (typeof bounds.contains === 'function' ? bounds.contains(x, y) :
      x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height) return control;
  }
  return null;
}

export function registerSlowDoorInteraction({ getControl, requestStep, libWrapperAdapter }) {
  if (registered || typeof document === 'undefined') return;
  registered = true;
  let gesture = null;
  const consume = (event) => {
    const control = findSlowDoorControl(event) ?? getControl() ?? gesture?.control;
    if (!handleSlowDoorWheel(event, control, requestStep)) return false;
    gesture = { control, x: event.clientX, y: event.clientY };
    return true;
  };
  // Intercept the actual rotation entry point as well as DOM events. Foundry's
  // MouseManager can dispatch wheel events whose DOM target isn't the board.
  const adapter = libWrapperAdapter ?? globalThis.libWrapper;
  const target = globalThis.foundry?.canvas?.layers?.TokenLayer?.prototype
    ? 'foundry.canvas.layers.TokenLayer.prototype._onMouseWheel'
    : typeof globalThis.TokenLayer === 'function' ? 'TokenLayer.prototype._onMouseWheel' : null;
  if (target && adapter?.register) {
    adapter.register(MODULE_ID, target, function (wrapped, event, ...args) {
      if (consume(event)) return;
      return wrapped.call(this, event, ...args);
    }, 'MIXED');
  }
  document.addEventListener('wheel', (event) => {
    const view = globalThis.canvas?.app?.view ?? globalThis.canvas?.app?.canvas;
    const hover = document.elementFromPoint?.(event.clientX, event.clientY);
    if (!event.shiftKey || (event.target !== view && hover !== view && !view?.contains?.(event.target))) {
      gesture = null;
      return;
    }
    consume(event);
  }, { capture: true, passive: false });
  document.addEventListener('pointermove', (event) => {
    if (gesture && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 8) gesture = null;
  }, true);
  document.addEventListener('keyup', (event) => { if (event.key === 'Shift') gesture = null; });
  globalThis.Hooks?.on?.('canvasTearDown', () => { gesture = null; });
  globalThis.Hooks?.on?.('updateWall', (doc, changes, options = {}) => {
    if (!game.user?.isGM || options.visionerSlowDoor || !doc.getFlag(MODULE_ID, FLAG)) return;
    const activeGM = game.users?.activeGM;
    if (activeGM && activeGM.id !== game.user.id) return;
    if (!['ds', 'c', 'door'].some((key) => key in changes)) return;
    // Normal clicks, locking, and GM wall edits must not leave a swung wall or
    // stale hinge behind. Let an intentional coordinate edit become canonical.
    enqueue(doc, async () => {
      const saved = doc.getFlag(MODULE_ID, FLAG);
      if (!saved) return;
      const update = { [`flags.${MODULE_ID}.-=${FLAG}`]: null };
      if (!('c' in changes)) update.c = saved.closed;
      await doc.update(update, { visionerSlowDoor: true, sound: false, animate: false });
    }).catch((error) => { console.warn('[PF2E-Visioner] Slow door reset failed:', error); });
  });
}
