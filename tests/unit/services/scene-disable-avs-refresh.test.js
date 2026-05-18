import '../../setup.js';

import {
  hasDisableAvsFlagChange,
  handleSceneDisableAvsRefresh,
} from '../../../scripts/services/scene-disable-avs-refresh.js';

const MODULE_ID = 'pf2e-visioner';

describe('scene disable AVS refresh service', () => {
  test('detects explicit disableAVS flag changes, including false clears', () => {
    expect(hasDisableAvsFlagChange({ flags: { [MODULE_ID]: { disableAVS: true } } })).toBe(true);
    expect(hasDisableAvsFlagChange({ flags: { [MODULE_ID]: { disableAVS: false } } })).toBe(true);
    expect(hasDisableAvsFlagChange({ flags: { [MODULE_ID]: { disableAVS: null } } })).toBe(true);

    expect(hasDisableAvsFlagChange({ flags: { [MODULE_ID]: {} } })).toBe(false);
    expect(hasDisableAvsFlagChange({ name: 'Other Scene' })).toBe(false);
  });

  test('skips scenes that are not the active canvas scene', async () => {
    const loadAutoVisibility = jest.fn();

    const result = await handleSceneDisableAvsRefresh(
      { id: 'inactive-scene' },
      { flags: { [MODULE_ID]: { disableAVS: true } } },
      {
        getCurrentSceneId: () => 'active-scene',
        loadAutoVisibility,
      },
    );

    expect(result).toEqual({ refreshed: false, reason: 'inactive-scene' });
    expect(loadAutoVisibility).not.toHaveBeenCalled();
  });

  test('skips active scene updates without disableAVS changes', async () => {
    const loadAutoVisibility = jest.fn();

    const result = await handleSceneDisableAvsRefresh(
      { id: 'active-scene' },
      { flags: { [MODULE_ID]: {} } },
      {
        getCurrentSceneId: () => 'active-scene',
        loadAutoVisibility,
      },
    );

    expect(result).toEqual({ refreshed: false, reason: 'unchanged' });
    expect(loadAutoVisibility).not.toHaveBeenCalled();
  });

  test('forces AVS recalculation for active scene disableAVS changes', async () => {
    const recalculateAll = jest.fn().mockResolvedValue(undefined);
    const loadAutoVisibility = jest.fn().mockResolvedValue({ recalculateAll });

    const result = await handleSceneDisableAvsRefresh(
      { id: 'active-scene' },
      { flags: { [MODULE_ID]: { disableAVS: false } } },
      {
        getCurrentSceneId: () => 'active-scene',
        loadAutoVisibility,
      },
    );

    expect(result).toEqual({ refreshed: true });
    expect(loadAutoVisibility).toHaveBeenCalledTimes(1);
    expect(recalculateAll).toHaveBeenCalledWith(true);
  });

  test('warns and returns error status when recalculation fails', async () => {
    const failure = new Error('recalc failed');
    const warn = jest.fn();

    const result = await handleSceneDisableAvsRefresh(
      { id: 'active-scene' },
      { flags: { [MODULE_ID]: { disableAVS: true } } },
      {
        getCurrentSceneId: () => 'active-scene',
        loadAutoVisibility: jest.fn().mockRejectedValue(failure),
        warn,
      },
    );

    expect(result).toEqual({ refreshed: false, reason: 'error' });
    expect(warn).toHaveBeenCalledWith(
      'PF2E Visioner | Failed to handle scene update for disableAVS:',
      failure,
    );
  });
});
