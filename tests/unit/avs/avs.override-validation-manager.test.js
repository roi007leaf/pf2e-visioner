describe('OverrideValidationManager display filtering', () => {
  beforeEach(() => {
    jest.resetModules();
    global.game.pf2eVisioner = {};
    global.canvas.tokens.placeables = [];
    global.canvas.tokens.get = jest.fn();
  });

  afterEach(() => {
    delete global.game.pf2eVisioner;
  });

  test('keeps moved-token target override visible even when mover cannot see observer', async () => {
    const indicatorShow = jest.fn();
    const indicatorHide = jest.fn();
    const hasLineOfSight = jest.fn(() => false);

    jest.doMock('../../../scripts/ui/OverrideValidationIndicator.js', () => ({
      __esModule: true,
      default: {
        show: indicatorShow,
        hide: indicatorHide,
      },
    }));

    jest.doMock('../../../scripts/visibility/auto-visibility/VisionAnalyzer.js', () => ({
      __esModule: true,
      VisionAnalyzer: {
        getInstance: jest.fn(() => ({
          clearCache: jest.fn(),
          hasLineOfSight,
        })),
      },
    }));

    const { OverrideValidationManager } = await import(
      '../../../scripts/visibility/auto-visibility/core/OverrideValidationManager.js'
    );

    const stealther = global.createMockToken({ id: 'stealther', name: 'Stealther' });
    const observer = global.createMockToken({ id: 'observer', name: 'Observer' });
    stealther.document.name = 'Stealther';
    observer.document.name = 'Observer';

    global.canvas.tokens.placeables = [stealther, observer];
    global.canvas.tokens.get.mockImplementation((id) =>
      global.canvas.tokens.placeables.find((token) => token.id === id) || null,
    );
    global.game.pf2eVisioner.lastMovedTokenId = stealther.id;

    const manager = new OverrideValidationManager(
      { isExcludedToken: jest.fn(() => false) },
      { getTokenPosition: jest.fn(() => ({ x: 0, y: 0, elevation: 0 })) },
      { calculateVisibility: jest.fn() },
    );

    await manager.showOverrideValidationDialog(
      [
        {
          observerId: observer.id,
          targetId: stealther.id,
          override: {
            state: 'unnoticed',
            source: 'sneak_action',
            hasCover: false,
            hasConcealment: true,
          },
          reason: 'clearly visible',
          currentVisibility: 'observed',
          currentCover: 'none',
          reasonIcons: [],
        },
      ],
      stealther.id,
    );

    expect(hasLineOfSight).not.toHaveBeenCalled();
    expect(indicatorShow).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          observerId: observer.id,
          targetId: stealther.id,
          detectionState: 'undetected',
          awarenessState: 'unnoticed',
          currentVisibility: 'observed',
        }),
      ],
      'Stealther',
      stealther.id,
    );
    expect(indicatorHide).not.toHaveBeenCalled();
  });
});
