import { RuleElementChecker } from '../../../scripts/rule-elements/RuleElementChecker.js';

jest.mock('../../../scripts/rule-elements/PredicateHelper.js', () => ({
  PredicateHelper: {
    getTokenRollOptions: (token) => token.__rollOptions || [],
    getTargetRollOptions: (target, subject) => (target.__targetOptions || []).map((o) => `target:${o}`),
    combineRollOptions: (a, b) => [...a, ...b],
    evaluate: (predicate, options) => predicate.every((p) => options.includes(p)),
  },
}));

describe('Visibility Replacement - Predicate Evaluation', () => {
  let observer;
  let target;

  beforeEach(() => {
    observer = {
      id: 'obs',
      __rollOptions: ['self:trait:human'],
      __targetOptions: ['trait:human'],
      document: {
        getFlag: jest.fn(),
      },
      distanceTo: jest.fn(() => 5),
      actor: {},
    };
    target = {
      id: 'tgt',
      __rollOptions: ['self:trait:undead'],
      __targetOptions: ['trait:undead'],
      document: {
        getFlag: jest.fn(),
      },
      distanceTo: jest.fn(() => 5),
      actor: {},
    };
  });

  it("applies observer 'to' replacement when predicate matches", () => {
    observer.document.getFlag.mockImplementation((modId, key) => {
      if (key === 'visibilityReplacement') {
        return {
          active: true,
          direction: 'to',
          fromStates: ['undetected'],
          toState: 'hidden',
          predicate: ['self:trait:human', 'target:trait:undead'],
          priority: 150,
          source: 'bf-test',
        };
      }
      return null;
    });

    target.document.getFlag.mockReturnValue(null);

    const res = RuleElementChecker.checkVisibilityReplacement(observer, target, 'undetected');
    expect(res).toEqual(
      expect.objectContaining({ type: 'visibilityReplacement', state: 'hidden', source: 'bf-test' })
    );
  });

  it("does not apply observer 'to' replacement when predicate fails", () => {
    observer.document.getFlag.mockImplementation((modId, key) => {
      if (key === 'visibilityReplacement') {
        return {
          active: true,
          direction: 'to',
          fromStates: ['undetected'],
          toState: 'hidden',
          predicate: ['self:trait:elf'],
          priority: 150,
          source: 'bf-test',
        };
      }
      return null;
    });
    target.document.getFlag.mockReturnValue(null);

    const res = RuleElementChecker.checkVisibilityReplacement(observer, target, 'undetected');
    expect(res).toBeNull();
  });

  it("applies target 'from' replacement when predicate matches", () => {
    observer.document.getFlag.mockReturnValue(null);
    target.document.getFlag.mockImplementation((modId, key) => {
      if (key === 'visibilityReplacement') {
        return {
          active: true,
          direction: 'from',
          fromStates: ['undetected'],
          toState: 'hidden',
          predicate: ['self:trait:undead', 'target:trait:human'],
          priority: 120,
          source: 'bf-test',
        };
      }
      return null;
    });

    const res = RuleElementChecker.checkVisibilityReplacement(observer, target, 'undetected');
    expect(res).toEqual(expect.objectContaining({ state: 'hidden', type: 'visibilityReplacement' }));
  });

  it('applies replacement when target is within range', () => {
    observer.distanceTo.mockReturnValue(4);
    observer.document.getFlag.mockImplementation((modId, key) => {
      if (key === 'visibilityReplacement') {
        return {
          active: true,
          direction: 'to',
          fromStates: ['undetected'],
          toState: 'hidden',
          range: 5,
          priority: 120,
          source: 'blind-fight',
        };
      }
      return null;
    });
    target.document.getFlag.mockReturnValue(null);

    const res = RuleElementChecker.checkVisibilityReplacement(observer, target, 'undetected');
    expect(res).toEqual(expect.objectContaining({ state: 'hidden', type: 'visibilityReplacement' }));
  });

  it('does not apply replacement when target is outside range', () => {
    observer.distanceTo.mockReturnValue(10);
    observer.document.getFlag.mockImplementation((modId, key) => {
      if (key === 'visibilityReplacement') {
        return {
          active: true,
          direction: 'to',
          fromStates: ['undetected'],
          toState: 'hidden',
          range: 5,
          priority: 120,
          source: 'blind-fight',
        };
      }
      return null;
    });
    target.document.getFlag.mockReturnValue(null);

    const res = RuleElementChecker.checkVisibilityReplacement(observer, target, 'undetected');
    expect(res).toBeNull();
  });

  it('applies replacement when no range specified', () => {
    observer.distanceTo.mockReturnValue(100);
    observer.document.getFlag.mockImplementation((modId, key) => {
      if (key === 'visibilityReplacement') {
        return {
          active: true,
          direction: 'to',
          fromStates: ['undetected'],
          toState: 'hidden',
          priority: 120,
          source: 'no-range',
        };
      }
      return null;
    });
    target.document.getFlag.mockReturnValue(null);

    const res = RuleElementChecker.checkVisibilityReplacement(observer, target, 'undetected');
    expect(res).toEqual(expect.objectContaining({ state: 'hidden', type: 'visibilityReplacement' }));
  });
});
