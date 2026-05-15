import '../../setup.js';

import {
  actorHasFeature,
  getActorFeatureSlugs,
  getActorLevel,
  normalizeSlug,
} from '../../../scripts/utils/actor-features.js';

describe('actor feature helpers', () => {
  test('normalizes feature labels and apostrophes consistently', () => {
    expect(normalizeSlug('That\u2019s Odd')).toBe('thats-odd');
    expect(normalizeSlug("That'd Be Odd")).toBe('thatd-be-odd');
  });

  test('reads feat and passive action slugs from actor items', () => {
    const actor = {
      items: [
        { type: 'feat', name: 'Blind-Fight' },
        { type: 'action', name: 'Swift Sneak', system: { actionType: { value: 'passive' } } },
      ],
    };

    expect(getActorFeatureSlugs(actor)).toEqual(new Set(['blind-fight', 'swift-sneak']));
    expect(actorHasFeature({ actor }, 'Blind Fight')).toBe(true);
    expect(actorHasFeature(actor, 'swift-sneak')).toBe(true);
  });

  test('reads feature slugs from PF2e itemTypes collections', () => {
    const actor = {
      itemTypes: {
        feat: [{ slug: 'blind-fight' }],
        action: [{ name: 'Deny Advantage', system: { actionType: { value: 'passive' } } }],
      },
    };

    expect(getActorFeatureSlugs(actor)).toEqual(new Set(['blind-fight', 'deny-advantage']));
  });

  test('reads levels from token or raw actor references', () => {
    const actor = { system: { details: { level: { value: 8 } } } };

    expect(getActorLevel({ actor })).toBe(8);
    expect(getActorLevel(actor)).toBe(8);
  });

  test('reads levels from PF2e actor level objects', () => {
    const actor = { level: { value: 8 } };

    expect(getActorLevel({ actor })).toBe(8);
    expect(getActorLevel(actor)).toBe(8);
  });
});
