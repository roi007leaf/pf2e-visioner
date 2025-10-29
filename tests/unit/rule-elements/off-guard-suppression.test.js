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
        })
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
        ['self:trait:human']
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
        expect.stringContaining('offGuardSuppression requires suppressedStates array')
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
        })
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
        'offGuardSuppression.mirror-image'
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
        'concealed'
      );

      expect(resultHidden).toBe(true);
      expect(resultConcealed).toBe(true);
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
