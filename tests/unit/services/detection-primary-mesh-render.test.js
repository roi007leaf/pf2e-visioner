import '../../setup.js';

import { wrapPrimarySpriteMeshRender } from '../../../scripts/services/Detection/detection-primary-mesh-render.js';
import { legacyVisibilityToProfile } from '../../../scripts/visibility/perception-profile.js';

function visibilityV2Flags(map) {
  return {
    'pf2e-visioner': {
      visibilityV2: Object.fromEntries(
        Object.entries(map).map(([targetId, state]) => [targetId, legacyVisibilityToProfile(state)]),
      ),
    },
  };
}

describe('primary mesh render detection filter wrapper', () => {
  let originalCanvas;

  beforeEach(() => {
    originalCanvas = global.canvas;
  });

  afterEach(() => {
    global.canvas = originalCanvas;
  });

  test('pre-tints PF2E outline detection filter primary mesh before render', () => {
    global.canvas.walls.placeables = [
      createMockWall({ id: 'wall', c: [100, 0, 100, 200], sight: 1, sound: 0 }),
    ];
    const observer = createMockToken({
      id: 'observer',
      x: 0,
      y: 0,
      controlled: true,
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target', x: 3, y: 0 });
    target.detectionFilter = {
      constructor: { name: 'OutlineOverlayFilter' },
      uniforms: { knockout: true, wave: true },
    };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        controlled: [observer],
        placeables: [observer, target],
      },
    };
    const mesh = {
      object: target,
      tint: 0xffffff,
    };
    const wrapped = jest.fn(() => 'rendered');

    expect(wrapPrimarySpriteMeshRender.call(mesh, wrapped, 'renderer')).toBe('rendered');
    expect(mesh.tint).toBe(0);
    expect(wrapped).toHaveBeenCalledWith('renderer');
  });

  test('leaves stale observed soundwave primary mesh tint unchanged', () => {
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: visibilityV2Flags({ target: 'observed' }),
    });
    const target = createMockToken({ id: 'target' });
    target.detectionFilter = {
      constructor: { name: 'OutlineOverlayFilter' },
      uniforms: { knockout: true, wave: true },
    };
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    global.canvas = {
      ...global.canvas,
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        controlled: [observer],
        placeables: [observer, target],
      },
    };
    const mesh = {
      object: target,
      tint: 0xffffff,
    };
    const wrapped = jest.fn(() => 'rendered');

    expect(wrapPrimarySpriteMeshRender.call(mesh, wrapped, 'renderer')).toBe('rendered');
    expect(mesh.tint).toBe(0xffffff);
  });

  test('leaves ordinary primary mesh tint unchanged', () => {
    const token = createMockToken({ id: 'target' });
    token.detectionFilter = null;
    const mesh = {
      object: token,
      tint: 0xffffff,
    };
    const wrapped = jest.fn(() => 'rendered');

    expect(wrapPrimarySpriteMeshRender.call(mesh, wrapped, 'renderer')).toBe('rendered');
    expect(mesh.tint).toBe(0xffffff);
  });
});
