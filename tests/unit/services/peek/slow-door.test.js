import '../../../setup.js';
import { MODULE_ID } from '../../../../scripts/constants.js';
import {
  adjustSlowDoor,
  findSlowDoorControl,
  handleSlowDoorWheel,
  registerSlowDoorInteraction,
  slowDoorCoordinates,
  slowDoorStepHandler,
} from '../../../../scripts/services/Peek/slow-door.js';

function makeDoor(overrides = {}) {
  let saved;
  const doc = {
    id: 'door', uuid: 'Scene.scene.Wall.door', door: 1, ds: 0,
    c: [0, 0, 100, 0], animation: { direction: 1, flip: false },
    getFlag: () => saved,
    update: jest.fn(async (changes) => {
      if (changes.c) doc.c = changes.c;
      if ('ds' in changes) doc.ds = changes.ds;
      if (`flags.${MODULE_ID}.slowDoor` in changes) saved = changes[`flags.${MODULE_ID}.slowDoor`];
      if (`flags.${MODULE_ID}.-=slowDoor` in changes) saved = undefined;
    }),
    ...overrides,
  };
  return doc;
}

const gm = { id: 'gm', isGM: true, can: () => true };
const player = { id: 'player', isGM: false, can: () => true, hasRole: () => true };

describe('slow opening doors', () => {
  test('finds visible door icon directly with canvas offset and scaling, without hover callbacks', () => {
    const previousCanvas = global.canvas;
    const hidden = { visible: false, wall: { document: { door: 1 } }, getBounds: () => ({ x: 40, y: 40, width: 40, height: 40 }) };
    const door = { visible: true, wall: { document: { door: 1 } }, getBounds: () => ({ x: 40, y: 40, width: 40, height: 40 }) };
    try {
      global.canvas = {
        app: { view: { getBoundingClientRect: () => ({ left: 100, top: 50, width: 500, height: 250 }) }, renderer: { screen: { width: 1000, height: 500 } } },
        controls: { doors: { children: [door, hidden] } },
      };
      expect(findSlowDoorControl({ clientX: 130, clientY: 80 })).toBe(door);
      expect(findSlowDoorControl({ clientX: 200, clientY: 200 })).toBeNull();
    } finally { global.canvas = previousCanvas; }
  });
  test('repeated ticks swing 1 degree, preserve blocking while partial, fully open and exactly close', async () => {
    const doc = makeDoor();
    await adjustSlowDoor(doc, 1, gm);
    expect(doc.c).toEqual([0, 0, 100, 2]);
    expect(doc.ds).toBe(0);
    expect(doc.getFlag().angle).toBe(1);
    expect(doc.update).toHaveBeenLastCalledWith(expect.any(Object), { visionerSlowDoor: true, sound: false, animate: false });
    await Promise.all(Array.from({ length: 100 }, () => adjustSlowDoor(doc, 1, gm)));
    expect(doc.getFlag().angle).toBe(90);
    expect(doc.ds).toBe(1);
    expect(doc.c).toEqual([0, 0, 100, 0]);
    await adjustSlowDoor(doc, -1, gm);
    expect(doc.getFlag().angle).toBe(89);
    expect(doc.ds).toBe(0);
    await Promise.all(Array.from({ length: 100 }, () => adjustSlowDoor(doc, -1, gm)));
    expect(doc.getFlag().angle).toBe(0);
    expect(doc.c).toEqual([0, 0, 100, 0]);
  });

  test('can begin by slowly closing an already-open door', async () => {
    const doc = makeDoor({ ds: 1 });
    await adjustSlowDoor(doc, -1, player);
    expect(doc.getFlag().angle).toBe(89);
    expect(doc.ds).toBe(0);
    expect(doc.c).toEqual([0, 0, 2, 100]);
  });

  test('doors without animation settings still open and close', async () => {
    const doc = makeDoor({ animation: null });
    expect(await adjustSlowDoor(doc, 1, gm)).toBe(true);
    expect(doc.getFlag().angle).toBe(1);
    expect(doc.c).toEqual([0, 0, 100, 2]);
    expect(await adjustSlowDoor(doc, -1, gm)).toBe(true);
    expect(doc.c).toEqual([0, 0, 100, 0]);
  });

  test('hinge flip and swing direction follow door animation settings', () => {
    expect(slowDoorCoordinates([0, 0, 100, 0], 45, { flip: true, direction: -1 })).toEqual([29, 71, 100, 0]);
    expect(slowDoorCoordinates([0, 0, 100, 0], 45, { direction: -1 })).toEqual([0, 0, 71, -71]);
  });

  test.each([
    ['locked', { ds: 2 }, gm],
    ['not a door', { door: 0 }, gm],
    ['secret door', { door: 2 }, player],
    ['missing permission', {}, { ...player, can: () => false }],
    ['observer role', {}, { ...player, hasRole: () => false }],
  ])('rejects %s without modifying walls', async (_label, props, user) => {
    const doc = makeDoor(props);
    expect(await adjustSlowDoor(doc, 1, user)).toBe(false);
    expect(doc.update).not.toHaveBeenCalled();
  });

  test('paused players rejected, GM still allowed', async () => {
    const previousPaused = game.paused;
    game.paused = true;
    try {
      const doc = makeDoor();
      expect(await adjustSlowDoor(doc, 1, player)).toBe(false);
      expect(await adjustSlowDoor(doc, 1, gm)).toBe(true);
    } finally { game.paused = previousPaused; }
  });

  test('failed update does not poison later wheel requests', async () => {
    const doc = makeDoor();
    doc.update.mockRejectedValueOnce(new Error('offline'));
    await expect(adjustSlowDoor(doc, 1, gm)).rejects.toThrow('offline');
    expect(await adjustSlowDoor(doc, 1, gm)).toBe(true);
    expect(doc.getFlag().angle).toBe(1);
  });

  test('GM handler uses authenticated socket caller rather than payload user ID', async () => {
    const previousScenes = game.scenes;
    const previousUsers = game.users;
    try {
      const doc = makeDoor({ door: 2 });
      game.scenes = { get: () => ({ walls: { get: () => doc } }) };
      game.users = { get: (id) => id === 'player' ? player : gm };
      const payload = { sceneId: 'scene', wallId: 'door', direction: 1, userId: 'gm' };
      expect(await slowDoorStepHandler.call({ socketdata: { userId: 'player' } }, payload)).toBe(false);
      expect(doc.update).not.toHaveBeenCalled();
      expect(await slowDoorStepHandler.call({ socketdata: { userId: 'gm' } }, payload)).toBe(true);
    } finally {
      game.scenes = previousScenes;
      game.users = previousUsers;
    }
  });

  test('Shift-wheel consumes only door gestures and sends direction', () => {
    const previousUser = game.user;
    game.user = gm;
    try {
      const doc = makeDoor();
      const control = { wall: { document: doc } };
      const request = jest.fn();
      const event = { shiftKey: true, deltaY: -100, preventDefault: jest.fn(), stopImmediatePropagation: jest.fn() };
      expect(handleSlowDoorWheel({ ...event, shiftKey: false }, control, request)).toBe(false);
      expect(handleSlowDoorWheel(event, null, request)).toBe(false);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(handleSlowDoorWheel(event, control, request)).toBe(true);
      expect(request).toHaveBeenLastCalledWith({ sceneId: canvas.scene.id, wallId: 'door', direction: 1 });
      expect(handleSlowDoorWheel({ ...event, deltaY: 100 }, control, request)).toBe(true);
      expect(request).toHaveBeenLastCalledWith(expect.objectContaining({ direction: -1 }));
      doc.ds = 2;
      request.mockClear();
      expect(handleSlowDoorWheel(event, control, request)).toBe(true);
      expect(request).not.toHaveBeenCalled();
    } finally { game.user = previousUser; }
  });

  test('Shift-wheel horizontal delta is consumed before Foundry can rotate tokens', () => {
    const previousUser = game.user;
    game.user = gm;
    try {
      const request = jest.fn();
      const event = { shiftKey: true, deltaY: 0, deltaX: -100, preventDefault: jest.fn(), stopImmediatePropagation: jest.fn() };
      expect(handleSlowDoorWheel(event, { wall: { document: makeDoor() } }, request)).toBe(true);
      expect(event.stopImmediatePropagation).toHaveBeenCalled();
      expect(request).toHaveBeenLastCalledWith(expect.objectContaining({ direction: 1 }));
      expect(handleSlowDoorWheel({ ...event, deltaX: 100 }, { wall: { document: makeDoor() } }, request)).toBe(true);
      expect(request).toHaveBeenLastCalledWith(expect.objectContaining({ direction: -1 }));
    } finally { game.user = previousUser; }
  });

  test('capture listener keeps door targeted during swing, releases on movement, restores normal clicks', async () => {
    const previousCanvas = global.canvas;
    const previousUser = game.user;
    const previousUsers = game.users;
    const previousFoundry = global.foundry;
    const previousElementFromPoint = document.elementFromPoint;
    const hooks = new Map();
    const on = jest.spyOn(Hooks, 'on').mockImplementation((name, fn) => hooks.set(name, fn));
    const view = document.createElement('canvas');
    document.body.appendChild(view);
    try {
      game.user = gm;
      game.users = { activeGM: gm };
      global.canvas = { ...previousCanvas, app: { view } };
      const doc = makeDoor();
      let hovered = { wall: { document: doc } };
      const request = jest.fn((payload) => adjustSlowDoor(doc, payload.direction, gm));
      const wrappers = new Map();
      global.foundry = { canvas: { layers: { TokenLayer: function TokenLayer() {} } } };
      const rotateTokens = jest.fn();
      window.addEventListener('wheel', rotateTokens);
      registerSlowDoorInteraction({ getControl: () => hovered, requestStep: request, libWrapperAdapter: { register: (_module, target, fn) => wrappers.set(target, fn) } });
      const wheel = () => view.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, shiftKey: true, deltaY: 0, deltaX: -100, clientX: 10, clientY: 10 }));
      expect(wheel()).toBe(false);
      hovered = null; // Source update moved door icon from under cursor.
      expect(wheel()).toBe(false);
      expect(request).toHaveBeenCalledTimes(2);
      expect(rotateTokens).not.toHaveBeenCalled();
      document.dispatchEvent(new MouseEvent('pointermove', { clientX: 100, clientY: 100 }));
      expect(wheel()).toBe(true);
      expect(rotateTokens).toHaveBeenCalledTimes(1);
      window.removeEventListener('wheel', rotateTokens);
      // Foundry can dispatch a board-hovered wheel event with a different DOM
      // target. Neither PIXI pointerover nor target equality is required.
      const control = { visible: true, wall: { document: doc }, getBounds: () => ({ x: 0, y: 0, width: 40, height: 40 }) };
      global.canvas.controls = { doors: { children: [control] } };
      document.elementFromPoint = () => view;
      const boardHovered = new WheelEvent('wheel', { bubbles: true, cancelable: true, shiftKey: true, deltaY: -100, clientX: 10, clientY: 10 });
      expect(document.body.dispatchEvent(boardHovered)).toBe(false);
      expect(request).toHaveBeenCalledTimes(3);
      // Also exercise the exact native rotation dispatch entry point.
      const wrapper = wrappers.get('foundry.canvas.layers.TokenLayer.prototype._onMouseWheel');
      const normalized = { shiftKey: true, delta: -100, clientX: 10, clientY: 10, preventDefault: jest.fn(), stopImmediatePropagation: jest.fn() };
      wrapper.call({}, rotateTokens, normalized);
      expect(rotateTokens).toHaveBeenCalledTimes(1);
      expect(request).toHaveBeenCalledTimes(4);
      await adjustSlowDoor(doc, 1, gm); // Wait for queued requests; each moves wall.
      expect(doc.getFlag().angle).toBe(5);
      expect(doc.c).not.toEqual([0, 0, 100, 0]);
      document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift' }));
      wrapper.call({}, rotateTokens, { ...normalized, shiftKey: false });
      expect(rotateTokens).toHaveBeenCalledTimes(2);
      doc.ds = 2; // Normal locking operation.
      hooks.get('updateWall')(doc, { ds: 2 }, {});
      await adjustSlowDoor(doc, 1, gm); // Wait behind reset in same document queue.
      expect(doc.c).toEqual([0, 0, 100, 0]);
      expect(doc.getFlag()).toBeUndefined();
      expect(doc.ds).toBe(2);
    } finally {
      view.remove();
      on.mockRestore();
      game.user = previousUser;
      game.users = previousUsers;
      global.foundry = previousFoundry;
      document.elementFromPoint = previousElementFromPoint;
      global.canvas = previousCanvas;
    }
  });
});
