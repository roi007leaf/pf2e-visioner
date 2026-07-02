import '../../../setup.js';
import {
  clearHoveredDoorControl,
  handleDoorRightDown,
  handleDoorPeekKeyDown,
  registerDoorPeekInteraction,
  setHoveredDoorControl,
} from '../../../../scripts/services/Peek/peek-door-control.js';
import { KEYBINDINGS } from '../../../../scripts/constants.js';

function control(wallId = 'door1', peekAllowed = true) {
  return {
    wall: {
      document: {
        id: wallId,
        c: [0, 0, 0, 100],
        getFlag: (m, k) => (m === 'pf2e-visioner' && k === 'peekAllowed' ? peekAllowed : undefined),
      },
    },
  };
}

describe('door peek keybinding metadata', () => {
  test('has no default binding', () => {
    expect(KEYBINDINGS.holdDoorPeek.editable).toEqual([]);
  });
});

describe('registerDoorPeekInteraction', () => {
  function setupDoorPeekInteraction() {
    const originalCanvas = global.canvas;
    const originalFoundry = globalThis.foundry;
    const manager = { tryStartDoorPeek: jest.fn(async () => true) };
    const registered = new Map();
    function DoorControl() {}
    const libWrapperAdapter = {
      register: jest.fn((_moduleId, target, fn) => registered.set(target, fn)),
    };
    const token = createMockToken({ id: 'p', x: -50, y: 50 });
    token.center = { x: -50, y: 50 };

    global.canvas = {
      ...global.canvas,
      grid: { size: 100 },
      tokens: { controlled: [token] },
      mousePosition: { x: 10, y: 20 },
    };
    globalThis.foundry = {
      ...globalThis.foundry,
      canvas: { containers: { DoorControl } },
    };

    registerDoorPeekInteraction(manager, { libWrapperAdapter });

    return {
      manager,
      registered,
      restore() {
        clearHoveredDoorControl();
        global.canvas = originalCanvas;
        globalThis.foundry = originalFoundry;
      },
    };
  }

  test('tracks hovered door controls for keybind-only door peek', async () => {
    const { manager, registered, restore } = setupDoorPeekInteraction();

    try {
      const hoverIn = registered.get('foundry.canvas.containers.DoorControl.prototype._onMouseOver');
      const hoverOut = registered.get(
        'foundry.canvas.containers.DoorControl.prototype._onMouseOut',
      );
      const doorControl = control('door1');
      const wrappedHoverIn = jest.fn(() => 'hovered');
      const wrappedHoverOut = jest.fn(() => 'unhovered');

      expect(hoverIn.call(doorControl, wrappedHoverIn, {})).toBe('hovered');
      expect(await handleDoorPeekKeyDown(manager)).toBe(true);
      expect(manager.tryStartDoorPeek).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'p' }),
        expect.objectContaining({ id: 'door1' }),
        expect.anything(),
      );

      expect(hoverOut.call(doorControl, wrappedHoverOut, {})).toBe('unhovered');
      manager.tryStartDoorPeek.mockClear();
      expect(await handleDoorPeekKeyDown(manager)).toBe(false);
      expect(manager.tryStartDoorPeek).not.toHaveBeenCalled();

      expect(hoverIn.call(doorControl, jest.fn(() => false), {})).toBe(false);
      expect(await handleDoorPeekKeyDown(manager)).toBe(false);
      expect(manager.tryStartDoorPeek).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  test('does not wrap right-click door handling', () => {
    const { registered, restore } = setupDoorPeekInteraction();

    try {
      expect(
        registered.has('foundry.canvas.containers.DoorControl.prototype._onRightDown'),
      ).toBe(false);
      expect(
        registered.has('DoorControl.prototype._onRightDown'),
      ).toBe(false);
    } finally {
      restore();
    }
  });
});

describe('handleDoorPeekKeyDown', () => {
  let manager;
  let originalCanvas;
  let originalUi;

  beforeEach(() => {
    manager = { tryStartDoorPeek: jest.fn(async () => true) };
    originalCanvas = global.canvas;
    originalUi = global.ui;
    global.ui = { notifications: { warn: jest.fn() } };
    const token = createMockToken({ id: 'p', x: -50, y: 50 });
    token.center = { x: -50, y: 50 };
    global.canvas = {
      ...global.canvas,
      grid: { size: 100 },
      tokens: { controlled: [token] },
      mousePosition: { x: 10, y: 20 },
    };
  });

  afterEach(() => {
    clearHoveredDoorControl();
    global.canvas = originalCanvas;
    global.ui = originalUi;
  });

  test('starts door peek from the hovered door when the keybind fires', async () => {
    setHoveredDoorControl(control('door1'));

    expect(await handleDoorPeekKeyDown(manager)).toBe(true);
    expect(manager.tryStartDoorPeek).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p' }),
      expect.objectContaining({ id: 'door1' }),
      expect.anything(),
    );
  });

  test('does nothing when no door is hovered', async () => {
    expect(await handleDoorPeekKeyDown(manager)).toBe(false);
    expect(manager.tryStartDoorPeek).not.toHaveBeenCalled();
  });
});

describe('handleDoorRightDown', () => {
  let manager;
  let originalCanvas;
  let originalUi;
  beforeEach(() => {
    manager = { tryStartDoorPeek: jest.fn(async () => true) };
    originalCanvas = global.canvas;
    originalUi = global.ui;
    global.ui = { notifications: { warn: jest.fn() } };
  });
  afterEach(() => {
    global.canvas = originalCanvas;
    global.ui = originalUi;
  });

  test('peeks the door for the single controlled token', async () => {
    const token = createMockToken({ id: 'p', x: -50, y: 50 });
    token.center = { x: -50, y: 50 };
    global.canvas = { ...global.canvas, grid: { size: 100 }, tokens: { controlled: [token] }, mousePosition: { x: 10, y: 20 } };
    const handled = await handleDoorRightDown(manager, control('door1'));
    expect(handled).toBe(true);
    expect(manager.tryStartDoorPeek).toHaveBeenCalledWith(token, expect.objectContaining({ id: 'door1' }), expect.anything());
  });

  test('does nothing when no token controlled', async () => {
    global.canvas = { ...global.canvas, grid: { size: 100 }, tokens: { controlled: [] } };
    const handled = await handleDoorRightDown(manager, control());
    expect(handled).toBe(false);
    expect(manager.tryStartDoorPeek).not.toHaveBeenCalled();
  });

  test('does nothing when multiple tokens controlled', async () => {
    global.canvas = { ...global.canvas, grid: { size: 100 }, tokens: { controlled: [createMockToken({ id: 'a' }), createMockToken({ id: 'b' })] } };
    const handled = await handleDoorRightDown(manager, control());
    expect(handled).toBe(false);
    expect(manager.tryStartDoorPeek).not.toHaveBeenCalled();
  });

  test('does nothing when control has no wall document', async () => {
    global.canvas = { ...global.canvas, grid: { size: 100 }, tokens: { controlled: [createMockToken({ id: 'p' })] } };
    const handled = await handleDoorRightDown(manager, {});
    expect(handled).toBe(false);
    expect(manager.tryStartDoorPeek).not.toHaveBeenCalled();
  });

  test('rejects and warns when the door does not allow peeking', async () => {
    const token = createMockToken({ id: 'p', x: -50, y: 50 });
    token.center = { x: -50, y: 50 };
    global.canvas = { ...global.canvas, grid: { size: 100 }, tokens: { controlled: [token] }, mousePosition: { x: 10, y: 20 } };
    const handled = await handleDoorRightDown(manager, control('door1', false));
    expect(handled).toBe(false);
    expect(manager.tryStartDoorPeek).not.toHaveBeenCalled();
    expect(global.ui.notifications.warn).toHaveBeenCalled();
  });

  test('rejects and warns when the controlled token is too far from the door', async () => {
    const token = createMockToken({ id: 'far' });
    token.center = { x: 500, y: 50 };
    global.canvas = { ...global.canvas, grid: { size: 100 }, tokens: { controlled: [token] } };
    const handled = await handleDoorRightDown(manager, control('door1'));
    expect(handled).toBe(false);
    expect(manager.tryStartDoorPeek).not.toHaveBeenCalled();
    expect(global.ui.notifications.warn).toHaveBeenCalled();
  });
});
