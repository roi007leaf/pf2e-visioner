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
      'oppositeArcs',
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
    expect(svg).toContain('class="pv-dg-line pv-dg-fail" x1="250" y1="350" x2="100" y2="100"');
  });

  const count = (svg, cls) => (svg.match(new RegExp(`class="pv-dg-line ${cls}"`, 'g')) ?? []).length;

  test('anySquare card draws every square-center line, passing one highlighted', () => {
    const { svg, flanked } = byValue().anySquare;
    expect(flanked).toBe(true);
    expect(svg).toContain('class="pv-dg-line pv-dg-pass" x1="250" y1="350" x2="50" y2="150"');
    expect(count(svg, 'pv-dg-pass') + count(svg, 'pv-dg-fail')).toBe(4);
    expect(count(svg, 'pv-dg-pass')).toBe(1);
  });

  test('anyCorner card draws every corner pair, passing ones highlighted', () => {
    const { svg, flanked } = byValue().anyCorner;
    expect(flanked).toBe(true);
    expect(svg).toContain('class="pv-dg-line pv-dg-pass" x1="300" y1="300" x2="0" y2="200"');
    expect(count(svg, 'pv-dg-pass') + count(svg, 'pv-dg-fail')).toBe(16);
    expect(count(svg, 'pv-dg-pass')).toBeGreaterThan(0);
  });

  test('oppositeArcs card draws the centre line and both arcs', () => {
    const { svg, flanked } = byValue().oppositeArcs;
    expect(flanked).toBe(true);
    expect(svg).toContain('class="pv-dg-line pv-dg-pass" x1="250" y1="350" x2="100" y2="100"');
    expect((svg.match(/class="pv-dg-arc"/g) ?? []).length).toBe(2);
  });

  test('lineThrough card draws the center line as passing', () => {
    const { svg, flanked } = byValue().lineThrough;
    expect(flanked).toBe(true);
    expect(svg).toContain('class="pv-dg-line pv-dg-pass" x1="250" y1="350" x2="100" y2="100"');
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
