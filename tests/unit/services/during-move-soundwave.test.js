import '../../setup.js';

import {
  setSoundwaveMeshVisible,
  targetShouldShowSoundwave,
} from '../../../scripts/services/during-move-soundwave.js';

function observer(seesTarget) {
  return { vision: { los: { contains: () => seesTarget } } };
}
const target = { center: { x: 100, y: 100 } };
const getVisibility = (vis) => () => vis;

describe('targetShouldShowSoundwave (during-move live decision)', () => {
  test('no soundwave when an observer sees the target (in sight)', () => {
    expect(targetShouldShowSoundwave(target, [observer(true)], getVisibility('observed'))).toBe(false);
  });

  test('soundwave when observed target is out of every observer sight', () => {
    expect(targetShouldShowSoundwave(target, [observer(false)], getVisibility('observed'))).toBe(true);
  });

  test('soundwave for a stored-hidden target out of sight', () => {
    expect(targetShouldShowSoundwave(target, [observer(false)], getVisibility('hidden'))).toBe(true);
  });

  test('no soundwave for undetected target (not sensed)', () => {
    expect(targetShouldShowSoundwave(target, [observer(false)], getVisibility('undetected'))).toBe(false);
  });

  test('multi-observer: any observer that sees it suppresses the soundwave', () => {
    expect(
      targetShouldShowSoundwave(target, [observer(false), observer(true)], getVisibility('observed')),
    ).toBe(false);
  });

  test('no soundwave with no observers', () => {
    expect(targetShouldShowSoundwave(target, [], getVisibility('observed'))).toBe(false);
  });

  test('AVS hidden override is sticky: soundwave even when the target is in sight', () => {
    const overrideHidden = () => true;
    expect(
      targetShouldShowSoundwave(target, [observer(true)], getVisibility('observed'), overrideHidden),
    ).toBe(true);
  });

  test('no override: in-sight target shows no soundwave', () => {
    const noOverride = () => false;
    expect(
      targetShouldShowSoundwave(target, [observer(true)], getVisibility('hidden'), noOverride),
    ).toBe(false);
  });
});

describe('setSoundwaveMeshVisible (live ring clear on LOS)', () => {
  function makeTarget() {
    return { detectionFilterMesh: { visible: true, renderable: true, alpha: 1 } };
  }

  test('hides the soundwave mesh when the observer gains sight (clears mid-move)', () => {
    const t = makeTarget();
    setSoundwaveMeshVisible(t, false);
    expect(t.detectionFilterMesh).toEqual({ visible: false, renderable: false, alpha: 0 });
  });

  test('shows the soundwave mesh when the target is sensed out of sight', () => {
    const t = { detectionFilterMesh: { visible: false, renderable: false, alpha: 0 } };
    setSoundwaveMeshVisible(t, true);
    expect(t.detectionFilterMesh).toEqual({ visible: true, renderable: true, alpha: 1 });
  });

  test('no-ops safely when the target has no detection filter mesh', () => {
    expect(() => setSoundwaveMeshVisible({}, false)).not.toThrow();
    expect(() => setSoundwaveMeshVisible(null, true)).not.toThrow();
  });
});
