/**
 * Unit tests for AttackRollUseCase
 * Tests attack roll context handling and cover application in attack scenarios
 */

import '../../../setup.js';

describe('AttackRollUseCase', () => {
  let attackRollUseCase;
  let mockAutoCoverSystem, mockCoverUIManager, mockTemplateManager;

  beforeEach(async () => {
    jest.resetModules();

    // Mock getCoverBetween function from utils
    jest.doMock('../../../../scripts/utils.js', () => ({
      getCoverBetween: jest.fn().mockReturnValue(false), // Return false (no manual cover) by default
    }));

    // Mock dependencies
    mockAutoCoverSystem = {
      detectCoverBetweenTokens: jest.fn().mockReturnValue('standard'),
      getCoverBonusByState: jest.fn().mockImplementation((state) => {
        const bonuses = { none: 0, lesser: 1, standard: 2, greater: 4 };
        return bonuses[state] || 0;
      }),
      normalizeTokenRef: jest.fn().mockImplementation((ref) => {
        // Simple mock implementation that returns the ref if it's a string ID, or extracts ID if it's an object
        if (typeof ref === 'string') return ref;
        if (ref && typeof ref === 'object' && ref.id) return ref.id;
        return null;
      }),
    };

    mockCoverUIManager = {
      injectDialogCoverUI: jest.fn(),
      shouldShowCoverOverrideIndicator: jest.fn().mockResolvedValue(false),
      injectCoverOverrideIndicator: jest.fn(),
    };

    mockTemplateManager = {
      getTemplatesData: jest.fn().mockReturnValue(new Map()),
      getTemplateOrigin: jest.fn().mockReturnValue(null),
      setTemplateOrigin: jest.fn(),
    };

    // Mock the modules - return both the mock directly and as default export
    jest.doMock(
      '../../../../scripts/cover/auto-cover/AutoCoverSystem.js',
      () => mockAutoCoverSystem,
    );

    jest.doMock('../../../../scripts/cover/auto-cover/CoverUIManager.js', () => mockCoverUIManager);

    jest.doMock(
      '../../../../scripts/cover/auto-cover/TemplateManager.js',
      () => mockTemplateManager,
    );

    // Import the use case
    const { AttackRollUseCase } = await import(
      '../../../../scripts/cover/auto-cover/usecases/AttackRollUseCase.js'
    );
    attackRollUseCase = new AttackRollUseCase();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    test('should initialize with correct dependencies', () => {
      expect(attackRollUseCase).toBeDefined();
      // The BaseUseCase unwraps the default export, so we need to check for the inner mock
      expect(attackRollUseCase.autoCoverSystem).toBe(mockAutoCoverSystem);
      expect(attackRollUseCase.coverUIManager).toBe(mockCoverUIManager);
      expect(attackRollUseCase.templateManager).toBe(mockTemplateManager);
    });
  });

  describe('handlePreCreateChatMessage', () => {
    let mockData, speakerToken, targetToken;

    beforeEach(() => {
      speakerToken = global.createMockToken({ id: 'speaker' });
      targetToken = global.createMockToken({ id: 'target' });

      mockData = {
        speaker: { token: 'speaker' },
        flags: { pf2e: { context: { target: { token: 'target' } } } },
      };

      // Mock canvas and tokens
      global.canvas = {
        tokens: {
          get: jest.fn().mockImplementation((id) => {
            if (id === 'speaker') return speakerToken;
            if (id === 'target') return targetToken;
            return null;
          }),
        },
      };

      // Mock token resolution methods
      attackRollUseCase.normalizeTokenRef = jest.fn().mockImplementation((ref) => ref);
      attackRollUseCase._resolveTargetTokenIdFromData = jest.fn().mockReturnValue('target');
      attackRollUseCase._detectCover = jest.fn().mockReturnValue('standard');

      // Mock auto cover system methods
      attackRollUseCase.autoCoverSystem.getOverrideManager = jest.fn().mockReturnValue({
        consumeOverride: jest.fn().mockReturnValue(null),
      });
    });

    test('should auto-detect cover when manual cover is none', async () => {
      const { getCoverBetween } = await import('../../../../scripts/utils.js');
      getCoverBetween.mockReturnValue('none');

      await attackRollUseCase.handlePreCreateChatMessage(mockData);

      expect(getCoverBetween).toHaveBeenCalledWith(speakerToken, targetToken);
      expect(attackRollUseCase._detectCover).toHaveBeenCalledWith(speakerToken, targetToken, expect.any(Object));
    });

    test('should not auto-detect cover when manual cover exists', async () => {
      const { getCoverBetween } = await import('../../../../scripts/utils.js');
      getCoverBetween.mockReturnValue('greater');

      await attackRollUseCase.handlePreCreateChatMessage(mockData);

      expect(getCoverBetween).toHaveBeenCalledWith(speakerToken, targetToken);
      expect(attackRollUseCase._detectCover).not.toHaveBeenCalled();
    });

    test('should store override information in flags when overridden', async () => {
      const { getCoverBetween } = await import('../../../../scripts/utils.js');
      getCoverBetween.mockReturnValue('none');

      attackRollUseCase._detectCover.mockReturnValue('standard');

      const mockOverride = {
        state: 'greater',
        source: 'popup',
      };

      attackRollUseCase.autoCoverSystem.getOverrideManager.mockReturnValue({
        consumeOverride: jest.fn().mockReturnValue(mockOverride),
      });

      speakerToken.name = 'Attacker';
      targetToken.name = 'Target';

      await attackRollUseCase.handlePreCreateChatMessage(mockData);

      expect(mockData.flags['pf2e-visioner'].coverOverride).toEqual({
        originalDetected: 'standard',
        finalState: 'greater',
        overrideSource: 'popup',
        attackerName: 'Attacker',
        targetName: 'Target',
      });
    });

    test('should handle missing tokens gracefully', async () => {
      global.canvas.tokens.get.mockReturnValue(null);

      await expect(attackRollUseCase.handlePreCreateChatMessage(mockData)).resolves.toBeUndefined();
    });
  });

  describe('handleRenderChatMessage', () => {
    test('should return undefined (not implemented)', async () => {
      const result = await attackRollUseCase.handleRenderChatMessage({}, {});
      expect(result).toBeUndefined();
    });
  });

  describe('handleCheckDialog', () => {
    let mockDialog, mockHtml, attackerToken, targetToken;

    beforeEach(() => {
      attackerToken = global.createMockToken({ id: 'attacker' });
      targetToken = global.createMockToken({ id: 'target' });

      mockDialog = {
        context: {},
        check: {
          modifiers: [],
          calculateTotal: jest.fn(),
        },
        render: jest.fn(),
      };

      mockHtml = document.createElement('div');

      // Mock token resolution
      attackRollUseCase._resolveAttackerFromCtx = jest.fn().mockReturnValue(attackerToken);
      attackRollUseCase._resolveTargetFromCtx = jest.fn().mockReturnValue(targetToken);
    });

    test('should return early if no attacker or target', async () => {
      attackRollUseCase._resolveAttackerFromCtx.mockReturnValue(null);

      await attackRollUseCase.handleCheckDialog(mockDialog, mockHtml);

      expect(mockCoverUIManager.injectDialogCoverUI).not.toHaveBeenCalled();
    });

    test('should detect cover and inject UI', async () => {
      const { getCoverBetween } = await import('../../../../scripts/utils.js');
      getCoverBetween.mockReturnValue('none');

      attackRollUseCase._detectCover = jest.fn().mockReturnValue('standard');

      await attackRollUseCase.handleCheckDialog(mockDialog, mockHtml);

      expect(getCoverBetween).toHaveBeenCalledWith(attackerToken, targetToken);
      expect(attackRollUseCase._detectCover).toHaveBeenCalledWith(attackerToken, targetToken, {});
      expect(mockCoverUIManager.injectDialogCoverUI).toHaveBeenCalledWith(
        mockDialog,
        mockHtml,
        'standard',
        targetToken,
        'none', // manualCover
        expect.any(Function), // onChosen callback
      );
    });

    test('should use manual cover when it exists', async () => {
      const { getCoverBetween } = await import('../../../../scripts/utils.js');
      getCoverBetween.mockReturnValue('greater');

      attackRollUseCase._detectCover = jest.fn().mockReturnValue('standard');

      await attackRollUseCase.handleCheckDialog(mockDialog, mockHtml);

      expect(getCoverBetween).toHaveBeenCalledWith(attackerToken, targetToken);
      expect(attackRollUseCase._detectCover).toHaveBeenCalledWith(attackerToken, targetToken, {});
      expect(mockCoverUIManager.injectDialogCoverUI).toHaveBeenCalledWith(
        mockDialog,
        mockHtml,
        'standard',
        targetToken,
        'greater', // manualCover
        expect.any(Function), // onChosen callback
      );
    });

    test('should set dialog override only when manual cover is none and choice differs', async () => {
      const { getCoverBetween } = await import('../../../../scripts/utils.js');
      getCoverBetween.mockReturnValue('none');

      attackRollUseCase._detectCover = jest.fn().mockReturnValue('standard');
      attackRollUseCase.autoCoverSystem.setDialogOverride = jest.fn();

      let callbackFunction;
      mockCoverUIManager.injectDialogCoverUI.mockImplementation(
        (dialog, html, state, target, manualCover, callback) => {
          callbackFunction = callback;
        },
      );

      await attackRollUseCase.handleCheckDialog(mockDialog, mockHtml);

      // Simulate choosing a different state
      callbackFunction({
        chosen: 'greater',
        dctx: { dc: {} },
        target: targetToken,
        targetActor: targetToken.actor,
      });

      expect(attackRollUseCase.autoCoverSystem.setDialogOverride).toHaveBeenCalledWith(
        attackerToken,
        targetToken,
        'greater',
        'standard',
      );
    });

    test('should not set dialog override when manual cover exists', async () => {
      const { getCoverBetween } = await import('../../../../scripts/utils.js');
      getCoverBetween.mockReturnValue('greater');

      attackRollUseCase._detectCover = jest.fn().mockReturnValue('standard');
      attackRollUseCase.autoCoverSystem.setDialogOverride = jest.fn();

      let callbackFunction;
      mockCoverUIManager.injectDialogCoverUI.mockImplementation(
        (dialog, html, state, target, manualCover, callback) => {
          callbackFunction = callback;
        },
      );

      await attackRollUseCase.handleCheckDialog(mockDialog, mockHtml);

      // Simulate choosing any state
      callbackFunction({
        chosen: 'none',
        dctx: { dc: {} },
        target: targetToken,
        targetActor: targetToken.actor,
      });

      expect(attackRollUseCase.autoCoverSystem.setDialogOverride).not.toHaveBeenCalled();
    });

    test('should not set dialog override when choice equals detected state', async () => {
      const { getCoverBetween } = await import('../../../../scripts/utils.js');
      getCoverBetween.mockReturnValue('none');

      attackRollUseCase._detectCover = jest.fn().mockReturnValue('standard');
      attackRollUseCase.autoCoverSystem.setDialogOverride = jest.fn();

      let callbackFunction;
      mockCoverUIManager.injectDialogCoverUI.mockImplementation(
        (dialog, html, state, target, manualCover, callback) => {
          callbackFunction = callback;
        },
      );

      await attackRollUseCase.handleCheckDialog(mockDialog, mockHtml);

      // Simulate choosing the same state as detected
      callbackFunction({
        chosen: 'standard',
        dctx: { dc: {} },
        target: targetToken,
        targetActor: targetToken.actor,
      });

      expect(attackRollUseCase.autoCoverSystem.setDialogOverride).not.toHaveBeenCalled();
    });

    test('should handle UI injection errors gracefully', async () => {
      mockCoverUIManager.injectDialogCoverUI.mockRejectedValue(new Error('UI injection failed'));

      await expect(
        attackRollUseCase.handleCheckDialog(mockDialog, mockHtml),
      ).resolves.toBeUndefined();
    });

    test('should handle missing dialog check', async () => {
      mockDialog.check = null;

      let callbackFunction;
      mockCoverUIManager.injectDialogCoverUI.mockImplementation(
        (dialog, html, state, target, manualCover, callback) => {
          callbackFunction = callback;
        },
      );

      await attackRollUseCase.handleCheckDialog(mockDialog, mockHtml);

      // Callback should handle missing check gracefully
      expect(() => {
        if (typeof callbackFunction === 'function') {
          callbackFunction({
            chosen: 'standard',
            target: targetToken,
            targetActor: targetToken.actor,
          });
        }
      }).not.toThrow();
    });

    test('should handle calculateTotal errors gracefully', async () => {
      mockDialog.check.calculateTotal.mockImplementation(() => {
        throw new Error('Calculate total failed');
      });

      let callbackFunction;
      mockCoverUIManager.injectDialogCoverUI.mockImplementation(
        (dialog, html, state, target, manualCover, callback) => {
          callbackFunction = callback;
        },
      );

      await attackRollUseCase.handleCheckDialog(mockDialog, mockHtml);

      expect(() => {
        if (typeof callbackFunction === 'function') {
          callbackFunction({
            chosen: 'standard',
            target: targetToken,
            targetActor: targetToken.actor,
          });
        }
      }).not.toThrow();
    });
  });

  describe('handleCheckRoll', () => {
    let mockCheck, mockContext, attackerToken, targetToken;

    beforeEach(() => {
      attackerToken = global.createMockToken({ id: 'attacker' });
      targetToken = global.createMockToken({ id: 'target' });

      // Set ownership
      attackerToken.isOwner = true;
      global.game.user.isGM = false;

      mockCheck = {};
      mockContext = {};

      // Mock token resolution
      attackRollUseCase._resolveAttackerFromCtx = jest.fn().mockReturnValue(attackerToken);
      attackRollUseCase._resolveTargetFromCtx = jest.fn().mockReturnValue(targetToken);
      attackRollUseCase._detectCover = jest.fn().mockReturnValue('standard');
      jest.spyOn(attackRollUseCase, '_applyCoverEphemeralEffect').mockResolvedValue(undefined);

      // Mock UI manager
      attackRollUseCase.coverUIManager = {
        showPopupAndApply: jest.fn().mockResolvedValue({ chosen: null }),
      };

      // Mock auto cover system
      attackRollUseCase.autoCoverSystem = {
        setPopupOverride: jest.fn(),
      };

      // Mock visibility functions
      jest.doMock('../../../../scripts/utils.js', () => ({
        getCoverBetween: jest.fn().mockReturnValue('none'),
        getVisibilityBetween: jest.fn().mockReturnValue('observed'),
        setVisibilityBetween: jest.fn(),
      }));
    });

    test('should handle check roll and return success', async () => {
      const result = await attackRollUseCase.handleCheckRoll(mockCheck, mockContext);
      expect(result).toEqual({ success: true });
    });

    test('should use manual cover when it exists (not none)', async () => {
      const { getCoverBetween } = await import('../../../../scripts/utils.js');
      getCoverBetween.mockReturnValue('greater');

      await attackRollUseCase.handleCheckRoll(mockCheck, mockContext);

      expect(getCoverBetween).toHaveBeenCalledWith(attackerToken, targetToken);
      expect(attackRollUseCase._applyCoverEphemeralEffect).toHaveBeenCalledWith(
        targetToken,
        attackerToken,
        'greater', // finalState should be manual cover
        mockContext,
        'greater', // manualCover parameter
      );
    });

    test('should use popup choice when manual cover is none', async () => {
      const { getCoverBetween } = await import('../../../../scripts/utils.js');
      getCoverBetween.mockReturnValue('none');

      attackRollUseCase.coverUIManager.showPopupAndApply.mockResolvedValue({ chosen: 'lesser' });

      await attackRollUseCase.handleCheckRoll(mockCheck, mockContext);

      expect(getCoverBetween).toHaveBeenCalledWith(attackerToken, targetToken);
      expect(attackRollUseCase.coverUIManager.showPopupAndApply).toHaveBeenCalledWith(
        'standard',
        'none',
      );
      expect(attackRollUseCase._applyCoverEphemeralEffect).toHaveBeenCalledWith(
        targetToken,
        attackerToken,
        'lesser', // finalState should be popup choice
        mockContext,
        'none', // manualCover parameter
      );
    });

    test('should use detected state when manual cover is none and no popup choice', async () => {
      const { getCoverBetween } = await import('../../../../scripts/utils.js');
      getCoverBetween.mockReturnValue('none');

      attackRollUseCase.coverUIManager.showPopupAndApply.mockResolvedValue({ chosen: null });

      await attackRollUseCase.handleCheckRoll(mockCheck, mockContext);

      expect(attackRollUseCase._applyCoverEphemeralEffect).toHaveBeenCalledWith(
        targetToken,
        attackerToken,
        'standard', // finalState should be detected
        mockContext,
        'none', // manualCover parameter
      );
    });

    test('should set popup override when manual cover is none and choice differs from detected', async () => {
      const { getCoverBetween } = await import('../../../../scripts/utils.js');
      getCoverBetween.mockReturnValue('none');

      attackRollUseCase.coverUIManager.showPopupAndApply.mockResolvedValue({ chosen: 'greater' });

      await attackRollUseCase.handleCheckRoll(mockCheck, mockContext);

      expect(attackRollUseCase.autoCoverSystem.setPopupOverride).toHaveBeenCalledWith(
        attackerToken,
        targetToken,
        'greater',
        'standard',
      );
    });

    test('should not set popup override when manual cover exists', async () => {
      const { getCoverBetween } = await import('../../../../scripts/utils.js');
      getCoverBetween.mockReturnValue('greater');

      await attackRollUseCase.handleCheckRoll(mockCheck, mockContext);

      expect(attackRollUseCase.autoCoverSystem.setPopupOverride).not.toHaveBeenCalled();
    });

    test('should not set popup override when no popup choice made', async () => {
      const { getCoverBetween } = await import('../../../../scripts/utils.js');
      getCoverBetween.mockReturnValue('none');

      attackRollUseCase.coverUIManager.showPopupAndApply.mockResolvedValue({ chosen: null });

      await attackRollUseCase.handleCheckRoll(mockCheck, mockContext);

      expect(attackRollUseCase.autoCoverSystem.setPopupOverride).not.toHaveBeenCalled();
    });

    test('should not set popup override when choice equals detected state', async () => {
      const { getCoverBetween } = await import('../../../../scripts/utils.js');
      getCoverBetween.mockReturnValue('none');

      attackRollUseCase.coverUIManager.showPopupAndApply.mockResolvedValue({ chosen: 'standard' });

      await attackRollUseCase.handleCheckRoll(mockCheck, mockContext);

      expect(attackRollUseCase.autoCoverSystem.setPopupOverride).not.toHaveBeenCalled();
    });

    test('should handle popup errors gracefully', async () => {
      const { getCoverBetween } = await import('../../../../scripts/utils.js');
      getCoverBetween.mockReturnValue('none');

      attackRollUseCase.coverUIManager.showPopupAndApply.mockRejectedValue(
        new Error('Popup error'),
      );

      const result = await attackRollUseCase.handleCheckRoll(mockCheck, mockContext);

      expect(result).toEqual({ success: true });
      expect(attackRollUseCase._applyCoverEphemeralEffect).toHaveBeenCalledWith(
        targetToken,
        attackerToken,
        'standard', // Should fallback to detected state
        mockContext,
        'none',
      );
    });

    test('should return early without ownership', async () => {
      attackerToken.isOwner = false;
      global.game.user.isGM = false;

      const result = await attackRollUseCase.handleCheckRoll(mockCheck, mockContext);

      expect(result).toEqual({ success: true });
      expect(attackRollUseCase._applyCoverEphemeralEffect).not.toHaveBeenCalled();
    });

    test('should proceed with GM permission', async () => {
      attackerToken.isOwner = false;
      global.game.user.isGM = true;

      await attackRollUseCase.handleCheckRoll(mockCheck, mockContext);

      expect(attackRollUseCase._applyCoverEphemeralEffect).toHaveBeenCalled();
    });
  });

  describe('_resolveAttackerFromCtx', () => {
    test('should resolve attacker from context token object', () => {
      const attackerToken = global.createMockToken({ id: 'attacker' });
      const ctx = {
        token: {
          object: attackerToken,
        },
      };

      const result = attackRollUseCase._resolveAttackerFromCtx(ctx);
      expect(result).toBe(attackerToken);
    });

    test('should resolve attacker from token ID', () => {
      const attackerToken = global.createMockToken({ id: 'attacker' });

      // Mock canvas.tokens.get to return the token
      global.canvas.tokens.get = jest.fn().mockReturnValue(attackerToken);

      const ctx = {
        token: {
          id: 'attacker',
        },
      };

      const result = attackRollUseCase._resolveAttackerFromCtx(ctx);
      expect(result).toBe(attackerToken);
      expect(global.canvas.tokens.get).toHaveBeenCalledWith('attacker');
    });

    test('should resolve attacker from actor active tokens', () => {
      const attackerToken = global.createMockToken({ id: 'attacker' });
      const ctx = {
        actor: {
          getActiveTokens: jest.fn().mockReturnValue([attackerToken]),
        },
      };

      const result = attackRollUseCase._resolveAttackerFromCtx(ctx);
      expect(result).toBe(attackerToken);
      expect(ctx.actor.getActiveTokens).toHaveBeenCalled();
    });

    test('should return null for invalid context', () => {
      expect(attackRollUseCase._resolveAttackerFromCtx({})).toBeNull();
      expect(attackRollUseCase._resolveAttackerFromCtx(null)).toBeNull();
    });
  });

  describe('error handling', () => {
    test('should handle malformed dialog objects', async () => {
      const malformedDialog = {
        context: null,
        check: undefined,
      };

      await expect(
        attackRollUseCase.handleCheckDialog(malformedDialog, document.createElement('div')),
      ).resolves.toBeUndefined();
    });
  });
});
