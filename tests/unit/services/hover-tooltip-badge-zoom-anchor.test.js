import {
  TOOLTIP_BADGE_MIN_ZOOM_SCALE,
  TOOLTIP_BADGE_TOKEN_GAP,
  computeTooltipBadgeRowOrigin,
  computeTooltipBadgeWorldAnchor,
  computeTooltipBadgeZoomScale,
  scaleTooltipBadgeMetrics,
} from '../../../scripts/services/HoverTooltip/hover-tooltip-badge-layout.js';
import { setTooltipBadgeTransform } from '../../../scripts/services/HoverTooltip/hover-tooltip-positioning.js';

describe('tooltip badge zoom scale', () => {
  test('keeps full size at or above zoom 1', () => {
    expect(computeTooltipBadgeZoomScale(1)).toBe(1);
    expect(computeTooltipBadgeZoomScale(2.5)).toBe(1);
  });

  test('shrinks with zoom out down to the minimum', () => {
    expect(computeTooltipBadgeZoomScale(0.8)).toBe(0.8);
    expect(computeTooltipBadgeZoomScale(0.2)).toBe(TOOLTIP_BADGE_MIN_ZOOM_SCALE);
  });

  test('falls back to full size for invalid zoom', () => {
    expect(computeTooltipBadgeZoomScale(undefined)).toBe(1);
    expect(computeTooltipBadgeZoomScale(0)).toBe(1);
  });

  test('scales layout metrics but not border radius', () => {
    expect(
      scaleTooltipBadgeMetrics({ badgeWidth: 30, badgeHeight: 20, spacing: 10, borderRadius: 7 }, 0.5),
    ).toEqual({ badgeWidth: 15, badgeHeight: 10, spacing: 5, borderRadius: 7 });
  });

  test('scale follows translate in one transform so screen position is not scaled', () => {
    const el = document.createElement('div');
    expect(setTooltipBadgeTransform(el, 300, 400, 0.6)).toBe(true);
    expect(el.style.transform).toBe('translate(300px, 400px) scale(0.6)');
    expect(el.style.transformOrigin).toBe('0 0');
    expect(el.style.scale).toBe('');
    expect(setTooltipBadgeTransform(el, 300, 400, 0.6)).toBe(false);
  });
});

describe('tooltip badge anchor', () => {
  const token = { tokenX: 100, tokenY: 200, tokenWidth: 50, tokenHeight: 100 };

  test('anchors to token top edge by default', () => {
    expect(computeTooltipBadgeWorldAnchor(token)).toEqual({ x: 125, y: 200, placement: 'above' });
  });

  test('anchors to token bottom edge when below', () => {
    expect(computeTooltipBadgeWorldAnchor({ ...token, below: true })).toEqual({
      x: 125,
      y: 300,
      placement: 'below',
    });
  });

  test('row above token ends before the token top edge', () => {
    const origin = computeTooltipBadgeRowOrigin({
      canvasRect: { left: 10, top: 20 },
      globalPoint: { x: 100, y: 200 },
      badgeHeight: 24,
    });
    expect(origin).toEqual({ centerX: 110, centerY: 220 - 24 - TOOLTIP_BADGE_TOKEN_GAP });
    expect(origin.centerY + 24).toBeLessThan(220);
  });

  test('row below token starts after the token bottom edge', () => {
    const origin = computeTooltipBadgeRowOrigin({
      canvasRect: { left: 10, top: 20 },
      globalPoint: { x: 100, y: 200 },
      badgeHeight: 24,
      placement: 'below',
    });
    expect(origin).toEqual({ centerX: 110, centerY: 220 + TOOLTIP_BADGE_TOKEN_GAP });
  });
});
