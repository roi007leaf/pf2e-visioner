import { DistanceBasedVisibility } from '../../../../scripts/rule-elements/operations/DistanceBasedVisibility.js';
import { RuleElementChecker } from '../../../../scripts/rule-elements/RuleElementChecker.js';

describe('DistanceBasedVisibility', () => {
  let mockToken1, mockToken2, mockToken3;
  let mockActor1, mockActor2, mockActor3;
  let mockCanvas;

  beforeEach(() => {
    mockActor1 = {
      hasPlayerOwner: true,
      getRollOptions: jest.fn(() => ['self:type:character']),
    };

    mockActor2 = {
      hasPlayerOwner: false,
      getRollOptions: jest.fn(() => ['self:type:creature']),
    };

    mockActor3 = {
      hasPlayerOwner: false,
      getRollOptions: jest.fn(() => ['self:type:creature']),
    };

    mockToken1 = {
      id: 'token1',
      name: 'Token 1',
      x: 0,
      y: 0,
      actor: mockActor1,
      document: {
        setFlag: jest.fn(),
        getFlag: jest.fn(() => ({})),
      },
      distanceTo: jest.fn((other) => {
        const dx = Math.abs(mockToken1.x - other.x);
        const dy = Math.abs(mockToken1.y - other.y);
        return Math.sqrt(dx * dx + dy * dy) / 5;
      }),
    };

    mockToken2 = {
      id: 'token2',
      name: 'Token 2',
      x: 100,
      y: 0,
      actor: mockActor2,
      document: {
        setFlag: jest.fn(),
        getFlag: jest.fn(() => ({})),
      },
      distanceTo: jest.fn((other) => {
        const dx = Math.abs(mockToken2.x - other.x);
        const dy = Math.abs(mockToken2.y - other.y);
        return Math.sqrt(dx * dx + dy * dy) / 5;
      }),
    };

    mockToken3 = {
      id: 'token3',
      name: 'Token 3',
      x: 500,
      y: 0,
      actor: mockActor3,
      document: {
        setFlag: jest.fn(),
        getFlag: jest.fn(() => ({})),
      },
      distanceTo: jest.fn((other) => {
        const dx = Math.abs(mockToken3.x - other.x);
        const dy = Math.abs(mockToken3.y - other.y);
        return Math.sqrt(dx * dx + dy * dy) / 5;
      }),
    };

    mockCanvas = {
      tokens: {
        placeables: [mockToken1, mockToken2, mockToken3],
      },
      grid: {
        measureDistance: jest.fn((token1, token2) => {
          const dx = Math.abs(token1.x - token2.x);
          const dy = Math.abs(token1.y - token2.y);
          return Math.sqrt(dx * dx + dy * dy) / 5;
        }),
      },
    };

    global.canvas = mockCanvas;
    global.game = {
      pf2e: {
        Predicate: class {
          constructor(terms) {
            this.terms = terms;
          }
          test(options) {
            return true;
          }
        },
      },
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getApplicableDistanceBand', () => {
    it('should return the correct band for distance within first band', () => {
      const distanceBands = [
        { minDistance: 0, maxDistance: 30, state: 'observed' },
        { minDistance: 30, maxDistance: null, state: 'concealed' },
      ];

      const result = DistanceBasedVisibility.getApplicableDistanceBand(15, distanceBands);

      expect(result).toEqual({ minDistance: 0, maxDistance: 30, state: 'observed' });
    });

    it('should return the correct band for distance in second band', () => {
      const distanceBands = [
        { minDistance: 0, maxDistance: 30, state: 'observed' },
        { minDistance: 30, maxDistance: null, state: 'concealed' },
      ];

      const result = DistanceBasedVisibility.getApplicableDistanceBand(50, distanceBands);

      expect(result).toEqual({ minDistance: 30, maxDistance: null, state: 'concealed' });
    });

    it('should handle multiple distance bands correctly', () => {
      const distanceBands = [
        { minDistance: 0, maxDistance: 10, state: 'observed' },
        { minDistance: 10, maxDistance: 20, state: 'concealed' },
        { minDistance: 20, maxDistance: null, state: 'hidden' },
      ];

      const result1 = DistanceBasedVisibility.getApplicableDistanceBand(5, distanceBands);
      const result2 = DistanceBasedVisibility.getApplicableDistanceBand(15, distanceBands);
      const result3 = DistanceBasedVisibility.getApplicableDistanceBand(25, distanceBands);

      expect(result1.state).toBe('observed');
      expect(result2.state).toBe('concealed');
      expect(result3.state).toBe('hidden');
    });

    it('should return null when distance does not match any band', () => {
      const distanceBands = [{ minDistance: 10, maxDistance: 20, state: 'concealed' }];

      const result = DistanceBasedVisibility.getApplicableDistanceBand(5, distanceBands);

      expect(result).toBeNull();
    });

    it('should handle bands without maxDistance as Infinity', () => {
      const distanceBands = [{ minDistance: 30, maxDistance: null, state: 'concealed' }];

      const result = DistanceBasedVisibility.getApplicableDistanceBand(1000, distanceBands);

      expect(result).toEqual({ minDistance: 30, maxDistance: null, state: 'concealed' });
    });
  });

  describe('checkDistanceBasedVisibility', () => {
    it('should return null when neither token has distance-based config', () => {
      const result = RuleElementChecker.checkDistanceBasedVisibility(mockToken1, mockToken2);

      expect(result).toBeNull();
    });

    it('should return correct state based on distance bands (direction: to)', () => {
      mockToken1.document.getFlag = jest.fn((scope, key) => {
        if (key === 'distanceBasedVisibility') {
          return {
            active: true,
            direction: 'to',
            distanceBands: [
              { minDistance: 0, maxDistance: 30, state: 'observed' },
              { minDistance: 30, maxDistance: null, state: 'concealed' },
            ],
            source: 'heavy-precipitation',
            priority: 100,
          };
        }
        return {};
      });

      mockToken1.x = 0;
      mockToken1.y = 0;
      mockToken2.x = 200;
      mockToken2.y = 0;

      const result = RuleElementChecker.checkDistanceBasedVisibility(mockToken1, mockToken2);

      expect(result).not.toBeNull();
      expect(result.state).toBe('concealed');
      expect(result.source).toBe('heavy-precipitation');
      expect(result.priority).toBe(100);
    });

    it('should return correct state based on distance bands (direction: from)', () => {
      mockToken2.document.getFlag = jest.fn((scope, key) => {
        if (key === 'distanceBasedVisibility') {
          return {
            active: true,
            direction: 'from',
            distanceBands: [
              { minDistance: 0, maxDistance: 10, state: 'observed' },
              { minDistance: 10, maxDistance: null, state: 'hidden' },
            ],
            source: 'thick-fog',
            priority: 120,
          };
        }
        return {};
      });

      mockToken1.x = 0;
      mockToken1.y = 0;
      mockToken2.x = 500;
      mockToken2.y = 0;

      const result = RuleElementChecker.checkDistanceBasedVisibility(mockToken1, mockToken2);

      expect(result).not.toBeNull();
      expect(result.state).toBe('hidden');
      expect(result.source).toBe('thick-fog');
      expect(result.priority).toBe(120);
    });
  });

  describe('applyDistanceBasedVisibility', () => {
    it('should warn if no subject token provided', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      await DistanceBasedVisibility.applyDistanceBasedVisibility({}, null);

      expect(consoleSpy).toHaveBeenCalledWith(
        'PF2E Visioner | No subject token provided to applyDistanceBasedVisibility',
      );

      consoleSpy.mockRestore();
    });

    it('should warn if no distance bands provided', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const operation = {
        observers: 'all',
        distanceBands: [],
      };

      await DistanceBasedVisibility.applyDistanceBasedVisibility(operation, mockToken1);

      expect(consoleSpy).toHaveBeenCalledWith(
        'PF2E Visioner | distanceBasedVisibility requires distanceBands array',
      );

      consoleSpy.mockRestore();
    });

    it('should set flag on subject token after applying', async () => {
      const operation = {
        observers: 'all',
        direction: 'to',
        distanceBands: [
          { minDistance: 0, maxDistance: 30, state: 'observed' },
          { minDistance: 30, maxDistance: null, state: 'concealed' },
        ],
        source: 'heavy-precipitation',
      };

      await DistanceBasedVisibility.applyDistanceBasedVisibility(operation, mockToken1);

      expect(mockToken1.document.setFlag).toHaveBeenCalledWith(
        'pf2e-visioner',
        'distanceBasedVisibility',
        expect.objectContaining({
          active: true,
          source: 'heavy-precipitation',
          distanceBands: operation.distanceBands,
        }),
      );
    });
  });

  describe('removeDistanceBasedVisibility', () => {
    it('should unset flag', async () => {
      mockToken1.document.unsetFlag = jest.fn();
      mockToken1.document.getFlag = jest.fn(() => ({
        visibility: { sources: [{ id: 'heavy-precipitation' }] },
      }));
      mockToken1.document.setFlag = jest.fn();

      const operation = {
        source: 'heavy-precipitation',
      };

      await DistanceBasedVisibility.removeDistanceBasedVisibility(operation, mockToken1);

      expect(mockToken1.document.unsetFlag).toHaveBeenCalledWith(
        'pf2e-visioner',
        'distanceBasedVisibility',
      );
    });
  });
});
