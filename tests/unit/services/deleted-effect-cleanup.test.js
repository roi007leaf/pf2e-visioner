import '../../setup.js';

import { cleanupDeletedEffectItem } from '../../../scripts/services/deleted-effect-cleanup.js';

const MODULE_ID = 'pf2e-visioner';

function makeToken(id, actorId = 'actor-1', flags = {}) {
  return {
    id,
    name: id,
    actor: { id: actorId },
    locked: true,
    document: {
      id,
      getFlag: jest.fn((moduleId, key) => {
        if (moduleId === MODULE_ID) return flags[key];
        return undefined;
      }),
      unsetFlag: jest.fn().mockResolvedValue(undefined),
    },
  };
}

function makeEffect(overrides = {}) {
  return {
    id: 'effect-1',
    name: 'Effect 1',
    type: 'effect',
    parent: { id: 'actor-1' },
    flags: {},
    system: { rules: [] },
    ...overrides,
  };
}

describe('deleted effect cleanup service', () => {
  test('skips non-effect items without touching cleanup collaborators', async () => {
    const syncCoverMapsForDeletedCoverEffect = jest.fn();
    const cleanupDeletedVisionerRuleElements = jest.fn();

    const result = await cleanupDeletedEffectItem(
      { type: 'weapon', parent: { id: 'actor-1' }, system: { rules: [] } },
      {
        syncCoverMapsForDeletedCoverEffect,
        cleanupDeletedVisionerRuleElements,
      },
    );

    expect(result.skipped).toBe(true);
    expect(syncCoverMapsForDeletedCoverEffect).not.toHaveBeenCalled();
    expect(cleanupDeletedVisionerRuleElements).not.toHaveBeenCalled();
  });

  test('refreshes AVS after cover-map cleanup changes token ids', async () => {
    const refreshAvsAfterTokenMapSync = jest.fn().mockResolvedValue(undefined);
    const syncCoverMapsForDeletedCoverEffect = jest.fn().mockResolvedValue({
      changed: true,
      tokenIds: ['observer', 'target'],
    });

    await cleanupDeletedEffectItem(makeEffect(), {
      getTokensForActor: () => [],
      syncCoverMapsForDeletedCoverEffect,
      refreshAvsAfterTokenMapSync,
    });

    expect(syncCoverMapsForDeletedCoverEffect).toHaveBeenCalledWith(expect.objectContaining({
      id: 'effect-1',
    }));
    expect(refreshAvsAfterTokenMapSync).toHaveBeenCalledWith(['observer', 'target']);
  });

  test('clears waiting-sneak flags and unlocks tokens only when AVS is enabled', async () => {
    const waitingToken = makeToken('waiting', 'actor-1', { waitingSneak: true });
    const otherToken = makeToken('other', 'actor-1', { waitingSneak: false });

    await cleanupDeletedEffectItem(
      makeEffect({ system: { slug: 'waiting-for-sneak-start', rules: [] } }),
      {
        isAvsEnabled: () => true,
        getTokensForActor: () => [waitingToken, otherToken],
        syncCoverMapsForDeletedCoverEffect: jest.fn().mockResolvedValue({ changed: false }),
      },
    );

    expect(waitingToken.document.unsetFlag).toHaveBeenCalledWith(MODULE_ID, 'waitingSneak');
    expect(waitingToken.locked).toBe(false);
    expect(otherToken.document.unsetFlag).not.toHaveBeenCalledWith(MODULE_ID, 'waitingSneak');
  });

  test('skips token document cleanup for non-GM clients', async () => {
    const waitingToken = makeToken('waiting', 'actor-1', { waitingSneak: true });
    const cleanupDeletedVisionerRuleElements = jest.fn();

    const result = await cleanupDeletedEffectItem(
      makeEffect({
        system: {
          slug: 'waiting-for-sneak-start',
          rules: [{ key: 'PF2eVisionerEffect', operations: [] }],
        },
      }),
      {
        isGM: () => false,
        isAvsEnabled: () => true,
        getTokensForActor: () => [waitingToken],
        syncCoverMapsForDeletedCoverEffect: jest.fn().mockResolvedValue({ changed: false }),
        cleanupDeletedVisionerRuleElements,
      },
    );

    expect(result).toEqual({ skipped: true, reason: 'not-gm' });
    expect(waitingToken.document.unsetFlag).not.toHaveBeenCalled();
    expect(cleanupDeletedVisionerRuleElements).not.toHaveBeenCalled();
  });

  test('clears sneak-active flags for deleted sneaking effects only when AVS is enabled', async () => {
    const sneakingToken = makeToken('sneaking', 'actor-1', { 'sneak-active': true });
    const otherToken = makeToken('other', 'actor-1', { 'sneak-active': false });

    await cleanupDeletedEffectItem(
      makeEffect({ flags: { [MODULE_ID]: { sneakingEffect: true } } }),
      {
        isAvsEnabled: () => true,
        getTokensForActor: () => [sneakingToken, otherToken],
        syncCoverMapsForDeletedCoverEffect: jest.fn().mockResolvedValue({ changed: false }),
      },
    );

    expect(sneakingToken.document.unsetFlag).toHaveBeenCalledWith(MODULE_ID, 'sneak-active');
    expect(otherToken.document.unsetFlag).not.toHaveBeenCalledWith(MODULE_ID, 'sneak-active');
  });

  test('delegates PF2eVisioner rule cleanup with a scoped logger', async () => {
    const token = makeToken('token-1');
    const cleanupDeletedVisionerRuleElements = jest.fn().mockResolvedValue(undefined);
    const log = { debug: jest.fn(), warn: jest.fn() };
    const getLogger = jest.fn(() => log);
    const effect = makeEffect({
      system: {
        rules: [{ key: 'PF2eVisionerEffect', operations: [] }],
      },
    });

    await cleanupDeletedEffectItem(effect, {
      getTokensForActor: () => [token],
      syncCoverMapsForDeletedCoverEffect: jest.fn().mockResolvedValue({ changed: false }),
      cleanupDeletedVisionerRuleElements,
      getLogger,
    });

    expect(getLogger).toHaveBeenCalledWith('RuleElements/Cleanup');
    expect(log.debug).toHaveBeenCalledWith(expect.any(Function));
    expect(cleanupDeletedVisionerRuleElements).toHaveBeenCalledWith(effect, [token], log);
  });
});
