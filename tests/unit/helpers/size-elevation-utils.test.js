import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import {
  getTokenHeightFt,
  getTokenVerticalSpanFt,
  parseFeet,
} from '../../../scripts/helpers/size-elevation-utils.js';

describe('Size and Elevation Utils', () => {
  beforeEach(() => {
    global.game = {
      modules: new Map(),
    };
  });

  describe('parseFeet', () => {
    test('returns null for null or undefined', () => {
      expect(parseFeet(null)).toBeNull();
      expect(parseFeet(undefined)).toBeNull();
    });

    test('returns number as-is if finite', () => {
      expect(parseFeet(5)).toBe(5);
      expect(parseFeet(0)).toBe(0);
      expect(parseFeet(-3.5)).toBe(-3.5);
    });

    test('returns null for non-finite numbers', () => {
      expect(parseFeet(NaN)).toBeNull();
      expect(parseFeet(Infinity)).toBeNull();
    });

    test('parses numeric strings', () => {
      expect(parseFeet('5')).toBe(5);
      expect(parseFeet('10.5')).toBe(10.5);
      expect(parseFeet('-3')).toBe(-3);
      expect(parseFeet('  42  ')).toBe(42);
    });

    test('extracts numeric value from strings with units', () => {
      expect(parseFeet('5 ft')).toBe(5);
      expect(parseFeet('10.5ft')).toBe(10.5);
    });

    test('returns null for non-parseable strings', () => {
      expect(parseFeet('not a number')).toBeNull();
      expect(parseFeet('')).toBeNull();
    });
  });

  describe('getTokenHeightFt', () => {
    test('returns module flag override if present', () => {
      const token = {
        document: {
          getFlag: jest.fn((module, key) => {
            if (module === 'pf2e-visioner' && key === 'heightFt') return 12;
            return null;
          }),
          flags: {},
        },
        actor: {
          system: {
            traits: {
              size: { value: 'med' },
            },
          },
        },
      };

      expect(getTokenHeightFt(token)).toBe(12);
      expect(token.document.getFlag).toHaveBeenCalledWith('pf2e-visioner', 'heightFt');
    });

    test('uses wall-height tokenHeight flag if module flag not present', () => {
      const token = {
        document: {
          getFlag: jest.fn(() => null),
          flags: {
            'wall-height': {
              tokenHeight: 8,
            },
          },
        },
        actor: {
          system: {
            traits: {
              size: { value: 'med' },
            },
          },
        },
      };

      expect(getTokenHeightFt(token)).toBe(8);
    });

    test('prefers module flag over wall-height flag', () => {
      const token = {
        document: {
          getFlag: jest.fn((module, key) => {
            if (module === 'pf2e-visioner' && key === 'heightFt') return 12;
            return null;
          }),
          flags: {
            'wall-height': {
              tokenHeight: 8,
            },
          },
        },
        actor: {
          system: {
            traits: {
              size: { value: 'med' },
            },
          },
        },
      };

      expect(getTokenHeightFt(token)).toBe(12);
    });

    test('parses string values from wall-height tokenHeight', () => {
      const token = {
        document: {
          getFlag: jest.fn(() => null),
          flags: {
            'wall-height': {
              tokenHeight: '15.5',
            },
          },
        },
        actor: {
          system: {
            traits: {
              size: { value: 'med' },
            },
          },
        },
      };

      expect(getTokenHeightFt(token)).toBe(15.5);
    });

    test('falls back to size-based height when no flags present', () => {
      const token = {
        document: {
          getFlag: jest.fn(() => null),
          flags: {},
        },
        actor: {
          system: {
            traits: {
              size: { value: 'large' },
            },
          },
        },
      };

      expect(getTokenHeightFt(token)).toBe(10);
    });

    test('returns default height for medium creatures', () => {
      const token = {
        document: {
          getFlag: jest.fn(() => null),
          flags: {},
        },
        actor: {
          system: {
            traits: {
              size: { value: 'med' },
            },
          },
        },
      };

      expect(getTokenHeightFt(token)).toBe(5);
    });

    test('returns height for tiny creatures', () => {
      const token = {
        document: {
          getFlag: jest.fn(() => null),
          flags: {},
        },
        actor: {
          system: {
            traits: {
              size: { value: 'tiny' },
            },
          },
        },
      };

      expect(getTokenHeightFt(token)).toBe(2.5);
    });

    test('returns height for huge creatures', () => {
      const token = {
        document: {
          getFlag: jest.fn(() => null),
          flags: {},
        },
        actor: {
          system: {
            traits: {
              size: { value: 'huge' },
            },
          },
        },
      };

      expect(getTokenHeightFt(token)).toBe(15);
    });

    test('returns height for gargantuan creatures', () => {
      const token = {
        document: {
          getFlag: jest.fn(() => null),
          flags: {},
        },
        actor: {
          system: {
            traits: {
              size: { value: 'grg' },
            },
          },
        },
      };

      expect(getTokenHeightFt(token)).toBe(20);
    });

    test('handles missing actor gracefully', () => {
      const token = {
        document: {
          getFlag: jest.fn(() => null),
          flags: {},
        },
        actor: null,
      };

      expect(getTokenHeightFt(token)).toBe(5);
    });

    test('handles exceptions and returns default', () => {
      const token = {
        document: {
          getFlag: jest.fn(() => {
            throw new Error('Flag error');
          }),
        },
      };

      expect(getTokenHeightFt(token)).toBe(5);
    });
  });

  describe('getTokenVerticalSpanFt', () => {
    test('returns correct span for token at elevation 0', () => {
      const token = {
        document: {
          elevation: 0,
          getFlag: jest.fn(() => null),
          flags: {},
        },
        actor: {
          system: {
            traits: {
              size: { value: 'med' },
            },
          },
        },
      };

      const span = getTokenVerticalSpanFt(token);
      expect(span).toEqual({ bottom: 0, top: 5 });
    });

    test('returns correct span for token at elevated position', () => {
      const token = {
        document: {
          elevation: 10,
          getFlag: jest.fn(() => null),
          flags: {},
        },
        actor: {
          system: {
            traits: {
              size: { value: 'med' },
            },
          },
        },
      };

      const span = getTokenVerticalSpanFt(token);
      expect(span).toEqual({ bottom: 10, top: 15 });
    });

    test('uses wall-height tokenHeight for vertical span calculation', () => {
      const token = {
        document: {
          elevation: 5,
          getFlag: jest.fn(() => null),
          flags: {
            'wall-height': {
              tokenHeight: 20,
            },
          },
        },
        actor: {
          system: {
            traits: {
              size: { value: 'med' },
            },
          },
        },
      };

      const span = getTokenVerticalSpanFt(token);
      expect(span).toEqual({ bottom: 5, top: 25 });
    });

    test('handles large creatures correctly', () => {
      const token = {
        document: {
          elevation: 0,
          getFlag: jest.fn(() => null),
          flags: {},
        },
        actor: {
          system: {
            traits: {
              size: { value: 'large' },
            },
          },
        },
      };

      const span = getTokenVerticalSpanFt(token);
      expect(span).toEqual({ bottom: 0, top: 10 });
    });

    test('handles negative elevations', () => {
      const token = {
        document: {
          elevation: -5,
          getFlag: jest.fn(() => null),
          flags: {},
        },
        actor: {
          system: {
            traits: {
              size: { value: 'med' },
            },
          },
        },
      };

      const span = getTokenVerticalSpanFt(token);
      expect(span).toEqual({ bottom: -5, top: 0 });
    });

    test('handles exceptions and returns default span', () => {
      const token = {
        document: {
          elevation: 0,
          getFlag: jest.fn(() => {
            throw new Error('Error');
          }),
        },
      };

      const span = getTokenVerticalSpanFt(token);
      expect(span).toEqual({ bottom: 0, top: 5 });
    });
  });
});
