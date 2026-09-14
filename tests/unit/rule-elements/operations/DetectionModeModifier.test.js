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


describe('Foundry 14 prepared detection modes', () => {
  it('keeps dictionary mode IDs and applies limits after PF2e rebuilds modes', async () => {
    const token = { document: { detectionModes: { hearing: { enabled: true, range: Infinity } }, getFlag: jest.fn(() => ({})), update: jest.fn(async () => {}) } };
    await DetectionModeModifier.applyDetectionModeModifications(token, { hearing: { range: 10 } }, 'Item.qa');
    expect(token.document.update.mock.calls[1][0].detectionModes).toEqual({ hearing: { enabled: true, range: 10 } });
    const saved = token.document.update.mock.calls[0][0]['flags.pf2e-visioner.originalPerception.Item___qa'];
    const document = { detectionModes: {}, getFlag: () => ({ Item___qa: saved }) };
    const nativePrepare = jest.fn(() => { document.detectionModes = { hearing: { enabled: true, range: Infinity } }; });
    DetectionModeModifier.wrapPrepareDetectionModes.call(document, nativePrepare);
    expect(nativePrepare).toHaveBeenCalledTimes(1);
    expect(document.detectionModes.hearing.range).toBe(10);
    document.getFlag = () => ({});
    DetectionModeModifier.wrapPrepareDetectionModes.call(document, nativePrepare);
    expect(document.detectionModes.hearing.range).toBe(Infinity);
  });
  it('does not introduce hearing when native preparation removes it for deafness', () => {
    const document = { detectionModes: {}, getFlag: () => ({ rule: { detectionModeModifications: { hearing: { range: 10 } } } }) };
    DetectionModeModifier.wrapPrepareDetectionModes.call(document, () => {});
    expect(document.detectionModes).toEqual({});
  });
});
