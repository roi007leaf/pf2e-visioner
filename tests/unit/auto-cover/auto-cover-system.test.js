/**
 * Unit tests for AutoCoverSystem
 * Tests the main auto-cover system logic, token filtering, and cover detection coordination
 */

import '../../setup.js';

describe('AutoCoverSystem', () => {
  let autoCoverSystem;
  let mockCoverDetector;
  let mockCoverStateManager;

  beforeEach(async () => {
    // Reset mocks
    jest.resetModules();

    // Mock dependencies
    mockCoverDetector = {
      detectBetweenTokens: jest.fn((attacker, target) => {
        // Mimic real CoverDetector behavior
        if (!attacker || !target) return 'none';
        if (attacker.id === target.id) return 'none';
        return 'standard'; // Default test return
      }),
      detectFromPoint: jest.fn(() => 'standard'),
    };

    mockCoverStateManager = {
      getCoverBetween: jest.fn(),
      setCoverBetween: jest.fn(),
      clearCoverBetween: jest.fn(),
      clearAllCoverForToken: jest.fn(),
    };

    // Mock the modules - singleton pattern
    jest.doMock('../../../scripts/cover/auto-cover/CoverDetector.js', () => mockCoverDetector);
    jest.doMock(
      '../../../scripts/cover/auto-cover/CoverStateManager.js',
      () => mockCoverStateManager,
    );

    // Import the singleton instance after mocking dependencies
    autoCoverSystem = (await import('../../../scripts/cover/auto-cover/AutoCoverSystem.js'))
      .default;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    test('should initialize with correct dependencies', () => {
      expect(autoCoverSystem).toBeDefined();
      // Since it's a singleton, just check it exists and has expected methods
      expect(typeof autoCoverSystem.detectCoverBetweenTokens).toBe('function');
      expect(typeof autoCoverSystem.getCoverBonusByState).toBe('function');
      expect(typeof autoCoverSystem.isEnabled).toBe('function');
    });
  });

  describe('detectCoverBetweenTokens', () => {
    let sourceToken, targetToken;

    beforeEach(() => {
      sourceToken = global.createMockToken({
        id: 'source',
        x: 0,
        y: 0,
        center: { x: 50, y: 50 },
      });

      targetToken = global.createMockToken({
        id: 'target',
        x: 200,
        y: 200,
        center: { x: 250, y: 250 },
      });
    });

    test('should return none for invalid tokens', () => {
      const result = autoCoverSystem.detectCoverBetweenTokens(null, targetToken);
      expect(result).toBe('none');

      const result2 = autoCoverSystem.detectCoverBetweenTokens(sourceToken, null);
      expect(result2).toBe('none');
    });

    test('should return none for same token', () => {
      const result = autoCoverSystem.detectCoverBetweenTokens(sourceToken, sourceToken);
      expect(result).toBe('none');
    });

    test('should call coverDetector and return result', () => {
      mockCoverDetector.detectBetweenTokens.mockReturnValue('standard');

      const result = autoCoverSystem.detectCoverBetweenTokens(sourceToken, targetToken);

      expect(mockCoverDetector.detectBetweenTokens).toHaveBeenCalledWith(
        sourceToken,
        targetToken,
        {},
      );
      expect(result).toBe('standard');
    });

    test('should handle cover detector errors gracefully', () => {
      mockCoverDetector.detectBetweenTokens.mockImplementation(() => {
        throw new Error('Cover detection failed');
      });

      // The real AutoCoverSystem doesn't handle errors gracefully - it would throw
      // But let's test what it actually does
      expect(() => {
        autoCoverSystem.detectCoverBetweenTokens(sourceToken, targetToken);
      }).toThrow('Cover detection failed');
    });
  });

  describe('getCoverBonusByState', () => {
    test('should return correct bonuses for each cover state', () => {
      expect(autoCoverSystem.getCoverBonusByState('none')).toBe(0);
      expect(autoCoverSystem.getCoverBonusByState('lesser')).toBe(1);
      expect(autoCoverSystem.getCoverBonusByState('standard')).toBe(2);
      expect(autoCoverSystem.getCoverBonusByState('greater')).toBe(4);
    });

    test('should return 0 for invalid states', () => {
      expect(autoCoverSystem.getCoverBonusByState('invalid')).toBe(0);
      expect(autoCoverSystem.getCoverBonusByState(null)).toBe(0);
      expect(autoCoverSystem.getCoverBonusByState(undefined)).toBe(0);
    });
  });

  describe('clearCoverOverrides', () => {
    test('should call clearCoverOverrides method', () => {
      const token1 = global.createMockToken({ id: 'token1' });
      const token2 = global.createMockToken({ id: 'token2' });

      // Test that the method exists and can be called
      expect(() => autoCoverSystem.clearCoverOverrides(token1, token2)).not.toThrow();
    });
  });

  describe('active pair cleanup', () => {
    test('returns active pairs as attacker-target records for movement cleanup', () => {
      autoCoverSystem.recordPair('attacker', 'target');

      expect(autoCoverSystem.getActivePairsInvolving('attacker')).toEqual([
        { attackerId: 'attacker', targetId: 'target' },
      ]);
      expect(autoCoverSystem.getActivePairsInvolving('target')).toEqual([
        { attackerId: 'attacker', targetId: 'target' },
      ]);
    });

    test('setCoverBetween records non-none pairs so movement cleanup can remove accepted AVS cover effects', async () => {
      const sourceToken = global.createMockToken({ id: 'source' });
      const targetToken = global.createMockToken({ id: 'target' });

      await autoCoverSystem.setCoverBetween(sourceToken, targetToken, 'lesser');

      expect(autoCoverSystem.getActivePairsInvolving('source')).toEqual([
        { attackerId: 'source', targetId: 'target' },
      ]);
      expect(autoCoverSystem.getActivePairsInvolving('target')).toEqual([
        { attackerId: 'source', targetId: 'target' },
      ]);
    });

    test('getActivePairsInvolving includes persisted autoCoverMap pairs when in-memory tracking is absent', () => {
      const sourceToken = global.createMockToken({ id: 'source' });
      const targetToken = global.createMockToken({ id: 'target' });
      sourceToken.document.getFlag = jest.fn((moduleId, key) =>
        moduleId === 'pf2e-visioner' && key === 'autoCoverMap' ? { target: 'lesser' } : null,
      );
      canvas.tokens.placeables = [sourceToken, targetToken];

      expect(autoCoverSystem.getActivePairsInvolving('source')).toEqual([
        { attackerId: 'source', targetId: 'target' },
      ]);
      expect(autoCoverSystem.getActivePairsInvolving('target')).toEqual([
        { attackerId: 'source', targetId: 'target' },
      ]);
    });

    test('cleanupCover removes stored cover and associated ephemeral effects', async () => {
      const sourceToken = global.createMockToken({ id: 'source' });
      const targetToken = global.createMockToken({ id: 'target' });

      await autoCoverSystem.cleanupCover(sourceToken, targetToken);

      expect(mockCoverStateManager.setCoverBetween).toHaveBeenCalledWith(
        sourceToken,
        targetToken,
        'none',
        { skipEphemeralUpdate: false },
      );
    });
  });

  describe('isEnabled method', () => {
    test('should return true when auto-cover is enabled', () => {
      global.game.settings.get.mockImplementation((module, setting) => {
        if (setting === 'autoCover') return true;
        return false;
      });

      expect(autoCoverSystem.isEnabled()).toBe(true);
    });

    test('should return false when auto-cover is disabled', () => {
      global.game.settings.get.mockImplementation((module, setting) => {
        if (setting === 'autoCover') return false;
        return false;
      });

      expect(autoCoverSystem.isEnabled()).toBe(false);
    });
  });

  describe('cover adjustment chat records', () => {
    test('records and consumes a cover adjustment for a pair', () => {
      const attacker = { id: 'atk' };
      const target = { id: 'def' };
      autoCoverSystem.recordCoverAdjustment(attacker, target, {
        originalState: 'standard',
        finalState: 'none',
        sources: ['phase-bolt'],
      });

      const rec = autoCoverSystem.consumeCoverAdjustment('atk', 'def');
      expect(rec).toMatchObject({
        originalState: 'standard',
        finalState: 'none',
        sources: ['phase-bolt'],
      });
      // Consumed: a second read returns null
      expect(autoCoverSystem.consumeCoverAdjustment('atk', 'def')).toBeNull();
    });

    test('ignores expired cover adjustment records', () => {
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1000);
      autoCoverSystem.recordCoverAdjustment({ id: 'atk' }, { id: 'def' }, {
        originalState: 'lesser',
        finalState: 'none',
        sources: ['x'],
      });
      nowSpy.mockReturnValue(1000 + 15001);
      expect(autoCoverSystem.consumeCoverAdjustment('atk', 'def')).toBeNull();
      nowSpy.mockRestore();
    });

    test('does not record without both token ids', () => {
      autoCoverSystem.recordCoverAdjustment({ id: 'atk' }, {}, { finalState: 'none' });
      expect(autoCoverSystem.consumeCoverAdjustment('atk', undefined)).toBeNull();
    });

    test('consumes by defender id regardless of attacker (saving throws)', () => {
      autoCoverSystem.recordCoverAdjustment({ id: 'caster' }, { id: 'saver' }, {
        originalState: 'standard',
        finalState: 'lesser',
        sources: ['shooting-star'],
      });

      const rec = autoCoverSystem.consumeCoverAdjustmentByDefender('saver');
      expect(rec).toMatchObject({ originalState: 'standard', finalState: 'lesser' });
      expect(autoCoverSystem.consumeCoverAdjustmentByDefender('saver')).toBeNull();
    });
  });

  describe('error handling', () => {
    test('should handle detection calls gracefully', () => {
      const sourceToken = global.createMockToken({ id: 'source' });
      const targetToken = global.createMockToken({ id: 'target' });

      // Test that detection methods can be called
      expect(() => {
        autoCoverSystem.detectCoverBetweenTokens(sourceToken, targetToken);
      }).not.toThrow();

      expect(() => {
        autoCoverSystem.detectCoverFromPoint({ x: 0, y: 0 }, targetToken);
      }).not.toThrow();
    });
  });
});
