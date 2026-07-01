import '../../../setup.js';
import {
  handleDoorRightDown,
  shouldPeekDoor,
} from '../../../../scripts/services/Peek/peek-door-control.js';

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

describe('shouldPeekDoor', () => {
  let originalGame;
  let originalFoundry;
  let originalKeyboardManager;

  beforeEach(() => {
    originalGame = globalThis.game;
    originalFoundry = globalThis.foundry;
    originalKeyboardManager = globalThis.KeyboardManager;
  });

  afterEach(() => {
    globalThis.game = originalGame;
    globalThis.foundry = originalFoundry;
    if (originalKeyboardManager === undefined) delete globalThis.KeyboardManager;
    else globalThis.KeyboardManager = originalKeyboardManager;
  });

  test('uses Foundry namespaced KeyboardManager for modifier state', () => {
    const isModifierActive = jest.fn(() => true);
    delete globalThis.KeyboardManager;
    globalThis.game = {
      ...globalThis.game,
      keyboard: { isModifierActive },
    };
    globalThis.foundry = {
      ...globalThis.foundry,
      helpers: {
        ...(globalThis.foundry?.helpers ?? {}),
        interaction: {
          KeyboardManager: {
            MODIFIER_KEYS: { SHIFT: 'Shift' },
          },
        },
      },
    };

    expect(shouldPeekDoor({ shiftKey: false })).toBe(true);
    expect(isModifierActive).toHaveBeenCalledWith('Shift');
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
