import {
  deleteExistingEmbeddedItems,
  isMissingEmbeddedDocumentError,
  runWithEffectLock,
} from '../../../scripts/visibility/utils.js';

describe('visibility effect utils', () => {
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
