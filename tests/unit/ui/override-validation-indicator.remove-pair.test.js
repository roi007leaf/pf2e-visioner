/**
 * @jest-environment jsdom
 */

import '../../setup.js';

describe('OverrideValidationIndicator pair cleanup', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    global.game.user.isGM = true;
    global.game.settings.get = jest.fn(() => false);
    global.game.i18n.format = jest.fn((key) => key);
    global.game.i18n.localize = jest.fn((key) => key);
    global.ui.windows = {};
    global.canvas.tokens.get = jest.fn(() => ({
      document: { getFlag: jest.fn(() => false) },
    }));
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('removes only the released observer-target pair from the visible queue', async () => {
    const { OverrideValidationIndicator } = await import(
      '../../../scripts/ui/OverrideValidationIndicator.js'
    );
    const indicator = new OverrideValidationIndicator();
    const released = {
      observerId: 'rootfall',
      targetId: 'flint',
      state: 'concealed',
      currentVisibility: 'observed',
      currentCover: 'none',
      expectedCover: 'none',
      source: 'manual_action',
    };
    const remaining = {
      observerId: 'other-observer',
      targetId: 'other-target',
      state: 'hidden',
      currentVisibility: 'observed',
      currentCover: 'none',
      expectedCover: 'none',
      source: 'manual_action',
    };

    indicator.show([released, remaining], 'Flint', 'flint');

    expect(indicator.removeOverridePair('rootfall', 'flint')).toBe(true);
    expect(indicator._rawOverrides).toEqual([remaining]);
    expect(indicator._data.overrides).toEqual([remaining]);
    expect(indicator.hasQueuedTokens()).toBe(true);

    expect(indicator.removeOverridePair('other-observer', 'other-target')).toBe(true);
    expect(indicator._rawOverrides).toEqual([]);
    expect(indicator.hasQueuedTokens()).toBe(false);
  });
});
