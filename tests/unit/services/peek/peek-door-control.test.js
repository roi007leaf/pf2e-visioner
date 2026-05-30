import '../../../setup.js';
import { handleDoorRightDown } from '../../../../scripts/services/Peek/peek-door-control.js';

function control(wallId = 'door1') {
  return { wall: { document: { id: wallId, c: [0, 0, 0, 100] } } };
}

describe('handleDoorRightDown', () => {
  let manager;
  let originalCanvas;
  beforeEach(() => {
    manager = { tryStartDoorPeek: jest.fn(async () => true) };
    originalCanvas = global.canvas;
  });
  afterEach(() => {
    global.canvas = originalCanvas;
  });

  test('peeks the door for the single controlled token', async () => {
    const token = createMockToken({ id: 'p', x: -50, y: 50 });
    global.canvas = { ...global.canvas, tokens: { controlled: [token] } };
    const handled = await handleDoorRightDown(manager, control('door1'));
    expect(handled).toBe(true);
    expect(manager.tryStartDoorPeek).toHaveBeenCalledWith(token, expect.objectContaining({ id: 'door1' }));
  });

  test('does nothing when no token controlled', async () => {
    global.canvas = { ...global.canvas, tokens: { controlled: [] } };
    const handled = await handleDoorRightDown(manager, control());
    expect(handled).toBe(false);
    expect(manager.tryStartDoorPeek).not.toHaveBeenCalled();
  });

  test('does nothing when multiple tokens controlled', async () => {
    global.canvas = { ...global.canvas, tokens: { controlled: [createMockToken({ id: 'a' }), createMockToken({ id: 'b' })] } };
    const handled = await handleDoorRightDown(manager, control());
    expect(handled).toBe(false);
    expect(manager.tryStartDoorPeek).not.toHaveBeenCalled();
  });

  test('does nothing when control has no wall document', async () => {
    global.canvas = { ...global.canvas, tokens: { controlled: [createMockToken({ id: 'p' })] } };
    const handled = await handleDoorRightDown(manager, {});
    expect(handled).toBe(false);
    expect(manager.tryStartDoorPeek).not.toHaveBeenCalled();
  });
});
