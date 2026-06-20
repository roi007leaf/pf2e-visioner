import '../../../setup.js';
import { PeekVisionSourceController } from '../../../../scripts/services/Peek/PeekVisionSourceController.js';

describe('PeekVisionSourceController contract', () => {
  test('apply requests vision re-init and never updates token document', () => {
    const refresh = jest.fn();
    const ctrl = new PeekVisionSourceController({ refreshPerception: refresh });
    const update = jest.fn();
    const token = {
      document: { id: 't', update, x: 0, y: 0, width: 1, height: 1, elevation: 0 },
      initializeVisionSource: jest.fn(),
    };
    ctrl.apply(token, { origin: { x: 10, y: 20 }, direction: 0, fov: 90, ignoredWallIds: [] });
    expect(token.initializeVisionSource).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  test('clear is idempotent and never updates token document', () => {
    const refresh = jest.fn();
    const ctrl = new PeekVisionSourceController({ refreshPerception: refresh });
    const update = jest.fn();
    const token = { document: { id: 't', update }, initializeVisionSource: jest.fn() };
    ctrl.clear(token);
    ctrl.clear(token);
    expect(update).not.toHaveBeenCalled();
  });

  test('apply then repeated clear re-inits exactly twice and never updates token document', () => {
    const refresh = jest.fn();
    const ctrl = new PeekVisionSourceController({ refreshPerception: refresh });
    const update = jest.fn();
    const token = {
      document: { id: 't', update },
      initializeVisionSource: jest.fn(),
    };
    ctrl.apply(token, { origin: { x: 10, y: 20 }, direction: 0, fov: 90, ignoredWallIds: [] });
    ctrl.clear(token);
    ctrl.clear(token);
    expect(token.initializeVisionSource).toHaveBeenCalledTimes(2);
    expect(update).not.toHaveBeenCalled();
  });

  test('door peek clears the ignored wall edge sight locally and restores it on end', () => {
    const edge = { sight: 20 };
    const originalCanvas = globalThis.canvas;
    globalThis.canvas = {
      ...originalCanvas,
      walls: { get: (id) => (id === 'door9' ? { edge } : null) },
    };
    try {
      const ctrl = new PeekVisionSourceController({ refreshPerception: jest.fn() });
      const token = { document: { id: 't', update: jest.fn() }, initializeVisionSource: jest.fn() };
      ctrl.apply(token, { origin: { x: 0, y: 0 }, direction: 0, fov: 22, ignoredWallIds: ['door9'] });
      expect(edge.sight).toBe(0);
      ctrl.clear(token);
      expect(edge.sight).toBe(20);
    } finally {
      globalThis.canvas = originalCanvas;
    }
  });

  test('corner peek (no ignored walls) leaves edges untouched', () => {
    const edge = { sight: 20 };
    const originalCanvas = globalThis.canvas;
    globalThis.canvas = {
      ...originalCanvas,
      walls: { get: () => ({ edge }) },
    };
    try {
      const ctrl = new PeekVisionSourceController({ refreshPerception: jest.fn() });
      const token = { document: { id: 't', update: jest.fn() }, initializeVisionSource: jest.fn() };
      ctrl.apply(token, { origin: { x: 0, y: 0 }, direction: 0, fov: 10, ignoredWallIds: [] });
      expect(edge.sight).toBe(20);
    } finally {
      globalThis.canvas = originalCanvas;
    }
  });
});
