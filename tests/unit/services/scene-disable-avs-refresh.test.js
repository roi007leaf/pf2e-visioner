import '../../setup.js';

import {
  hasDisableAvsFlagChange,
  hasSceneHearingRangeFlagChange,
  hasSceneTokenVisionChange,
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

  test('detects PF2e hearing range changes from flag and scene property paths', () => {
    expect(hasSceneHearingRangeFlagChange({ flags: { pf2e: { hearingRange: 30 } } })).toBe(true);
    expect(hasSceneHearingRangeFlagChange({ 'flags.pf2e.hearingRange': 30 })).toBe(true);
    expect(hasSceneHearingRangeFlagChange({ hearingRange: 30 })).toBe(true);
    expect(hasSceneHearingRangeFlagChange({ value: { hearingRange: 30 } })).toBe(true);

    expect(hasSceneHearingRangeFlagChange({ name: 'Other Scene' })).toBe(false);
  });

  test('detects scene Token Vision changes', () => {
    expect(hasSceneTokenVisionChange({ tokenVision: false })).toBe(true);
    expect(hasSceneTokenVisionChange({ tokenVision: true })).toBe(true);
    expect(hasSceneTokenVisionChange({ name: 'Other Scene' })).toBe(false);
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

  test('forces AVS recalculation for active scene PF2e hearing range changes', async () => {
    const previousCanvas = global.canvas;
    const recalculateAll = jest.fn().mockResolvedValue(undefined);
    const loadAutoVisibility = jest.fn().mockResolvedValue({ recalculateAll });

    global.canvas = {
      ...previousCanvas,
      scene: { id: 'active-scene' },
    };

    let result;
    try {
      result = await handleSceneDisableAvsRefresh(
        { id: 'active-scene' },
        { flags: { pf2e: { hearingRange: 30 } } },
        { loadAutoVisibility },
      );
    } finally {
      global.canvas = previousCanvas;
    }

    expect(result).toEqual({ refreshed: true });
    expect(loadAutoVisibility).toHaveBeenCalledTimes(1);
    expect(recalculateAll).toHaveBeenCalledWith(true);
  });

  test('forces AVS recalculation for active scene direct hearing range property changes', async () => {
    const recalculateAll = jest.fn().mockResolvedValue(undefined);
    const loadAutoVisibility = jest.fn().mockResolvedValue({ recalculateAll });

    const result = await handleSceneDisableAvsRefresh(
      { id: 'active-scene' },
      { value: { hearingRange: 60 } },
      {
        getCurrentSceneId: () => 'active-scene',
        loadAutoVisibility,
      },
    );

    expect(result).toEqual({ refreshed: true });
    expect(loadAutoVisibility).toHaveBeenCalledTimes(1);
    expect(recalculateAll).toHaveBeenCalledWith(true);
  });

  test('forces AVS recalculation when active scene id is exposed through value wrapper', async () => {
    const recalculateAll = jest.fn().mockResolvedValue(undefined);
    const loadAutoVisibility = jest.fn().mockResolvedValue({ recalculateAll });

    const result = await handleSceneDisableAvsRefresh(
      { value: { id: 'active-scene' } },
      { flags: { pf2e: { hearingRange: 35 } } },
      {
        getCurrentSceneId: () => 'active-scene',
        loadAutoVisibility,
      },
    );

    expect(result).toEqual({ refreshed: true });
    expect(loadAutoVisibility).toHaveBeenCalledTimes(1);
    expect(recalculateAll).toHaveBeenCalledWith(true);
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

  test('cleans visibility surfaces instead of recalculating when Token Vision is disabled', async () => {
    const clearVisibility = jest.fn().mockResolvedValue(undefined);
    const loadAutoVisibility = jest.fn();

    const result = await handleSceneDisableAvsRefresh(
      { id: 'active-scene', tokenVision: false },
      { tokenVision: false },
      {
        getCurrentSceneId: () => 'active-scene',
        clearVisibility,
        loadAutoVisibility,
      },
    );

    expect(result).toEqual({ refreshed: true, reason: 'token-vision-disabled' });
    expect(clearVisibility).toHaveBeenCalledTimes(1);
    expect(loadAutoVisibility).not.toHaveBeenCalled();
  });

  test('forces AVS recalculation when Token Vision is re-enabled', async () => {
    const recalculateAll = jest.fn().mockResolvedValue(undefined);
    const loadAutoVisibility = jest.fn().mockResolvedValue({ recalculateAll });
    const clearVisibility = jest.fn();

    const result = await handleSceneDisableAvsRefresh(
      { id: 'active-scene', tokenVision: true },
      { tokenVision: true },
      {
        getCurrentSceneId: () => 'active-scene',
        clearVisibility,
        loadAutoVisibility,
      },
    );

    expect(result).toEqual({ refreshed: true });
    expect(clearVisibility).not.toHaveBeenCalled();
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
      'PF2E Visioner | Failed to handle scene visibility config update:',
      failure,
    );
  });
});
