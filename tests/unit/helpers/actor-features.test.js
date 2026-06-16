import '../../setup.js';

import * as actorFeatures from '../../../scripts/utils/actor-features.js';

const { actorHasFeature, getActorFeatureSlugs, getActorLevel, normalizeSlug } = actorFeatures;

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

  test('reads feature slugs from PF2e actor roll options', () => {
    const actor = {
      getRollOptions: jest.fn(() => ['self:feat:legendary-sneak']),
    };

    expect(actorHasFeature({ actor }, 'legendary-sneak')).toBe(true);
  });

  test('caches feature slug scans for the same actor until cleared', () => {
    let items = [{ type: 'feat', name: 'Blind-Fight' }];
    const actor = {
      items: {
        values: jest.fn(() => items),
      },
      getRollOptions: jest.fn(() => []),
    };

    expect(actorHasFeature(actor, 'blind-fight')).toBe(true);
    expect(actorHasFeature({ actor }, 'blind-fight')).toBe(true);
    expect(actor.items.values).toHaveBeenCalledTimes(1);
    expect(actor.getRollOptions).toHaveBeenCalledTimes(1);

    items = [{ type: 'feat', name: 'Legendary Sneak' }];
    actorFeatures.clearActorFeatureCache(actor);

    expect(actorHasFeature(actor, 'legendary-sneak')).toBe(true);
    expect(actor.items.values).toHaveBeenCalledTimes(2);
    expect(actor.getRollOptions).toHaveBeenCalledTimes(2);
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
