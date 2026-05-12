import { OffGuardSuppression } from '../../../scripts/rule-elements/operations/OffGuardSuppression.js';
import { PredicateHelper } from '../../../scripts/rule-elements/PredicateHelper.js';

jest.mock('../../../scripts/rule-elements/PredicateHelper.js');

describe('OffGuardSuppression', () => {
  let mockToken;

  beforeEach(() => {
    mockToken = {
      id: 'token-1',
      document: {
        id: 'token-doc-1',
        getFlag: jest.fn(),
        setFlag: jest.fn(() => Promise.resolve()),
        unsetFlag: jest.fn(() => Promise.resolve()),
      },
    };

    PredicateHelper.getTokenRollOptions = jest.fn(() => ['self:trait:human']);
    PredicateHelper.evaluate = jest.fn(() => true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('applyOffGuardSuppression', () => {
    it('should set off-guard suppression flag with suppressedStates', async () => {
      const operation = {
        suppressedStates: ['concealed', 'hidden'],
        source: 'mirror-image',
        priority: 100,
      };

      await OffGuardSuppression.applyOffGuardSuppression(operation, mockToken);

      expect(mockToken.document.setFlag).toHaveBeenCalledWith(
        'pf2e-visioner',
        'offGuardSuppression.mirror-image',
        expect.objectContaining({
          id: 'mirror-image',
          type: 'mirror-image',
          priority: 100,
          suppressedStates: ['concealed', 'hidden'],
        }),
      );
    });

    it('should not apply suppression when predicate fails', async () => {
      PredicateHelper.evaluate.mockReturnValue(false);

      const operation = {
        suppressedStates: ['concealed'],
        source: 'test-source',
        predicate: ['self:trait:elf'],
      };

      await OffGuardSuppression.applyOffGuardSuppression(operation, mockToken);

      expect(mockToken.document.setFlag).not.toHaveBeenCalled();
    });

    it('should apply suppression when predicate matches', async () => {
      PredicateHelper.evaluate.mockReturnValue(true);

      const operation = {
        suppressedStates: ['hidden', 'undetected'],
        source: 'test-source',
        predicate: ['self:trait:human'],
      };

      await OffGuardSuppression.applyOffGuardSuppression(operation, mockToken);

      expect(PredicateHelper.evaluate).toHaveBeenCalledWith(
        ['self:trait:human'],
        ['self:trait:human'],
      );
      expect(mockToken.document.setFlag).toHaveBeenCalled();
    });

    it('should warn and return if suppressedStates is empty', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const operation = {
        suppressedStates: [],
        source: 'test-source',
      };

      await OffGuardSuppression.applyOffGuardSuppression(operation, mockToken);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('offGuardSuppression requires suppressedStates array'),
      );
      expect(mockToken.document.setFlag).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it('should generate source ID if not provided', async () => {
      const operation = {
        suppressedStates: ['concealed'],
      };

      await OffGuardSuppression.applyOffGuardSuppression(operation, mockToken);

      expect(mockToken.document.setFlag).toHaveBeenCalledWith(
        'pf2e-visioner',
        expect.stringMatching(/offGuardSuppression\.off-guard-suppression-\d+/),
        expect.objectContaining({
          id: expect.stringMatching(/off-guard-suppression-\d+/),
          suppressedStates: ['concealed'],
        }),
      );
    });
  });

  describe('removeOffGuardSuppression', () => {
    it('should remove off-guard suppression flag', async () => {
      mockToken.document.getFlag.mockReturnValue({
        'mirror-image': {
          id: 'mirror-image',
          suppressedStates: ['concealed'],
        },
      });

      const operation = {
        source: 'mirror-image',
      };

      await OffGuardSuppression.removeOffGuardSuppression(operation, mockToken);

      expect(mockToken.document.unsetFlag).toHaveBeenCalledWith(
        'pf2e-visioner',
        'offGuardSuppression.mirror-image',
      );
    });

    it('should not call unsetFlag if source does not exist', async () => {
      mockToken.document.getFlag.mockReturnValue({});

      const operation = {
        source: 'non-existent',
      };

      await OffGuardSuppression.removeOffGuardSuppression(operation, mockToken);

      expect(mockToken.document.unsetFlag).not.toHaveBeenCalled();
    });
  });

  describe('shouldSuppressOffGuardForState', () => {
    it('should return true if state is in suppressedStates', () => {
      mockToken.document.getFlag.mockReturnValue({
        'source-1': {
          id: 'source-1',
          priority: 100,
          suppressedStates: ['concealed', 'hidden'],
        },
      });

      const result = OffGuardSuppression.shouldSuppressOffGuardForState(mockToken, 'concealed');

      expect(result).toBe(true);
    });

    it('should return false if state is not in suppressedStates', () => {
      mockToken.document.getFlag.mockReturnValue({
        'source-1': {
          id: 'source-1',
          priority: 100,
          suppressedStates: ['concealed', 'hidden'],
        },
      });

      const result = OffGuardSuppression.shouldSuppressOffGuardForState(mockToken, 'observed');

      expect(result).toBe(false);
    });

    it('should return false if no suppressions exist', () => {
      mockToken.document.getFlag.mockReturnValue({});

      const result = OffGuardSuppression.shouldSuppressOffGuardForState(mockToken, 'concealed');

      expect(result).toBe(false);
    });

    it('should check all suppressions regardless of priority', () => {
      mockToken.document.getFlag.mockReturnValue({
        'source-1': {
          id: 'source-1',
          priority: 100,
          suppressedStates: ['concealed'],
        },
        'source-2': {
          id: 'source-2',
          priority: 150,
          suppressedStates: ['hidden'],
        },
      });

      const resultHidden = OffGuardSuppression.shouldSuppressOffGuardForState(mockToken, 'hidden');
      const resultConcealed = OffGuardSuppression.shouldSuppressOffGuardForState(
        mockToken,
        'concealed',
      );

      expect(resultHidden).toBe(true);
      expect(resultConcealed).toBe(true);
    });

    it('should suppress hidden off-guard for native Blind-Fight feat even without flags', () => {
      mockToken.actor = {
        items: [
          {
            type: 'feat',
            slug: 'blind-fight',
            system: { slug: 'blind-fight' },
          },
        ],
      };
      mockToken.document.getFlag.mockReturnValue({});

      expect(OffGuardSuppression.shouldSuppressOffGuardForState(mockToken, 'hidden')).toBe(true);
      expect(OffGuardSuppression.shouldSuppressOffGuardForState(mockToken, 'undetected')).toBe(
        false,
      );
    });

    it('should suppress hidden off-guard when PF2e passes a token document instead of a token', () => {
      const tokenDocument = {
        id: 'token-doc-1',
        actor: {
          itemTypes: {
            feat: [{ slug: 'blind-fight' }],
          },
        },
        getFlag: jest.fn().mockReturnValue({}),
      };

      expect(OffGuardSuppression.shouldSuppressOffGuardForState(tokenDocument, 'hidden')).toBe(
        true,
      );
    });

    it('should suppress hidden and undetected off-guard for native Deny Advantage against same-or-lower-level attackers', () => {
      mockToken.actor = {
        system: { details: { level: { value: 8 } } },
        items: [
          {
            type: 'feat',
            slug: 'deny-advantage',
            system: { slug: 'deny-advantage' },
          },
        ],
      };
      mockToken.document.getFlag.mockReturnValue({});
      const lowerLevelAttacker = {
        actor: { system: { details: { level: { value: 7 } } } },
      };
      const higherLevelAttacker = {
        actor: { system: { details: { level: { value: 9 } } } },
      };

      expect(
        OffGuardSuppression.shouldSuppressOffGuardForState(mockToken, 'hidden', lowerLevelAttacker),
      ).toBe(true);
      expect(
        OffGuardSuppression.shouldSuppressOffGuardForState(
          mockToken,
          'undetected',
          lowerLevelAttacker,
        ),
      ).toBe(true);
      expect(
        OffGuardSuppression.shouldSuppressOffGuardForState(
          mockToken,
          'hidden',
          higherLevelAttacker,
        ),
      ).toBe(false);
    });

    it('should suppress Deny Advantage when PF2e exposes actor levels as level objects', () => {
      mockToken.actor = {
        level: { value: 8 },
        itemTypes: {
          feat: [{ slug: 'deny-advantage' }],
        },
      };
      mockToken.document.getFlag.mockReturnValue({});
      const sameLevelAttacker = {
        actor: { level: { value: 8 } },
      };

      expect(
        OffGuardSuppression.shouldSuppressOffGuardForState(mockToken, 'hidden', sameLevelAttacker),
      ).toBe(true);
      expect(
        OffGuardSuppression.shouldSuppressOffGuardForState(
          mockToken,
          'undetected',
          sameLevelAttacker,
        ),
      ).toBe(true);
    });

    it('should expose Deny Advantage as the suppression source', () => {
      mockToken.actor = {
        system: { details: { level: { value: 8 } } },
        itemTypes: {
          feat: [{ slug: 'deny-advantage' }],
        },
      };
      mockToken.document.getFlag.mockReturnValue({});
      const sameLevelAttacker = {
        actor: { system: { details: { level: { value: 8 } } } },
      };

      const decision = OffGuardSuppression.getOffGuardSuppressionDecision(
        mockToken,
        'hidden',
        sameLevelAttacker,
      );

      expect(decision.result).toBe(true);
      expect(decision.denyAdvantageSuppression).toBe(true);
      expect(decision.source).toBe('deny-advantage');
    });

    it('should suppress via PF2e native Deny Advantage flanking flatFootable attribute', () => {
      mockToken.actor = {
        system: {
          details: { level: { value: 8 } },
          attributes: { flanking: { flatFootable: 8 } },
        },
        itemTypes: {
          action: [{ name: 'Deny Advantage', system: { actionType: { value: 'passive' } } }],
        },
      };
      mockToken.document.getFlag.mockReturnValue({});
      const lowerLevelAttacker = {
        actor: { system: { details: { level: { value: 7 } } } },
      };
      const higherLevelAttacker = {
        actor: { system: { details: { level: { value: 9 } } } },
      };

      expect(
        OffGuardSuppression.shouldSuppressOffGuardForState(mockToken, 'hidden', lowerLevelAttacker),
      ).toBe(true);
      expect(
        OffGuardSuppression.shouldSuppressOffGuardForState(
          mockToken,
          'hidden',
          higherLevelAttacker,
        ),
      ).toBe(false);
    });

    it('should suppress via PF2e native Deny Advantage flanking offGuardable attribute', () => {
      mockToken.actor = {
        system: {
          details: { level: { value: 8 } },
          attributes: { flanking: { offGuardable: 8 } },
        },
        itemTypes: {
          action: [{ name: 'Deny Advantage', system: { actionType: { value: 'passive' } } }],
        },
      };
      mockToken.document.getFlag.mockReturnValue({});
      const lowerLevelAttacker = {
        actor: { system: { details: { level: { value: 7 } } } },
      };
      const higherLevelAttacker = {
        actor: { system: { details: { level: { value: 9 } } } },
      };

      expect(
        OffGuardSuppression.shouldSuppressOffGuardForState(mockToken, 'hidden', lowerLevelAttacker),
      ).toBe(true);
      expect(
        OffGuardSuppression.shouldSuppressOffGuardForState(
          mockToken,
          'undetected',
          lowerLevelAttacker,
        ),
      ).toBe(true);
      expect(
        OffGuardSuppression.shouldSuppressOffGuardForState(
          mockToken,
          'hidden',
          higherLevelAttacker,
        ),
      ).toBe(false);
    });

    it('should not suppress hidden or undetected off-guard for Constant Gaze', () => {
      mockToken.actor = {
        system: { details: { level: { value: 8 } } },
        itemTypes: {
          feat: [{ slug: 'constant-gaze' }],
        },
      };
      mockToken.document.getFlag.mockReturnValue({});
      const sameLevelAttacker = {
        actor: { system: { details: { level: { value: 8 } } } },
      };

      const decision = OffGuardSuppression.getOffGuardSuppressionDecision(
        mockToken,
        'undetected',
        sameLevelAttacker,
      );

      expect(decision.result).toBe(false);
      expect(decision.source).toBe(null);
    });

    it('should not treat generic PF2e offGuardable as hidden or undetected suppression', () => {
      mockToken.actor = {
        system: {
          details: { level: { value: 8 } },
          attributes: { flanking: { offGuardable: 8 } },
        },
        items: [],
      };
      mockToken.document.getFlag.mockReturnValue({});
      const sameLevelAttacker = {
        actor: { system: { details: { level: { value: 8 } } } },
      };

      expect(
        OffGuardSuppression.shouldSuppressOffGuardForState(mockToken, 'hidden', sameLevelAttacker),
      ).toBe(false);
      expect(
        OffGuardSuppression.shouldSuppressOffGuardForState(
          mockToken,
          'undetected',
          sameLevelAttacker,
        ),
      ).toBe(false);
    });

    it('should suppress all visibility off-guard when actor is immune to off-guard', () => {
      mockToken.actor = {
        isImmuneTo: jest.fn((type) => type === 'off-guard'),
        system: { details: { level: { value: 3 } } },
        items: [],
      };
      mockToken.document.getFlag.mockReturnValue({});
      const higherLevelAttacker = {
        actor: { system: { details: { level: { value: 20 } } } },
      };

      const hiddenDecision = OffGuardSuppression.getOffGuardSuppressionDecision(
        mockToken,
        'hidden',
        higherLevelAttacker,
      );
      const undetectedDecision = OffGuardSuppression.getOffGuardSuppressionDecision(
        mockToken,
        'undetected',
        higherLevelAttacker,
      );

      expect(hiddenDecision.result).toBe(true);
      expect(undetectedDecision.result).toBe(true);
      expect(hiddenDecision.source).toBe('off-guard-immunity');
    });

    it('should suppress undetected only for Starsong Nectar', () => {
      mockToken.actor = {
        system: {
          details: { level: { value: 8 } },
          attributes: { flanking: { offGuardable: 8 } },
        },
        items: [{ type: 'effect', slug: 'effect-starsong-nectar', name: 'Effect: Starsong Nectar' }],
      };
      mockToken.document.getFlag.mockReturnValue({});
      const sameLevelAttacker = {
        actor: { system: { details: { level: { value: 8 } } } },
      };

      expect(
        OffGuardSuppression.shouldSuppressOffGuardForState(mockToken, 'undetected', sameLevelAttacker),
      ).toBe(true);
      expect(
        OffGuardSuppression.shouldSuppressOffGuardForState(mockToken, 'hidden', sameLevelAttacker),
      ).toBe(false);
    });
  });

  describe('getSuppressedStates', () => {
    it('should return all unique suppressed states', () => {
      mockToken.document.getFlag.mockReturnValue({
        'source-1': {
          suppressedStates: ['concealed', 'hidden'],
        },
        'source-2': {
          suppressedStates: ['hidden', 'undetected'],
        },
      });

      const result = OffGuardSuppression.getSuppressedStates(mockToken);

      expect(result).toEqual(expect.arrayContaining(['concealed', 'hidden', 'undetected']));
      expect(result).toHaveLength(3);
    });

    it('should return empty array if no suppressions exist', () => {
      mockToken.document.getFlag.mockReturnValue({});

      const result = OffGuardSuppression.getSuppressedStates(mockToken);

      expect(result).toEqual([]);
    });

    it('should handle suppressions with undefined suppressedStates', () => {
      mockToken.document.getFlag.mockReturnValue({
        'source-1': {
          suppressedStates: ['concealed'],
        },
        'source-2': {},
      });

      const result = OffGuardSuppression.getSuppressedStates(mockToken);

      expect(result).toEqual(['concealed']);
    });
  });
});
