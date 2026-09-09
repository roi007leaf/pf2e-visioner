import '../../setup.js';
import { LightingCalculator } from '../../../scripts/visibility/auto-visibility/LightingCalculator.js';
import { LightingPrecomputer } from '../../../scripts/visibility/auto-visibility/core/LightingPrecomputer.js';
import { AvsInvalidationCoordinator } from '../../../scripts/visibility/auto-visibility/core/AvsInvalidationCoordinator.js';

test('door change resamples lighting for stationary tokens in darkness (#301)', async () => {
  jest.useFakeTimers();
  let doorOpen = false;
  const calculator = jest.spyOn(LightingCalculator, 'getInstance').mockReturnValue({
    getLightLevelAt: () => ({ level: doorOpen ? 'bright' : 'darkness' }),
  });
  try {
    const token = createMockToken({ id: 'target', x: 600, y: 0 });
    canvas.tokens.placeables = [token];
    LightingPrecomputer.clearLightingCaches();
    const previous = await LightingPrecomputer.precompute([token]);
    expect(previous.map.get('target').level).toBe('darkness');
    doorOpen = true;
    const coordinator = new AvsInvalidationCoordinator({
      systemStateProvider: { shouldProcessEvents: () => true },
      visibilityStateManager: { markAllTokensChangedImmediate: jest.fn() },
    });
    coordinator.invalidate({ reason: 'wall-updated', changeData: { ds: 1 } });
    const next = await LightingPrecomputer.precompute([token], undefined, previous);
    expect(next.map.get('target').level).toBe('bright');
  } finally {
    calculator.mockRestore();
    jest.clearAllTimers();
    jest.useRealTimers();
  }
});
