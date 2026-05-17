import { RuleElementCoverService } from '../../../scripts/rule-elements/RuleElementCoverService.js';

describe('RuleElementCoverService', () => {
  let warnSpy;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('quietly allows cover when the target token has no document flag API', () => {
    const blocker = { id: 'blocker-1', name: 'Blocker' };
    const target = { id: 'target-1', name: 'Target', document: undefined };

    const result = RuleElementCoverService.canTokenProvideCoverToTarget(blocker, target);

    expect(result).toEqual({ allowed: true, ruleElement: null });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('quietly returns no rule-element cover when the target token has no document flag API', () => {
    const attacker = { id: 'attacker-1', name: 'Attacker' };
    const target = { id: 'target-1', name: 'Target', document: undefined };

    const result = RuleElementCoverService.getCoverFromRuleElements(attacker, target);

    expect(result).toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('can ignore native PF2e cover effect sources for Take Cover baseline detection', () => {
    const attacker = { id: 'attacker-1', name: 'Attacker' };
    const target = {
      id: 'target-1',
      name: 'Target',
      document: {
        getFlag: jest.fn((moduleId, key) => {
          if (moduleId !== 'pf2e-visioner' || key !== 'stateSource') return null;
          return {
            coverByObserver: {
              'attacker-1': {
                sources: [
                  {
                    id: 'rule-element-effect-cover',
                    state: 'standard',
                    priority: 100,
                  },
                ],
              },
            },
          };
        }),
      },
    };

    const result = RuleElementCoverService.getCoverFromRuleElements(attacker, target, {
      ignoreRuleElementCoverSource: (source) => source?.id === 'rule-element-effect-cover',
    });

    expect(result).toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
