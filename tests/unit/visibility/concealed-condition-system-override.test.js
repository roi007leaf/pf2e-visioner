import { extractConcealment } from '../../../scripts/visibility/VisibilityCalculatorAdapter.js';

function targetWithConcealedCondition() {
  return {
    document: { flags: {} },
    actor: { conditions: [{ slug: 'concealed' }] },
  };
}

function setSetting(value) {
  globalThis.game = {
    settings: { get: (mod, key) => (key === 'systemConditionOverrides' ? value : undefined) },
  };
}

describe('extractConcealment + systemConditionOverrides', () => {
  afterEach(() => {
    delete globalThis.game;
  });

  test('applies the concealed condition universally when the setting is OFF (RAW)', () => {
    setSetting(false);
    expect(extractConcealment(targetWithConcealedCondition(), {})).toBe(true);
  });

  test('ignores the bare concealed condition when the setting is ON (feature enemy-scopes it via overrides)', () => {
    setSetting(true);
    expect(extractConcealment(targetWithConcealedCondition(), {})).toBe(false);
  });

  test('explicit pf2e-visioner concealment flag still wins regardless of the setting', () => {
    setSetting(true);
    const target = { document: { flags: { 'pf2e-visioner': { concealment: true } } }, actor: { conditions: [] } };
    expect(extractConcealment(target, {})).toBe(true);
  });
});
