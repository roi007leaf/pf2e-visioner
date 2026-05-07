import '../../setup.js';
import {
  getCoverLevelRollOptions,
  getProneRangedStandardCoverUpgradeRule,
  getTakeCoverProneRangedOnlyRule,
  ensureCoverLevelRules,
  canonicalizeObserverRules,
} from '../../../scripts/cover/batch.js';

describe('Cover Level Roll Options', () => {
  describe('getCoverLevelRollOptions', () => {
    test('returns self:cover-level and self:cover-bonus for lesser cover', () => {
      const rules = getCoverLevelRollOptions('lesser');
      expect(rules).toEqual([
        { key: 'RollOption', domain: 'all', option: 'self:cover-level:lesser' },
        { key: 'RollOption', domain: 'all', option: 'self:cover-bonus:1' },
      ]);
    });

    test('returns self:cover-level and self:cover-bonus for standard cover', () => {
      const rules = getCoverLevelRollOptions('standard');
      expect(rules).toEqual([
        { key: 'RollOption', domain: 'all', option: 'self:cover-level:standard' },
        { key: 'RollOption', domain: 'all', option: 'self:cover-bonus:2' },
      ]);
    });

    test('returns self:cover-level and self:cover-bonus for greater cover', () => {
      const rules = getCoverLevelRollOptions('greater');
      expect(rules).toEqual([
        { key: 'RollOption', domain: 'all', option: 'self:cover-level:greater' },
        { key: 'RollOption', domain: 'all', option: 'self:cover-bonus:4' },
      ]);
    });

    test('returns empty array for none cover', () => {
      const rules = getCoverLevelRollOptions('none');
      expect(rules).toEqual([]);
    });
  });

  describe('getProneRangedStandardCoverUpgradeRule', () => {
    test('returns a predicate-gated +2 AC upgrade for standard cover against ranged attacks while prone', () => {
      const rule = getProneRangedStandardCoverUpgradeRule('observer-sig', 'observer-token');

      expect(rule).toEqual({
        key: 'FlatModifier',
        selector: 'ac',
        slug: 'take-cover-prone-ranged-upgrade',
        type: 'circumstance',
        value: 2,
        predicate: [
          'origin:signature:observer-sig',
          'cover-against:observer-token',
          'self:condition:prone',
          { or: ['item:ranged', 'item:trait:ranged', 'attack:ranged'] },
        ],
      });
    });
  });

  describe('getTakeCoverProneRangedOnlyRule', () => {
    test('returns a generic +4 AC rule against ranged attacks while prone', () => {
      const rule = getTakeCoverProneRangedOnlyRule();

      expect(rule).toEqual({
        key: 'FlatModifier',
        selector: 'ac',
        slug: 'take-cover-prone-ranged-cover',
        type: 'circumstance',
        value: 4,
        predicate: [
          'self:condition:prone',
          { or: ['item:ranged', 'item:trait:ranged', 'attack:ranged'] },
        ],
      });
    });
  });

  describe('ensureCoverLevelRules', () => {
    test('adds cover-level rules when missing', () => {
      const existingRules = [
        { key: 'RollOption', domain: 'all', option: 'cover-against:token1' },
        { key: 'FlatModifier', selector: 'ac', type: 'circumstance', value: 2 },
      ];
      const result = ensureCoverLevelRules(existingRules, 'standard');
      expect(result).toContainEqual({
        key: 'RollOption',
        domain: 'all',
        option: 'self:cover-level:standard',
      });
      expect(result).toContainEqual({
        key: 'RollOption',
        domain: 'all',
        option: 'self:cover-bonus:2',
      });
    });

    test('does not duplicate cover-level rules when already present', () => {
      const existingRules = [
        { key: 'RollOption', domain: 'all', option: 'cover-against:token1' },
        { key: 'RollOption', domain: 'all', option: 'self:cover-level:standard' },
        { key: 'RollOption', domain: 'all', option: 'self:cover-bonus:2' },
        { key: 'FlatModifier', selector: 'ac', type: 'circumstance', value: 2 },
      ];
      const result = ensureCoverLevelRules(existingRules, 'standard');
      const levelRules = result.filter((r) => r.option === 'self:cover-level:standard');
      const bonusRules = result.filter((r) => r.option === 'self:cover-bonus:2');
      expect(levelRules).toHaveLength(1);
      expect(bonusRules).toHaveLength(1);
    });
  });

  describe('canonicalizeObserverRules preserves cover-level rules', () => {
    test('preserves self:cover-level and self:cover-bonus rules', () => {
      const rules = [
        { key: 'RollOption', domain: 'all', option: 'cover-against:token1' },
        { key: 'RollOption', domain: 'all', option: 'self:cover-level:standard' },
        { key: 'RollOption', domain: 'all', option: 'self:cover-bonus:2' },
        {
          key: 'FlatModifier',
          selector: 'ac',
          type: 'circumstance',
          value: 2,
          predicate: ['origin:signature:sig1'],
        },
      ];
      const result = canonicalizeObserverRules(rules);
      expect(result).toContainEqual({
        key: 'RollOption',
        domain: 'all',
        option: 'self:cover-level:standard',
      });
      expect(result).toContainEqual({
        key: 'RollOption',
        domain: 'all',
        option: 'self:cover-bonus:2',
      });
    });

    test('preserves base and prone-ranged AC rules for the same observer signature', () => {
      const rules = [
        {
          key: 'FlatModifier',
          selector: 'ac',
          slug: 'cover',
          type: 'circumstance',
          value: 2,
          predicate: ['origin:signature:sig1', 'cover-against:token1'],
        },
        getProneRangedStandardCoverUpgradeRule('sig1', 'token1'),
      ];

      const result = canonicalizeObserverRules(rules);

      expect(result).toContainEqual(expect.objectContaining({ slug: 'cover', value: 2 }));
      expect(result).toContainEqual(
        expect.objectContaining({ slug: 'take-cover-prone-ranged-upgrade', value: 2 }),
      );
    });

    test('deduplicates identical cover-level rules', () => {
      const rules = [
        { key: 'RollOption', domain: 'all', option: 'self:cover-level:standard' },
        { key: 'RollOption', domain: 'all', option: 'self:cover-level:standard' },
        { key: 'RollOption', domain: 'all', option: 'self:cover-bonus:2' },
        { key: 'RollOption', domain: 'all', option: 'self:cover-bonus:2' },
      ];
      const result = canonicalizeObserverRules(rules);
      const levelRules = result.filter((r) => r.option === 'self:cover-level:standard');
      const bonusRules = result.filter((r) => r.option === 'self:cover-bonus:2');
      expect(levelRules).toHaveLength(1);
      expect(bonusRules).toHaveLength(1);
    });
  });
});
