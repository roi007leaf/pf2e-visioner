import '../../../setup.js';
import { isPointInCone } from '../../../../scripts/services/Peek/peek-geometry.js';
import { clampCornerPeek } from '../../../../scripts/services/Peek/peek-geometry.js';

describe('isPointInCone', () => {
  const origin = { x: 0, y: 0 };

  test('point straight ahead within fov is inside', () => {
    expect(isPointInCone(origin, 0, 90, { x: 100, y: 0 })).toBe(true);
  });

  test('point on exact half-fov boundary is inside', () => {
    expect(isPointInCone(origin, 0, 90, { x: 100, y: 100 })).toBe(true);
  });

  test('vector direction {x:0,y:1} facing +y: point ahead is inside', () => {
    expect(isPointInCone({ x: 0, y: 0 }, { x: 0, y: 1 }, 90, { x: 0, y: 100 })).toBe(true);
  });

  test('vector direction {x:0,y:1} facing +y: point behind is outside', () => {
    expect(isPointInCone({ x: 0, y: 0 }, { x: 0, y: 1 }, 90, { x: 0, y: -100 })).toBe(false);
  });

  test('wrap-around ±180° seam: direction=PI, point at (-100,5) is inside 90° cone', () => {
    expect(isPointInCone(origin, Math.PI, 90, { x: -100, y: 5 })).toBe(true);
  });

  test('wrap-around ±180° seam: direction=PI, point at (5,0) is outside 90° cone', () => {
    expect(isPointInCone(origin, Math.PI, 90, { x: 5, y: 0 })).toBe(false);
  });

  test('point behind is outside', () => {
    expect(isPointInCone(origin, 0, 90, { x: -100, y: 0 })).toBe(false);
  });

  test('point just outside half-fov is outside', () => {
    expect(isPointInCone(origin, 0, 60, { x: 10, y: 100 })).toBe(false);
  });

  test('origin-coincident point is inside (degenerate)', () => {
    expect(isPointInCone(origin, 0, 90, { x: 0, y: 0 })).toBe(true);
  });
});

describe('clampCornerPeek', () => {
  const footprint = { x: 0, y: 0, width: 100, height: 100 };

  test('mouse far to the right snaps origin to a right-edge corner', () => {
    const out = clampCornerPeek({ footprint, gridSize: 100, mouse: { x: 500, y: 50 }, band: 50, fov: 90 });
    expect(out.origin.x).toBeGreaterThanOrEqual(100);
    expect(out.origin.x).toBeLessThanOrEqual(150);
    expect(out.fov).toBe(90);
    expect(out.direction).toBeCloseTo(0, 5);
  });

  test('mouse inside expanded band is used directly as origin', () => {
    const out = clampCornerPeek({ footprint, gridSize: 100, mouse: { x: 120, y: 50 }, band: 50, fov: 90 });
    expect(out.origin).toEqual({ x: 120, y: 50 });
  });

  test('mouse to the lower-left snaps toward the lower-left corner', () => {
    const out = clampCornerPeek({ footprint, gridSize: 100, mouse: { x: -500, y: 600 }, band: 50, fov: 90 });
    expect(out.origin.x).toBeLessThanOrEqual(0);
    expect(out.origin.y).toBeGreaterThanOrEqual(100);
  });

  test('preserves elevation passed through footprint', () => {
    const out = clampCornerPeek({ footprint: { ...footprint, elevation: 30 }, gridSize: 100, mouse: { x: 500, y: 50 }, band: 50, fov: 90 });
    expect(out.origin.elevation).toBe(30);
  });
});
