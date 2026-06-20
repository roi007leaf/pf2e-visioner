import {
  createCoverTooltipBadge,
  createVisibilityTooltipBadge,
} from '../../../scripts/services/HoverTooltip/hover-tooltip-badge-elements.js';

describe('HoverTooltips - Clickable Badges', () => {
  test('visibility badge factories create clickable fixed-position elements', () => {
    const el = createVisibilityTooltipBadge({
      left: 10,
      top: 20,
      stateClass: 'hidden',
      iconClass: 'fa-solid fa-eye-slash',
      badgeWidth: 26,
      badgeHeight: 24,
      borderRadius: 8,
    });

    expect(el.style.position).toBe('fixed');
    expect(el.style.pointerEvents).toBe('auto');
    expect(el.style.cursor).toBe('pointer');
    expect(el.style.transform).toBe('translate(10px, 20px)');
    expect(el.querySelector('.pf2e-visioner-tooltip-badge.visibility-hidden')).toBeTruthy();
  });

  test('cover badge factories preserve clickable container around manual overlay', () => {
    const el = createCoverTooltipBadge({
      left: 10,
      top: 20,
      iconClass: 'fa-solid fa-shield',
      color: '#ff8c00',
      badgeWidth: 26,
      badgeHeight: 24,
      borderRadius: 8,
      isManualCover: true,
    });

    expect(el.style.pointerEvents).toBe('auto');
    expect(el.style.cursor).toBe('pointer');
    expect(el.querySelector('i.fa-solid.fa-shield')).toBeTruthy();
    expect(el.querySelector('i.fa-solid.fa-cog')).toBeTruthy();
  });
});
