import '../../setup.js';

describe('AutoCoverHooks stealth context routing', () => {
  test('does not route plain Stealth skill checks to the initiative cover use case', async () => {
    jest.resetModules();

    const { AutoCoverHooks } = await import('../../../scripts/cover/auto-cover/AutoCoverHooks.js');
    const hooks = new AutoCoverHooks();

    const useCase = hooks._getUseCaseForContext({
      type: 'skill-check',
      options: ['check:statistic:stealth', 'check:type:skill'],
    });

    expect(useCase).toBeNull();
  });

  test('routes initiative rolls that use Stealth to the stealth cover use case', async () => {
    jest.resetModules();

    const { AutoCoverHooks } = await import('../../../scripts/cover/auto-cover/AutoCoverHooks.js');
    const hooks = new AutoCoverHooks();

    const useCase = hooks._getUseCaseForContext({
      type: 'initiative',
      options: [
        'initiative',
        'initiative-check',
        'skill-check',
        'stealth',
        'stealth-check',
        'check:statistic:base:stealth',
        'check:statistic:initiative',
        'check:type:initiative',
      ],
    });

    expect(useCase).toBe(hooks.stealthCheckUseCase);
  });

  test('does not route Sneak action checks through the generic stealth cover use case', async () => {
    jest.resetModules();

    const { AutoCoverHooks } = await import('../../../scripts/cover/auto-cover/AutoCoverHooks.js');
    const hooks = new AutoCoverHooks();

    const useCase = hooks._getUseCaseForContext({
      type: 'skill-check',
      domains: ['stealth'],
      options: ['action:sneak', 'check:statistic:stealth'],
    });

    expect(useCase).toBeNull();
  });

  test('does not route Hide action checks through the initiative cover use case', async () => {
    jest.resetModules();

    const { AutoCoverHooks } = await import('../../../scripts/cover/auto-cover/AutoCoverHooks.js');
    const hooks = new AutoCoverHooks();

    const useCase = hooks._getUseCaseForContext({
      type: 'skill-check',
      domains: ['stealth'],
      options: ['action:hide', 'check:statistic:stealth'],
    });

    expect(useCase).toBeNull();
  });
});
