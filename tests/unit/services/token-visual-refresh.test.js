import { jest } from '@jest/globals';
import {
  canRefreshTokenVisual,
  isTokenInCurrentViewport,
  refreshTokenVisual,
  refreshTokenVisuals,
} from '../../../scripts/services/token-visual-refresh.js';

describe('token visual refresh helpers', () => {
  function makeCanvas() {
    return {
      app: {
        renderer: {
          screen: { width: 1000, height: 1000 },
        },
      },
      stage: {
        worldTransform: {
          applyInverse: jest.fn((point) => ({ x: point.x, y: point.y })),
        },
      },
      grid: { size: 50 },
    };
  }

  function makeToken(id, x = 100, y = 100) {
    return {
      id,
      x,
      y,
      document: { id, width: 1, height: 1 },
      sprite: {},
      mesh: {},
      refresh: jest.fn(),
    };
  }

  test('detects tokens inside viewport using document position fallback', () => {
    const canvasRef = makeCanvas();
    const token = makeToken('inside');

    expect(isTokenInCurrentViewport(token, { canvasRef })).toBe(true);
  });

  test('skips tokens when viewport transform is unavailable', () => {
    expect(isTokenInCurrentViewport(makeToken('token'), { canvasRef: {} })).toBe(false);
  });

  test('honors default visible semantics used by main visual effects', () => {
    expect(canRefreshTokenVisual({ ...makeToken('visible'), visible: undefined })).toBe(true);
    expect(canRefreshTokenVisual({ ...makeToken('hidden'), visible: false })).toBe(false);
  });

  test('honors strict visible semantics used by optimized broad refresh', () => {
    expect(
      canRefreshTokenVisual(
        { ...makeToken('implicit'), visible: undefined },
        {
          requireVisibleTrue: true,
        },
      ),
    ).toBe(false);
    expect(
      canRefreshTokenVisual(
        { ...makeToken('visible'), visible: true },
        { requireVisibleTrue: true },
      ),
    ).toBe(true);
  });

  test('skips destroyed, unrendered, and turn-marker-incomplete tokens', () => {
    expect(canRefreshTokenVisual({ ...makeToken('destroyed'), destroyed: true })).toBe(false);
    expect(canRefreshTokenVisual({ ...makeToken('no-sprite'), sprite: null })).toBe(false);
    expect(canRefreshTokenVisual({ ...makeToken('no-mesh'), mesh: null })).toBe(false);
    expect(canRefreshTokenVisual({ ...makeToken('bad-marker'), turnMarker: {} })).toBe(false);
  });

  test('refreshes only eligible tokens in viewport', () => {
    const canvasRef = makeCanvas();
    const inside = makeToken('inside', 100, 100);
    const outside = makeToken('outside', 5000, 5000);

    expect(refreshTokenVisual(inside, { canvasRef })).toBe(true);
    expect(refreshTokenVisual(outside, { canvasRef })).toBe(false);
    expect(inside.refresh).toHaveBeenCalledTimes(1);
    expect(outside.refresh).not.toHaveBeenCalled();
  });

  test('returns count for batch refreshes', () => {
    const canvasRef = makeCanvas();
    const inside = makeToken('inside', 100, 100);
    const outside = makeToken('outside', 5000, 5000);

    expect(refreshTokenVisuals([inside, outside], { canvasRef })).toBe(1);
  });
});
