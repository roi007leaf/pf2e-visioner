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

  test('force queue bypasses same-position debounce for post-removal validations', async () => {
    const { OverrideValidationManager } = await import(
      '../../../scripts/visibility/auto-visibility/core/OverrideValidationManager.js'
    );

    const target = global.createMockToken({ id: 'target', name: 'Target' });
    target.document.x = 100;
    target.document.y = 100;
    target.document.width = 1;
    target.document.height = 1;
    target.document.elevation = 0;
    global.canvas.tokens.get.mockImplementation((id) => (id === 'target' ? target : null));

    const manager = new OverrideValidationManager(
      { isExcludedToken: jest.fn(() => false) },
      { getTokenPosition: jest.fn(() => ({ x: 0, y: 0, elevation: 0 })) },
      { calculateVisibility: jest.fn() },
    );

    manager.queue('target');
    manager._tokensQueuedForValidation.clear();

    manager.queue('target');
    expect(manager._tokensQueuedForValidation.has('target')).toBe(false);

    manager.queue('target', { force: true });
    expect(manager._tokensQueuedForValidation.has('target')).toBe(true);
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

  test('propagates auto cover source from validity check into shown invalid overrides', async () => {
    const { OverrideValidationManager } = await import(
      '../../../scripts/visibility/auto-visibility/core/OverrideValidationManager.js'
    );

    const observer = global.createMockToken({ id: 'observer', name: 'Observer' });
    const target = global.createMockToken({ id: 'target', name: 'Target' });
    target.document.flags['pf2e-visioner'] = {
      'avs-override-from-observer': {
        state: 'hidden',
        source: 'manual_action',
        hasCover: false,
        hasConcealment: false,
        expectedCover: 'none',
        observerName: 'Observer',
        targetName: 'Target',
      },
    };

    global.canvas.tokens.placeables = [observer, target];
    global.canvas.tokens.get.mockImplementation((id) =>
      global.canvas.tokens.placeables.find((token) => token.id === id) || null,
    );

    const manager = new OverrideValidationManager(
      { isExcludedToken: jest.fn(() => false) },
      { getTokenPosition: jest.fn(() => ({ x: 0, y: 0, elevation: 0 })) },
      { calculateVisibility: jest.fn() },
    );
    manager.checkOverrideValidity = jest.fn(async () => ({
      shouldRemove: true,
      reason: 'has lesser cover',
      reasonIcons: [],
      currentVisibility: 'hidden',
      currentCover: 'lesser',
      coverChangeSource: 'auto',
    }));
    manager.showOverrideValidationDialog = jest.fn(async () => undefined);

    const result = await manager.validateOverridesForToken(target.id);

    expect(result.overrides[0]).toEqual(
      expect.objectContaining({
        currentCover: 'lesser',
        coverChangeSource: 'auto',
      }),
    );
    expect(manager.showOverrideValidationDialog).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          coverChangeSource: 'auto',
        }),
      ],
      target.id,
    );
  });

  test('reuses override validation cover detector across one moved-token batch', async () => {
    const calculateVisibilityWithoutOverrides = jest.fn(async () => 'observed');
    jest.doMock('../../../scripts/visibility/auto-visibility/VisibilityCalculator.js', () => ({
      __esModule: true,
      optimizedVisibilityCalculator: {
        calculateVisibilityWithoutOverrides,
      },
    }));

    const coverDetectorInstance = {
      detectFromPoint: jest.fn(() => 'none'),
      detectBetweenTokens: jest.fn(() => 'none'),
    };
    const CoverDetector = jest.fn(() => coverDetectorInstance);
    jest.doMock('../../../scripts/cover/auto-cover/CoverDetector.js', () => ({
      __esModule: true,
      CoverDetector,
      default: coverDetectorInstance,
    }));

    const { OverrideValidationManager } = await import(
      '../../../scripts/visibility/auto-visibility/core/OverrideValidationManager.js'
    );

    const observerA = global.createMockToken({ id: 'observer-a', name: 'Observer A' });
    const observerB = global.createMockToken({ id: 'observer-b', name: 'Observer B' });
    const target = global.createMockToken({ id: 'target', name: 'Target' });
    target.document.flags['pf2e-visioner'] = {
      'avs-override-from-observer-a': {
        state: 'observed',
        source: 'manual_action',
        hasCover: true,
        hasConcealment: false,
        expectedCover: 'standard',
        observerName: observerA.name,
        targetName: target.name,
      },
      'avs-override-from-observer-b': {
        state: 'observed',
        source: 'manual_action',
        hasCover: true,
        hasConcealment: false,
        expectedCover: 'standard',
        observerName: observerB.name,
        targetName: target.name,
      },
    };

    global.canvas.tokens.placeables = [observerA, observerB, target];
    global.canvas.tokens.get.mockImplementation((id) =>
      global.canvas.tokens.placeables.find((token) => token.id === id) || null,
    );

    const manager = new OverrideValidationManager(
      { isExcludedToken: jest.fn(() => false) },
      { getTokenPosition: jest.fn(() => ({ x: 0, y: 0, elevation: 0 })) },
      { calculateVisibility: jest.fn() },
    );
    manager.showOverrideValidationDialog = jest.fn(async () => undefined);

    const result = await manager.validateOverridesForToken(target.id);

    expect(result.overrides).toHaveLength(2);
    expect(CoverDetector).toHaveBeenCalledTimes(1);
    expect(coverDetectorInstance.detectFromPoint).toHaveBeenCalledTimes(2);
    expect(calculateVisibilityWithoutOverrides).toHaveBeenCalledTimes(2);
  });

  test('skips Take Cover cover-only validation when the covered token moved', async () => {
    const { OverrideValidationManager } = await import(
      '../../../scripts/visibility/auto-visibility/core/OverrideValidationManager.js'
    );

    const observer = global.createMockToken({ id: 'observer', name: 'Observer' });
    const target = global.createMockToken({ id: 'target', name: 'Target' });
    target.document.flags['pf2e-visioner'] = {
      'avs-override-from-observer': {
        state: 'avs',
        source: 'take_cover_action',
        coverOnly: true,
        coverOverrideSource: 'take_cover_action',
        expectedCover: 'standard',
        observerName: 'Observer',
        targetName: 'Target',
      },
    };

    global.canvas.tokens.placeables = [observer, target];
    global.canvas.tokens.get.mockImplementation((id) =>
      global.canvas.tokens.placeables.find((token) => token.id === id) || null,
    );

    const manager = new OverrideValidationManager(
      { isExcludedToken: jest.fn(() => false) },
      { getTokenPosition: jest.fn(() => ({ x: 0, y: 0, elevation: 0 })) },
      { calculateVisibility: jest.fn() },
    );
    manager.checkOverrideValidity = jest.fn();
    manager.showOverrideValidationDialog = jest.fn(async () => undefined);

    const result = await manager.validateOverridesForToken(target.id);

    expect(result.overrides).toEqual([]);
    expect(manager.checkOverrideValidity).not.toHaveBeenCalled();
    expect(manager.showOverrideValidationDialog).not.toHaveBeenCalled();
  });

  test('keeps mixed visibility rows when moved target also has Take Cover tracking', async () => {
    const { OverrideValidationManager } = await import(
      '../../../scripts/visibility/auto-visibility/core/OverrideValidationManager.js'
    );

    const observer = global.createMockToken({ id: 'observer', name: 'Observer' });
    const target = global.createMockToken({ id: 'target', name: 'Target' });
    target.document.flags['pf2e-visioner'] = {
      'avs-override-from-observer': {
        state: 'undetected',
        source: 'sneak_action',
        coverOnly: false,
        coverOverrideSource: 'take_cover_action',
        hasCover: true,
        hasConcealment: true,
        expectedCover: 'standard',
        observerName: 'Observer',
        targetName: 'Target',
      },
    };

    global.canvas.tokens.placeables = [observer, target];
    global.canvas.tokens.get.mockImplementation((id) =>
      global.canvas.tokens.placeables.find((token) => token.id === id) || null,
    );

    const manager = new OverrideValidationManager(
      { isExcludedToken: jest.fn(() => false) },
      { getTokenPosition: jest.fn(() => ({ x: 0, y: 0, elevation: 0 })) },
      { calculateVisibility: jest.fn() },
    );
    manager.checkOverrideValidity = jest.fn(async () => ({
      shouldRemove: true,
      reason: 'clearly visible',
      reasonIcons: [],
      currentVisibility: 'observed',
      currentCover: 'none',
    }));
    manager.showOverrideValidationDialog = jest.fn(async () => undefined);

    const result = await manager.validateOverridesForToken(target.id);

    expect(manager.checkOverrideValidity).toHaveBeenCalledWith(
      observer.id,
      target.id,
      expect.objectContaining({
        state: 'undetected',
        coverOverrideSource: 'take_cover_action',
        suppressCoverChange: true,
      }),
      expect.objectContaining({ includeStableOverrideState: true }),
    );
    expect(result.overrides).toEqual([
      expect.objectContaining({
        observerId: observer.id,
        targetId: target.id,
        suppressCoverChange: true,
        currentVisibility: 'observed',
      }),
    ]);
    expect(manager.showOverrideValidationDialog).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          suppressCoverChange: true,
        }),
      ],
      target.id,
    );
  });

  test('includes stable sibling visibility overrides when another moved-target override changed', async () => {
    jest.doMock('../../../scripts/visibility/auto-visibility/VisibilityCalculator.js', () => ({
      __esModule: true,
      optimizedVisibilityCalculator: {
        calculateVisibilityWithoutOverrides: jest.fn(async (observer) =>
          observer.id === 'behind-wall' ? 'hidden' : 'observed',
        ),
      },
    }));

    const coverDetectorInstance = {
      detectFromPoint: jest.fn(() => 'none'),
      detectBetweenTokens: jest.fn(() => 'none'),
    };
    jest.doMock('../../../scripts/cover/auto-cover/CoverDetector.js', () => ({
      __esModule: true,
      CoverDetector: jest.fn(() => coverDetectorInstance),
      default: coverDetectorInstance,
    }));

    const { OverrideValidationManager } = await import(
      '../../../scripts/visibility/auto-visibility/core/OverrideValidationManager.js'
    );

    const visibleObserver = global.createMockToken({ id: 'visible-observer', name: 'Visible Observer' });
    const behindWall = global.createMockToken({ id: 'behind-wall', name: 'Behind Wall' });
    const target = global.createMockToken({ id: 'target', name: 'Target' });
    target.document.flags['pf2e-visioner'] = {
      'avs-override-from-visible-observer': {
        state: 'hidden',
        source: 'sneak_action',
        hasCover: false,
        hasConcealment: true,
        observerName: visibleObserver.name,
        targetName: target.name,
      },
      'avs-override-from-behind-wall': {
        state: 'hidden',
        source: 'sneak_action',
        hasCover: false,
        hasConcealment: true,
        observerName: behindWall.name,
        targetName: target.name,
      },
    };

    global.canvas.tokens.placeables = [visibleObserver, behindWall, target];
    global.canvas.tokens.get.mockImplementation((id) =>
      global.canvas.tokens.placeables.find((token) => token.id === id) || null,
    );

    const manager = new OverrideValidationManager(
      { isExcludedToken: jest.fn(() => false) },
      { getTokenPosition: jest.fn(() => ({ x: 0, y: 0, elevation: 0 })) },
      { calculateVisibility: jest.fn() },
    );
    manager.showOverrideValidationDialog = jest.fn(async () => undefined);

    const result = await manager.validateOverridesForToken(target.id);

    expect(result.overrides).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          observerId: visibleObserver.id,
          targetId: target.id,
          currentVisibility: 'observed',
        }),
        expect.objectContaining({
          observerId: behindWall.id,
          targetId: target.id,
          currentVisibility: 'hidden',
          controlReleaseOnly: true,
        }),
      ]),
    );
    expect(manager.showOverrideValidationDialog).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ observerId: visibleObserver.id }),
        expect.objectContaining({ observerId: behindWall.id, controlReleaseOnly: true }),
      ]),
      target.id,
    );
  });

  test('does not open validation dialog for stable-only visibility overrides', async () => {
    jest.doMock('../../../scripts/visibility/auto-visibility/VisibilityCalculator.js', () => ({
      __esModule: true,
      optimizedVisibilityCalculator: {
        calculateVisibilityWithoutOverrides: jest.fn(async () => 'hidden'),
      },
    }));

    const coverDetectorInstance = {
      detectFromPoint: jest.fn(() => 'none'),
      detectBetweenTokens: jest.fn(() => 'none'),
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
    target.document.flags['pf2e-visioner'] = {
      'avs-override-from-observer': {
        state: 'hidden',
        source: 'sneak_action',
        hasCover: false,
        hasConcealment: true,
        observerName: observer.name,
        targetName: target.name,
      },
    };

    global.canvas.tokens.placeables = [observer, target];
    global.canvas.tokens.get.mockImplementation((id) =>
      global.canvas.tokens.placeables.find((token) => token.id === id) || null,
    );

    const manager = new OverrideValidationManager(
      { isExcludedToken: jest.fn(() => false) },
      { getTokenPosition: jest.fn(() => ({ x: 0, y: 0, elevation: 0 })) },
      { calculateVisibility: jest.fn() },
    );
    manager.showOverrideValidationDialog = jest.fn(async () => undefined);

    const result = await manager.validateOverridesForToken(target.id);

    expect(result.overrides).toEqual([
      expect.not.objectContaining({ controlReleaseOnly: true }),
    ]);
    expect(result.__showAwareness).toBe(true);
    expect(manager.showOverrideValidationDialog).not.toHaveBeenCalled();
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

    async function setupManagerForObservedTarget(targetActorItems = [], coverResult = 'none') {
      jest.doMock('../../../scripts/visibility/auto-visibility/VisibilityCalculator.js', () => ({
        __esModule: true,
        optimizedVisibilityCalculator: {
          calculateVisibilityWithoutOverrides: jest.fn(async () => 'observed'),
        },
      }));

      const coverDetectorInstance = {
        detectFromPoint: jest.fn(() => coverResult),
        detectBetweenTokens: jest.fn(() => coverResult),
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

    test('marks detected cover drift as auto cover calculation', async () => {
      const { manager, observer, target } = await setupManagerForObservedTarget([], 'lesser');

      const result = await manager.checkOverrideValidity(observer.id, target.id, {
        state: 'hidden',
        source: 'manual_action',
        hasCover: false,
        hasConcealment: false,
        expectedCover: 'none',
      });

      expect(result).toEqual(
        expect.objectContaining({
          shouldRemove: true,
          currentVisibility: 'observed',
          currentCover: 'lesser',
          coverChangeSource: 'auto',
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

    test('ignores suppressed Take Cover cover drift when visibility is unchanged', async () => {
      const { manager, observer, target } = await setupManagerForObservedTarget([]);

      const result = await manager.checkOverrideValidity(observer.id, target.id, {
        state: 'observed',
        source: 'manual_action',
        coverOverrideSource: 'take_cover_action',
        suppressCoverChange: true,
        hasCover: true,
        hasConcealment: false,
        expectedCover: 'standard',
      });

      expect(result).toBeNull();
    });

    test('flags visibility drift for Take Cover-tracked rows even when source is Take Cover', async () => {
      const { manager, observer, target } = await setupManagerForObservedTarget([]);

      const result = await manager.checkOverrideValidity(observer.id, target.id, {
        state: 'hidden',
        source: 'take_cover_action',
        coverOnly: false,
        coverOverrideSource: 'take_cover_action',
        suppressCoverChange: true,
        hasCover: true,
        hasConcealment: false,
        expectedCover: 'standard',
      });

      expect(result).toEqual(
        expect.objectContaining({
          shouldRemove: true,
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
