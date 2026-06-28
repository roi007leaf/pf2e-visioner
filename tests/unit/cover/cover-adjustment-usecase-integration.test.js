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
});
