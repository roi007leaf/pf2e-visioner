import '../../../setup.js';
import { isPointInCone } from '../../../../scripts/services/Peek/peek-geometry.js';
import { clampCornerPeek } from '../../../../scripts/services/Peek/peek-geometry.js';
import { distancePointToSegment, isWithinDoorPeekRange } from '../../../../scripts/services/Peek/peek-geometry.js';
import { pullBackOrigin } from '../../../../scripts/services/Peek/peek-geometry.js';
import { clampDirectionToArc } from '../../../../scripts/services/Peek/peek-geometry.js';

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

import { clampDoorPeek } from '../../../../scripts/services/Peek/peek-geometry.js';

describe('clampDoorPeek', () => {
  const door = { c: [0, 0, 0, 100] };

  test('origin is near the door midpoint', () => {
    const out = clampDoorPeek({ door, tokenCenter: { x: -50, y: 50 }, nudge: 5, fov: 60 });
    expect(out.origin.y).toBeCloseTo(50, 0);
    expect(Math.abs(out.origin.x)).toBeLessThanOrEqual(6);
  });

  test("origin stays on the token's side of the wall (not past it)", () => {
    const out = clampDoorPeek({ door, tokenCenter: { x: -50, y: 50 }, nudge: 5, fov: 60 });
    expect(out.origin.x).toBeLessThan(0);
  });

  test('direction points away from the token through the door', () => {
    const out = clampDoorPeek({ door, tokenCenter: { x: -50, y: 50 }, nudge: 5, fov: 60 });
    expect(Math.cos(out.direction)).toBeGreaterThan(0);
  });

  test('fov passed through', () => {
    const out = clampDoorPeek({ door, tokenCenter: { x: -50, y: 50 }, nudge: 5, fov: 60 });
    expect(out.fov).toBe(60);
  });
});

describe('clampDirectionToArc', () => {
  test('within the arc is unchanged', () => {
    expect(clampDirectionToArc(0, 0.3, 0.7)).toBeCloseTo(0.3, 5);
  });
  test('clamps to +maxSweep when target is too far CCW', () => {
    expect(clampDirectionToArc(0, 1.5, 0.7)).toBeCloseTo(0.7, 5);
  });
  test('clamps to -maxSweep when target is too far CW', () => {
    expect(clampDirectionToArc(0, -1.5, 0.7)).toBeCloseTo(-0.7, 5);
  });
  test('handles the +/-PI wraparound (close across the seam stays small)', () => {
    const out = clampDirectionToArc(3.0, -3.0, 0.7);
    const delta = Math.atan2(Math.sin(out - 3.0), Math.cos(out - 3.0));
    expect(Math.abs(delta)).toBeLessThanOrEqual(0.7 + 1e-9);
  });
});

describe('clampDoorPeek aim', () => {
  const door = { c: [0, 0, 0, 100] };
  const tokenCenter = { x: -50, y: 50 };
  const maxSweep = (40 * Math.PI) / 180;

  test('aim slightly off the normal stays within sweep of base', () => {
    const out = clampDoorPeek({ door, tokenCenter, nudge: 5, fov: 22, aim: { x: 100, y: 60 }, maxSweep });
    const base = 0;
    const delta = Math.atan2(Math.sin(out.direction - base), Math.cos(out.direction - base));
    expect(Math.abs(delta)).toBeLessThanOrEqual(maxSweep + 1e-9);
    expect(Math.abs(delta)).toBeGreaterThan(0);
  });

  test('aim far to one side clamps to exactly base+maxSweep', () => {
    const out = clampDoorPeek({ door, tokenCenter, nudge: 5, fov: 22, aim: { x: 100, y: 1000 }, maxSweep });
    expect(out.direction).toBeCloseTo(maxSweep, 5);
  });
});

describe('door peek range', () => {
  const door = { c: [0, 0, 0, 100] };

  test('distancePointToSegment: perpendicular distance to the segment body', () => {
    expect(distancePointToSegment({ x: 30, y: 50 }, door.c)).toBeCloseTo(30, 5);
  });

  test('distancePointToSegment: clamps to nearest endpoint when beyond the segment', () => {
    expect(distancePointToSegment({ x: 0, y: 200 }, door.c)).toBeCloseTo(100, 5);
  });

  test('distancePointToSegment: zero-length segment falls back to point distance', () => {
    expect(distancePointToSegment({ x: 3, y: 4 }, [0, 0, 0, 0])).toBeCloseTo(5, 5);
  });

  test('isWithinDoorPeekRange: true when within maxDistance', () => {
    expect(isWithinDoorPeekRange({ x: 40, y: 50 }, door, 150)).toBe(true);
  });

  test('isWithinDoorPeekRange: false when beyond maxDistance', () => {
    expect(isWithinDoorPeekRange({ x: 400, y: 50 }, door, 150)).toBe(false);
  });
});

describe('pullBackOrigin', () => {
  test('pulls the origin back by the margin along the from->hit ray', () => {
    const out = pullBackOrigin({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 0 }, 2);
    expect(out.x).toBeCloseTo(48, 5);
    expect(out.y).toBeCloseTo(0, 5);
  });

  test('preserves to.elevation when present', () => {
    const out = pullBackOrigin({ x: 0, y: 0 }, { x: 100, y: 0, elevation: 30 }, { x: 50, y: 0 }, 2);
    expect(out.elevation).toBe(30);
  });

  test('from === hit (zero length) returns the from point without NaN', () => {
    const out = pullBackOrigin({ x: 10, y: 20 }, { x: 100, y: 0 }, { x: 10, y: 20 }, 2);
    expect(out).toEqual({ x: 10, y: 20 });
  });

  test('margin larger than distance clamps back to the from point', () => {
    const out = pullBackOrigin({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 1, y: 0 }, 5);
    expect(out.x).toBeCloseTo(0, 5);
    expect(out.y).toBeCloseTo(0, 5);
  });
});
