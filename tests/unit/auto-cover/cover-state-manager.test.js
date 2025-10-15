/**
 * Unit tests for CoverStateManager
 * Tests cover state flag management between tokens
 */

import '../../setup.js';

// Mock rule element service to return input unchanged
jest.mock('../../../scripts/services/RuleElementService.js', () => ({
  ruleElementService: {
    applyCoverModifiers: jest.fn((observer, target, baseCover) => baseCover),
    applyVisibilityModifiers: jest.fn((observer, target, baseState) => baseState),
  },
}));

describe('CoverStateManager', () => {
  let coverStateManager;
  let sourceToken, targetToken;

  beforeEach(async () => {
    jest.resetModules();

    // Import the manager
    const coverStateManagerInstance = (
      await import('../../../scripts/cover/auto-cover/CoverStateManager.js')
    ).default;
    coverStateManager = coverStateManagerInstance;

    // Setup mock tokens
    sourceToken = global.createMockToken({
      id: 'source-123',
      name: 'Source Token',
      actor: { signature: 'source-signature' },
      document: {
        id: 'source-doc-123',
        getFlag: jest.fn().mockReturnValue(null),
        setFlag: jest.fn().mockResolvedValue(true),
        unsetFlag: jest.fn().mockResolvedValue(true),
      },
    });

    targetToken = global.createMockToken({
      id: 'target-456',
      name: 'Target Token',
      actor: { signature: 'target-signature' },
      document: {
        id: 'target-doc-456',
        getFlag: jest.fn().mockReturnValue(null),
        setFlag: jest.fn().mockResolvedValue(true),
        unsetFlag: jest.fn().mockResolvedValue(true),
      },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    test('should initialize correctly', () => {
      expect(coverStateManager).toBeDefined();
      expect(typeof coverStateManager.getCoverBetween).toBe('function');
      expect(typeof coverStateManager.setCoverBetween).toBe('function');
      expect(typeof coverStateManager.clearCover).toBe('function');
    });
  });

  describe('getCoverBetween', () => {
    test('should return none for invalid tokens', () => {
      const result = coverStateManager.getCoverBetween(null, targetToken);
      expect(result).toBe('none');

      const result2 = coverStateManager.getCoverBetween(sourceToken, null);
      expect(result2).toBe('none');
    });

    test('should return none when no cover state exists', () => {
      sourceToken.document.getFlag.mockReturnValue(null);

      const result = coverStateManager.getCoverBetween(sourceToken, targetToken);
      expect(result).toBe('none');
    });

    test('should return stored cover state', () => {
      const coverMap = {
        [targetToken.document.id]: 'standard',
      };
      sourceToken.document.getFlag.mockReturnValue(coverMap);

      const result = coverStateManager.getCoverBetween(sourceToken, targetToken);
      expect(result).toBe('standard');
    });

    test('should return none for non-existent target in cover map', () => {
      const coverMap = {
        'other-target': 'standard',
      };
      sourceToken.document.getFlag.mockReturnValue(coverMap);

      const result = coverStateManager.getCoverBetween(sourceToken, targetToken);
      expect(result).toBe('none');
    });
  });

  describe('setCoverBetween', () => {
    test('should not set cover for invalid tokens', async () => {
      await coverStateManager.setCoverBetween(null, targetToken, 'standard');
      expect(sourceToken.document.setFlag).not.toHaveBeenCalled();

      await coverStateManager.setCoverBetween(sourceToken, null, 'standard');
      expect(sourceToken.document.setFlag).not.toHaveBeenCalled();
    });

    test('should set cover state between tokens', async () => {
      sourceToken.document.getFlag.mockReturnValue({});

      await coverStateManager.setCoverBetween(sourceToken, targetToken, 'standard');

      expect(sourceToken.document.setFlag).toHaveBeenCalledWith('pf2e-visioner', 'autoCoverMap', {
        [targetToken.document.id]: 'standard',
      });
    });

    test('should remove target entry when setting none', async () => {
      const existingMap = {
        [targetToken.document.id]: 'standard',
        'other-target': 'lesser',
      };
      sourceToken.document.getFlag.mockReturnValue(existingMap);

      await coverStateManager.setCoverBetween(sourceToken, targetToken, 'none');

      expect(sourceToken.document.setFlag).toHaveBeenCalledWith('pf2e-visioner', 'autoCoverMap', {
        'other-target': 'lesser',
      });
    });

    test('should unset flag when map becomes empty', async () => {
      const existingMap = {
        [targetToken.document.id]: 'standard',
      };
      sourceToken.document.getFlag.mockReturnValue(existingMap);

      await coverStateManager.setCoverBetween(sourceToken, targetToken, 'none');

      expect(sourceToken.document.unsetFlag).toHaveBeenCalledWith('pf2e-visioner', 'autoCoverMap');
    });

    test('should skip update if state unchanged', async () => {
      const existingMap = {
        [targetToken.document.id]: 'standard',
      };
      sourceToken.document.getFlag.mockReturnValue(existingMap);

      await coverStateManager.setCoverBetween(sourceToken, targetToken, 'standard');

      expect(sourceToken.document.setFlag).not.toHaveBeenCalled();
      expect(sourceToken.document.unsetFlag).not.toHaveBeenCalled();
    });

    test('should handle flag setting errors gracefully', async () => {
      sourceToken.document.setFlag.mockRejectedValue(new Error('Flag setting failed'));

      // Should throw since we don't catch errors
      await expect(
        coverStateManager.setCoverBetween(sourceToken, targetToken, 'standard'),
      ).rejects.toThrow('Flag setting failed');
    });
  });

  describe('clearCover', () => {
    test('should not clear cover for invalid token', async () => {
      await coverStateManager.clearCover(null);
      expect(sourceToken.document.unsetFlag).not.toHaveBeenCalled();
    });

    test('should clear all cover flags for token', async () => {
      await coverStateManager.clearCover(sourceToken);

      expect(sourceToken.document.unsetFlag).toHaveBeenCalledWith('pf2e-visioner', 'autoCoverMap');
    });

    test('should handle flag clearing errors gracefully', async () => {
      sourceToken.document.unsetFlag.mockRejectedValue(new Error('Flag clearing failed'));

      // Should throw since we don't catch errors
      await expect(coverStateManager.clearCover(sourceToken)).rejects.toThrow(
        'Flag clearing failed',
      );
    });
  });

  describe('error handling', () => {
    test('should handle missing document properties', () => {
      const tokenWithoutDocument = { id: 'no-doc' };

      expect(() => {
        coverStateManager.getCoverBetween(tokenWithoutDocument, targetToken);
      }).not.toThrow();

      const result = coverStateManager.getCoverBetween(tokenWithoutDocument, targetToken);
      expect(result).toBe('none');
    });

    test('should handle getFlag exceptions', () => {
      sourceToken.document.getFlag.mockImplementation(() => {
        throw new Error('Flag access failed');
      });

      expect(() => {
        coverStateManager.getCoverBetween(sourceToken, targetToken);
      }).not.toThrow();

      const result = coverStateManager.getCoverBetween(sourceToken, targetToken);
      expect(result).toBe('none');
    });

    test('should handle malformed cover map data', () => {
      sourceToken.document.getFlag.mockReturnValue('invalid-data');

      const result = coverStateManager.getCoverBetween(sourceToken, targetToken);
      expect(result).toBe('none');
    });
  });
});
