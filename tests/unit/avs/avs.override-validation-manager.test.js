describe('OverrideValidationManager display filtering', () => {
  const legendarySneakRulesText =
    "You're always sneaking unless you choose to be seen, even when there's nowhere to hide. You can Hide and Sneak even without cover or being Concealed. When you employ an exploration tactic other than Avoiding Notice, you also gain the benefits of Avoiding Notice unless you choose not to.";

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
          state: 'unnoticed',
          currentVisibility: 'observed',
        }),
      ],
      'Stealther',
      stealther.id,
    );
    expect(indicatorHide).not.toHaveBeenCalled();
  });

  describe('Legendary Sneak validation', () => {
    beforeEach(() => {
      jest.resetModules();
      global.game.pf2eVisioner = {};
      global.canvas.tokens.placeables = [];
      global.canvas.tokens.get = jest.fn();
    });

    afterEach(() => {
      delete global.game.pf2eVisioner;
    });

    async function setupManagerForObservedTarget(targetActorItems = []) {
      jest.doMock('../../../scripts/visibility/auto-visibility/VisibilityCalculator.js', () => ({
        __esModule: true,
        optimizedVisibilityCalculator: {
          calculateVisibilityWithoutOverrides: jest.fn(async () => 'observed'),
        },
      }));

      const coverDetectorInstance = {
        detectFromPoint: jest.fn(() => 'none'),
        detectBetweenTokens: jest.fn(() => 'none'),
        hasLargeCreatureCover: jest.fn(() => false),
      };
      jest.doMock('../../../scripts/cover/auto-cover/CoverDetector.js', () => ({
        __esModule: true,
        CoverDetector: jest.fn(() => coverDetectorInstance),
        default: coverDetectorInstance,
      }));

      jest.doMock('../../../scripts/visibility/auto-visibility/VisionAnalyzer.js', () => ({
        __esModule: true,
        VisionAnalyzer: {
          getInstance: jest.fn(() => ({
            clearCache: jest.fn(),
            hasLineOfSight: jest.fn(() => true),
            getVisionCapabilities: jest.fn(() => ({ hasDarkvision: false })),
          })),
        },
      }));

      const { OverrideValidationManager } = await import(
        '../../../scripts/visibility/auto-visibility/core/OverrideValidationManager.js'
      );

      const observer = global.createMockToken({ id: 'observer', name: 'Observer' });
      const target = global.createMockToken({
        id: 'stealther',
        name: 'Stealther',
        actor: global.createMockActor({
          id: 'stealther-actor',
          items: targetActorItems,
        }),
      });

      global.canvas.tokens.placeables = [observer, target];
      global.canvas.tokens.get.mockImplementation((id) =>
        global.canvas.tokens.placeables.find((token) => token.id === id) || null,
      );

      const manager = new OverrideValidationManager(
        { isExcludedToken: jest.fn(() => false) },
        { getTokenPosition: jest.fn(() => ({ x: 0, y: 0, elevation: 0 })) },
        { calculateVisibility: jest.fn() },
      );

      return { manager, observer, target };
    }

    test.each(['sneak_action', 'manual_action'])(
      'does not flag %s stealth overrides when the target has Legendary Sneak',
      async (source) => {
        const { manager, observer, target } = await setupManagerForObservedTarget([
          { type: 'feat', system: { slug: 'legendary-sneak' } },
        ]);

        const result = await manager.checkOverrideValidity(observer.id, target.id, {
          state: 'undetected',
          source,
          hasCover: false,
          hasConcealment: true,
        });

        expect(result).toBeNull();
      },
    );

    test('uses FeatsHandler for Legendary Sneak detection', async () => {
      const featsHandlerModulePath = '../../../scripts/chat/services/FeatsHandler.js';
      const hasFeat = jest.fn((tokenOrActor, slugOrSlugs) => {
        const slugs = Array.isArray(slugOrSlugs) ? slugOrSlugs : [slugOrSlugs];
        return slugs.includes('legendary-sneak');
      });
      jest.doMock(featsHandlerModulePath, () => ({
        __esModule: true,
        FeatsHandler: { hasFeat },
        default: { hasFeat },
      }));

      try {
        const { manager, observer, target } = await setupManagerForObservedTarget([]);

        const result = await manager.checkOverrideValidity(observer.id, target.id, {
          state: 'undetected',
          source: 'sneak_action',
          hasCover: false,
          hasConcealment: true,
        });

        expect(result).toBeNull();
        expect(hasFeat).toHaveBeenCalledWith(target, 'legendary-sneak');
      } finally {
        jest.dontMock(featsHandlerModulePath);
      }
    });

    test('marks awareness changes for Legendary Sneak target stealth overrides', async () => {
      const { manager, observer, target } = await setupManagerForObservedTarget([]);
      target.actor.getRollOptions = jest.fn(() => ['self:feat:legendary-sneak']);
      target.document.flags['pf2e-visioner'] = {
        [`avs-override-from-${observer.id}`]: {
          state: 'undetected',
          source: 'sneak_action',
          hasCover: false,
          hasConcealment: true,
          observerId: observer.id,
          targetId: target.id,
          observerName: observer.name,
          targetName: target.name,
        },
      };

      const result = await manager.validateOverridesForToken(target.id);

      expect(result).toEqual(
        expect.objectContaining({
          __showAwareness: true,
          overrides: [
            expect.objectContaining({
              observerId: observer.id,
              targetId: target.id,
              state: 'undetected',
              stealthPositionBypassFeat: 'legendary-sneak',
              stealthPositionBypassLabel: 'Legendary Sneak',
              stealthPositionBypassTooltip: legendarySneakRulesText,
            }),
          ],
        }),
      );
    });

    test('still flags Ceaseless Shadows stealth overrides when the target is clearly observed', async () => {
      const { manager, observer, target } = await setupManagerForObservedTarget([
        { type: 'feat', system: { slug: 'ceaseless-shadows' } },
      ]);

      const result = await manager.checkOverrideValidity(observer.id, target.id, {
        state: 'undetected',
        source: 'sneak_action',
        hasCover: false,
        hasConcealment: true,
      });

      expect(result).toEqual(
        expect.objectContaining({
          shouldRemove: true,
          currentVisibility: 'observed',
          currentCover: 'none',
        }),
      );
    });

    test('still flags ordinary sneak overrides when the target is clearly observed', async () => {
      const { manager, observer, target } = await setupManagerForObservedTarget([]);

      const result = await manager.checkOverrideValidity(observer.id, target.id, {
        state: 'undetected',
        source: 'sneak_action',
        hasCover: false,
        hasConcealment: true,
      });

      expect(result).toEqual(
        expect.objectContaining({
          shouldRemove: true,
          currentVisibility: 'observed',
          currentCover: 'none',
        }),
      );
    });

    test('flags cover-only drift even when visibility is unchanged', async () => {
      const { manager, observer, target } = await setupManagerForObservedTarget([]);

      const result = await manager.checkOverrideValidity(observer.id, target.id, {
        state: 'observed',
        source: 'manual_action',
        hasCover: true,
        hasConcealment: false,
        expectedCover: 'standard',
      });

      expect(result).toEqual(
        expect.objectContaining({
          shouldRemove: true,
          reason: 'no cover',
          currentVisibility: 'observed',
          currentCover: 'none',
        }),
      );
    });

    test('uses token-to-token cover detection for Take Cover markers', async () => {
      jest.doMock('../../../scripts/visibility/auto-visibility/VisibilityCalculator.js', () => ({
        __esModule: true,
        optimizedVisibilityCalculator: {
          calculateVisibilityWithoutOverrides: jest.fn(async () => 'observed'),
        },
      }));

      const coverDetectorInstance = {
        detectFromPoint: jest.fn(() => 'none'),
        detectBetweenTokens: jest.fn(() => 'lesser'),
      };
      jest.doMock('../../../scripts/cover/auto-cover/CoverDetector.js', () => ({
        __esModule: true,
        CoverDetector: jest.fn(() => coverDetectorInstance),
        default: coverDetectorInstance,
      }));

      const { OverrideValidationManager } = await import(
        '../../../scripts/visibility/auto-visibility/core/OverrideValidationManager.js'
      );

      const observer = global.createMockToken({ id: 'observer', name: 'Observer' });
      const target = global.createMockToken({ id: 'target', name: 'Target' });
      global.canvas.tokens.placeables = [observer, target];
      global.canvas.tokens.get.mockImplementation((id) =>
        global.canvas.tokens.placeables.find((token) => token.id === id) || null,
      );

      const manager = new OverrideValidationManager(
        { isExcludedToken: jest.fn(() => false) },
        { getTokenPosition: jest.fn(() => ({ x: 0, y: 0, elevation: 0 })) },
        { calculateVisibility: jest.fn() },
      );

      const result = await manager.checkOverrideValidity(observer.id, target.id, {
        state: 'avs',
        source: 'take_cover_action',
        coverOnly: true,
        hasCover: true,
        hasConcealment: false,
        expectedCover: 'standard',
      });

      expect(coverDetectorInstance.detectBetweenTokens).toHaveBeenCalledWith(
        observer,
        target,
        undefined,
      );
      expect(coverDetectorInstance.detectFromPoint).not.toHaveBeenCalled();
      expect(result).toEqual(
        expect.objectContaining({
          shouldRemove: true,
          currentVisibility: 'observed',
          currentCover: 'lesser',
        }),
      );
    });
  });
});
