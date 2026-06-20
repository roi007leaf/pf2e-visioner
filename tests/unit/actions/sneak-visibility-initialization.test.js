import '../../setup.js';

describe('sneak visibility initialization', () => {
  test('preview-only actions do not set flags or calculate visibility', async () => {
    const { initializeSneakVisibility } = await import(
      '../../../scripts/chat/services/actions/Sneak/sneak-visibility-initialization.js'
    );
    const sneakingToken = createMockToken({ id: 'sneaker' });
    sneakingToken.document.setFlag = jest.fn();

    await initializeSneakVisibility(
      { previewOnly: true },
      {
        getSneakingToken: jest.fn(() => sneakingToken),
        visibilityCalculator: { calculateVisibilityBetweenTokens: jest.fn() },
      },
    );

    expect(sneakingToken.document.setFlag).not.toHaveBeenCalled();
  });

  test('sets sneak flag, applies speed effect, writes observer maps, and triggers AVS recalc', async () => {
    const { initializeSneakVisibility } = await import(
      '../../../scripts/chat/services/actions/Sneak/sneak-visibility-initialization.js'
    );
    const sneakingToken = createMockToken({ id: 'sneaker' });
    const observer = createMockToken({ id: 'observer' });
    sneakingToken.document.id = 'sneaker-doc';
    sneakingToken.document.x = 100;
    sneakingToken.document.y = 200;
    sneakingToken.document.elevation = 5;
    observer.document.x = 300;
    observer.document.y = 400;
    observer.document.elevation = 0;
    sneakingToken.document.setFlag = jest.fn().mockResolvedValue(undefined);
    canvas.tokens.placeables = [sneakingToken, observer];

    const observerMap = {};
    const applySneakWalkSpeed = jest.fn().mockResolvedValue(undefined);
    const recalculateSneaking = jest.fn().mockResolvedValue(undefined);
    const visibilityCalculator = {
      calculateVisibilityBetweenTokens: jest.fn().mockResolvedValue('hidden'),
    };

    await initializeSneakVisibility(
      {},
      {
        getSneakingToken: jest.fn(() => sneakingToken),
        applySneakWalkSpeed,
        visibilityCalculator,
        getVisibilityMap: jest.fn(() => observerMap),
        recalculateSneaking,
      },
    );

    expect(sneakingToken.document.setFlag).toHaveBeenCalledWith(
      'pf2e-visioner',
      'sneak-active',
      true,
    );
    expect(applySneakWalkSpeed).toHaveBeenCalledWith(sneakingToken);
    expect(visibilityCalculator.calculateVisibilityBetweenTokens).toHaveBeenCalledWith(
      observer,
      sneakingToken,
      { x: 300, y: 400, elevation: 0 },
      { x: 100, y: 200, elevation: 5 },
    );
    expect(observerMap['sneaker-doc']).toBe('hidden');
    expect(recalculateSneaking).toHaveBeenCalledTimes(1);
  });
});
