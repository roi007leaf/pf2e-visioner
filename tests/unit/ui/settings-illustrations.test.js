import '../../setup.js';

import {
  buildFlankingIllustrations,
  buildSettingIllustrations,
} from '../../../scripts/ui/settings-illustrations.js';

describe('buildFlankingIllustrations', () => {
  const byValue = () => Object.fromEntries(buildFlankingIllustrations().map((i) => [i.value, i]));

  test('returns one card per rule in choice order', () => {
    expect(buildFlankingIllustrations().map((i) => i.value)).toEqual([
      'raw',
      'anySquare',
      'anyCorner',
      'lineThrough',
    ]);
  });

  test('every card carries an svg and a localized label', () => {
    for (const card of buildFlankingIllustrations()) {
      expect(card.svg.startsWith('<svg')).toBe(true);
      expect(card.label).toContain('PF2E_VISIONER.SETTINGS.FLANKING_SIZE_RULE.CHOICES.');
    }
  });

  test('raw card shows the failed center line', () => {
    const { svg, flanked } = byValue().raw;
    expect(flanked).toBe(false);
    expect(svg).toContain('x1="100" y1="100" x2="250" y2="350"');
  });

  test('anySquare card draws the passing square-center line', () => {
    const { svg, flanked } = byValue().anySquare;
    expect(flanked).toBe(true);
    expect(svg).toContain('x1="50" y1="150" x2="250" y2="350"');
  });

  test('anyCorner card draws a corner-to-corner line', () => {
    const { svg, flanked } = byValue().anyCorner;
    expect(flanked).toBe(true);
    expect(svg).toContain('x1="0" y1="200" x2="300" y2="300"');
  });

  test('lineThrough card draws the center line as passing', () => {
    const { svg, flanked } = byValue().lineThrough;
    expect(flanked).toBe(true);
    expect(svg).toContain('x1="100" y1="100" x2="250" y2="350"');
  });
});

describe('buildSettingIllustrations', () => {
  test('returns null for settings without an illustration', () => {
    expect(buildSettingIllustrations({}, 'raw')).toBeNull();
  });

  test('marks the current choice as selected', () => {
    const cards = buildSettingIllustrations({ illustration: 'flankingSizeRule' }, 'anyCorner');
    expect(cards.find((c) => c.value === 'anyCorner').selected).toBe(true);
    expect(cards.filter((c) => c.selected)).toHaveLength(1);
  });
});
