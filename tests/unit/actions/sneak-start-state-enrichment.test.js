import '../../setup.js';

describe('sneak start-state enrichment', () => {
  afterEach(() => {
    jest.dontMock('../../../scripts/utils.js');
    jest.resetModules();
  });

  test('uses stored start state and end cover to compute direct-apply visibility', async () => {
    jest.doMock('../../../scripts/utils.js', () => ({
      __esModule: true,
      getCoverBetween: jest.fn(() => 'standard'),
    }));

    const { enrichSneakOutcomesWithStartStates } = await import(
      '../../../scripts/chat/services/actions/Sneak/sneak-start-state-enrichment.js'
    );
    const observer = { id: 'observer-1' };
    const outcomes = [
      {
        token: observer,
        outcome: 'success',
        currentVisibility: 'observed',
        newVisibility: 'hidden',
      },
    ];

    await enrichSneakOutcomesWithStartStates(
      {
        actor: { id: 'sneaker' },
        message: {
          flags: {
            'pf2e-visioner': {
              sneakStartStates: {
                'observer-1': { visibility: 'hidden' },
              },
            },
          },
        },
      },
      outcomes,
      {
        getSneakingToken: jest.fn(() => ({ id: 'sneaker-token' })),
        autoCoverSystem: { isEnabled: jest.fn(() => false) },
        stealthCheckUseCase: { _detectCover: jest.fn() },
      },
    );

    expect(outcomes[0]).toMatchObject({
      oldVisibility: 'hidden',
      currentVisibility: 'observed',
      newVisibility: 'undetected',
      changed: true,
    });
  });

  test('forces AVS when stored start position did not qualify', async () => {
    const { enrichSneakOutcomesWithStartStates } = await import(
      '../../../scripts/chat/services/actions/Sneak/sneak-start-state-enrichment.js'
    );
    const outcomes = [
      {
        token: { id: 'observer-1' },
        outcome: 'success',
        currentVisibility: 'hidden',
        newVisibility: 'undetected',
      },
    ];

    await enrichSneakOutcomesWithStartStates(
      {
        actor: { id: 'sneaker' },
        message: {
          flags: {
            'pf2e-visioner': {
              sneakStartStates: {
                'observer-1': { visibility: 'observed', endCoverState: 'standard' },
              },
            },
          },
        },
      },
      outcomes,
      {
        getSneakingToken: jest.fn(() => ({ id: 'sneaker-token' })),
        autoCoverSystem: { isEnabled: jest.fn(() => false) },
        stealthCheckUseCase: { _detectCover: jest.fn() },
      },
    );

    expect(outcomes[0]).toMatchObject({
      oldVisibility: 'observed',
      currentVisibility: 'hidden',
      newVisibility: 'avs',
      changed: true,
    });
  });

  test('uses automatic cover fallback when no manual cover is present', async () => {
    jest.doMock('../../../scripts/utils.js', () => ({
      __esModule: true,
      getCoverBetween: jest.fn(() => 'none'),
    }));

    const { enrichSneakOutcomesWithStartStates } = await import(
      '../../../scripts/chat/services/actions/Sneak/sneak-start-state-enrichment.js'
    );
    const stealthCheckUseCase = { _detectCover: jest.fn(() => 'greater') };
    const outcomes = [
      {
        token: { id: 'observer-1' },
        outcome: 'success',
        currentVisibility: 'observed',
        newVisibility: 'hidden',
      },
    ];

    await enrichSneakOutcomesWithStartStates(
      {
        actor: { id: 'sneaker' },
        message: {
          flags: {
            'pf2e-visioner': {
              sneakStartStates: {
                'observer-1': { visibility: 'hidden' },
              },
            },
          },
        },
      },
      outcomes,
      {
        getSneakingToken: jest.fn(() => ({ id: 'sneaker-token' })),
        autoCoverSystem: { isEnabled: jest.fn(() => true) },
        stealthCheckUseCase,
      },
    );

    expect(outcomes[0].newVisibility).toBe('undetected');
    expect(stealthCheckUseCase._detectCover).toHaveBeenCalled();
  });
});
