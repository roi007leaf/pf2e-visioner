import {
  buildPerceptionProfileFlagUpdatePasses,
  normalizePerceptionProfileMap,
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
  test('builds v14-safe nested removal patches for partial visibilityV2 removals', () => {
    const observer = global.createMockToken({ id: 'observer' });
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
        _id: 'observer',
        'flags.pf2e-visioner.visibilityV2': {
          keep: expect.objectContaining({ detectionState: 'undetected' }),
          remove: foundry.data.operators.ForcedDeletion,
        },
      },
    ]]);
    expect(passes[0][0]['flags.pf2e-visioner.visibilityV2']).not.toHaveProperty('-=remove');
  });

  test('falls back to legacy nested deletion syntax only without ForcedDeletion', () => {
    const originalForcedDeletion = global.foundry.data.operators.ForcedDeletion;
    global.foundry.data.operators.ForcedDeletion = undefined;
    const observer = global.createMockToken({ id: 'observer' });
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
          _id: 'observer',
          'flags.pf2e-visioner.visibilityV2': {
            keep: expect.objectContaining({ detectionState: 'undetected' }),
            '-=remove': null,
          },
        },
      ]]);
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
});
