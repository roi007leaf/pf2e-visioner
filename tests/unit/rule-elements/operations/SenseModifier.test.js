import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SenseModifier } from '../../../../scripts/rule-elements/operations/SenseModifier.js';

describe('SenseModifier', () => {
  let mockToken;
  let mockActor;

  beforeEach(() => {
    mockActor = {
      system: {
        perception: {
          senses: [
            { type: 'vision', acuity: 'precise', range: Infinity },
            { type: 'hearing', acuity: 'imprecise', range: Infinity },
          ],
        },
      },
      update: jest.fn(() => Promise.resolve()),
    };

    mockToken = {
      actor: mockActor,
      document: {
        getFlag: jest.fn(() => ({})),
        setFlag: jest.fn(() => Promise.resolve()),
        update: jest.fn(() => Promise.resolve()),
      },
    };
  });

  describe('applySenseModifications', () => {
    it('should save original senses before modifying', async () => {
      await SenseModifier.applySenseModifications(
        mockToken,
        { vision: { enabled: false } },
        'test-rule-element',
        null,
      );

      expect(mockToken.document.update).toHaveBeenCalledWith(
        expect.objectContaining({
          'flags.pf2e-visioner.originalPerception.test-rule-element': expect.anything()
        })
      );
      expect(mockActor.update).toHaveBeenCalled();
    });

    it('should modify existing senses', async () => {
      await SenseModifier.applySenseModifications(
        mockToken,
        { vision: { range: 60 } },
        'test-rule-element',
        null,
      );

      const updateCall = mockActor.update.mock.calls[0][0];
      const visionSense = updateCall['system.perception.senses'].find(s => s.type === 'vision');
      
      expect(visionSense).toBeDefined();
      expect(visionSense.range).toBe(60);
    });
    
    it('should change acuity of existing senses', async () => {
      await SenseModifier.applySenseModifications(
        mockToken,
        { 'hearing': { precision: 'precise' } },
        'test-rule-element',
        null,
      );

      const updateCall = mockActor.update.mock.calls[0][0];
      const hearingSense = updateCall['system.perception.senses'].find(s => s.type === 'hearing');
      
      expect(hearingSense.acuity).toBe('precise');
    });
  });

  describe('restoreSenses', () => {
    it('should restore original senses', async () => {
      const ruleElementId = 'test-rule-element';
      const originalSenses = [
        { type: 'vision', acuity: 'precise', range: Infinity },
        { type: 'hearing', acuity: 'imprecise', range: Infinity },
      ];
      
      mockToken.document.getFlag.mockReturnValue({
        [ruleElementId]: { senses: originalSenses }
      });

      await SenseModifier.restoreSenses(mockToken, ruleElementId);

      expect(mockActor.update).toHaveBeenCalledWith({
        'system.perception.senses': originalSenses
      });
    });

    it('should do nothing if no original senses saved', async () => {
      const ruleElementId = 'test-rule-element';
      mockToken.document.getFlag.mockReturnValue({});

      await SenseModifier.restoreSenses(mockToken, ruleElementId);

      expect(mockActor.update).not.toHaveBeenCalled();
    });
  });
});
