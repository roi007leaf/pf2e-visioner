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
      getPerceptionProfileBetween: jest.fn().mockReturnValue({}),
      getVisibilityBetween: jest.fn().mockReturnValue('observed'),
      setVisibilityBetween: jest.fn(),
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

  describe('_stripSuppressedOffGuardModifiers', () => {
    test('classifies each modifier once while removing suppressed off-guard modifiers', () => {
      attackRollUseCase._isOffGuardSuppressedForAttack = jest.fn(() => true);
      const classifySpy = jest.spyOn(attackRollUseCase, '_isSuppressedOffGuardModifier');
      const container = {
        modifiers: [
          { slug: 'pf2e-visioner-off-guard', modifier: -2 },
          { slug: 'other-bonus', modifier: 1 },
        ],
        calculateTotal: jest.fn(),
      };

      const changed = attackRollUseCase._stripSuppressedOffGuardModifiers(
        container,
        { id: 'attacker' },
        { id: 'target' },
      );

      expect(changed).toBe(true);
      expect(container.modifiers).toEqual([{ slug: 'other-bonus', modifier: 1 }]);
      expect(classifySpy).toHaveBeenCalledTimes(2);
      expect(container.calculateTotal).toHaveBeenCalled();
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
      expect(attackRollUseCase._detectCover).toHaveBeenCalledWith(
        speakerToken,
        targetToken,
        expect.any(Object),
      );
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

    test('should store Deny Advantage off-guard suppression in chat flags', async () => {
      const { getCoverBetween, getVisibilityBetween } = await import(
        '../../../../scripts/utils.js'
      );
      getCoverBetween.mockReturnValue('none');
      getVisibilityBetween.mockImplementation((observer, target) =>
        observer === targetToken && target === speakerToken ? 'hidden' : 'observed',
      );

      speakerToken.name = 'Cutthroat';
      speakerToken.actor = { system: { details: { level: { value: 8 } } } };
      targetToken.name = 'Calder';
      targetToken.actor = {
        system: { details: { level: { value: 8 } } },
        itemTypes: { feat: [{ slug: 'deny-advantage' }] },
      };

      await attackRollUseCase.handlePreCreateChatMessage(mockData);

      expect(mockData.flags['pf2e-visioner'].offGuardSuppression).toEqual(
        expect.objectContaining({
          source: 'deny-advantage',
          feat: 'deny-advantage',
          label: 'Deny Advantage',
          visibilityState: 'hidden',
          preventedModifier: -2,
          attackerName: 'Cutthroat',
          defenderName: 'Calder',
        }),
      );
    });

    test('should store Blind-Fight off-guard suppression in chat flags from native feat handling', async () => {
      const { getCoverBetween, getVisibilityBetween } = await import(
        '../../../../scripts/utils.js'
      );
      getCoverBetween.mockReturnValue('none');
      getVisibilityBetween.mockImplementation((observer, target) =>
        observer === targetToken && target === speakerToken ? 'hidden' : 'observed',
      );

      speakerToken.name = 'Cutthroat';
      speakerToken.actor = { system: { details: { level: { value: 8 } } } };
      targetToken.name = 'Calder';
      targetToken.actor = {
        system: { details: { level: { value: 8 } } },
        itemTypes: { feat: [{ slug: 'blind-fight' }] },
      };

      await attackRollUseCase.handlePreCreateChatMessage(mockData);

      expect(mockData.flags['pf2e-visioner'].offGuardSuppression).toEqual(
        expect.objectContaining({
          source: 'blind-fight',
          feat: 'blind-fight',
          label: 'Blind-Fight',
          visibilityState: 'hidden',
          preventedModifier: -2,
          attackerName: 'Cutthroat',
          defenderName: 'Calder',
        }),
      );
    });

    test('should not store Constant Gaze off-guard suppression in chat flags', async () => {
      const { getCoverBetween, getVisibilityBetween } = await import(
        '../../../../scripts/utils.js'
      );
      getCoverBetween.mockReturnValue('none');
      getVisibilityBetween.mockImplementation((observer, target) =>
        observer === targetToken && target === speakerToken ? 'undetected' : 'observed',
      );

      speakerToken.name = 'Scout';
      speakerToken.actor = { system: { details: { level: { value: 8 } } } };
      targetToken.name = 'Watcher';
      targetToken.actor = {
        system: { details: { level: { value: 8 } } },
        itemTypes: { feat: [{ slug: 'constant-gaze' }] },
      };

      await attackRollUseCase.handlePreCreateChatMessage(mockData);

      expect(mockData.flags?.['pf2e-visioner']?.offGuardSuppression).toBeUndefined();
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
        null, // snipingDuoCoverIgnore
        expect.any(Function), // onChosen callback
      );
    });

    test('should refresh defender-to-attacker visibility before check dialog roll binding', async () => {
      const { getVisibilityBetween, setVisibilityBetween } = await import(
        '../../../../scripts/utils.js'
      );
      getVisibilityBetween.mockImplementation((observer, target) =>
        observer === targetToken && target === attackerToken ? 'hidden' : 'observed',
      );

      await attackRollUseCase.handleCheckDialog(mockDialog, mockHtml);

      expect(getVisibilityBetween).toHaveBeenCalledWith(targetToken, attackerToken);
      expect(setVisibilityBetween).toHaveBeenCalledWith(targetToken, attackerToken, 'hidden', {
        skipEphemeralUpdate: false,
        direction: 'observer_to_target',
      });
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
        null, // snipingDuoCoverIgnore
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
        (dialog, html, state, target, manualCover, snipingDuoCoverIgnore, callback) => {
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
        (dialog, html, state, target, manualCover, snipingDuoCoverIgnore, callback) => {
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
        (dialog, html, state, target, manualCover, snipingDuoCoverIgnore, callback) => {
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

    test('should sync cloned defender actor into roll context target on chosen cover', async () => {
      const { getCoverBetween } = await import('../../../../scripts/utils.js');
      getCoverBetween.mockReturnValue('none');

      const originalActor = {
        _source: { items: [{ type: 'effect', name: 'Old Effect' }] },
        clone: jest.fn(),
      };
      const clonedDc = { value: 24, slug: 'ac', label: 'AC' };
      const clonedActor = {
        getStatistic: jest.fn().mockReturnValue({ dc: clonedDc }),
      };
      originalActor.clone.mockReturnValue(clonedActor);
      originalActor.armorClass = {
        clone: jest.fn().mockReturnValue({
          dc: clonedDc,
        }),
      };
      targetToken.actor = originalActor;

      attackRollUseCase._detectCover = jest.fn().mockReturnValue('standard');

      let callbackFunction;
      mockCoverUIManager.injectDialogCoverUI.mockImplementation(
        (dialog, html, state, target, manualCover, snipingDuoCoverIgnore, callback) => {
          callbackFunction = callback;
        },
      );

      await attackRollUseCase.handleCheckDialog(mockDialog, mockHtml);

      const dctx = {
        dc: { slug: 'ac', value: 22, statistic: { value: 22 } },
        target: {
          actor: originalActor,
          token: { actor: originalActor },
        },
      };

      callbackFunction({
        chosen: 'standard',
        dctx,
        target: targetToken,
        targetActor: originalActor,
      });

      expect(targetToken.actor).toBe(clonedActor);
      expect(dctx.target.actor).toBe(clonedActor);
      expect(dctx.target.token.actor).toBe(clonedActor);
      expect(dctx.dc.value).toBe(24);
      expect(dctx.dc.statistic).toBe(clonedDc);
    });

    test('should derive adjusted AC from defense statistic clone when actor clone stays stale', async () => {
      const { getCoverBetween } = await import('../../../../scripts/utils.js');
      getCoverBetween.mockReturnValue('none');

      const defenseClone = jest.fn().mockReturnValue({
        dc: {
          value: 24,
          modifiers: [{ slug: 'cover', modifier: 2, type: 'circumstance' }],
        },
      });
      const originalActor = {
        _source: { items: [] },
        armorClass: { clone: defenseClone },
        clone: jest.fn().mockReturnValue({
          getStatistic: jest.fn().mockReturnValue({ dc: { value: 22 } }),
        }),
      };
      targetToken.actor = originalActor;

      let callbackFunction;
      mockCoverUIManager.injectDialogCoverUI.mockImplementation(
        (dialog, html, state, target, manualCover, snipingDuoCoverIgnore, callback) => {
          callbackFunction = callback;
        },
      );

      await attackRollUseCase.handleCheckDialog(mockDialog, mockHtml);

      const dctx = {
        dc: { slug: 'ac', value: 22, statistic: { value: 22, modifiers: [] } },
        target: {
          actor: originalActor,
          token: { actor: originalActor },
        },
      };

      callbackFunction({
        chosen: 'standard',
        dctx,
        target: targetToken,
        targetActor: originalActor,
      });

      expect(defenseClone).toHaveBeenCalled();
      expect(dctx.dc.value).toBe(24);
      expect(dctx.dc.statistic.modifiers).toEqual(
        expect.arrayContaining([expect.objectContaining({ slug: 'cover' })]),
      );
    });

    test('should not clone stale visibility off-guard effect when defender suppresses hidden off-guard', async () => {
      const { getCoverBetween, getVisibilityBetween } = await import(
        '../../../../scripts/utils.js'
      );
      getCoverBetween.mockReturnValue('none');
      getVisibilityBetween.mockImplementation((observer, target) =>
        observer === targetToken && target === attackerToken ? 'hidden' : 'observed',
      );

      const staleOffGuardEffect = {
        id: 'hidden-offguard',
        type: 'effect',
        name: 'Hidden',
        flags: {
          'pf2e-visioner': {
            aggregateOffGuard: true,
            visibilityState: 'hidden',
          },
        },
      };
      const originalActor = {
        _source: { items: [staleOffGuardEffect] },
        itemTypes: {
          feat: [{ slug: 'blind-fight' }],
        },
        clone: jest.fn().mockReturnValue({
          getStatistic: jest.fn().mockReturnValue({ dc: { value: 22 } }),
        }),
      };
      targetToken.actor = originalActor;

      let callbackFunction;
      mockCoverUIManager.injectDialogCoverUI.mockImplementation(
        (dialog, html, state, target, manualCover, snipingDuoCoverIgnore, callback) => {
          callbackFunction = callback;
        },
      );

      await attackRollUseCase.handleCheckDialog(mockDialog, mockHtml);

      callbackFunction({
        chosen: 'none',
        dctx: { dc: { slug: 'ac', value: 20 }, target: { actor: originalActor } },
        target: targetToken,
        targetActor: originalActor,
      });

      const clonedItems = originalActor.clone.mock.calls[0][0].items;
      expect(clonedItems).not.toContainEqual(
        expect.objectContaining({
          flags: expect.objectContaining({
            'pf2e-visioner': expect.objectContaining({ aggregateOffGuard: true }),
          }),
        }),
      );
    });

    test('should remove suppressed hidden off-guard modifiers already built in the check dialog', async () => {
      const { getCoverBetween, getVisibilityBetween } = await import(
        '../../../../scripts/utils.js'
      );
      getCoverBetween.mockReturnValue('none');
      getVisibilityBetween.mockImplementation((observer, target) =>
        observer === targetToken && target === attackerToken ? 'hidden' : 'observed',
      );

      targetToken.actor = {
        itemTypes: {
          feat: [{ slug: 'blind-fight' }],
        },
      };
      const hiddenOffGuard = {
        slug: 'pf2e-visioner-off-guard',
        label: 'Off-Guard (Hidden)',
        modifier: -2,
      };
      mockDialog.check.modifiers = [hiddenOffGuard, { slug: 'cover', modifier: 2 }];
      mockDialog.context.dc = {
        value: 18,
        statistic: {
          modifiers: [hiddenOffGuard, { slug: 'armor-potency', modifier: 1 }],
        },
      };

      await attackRollUseCase.handleCheckDialog(mockDialog, mockHtml);

      expect(mockDialog.check.modifiers).toEqual([{ slug: 'cover', modifier: 2 }]);
      expect(mockDialog.context.dc.statistic.modifiers).toEqual([
        { slug: 'armor-potency', modifier: 1 },
      ]);
      expect(mockDialog.context.dc.value).toBe(20);
    });

    test('should keep off-guard when Blind-Fight only downgrades adjacent undetected to hidden', async () => {
      const { getCoverBetween, getPerceptionProfileBetween, getVisibilityBetween } = await import(
        '../../../../scripts/utils.js'
      );
      getCoverBetween.mockReturnValue('none');
      getVisibilityBetween.mockImplementation((observer, target) =>
        observer === targetToken && target === attackerToken ? 'hidden' : 'observed',
      );
      getPerceptionProfileBetween.mockImplementation((observer, target) =>
        observer === targetToken && target === attackerToken
          ? {
              detectionState: 'hidden',
              hasConcealment: false,
              visibilityReplacementSource: 'blind-fight-adjacent',
              visibilityReplacementOriginalState: 'undetected',
            }
          : {},
      );

      targetToken.actor = {
        itemTypes: {
          feat: [{ slug: 'blind-fight' }],
        },
      };
      mockDialog.context.dc = {
        slug: 'ac',
        value: 20,
        statistic: { modifiers: [] },
      };

      await attackRollUseCase.handleCheckDialog(mockDialog, mockHtml);

      expect(mockDialog.context.dc.value).toBe(18);
      expect(mockDialog.context.dc.statistic.modifiers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            slug: 'pf2e-visioner-off-guard',
            modifier: -2,
          }),
        ]),
      );
    });

    test('should use resolved dialog target when callback target loses hidden visibility', async () => {
      const { getCoverBetween, getVisibilityBetween } = await import(
        '../../../../scripts/utils.js'
      );
      getCoverBetween.mockReturnValue('none');
      getVisibilityBetween.mockImplementation((observer, target) =>
        observer === targetToken && target === attackerToken ? 'hidden' : 'observed',
      );

      const originalActor = {
        _source: { items: [] },
        itemTypes: {
          feat: [{ slug: 'blind-fight' }],
        },
        clone: jest.fn().mockReturnValue({
          getStatistic: jest.fn().mockReturnValue(null),
        }),
      };
      targetToken.actor = originalActor;

      let callbackFunction;
      mockCoverUIManager.injectDialogCoverUI.mockImplementation(
        (dialog, html, state, target, manualCover, snipingDuoCoverIgnore, callback) => {
          callbackFunction = callback;
        },
      );

      await attackRollUseCase.handleCheckDialog(mockDialog, mockHtml);

      const hiddenOffGuard = {
        slug: 'pf2e-visioner-off-guard',
        label: 'Off-Guard (Hidden)',
        modifier: -2,
      };
      const dctx = {
        dc: {
          slug: 'ac',
          value: 18,
          statistic: {
            modifiers: [hiddenOffGuard],
          },
        },
        target: { actor: originalActor },
      };
      const callbackTarget = global.createMockToken({ id: 'callback-target' });
      callbackTarget.actor = originalActor;

      callbackFunction({
        chosen: 'none',
        dctx,
        target: callbackTarget,
        targetActor: originalActor,
      });

      expect(dctx.dc.statistic.modifiers).toEqual([]);
      expect(dctx.dc.value).toBe(20);
    });

    test('should add hidden off-guard in dialog callback when defender has no suppression', async () => {
      const { getCoverBetween, getVisibilityBetween } = await import(
        '../../../../scripts/utils.js'
      );
      getCoverBetween.mockReturnValue('none');
      getVisibilityBetween.mockImplementation((observer, target) =>
        observer === targetToken && target === attackerToken ? 'hidden' : 'observed',
      );

      const originalActor = {
        _source: { items: [] },
        itemTypes: { feat: [] },
        clone: jest.fn().mockReturnValue({
          getStatistic: jest.fn().mockReturnValue({
            dc: { slug: 'ac', value: 20, statistic: { modifiers: [] } },
          }),
        }),
      };
      targetToken.actor = originalActor;

      let callbackFunction;
      mockCoverUIManager.injectDialogCoverUI.mockImplementation(
        (dialog, html, state, target, manualCover, snipingDuoCoverIgnore, callback) => {
          callbackFunction = callback;
        },
      );

      await attackRollUseCase.handleCheckDialog(mockDialog, mockHtml);

      const dctx = {
        dc: { slug: 'ac', value: 20, statistic: { modifiers: [] } },
        target: { actor: originalActor },
      };

      callbackFunction({
        chosen: 'none',
        dctx,
        target: targetToken,
        targetActor: originalActor,
      });

      expect(dctx.dc.value).toBe(18);
      expect(dctx.dc.statistic.modifiers).toContainEqual(
        expect.objectContaining({
          slug: 'pf2e-visioner-off-guard',
          modifier: -2,
        }),
      );
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
        getPerceptionProfileBetween: jest.fn().mockReturnValue({}),
        getVisibilityBetween: jest.fn().mockReturnValue('observed'),
        setVisibilityBetween: jest.fn(),
      }));

      global.game.user.flags = {};
    });

    test('should handle check roll and return success', async () => {
      const result = await attackRollUseCase.handleCheckRoll(mockCheck, mockContext);
      expect(result).toEqual({ success: true });
    });

    test('should refresh defender-to-attacker visibility before attack roll', async () => {
      const { getVisibilityBetween, setVisibilityBetween } = await import(
        '../../../../scripts/utils.js'
      );
      getVisibilityBetween.mockImplementation((observer, target) =>
        observer === targetToken && target === attackerToken ? 'hidden' : 'observed',
      );

      await attackRollUseCase.handleCheckRoll(mockCheck, mockContext);

      expect(getVisibilityBetween).toHaveBeenCalledWith(targetToken, attackerToken);
      expect(setVisibilityBetween).toHaveBeenCalledWith(targetToken, attackerToken, 'hidden', {
        skipEphemeralUpdate: false,
        direction: 'observer_to_target',
      });
    });

    test('should carry Blind-Fight suppression from roll handling into chat flags', async () => {
      const { getCoverBetween, getVisibilityBetween } = await import(
        '../../../../scripts/utils.js'
      );
      getCoverBetween.mockReturnValue('none');
      getVisibilityBetween.mockImplementation((observer, target) =>
        observer === targetToken && target === attackerToken ? 'hidden' : 'observed',
      );

      attackerToken.name = 'Cutthroat';
      attackerToken.actor = { system: { details: { level: { value: 8 } } } };
      targetToken.name = 'Calder';
      targetToken.actor = {
        system: { details: { level: { value: 8 } } },
        itemTypes: { feat: [{ slug: 'blind-fight' }] },
      };

      await attackRollUseCase.handleCheckRoll(mockCheck, mockContext);

      targetToken.actor = {
        system: { details: { level: { value: 8 } } },
        itemTypes: { feat: [] },
      };
      attackRollUseCase.normalizeTokenRef = jest.fn((ref) => ref);
      attackRollUseCase._resolveTargetTokenIdFromData = jest.fn(() => 'target');
      attackRollUseCase.autoCoverSystem.getOverrideManager = jest.fn(() => ({
        consumeOverride: jest.fn(() => null),
      }));
      global.canvas = {
        tokens: {
          get: jest.fn((id) => {
            if (id === 'attacker') return attackerToken;
            if (id === 'target') return targetToken;
            return null;
          }),
        },
      };
      const mockData = {
        speaker: { token: 'attacker' },
        flags: { pf2e: { context: { target: { token: 'target' } } } },
      };

      await attackRollUseCase.handlePreCreateChatMessage(mockData);

      expect(mockData.flags['pf2e-visioner'].offGuardSuppression).toEqual(
        expect.objectContaining({
          source: 'blind-fight',
          feat: 'blind-fight',
          label: 'Blind-Fight',
          visibilityState: 'hidden',
          preventedModifier: -2,
          attackerName: 'Cutthroat',
          defenderName: 'Calder',
        }),
      );
    });

    test('should clone attacker without stale aggregate off-guard when defender suppresses hidden off-guard', async () => {
      const { getCoverBetween, getVisibilityBetween } = await import(
        '../../../../scripts/utils.js'
      );
      getCoverBetween.mockReturnValue('none');
      getVisibilityBetween.mockImplementation((observer, target) =>
        observer === targetToken && target === attackerToken ? 'hidden' : 'observed',
      );

      const clonedActor = { id: 'attacker-actor-clone' };
      const originalAttackerActor = {
        id: 'attacker-actor',
        signature: 'attacker-signature',
        _source: {
          items: [
            {
              id: 'hidden-offguard',
              type: 'effect',
              flags: { 'pf2e-visioner': { aggregateOffGuard: true, visibilityState: 'hidden' } },
              system: {
                rules: [
                  {
                    key: 'EphemeralEffect',
                    predicate: ['target:signature:target-signature'],
                  },
                  {
                    key: 'EphemeralEffect',
                    predicate: ['target:signature:other-target-signature'],
                  },
                ],
              },
            },
            { id: 'real-effect', type: 'effect', name: 'Keep Me' },
          ],
        },
        clone: jest.fn().mockReturnValue(clonedActor),
      };
      const targetActor = {
        id: 'target-actor',
        signature: 'target-signature',
        itemTypes: {
          feat: [{ slug: 'blind-fight' }],
        },
      };
      attackerToken.actor = originalAttackerActor;
      targetToken.actor = targetActor;
      mockContext.actor = originalAttackerActor;
      mockContext.token = attackerToken;
      mockContext.target = { actor: targetActor, token: targetToken };

      await attackRollUseCase.handleCheckRoll(mockCheck, mockContext);

      expect(originalAttackerActor.clone).toHaveBeenCalledWith(
        {
          items: [{ id: 'real-effect', type: 'effect', name: 'Keep Me' }],
        },
        { keepId: true },
      );
      expect(mockContext.actor).toBe(clonedActor);
      expect(mockContext.token.actor).toBe(clonedActor);
    });

    test('should apply hidden off-guard without cover when defender has no suppression', async () => {
      const { getCoverBetween, getVisibilityBetween } = await import(
        '../../../../scripts/utils.js'
      );
      getCoverBetween.mockReturnValue('none');
      getVisibilityBetween.mockImplementation((observer, target) =>
        observer === targetToken && target === attackerToken ? 'hidden' : 'observed',
      );

      const targetActor = {
        _source: { items: [] },
        itemTypes: { feat: [] },
        armorClass: {
          clone: jest.fn().mockReturnValue({
            dc: {
              value: 18,
              statistic: {
                modifiers: [{ slug: 'pf2e-visioner-off-guard', modifier: -2 }],
              },
            },
          }),
        },
        clone: jest.fn().mockReturnValue({
          getStatistic: jest.fn().mockReturnValue(null),
        }),
      };
      targetToken.actor = targetActor;
      attackRollUseCase._detectCover = jest.fn().mockReturnValue('none');
      mockContext.dc = { slug: 'ac', value: 20, statistic: { modifiers: [] } };
      mockContext.target = { actor: targetActor, token: targetToken };

      await attackRollUseCase.handleCheckRoll(mockCheck, mockContext);

      expect(mockContext.dc.value).toBe(18);
      expect(mockContext.dc.statistic.modifiers).toContainEqual(
        expect.objectContaining({
          slug: 'pf2e-visioner-off-guard',
          modifier: -2,
        }),
      );
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

    test('should use detected state when popup path returns undefined', async () => {
      const { getCoverBetween } = await import('../../../../scripts/utils.js');
      getCoverBetween.mockReturnValue('none');

      attackRollUseCase.coverUIManager.showPopupAndApply.mockResolvedValue(undefined);

      await attackRollUseCase.handleCheckRoll(mockCheck, mockContext);

      expect(attackRollUseCase._applyCoverEphemeralEffect).toHaveBeenCalledWith(
        targetToken,
        attackerToken,
        'standard',
        mockContext,
        'none',
      );
      expect(attackRollUseCase.autoCoverSystem.setPopupOverride).not.toHaveBeenCalled();
    });

    test('should defer attack cover application to check dialog when PF2E check dialogs are enabled', async () => {
      const { getCoverBetween } = await import('../../../../scripts/utils.js');
      getCoverBetween.mockReturnValue('none');

      global.game.user.flags = {
        pf2e: {
          settings: {
            showCheckDialogs: true,
          },
        },
      };

      attackRollUseCase.coverUIManager.showPopupAndApply.mockResolvedValue(undefined);

      const result = await attackRollUseCase.handleCheckRoll(mockCheck, mockContext);

      expect(result).toEqual({ success: true });
      expect(attackRollUseCase._applyCoverEphemeralEffect).not.toHaveBeenCalled();
      expect(attackRollUseCase.autoCoverSystem.setPopupOverride).not.toHaveBeenCalled();
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

  describe('_applyCoverEphemeralEffect', () => {
    test('should not throw when target token actor is getter-only', async () => {
      const originalActor = {
        _source: { items: [] },
        armorClass: {
          clone: jest.fn().mockReturnValue({
            dc: { value: 24, slug: 'armor', label: 'AC', modifiers: [] },
          }),
        },
        clone: jest.fn().mockReturnValue({
          getStatistic: jest.fn().mockReturnValue({ dc: { value: 24, slug: 'armor' } }),
        }),
      };

      const targetToken = global.createMockToken({ id: 'target', actor: originalActor });
      Object.defineProperty(targetToken, 'actor', {
        get: () => originalActor,
        configurable: true,
      });

      const attackerToken = global.createMockToken({ id: 'attacker' });
      const context = {
        dc: { slug: 'armor', value: 22, statistic: { value: 22, modifiers: [] } },
        options: [],
        target: {
          actor: originalActor,
          token: targetToken,
        },
      };

      await expect(
        attackRollUseCase._applyCoverEphemeralEffect(
          targetToken,
          attackerToken,
          'standard',
          context,
          'none',
        ),
      ).resolves.toBeUndefined();

      expect(context.dc.value).toBe(24);
      expect(context.target.actor).not.toBe(originalActor);
    });

    test('should sync cloned defender actor into roll context target', async () => {
      const originalActor = {
        _source: { items: [] },
        clone: jest.fn(),
      };
      const clonedDc = { value: 26, slug: 'ac', label: 'AC' };
      const clonedActor = {
        getStatistic: jest.fn().mockReturnValue({ dc: clonedDc }),
      };
      originalActor.clone.mockReturnValue(clonedActor);
      originalActor.armorClass = {
        clone: jest.fn().mockReturnValue({
          dc: { value: 24, slug: 'ac', label: 'AC' },
        }),
      };

      const targetToken = global.createMockToken({ id: 'target', actor: originalActor });
      const attackerToken = global.createMockToken({ id: 'attacker' });
      const context = {
        dc: { slug: 'ac', value: 22, statistic: { value: 22 } },
        options: [],
        target: {
          actor: originalActor,
          token: { actor: originalActor },
        },
      };

      await attackRollUseCase._applyCoverEphemeralEffect(
        targetToken,
        attackerToken,
        'standard',
        context,
        'none',
      );

      expect(targetToken.actor).toBe(clonedActor);
      expect(context.target.actor).toBe(clonedActor);
      expect(context.target.token.actor).toBe(clonedActor);
      expect(context.dc.value).toBe(24);
      expect(context.dc.statistic).toEqual(expect.objectContaining({ value: 24 }));
    });

    test('should use defense statistic clone when actor clone keeps stale AC', async () => {
      const defenseClone = jest.fn().mockReturnValue({
        dc: {
          value: 24,
          modifiers: [{ slug: 'cover', modifier: 2, type: 'circumstance' }],
        },
      });
      const originalActor = {
        _source: { items: [] },
        armorClass: { clone: defenseClone },
        clone: jest.fn().mockReturnValue({
          getStatistic: jest.fn().mockReturnValue({ dc: { value: 22 } }),
        }),
      };

      const targetToken = global.createMockToken({ id: 'target', actor: originalActor });
      const attackerToken = global.createMockToken({ id: 'attacker' });
      const context = {
        dc: { slug: 'ac', value: 22, statistic: { value: 22, modifiers: [] } },
        options: [],
        target: {
          actor: originalActor,
          token: { actor: originalActor },
        },
      };

      await attackRollUseCase._applyCoverEphemeralEffect(
        targetToken,
        attackerToken,
        'standard',
        context,
        'none',
      );

      expect(defenseClone).toHaveBeenCalled();
      expect(context.dc.value).toBe(24);
      expect(context.dc.statistic.modifiers).toEqual(
        expect.arrayContaining([expect.objectContaining({ slug: 'cover' })]),
      );
    });

    test('should mark one-roll AC cover modifiers with the system cover slug', async () => {
      const clonedActor = { getStatistic: jest.fn().mockReturnValue({ dc: { value: 24 } }) };
      const originalActor = {
        _source: { items: [] },
        armorClass: { clone: jest.fn().mockReturnValue({ dc: { value: 24 } }) },
        clone: jest.fn().mockReturnValue(clonedActor),
      };
      const targetToken = global.createMockToken({ id: 'target', actor: originalActor });
      const attackerToken = global.createMockToken({ id: 'attacker' });
      const context = {
        dc: { slug: 'ac', value: 22, statistic: { value: 22, modifiers: [] } },
        options: [],
        target: {
          actor: originalActor,
          token: { actor: originalActor },
        },
      };

      await attackRollUseCase._applyCoverEphemeralEffect(
        targetToken,
        attackerToken,
        'standard',
        context,
        'none',
      );

      const clonedItems = originalActor.clone.mock.calls[0][0].items;
      const coverEffect = clonedItems.find(
        (item) => item.flags?.['pf2e-visioner']?.ephemeralCoverRoll,
      );
      expect(coverEffect.system.rules).toContainEqual(
        expect.objectContaining({
          key: 'FlatModifier',
          selector: 'ac',
          slug: 'cover',
          type: 'circumstance',
          value: 2,
        }),
      );
    });
  });
});
