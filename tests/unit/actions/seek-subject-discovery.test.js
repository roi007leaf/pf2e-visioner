import { discoverSeekSubjects } from '../../../scripts/chat/services/actions/Seek/seek-subject-discovery.js';

describe('seek subject discovery', () => {
  function makeToken(id, type = 'character') {
    return { id, actor: { id: `${id}-actor`, type }, center: { x: 0, y: 0 } };
  }

  function makeWall(id, hiddenWall = true, stealthDC = 0) {
    return {
      id,
      center: { x: 0, y: 0 },
      document: {
        getFlag: jest.fn((moduleId, key) => {
          if (key === 'hiddenWall') return hiddenWall;
          if (key === 'stealthDC') return stealthDC;
          return undefined;
        }),
      },
    };
  }

  const baseDeps = {
    hasActiveEncounter: jest.fn(() => false),
    shouldFilterAlly: jest.fn(() => false),
    calculateTokenDistance: jest.fn(() => 10),
    getSetting: jest.fn((key) => {
      if (key === 'wallStealthDC') return 15;
      return false;
    }),
  };

  test('discovers token subjects and hidden wall subjects', async () => {
    const actor = makeToken('actor');
    const target = makeToken('target');
    const hiddenWall = makeWall('wall-a', true, 18);
    const visibleWall = makeWall('wall-b', false, 0);

    const subjects = await discoverSeekSubjects(
      { actor, ignoreAllies: false },
      { ...baseDeps, tokens: [actor, target], walls: [hiddenWall, visibleWall] },
    );

    expect(subjects).toEqual([
      target,
      { _isWall: true, _isHiddenWall: true, wall: hiddenWall, dc: 18 },
    ]);
  });

  test('keeps hazards and loot when ally filtering is enabled', async () => {
    const actor = makeToken('actor');
    const ally = makeToken('ally');
    const hazard = makeToken('hazard', 'hazard');
    const loot = makeToken('loot', 'loot');
    const shouldFilterAlly = jest.fn((_, token) => token === ally);

    const subjects = await discoverSeekSubjects(
      { actor, ignoreAllies: true },
      {
        ...baseDeps,
        shouldFilterAlly,
        tokens: [actor, ally, hazard, loot],
        walls: [],
      },
    );

    expect(subjects).toEqual([hazard, loot]);
  });

  test('applies seek range limit to token subjects', async () => {
    const actor = makeToken('actor');
    const near = makeToken('near');
    const far = makeToken('far');

    const subjects = await discoverSeekSubjects(
      { actor, ignoreAllies: false },
      {
        ...baseDeps,
        tokens: [near, far],
        walls: [],
        getSetting: jest.fn((key) => {
          if (key === 'limitSeekRangeOutOfCombat') return true;
          if (key === 'customSeekDistanceOutOfCombat') return 20;
          if (key === 'wallStealthDC') return 15;
          return false;
        }),
        calculateTokenDistance: jest.fn((_, token) => (token === near ? 10 : 30)),
      },
    );

    expect(subjects).toEqual([near]);
  });
});
