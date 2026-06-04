import '../../setup.js';

import {
  getActiveSceneHearingRange,
  invalidateSceneHearingRangeCache,
} from '../../../scripts/services/scene-hearing-range.js';
import {
  actorHasConditionSlug,
  invalidateActorConditionCache,
} from '../../../scripts/services/sense-distance.js';

describe('move-invariant caches', () => {
  let previousCanvas;
  let previousGame;

  beforeEach(() => {
    previousCanvas = global.canvas;
    previousGame = global.game;
    global.game = { scenes: undefined };
    invalidateSceneHearingRangeCache();
    invalidateActorConditionCache();
  });

  afterEach(() => {
    global.canvas = previousCanvas;
    global.game = previousGame;
  });

  describe('scene hearing range', () => {
    test('reads the active scene range live, reflecting in-place changes without invalidation', () => {
      const scene = { id: 'scene-a', flags: { pf2e: { hearingRange: 20 } } };
      global.canvas = { scene };

      expect(getActiveSceneHearingRange()).toBe(20);

      scene.flags.pf2e.hearingRange = 40;
      expect(getActiveSceneHearingRange()).toBe(40);
    });

    test('memoizes the full-scene-scan fallback when the active scene has no direct range', () => {
      let reads = 0;
      const sceneDoc = {
        id: 'scene-a',
        flags: {
          pf2e: {
            get hearingRange() {
              reads++;
              return 25;
            },
          },
        },
      };
      global.canvas = { scene: { id: 'scene-a' } };
      global.game = { scenes: { get: (id) => (id === 'scene-a' ? sceneDoc : null) } };

      expect(getActiveSceneHearingRange()).toBe(25);
      expect(getActiveSceneHearingRange()).toBe(25);
      expect(reads).toBe(1);
    });

    test('recomputes the fallback after the cache is invalidated', () => {
      let reads = 0;
      const sceneDoc = {
        id: 'scene-a',
        flags: {
          pf2e: {
            get hearingRange() {
              reads++;
              return 25;
            },
          },
        },
      };
      global.canvas = { scene: { id: 'scene-a' } };
      global.game = { scenes: { get: (id) => (id === 'scene-a' ? sceneDoc : null) } };

      expect(getActiveSceneHearingRange()).toBe(25);
      expect(reads).toBe(1);

      invalidateSceneHearingRangeCache();

      expect(getActiveSceneHearingRange()).toBe(25);
      expect(reads).toBe(2);
    });
  });

  describe('actor condition slug', () => {
    test('memoizes a positive condition lookup across repeated reads', () => {
      const actor = { hasCondition: jest.fn(() => true) };

      expect(actorHasConditionSlug(actor, 'deafened')).toBe(true);
      expect(actorHasConditionSlug(actor, 'deafened')).toBe(true);
      expect(actorHasConditionSlug(actor, 'deafened')).toBe(true);

      expect(actor.hasCondition).toHaveBeenCalledTimes(1);
    });

    test('memoizes a negative condition lookup across repeated reads', () => {
      const actor = {
        hasCondition: jest.fn(() => false),
        system: { conditions: {} },
        items: [],
      };

      expect(actorHasConditionSlug(actor, 'deafened')).toBe(false);
      expect(actorHasConditionSlug(actor, 'deafened')).toBe(false);

      expect(actor.hasCondition).toHaveBeenCalledTimes(1);
    });

    test('recomputes after the cache is invalidated', () => {
      const actor = { hasCondition: jest.fn(() => true) };

      expect(actorHasConditionSlug(actor, 'deafened')).toBe(true);
      expect(actor.hasCondition).toHaveBeenCalledTimes(1);

      invalidateActorConditionCache();

      expect(actorHasConditionSlug(actor, 'deafened')).toBe(true);
      expect(actor.hasCondition).toHaveBeenCalledTimes(2);
    });

    test('caches per slug without collision', () => {
      const actor = { hasCondition: jest.fn(() => true) };

      expect(actorHasConditionSlug(actor, 'deafened')).toBe(true);
      expect(actorHasConditionSlug(actor, 'blinded')).toBe(true);
      expect(actorHasConditionSlug(actor, 'deafened')).toBe(true);
      expect(actorHasConditionSlug(actor, 'blinded')).toBe(true);

      expect(actor.hasCondition).toHaveBeenCalledTimes(2);
    });

    test('does not collide between distinct actors', () => {
      const deaf = { hasCondition: jest.fn(() => true) };
      const hearing = {
        hasCondition: jest.fn(() => false),
        system: { conditions: {} },
        items: [],
      };

      expect(actorHasConditionSlug(deaf, 'deafened')).toBe(true);
      expect(actorHasConditionSlug(hearing, 'deafened')).toBe(false);
      expect(actorHasConditionSlug(deaf, 'deafened')).toBe(true);
      expect(actorHasConditionSlug(hearing, 'deafened')).toBe(false);

      expect(deaf.hasCondition).toHaveBeenCalledTimes(1);
      expect(hearing.hasCondition).toHaveBeenCalledTimes(1);
    });
  });
});
