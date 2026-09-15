jest.mock('../../../scripts/services/gm-vision-bypass.js', () => ({
  shouldBypassAvsForGmVision: () => false,
}));

import { wrapTokenRenderDetectionFilter } from '../../../scripts/services/Detection/detection-filter-render.js';
import { suppressDetectionFilterPrimaryMesh, releaseDetectionFilterMesh } from '../../../scripts/services/Detection/detection-filter-mesh-suppression.js';
import { setSoundwaveMeshVisible } from '../../../scripts/services/during-move-soundwave.js';

test.each([false, true])('Hidden filter draws after primary-art suppression and restores flags (throw=%s)', (throws) => {
  const token = { mesh: { visible: true, renderable: true }, detectionFilter: {} };
  suppressDetectionFilterPrimaryMesh(token);
  const draw = jest.fn(() => {
    // PIXI rejects the source mesh if either flag is false.
    expect(token.mesh.visible && token.mesh.renderable).toBe(true);
    if (throws) throw new Error('render failed');
    return 'filtered';
  });
  if (throws) expect(() => wrapTokenRenderDetectionFilter.call(token, draw)).toThrow('render failed');
  else expect(wrapTokenRenderDetectionFilter.call(token, draw)).toBe('filtered');
  expect(draw).toHaveBeenCalledTimes(1);
  expect(token.mesh).toEqual({ visible: false, renderable: false });
});

test('movement-cleared filter surface returns when Core resumes Hidden detection', () => {
  const token = { detectionFilterMesh: { visible: true, renderable: true, alpha: 1 } };
  setSoundwaveMeshVisible(token, false);
  setSoundwaveMeshVisible(token, false);
  expect(token.detectionFilterMesh.visible).toBe(false);
  releaseDetectionFilterMesh(token);
  expect(token.detectionFilterMesh).toEqual({ visible: true, renderable: true, alpha: 1 });
});
