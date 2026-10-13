import '../../../setup.js';
import {
  applyPeekOverrideToData,
  createPeekLightSourceDataWrapper,
  createPeekSourceInitializeWrapper,
  createPeekVisionPolygonConfigurationWrapper,
  radiansToFoundryRotation,
} from '../../../../scripts/services/Peek/peek-vision-wrapper.js';

function coneCenterRadians(rotationDegrees) {
  return (((rotationDegrees + 90) % 360) + 360) % 360;
}

describe('radiansToFoundryRotation', () => {
  test('east (0 rad) yields a cone centered east', () => {
    expect(coneCenterRadians(radiansToFoundryRotation(0))).toBeCloseTo(0, 5);
  });

  test('south (PI/2 rad, canvas y-down) yields a cone centered at 90 deg', () => {
    expect(coneCenterRadians(radiansToFoundryRotation(Math.PI / 2))).toBeCloseTo(90, 5);
  });

  test('west (PI rad) yields a cone centered at 180 deg', () => {
    expect(coneCenterRadians(radiansToFoundryRotation(Math.PI))).toBeCloseTo(180, 5);
  });

  test('result is normalized to [0, 360)', () => {
    const r = radiansToFoundryRotation(-Math.PI);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThan(360);
  });
});

describe('applyPeekOverrideToData', () => {
  test('positive range sets data.radius', () => {
    const data = applyPeekOverrideToData({}, { origin: { x: 1, y: 2 }, direction: 0, fov: 10, range: 400 });
    expect(data.radius).toBe(400);
  });

  test('numeric fov keeps the core source full-angle so the controller can apply a cone without external-radius bleed', () => {
    const data = applyPeekOverrideToData(
      { angle: 90 },
      { origin: { x: 1, y: 2 }, direction: 0, fov: 10, range: 400 },
    );
    expect(data.angle).toBe(360);
  });

  test('door range preserves core external radius for proximity and distance wall thresholds', () => {
    const data = applyPeekOverrideToData(
      { externalRadius: 50 },
      { origin: { x: 1, y: 2 }, direction: 0, fov: 10, range: 400 },
    );
    expect(data.externalRadius).toBe(50);
  });

  test('range 0 leaves data.radius undefined', () => {
    const data = applyPeekOverrideToData({}, { origin: { x: 1, y: 2 }, direction: 0, fov: 10, range: 0 });
    expect(data.radius).toBeUndefined();
  });

  test('corner peek preserves core external radius independently of sight range', () => {
    const data = applyPeekOverrideToData(
      { radius: 1200, externalRadius: 50 },
      { origin: { x: 1, y: 2 }, direction: 0, fov: null, range: 0 },
    );
    expect(data.radius).toBe(1200);
    expect(data.externalRadius).toBe(50);
  });

  test('range 0 does not shrink an external radius that is already larger than the sight radius (non-darkvision token in darkness)', () => {
    const data = applyPeekOverrideToData(
      { radius: 5, externalRadius: 400 },
      { origin: { x: 1, y: 2 }, direction: 0, fov: null, range: 0 },
    );
    expect(data.radius).toBe(5);
    expect(data.externalRadius).toBe(400);
  });

  test('darkness fallback must not enlarge external radius used by wall thresholds', () => {
    const originalCanvas = globalThis.canvas;
    globalThis.canvas = { ...originalCanvas, dimensions: { ...originalCanvas.dimensions, maxR: 6490 } };
    try {
      const data = applyPeekOverrideToData(
        { radius: 0, externalRadius: 25 },
        { origin: { x: 1, y: 2 }, direction: 0, fov: null, range: 0 },
      );
      expect(data.radius).toBe(0);
      expect(data.externalRadius).toBe(25);
    } finally {
      globalThis.canvas = originalCanvas;
    }
  });

  test('missing origin returns data unchanged', () => {
    const data = applyPeekOverrideToData({}, { direction: 0, fov: 10, range: 400 });
    expect(data).toEqual({});
  });
});

describe('createPeekLightSourceDataWrapper', () => {
  test('applies peek origin and rotation to token light source data', () => {
    const override = { origin: { x: 10, y: 20 }, direction: 0, fov: 1, range: 400 };
    const controller = { getOverride: jest.fn(() => override) };
    const wrapper = createPeekLightSourceDataWrapper(controller);
    const data = wrapper.call({ document: { id: 't' } }, () => ({ x: 1, y: 2, angle: 90, externalRadius: 25 }));

    expect(data.x).toBe(10);
    expect(data.y).toBe(20);
    expect(data.angle).toBe(360);
    expect(data.radius).toBe(400);
    expect(data.externalRadius).toBe(25);
    expect(coneCenterRadians(data.rotation)).toBeCloseTo(0, 5);
  });
});

describe('createPeekSourceInitializeWrapper', () => {
  test('reapplies peek clamp after core reinitializes an active vision source directly', () => {
    const token = { document: { id: 't' } };
    const controller = {
      getOverride: jest.fn(() => ({ origin: { x: 10, y: 20 }, direction: 0, fov: 1 })),
      constrainToken: jest.fn(),
    };
    const wrapper = createPeekSourceInitializeWrapper(controller);
    const wrapped = jest.fn(function wrappedInitialize() {
      this.shape = { points: [0, 0, 500, 0, 500, 500, 0, 500] };
      return this;
    });
    const source = { object: token };

    const result = wrapper.call(source, wrapped);

    expect(result).toBe(source);
    expect(wrapped).toHaveBeenCalled();
    expect(controller.constrainToken).toHaveBeenCalledWith(token);
  });

  test('does nothing for sources whose token has no active peek override', () => {
    const token = { document: { id: 't' } };
    const controller = {
      getOverride: jest.fn(() => null),
      constrainToken: jest.fn(),
    };
    const wrapper = createPeekSourceInitializeWrapper(controller);

    wrapper.call({ object: token }, jest.fn());

    expect(controller.constrainToken).not.toHaveBeenCalled();
  });
});

describe('peek darkness polygon configuration', () => {
  test.each([0, 400])('darkness fallback expands LOS radius only (peek range %s)', (range) => {
    const previousCanvas = global.canvas;
    global.canvas = { dimensions: { maxR: 6490 } };
    try {
      const wrapper = createPeekVisionPolygonConfigurationWrapper({ getOverride: () => ({ range }) });
      const config = { radius: 25, externalRadius: 25, useThreshold: true, level: { id: 'level' } };
      const source = { object: { document: { id: 't' } }, blinded: { darkness: true }, data: {} };
      const result = wrapper.call(source, () => config);
      expect(result.radius).toBe(range || 6490);
      expect(result.externalRadius).toBe(25);
      expect(result.useThreshold).toBe(true);
      expect(result.level).toBe(config.level);
    } finally { global.canvas = previousCanvas; }
  });

  test.each([
    { blinded: { darkness: false }, data: {} },
    { blinded: { darkness: true }, data: { disabled: true } },
    { blinded: { darkness: true }, data: {}, suppressed: true },
  ])('preserves ordinary, disabled and suppressed vision configuration (%j)', (source) => {
    const wrapper = createPeekVisionPolygonConfigurationWrapper({ getOverride: () => ({ range: 400 }) });
    const config = { radius: 0, externalRadius: 25, useThreshold: true };
    expect(wrapper.call({ ...source, object: { document: { id: 't' } } }, () => config)).toEqual({ radius: 0, externalRadius: 25, useThreshold: true });
  });

  test('leaves non-peeking darkness fallback untouched', () => {
    const wrapper = createPeekVisionPolygonConfigurationWrapper({ getOverride: () => null });
    const config = { radius: 25, externalRadius: 25 };
    const source = { object: { document: { id: 't' } }, blinded: { darkness: true }, data: {} };
    expect(wrapper.call(source, () => config)).toBe(config);
    expect(config.radius).toBe(25);
  });
});
