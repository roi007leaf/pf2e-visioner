import '../../../setup.js';
import { PeekVisionSourceController } from '../../../../scripts/services/Peek/PeekVisionSourceController.js';

describe('PeekVisionSourceController contract', () => {
  test('apply requests source re-init and never updates token document', () => {
    const refresh = jest.fn();
    const ctrl = new PeekVisionSourceController({ refreshPerception: refresh });
    const update = jest.fn();
    const token = {
      document: { id: 't', update, x: 0, y: 0, width: 1, height: 1, elevation: 0 },
      initializeVisionSource: jest.fn(),
      initializeLightSource: jest.fn(),
    };
    ctrl.apply(token, { origin: { x: 10, y: 20 }, direction: 0, fov: 90, ignoredWallIds: [] });
    expect(token.initializeVisionSource).toHaveBeenCalled();
    expect(token.initializeLightSource).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  test('default refresh does not reinitialize sources after applying the local peek clamp', () => {
    const originalCanvas = globalThis.canvas;
    const update = jest.fn();
    globalThis.canvas = {
      ...originalCanvas,
      perception: { update },
    };
    try {
      const ctrl = new PeekVisionSourceController();
      const token = {
        document: { id: 't', update: jest.fn(), x: 0, y: 0, width: 1, height: 1, elevation: 0 },
        initializeVisionSource: jest.fn(),
        initializeLightSource: jest.fn(),
      };
      ctrl.apply(token, { origin: { x: 10, y: 20 }, direction: 0, fov: 90, ignoredWallIds: [] });

      expect(update).toHaveBeenCalledWith({ refreshVision: true, refreshLighting: true });
      expect(update.mock.calls[0][0]).not.toHaveProperty('initializeVision');
      expect(update.mock.calls[0][0]).not.toHaveProperty('initializeLighting');
    } finally {
      globalThis.canvas = originalCanvas;
    }
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

  test('door peek applies its own cone constraint so expanded external radius cannot add full-circle sight', () => {
    const refresh = jest.fn();
    const ctrl = new PeekVisionSourceController({ refreshPerception: refresh });
    const originalPixi = globalThis.PIXI;
    class Polygon {
      constructor(points) {
        this.points = points;
      }
    }
    const constrained = {
      points: [10, 10, 60, 20, 20, 60],
      bounds: { x: 10, y: 10, width: 50, height: 50 },
      contains: jest.fn(() => true),
    };
    const los = {
      points: [0, 0, 500, 0, 500, 500, 0, 500],
      bounds: { x: 0, y: 0, width: 500, height: 500 },
      config: { radius: 1200 },
      applyConstraint: jest.fn(() => constrained),
      contains: jest.fn(() => true),
    };
    const token = {
      document: { id: 't', update: jest.fn(), x: 0, y: 0, width: 1, height: 1, elevation: 0 },
      vision: {
        los,
        fov: { points: [0, 0, 500, 0, 500, 500, 0, 500] },
        shape: { points: [0, 0, 500, 0, 500, 500, 0, 500] },
      },
      initializeVisionSource: jest.fn(),
    };
    globalThis.PIXI = { ...originalPixi, Polygon };
    try {
      ctrl.apply(token, { origin: { x: 10, y: 20 }, direction: 0, fov: 10, range: 400, ignoredWallIds: ['door1'] });
      expect(los.applyConstraint).toHaveBeenCalledWith(expect.any(Polygon));
      expect(token.vision.shape).toBe(constrained);
      expect(token.vision.los.points).toEqual(constrained.points);
    } finally {
      globalThis.PIXI = originalPixi;
    }
  });

  test('door peek falls back to a generated slit cone when LOS cannot apply constraints', () => {
    const refresh = jest.fn();
    const ctrl = new PeekVisionSourceController({ refreshPerception: refresh });
    const originalPixi = globalThis.PIXI;
    class Polygon {
      constructor(points) {
        this.points = points;
      }

      contains(x, y) {
        return x >= 10 && y >= 20 && y <= 120;
      }
    }
    const fullFoundryFov = {
      points: [0, 0, 500, 0, 500, 500, 0, 500],
      contains: jest.fn(() => true),
    };
    const los = {
      points: [0, 0, 500, 0, 500, 500, 0, 500],
      bounds: { x: 0, y: 0, width: 500, height: 500 },
      config: { radius: 400 },
      contains: jest.fn(() => true),
    };
    const token = {
      document: { id: 't', update: jest.fn(), x: 0, y: 0, width: 1, height: 1, elevation: 0 },
      vision: {
        los,
        fov: fullFoundryFov,
        shape: fullFoundryFov,
      },
      initializeVisionSource: jest.fn(),
    };
    globalThis.PIXI = { ...originalPixi, Polygon };
    try {
      ctrl.apply(token, {
        origin: { x: 10, y: 20 },
        direction: 0,
        fov: 10,
        range: 400,
        ignoredWallIds: ['door1'],
      });

      expect(token.vision.los.points).not.toEqual(fullFoundryFov.points);
      expect(token.vision.los.points.slice(0, 2)).toEqual([10, 20]);
      expect(token.vision.fov).toBeInstanceOf(Polygon);
      expect(token.vision.shape).toBe(token.vision.fov);
      expect(token.vision.los.contains(20, 40)).toBe(true);
      expect(token.vision.los.contains(5, 40)).toBe(false);
    } finally {
      globalThis.PIXI = originalPixi;
    }
  });

  test('door peek clamps light perception and rendered geometry to the slit cone', () => {
    const refresh = jest.fn();
    const ctrl = new PeekVisionSourceController({ refreshPerception: refresh });
    const originalPixi = globalThis.PIXI;
    class Polygon {
      constructor(points) {
        this.points = points;
      }
    }
    const constrained = {
      points: [10, 20, 410, 18, 410, 22],
      bounds: { x: 10, y: 18, width: 400, height: 4 },
      config: { radius: 400 },
      contains: jest.fn(() => true),
    };
    const fullLight = {
      points: [0, 0, 500, 0, 500, 500, 0, 500],
      contains: jest.fn(() => true),
    };
    const los = {
      points: [0, 0, 500, 0, 500, 500, 0, 500],
      bounds: { x: 0, y: 0, width: 500, height: 500 },
      config: { radius: 400 },
      applyConstraint: jest.fn(() => constrained),
      contains: jest.fn(() => true),
    };
    const token = {
      document: { id: 't', update: jest.fn(), x: 0, y: 0, width: 1, height: 1, elevation: 0 },
      vision: {
        los,
        fov: fullLight,
        shape: fullLight,
        light: fullLight,
        _updateGeometry: jest.fn(),
      },
      light: {
        shape: fullLight,
        _visualShape: fullLight,
        _updateGeometry: jest.fn(),
      },
      initializeVisionSource: jest.fn(),
      initializeLightSource: jest.fn(),
    };
    globalThis.PIXI = { ...originalPixi, Polygon };
    try {
      ctrl.apply(token, {
        origin: { x: 10, y: 20 },
        direction: 0,
        fov: 1,
        range: 400,
        ignoredWallIds: ['door1'],
      });

      expect(token.vision.shape).toBe(constrained);
      expect(token.vision.light).toBe(constrained);
      expect(token.vision._updateGeometry).toHaveBeenCalled();
      expect(token.initializeLightSource).toHaveBeenCalled();
      expect(token.light.shape).toBe(constrained);
      expect(token.light._visualShape).toBe(constrained);
      expect(token.light._updateGeometry).toHaveBeenCalled();
    } finally {
      globalThis.PIXI = originalPixi;
    }
  });

  test('active door peek reclamps after core rebuilds full source polygons', () => {
    const refresh = jest.fn();
    const ctrl = new PeekVisionSourceController({ refreshPerception: refresh });
    const originalPixi = globalThis.PIXI;
    class Polygon {
      constructor(points) {
        this.points = points;
      }
    }
    const token = {
      document: { id: 't', update: jest.fn(), x: 0, y: 0, width: 1, height: 1, elevation: 0 },
      vision: {
        los: {
          points: [0, 0, 500, 0, 500, 500, 0, 500],
          config: { radius: 400 },
          contains: jest.fn(() => true),
        },
        fov: { points: [0, 0, 500, 0, 500, 500, 0, 500] },
        shape: { points: [0, 0, 500, 0, 500, 500, 0, 500] },
        light: { points: [0, 0, 500, 0, 500, 500, 0, 500] },
        _updateGeometry: jest.fn(),
      },
      light: {
        shape: { points: [0, 0, 500, 0, 500, 500, 0, 500] },
        _visualShape: { points: [0, 0, 500, 0, 500, 500, 0, 500] },
        _updateGeometry: jest.fn(),
      },
      initializeVisionSource: jest.fn(),
      initializeLightSource: jest.fn(),
    };
    globalThis.PIXI = { ...originalPixi, Polygon };
    try {
      ctrl.apply(token, {
        origin: { x: 10, y: 20 },
        direction: 0,
        fov: 1,
        range: 400,
        ignoredWallIds: ['door1'],
      });
      const firstSlit = token.vision.fov;
      const rebuiltFull = { points: [0, 0, 500, 0, 500, 500, 0, 500] };
      token.vision.los = { ...rebuiltFull, config: { radius: 400 }, contains: jest.fn(() => true) };
      token.vision.fov = rebuiltFull;
      token.vision.shape = rebuiltFull;
      token.vision.light = rebuiltFull;
      token.light.shape = rebuiltFull;
      token.light._visualShape = rebuiltFull;

      ctrl.constrainToken(token);

      expect(token.vision.fov).toBeInstanceOf(Polygon);
      expect(token.vision.fov).not.toBe(firstSlit);
      expect(token.vision.fov.points).not.toEqual(rebuiltFull.points);
      expect(token.vision.shape).toBe(token.vision.fov);
      expect(token.vision.light).toBe(token.vision.fov);
      expect(token.light.shape).toBe(token.vision.fov);
      expect(token.light._visualShape).toBe(token.vision.fov);
    } finally {
      globalThis.PIXI = originalPixi;
    }
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
