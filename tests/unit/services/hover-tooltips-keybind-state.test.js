/**
 * @jest-environment jsdom
 */

import '../../setup.js';

describe('HoverTooltips keybind state', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('key release clears saved key overlay state while panning', async () => {
    const mod = await import('../../../scripts/services/HoverTooltips.js');
    const { HoverTooltips, onHighlightObjects } = mod;

    HoverTooltips._isPanning = true;
    HoverTooltips.isShowingKeyTooltips = true;
    HoverTooltips._savedKeyTooltipsActive = true;

    onHighlightObjects(false);

    expect(HoverTooltips.isShowingKeyTooltips).toBe(false);
    expect(HoverTooltips._savedKeyTooltipsActive).toBeUndefined();
  });
});

