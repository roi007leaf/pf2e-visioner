import { DEFAULT_SETTINGS } from '../../../scripts/constants.js';

describe('systemConditionOverrides setting', () => {
  test('is a world boolean, opt-in (default false)', () => {
    const cfg = DEFAULT_SETTINGS.systemConditionOverrides;
    expect(cfg).toBeDefined();
    expect(cfg.type).toBe(Boolean);
    expect(cfg.scope).toBe('world');
    expect(cfg.default).toBe(false);
    expect(cfg.config).toBe(true);
  });
});
