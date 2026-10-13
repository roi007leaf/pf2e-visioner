import '../../setup.js';
import { isNativeVisibilityProbe, withNativeVisibilityProbe } from '../../../scripts/services/Detection/native-visibility-probe.js';
import { createCanDetectVisibilityWrapper } from '../../../scripts/services/Detection/detection-can-detect.js';
import { testDetectionModeVisibility } from '../../../scripts/services/Detection/detection-mode-visibility.js';
import { wrapCanvasVisibilityTest } from '../../../scripts/services/Detection/detection-canvas-visibility.js';

jest.mock('../../../scripts/services/Detection/detection-visibility-context.js', () => ({
  getVisionerVisibilityBetweenTokens: () => 'undetected',
  isAvsActiveGivenCombatGate: () => true,
  reachesVisibilityThreshold: () => true,
  NON_VISUAL_DETECTION_MODE_IDS: new Set(['hearing']),
  VISIBILITY_DETECTION_THRESHOLDS: { hidden: 2, undetected: 3 },
  detectionFrameCache: { getPerceptionProfile: () => null },
}));
jest.mock('../../../scripts/services/gm-vision-bypass.js', () => ({ shouldBypassAvsForGmVision: () => false }));
jest.mock('../../../scripts/services/Detection/select-all-token-visibility-bypass.js', () => ({ isSelectAllTokenVisibilityBypassActive: () => false }));

describe('native visibility probes', () => {
  const observer = { document: { id: 'observer' }, actor: { type: 'character' } };
  const target = { document: { id: 'target', getFlag: () => true }, actor: { type: 'npc' } };
  const source = { object: observer };
  const canDetect = createCanDetectVisibilityWrapper(2);

  test('stored Undetected blocks rendering but cannot veto native AVS sight', () => {
    const wrapped = jest.fn(() => true);
    expect(canDetect.call({ id: 'basicSight' }, wrapped, source, target)).toBe(false);
    expect(withNativeVisibilityProbe(observer, target, () =>
      canDetect.call({ id: 'basicSight' }, wrapped, source, target),
    )).toBe(true);
    expect(canDetect.call({ id: 'basicSight' }, wrapped, source, target)).toBe(false);
  });

  test('probe still respects Core detection rejection and point restrictions', () => {
    const mode = { id: 'basicSight', _canDetect: () => false, _testPoint: jest.fn(() => true) };
    withNativeVisibilityProbe(observer, target, () => {
      expect(canDetect.call(mode, () => false, source, target)).toBe(false);
      expect(testDetectionModeVisibility.call(mode, source, { enabled: true }, { object: target, tests: [{}] })).toBe(false);
      expect(mode._testPoint).not.toHaveBeenCalled();
      mode._canDetect = () => true;
      mode._testPoint.mockReturnValue(false);
      expect(testDetectionModeVisibility.call(mode, source, { enabled: true }, { object: target, tests: [{}] })).toBe(false);
      mode._testPoint.mockReturnValue(true);
      expect(testDetectionModeVisibility.call(mode, source, { enabled: true }, { object: target, tests: [{}] })).toBe(true);
      expect(wrapCanvasVisibilityTest(() => false, [], { source, object: target })).toBe(false);
    });
  });

  test('scope excludes other pairs and unwinds after nested failures', () => {
    const other = { document: { id: 'other' }, actor: { type: 'npc' } };
    expect(() => withNativeVisibilityProbe(observer, target, () => {
      expect(isNativeVisibilityProbe(observer, target)).toBe(true);
      expect(canDetect.call({ id: 'basicSight' }, () => true, source, other)).toBe(false);
      withNativeVisibilityProbe(observer, other, () => {
        expect(isNativeVisibilityProbe(observer, target)).toBe(true);
        expect(isNativeVisibilityProbe(observer, other)).toBe(true);
      });
      expect(isNativeVisibilityProbe(observer, other)).toBe(false);
      throw new Error('probe failed');
    })).toThrow('probe failed');
    expect(isNativeVisibilityProbe(observer, target)).toBe(false);
  });
});
