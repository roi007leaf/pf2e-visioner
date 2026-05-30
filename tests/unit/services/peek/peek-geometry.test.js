import '../../../setup.js';
import { isPointInCone } from '../../../../scripts/services/Peek/peek-geometry.js';

describe('isPointInCone', () => {
  const origin = { x: 0, y: 0 };

  test('point straight ahead within fov is inside', () => {
    expect(isPointInCone(origin, 0, 90, { x: 100, y: 0 })).toBe(true);
  });

  test('point within half-fov edge is inside', () => {
    expect(isPointInCone(origin, 0, 90, { x: 100, y: 90 })).toBe(true);
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
