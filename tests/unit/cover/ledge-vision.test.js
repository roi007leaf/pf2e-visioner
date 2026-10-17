import '../../setup.js';
import { ledgeBlocksSight } from '../../../scripts/cover/ledge/ledge-vision.js';

function ledgeWall(c, ledgeElevation) {
  return { coords: c, document: { c, flags: { 'pf2e-visioner': { ledge: true, ledgeElevation } } } };
}

describe('ledgeBlocksSight', () => {
  const below = { bottom: 0, top: 5 };
  const above = { bottom: 20, top: 25 };

  test('creature hugging the base of a tall cliff is out of sight from above', () => {
    expect(
      ledgeBlocksSight({
        observerSpan: above,
        targetSpan: below,
        p1: { x: 300, y: 0 },
        p2: { x: 0, y: 0 },
        walls: [ledgeWall([25, -50, 25, 50], 20)],
      }),
    ).toBe(true);
  });

  test('partially visible creature stays in sight', () => {
    expect(
      ledgeBlocksSight({
        observerSpan: { bottom: 10, top: 15 },
        targetSpan: below,
        p1: { x: 300, y: 0 },
        p2: { x: 0, y: 0 },
        walls: [ledgeWall([250, -50, 250, 50], 10)],
      }),
    ).toBe(false);
  });

  test('no ledge crossed means no block', () => {
    expect(
      ledgeBlocksSight({
        observerSpan: above,
        targetSpan: below,
        p1: { x: 300, y: 0 },
        p2: { x: 0, y: 0 },
        walls: [ledgeWall([25, 100, 25, 200], 20)],
      }),
    ).toBe(false);
  });

  test('missing spans never block', () => {
    expect(
      ledgeBlocksSight({
        observerSpan: null,
        targetSpan: below,
        p1: { x: 300, y: 0 },
        p2: { x: 0, y: 0 },
        walls: [ledgeWall([25, -50, 25, 50], 20)],
      }),
    ).toBe(false);
  });
});
