import '../../setup.js';

describe('sneak visibility outcome resolution', () => {
  afterEach(() => {
    jest.dontMock('../../../scripts/chat/services/FeatsHandler.js');
    jest.resetModules();
  });

  test('uses standard visibility mapping and feat adjustment without position data', async () => {
    const adjustVisibility = jest.fn(() => 'undetected');
    jest.doMock('../../../scripts/chat/services/FeatsHandler.js', () => ({
      __esModule: true,
      FeatsHandler: {
        isEnvironmentActive: jest.fn(() => true),
        adjustVisibility,
      },
    }));

    const { resolveSneakVisibilityOutcome } = await import(
      '../../../scripts/chat/services/actions/Sneak/sneak-visibility-outcome.js'
    );

    const result = await resolveSneakVisibilityOutcome({
      actionData: { actor: { id: 'sneaker' } },
      subject: { id: 'observer' },
      current: 'hidden',
      adjustedOutcome: 'success',
      originalOutcome: 'failure',
      originalTotal: null,
      total: 23,
      dc: 20,
      die: 12,
      getPositionTransitionForSubject: jest.fn(async () => null),
      getSneakingToken: jest.fn(() => ({ id: 'sneaker-token' })),
      turnSneakTracker: { hasSneakyFeat: jest.fn(() => false) },
    });

    expect(result).toMatchObject({
      newVisibility: 'undetected',
      originalNewVisibility: 'undetected',
      enhancedOutcome: null,
      positionTransition: null,
    });
    expect(adjustVisibility).toHaveBeenCalledWith(
      'sneak',
      { id: 'sneaker' },
      'hidden',
      'undetected',
      {
        inNaturalTerrain: true,
        outcome: 'success',
      },
    );
  });

  test('enforces end-position requirement after enhanced outcome unless a feat skips it', async () => {
    jest.doMock('../../../scripts/chat/services/FeatsHandler.js', () => ({
      __esModule: true,
      FeatsHandler: {
        shouldSkipEndCoverRequirement: jest.fn(() => false),
        isEnvironmentActive: jest.fn(() => false),
        adjustVisibility: jest.fn((_action, _actor, _current, newVisibility) => newVisibility),
      },
    }));

    const { resolveSneakVisibilityOutcome } = await import(
      '../../../scripts/chat/services/actions/Sneak/sneak-visibility-outcome.js'
    );
    const positionTransition = {
      startPosition: { avsVisibility: 'hidden' },
      endPosition: { avsVisibility: 'observed', coverState: 'none' },
    };

    const result = await resolveSneakVisibilityOutcome({
      actionData: { actor: { id: 'sneaker' } },
      subject: { id: 'observer' },
      current: 'hidden',
      adjustedOutcome: 'success',
      originalOutcome: 'success',
      originalTotal: null,
      total: 23,
      dc: 20,
      die: 12,
      getPositionTransitionForSubject: jest.fn(async () => positionTransition),
      getSneakingToken: jest.fn(() => ({ id: 'sneaker-token' })),
      turnSneakTracker: { hasSneakyFeat: jest.fn(() => false) },
    });

    expect(result.newVisibility).toBe('avs');
    expect(result.originalNewVisibility).toBe('avs');
    expect(result.enhancedOutcome).toMatchObject({
      outcomeReason: 'end_position_unqualified',
    });
    expect(result.positionTransition).toBe(positionTransition);
  });

  test('turn tracking can suppress repeated Sneaky outcomes to AVS', async () => {
    jest.doMock('../../../scripts/chat/services/FeatsHandler.js', () => ({
      __esModule: true,
      FeatsHandler: {
        isEnvironmentActive: jest.fn(() => false),
        adjustVisibility: jest.fn((_action, _actor, _current, newVisibility) => newVisibility),
      },
    }));

    const { resolveSneakVisibilityOutcome } = await import(
      '../../../scripts/chat/services/actions/Sneak/sneak-visibility-outcome.js'
    );
    const sneakingToken = { id: 'sneaker-token' };
    const subject = { id: 'observer' };
    const turnSneakTracker = {
      hasSneakyFeat: jest.fn(() => true),
      recordRollOutcome: jest.fn(() => false),
    };

    const result = await resolveSneakVisibilityOutcome({
      actionData: { actor: { id: 'sneaker' } },
      subject,
      current: 'hidden',
      adjustedOutcome: 'success',
      originalOutcome: 'success',
      originalTotal: null,
      total: 23,
      dc: 20,
      die: 12,
      getPositionTransitionForSubject: jest.fn(async () => null),
      getSneakingToken: jest.fn(() => sneakingToken),
      turnSneakTracker,
    });

    expect(result.newVisibility).toBe('avs');
    expect(result.originalNewVisibility).toBe('avs');
    expect(turnSneakTracker.recordRollOutcome).toHaveBeenCalledWith(
      sneakingToken,
      subject,
      'success',
      'undetected',
    );
  });
});
