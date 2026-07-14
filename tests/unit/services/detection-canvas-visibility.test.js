import '../../setup.js';

import { wrapCanvasVisibilityTest } from '../../../scripts/services/Detection/detection-canvas-visibility.js';
import { createCanDetectVisibilityWrapper } from '../../../scripts/services/Detection/detection-can-detect.js';
import { testDetectionModeVisibility } from '../../../scripts/services/Detection/detection-mode-visibility.js';
import { peekRegistry } from '../../../scripts/services/Peek/PeekRegistry.js';
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

describe('canvas visibility wrapper', () => {
  let originalCanvas;

  beforeEach(() => {
    originalCanvas = global.canvas;
    global.game.settings.set('pf2e', 'gmVision', false);
    global.game.settings.set('pf2e-visioner', 'autoVisibilityEnabled', false);
  });

  afterEach(() => {
    global.game.settings.set('pf2e', 'gmVision', false);
    global.game.settings.set('pf2e-visioner', 'autoVisibilityEnabled', false);
    peekRegistry.clearAll();
    global.canvas = originalCanvas;
  });

  test('GM Vision bypass keeps core canvas visibility result', () => {
    global.game.user.isGM = true;
    global.game.settings.set('pf2e-visioner', 'autoVisibilityEnabled', true);
    global.game.settings.set('pf2e', 'gmVision', true);
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target', visible: false });
    target.detectionFilterMesh = { visible: false, renderable: false, alpha: 0 };
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([['observer', { active: true, object: observer }]]),
        lightSources: new Map(),
      },
      tokens: {
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        placeables: [observer, target],
      },
    };
    const wrapped = jest.fn(() => {
      target.detectionFilter = { id: 'core-soundwave-filter' };
      target.detectionFilterMesh.visible = true;
      target.detectionFilterMesh.renderable = true;
      target.detectionFilterMesh.alpha = 1;
      return true;
    });

    expect(wrapCanvasVisibilityTest(wrapped, [{ x: 0, y: 0 }], { object: target })).toBe(true);
    expect(wrapped).toHaveBeenCalledTimes(1);
    expect(target.detectionFilter).toEqual({ id: 'core-soundwave-filter' });
    expect(target.detectionFilterMesh).toMatchObject({
      visible: true,
      renderable: true,
      alpha: 1,
    });
  });

  test('clears the detection ring when a current-view observer sees the target as observed (precise echolocation)', () => {
    global.game.user.isGM = true;
    global.game.settings.set('pf2e-visioner', 'autoVisibilityEnabled', true);
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'observed' }),
    });
    const target = createMockToken({ id: 'target' });
    global.canvas = {
      ...global.canvas,
      tokens: {
        controlled: [observer],
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        placeables: [observer, target],
      },
    };
    const wrapped = jest.fn(() => {
      target.detectionFilter = { id: 'hearing-soundwave-filter' };
      return true;
    });

    expect(wrapCanvasVisibilityTest(wrapped, [{ x: 0, y: 0 }], { object: target })).toBe(true);
    expect(target.detectionFilter).toBeNull();
  });

  test('keeps the detection ring when the current-view observer only hears the target (hidden)', () => {
    global.game.user.isGM = true;
    global.game.settings.set('pf2e-visioner', 'autoVisibilityEnabled', true);
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    const target = createMockToken({ id: 'target' });
    global.canvas = {
      ...global.canvas,
      tokens: {
        controlled: [observer],
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        placeables: [observer, target],
      },
    };
    const wrapped = jest.fn(() => {
      target.detectionFilter = { id: 'hearing-soundwave-filter' };
      return true;
    });

    expect(wrapCanvasVisibilityTest(wrapped, [{ x: 0, y: 0 }], { object: target })).toBe(true);
    expect(target.detectionFilter).toEqual({ id: 'hearing-soundwave-filter' });
  });

  test('active peek rejects core visibility from explored fog outside the peek polygon', () => {
    global.game.user.isGM = false;
    const observer = createMockToken({ id: 'observer' });
    observer.vision = {
      los: {
        containsPoint: jest.fn((point) => point.x < 100),
      },
    };
    const target = createMockToken({ id: 'target' });
    global.canvas = {
      ...global.canvas,
      tokens: {
        controlled: [observer],
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        placeables: [observer, target],
      },
    };
    peekRegistry.set(
      'observer',
      {
        origin: { x: 0, y: 0 },
        direction: 0,
        fov: 30,
        range: 200,
        ignoredWallIds: ['door1'],
      },
      1000,
    );
    const wrapped = jest.fn(() => true);

    expect(wrapCanvasVisibilityTest(wrapped, [{ x: 250, y: 0 }], { object: target })).toBe(false);
    expect(wrapped).toHaveBeenCalledTimes(1);
  });

  test('active peek keeps core visibility for a hidden (heard) target outside the peek polygon', () => {
    global.game.user.isGM = false;
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'hidden' }),
    });
    observer.vision = {
      los: {
        containsPoint: jest.fn((point) => point.x < 100),
      },
    };
    const target = createMockToken({ id: 'target' });
    global.canvas = {
      ...global.canvas,
      tokens: {
        controlled: [observer],
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        placeables: [observer, target],
      },
    };
    peekRegistry.set(
      'observer',
      {
        origin: { x: 0, y: 0 },
        direction: 0,
        fov: 30,
        range: 200,
        ignoredWallIds: ['door1'],
      },
      1000,
    );
    const wrapped = jest.fn(() => true);

    expect(wrapCanvasVisibilityTest(wrapped, [{ x: 250, y: 0 }], { object: target })).toBe(true);
    expect(wrapped).toHaveBeenCalledTimes(1);
  });

  test('active peek keeps core visibility for points inside the peek polygon', () => {
    global.game.user.isGM = false;
    const observer = createMockToken({ id: 'observer' });
    observer.vision = {
      los: {
        containsPoint: jest.fn((point) => point.x < 100),
      },
    };
    const target = createMockToken({ id: 'target' });
    global.canvas = {
      ...global.canvas,
      tokens: {
        controlled: [observer],
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        placeables: [observer, target],
      },
    };
    peekRegistry.set(
      'observer',
      {
        origin: { x: 0, y: 0 },
        direction: 0,
        fov: 30,
        range: 200,
        ignoredWallIds: ['door1'],
      },
      1000,
    );
    const wrapped = jest.fn(() => true);

    expect(wrapCanvasVisibilityTest(wrapped, [{ x: 50, y: 0 }], { object: target })).toBe(true);
    expect(wrapped).toHaveBeenCalledTimes(1);
  });

  test('GM Vision bypass keeps core can-detect result', () => {
    global.game.user.isGM = true;
    global.game.settings.set('pf2e-visioner', 'autoVisibilityEnabled', true);
    global.game.settings.set('pf2e', 'gmVision', true);
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'undetected' }),
    });
    const target = createMockToken({ id: 'target' });
    global.canvas = {
      ...global.canvas,
      tokens: {
        controlled: [observer],
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        placeables: [observer, target],
      },
    };
    const wrapped = jest.fn(() => true);
    const wrapper = createCanDetectVisibilityWrapper(2);

    expect(wrapper.call({ id: 'basicSight' }, wrapped, { object: observer }, target)).toBe(true);
    expect(wrapped).toHaveBeenCalledTimes(1);
  });

  test('avsOnlyInCombat + not in combat: canvas visibility bypasses AVS ring-clearing logic entirely', () => {
    global.game.user.isGM = true;
    global.game.settings.set('pf2e-visioner', 'autoVisibilityEnabled', true);
    global.game.settings.set('pf2e-visioner', 'avsOnlyInCombat', true);
    global.game.combat = null;
    const observer = createMockToken({
      id: 'observer',
      flags: visibilityV2Flags({ target: 'observed' }),
    });
    const target = createMockToken({ id: 'target' });
    global.canvas = {
      ...global.canvas,
      tokens: {
        controlled: [observer],
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        placeables: [observer, target],
      },
    };
    const wrapped = jest.fn(() => {
      target.detectionFilter = { id: 'hearing-soundwave-filter' };
      return true;
    });

    expect(wrapCanvasVisibilityTest(wrapped, [{ x: 0, y: 0 }], { object: target })).toBe(true);
    // Out of combat with the gate on, the ring must stay untouched - AVS never clears it.
    expect(target.detectionFilter).toEqual({ id: 'hearing-soundwave-filter' });

    global.game.settings.set('pf2e-visioner', 'avsOnlyInCombat', false);
    global.game.combat = undefined;
  });

  test('GM Vision bypass keeps core detection-mode visibility result', () => {
    global.game.user.isGM = true;
    global.game.settings.set('pf2e-visioner', 'autoVisibilityEnabled', true);
    global.game.settings.set('pf2e', 'gmVision', true);
    const observer = createMockToken({ id: 'observer' });
    const target = createMockToken({ id: 'target' });
    target.document.getFlag = jest.fn((moduleId, key) =>
      moduleId === 'pf2e-visioner' && key === 'sneak-active' ? true : null,
    );
    const detectionMode = {
      id: 'basicSight',
      _canDetect: jest.fn(() => true),
      _testPoint: jest.fn(() => true),
    };

    expect(
      testDetectionModeVisibility.call(detectionMode, { object: observer }, { id: 'basicSight', enabled: true }, {
        object: target,
        tests: [{ x: 0, y: 0 }],
      }),
    ).toBe(true);
    expect(detectionMode._testPoint).toHaveBeenCalledTimes(1);
  });
});
