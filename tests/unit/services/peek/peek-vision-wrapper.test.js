import '../../../setup.js';
import {
  applyPeekOverrideToData,
  createPeekLightSourceDataWrapper,
  createPeekSourceInitializeWrapper,
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

  test('positive range also expands external radius for darkness fallback geometry', () => {
    const data = applyPeekOverrideToData(
      { externalRadius: 50 },
      { origin: { x: 1, y: 2 }, direction: 0, fov: 10, range: 400 },
    );
    expect(data.externalRadius).toBe(400);
  });

  test('range 0 leaves data.radius undefined', () => {
    const data = applyPeekOverrideToData({}, { origin: { x: 1, y: 2 }, direction: 0, fov: 10, range: 0 });
    expect(data.radius).toBeUndefined();
  });

  test('range 0 mirrors existing sight radius into external radius for corner peeks', () => {
    const data = applyPeekOverrideToData(
      { radius: 1200, externalRadius: 50 },
      { origin: { x: 1, y: 2 }, direction: 0, fov: null, range: 0 },
    );
    expect(data.radius).toBe(1200);
    expect(data.externalRadius).toBe(1200);
  });

  test('range 0 does not shrink an external radius that is already larger than the sight radius (non-darkvision token in darkness)', () => {
    const data = applyPeekOverrideToData(
      { radius: 5, externalRadius: 400 },
      { origin: { x: 1, y: 2 }, direction: 0, fov: null, range: 0 },
    );
    expect(data.radius).toBe(5);
    expect(data.externalRadius).toBe(400);
  });

  test('range 0 falls back to the scene max radius when the token has no usable sight radius at all (non-darkvision token blinded by darkness)', () => {
    const originalCanvas = globalThis.canvas;
    globalThis.canvas = { ...originalCanvas, dimensions: { ...originalCanvas.dimensions, maxR: 6490 } };
    try {
      const data = applyPeekOverrideToData(
        { radius: 0, externalRadius: 25 },
        { origin: { x: 1, y: 2 }, direction: 0, fov: null, range: 0 },
      );
      expect(data.radius).toBe(0);
      expect(data.externalRadius).toBe(6490);
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
    const data = wrapper.call({ document: { id: 't' } }, () => ({ x: 1, y: 2, angle: 90 }));

    expect(data.x).toBe(10);
    expect(data.y).toBe(20);
    expect(data.angle).toBe(360);
    expect(data.radius).toBe(400);
    expect(data.externalRadius).toBe(400);
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
