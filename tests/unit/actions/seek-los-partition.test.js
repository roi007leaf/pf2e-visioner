import { partitionSeekChangesByLOS } from '../../../scripts/chat/services/actions/Seek/seek-los-partition.js';

describe('seek LOS partition', () => {
  function makeToken(id, type = 'character', alliance = null, stealthDC = 0) {
    return {
      id,
      actor: {
        type,
        alliance,
      },
      document: {
        id,
        getFlag: jest.fn(() => stealthDC),
      },
    };
  }

  test('walls always apply immediately', async () => {
    const wallChange = { wallId: 'wall-a', newWallState: 'observed' };
    const result = await partitionSeekChangesByLOS(
      { actor: makeToken('observer') },
      [wallChange],
      [{ _isWall: true }],
      { visionAnalyzer: { hasLineOfSight: jest.fn(() => false) } },
    );

    expect(result.immediateChanges).toEqual([wallChange]);
    expect(result.deferredResults).toEqual([]);
  });

  test('loot without configured stealth DC skips deferral', async () => {
    const target = makeToken('loot-a', 'loot', null, 0);
    const change = { target, newVisibility: 'observed', oldVisibility: 'hidden' };

    const result = await partitionSeekChangesByLOS(
      { actor: makeToken('observer') },
      [change],
      [{ outcome: 'success', dc: 12 }],
      { visionAnalyzer: { hasLineOfSight: jest.fn(() => false) } },
    );

    expect(result.immediateChanges).toEqual([change]);
    expect(result.deferredResults).toEqual([]);
  });

  test('allied targets skip deferral', async () => {
    const observer = makeToken('observer', 'character', 'party');
    const target = makeToken('target', 'character', 'party');
    const change = { target, newVisibility: 'observed', oldVisibility: 'hidden' };

    const result = await partitionSeekChangesByLOS(
      { actor: observer },
      [change],
      [{ outcome: 'success', dc: 12 }],
      { visionAnalyzer: { hasLineOfSight: jest.fn(() => false) } },
    );

    expect(result.immediateChanges).toEqual([change]);
    expect(result.deferredResults).toEqual([]);
  });

  test('observed enemy without LOS defers result', async () => {
    const observer = makeToken('observer', 'character', 'party');
    const target = makeToken('target', 'character', 'opposition');
    const change = { target, newVisibility: 'observed', oldVisibility: 'hidden' };

    const result = await partitionSeekChangesByLOS(
      { actor: observer },
      [change],
      [{ outcome: 'success', dc: 12 }],
      { visionAnalyzer: { hasLineOfSight: jest.fn(() => false) } },
    );

    expect(result.immediateChanges).toEqual([]);
    expect(result.deferredResults).toEqual([
      {
        targetId: 'target',
        newVisibility: 'observed',
        oldVisibility: 'hidden',
        outcome: 'success',
      },
    ]);
  });
});
