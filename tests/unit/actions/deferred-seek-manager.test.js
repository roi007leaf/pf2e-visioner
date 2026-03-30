import '../../setup.js';

jest.mock('../../../scripts/utils/logger.js', () => ({
  getLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

jest.mock('../../../scripts/constants.js', () => ({
  MODULE_ID: 'pf2e-visioner',
}));

describe('DeferredSeekManager', () => {
  let DeferredSeekManager;
  let mockTokenDoc;
  let mockToken;

  beforeEach(async () => {
    jest.resetModules();

    const flags = {};
    mockTokenDoc = {
      id: 'obs1',
      getFlag: jest.fn((moduleId, key) => flags[`${moduleId}.${key}`]),
      setFlag: jest.fn(async (moduleId, key, value) => {
        flags[`${moduleId}.${key}`] = value;
      }),
      unsetFlag: jest.fn(async (moduleId, key) => {
        delete flags[`${moduleId}.${key}`];
      }),
    };
    mockToken = { id: 'obs1', document: mockTokenDoc, name: 'Observer' };

    global.canvas = {
      ...global.canvas,
      tokens: {
        placeables: [mockToken],
      },
    };

    global.game = {
      ...global.game,
      user: { isGM: true },
    };

    global.Hooks = {
      on: jest.fn(),
      once: jest.fn(),
      off: jest.fn(),
      call: jest.fn(),
      callAll: jest.fn(),
    };

    const mod = await import(
      '../../../scripts/chat/services/infra/DeferredSeekManager.js'
    );
    DeferredSeekManager = mod.default;
  });

  test('storeDeferredResults saves to token flag', async () => {
    await DeferredSeekManager.storeDeferredResults('obs1', [
      { targetId: 'tgt1', newVisibility: 'hidden', oldVisibility: 'undetected', outcome: 'success' },
    ]);

    expect(mockTokenDoc.setFlag).toHaveBeenCalledWith(
      'pf2e-visioner',
      'deferredSeekResults',
      expect.arrayContaining([
        expect.objectContaining({ targetId: 'tgt1', newVisibility: 'hidden' }),
      ])
    );
  });

  test('getDeferredForToken returns stored results', async () => {
    await DeferredSeekManager.storeDeferredResults('obs1', [
      { targetId: 'tgt1', newVisibility: 'hidden', oldVisibility: 'undetected', outcome: 'success' },
    ]);

    const deferred = DeferredSeekManager.getDeferredForToken('obs1');
    expect(deferred).toHaveLength(1);
    expect(deferred[0].targetId).toBe('tgt1');
  });

  test('clearDeferredForToken removes flag', async () => {
    await DeferredSeekManager.storeDeferredResults('obs1', [
      { targetId: 'tgt1', newVisibility: 'hidden' },
    ]);

    await DeferredSeekManager.clearDeferredForToken('obs1');
    expect(mockTokenDoc.unsetFlag).toHaveBeenCalledWith('pf2e-visioner', 'deferredSeekResults');
  });

  test('clearAll removes flags from all tokens', async () => {
    await DeferredSeekManager.storeDeferredResults('obs1', [
      { targetId: 'tgt1', newVisibility: 'hidden' },
    ]);

    await DeferredSeekManager.clearAll();
    expect(mockTokenDoc.unsetFlag).toHaveBeenCalledWith('pf2e-visioner', 'deferredSeekResults');
  });

  test('storeDeferredResults does nothing with empty results', async () => {
    await DeferredSeekManager.storeDeferredResults('obs1', []);
    expect(mockTokenDoc.setFlag).not.toHaveBeenCalled();
  });

  test('storeDeferredResults does nothing with unknown token', async () => {
    await DeferredSeekManager.storeDeferredResults('unknown', [
      { targetId: 'tgt1', newVisibility: 'hidden' },
    ]);
    expect(mockTokenDoc.setFlag).not.toHaveBeenCalled();
  });

  test('storeDeferredResults merges duplicate targetIds', async () => {
    await DeferredSeekManager.storeDeferredResults('obs1', [
      { targetId: 'tgt1', newVisibility: 'hidden', outcome: 'success' },
    ]);
    await DeferredSeekManager.storeDeferredResults('obs1', [
      { targetId: 'tgt1', newVisibility: 'observed', outcome: 'critical-success' },
    ]);

    const deferred = DeferredSeekManager.getDeferredForToken('obs1');
    expect(deferred).toHaveLength(1);
    expect(deferred[0].newVisibility).toBe('observed');
  });
});
