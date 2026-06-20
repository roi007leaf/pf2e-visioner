import '../../setup.js';

describe('sneak cover analysis', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.dontMock('../../../scripts/utils.js');
    jest.resetModules();
  });

  test('uses manual cover before automatic cover detection', async () => {
    const getCoverBetween = jest.fn(() => 'standard');
    jest.doMock('../../../scripts/utils.js', () => ({
      __esModule: true,
      getCoverBetween,
    }));

    const { buildSneakAutoCoverData } = await import(
      '../../../scripts/chat/services/actions/Sneak/sneak-cover-analysis.js'
    );
    const autoCoverSystem = {
      isEnabled: jest.fn(() => true),
      consumeCoverOverride: jest.fn(),
    };
    const stealthCheckUseCase = {
      _detectCover: jest.fn(),
      getOriginalCoverModifier: jest.fn(),
    };

    const result = await buildSneakAutoCoverData({
      actionData: { actor: createMockToken({ id: 'sneaker' }) },
      subject: createMockToken({ id: 'observer' }),
      autoCoverSystem,
      stealthCheckUseCase,
    });

    expect(result).toMatchObject({
      state: 'standard',
      source: 'manual',
      isOverride: false,
      canTakeCover: true,
    });
    expect(stealthCheckUseCase._detectCover).not.toHaveBeenCalled();
  });

  test('turns roll-specific cover override into display metadata', async () => {
    jest.doMock('../../../scripts/utils.js', () => ({
      __esModule: true,
      getCoverBetween: jest.fn(() => 'none'),
    }));

    const { buildSneakAutoCoverData } = await import(
      '../../../scripts/chat/services/actions/Sneak/sneak-cover-analysis.js'
    );
    const autoCoverSystem = {
      isEnabled: jest.fn(() => false),
      consumeCoverOverride: jest.fn(),
    };
    const stealthCheckUseCase = {
      getOriginalCoverModifier: jest.fn(() => ({
        isOverride: true,
        finalState: 'greater',
        source: 'dialog',
      })),
    };

    const result = await buildSneakAutoCoverData({
      actionData: {
        actor: createMockToken({ id: 'sneaker' }),
        context: { rollId: 'roll-1' },
      },
      subject: createMockToken({ id: 'observer' }),
      autoCoverSystem,
      stealthCheckUseCase,
    });

    expect(result).toMatchObject({
      state: 'greater',
      source: 'dialog',
      isOverride: true,
      overrideDetails: {
        originalState: 'none',
        finalState: 'greater',
        source: 'dialog',
      },
    });
    expect(autoCoverSystem.consumeCoverOverride).not.toHaveBeenCalled();
  });
});
