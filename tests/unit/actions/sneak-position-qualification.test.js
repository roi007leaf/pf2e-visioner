import '../../setup.js';

describe('sneak position qualification', () => {
  test('returns unqualified result when position transition is missing', async () => {
    const { checkSneakPositionQualification } = await import(
      '../../../scripts/chat/services/actions/Sneak/sneak-position-qualification.js'
    );

    await expect(
      checkSneakPositionQualification({
        positionTransition: null,
        actionData: {},
        observerToken: null,
        getSneakingToken: jest.fn(),
      }),
    ).resolves.toEqual({
      startQualifies: false,
      endQualifies: false,
      bothQualify: false,
      reason: 'No position data available',
    });
  });

  test('requires hidden or undetected start plus cover or concealment at end', async () => {
    game.settings.set('pf2e-visioner', 'sneakAllowHiddenUndetectedEndPosition', false);
    const { checkSneakPositionQualification } = await import(
      '../../../scripts/chat/services/actions/Sneak/sneak-position-qualification.js'
    );

    const result = await checkSneakPositionQualification({
      positionTransition: {
        startPosition: { avsVisibility: 'hidden' },
        endPosition: { avsVisibility: 'observed', coverState: 'lesser' },
      },
      actionData: {},
      observerToken: { id: 'observer' },
      getSneakingToken: jest.fn(() => ({ id: 'sneaker' })),
      turnSneakTracker: { hasSneakyFeat: jest.fn(() => false) },
      actionQualificationIntegration: {
        checkSneakWithRuleElements: jest.fn((_token, qualification) => qualification),
      },
      featsHandler: {
        isEnvironmentActive: jest.fn(() => false),
        overridePrerequisites: jest.fn((_actor, qualification) => qualification),
      },
    });

    expect(result).toMatchObject({
      startQualifies: true,
      endQualifies: false,
      bothQualify: false,
      reason: 'Position does not qualify for sneak',
    });
  });

  test('deferred Sneaky end-position check allows current application and records defer data', async () => {
    const recordDeferredCheck = jest.fn();
    const { checkSneakPositionQualification } = await import(
      '../../../scripts/chat/services/actions/Sneak/sneak-position-qualification.js'
    );
    const sneakingToken = { id: 'sneaker' };
    const observerToken = { id: 'observer' };
    const endPosition = { avsVisibility: 'observed', coverState: 'none' };

    const result = await checkSneakPositionQualification({
      positionTransition: {
        startPosition: { avsVisibility: 'hidden' },
        endPosition,
      },
      actionData: {},
      observerToken,
      getSneakingToken: jest.fn(() => sneakingToken),
      turnSneakTracker: {
        hasSneakyFeat: jest.fn(() => true),
        shouldDeferEndPositionCheck: jest.fn(() => true),
        recordDeferredCheck,
      },
      actionQualificationIntegration: {
        checkSneakWithRuleElements: jest.fn((_token, qualification) => qualification),
      },
      featsHandler: {
        isEnvironmentActive: jest.fn(() => false),
        overridePrerequisites: jest.fn((_actor, qualification) => qualification),
      },
    });

    expect(result.endQualifies).toBe(true);
    expect(result.bothQualify).toBe(true);
    expect(recordDeferredCheck).toHaveBeenCalledWith(sneakingToken, observerToken, {
      position: endPosition,
      visibility: 'observed',
      coverState: 'none',
    });
  });
});
