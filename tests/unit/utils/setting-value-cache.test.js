import {
  clearSettingValueCache,
  getCachedSettingValue,
  setCachedSettingValue,
} from '../../../scripts/utils/setting-value-cache.js';

describe('setting value cache', () => {
  beforeEach(() => {
    clearSettingValueCache();
    globalThis.game = {
      settings: {
        get: jest.fn(() => true),
      },
    };
  });

  afterEach(() => {
    clearSettingValueCache();
  });

  it('validates a setting only once until its value changes', () => {
    expect(getCachedSettingValue('avsOnlyInCombat')).toBe(true);
    expect(getCachedSettingValue('avsOnlyInCombat')).toBe(true);
    expect(game.settings.get).toHaveBeenCalledTimes(1);

    setCachedSettingValue('avsOnlyInCombat', false);

    expect(getCachedSettingValue('avsOnlyInCombat')).toBe(false);
    expect(game.settings.get).toHaveBeenCalledTimes(1);
  });

  it('drops values when the Foundry settings service changes', () => {
    getCachedSettingValue('enableCameraVisionAggregation');
    globalThis.game.settings = { get: jest.fn(() => false) };

    expect(getCachedSettingValue('enableCameraVisionAggregation')).toBe(false);
    expect(game.settings.get).toHaveBeenCalledTimes(1);
  });
});
