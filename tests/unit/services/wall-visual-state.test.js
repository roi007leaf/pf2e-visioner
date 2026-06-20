import {
  buildOriginalSightRestoreUpdate,
  controlledTokenCanSeeWall,
  expandObservedWallIds,
  getHiddenIndicatorHalf,
  getObservedWallIds,
  getWallMapForObserver,
  isHiddenWallDocument,
  resolveControlledWallObserver,
  resolveStrictControlledWallObserver,
} from '../../../scripts/services/Walls/wall-visual-state.js';

describe('wall visual state helpers', () => {
  test('resolves observer from explicit id only when currently controlled', () => {
    const controlled = { id: 'controlled' };
    const notControlled = { id: 'other' };
    const tokensLayer = {
      controlled: [controlled],
      get: (id) => (id === 'other' ? notControlled : controlled),
    };

    expect(resolveControlledWallObserver({ observerId: 'controlled', tokensLayer })).toEqual({
      observer: controlled,
      allowed: true,
    });
    expect(resolveControlledWallObserver({ observerId: 'other', tokensLayer })).toEqual({
      observer: notControlled,
      allowed: false,
    });
  });

  test('falls back to first controlled token when explicit observer is missing', () => {
    const controlled = { id: 'controlled' };

    expect(
      resolveControlledWallObserver({
        observerId: 'missing',
        tokensLayer: { controlled: [controlled], get: () => null },
      }),
    ).toEqual({ observer: controlled, allowed: true });
  });

  test('strict observer resolution accepts only current controlled token', () => {
    const controlled = { id: 'controlled' };
    const other = { id: 'other' };
    const tokensLayer = {
      controlled: [controlled],
      get: (id) => (id === 'controlled' ? controlled : other),
    };

    expect(resolveStrictControlledWallObserver({ observerId: 'controlled', tokensLayer })).toBe(
      controlled,
    );
    expect(resolveStrictControlledWallObserver({ observerId: 'other', tokensLayer })).toBeNull();
    expect(resolveStrictControlledWallObserver({ tokensLayer })).toBe(controlled);
  });

  test('reads observer wall map safely', () => {
    const observer = {
      document: {
        getFlag: (moduleId, flagName) =>
          moduleId === 'pf2e-visioner' && flagName === 'walls' ? { wall: 'observed' } : {},
      },
    };

    expect(getWallMapForObserver(observer, 'pf2e-visioner')).toEqual({ wall: 'observed' });
    expect(getWallMapForObserver(null, 'pf2e-visioner')).toEqual({});
  });

  test('checks controlled-token wall visibility through owner permission', () => {
    const user = { id: 'user' };
    const controlledToken = {
      document: {
        testUserPermission: (candidateUser, permission) =>
          candidateUser === user && permission === 'OWNER',
        getFlag: () => ({ wall: 'observed', hidden: 'hidden' }),
      },
    };

    expect(controlledTokenCanSeeWall(controlledToken, 'wall', user, 'pf2e-visioner')).toBe(true);
    expect(controlledTokenCanSeeWall(controlledToken, 'hidden', user, 'pf2e-visioner')).toBe(false);
    expect(
      controlledTokenCanSeeWall(controlledToken, 'wall', { id: 'other' }, 'pf2e-visioner'),
    ).toBe(false);
  });

  test('expands observed walls through connected wall docs', () => {
    const observedWallIds = getObservedWallIds({ wall: 'observed', hidden: 'hidden' });
    const walls = [{ document: { id: 'wall' } }, { document: { id: 'hidden' } }];

    expect(
      expandObservedWallIds({
        observedWallIds,
        walls,
        getConnectedWallDocsBySourceId: (id) => (id === 'wall' ? [{ id: 'connected' }] : []),
      }),
    ).toEqual(new Set(['wall', 'connected']));
  });

  test('reads hidden wall and original sight state safely', () => {
    const document = {
      id: 'wall',
      sight: 0,
      getFlag: (moduleId, flagName) => {
        if (flagName === 'hiddenWall') return true;
        if (flagName === 'originalSight') return 1;
        return undefined;
      },
    };

    expect(isHiddenWallDocument(document, 'pf2e-visioner')).toBe(true);
    expect(buildOriginalSightRestoreUpdate(document, 'pf2e-visioner')).toEqual({
      _id: 'wall',
      sight: 1,
      'flags.pf2e-visioner.originalSight': null,
    });
  });

  test('reads hidden indicator half with fallback', () => {
    expect(getHiddenIndicatorHalf({ getFlag: () => 14 }, 'pf2e-visioner')).toBe(14);
    expect(getHiddenIndicatorHalf({ getFlag: () => -1 }, 'pf2e-visioner')).toBe(10);
  });
});
