jest.mock('../../../scripts/utils.js', () => ({
  getVisibilityMap: token => token.states,
  getPerceptionProfileBetween: jest.fn(),
  getControlledObserverTokens: jest.fn(() => []),
  getBestVisibilityState: states => states.includes('observed') ? 'observed' : 'undetected',
}));
jest.mock('../../../scripts/services/Detection/detection-setting-cache.js', () => ({ getDetectionSetting: jest.fn(() => true) }));
import { getControlledObserverTokens } from '../../../scripts/utils.js';
import { getDetectionSetting } from '../../../scripts/services/Detection/detection-setting-cache.js';
import { detectionFrameCache, getVisionerVisibilityBetweenTokens } from '../../../scripts/services/Detection/detection-visibility-context.js';

describe('selected observer aggregation', () => {
  const token = (id, state) => ({ id, document: { id, getFlag: jest.fn() }, states: { target: state } });
  const blind = token('blind', 'undetected'), sighted = token('sighted', 'observed'), target = token('target', 'observed');
  beforeEach(() => {
    game.user.isGM = false;
    canvas.scene.tokenVision = true;
    canvas.tokens.controlled = [blind, sighted];
    getDetectionSetting.mockReturnValue(true);
    getControlledObserverTokens.mockReturnValue([]);
    detectionFrameCache.clear();
  });
  test('aggregates player-owned selected tokens and drops released sources', () => {
    expect(getVisionerVisibilityBetweenTokens(blind, target)).toBe('observed');
    canvas.tokens.controlled = [blind];
    expect(getVisionerVisibilityBetweenTokens(blind, target)).toBe('undetected');
  });
  test('keeps per-observer semantics when aggregation is disabled', () => {
    getDetectionSetting.mockReturnValue(false);
    expect(getVisionerVisibilityBetweenTokens(blind, target)).toBe('undetected');
  });
  test('retains spectator fallback with no selected tokens', () => {
    canvas.tokens.controlled = [];
    getControlledObserverTokens.mockReturnValue([blind, sighted]);
    expect(getVisionerVisibilityBetweenTokens(blind, target)).toBe('observed');
  });
});
