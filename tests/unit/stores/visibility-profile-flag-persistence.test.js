import {
  buildPerceptionProfileFlagUpdatePasses,
  clearPendingPerceptionProfileWrites,
  getRawPerceptionProfileEntry,
  normalizePerceptionProfileMap,
  rememberPendingPerceptionProfileWrite,
  setPerceptionProfileFlag,
} from '../../../scripts/stores/visibility-profile-flag-persistence.js';

function hiddenProfile() {
  return {
    detectionState: 'hidden',
    hasConcealment: false,
    coverState: 'none',
    detectionSense: null,
    awarenessState: null,
  };
}

function undetectedProfile() {
  return {
    ...hiddenProfile(),
    detectionState: 'undetected',
  };
}

describe('visibility profile flag persistence', () => {
  afterEach(() => {
    clearPendingPerceptionProfileWrites();
  });

  test('builds v14 nested deletion patches for partial visibilityV2 removals', () => {
    const forcedDeletion = foundry.data.operators.ForcedDeletion;
    const observer = global.createMockToken({ id: 'observer-build' });
    observer.document.getFlag.mockImplementation((moduleId, key) => {
      if (moduleId !== 'pf2e-visioner' || key !== 'visibilityV2') return null;
      return {
        keep: undetectedProfile(),
        remove: hiddenProfile(),
      };
    });

    const passes = buildPerceptionProfileFlagUpdatePasses(observer, {
      keep: undetectedProfile(),
    });

    expect(passes).toEqual([[
      {
        _id: 'observer-build',
        'flags.pf2e-visioner.visibilityV2': {
          keep: expect.objectContaining({ detectionState: 'undetected' }),
          remove: forcedDeletion,
        },
      },
    ]]);
    expect(passes[0][0]['flags.pf2e-visioner.visibilityV2']).not.toHaveProperty('-=remove');
  });

  test('writes partial visibilityV2 removals with v14 nested deletion operator', async () => {
    const forcedDeletion = foundry.data.operators.ForcedDeletion;
    const observer = global.createMockToken({ id: 'observer-write' });
    observer.document.getFlag.mockImplementation((moduleId, key) => {
      if (moduleId !== 'pf2e-visioner' || key !== 'visibilityV2') return null;
      return {
        keep: undetectedProfile(),
        remove: hiddenProfile(),
      };
    });

    await setPerceptionProfileFlag(observer, {
      keep: undetectedProfile(),
    });

    expect(observer.document.unsetFlag).not.toHaveBeenCalled();
    expect(observer.document.setFlag).toHaveBeenCalledWith('pf2e-visioner', 'visibilityV2', {
      keep: expect.objectContaining({ detectionState: 'undetected' }),
      remove: forcedDeletion,
    });
  });

  test('pending write overlays do not hide stale document profile removals', () => {
    const observer = global.createMockToken({ id: 'observer-pending-stale-build' });
    observer.document.getFlag.mockImplementation((moduleId, key) => {
      if (moduleId !== 'pf2e-visioner' || key !== 'visibilityV2') return null;
      return {
        keep: hiddenProfile(),
        stale: undetectedProfile(),
      };
    });

    rememberPendingPerceptionProfileWrite(observer, {
      keep: hiddenProfile(),
    }, { removedTargetIds: ['stale'] });

    const passes = buildPerceptionProfileFlagUpdatePasses(observer, {
      keep: hiddenProfile(),
    });

    expect(passes).toEqual([[
      {
        _id: 'observer-pending-stale-build',
        'flags.pf2e-visioner.visibilityV2': {
          keep: expect.objectContaining({ detectionState: 'hidden' }),
          stale: foundry.data.operators.ForcedDeletion,
        },
      },
    ]]);
    expect(passes[0][0]['flags.pf2e-visioner.visibilityV2']).not.toHaveProperty('-=stale');
  });

  test('setPerceptionProfileFlag deletes stale document profiles hidden by pending overlay', async () => {
    const observer = global.createMockToken({ id: 'observer-pending-stale-write' });
    observer.document.getFlag.mockImplementation((moduleId, key) => {
      if (moduleId !== 'pf2e-visioner' || key !== 'visibilityV2') return null;
      return {
        keep: hiddenProfile(),
        stale: undetectedProfile(),
      };
    });

    rememberPendingPerceptionProfileWrite(observer, {
      keep: hiddenProfile(),
    }, { removedTargetIds: ['stale'] });

    await setPerceptionProfileFlag(observer, {
      keep: hiddenProfile(),
    });

    expect(observer.document.setFlag).toHaveBeenCalledWith('pf2e-visioner', 'visibilityV2', {
      keep: expect.objectContaining({ detectionState: 'hidden' }),
      stale: foundry.data.operators.ForcedDeletion,
    });
  });

  test('falls back to legacy nested deletion syntax without ForcedDeletion', () => {
    const originalForcedDeletion = global.foundry.data.operators.ForcedDeletion;
    global.foundry.data.operators.ForcedDeletion = undefined;
    const observer = global.createMockToken({ id: 'observer-legacy' });
    observer.document.getFlag.mockImplementation((moduleId, key) => {
      if (moduleId !== 'pf2e-visioner' || key !== 'visibilityV2') return null;
      return {
        keep: undetectedProfile(),
        remove: hiddenProfile(),
      };
    });

    try {
      const passes = buildPerceptionProfileFlagUpdatePasses(observer, {
        keep: undetectedProfile(),
      });

      expect(passes).toEqual([[
        {
          _id: 'observer-legacy',
          'flags.pf2e-visioner.visibilityV2': {
            keep: expect.objectContaining({ detectionState: 'undetected' }),
            '-=remove': null,
          },
        },
      ]]);
      expect(passes[0][0]['flags.pf2e-visioner.visibilityV2']).not.toHaveProperty('remove');
    } finally {
      global.foundry.data.operators.ForcedDeletion = originalForcedDeletion;
    }
  });

  test('instantiates Foundry v14 ForcedDeletion operator classes', () => {
    const originalForcedDeletion = global.foundry.data.operators.ForcedDeletion;
    class ForcedDeletion {}
    global.foundry.data.operators.ForcedDeletion = ForcedDeletion;
    const observer = global.createMockToken({ id: 'observer-v14-class' });
    observer.document.getFlag.mockImplementation((moduleId, key) => {
      if (moduleId !== 'pf2e-visioner' || key !== 'visibilityV2') return null;
      return {
        keep: undetectedProfile(),
        remove: hiddenProfile(),
      };
    });

    try {
      const passes = buildPerceptionProfileFlagUpdatePasses(observer, {
        keep: undetectedProfile(),
      });
      const patch = passes[0][0]['flags.pf2e-visioner.visibilityV2'];

      expect(patch.keep).toEqual(expect.objectContaining({ detectionState: 'undetected' }));
      expect(patch.remove).toBeInstanceOf(ForcedDeletion);
      expect(normalizePerceptionProfileMap({
        keep: hiddenProfile(),
        remove: new ForcedDeletion(),
      })).toEqual({
        keep: expect.objectContaining({ detectionState: 'hidden' }),
      });
    } finally {
      global.foundry.data.operators.ForcedDeletion = originalForcedDeletion;
    }
  });

  test('normalizes away deletion operators and default profiles from raw maps', () => {
    expect(normalizePerceptionProfileMap({
      keep: hiddenProfile(),
      observed: {
        detectionState: 'observed',
        hasConcealment: false,
        coverState: 'none',
        detectionSense: null,
        awarenessState: null,
      },
      remove: foundry.data.operators.ForcedDeletion,
      '-=legacy': null,
    })).toEqual({
      keep: expect.objectContaining({ detectionState: 'hidden' }),
    });
  });

  test('pending profile writes overlay noisy intermediate document updates', () => {
    const observer = global.createMockToken({ id: 'observer-overlay' });
    observer.document.getFlag.mockImplementation((moduleId, key) => {
      if (moduleId !== 'pf2e-visioner' || key !== 'visibilityV2') return null;
      return {};
    });

    rememberPendingPerceptionProfileWrite(observer, {
      target: hiddenProfile(),
    });

    expect(getRawPerceptionProfileEntry(observer, 'target')).toEqual(
      expect.objectContaining({ detectionState: 'hidden' }),
    );
  });

  test('pending profile writes preserve unrelated stored profiles', () => {
    const observer = global.createMockToken({ id: 'observer-overlay-merge' });
    observer.document.getFlag.mockImplementation((moduleId, key) => {
      if (moduleId !== 'pf2e-visioner' || key !== 'visibilityV2') return null;
      return {
        keepRaw: hiddenProfile(),
      };
    });

    rememberPendingPerceptionProfileWrite(observer, {
      touched: undetectedProfile(),
    });

    expect(getRawPerceptionProfileEntry(observer, 'keepRaw')).toEqual(
      expect.objectContaining({ detectionState: 'hidden' }),
    );
    expect(getRawPerceptionProfileEntry(observer, 'touched')).toEqual(
      expect.objectContaining({ detectionState: 'undetected' }),
    );
  });

  test('pending profile writes hide explicitly removed stored profiles', () => {
    const observer = global.createMockToken({ id: 'observer-overlay-remove' });
    observer.document.getFlag.mockImplementation((moduleId, key) => {
      if (moduleId !== 'pf2e-visioner' || key !== 'visibilityV2') return null;
      return {
        removed: hiddenProfile(),
      };
    });

    rememberPendingPerceptionProfileWrite(observer, {}, { removedTargetIds: ['removed'] });

    expect(getRawPerceptionProfileEntry(observer, 'removed')).toBeNull();
  });
});
