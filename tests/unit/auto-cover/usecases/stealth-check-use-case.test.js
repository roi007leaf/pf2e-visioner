import '../../../setup.js';

let mockHasLineOfSight;

function mockToken(overrides = {}) {
  const token = global.createMockToken(overrides);
  if (overrides.alliance !== undefined) {
    token.actor.alliance = overrides.alliance;
  }
  return token;
}

describe('StealthCheckUseCase', () => {
  let stealthCheckUseCase;
  let mockAutoCoverSystem, mockCoverUIManager, mockTemplateManager;

  beforeEach(async () => {
    jest.resetModules();

    mockHasLineOfSight = jest.fn().mockReturnValue(true);

    jest.doMock('../../../../scripts/utils.js', () => ({
      getCoverBetween: jest.fn().mockReturnValue('none'),
    }));

    mockAutoCoverSystem = {
      detectCoverBetweenTokens: jest.fn().mockReturnValue('none'),
      detectCoverFromPoint: jest.fn().mockReturnValue('none'),
      getCoverBonusByState: jest.fn().mockImplementation((state) => {
        const bonuses = { none: 0, lesser: 1, standard: 2, greater: 4 };
        return bonuses[state] || 0;
      }),
      normalizeTokenRef: jest.fn().mockImplementation((ref) => {
        if (typeof ref === 'string') return ref;
        if (ref && typeof ref === 'object' && ref.id) return ref.id;
        return null;
      }),
      consumeCoverOverride: jest.fn().mockReturnValue(null),
      setCoverBetween: jest.fn().mockResolvedValue(undefined),
      recordPair: jest.fn(),
      setRollOverride: jest.fn(),
    };

    mockCoverUIManager = {
      injectDialogCoverUI: jest.fn(),
      showPopupAndApply: jest.fn().mockResolvedValue({ chosen: null, rollId: 'test-roll-id' }),
      shouldShowCoverOverrideIndicator: jest.fn().mockResolvedValue(false),
      injectCoverOverrideIndicator: jest.fn(),
    };

    mockTemplateManager = {
      getTemplatesData: jest.fn().mockReturnValue(new Map()),
      getTemplateOrigin: jest.fn().mockReturnValue(null),
      setTemplateOrigin: jest.fn(),
    };

    jest.doMock(
      '../../../../scripts/cover/auto-cover/AutoCoverSystem.js',
      () => mockAutoCoverSystem,
    );

    jest.doMock('../../../../scripts/cover/auto-cover/CoverUIManager.js', () => mockCoverUIManager);

    jest.doMock(
      '../../../../scripts/cover/auto-cover/TemplateManager.js',
      () => mockTemplateManager,
    );

    jest.doMock('../../../../scripts/services/CoverModifierService.js', () => {
      const mockInstance = {
        setOriginalCoverModifier: jest.fn(),
        getOriginalCoverModifier: jest.fn().mockReturnValue(null),
      };
      return {
        CoverModifierService: {
          getInstance: jest.fn().mockReturnValue(mockInstance),
        },
        default: mockInstance,
      };
    });

    jest.doMock('../../../../scripts/chat/services/actions/SneakAction.js', () => ({
      SneakActionHandler: jest.fn().mockImplementation(() => ({
        _captureStartPositions: jest.fn().mockResolvedValue(undefined),
      })),
    }));

    jest.doMock('../../../../scripts/visibility/auto-visibility/VisionAnalyzer.js', () => ({
      VisionAnalyzer: {
        getInstance: jest.fn().mockReturnValue({
          hasLineOfSight: mockHasLineOfSight,
        }),
      },
    }));

    const { StealthCheckUseCase } = await import(
      '../../../../scripts/cover/auto-cover/usecases/StealthCheckUseCase.js'
    );
    stealthCheckUseCase = new StealthCheckUseCase();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('handleCheckDialog - cover direction', () => {
    test('should detect cover from observer to hider, not hider to observer', async () => {
      const hiderToken = mockToken({ id: 'hider', isOwner: true, x: 0, y: 0, alliance: 'party' });
      const observerToken = mockToken({ id: 'observer', x: 5, y: 5, alliance: 'opposition' });

      const mockDialog = {
        context: { actor: { getActiveTokens: () => [hiderToken] } },
        check: { modifiers: [], calculateTotal: jest.fn() },
        _pvCoverOverride: undefined,
        render: jest.fn(),
        setPosition: jest.fn(),
      };

      global.canvas.tokens.placeables = [hiderToken, observerToken];
      stealthCheckUseCase._detectCover = jest.fn().mockReturnValue('standard');

      await stealthCheckUseCase.handleCheckDialog(mockDialog, {
        find: jest.fn().mockReturnValue({ length: 0, before: jest.fn() }),
      });

      expect(stealthCheckUseCase._detectCover).toHaveBeenCalledWith(observerToken, hiderToken);
    });

    test('should check manual cover from observer to hider', async () => {
      const hiderToken = mockToken({ id: 'hider', isOwner: true, x: 0, y: 0, alliance: 'party' });
      const observerToken = mockToken({ id: 'observer', x: 5, y: 5, alliance: 'opposition' });

      const mockDialog = {
        context: { actor: { getActiveTokens: () => [hiderToken] } },
        check: { modifiers: [], calculateTotal: jest.fn() },
        _pvCoverOverride: undefined,
        render: jest.fn(),
        setPosition: jest.fn(),
      };

      global.canvas.tokens.placeables = [hiderToken, observerToken];

      const { getCoverBetween } = await import('../../../../scripts/utils.js');
      getCoverBetween.mockReturnValue('none');
      stealthCheckUseCase._detectCover = jest.fn().mockReturnValue('none');

      await stealthCheckUseCase.handleCheckDialog(mockDialog, {
        find: jest.fn().mockReturnValue({ length: 0, before: jest.fn() }),
      });

      expect(getCoverBetween).toHaveBeenCalledWith(observerToken, hiderToken);
    });

    test('should skip observers with no line of sight', async () => {
      const hiderToken = mockToken({ id: 'hider', isOwner: true, x: 0, y: 0, alliance: 'party' });
      const blockedObserver = mockToken({ id: 'blocked', x: 10, y: 10, name: 'Blocked', alliance: 'opposition' });
      const visibleObserver = mockToken({ id: 'visible', x: 2, y: 2, name: 'Visible', alliance: 'opposition' });

      mockHasLineOfSight.mockImplementation((obs, tgt) => obs.id !== 'blocked');

      const mockDialog = {
        context: { actor: { getActiveTokens: () => [hiderToken] } },
        check: { modifiers: [], calculateTotal: jest.fn() },
        _pvCoverOverride: undefined,
        render: jest.fn(),
        setPosition: jest.fn(),
      };

      global.canvas.tokens.placeables = [hiderToken, blockedObserver, visibleObserver];
      stealthCheckUseCase._detectCover = jest.fn().mockReturnValue('standard');

      await stealthCheckUseCase.handleCheckDialog(mockDialog, {
        find: jest.fn().mockReturnValue({ length: 0, before: jest.fn() }),
      });

      expect(stealthCheckUseCase._detectCover).not.toHaveBeenCalledWith(blockedObserver, hiderToken);
      expect(stealthCheckUseCase._detectCover).toHaveBeenCalledWith(visibleObserver, hiderToken);
    });

    test('should skip allied observers', async () => {
      const hiderToken = mockToken({ id: 'hider', isOwner: true, x: 0, y: 0, alliance: 'party' });
      const allyToken = mockToken({ id: 'ally', x: 3, y: 3, name: 'Ally', alliance: 'party' });
      const enemyToken = mockToken({ id: 'enemy', x: 5, y: 5, name: 'Enemy', alliance: 'opposition' });

      const mockDialog = {
        context: { actor: { getActiveTokens: () => [hiderToken] } },
        check: { modifiers: [], calculateTotal: jest.fn() },
        _pvCoverOverride: undefined,
        render: jest.fn(),
        setPosition: jest.fn(),
      };

      global.canvas.tokens.placeables = [hiderToken, allyToken, enemyToken];
      stealthCheckUseCase._detectCover = jest.fn().mockReturnValue('standard');

      await stealthCheckUseCase.handleCheckDialog(mockDialog, {
        find: jest.fn().mockReturnValue({ length: 0, before: jest.fn() }),
      });

      expect(stealthCheckUseCase._detectCover).not.toHaveBeenCalledWith(allyToken, hiderToken);
      expect(stealthCheckUseCase._detectCover).toHaveBeenCalledWith(enemyToken, hiderToken);
    });

    test('should filter by alliance relative to hider (NPC hider skips opposition allies)', async () => {
      const npcHider = mockToken({ id: 'npc-hider', isOwner: true, x: 0, y: 0, alliance: 'opposition' });
      const npcAlly = mockToken({ id: 'npc-ally', x: 3, y: 3, name: 'NpcAlly', alliance: 'opposition' });
      const pcEnemy = mockToken({ id: 'pc-enemy', x: 5, y: 5, name: 'PcEnemy', alliance: 'party' });
      const neutralToken = mockToken({ id: 'neutral', x: 7, y: 7, name: 'Neutral', alliance: null });

      const mockDialog = {
        context: { actor: { getActiveTokens: () => [npcHider] } },
        check: { modifiers: [], calculateTotal: jest.fn() },
        _pvCoverOverride: undefined,
        render: jest.fn(),
        setPosition: jest.fn(),
      };

      global.canvas.tokens.placeables = [npcHider, npcAlly, pcEnemy, neutralToken];
      stealthCheckUseCase._detectCover = jest.fn().mockReturnValue('standard');

      await stealthCheckUseCase.handleCheckDialog(mockDialog, {
        find: jest.fn().mockReturnValue({ length: 0, before: jest.fn() }),
      });

      expect(stealthCheckUseCase._detectCover).not.toHaveBeenCalledWith(npcAlly, npcHider);
      expect(stealthCheckUseCase._detectCover).toHaveBeenCalledWith(pcEnemy, npcHider);
      expect(stealthCheckUseCase._detectCover).not.toHaveBeenCalledWith(neutralToken, npcHider);
    });
  });

  describe('handleCheckRoll - cover direction', () => {
    test('should detect cover from observer to hider, not hider to observer', async () => {
      const hiderToken = mockToken({ id: 'hider', isOwner: true, x: 0, y: 0, name: 'Hider', alliance: 'party' });
      const observerToken = mockToken({ id: 'observer', x: 5, y: 5, name: 'Observer', alliance: 'opposition' });

      const mockCheck = { modifiers: [], push: jest.fn() };
      const mockContext = { actor: { getActiveTokens: () => [hiderToken] }, options: [] };

      global.canvas.tokens.placeables = [hiderToken, observerToken];
      stealthCheckUseCase._detectCover = jest.fn().mockReturnValue('standard');

      await stealthCheckUseCase.handleCheckRoll(mockCheck, mockContext);

      expect(stealthCheckUseCase._detectCover).toHaveBeenCalledWith(observerToken, hiderToken);
    });

    test('should check manual cover from observer to hider', async () => {
      const hiderToken = mockToken({ id: 'hider', isOwner: true, x: 0, y: 0, name: 'Hider', alliance: 'party' });
      const observerToken = mockToken({ id: 'observer', x: 5, y: 5, name: 'Observer', alliance: 'opposition' });

      const mockCheck = { modifiers: [], push: jest.fn() };
      const mockContext = { actor: { getActiveTokens: () => [hiderToken] }, options: [] };

      global.canvas.tokens.placeables = [hiderToken, observerToken];

      const { getCoverBetween } = await import('../../../../scripts/utils.js');
      getCoverBetween.mockReturnValue('none');
      stealthCheckUseCase._detectCover = jest.fn().mockReturnValue('none');

      await stealthCheckUseCase.handleCheckRoll(mockCheck, mockContext);

      expect(getCoverBetween).toHaveBeenCalledWith(observerToken, hiderToken);
    });

    test('should skip observers with no line of sight', async () => {
      const hiderToken = mockToken({ id: 'hider', isOwner: true, x: 0, y: 0, name: 'Hider', alliance: 'party' });
      const blockedObserver = mockToken({ id: 'blocked', x: 10, y: 10, name: 'Blocked', alliance: 'opposition' });

      mockHasLineOfSight.mockReturnValue(false);

      const mockCheck = { modifiers: [], push: jest.fn() };
      const mockContext = { actor: { getActiveTokens: () => [hiderToken] }, options: [] };

      global.canvas.tokens.placeables = [hiderToken, blockedObserver];
      stealthCheckUseCase._detectCover = jest.fn().mockReturnValue('greater');

      await stealthCheckUseCase.handleCheckRoll(mockCheck, mockContext);

      expect(stealthCheckUseCase._detectCover).not.toHaveBeenCalled();
    });

    test('should skip allied observers', async () => {
      const hiderToken = mockToken({ id: 'hider', isOwner: true, x: 0, y: 0, name: 'Hider', alliance: 'party' });
      const allyToken = mockToken({ id: 'ally', x: 3, y: 3, name: 'Ally', alliance: 'party' });
      const enemyToken = mockToken({ id: 'enemy', x: 5, y: 5, name: 'Enemy', alliance: 'opposition' });

      const mockCheck = { modifiers: [], push: jest.fn() };
      const mockContext = { actor: { getActiveTokens: () => [hiderToken] }, options: [] };

      global.canvas.tokens.placeables = [hiderToken, allyToken, enemyToken];
      stealthCheckUseCase._detectCover = jest.fn().mockReturnValue('standard');

      await stealthCheckUseCase.handleCheckRoll(mockCheck, mockContext);

      expect(stealthCheckUseCase._detectCover).not.toHaveBeenCalledWith(allyToken, hiderToken);
      expect(stealthCheckUseCase._detectCover).toHaveBeenCalledWith(enemyToken, hiderToken);
    });

    test('should initialize detectedState to none when no observers have cover', async () => {
      const hiderToken = mockToken({ id: 'hider', isOwner: true, x: 0, y: 0, name: 'Hider', alliance: 'party' });
      const observerToken = mockToken({ id: 'observer', x: 2, y: 2, name: 'Observer', alliance: 'opposition' });

      const mockCheck = { modifiers: [], push: jest.fn() };
      const mockContext = { actor: { getActiveTokens: () => [hiderToken] }, options: [] };

      global.canvas.tokens.placeables = [hiderToken, observerToken];
      stealthCheckUseCase._detectCover = jest.fn().mockReturnValue('none');

      await stealthCheckUseCase.handleCheckRoll(mockCheck, mockContext);

      expect(mockCheck.push).not.toHaveBeenCalled();
    });

    test('should treat VisionAnalyzer returning undefined as having LOS', async () => {
      const hiderToken = mockToken({ id: 'hider', isOwner: true, x: 0, y: 0, name: 'Hider', alliance: 'party' });
      const observerToken = mockToken({ id: 'observer', x: 5, y: 5, name: 'Observer', alliance: 'opposition' });

      mockHasLineOfSight.mockReturnValue(undefined);

      const mockCheck = { modifiers: [], push: jest.fn() };
      const mockContext = { actor: { getActiveTokens: () => [hiderToken] }, options: [] };

      global.canvas.tokens.placeables = [hiderToken, observerToken];
      stealthCheckUseCase._detectCover = jest.fn().mockReturnValue('standard');

      await stealthCheckUseCase.handleCheckRoll(mockCheck, mockContext);

      expect(stealthCheckUseCase._detectCover).toHaveBeenCalledWith(observerToken, hiderToken);
    });
  });

  describe('handlePreCreateChatMessage - cover direction', () => {
    test('should detect cover from target (observer) to hider', async () => {
      const hiderToken = mockToken({ id: 'hider', isOwner: true, name: 'Hider', alliance: 'party' });
      const targetToken = mockToken({ id: 'target', name: 'Observer', alliance: 'opposition' });

      const mockData = {
        speaker: { token: 'hider' },
        flags: { pf2e: { context: { target: { token: 'target' } } } },
      };

      global.canvas = {
        tokens: {
          get: jest.fn().mockImplementation((id) => {
            if (id === 'hider') return hiderToken;
            if (id === 'target') return targetToken;
            return null;
          }),
        },
      };

      stealthCheckUseCase.normalizeTokenRef = jest.fn().mockImplementation((ref) => ref);
      stealthCheckUseCase._resolveTargetTokenIdFromData = jest.fn().mockReturnValue('target');
      stealthCheckUseCase._detectCover = jest.fn().mockReturnValue('standard');

      const { getCoverBetween } = await import('../../../../scripts/utils.js');
      getCoverBetween.mockReturnValue('none');

      await stealthCheckUseCase.handlePreCreateChatMessage(mockData);

      expect(getCoverBetween).toHaveBeenCalledWith(targetToken, hiderToken);
      expect(stealthCheckUseCase._detectCover).toHaveBeenCalledWith(targetToken, hiderToken);
    });
  });
});
