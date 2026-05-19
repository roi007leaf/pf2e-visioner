import {
  createCoverTooltipBadge,
  createSenseSuppressionOverlay,
  createSenseTooltipBadge,
  createVisibilityFactorBadge,
  createVisibilityFactorTooltip,
  createVisibilityTooltipBadge,
  getTooltipSenseIcon,
  resolveTooltipCssColor,
} from '../../../scripts/services/HoverTooltip/hover-tooltip-badge-elements.js';

describe('hover tooltip badge elements', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('creates positioned visibility badge with tooltip and icon classes', () => {
    const el = createVisibilityTooltipBadge({
      left: 12.4,
      top: 33.6,
      stateClass: 'hidden',
      iconClass: 'fa-solid fa-eye-slash',
      tooltipLabel: 'Hidden',
      badgeWidth: 26,
      badgeHeight: 24,
      borderRadius: 8,
    });

    expect(el.style.position).toBe('fixed');
    expect(el.style.pointerEvents).toBe('auto');
    expect(el.style.cursor).toBe('pointer');
    expect(el.style.transform).toBe('translate(12px, 34px)');
    expect(el.dataset.tooltip).toBe('Hidden');
    expect(el.getAttribute('aria-label')).toBe('Hidden');
    expect(el.querySelector('.pf2e-visioner-tooltip-badge.visibility-hidden')).toBeTruthy();
    expect(el.querySelector('i.fa-solid.fa-eye-slash')).toBeTruthy();
  });

  test('creates sense badge with stable icon fallback', () => {
    const el = createSenseTooltipBadge({
      left: 0,
      top: 0,
      sense: 'lifesense',
      badgeWidth: 26,
      badgeHeight: 24,
      borderRadius: 8,
      iconPx: 14,
    });

    expect(getTooltipSenseIcon('lifesense')).toBe('fa-solid fa-heartbeat');
    expect(getTooltipSenseIcon('unknown-sense')).toBe('fa-solid fa-eye');
    expect(el.querySelector('.pf2e-visioner-sense-badge i.fa-solid.fa-heartbeat')).toBeTruthy();
    expect(el.querySelector('i').style.fontSize).toBe('14px');
  });

  test('creates cover badge with manual-cover cog without innerHTML assembly', () => {
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

    expect(el.style.transform).toBe('translate(10px, 20px)');
    expect(el.querySelector('i.fa-solid.fa-shield')).toBeTruthy();
    expect(el.querySelector('i.fa-solid.fa-cog')).toBeTruthy();
    expect(el.querySelector('span').style.color).toBe('rgb(255, 140, 0)');
  });

  test('attaches suppression overlay to badge span with localized tooltip', () => {
    const parent = createSenseTooltipBadge({
      left: 0,
      top: 0,
      sense: 'vision',
      badgeWidth: 26,
      badgeHeight: 24,
      borderRadius: 8,
      iconPx: 14,
    });

    const overlay = createSenseSuppressionOverlay({
      parentBadgeEl: parent,
      suppressedSenses: new Set(['vision', 'lifesense']),
      iconPx: 14,
      getSenseLabel: (sense) => `label:${sense}`,
      formatTooltip: (labels) => `blocked:${labels.join('|')}`,
    });

    expect(overlay.dataset.tooltip).toBe('blocked:label:vision|label:lifesense');
    expect(overlay.dataset.tooltipDirection).toBe('UP');
    expect(parent.querySelector('.pf2e-visioner-sense-badge > div')).toBe(overlay);
    expect(overlay.querySelector('i.fa-solid.fa-ban')).toBeTruthy();
  });

  test('creates factor badge with icon color and optional initial position', () => {
    const el = createVisibilityFactorBadge({
      iconClass: 'fa-solid fa-eye',
      iconColor: '#ffffff',
      iconSize: 16,
      bgSize: 40,
      zIndex: '6000',
      left: 12.4,
      top: 33.6,
    });

    expect(el.style.zIndex).toBe('6000');
    expect(el.style.transform).toBe('translate(12px, 34px)');
    expect(el.querySelector('.pf2e-visioner-factor-badge')).toBeTruthy();
    expect(el.querySelector('i.fa-solid.fa-eye').style.color).toBe('rgb(255, 255, 255)');
  });

  test('creates factor tooltip without evaluating raw line HTML', () => {
    const tooltip = createVisibilityFactorTooltip({
      lines: [
        'State: hidden',
        { text: 'Detected by lifesense', bullet: true, emphasized: true },
        { text: 'Cover applies', bullet: true, emphasized: false },
        '<img src=x onerror=alert(1)>',
      ],
    });

    expect(tooltip.style.display).toBe('none');
    expect(tooltip.querySelector('strong').textContent).toBe('Detected by lifesense');
    expect(tooltip.textContent).toContain('State: hidden');
    expect(tooltip.textContent).toContain('• Cover applies');
    expect(tooltip.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(tooltip.querySelector('img')).toBeNull();
  });

  test('resolves direct tooltip CSS colors without DOM probe', () => {
    expect(resolveTooltipCssColor('#abc123')).toBe('#abc123');
    expect(resolveTooltipCssColor('')).toBe('#ffffff');
  });
});
