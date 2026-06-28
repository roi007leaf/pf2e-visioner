import '../../setup.js';

describe('use-case cover-adjustment integration helper', () => {
  test('_applyCoverAdjustments returns adjusted state via resolveAdjustedCover', async () => {
    jest.resetModules();
    jest.doMock('../../../scripts/cover/cover-adjustments.js', () => ({
      resolveAdjustedCover: async ({ baseState }) => ({ state: baseState === 'greater' ? 'standard' : baseState, applied: ['x'] }),
    }));
    const { BaseAutoCoverUseCase } = await import('../../../scripts/cover/auto-cover/usecases/BaseUseCase.js');
    const uc = Object.create(BaseAutoCoverUseCase.prototype);
    const attacker = { id: 'a', actor: {} };
    const defender = { id: 'd', actor: {} };
    const out = await uc._applyCoverAdjustments(attacker, defender, 'greater', null);
    expect(out).toBe('standard');
  });

  test('returns base state unchanged when nothing applies', async () => {
    jest.resetModules();
    jest.doMock('../../../scripts/cover/cover-adjustments.js', () => ({
      resolveAdjustedCover: async ({ baseState }) => ({ state: baseState, applied: [] }),
    }));
    const { BaseAutoCoverUseCase } = await import('../../../scripts/cover/auto-cover/usecases/BaseUseCase.js');
    const uc = Object.create(BaseAutoCoverUseCase.prototype);
    const out = await uc._applyCoverAdjustments({ id: 'a' }, { id: 'd' }, 'lesser', null);
    expect(out).toBe('lesser');
  });

  test('threads consume option through to resolveAdjustedCover', async () => {
    jest.resetModules();
    let capturedConsume;
    jest.doMock('../../../scripts/cover/cover-adjustments.js', () => ({
      resolveAdjustedCover: async ({ baseState, consume }) => { capturedConsume = consume; return { state: baseState, applied: [] }; },
    }));
    const { BaseAutoCoverUseCase } = await import('../../../scripts/cover/auto-cover/usecases/BaseUseCase.js');
    const uc = Object.create(BaseAutoCoverUseCase.prototype);
    await uc._applyCoverAdjustments({ id: 'a' }, { id: 'd' }, 'standard', null, { consume: false });
    expect(capturedConsume).toBe(false);
    jest.resetModules();
    let capturedConsume2;
    jest.doMock('../../../scripts/cover/cover-adjustments.js', () => ({
      resolveAdjustedCover: async ({ baseState, consume }) => { capturedConsume2 = consume; return { state: baseState, applied: [] }; },
    }));
    const { BaseAutoCoverUseCase: UC2 } = await import('../../../scripts/cover/auto-cover/usecases/BaseUseCase.js');
    const uc2 = Object.create(UC2.prototype);
    await uc2._applyCoverAdjustments({ id: 'a' }, { id: 'd' }, 'standard', null, { consume: true });
    expect(capturedConsume2).toBe(true);
  });
});
