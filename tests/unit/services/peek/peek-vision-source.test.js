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

  test('apply clamps LOS points to peek FOV points for roof occlusion consumers', () => {
    const refresh = jest.fn();
    const ctrl = new PeekVisionSourceController({ refreshPerception: refresh });
    const token = {
      document: { id: 't', update: jest.fn(), x: 0, y: 0, width: 1, height: 1, elevation: 0 },
      vision: {
        los: { points: [0, 0, 500, 0, 500, 500, 0, 500] },
        fov: { points: [10, 10, 60, 20, 20, 60] },
      },
      initializeVisionSource: jest.fn(),
    };

    ctrl.apply(token, { origin: { x: 10, y: 20 }, direction: 0, fov: 10, ignoredWallIds: [] });

    expect(token.vision.los.points).toEqual([10, 10, 60, 20, 20, 60]);
    expect(token.vision.los.points).not.toBe(token.vision.fov.points);
  });

  test('apply delegates LOS geometry through peek FOV without bypassing wall-constrained LOS', () => {
    const refresh = jest.fn();
    const ctrl = new PeekVisionSourceController({ refreshPerception: refresh });
    const token = {
      document: { id: 't', update: jest.fn(), x: 0, y: 0, width: 1, height: 1, elevation: 0 },
      vision: {
        los: {
          points: [0, 0, 500, 0, 500, 500, 0, 500],
          bounds: { x: 0, y: 0, width: 500, height: 500 },
          contains: jest.fn((x) => x < 100),
          containsPoint: jest.fn((point) => point.x < 100),
          intersectCircle: jest.fn((circle) =>
            circle.x < 100 ? { points: [10, 10, 20, 20] } : { points: [] },
          ),
        },
        fov: {
          points: [10, 10, 60, 20, 20, 60],
          bounds: { x: 10, y: 10, width: 50, height: 50 },
          contains: jest.fn(() => true),
          containsPoint: jest.fn(() => true),
          intersectCircle: jest.fn(() => ({ points: [0, 0, 1, 1] })),
        },
      },
      initializeVisionSource: jest.fn(),
    };

    ctrl.apply(token, { origin: { x: 10, y: 20 }, direction: 0, fov: 10, ignoredWallIds: [] });

    expect(token.vision.los.contains(50, 400)).toBe(true);
    expect(token.vision.los.contains(400, 400)).toBe(false);
    expect(token.vision.los.containsPoint({ x: 50, y: 400 })).toBe(true);
    expect(token.vision.los.containsPoint({ x: 400, y: 400 })).toBe(false);
    expect(token.vision.los.intersectCircle({ x: 50, y: 400, radius: 20 }).points).toEqual([
      0, 0, 1, 1,
    ]);
    expect(token.vision.los.intersectCircle({ x: 400, y: 400, radius: 20 }).points).toEqual([]);
    expect(token.vision.los.bounds).toBe(token.vision.fov.bounds);
  });

  test('apply snapshots FOV geometry before overriding shared corner-peek LOS polygon', () => {
    const refresh = jest.fn();
    const ctrl = new PeekVisionSourceController({ refreshPerception: refresh });
    const bounds = { x: 10, y: 10, width: 50, height: 50 };
    const contains = jest.fn((x) => x < 100);
    const getBounds = jest.fn(() => bounds);
    const sharedPolygon = {
      points: [10, 10, 60, 20, 20, 60],
      bounds,
      contains,
      getBounds,
    };
    const token = {
      document: { id: 't', update: jest.fn(), x: 0, y: 0, width: 1, height: 1, elevation: 0 },
      vision: {
        los: sharedPolygon,
        fov: sharedPolygon,
      },
      initializeVisionSource: jest.fn(),
    };

    ctrl.apply(token, { origin: { x: 10, y: 20 }, direction: 0, fov: 10, ignoredWallIds: [] });
    ctrl.apply(token, { origin: { x: 10, y: 20 }, direction: 0, fov: 10, ignoredWallIds: [] });
    contains.mockClear();
    getBounds.mockClear();

    expect(token.vision.los.contains(50, 400)).toBe(true);
    expect(token.vision.los.contains(400, 400)).toBe(false);
    expect(token.vision.los.getBounds()).toBe(bounds);
    expect(contains.mock.calls.length).toBeLessThanOrEqual(4);
    expect(getBounds).toHaveBeenCalled();
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
