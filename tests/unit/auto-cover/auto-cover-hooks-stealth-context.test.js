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

  test('scopes contextual target visibility around attack rolls when auto-cover is disabled', async () => {
    jest.resetModules();

    const { AutoCoverHooks } = await import('../../../scripts/cover/auto-cover/AutoCoverHooks.js');
    const { getActiveRollContextVisibilityOverride } =
      await import('../../../scripts/services/roll-context-visibility-override.js');
    const hooks = new AutoCoverHooks();
    hooks.autoCoverSystem = { isEnabled: () => false };
    const context = {
      type: 'attack-roll',
      options: new Set(['target:condition:concealed']),
      origin: { token: { id: 'attacker' } },
      target: { token: { id: 'defender' } },
    };
    const wrapped = jest.fn(async () => {
      expect(getActiveRollContextVisibilityOverride('attacker', 'defender')?.state).toBe(
        'concealed',
      );
      return 'rolled';
    });

    await expect(hooks._wrapCheckRoll(wrapped, {}, context)).resolves.toBe('rolled');
    expect(getActiveRollContextVisibilityOverride('attacker', 'defender')).toBeNull();
  });

  test('movement requests Take Cover expiration prompt through auto-cover hooks', async () => {
    jest.resetModules();

    const requestTakeCoverExpirationForToken = jest.fn().mockResolvedValue(true);
    jest.doMock('../../../scripts/chat/services/take-cover-expiration-service.js', () => ({
      __esModule: true,
      requestTakeCoverExpirationForToken,
    }));
    jest.doMock('../../../scripts/cover/auto-cover/AutoCoverSystem.js', () => ({
      __esModule: true,
      default: {
        isEnabled: jest.fn(() => true),
        getActivePairsInvolving: jest.fn(() => []),
        cleanupCover: jest.fn(),
      },
    }));

    const { AutoCoverHooks } = await import('../../../scripts/cover/auto-cover/AutoCoverHooks.js');
    const hooks = new AutoCoverHooks();
    const token = {
      id: 'token-1',
      actor: { id: 'actor-1', itemTypes: { effect: [] } },
      document: {
        id: 'token-1',
        flags: {
          'pf2e-visioner': {
            'avs-override-from-observer-1': {
              source: 'take_cover_action',
              coverOnly: true,
              expectedCover: 'standard',
            },
          },
        },
      },
    };
    canvas.tokens.get.mockImplementation((id) => (id === 'token-1' ? token : null));

    await hooks.onUpdateToken({ id: 'token-1' }, { x: 100 });

    expect(requestTakeCoverExpirationForToken).toHaveBeenCalledWith(token, 'movement');
  });
});
