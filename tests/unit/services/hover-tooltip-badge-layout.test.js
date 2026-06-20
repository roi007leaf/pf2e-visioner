import {
  VISIBILITY_FACTOR_BADGE_SIZE,
  computeSingleTooltipBadgePosition,
  computeTooltipBadgeCenter,
  computeTooltipBadgeMetrics,
  computeTooltipBadgeStackPositions,
  computeTooltipBadgeVerticalOffset,
  computeVisibilityFactorBadgePlacement,
  computeVisibilityFactorBadgeWorldPoint,
  computeVisibilityFactorTooltipPosition,
} from '../../../scripts/services/HoverTooltip/hover-tooltip-badge-layout.js';

describe('hover tooltip badge layout', () => {
  test('computes badge metrics from icon and border size', () => {
    expect(computeTooltipBadgeMetrics({ iconPx: 14, borderPx: 2 })).toEqual({
      badgeWidth: 26,
      badgeHeight: 24,
      spacing: 7,
      borderRadius: 8,
    });
  });

  test('computes center with HUD-aware vertical offset', () => {
    const canvasRect = { left: 10, top: 20 };
    const globalPoint = { x: 100, y: 200 };

    expect(
      computeTooltipBadgeCenter({
        canvasRect,
        globalPoint,
        badgeHeight: 24,
        hudActive: false,
      }),
    ).toEqual({
      centerX: 110,
      centerY: 202,
    });
    expect(
      computeTooltipBadgeCenter({
        canvasRect,
        globalPoint,
        badgeHeight: 24,
        hudActive: true,
      }),
    ).toEqual({
      centerX: 110,
      centerY: 234,
    });
  });

  test('computes single badge position centered on anchor', () => {
    expect(
      computeSingleTooltipBadgePosition({
        centerX: 110,
        centerY: 202,
        badgeWidth: 26,
      }),
    ).toEqual({
      left: 97,
      top: 202,
    });
  });

  test('computes ordered stack positions around anchor center', () => {
    expect(
      computeTooltipBadgeStackPositions({
        centerX: 100,
        centerY: 50,
        badgeWidth: 26,
        spacing: 7,
        slots: ['sense', 'visibility', 'cover'],
      }),
    ).toEqual({
      sense: { left: 54, top: 50 },
      visibility: { left: 87, top: 50 },
      cover: { left: 120, top: 50 },
    });
  });

  test('keeps documented HUD offsets stable', () => {
    expect(computeTooltipBadgeVerticalOffset(true)).toBe(26);
    expect(computeTooltipBadgeVerticalOffset(false)).toBe(-6);
  });

  test('computes factor badge world anchor above token center', () => {
    expect(
      computeVisibilityFactorBadgeWorldPoint({
        tokenX: 200,
        tokenY: 300,
        tokenBounds: { width: 50 },
      }),
    ).toEqual({
      x: 225,
      y: 255,
    });
  });

  test('computes factor badge screen placement from canvas transform point', () => {
    expect(
      computeVisibilityFactorBadgePlacement({
        canvasRect: { left: 10, top: 20 },
        globalPoint: { x: 100, y: 200 },
      }),
    ).toEqual({
      screenX: 110,
      screenY: 220,
      left: 90,
      top: 200,
    });
  });

  test('computes factor tooltip position beside badge', () => {
    expect(
      computeVisibilityFactorTooltipPosition({
        screenX: 110,
        screenY: 220,
      }),
    ).toEqual({
      left: 135,
      top: 200,
    });
    expect(VISIBILITY_FACTOR_BADGE_SIZE).toBe(40);
  });
});
