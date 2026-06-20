import {
  applyTokenFlagUpdatePasses,
  applyTokenFlagMapUpdates,
  areTokenFlagValuesEqual,
  buildTokenFlagSetUpdate,
  buildTokenFlagUnsetUpdate,
  buildTokenFlagWriteMetrics,
  hasTokenFlagMapChanged,
  setTokenFlagMap,
} from '../../../scripts/stores/token-flag-map-persistence.js';

describe('token flag map batch writer', () => {
  test('compares nested flag values without JSON stringify', () => {
    expect(
      areTokenFlagValuesEqual(
        { target: { sense: 'hearing', isPrecise: false } },
        { target: { sense: 'hearing', isPrecise: false } },
      ),
    ).toBe(true);
    expect(
      hasTokenFlagMapChanged(
        { target: { sense: 'hearing', isPrecise: false } },
        { target: { sense: 'hearing', isPrecise: true } },
      ),
    ).toBe(true);
  });

  test('uses scene bulk token update when available', async () => {
    const document = {
      id: 'observer',
      getFlag: jest.fn(() => ({})),
      update: jest.fn(),
    };
    const token = { document };
    const scene = { updateEmbeddedDocuments: jest.fn().mockResolvedValue([]) };
    const waitForToken = jest.fn().mockResolvedValue(undefined);
    const invalidate = jest.fn();
    const onMetrics = jest.fn();

    const result = await applyTokenFlagMapUpdates({
      entries: [{ tokenId: 'observer', map: { target: { sense: 'vision' } } }],
      moduleId: 'pf2e-visioner',
      flagKey: 'detection',
      scene,
      getTokenById: () => token,
      waitForToken,
      invalidate,
      onMetrics,
    });

    expect(result).toEqual({ written: 1, skipped: 0 });
    expect(invalidate).toHaveBeenCalledWith('token-flag-write', { written: 1 });
    expect(onMetrics).toHaveBeenCalledWith({
      requestedEntries: 1,
      updatePassCount: 1,
      updateCount: 1,
      updatedTokenCount: 1,
      skippedEntries: 0,
    });
    expect(waitForToken).toHaveBeenCalledWith(token);
    expect(scene.updateEmbeddedDocuments).toHaveBeenCalledWith(
      'Token',
      [{ _id: 'observer', 'flags.pf2e-visioner.detection': { target: { sense: 'vision' } } }],
      { diff: false, render: false, animate: false },
    );
    expect(document.update).not.toHaveBeenCalled();
  });

  test('applies multi-pass token updates in order through scene bulk updates', async () => {
    const firstDocument = { id: 'observer' };
    const secondDocument = { id: 'observer-b' };
    const scene = { updateEmbeddedDocuments: jest.fn().mockResolvedValue([]) };
    const waitForToken = jest.fn().mockResolvedValue(undefined);
    const invalidate = jest.fn();
    const onMetrics = jest.fn();
    const observer = { document: firstDocument };
    const observerB = { document: secondDocument };

    const result = await applyTokenFlagUpdatePasses({
      updatePasses: [
        [
          buildTokenFlagUnsetUpdate({
            document: firstDocument,
            moduleId: 'pf2e-visioner',
            flagKey: 'visibilityV2',
          }),
        ],
        [
          buildTokenFlagSetUpdate({
            document: firstDocument,
            moduleId: 'pf2e-visioner',
            flagKey: 'visibilityV2',
            value: { target: { detectionState: 'hidden' } },
          }),
          buildTokenFlagSetUpdate({
            document: secondDocument,
            moduleId: 'pf2e-visioner',
            flagKey: 'visibilityV2',
            value: { target: { detectionState: 'observed' } },
          }),
        ],
      ],
      tokensToWaitFor: [observer, observerB, observer],
      requestedEntries: 2,
      waitForToken,
      scene,
      invalidate,
      onMetrics,
    });

    expect(result).toEqual({ written: 3 });
    expect(invalidate).toHaveBeenCalledWith('token-flag-write', { written: 3 });
    expect(onMetrics).toHaveBeenCalledWith({
      requestedEntries: 2,
      updatePassCount: 2,
      updateCount: 3,
      updatedTokenCount: 2,
      skippedEntries: 0,
    });
    expect(waitForToken).toHaveBeenCalledTimes(2);
    expect(scene.updateEmbeddedDocuments).toHaveBeenNthCalledWith(
      1,
      'Token',
      [{ _id: 'observer', 'flags.pf2e-visioner.-=visibilityV2': null }],
      { diff: false, render: false, animate: false },
    );
    expect(scene.updateEmbeddedDocuments).toHaveBeenNthCalledWith(
      2,
      'Token',
      [
        {
          _id: 'observer',
          'flags.pf2e-visioner.visibilityV2': {
            target: { detectionState: 'hidden' },
          },
        },
        {
          _id: 'observer-b',
          'flags.pf2e-visioner.visibilityV2': {
            target: { detectionState: 'observed' },
          },
        },
      ],
      { diff: false, render: false, animate: false },
    );
  });

  test('setTokenFlagMap skips unchanged maps and writes changed maps without document id', async () => {
    const document = {
      id: 'observer',
      getFlag: jest.fn(() => ({ target: { sense: 'hearing' } })),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const token = { document };
    const waitForToken = jest.fn().mockResolvedValue(undefined);
    const invalidate = jest.fn();
    const onMetrics = jest.fn();

    await expect(setTokenFlagMap({
      token,
      map: { target: { sense: 'hearing' } },
      moduleId: 'pf2e-visioner',
      flagKey: 'detection',
      waitForToken,
      invalidate,
      onMetrics,
    })).resolves.toEqual({ written: 0, skipped: 1 });
    expect(invalidate).not.toHaveBeenCalled();
    expect(onMetrics).toHaveBeenLastCalledWith({
      requestedEntries: 1,
      updatePassCount: 0,
      updateCount: 0,
      updatedTokenCount: 0,
      skippedEntries: 1,
    });

    document.getFlag.mockReturnValue({ target: { sense: 'vision' } });
    await expect(setTokenFlagMap({
      token,
      map: { target: { sense: 'hearing' } },
      moduleId: 'pf2e-visioner',
      flagKey: 'detection',
      waitForToken,
      invalidate,
      onMetrics,
    })).resolves.toEqual({ written: 1, skipped: 0 });

    expect(invalidate).toHaveBeenCalledWith('token-flag-write', {
      written: 1,
      flagKey: 'detection',
      tokenId: 'observer',
    });
    expect(waitForToken).toHaveBeenCalledTimes(1);
    expect(onMetrics).toHaveBeenLastCalledWith({
      requestedEntries: 1,
      updatePassCount: 1,
      updateCount: 1,
      updatedTokenCount: 1,
      skippedEntries: 0,
    });
    expect(document.update).toHaveBeenCalledWith(
      { 'flags.pf2e-visioner.detection': { target: { sense: 'hearing' } } },
      { diff: false, render: false, animate: false },
    );
  });

  test('buildTokenFlagWriteMetrics summarizes pass count and updated token count', () => {
    const metrics = buildTokenFlagWriteMetrics({
      requestedEntries: 3,
      updatePasses: [
        [{ _id: 'observer' }, { _id: 'observer-b' }],
        [{ _id: 'observer' }],
      ],
    });

    expect(metrics).toEqual({
      requestedEntries: 3,
      updatePassCount: 2,
      updateCount: 3,
      updatedTokenCount: 2,
      skippedEntries: 1,
    });
  });
});
