import { getTooltipCoverBadgeColor } from '../../../scripts/services/HoverTooltip/hover-tooltip-cover-badge.js';

describe('hover tooltip cover badge', () => {
  test('uses configured cover color when colorblind mode is disabled', () => {
    expect(
      getTooltipCoverBadgeColor({
        colorblindMode: 'none',
        coverState: 'standard',
        fallbackColor: '#abc123',
      }),
    ).toBe('#abc123');
  });

  test('uses colorblind palette for known modes and cover states', () => {
    expect(
      getTooltipCoverBadgeColor({
        colorblindMode: 'deuteranopia',
        coverState: 'standard',
        fallbackColor: '#abc123',
      }),
    ).toBe('#ff8c00');
  });

  test('falls back for unknown colorblind mode or cover state', () => {
    expect(
      getTooltipCoverBadgeColor({
        colorblindMode: 'unknown',
        coverState: 'standard',
        fallbackColor: '#abc123',
      }),
    ).toBe('#abc123');
    expect(
      getTooltipCoverBadgeColor({
        colorblindMode: 'deuteranopia',
        coverState: 'unknown',
        fallbackColor: '#abc123',
      }),
    ).toBe('#abc123');
  });
});
