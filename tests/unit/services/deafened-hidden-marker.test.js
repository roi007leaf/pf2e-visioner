import '../../setup.js';

jest.mock('../../../scripts/services/Detection/detection-visibility-context.js', () => ({
  detectionFrameCache: { getPerceptionProfile: jest.fn() },
  getVisionerVisibilityBetweenTokens: jest.fn(() => 'hidden'),
  isAvsActiveGivenCombatGate: jest.fn(() => true),
}));
jest.mock('../../../scripts/services/Detection/current-view-hard-hide.js', () => ({
  currentViewObservers: jest.fn(() => []),
}));
jest.mock('../../../scripts/services/gm-vision-bypass.js', () => ({
  shouldBypassAvsForGmVision: jest.fn(() => false),
}));
jest.mock('../../../scripts/services/Detection/select-all-token-visibility-bypass.js', () => ({
  isSelectAllTokenVisibilityBypassActive: jest.fn(() => false),
}));

import { wrapCanvasVisibilityTest } from '../../../scripts/services/Detection/detection-canvas-visibility.js';
import { getVisionerVisibilityBetweenTokens } from '../../../scripts/services/Detection/detection-visibility-context.js';

describe('deafened observer with an explicit Hidden target', () => {
  let observer, target, wrapped, previousConfig;
  beforeEach(() => {
    observer = { document: { id: 'observer' }, vision: { active: true }, actor: { hasCondition: jest.fn(() => true) } };
    target = { document: { documentName: 'Token', hidden: false, getFlag: jest.fn(() => ({ state: 'hidden', source: 'hide_action' })) }, actor: { type: 'character' } };
    wrapped = jest.fn(() => false);
    previousConfig = globalThis.CONFIG;
    globalThis.CONFIG = { Canvas: { detectionModes: { hearing: { constructor: { getDetectionFilter: () => ({ marker: true }) } } } } };
    getVisionerVisibilityBetweenTokens.mockReturnValue('hidden');
  });
  afterEach(() => { globalThis.CONFIG = previousConfig; });
  const render = (observer, target, wrapped) => wrapCanvasVisibilityTest(wrapped, [{ x: 0, y: 0 }], { object: target, source: { object: observer } });

  test('keeps the known-location marker without enabling hearing', () => {
    expect(render(observer, target, wrapped)).toBe(true);
    expect(target.detectionFilter).toEqual({ marker: true });
    expect(observer.document.detectionModes).toBeUndefined();
    expect(wrapped).toHaveBeenCalledTimes(1);
  });
  test.each(['undetected', 'unnoticed', 'observed'])('does not reveal %s targets', (state) => {
    getVisionerVisibilityBetweenTokens.mockReturnValue(state);
    expect(render(observer, target, wrapped)).toBe(false);
    expect(target.detectionFilter).toBeUndefined();
  });
  test('respects Foundry-hidden tokens', () => {
    target.document.hidden = true;
    expect(render(observer, target, wrapped)).toBe(false);
  });
  test('does not turn automatic stale Hidden state into a marker', () => {
    target.document.getFlag.mockReturnValue(null);
    expect(render(observer, target, wrapped)).toBe(false);
  });
  test('does not add a fallback for non-deafened or inactive observers', () => {
    observer.actor.hasCondition.mockReturnValue(false);
    expect(render(observer, target, wrapped)).toBe(false);
    observer.actor.hasCondition.mockReturnValue(true);
    observer.vision.active = false;
    expect(render(observer, target, wrapped)).toBe(false);
  });
});
