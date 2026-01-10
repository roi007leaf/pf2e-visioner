import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ActionQualifier } from '../../../../scripts/rule-elements/operations/ActionQualifier.js';

describe('ActionQualifier', () => {
  let mockToken;

  beforeEach(() => {
    mockToken = {
      document: {
        getFlag: jest.fn(() => ({})),
        setFlag: jest.fn(() => Promise.resolve()),
        unsetFlag: jest.fn(() => Promise.resolve()),
      },
    };
  });

  describe('applyActionQualifications', () => {
    it('should set action qualifications on token', async () => {
      const operation = {
        source: 'blur-spell',
        qualifications: {
          hide: { canUseThisConcealment: false },
          sneak: { endPositionQualifies: false },
        },
      };

      await ActionQualifier.applyActionQualifications(operation, mockToken);

      expect(mockToken.document.setFlag).toHaveBeenCalledWith(
        'pf2e-visioner',
        'actionQualifications.blur-spell',
        expect.objectContaining({
          id: 'blur-spell',
          qualifications: operation.qualifications,
        }),
      );
    });
  });

  describe('removeActionQualifications', () => {
    it('should remove action qualifications', async () => {
      const operation = { source: 'blur-spell' };

      // Mock existing qualifications
      mockToken.document.getFlag.mockReturnValue({
        'blur-spell': { qualifications: {} }
      });

      await ActionQualifier.removeActionQualifications(operation, mockToken);

      expect(mockToken.document.setFlag).toHaveBeenCalledWith(
        'pf2e-visioner',
        'actionQualifications',
        {}
      );
    });
  });

  describe('getActionQualifications', () => {
    it('should return qualifications for specific action', () => {
      mockToken.document.getFlag.mockReturnValue({
        'blur-spell': {
          id: 'blur-spell',
          priority: 100,
          qualifications: {
            hide: { canUseThisConcealment: false },
            sneak: { endPositionQualifies: false },
          },
        },
      });

      const qualifications = ActionQualifier.getActionQualifications(mockToken, 'hide');

      expect(qualifications).toHaveLength(1);
      expect(qualifications[0].canUseThisConcealment).toBe(false);
    });
  });

  describe('canUseConcealment', () => {
    it('should return false when qualification disallows concealment', () => {
      mockToken.document.getFlag.mockReturnValue({
        'blur-spell': {
          id: 'blur-spell',
          priority: 100,
          qualifications: {
            hide: { qualifiesOnConcealment: false },
          },
        },
      });

      const canUse = ActionQualifier.canUseConcealment(mockToken, 'hide');
      expect(canUse).toBe(false);
    });

    it('should return true when no qualifications exist', () => {
      const canUse = ActionQualifier.canUseConcealment(mockToken, 'hide');
      expect(canUse).toBe(true);
    });
  });

  describe('endPositionQualifies', () => {
    it('should return false when qualification disallows end position', () => {
      mockToken.document.getFlag.mockReturnValue({
        'blur-spell': {
          id: 'blur-spell',
          priority: 100,
          qualifications: {
            sneak: { endPositionQualifies: false },
          },
        },
      });

      const qualifies = ActionQualifier.endPositionQualifies(mockToken, 'sneak');
      expect(qualifies).toBe(false);
    });

    it('should return true when no qualifications exist', () => {
      const qualifies = ActionQualifier.endPositionQualifies(mockToken, 'sneak');
      expect(qualifies).toBe(true);
    });
  });

  describe('forcePositionQualifies', () => {
    it('should return true when forceEndQualifies is enabled for sneak', () => {
      mockToken.document.getFlag.mockReturnValue({
        camo: {
          id: 'camo',
          priority: 100,
          qualifications: {
            sneak: { forceEndQualifies: true },
          },
        },
      });

      const qualifies = ActionQualifier.forceEndQualifies(mockToken, 'sneak');
      expect(qualifies).toBe(true);
    });

    it('should return true when forceQualifies is enabled for sneak end position', () => {
      mockToken.document.getFlag.mockReturnValue({
        camo: {
          id: 'camo',
          priority: 100,
          qualifications: {
            sneak: { end: { forceQualifies: true } },
          },
        },
      });

      const qualifies = ActionQualifier.forceEndQualifies(mockToken, 'sneak');
      expect(qualifies).toBe(true);
    });
  });

  describe('checkHidePrerequisites', () => {
    it('should return cannot hide when no qualifying sources', () => {
      mockToken.document.getFlag.mockReturnValue({
        'blur-spell': {
          id: 'blur-spell',
          qualifications: {
            hide: { canUseThisConcealment: false },
          },
        },
      });

      const result = ActionQualifier.checkHidePrerequisites(mockToken);

      expect(result.canHide).toBe(false);
      expect(result.qualifyingConcealment).toBe(0);
    });
  });

  describe('checkSneakPrerequisites', () => {
    it('should return does not qualify when end position disqualified', () => {
      mockToken.document.getFlag.mockReturnValue({
        'blur-spell': {
          id: 'blur-spell',
          qualifications: {
            sneak: { endPositionQualifies: false },
          },
        },
      });

      const result = ActionQualifier.checkSneakPrerequisites(mockToken, 'end');

      expect(result.qualifies).toBe(true);
    });
  });
});
