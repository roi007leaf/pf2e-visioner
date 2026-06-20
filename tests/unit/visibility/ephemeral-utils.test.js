import {
  deleteExistingEmbeddedItems,
  isMissingEmbeddedDocumentError,
  runWithEffectLock,
} from '../../../scripts/visibility/utils.js';

describe('visibility effect utils', () => {
  let originalGameUser;

  beforeEach(() => {
    originalGameUser = global.game.user;
    global.game.user = { isGM: true };
  });

  afterEach(() => {
    global.game.user = originalGameUser;
  });

  test('recognizes missing embedded document errors', () => {
    expect(isMissingEmbeddedDocumentError(new Error('Item "abc" does not exist!'))).toBe(true);
    expect(isMissingEmbeddedDocumentError(new Error('Other failure'))).toBe(false);
  });

  test('deleteExistingEmbeddedItems ignores stale missing item errors', async () => {
    const actor = {
      items: {
        get: jest.fn(() => ({ id: 'stale-id' })),
      },
      deleteEmbeddedDocuments: jest
        .fn()
        .mockRejectedValue(new Error('Item "stale-id" does not exist!')),
    };

    await expect(deleteExistingEmbeddedItems(actor, ['stale-id'])).resolves.toEqual(['stale-id']);
  });

  test('deleteExistingEmbeddedItems de-dupes concurrent deletes for the same actor item', async () => {
    let resolveDelete;
    const firstDelete = new Promise((resolve) => {
      resolveDelete = resolve;
    });
    const actor = {
      items: {
        get: jest.fn(() => ({ id: 'effect-id' })),
      },
      deleteEmbeddedDocuments: jest.fn(() => firstDelete),
    };

    const first = deleteExistingEmbeddedItems(actor, ['effect-id']);
    const second = deleteExistingEmbeddedItems(actor, ['effect-id']);

    await expect(second).resolves.toEqual([]);
    resolveDelete([]);
    await expect(first).resolves.toEqual(['effect-id']);
    expect(actor.deleteEmbeddedDocuments).toHaveBeenCalledTimes(1);
    expect(actor.deleteEmbeddedDocuments).toHaveBeenCalledWith('Item', ['effect-id']);
  });

  test('deleteExistingEmbeddedItems de-dupes concurrent deletes for actor proxies with same document key', async () => {
    let resolveDelete;
    const firstDelete = new Promise((resolve) => {
      resolveDelete = resolve;
    });
    const effects = [{ id: 'effect-id' }];
    const actorA = {
      uuid: 'Actor.shared',
      id: 'shared',
      items: {
        get: jest.fn((id) => effects.find((effect) => effect.id === id) ?? null),
      },
      deleteEmbeddedDocuments: jest.fn(() => firstDelete),
    };
    const actorB = {
      uuid: 'Actor.shared',
      id: 'shared',
      items: {
        get: jest.fn((id) => effects.find((effect) => effect.id === id) ?? null),
      },
      deleteEmbeddedDocuments: jest.fn().mockResolvedValue([]),
    };

    const first = deleteExistingEmbeddedItems(actorA, ['effect-id']);
    const second = deleteExistingEmbeddedItems(actorB, ['effect-id']);

    await expect(second).resolves.toEqual([]);
    resolveDelete([]);
    await expect(first).resolves.toEqual(['effect-id']);
    expect(actorA.deleteEmbeddedDocuments).toHaveBeenCalledTimes(1);
    expect(actorB.deleteEmbeddedDocuments).not.toHaveBeenCalled();
  });

  test('deleteExistingEmbeddedItems skips recently deleted ids while actor collection is stale', async () => {
    const effect = { id: 'effect-id' };
    const actor = {
      uuid: 'Actor.stale',
      items: {
        get: jest.fn((id) => (id === effect.id ? effect : null)),
      },
      deleteEmbeddedDocuments: jest.fn().mockResolvedValue([]),
    };

    await expect(deleteExistingEmbeddedItems(actor, ['effect-id'])).resolves.toEqual([
      'effect-id',
    ]);
    await expect(deleteExistingEmbeddedItems(actor, ['effect-id'])).resolves.toEqual([]);

    expect(actor.deleteEmbeddedDocuments).toHaveBeenCalledTimes(1);
  });

  test('deleteExistingEmbeddedItems skips player-side deletes', async () => {
    global.game.user = { isGM: false };
    const actor = {
      items: {
        get: jest.fn(() => ({ id: 'effect-id' })),
      },
      deleteEmbeddedDocuments: jest.fn().mockResolvedValue([]),
    };

    await expect(deleteExistingEmbeddedItems(actor, ['effect-id'])).resolves.toEqual([]);

    expect(actor.deleteEmbeddedDocuments).not.toHaveBeenCalled();
  });

  test('runWithEffectLock does not warn for stale missing item errors', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const actor = {};

    await runWithEffectLock(actor, async () => {
      throw new Error('Item "stale-id" does not exist!');
    });

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
