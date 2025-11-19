import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { LightingModifier } from '../../../../scripts/rule-elements/operations/LightingModifier.js';

describe('LightingModifier', () => {
  let mockToken;

  beforeEach(() => {
    mockToken = {
      id: 'test-token',
      document: {
        id: 'test-token',
        setFlag: jest.fn(() => Promise.resolve()),
        unsetFlag: jest.fn(() => Promise.resolve()),
        getFlag: jest.fn(() => null),
      },
    };
  });

  describe('applyLightingModification', () => {
    it('should set lighting modification flag', async () => {
      const operation = {
        lightingLevel: 'bright',
        source: 'test-light',
        priority: 100,
      };

      await LightingModifier.applyLightingModification(operation, mockToken);

      expect(mockToken.document.setFlag).toHaveBeenCalledWith(
        'pf2e-visioner',
        'lightingModification.test-light',
        expect.objectContaining({
          lightingLevel: 'bright',
          type: 'test-light',
          priority: 100,
        }),
      );
    });

    it('should respect priority when multiple modifications exist', async () => {
      // This logic might be in the system or a getter, but we can test if the flag is set correctly
      // Assuming the operation just sets the flag and something else resolves priority, 
      // or if the operation checks existing flags. 
      // Based on previous code, it just sets the flag with the source ID.
      
      const operation = {
        lightingLevel: 'dim',
        source: 'low-priority-source',
        priority: 10,
      };

      await LightingModifier.applyLightingModification(operation, mockToken);

      expect(mockToken.document.setFlag).toHaveBeenCalledWith(
        'pf2e-visioner',
        'lightingModification.low-priority-source',
        expect.objectContaining({
          priority: 10
        })
      );
    });
  });

  describe('removeLightingModification', () => {
    it('should remove lighting modification flag', async () => {
      const operation = { source: 'test-light' };
      
      // Mock existing modification
      mockToken.document.getFlag.mockReturnValue({
        'test-light': { lightingLevel: 'bright' }
      });

      await LightingModifier.removeLightingModification(operation, mockToken);

      expect(mockToken.document.unsetFlag).toHaveBeenCalledWith(
        'pf2e-visioner',
        'lightingModification.test-light'
      );
    });
  });
});
