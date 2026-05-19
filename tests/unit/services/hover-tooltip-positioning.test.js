import {
  createTooltipPositionPoint,
  getRoundedTooltipTransform,
  setTooltipBadgeTransform,
  toGlobalTooltipPoint,
} from '../../../scripts/services/HoverTooltip/hover-tooltip-positioning.js';

describe('hover tooltip positioning', () => {
  test('rounds badge transforms consistently', () => {
    expect(getRoundedTooltipTransform(12.4, 33.6)).toBe('translate(12px, 34px)');
  });

  test('skips DOM transform writes when position is unchanged', () => {
    const element = document.createElement('div');

    expect(setTooltipBadgeTransform(element, 12.4, 33.6)).toBe(true);
    expect(element.style.transform).toBe('translate(12px, 34px)');
    expect(setTooltipBadgeTransform(element, 12.49, 33.51)).toBe(false);
    expect(element.style.transform).toBe('translate(12px, 34px)');
    expect(setTooltipBadgeTransform(element, 13, 34)).toBe(true);
    expect(element.style.transform).toBe('translate(13px, 34px)');
  });

  test('reuses one world point for canvas global conversion', () => {
    const point = createTooltipPositionPoint({
      Point: class Point {
        constructor(x, y) {
          this.x = x;
          this.y = y;
        }
      },
    });
    const tokensLayer = {
      toGlobal: jest.fn((candidate) => ({
        x: candidate.x + 10,
        y: candidate.y + 20,
        source: candidate,
      })),
    };

    const first = toGlobalTooltipPoint(tokensLayer, point, 5, 7);
    const second = toGlobalTooltipPoint(tokensLayer, point, 8, 9);

    expect(first).toEqual({ x: 15, y: 27, source: point });
    expect(second).toEqual({ x: 18, y: 29, source: point });
    expect(tokensLayer.toGlobal).toHaveBeenCalledTimes(2);
    expect(tokensLayer.toGlobal.mock.calls[0][0]).toBe(point);
    expect(tokensLayer.toGlobal.mock.calls[1][0]).toBe(point);
  });
});
