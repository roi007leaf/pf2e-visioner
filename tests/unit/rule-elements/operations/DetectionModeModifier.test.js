import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { DetectionModeModifier } from '../../../../scripts/rule-elements/operations/DetectionModeModifier.js';

describe('DetectionModeModifier', () => {
  let mockToken, mockDetectionsModes;

  beforeEach(() => {
    mockDetectionsModes = [
      { id: 'visual', enabled: true, range: 100 },
      { id: 'imprecise-hearing', enabled: true, range: 30 },
    ];
    mockToken = {
      id: 'test-token',
      document: {
        id: 'test-token',
        detectionModes: mockDetectionsModes,
        getFlag: jest.fn(() => ({})),
        setFlag: jest.fn(() => Promise.resolve()),
        update: jest.fn(() => Promise.resolve()),
      },
    };
  });

  describe('applyDetectionModeModifications', () => {
    it('should save original detection modes before modifying', async () => {
      await DetectionModeModifier.applyDetectionModeModifications(
        mockToken,
        { visual: { enabled: false } },
        'test-rule-element',
        null,
      );

      expect(mockToken.document.update).toHaveBeenCalledWith(
        expect.objectContaining({
          'flags.pf2e-visioner.originalPerception.test-rule-element': expect.anything()
        })
      );
    });

    it('should modify existing detection modes', async () => {
      await DetectionModeModifier.applyDetectionModeModifications(
        mockToken,
        { visual: { range: 50 } },
        'test-rule-element',
        null,
      );

      // First update is flags, second is detection modes
      const updateCall = mockToken.document.update.mock.calls[1][0];
      const visualMode = updateCall.detectionModes.find(m => m.id === 'visual');
      
      expect(visualMode).toBeDefined();
      expect(visualMode.range).toBe(50);
    });
  });

  describe('restoreDetectionModes', () => {
    it('should restore original detection modes', async () => {
      const ruleElementId = 'test-rule-element';
      // Setup mock to return original modes
      const originalModes = [
        { id: 'visual', enabled: true, range: 100 },
        { id: 'imprecise-hearing', enabled: true, range: 30 },
      ];
      mockToken.document.getFlag.mockReturnValue({
        [ruleElementId]: { detectionModes: originalModes }
      });

      await DetectionModeModifier.restoreDetectionModes(mockToken, ruleElementId);

      expect(mockToken.document.update).toHaveBeenCalledWith({
        detectionModes: originalModes
      });
    });

    it('should do nothing if no original modes saved', async () => {
      const ruleElementId = 'test-rule-element';
      mockToken.document.getFlag.mockReturnValue({});

      await DetectionModeModifier.restoreDetectionModes(mockToken, ruleElementId);

      expect(mockToken.document.update).not.toHaveBeenCalled();
    });
  });
});
