import { jest } from '@jest/globals';
import '../../setup.js';

import {
  clearDuringMoveSoundwaveState,
  installSoundwaveFilterOverride,
  observerSightContainsTarget,
  removeSoundwaveFilterOverride,
  setSoundwaveMeshVisible,
  settleSoundwaveOverrides,
  targetShouldShowSoundwave,
} from '../../../scripts/services/during-move-soundwave.js';

function observer(seesTarget) {
  return { vision: { los: { contains: () => seesTarget } } };
}
const target = { center: { x: 100, y: 100 } };
const getVisibility = (vis) => () => vis;
const notSensed = () => false;
const sensed = () => true;

describe('targetShouldShowSoundwave (during-move live decision)', () => {
  test('no soundwave when an observer sees the target (in sight)', () => {
    expect(targetShouldShowSoundwave(target, [observer(true)], getVisibility('observed'))).toBe(
      false,
    );
  });

  test('no soundwave for an observed target out of sight when precisely sensed (echolocation — a ring is imprecise-only)', () => {
    expect(
      targetShouldShowSoundwave(
        target,
        [observer(false)],
        getVisibility('observed'),
        undefined,
        notSensed,
      ),
    ).toBe(false);
  });

  test('no soundwave for a concealed target out of sight when precisely sensed (echolocation — a ring is imprecise-only)', () => {
    expect(
      targetShouldShowSoundwave(
        target,
        [observer(false)],
        getVisibility('concealed'),
        undefined,
        notSensed,
      ),
    ).toBe(false);
  });

  test('soundwave for an observed target whose sight is lost mid-move but is still sensed imprecisely (heard)', () => {
    expect(
      targetShouldShowSoundwave(
        target,
        [observer(false)],
        getVisibility('observed'),
        undefined,
        sensed,
      ),
    ).toBe(true);
  });

  test('soundwave for a concealed target whose sight is lost mid-move but is still sensed imprecisely (heard)', () => {
    expect(
      targetShouldShowSoundwave(
        target,
        [observer(false)],
        getVisibility('concealed'),
        undefined,
        sensed,
      ),
    ).toBe(true);
  });

  test('still no soundwave for an in-sight observed target even when imprecisely sensed (sight wins)', () => {
    expect(
      targetShouldShowSoundwave(
        target,
        [observer(true)],
        getVisibility('observed'),
        undefined,
        sensed,
      ),
    ).toBe(false);
  });

  test('soundwave for a stored-hidden target out of sight', () => {
    expect(targetShouldShowSoundwave(target, [observer(false)], getVisibility('hidden'))).toBe(
      true,
    );
  });

  test('soundwave stays during movement in complete darkness despite geometric LOS', () => {
    const darknessBlindedObserver = {
      vision: {
        blinded: { darkness: true },
        los: { contains: () => true },
      },
    };
    expect(
      targetShouldShowSoundwave(target, [darknessBlindedObserver], getVisibility('hidden')),
    ).toBe(true);
  });

  test('no soundwave for undetected target (not sensed)', () => {
    expect(targetShouldShowSoundwave(target, [observer(false)], getVisibility('undetected'))).toBe(
      false,
    );
  });

  test('multi-observer: any observer that sees it suppresses the soundwave', () => {
    expect(
      targetShouldShowSoundwave(
        target,
        [observer(false), observer(true)],
        getVisibility('observed'),
      ),
    ).toBe(false);
  });

  test('no soundwave with no observers', () => {
    expect(targetShouldShowSoundwave(target, [], getVisibility('observed'))).toBe(false);
  });

  test('AVS hidden override is sticky: soundwave even when the target is in sight', () => {
    const overrideHidden = () => true;
    expect(
      targetShouldShowSoundwave(
        target,
        [observer(true)],
        getVisibility('observed'),
        overrideHidden,
      ),
    ).toBe(true);
  });

  test('no override: in-sight target shows no soundwave', () => {
    const noOverride = () => false;
    expect(
      targetShouldShowSoundwave(target, [observer(true)], getVisibility('hidden'), noOverride),
    ).toBe(false);
  });
});

describe('tokenVision disabled (theater of mind: global sight, no move-time soundwaves)', () => {
  let savedCanvas;
  afterEach(() => {
    globalThis.canvas = savedCanvas;
  });
  beforeEach(() => {
    savedCanvas = globalThis.canvas;
    globalThis.canvas = { scene: { tokenVision: false }, tokens: { preview: { children: [] } } };
  });

  test('observerSightContainsTarget is true when scene token vision is disabled (no los polygon)', () => {
    expect(observerSightContainsTarget({ vision: null }, target)).toBe(true);
  });

  test('no soundwave for observed target when token vision disabled', () => {
    expect(targetShouldShowSoundwave(target, [{ vision: null }], getVisibility('observed'))).toBe(
      false,
    );
  });

  test('manual hidden override is ignored when token vision is disabled', () => {
    const overrideHidden = () => true;
    expect(
      targetShouldShowSoundwave(
        target,
        [{ vision: null }],
        getVisibility('observed'),
        overrideHidden,
      ),
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

describe('soundwave detectionFilter override (renders the ripple through Foundry per-frame reset)', () => {
  const mockFilter = { id: 'soundwave-filter' };
  let savedConfig;
  beforeEach(() => {
    savedConfig = globalThis.CONFIG;
    globalThis.CONFIG = {
      Canvas: {
        detectionModes: { hearing: { constructor: { getDetectionFilter: () => mockFilter } } },
      },
    };
  });
  afterEach(() => {
    clearDuringMoveSoundwaveState();
    globalThis.CONFIG = savedConfig;
  });

  test('installs an accessor whose getter returns the soundwave filter and absorbs null writes', () => {
    const t = { document: { id: 'a' }, detectionFilter: null };
    expect(installSoundwaveFilterOverride(t)).toBe(true);
    expect(t.detectionFilter).toBe(mockFilter);
    t.detectionFilter = null; // Foundry's per-frame reset
    expect(t.detectionFilter).toBe(mockFilter); // still renders the ripple
  });

  test("getter prefers Foundry's own filter when one is set (genuinely-hidden target keeps its filter)", () => {
    const t = { document: { id: 'b' }, detectionFilter: null };
    installSoundwaveFilterOverride(t);
    const foundryFilter = { id: 'foundry-hearing' };
    t.detectionFilter = foundryFilter;
    expect(t.detectionFilter).toBe(foundryFilter);
  });

  test('is idempotent - installing twice does not double-wrap', () => {
    const t = { document: { id: 'c' }, detectionFilter: null };
    expect(installSoundwaveFilterOverride(t)).toBe(true);
    expect(installSoundwaveFilterOverride(t)).toBe(false);
  });

  test("remove restores a plain data property carrying Foundry's last value", () => {
    const t = { document: { id: 'd' }, detectionFilter: null };
    installSoundwaveFilterOverride(t);
    const foundryFilter = { id: 'foundry-hearing' };
    t.detectionFilter = foundryFilter;
    removeSoundwaveFilterOverride(t);
    expect(Object.getOwnPropertyDescriptor(t, 'detectionFilter').get).toBeUndefined();
    expect(t.detectionFilter).toBe(foundryFilter);
  });

  test('remove restores null for a frozen-observed target (Foundry never set a real filter)', () => {
    const t = { document: { id: 'e' }, detectionFilter: null };
    installSoundwaveFilterOverride(t);
    t.detectionFilter = null;
    removeSoundwaveFilterOverride(t);
    expect(Object.getOwnPropertyDescriptor(t, 'detectionFilter').get).toBeUndefined();
    expect(t.detectionFilter).toBeNull();
  });

  test('clearDuringMoveSoundwaveState removes every override', () => {
    const t1 = { document: { id: 'f1' }, detectionFilter: null };
    const t2 = { document: { id: 'f2' }, detectionFilter: null };
    installSoundwaveFilterOverride(t1);
    installSoundwaveFilterOverride(t2);
    clearDuringMoveSoundwaveState();
    expect(Object.getOwnPropertyDescriptor(t1, 'detectionFilter')?.get).toBeUndefined();
    expect(Object.getOwnPropertyDescriptor(t2, 'detectionFilter')?.get).toBeUndefined();
  });

  test('no-ops for a target without a document id', () => {
    expect(installSoundwaveFilterOverride({})).toBe(false);
    expect(removeSoundwaveFilterOverride({})).toBe(false);
  });
});

describe('settleSoundwaveOverrides (post-move handoff without an observed flash)', () => {
  const mockFilter = { id: 'soundwave-filter' };
  let savedConfig, savedCanvas;
  beforeEach(() => {
    savedConfig = globalThis.CONFIG;
    savedCanvas = globalThis.canvas;
    globalThis.CONFIG = {
      Canvas: {
        detectionModes: { hearing: { constructor: { getDetectionFilter: () => mockFilter } } },
      },
    };
  });
  afterEach(() => {
    clearDuringMoveSoundwaveState();
    globalThis.CONFIG = savedConfig;
    globalThis.canvas = savedCanvas;
  });

  function overriddenTarget(id) {
    const t = { document: { id }, center: { x: 0, y: 0 }, detectionFilter: null };
    installSoundwaveFilterOverride(t);
    return t;
  }
  const isOverridden = (t) => !!Object.getOwnPropertyDescriptor(t, 'detectionFilter')?.get;

  test("hands off once Foundry's own recompute has produced a filter (persisted settled to hidden)", () => {
    const t = overriddenTarget('h1');
    t.visible = true;
    t.renderable = true;
    t.mesh = { visible: false, renderable: false, alpha: 1 };
    t.detectionFilterMesh = { visible: false, renderable: false, alpha: 0 };
    t.detectionFilter = { id: 'foundry-hearing' }; // Foundry settled a real filter
    globalThis.canvas = { tokens: { controlled: [], preview: { children: [] } } };
    settleSoundwaveOverrides();
    expect(isOverridden(t)).toBe(false);
    expect(t.detectionFilter).toEqual({ id: 'foundry-hearing' }); // ripple continues, no flash
    expect(t.mesh).toEqual({ visible: false, renderable: false, alpha: 1 });
    expect(t.detectionFilterMesh).toEqual({ visible: true, renderable: true, alpha: 1 });
  });

  test('keeps the ripple while the target is still out of sight and Foundry has not caught up', () => {
    const t = overriddenTarget('h2');
    const observer = { document: { id: 'o' }, vision: { los: { contains: () => false } } };
    globalThis.canvas = { tokens: { controlled: [observer], preview: { children: [] } } };
    settleSoundwaveOverrides();
    expect(isOverridden(t)).toBe(true); // held so there is no observed flash
    expect(t.detectionFilter).toEqual(mockFilter);
  });

  test('drops the override once the target is back in an observer sight', () => {
    const t = overriddenTarget('h3');
    const observer = { document: { id: 'o' }, vision: { los: { contains: () => true } } };
    globalThis.canvas = { tokens: { controlled: [observer], preview: { children: [] } } };
    settleSoundwaveOverrides();
    expect(isOverridden(t)).toBe(false);
    expect(t.detectionFilter).toBeNull();
  });

  test('restores primary art when an observed target drops its settling soundwave override', () => {
    const t = overriddenTarget('h3-render');
    t.visible = true;
    t.renderable = true;
    t.isVisible = true;
    t.mesh = { visible: false, renderable: false, alpha: 1 };
    t.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    const observer = {
      document: { id: 'o' },
      vision: { los: { contains: () => true } },
    };
    globalThis.canvas = { tokens: { controlled: [observer], preview: { children: [] } } };

    settleSoundwaveOverrides();

    expect(isOverridden(t)).toBe(false);
    expect(t.detectionFilter).toBeNull();
    expect(t.mesh).toEqual({ visible: true, renderable: true, alpha: 1 });
    expect(t.detectionFilterMesh).toEqual({ visible: false, renderable: false, alpha: 0 });
  });

  test('Party observer sight does not drop a settling override', () => {
    const t = overriddenTarget('h4');
    const partyObserver = {
      actor: { type: 'party' },
      document: { id: 'party-observer' },
      vision: { los: { contains: () => true } },
    };
    globalThis.canvas = { tokens: { controlled: [partyObserver], preview: { children: [] } } };

    settleSoundwaveOverrides();

    expect(isOverridden(t)).toBe(true);
    expect(t.detectionFilter).toEqual(mockFilter);
  });
});

describe('observerSightContainsTarget (live vision polygon contains the target center)', () => {
  const target = { center: { x: 500, y: 500 } };
  let savedCanvas;
  let savedConfig;
  let savedGame;
  afterEach(() => {
    globalThis.canvas = savedCanvas;
    globalThis.CONFIG = savedConfig;
    globalThis.game = savedGame;
  });
  beforeEach(() => {
    savedCanvas = globalThis.canvas;
    savedConfig = globalThis.CONFIG;
    savedGame = globalThis.game;
    globalThis.canvas = { tokens: { preview: { children: [] } } };
  });

  test('true when the observer vision polygon contains the target center', () => {
    const observer = { vision: { los: { contains: () => true } } };
    expect(observerSightContainsTarget(observer, target)).toBe(true);
  });

  test('false when the observer vision polygon does not contain the target center', () => {
    const observer = { vision: { los: { contains: () => false } } };
    expect(observerSightContainsTarget(observer, target)).toBe(false);
  });

  test('false when geometric LOS remains but Core light perception no longer sees the target', () => {
    const basicSight = { testVisibility: jest.fn(() => false) };
    const lightPerception = { testVisibility: jest.fn(() => false) };
    const observer = {
      document: {
        detectionModes: {
          basicSight: { enabled: true },
          lightPerception: { enabled: true },
        },
      },
      vision: { los: { contains: () => true } },
    };
    const litTarget = {
      center: target.center,
      document: { getVisibilityTestPoints: () => [target.center] },
    };
    globalThis.CONFIG = {
      Canvas: { detectionModes: { basicSight, lightPerception } },
    };
    globalThis.canvas = {
      tokens: { preview: { children: [] } },
      visibility: { _createVisibilityTestConfig: jest.fn(() => ({ tests: [] })) },
    };

    expect(observerSightContainsTarget(observer, litTarget)).toBe(false);
    expect(
      targetShouldShowSoundwave(
        litTarget,
        [observer],
        () => 'observed',
        () => false,
        () => true,
      ),
    ).toBe(true);
  });

  test('prefers the drag preview vision polygon when one exists', () => {
    const observer = { document: { id: 'obs' }, vision: { los: { contains: () => false } } };
    globalThis.canvas = {
      tokens: {
        preview: {
          children: [
            {
              _original: observer,
              document: { id: 'obs' },
              vision: { los: { contains: () => true } },
            },
          ],
        },
      },
    };
    expect(observerSightContainsTarget(observer, target)).toBe(true);
  });

  test('rejects 2D polygon sight when legacy Levels reports a floor collision', () => {
    globalThis.game = {
      ...savedGame,
      modules: new Map([['levels', { active: true }]]),
    };
    globalThis.CONFIG = {
      ...savedConfig,
      Levels: { API: { checkCollision: jest.fn(() => true) } },
    };
    const observer = {
      losHeight: 5,
      vision: { los: { contains: () => true } },
    };
    const otherLevelTarget = {
      center: { x: 500, y: 500 },
      losHeight: 15,
    };

    expect(observerSightContainsTarget(observer, otherLevelTarget)).toBe(false);
  });

  test('does not synthesize a lost-sight soundwave through a legacy Levels floor', () => {
    globalThis.game = {
      ...savedGame,
      modules: new Map([['levels', { active: true }]]),
    };
    globalThis.CONFIG = {
      ...savedConfig,
      Levels: { API: { checkCollision: jest.fn(() => true) } },
    };
    const observer = {
      losHeight: 5,
      vision: { los: { contains: () => false } },
    };
    const otherLevelTarget = {
      center: { x: 500, y: 500 },
      losHeight: 15,
    };

    expect(
      targetShouldShowSoundwave(
        otherLevelTarget,
        [observer],
        () => 'observed',
        () => false,
        () => true,
      ),
    ).toBe(false);
  });
});

describe('refreshSoundwavesForActiveMovement (only mutates during a committed move)', () => {
  let savedCanvas;
  let nowSpy;
  let mockNow;

  async function loadWith({
    pendingMovement,
    avsActiveGivenCombatGate = true,
    gmVisionBypass = false,
    observers = [{ document: { id: 'obs' }, vision: { los: { contains: () => false } } }],
    getObservers = () => (gmVisionBypass ? [] : observers),
    getVisibility = () => 'hidden',
    isHardHidden = () => false,
    enforceControlledLevelTokenRendering = () => false,
    tokenIsOutsideControlledLevelCullingSurface = () => false,
    levelsIntegration = {
      isLegacyActive: false,
      getVerticalDistance: () => 0,
      test3DCollision: () => false,
    },
    visionAnalyzer = null,
    releaseHardHideForLiveSight = (target) => {
      target._pvCurrentViewHardHidden = false;
      if ('visible' in target) target.visible = true;
      if ('renderable' in target) target.renderable = true;
      if (target.mesh) {
        if ('visible' in target.mesh) target.mesh.visible = true;
        if ('renderable' in target.mesh) target.mesh.renderable = true;
        if ('alpha' in target.mesh) target.mesh.alpha = 1;
      }
      return true;
    },
  }) {
    let mod;
    await jest.isolateModulesAsync(async () => {
      jest.doMock('../../../scripts/services/movement-tracking.js', () => ({
        hasActivePendingTokenMovement: () => pendingMovement,
      }));
      jest.doMock('../../../scripts/services/Detection/current-view-hard-hide.js', () => ({
        currentViewVisionerObserversForTarget: getObservers,
        releaseCurrentViewHardHideForLiveSight: releaseHardHideForLiveSight,
        targetIsHardHiddenFromCurrentView: isHardHidden,
      }));
      jest.doMock('../../../scripts/services/Detection/detection-visibility-context.js', () => ({
        getVisionerVisibilityBetweenTokens: getVisibility,
        isAvsActiveGivenCombatGate: () => avsActiveGivenCombatGate,
      }));
      jest.doMock('../../../scripts/services/gm-vision-bypass.js', () => ({
        shouldBypassAvsForGmVision: () => gmVisionBypass,
      }));
      jest.doMock('../../../scripts/services/Detection/multi-level-control-view.js', () => ({
        enforceControlledLevelTokenRendering,
        tokenIsOutsideControlledLevelCullingSurface,
      }));
      jest.doMock('../../../scripts/services/LevelsIntegration.js', () => ({
        LevelsIntegration: { getInstance: () => levelsIntegration },
      }));
      jest.doMock('../../../scripts/visibility/auto-visibility/VisionAnalyzer.js', () => ({
        VisionAnalyzer: { getInstance: () => visionAnalyzer },
      }));
      mod = await import('../../../scripts/services/during-move-soundwave.js');
    });
    return mod;
  }

  function makeTarget() {
    return {
      controlled: false,
      center: { x: 100, y: 100 },
      detectionFilter: 'PRE-EXISTING',
      detectionFilterMesh: { visible: false, renderable: false, alpha: 0 },
      document: { id: 't' },
    };
  }

  beforeEach(() => {
    savedCanvas = globalThis.canvas;
    mockNow = 0;
    nowSpy = jest.spyOn(globalThis.performance, 'now').mockImplementation(() => {
      mockNow += 10000;
      return mockNow;
    });
  });
  afterEach(() => {
    globalThis.canvas = savedCanvas;
    jest.resetModules();
    nowSpy.mockRestore();
  });

  test('leaves soundwaves frozen while only hold-dragging (no pending movement)', async () => {
    const target = makeTarget();
    globalThis.canvas = { tokens: { placeables: [target], preview: { children: [] } } };
    const mod = await loadWith({ pendingMovement: false });

    mod.refreshSoundwavesForActiveMovement();

    expect(target.detectionFilter).toBe('PRE-EXISTING');
    expect(target.detectionFilterMesh.visible).toBe(false);
  });

  test('updates soundwaves during a committed move (pending movement active)', async () => {
    const target = makeTarget();
    globalThis.canvas = { tokens: { placeables: [target], preview: { children: [] } } };
    const mod = await loadWith({ pendingMovement: true });

    mod.refreshSoundwavesForActiveMovement();

    expect(target.detectionFilterMesh.visible).toBe(true);
  });

  test('skips observer discovery inside the expensive-decision throttle window', async () => {
    const target = makeTarget();
    const getObservers = jest.fn(() => [
      { document: { id: 'obs' }, vision: { los: { contains: () => false } } },
    ]);
    globalThis.canvas = { tokens: { placeables: [target], preview: { children: [] } } };
    const mod = await loadWith({ pendingMovement: true, getObservers });

    nowSpy.mockReturnValue(10_000);
    mod.refreshSoundwavesForActiveMovement();
    getObservers.mockClear();
    mod.refreshSoundwavesForActiveMovement();

    expect(getObservers).not.toHaveBeenCalled();
  });

  test('keeps the Core filter source renderable when reasserting a soundwave', async () => {
    const savedConfig = globalThis.CONFIG;
    globalThis.CONFIG = {
      Canvas: { detectionModes: { hearing: { constructor: { getDetectionFilter: () => ({}) } } } },
    };
    const target = makeTarget();
    target.detectionFilter = null;
    globalThis.canvas = { tokens: { placeables: [target], preview: { children: [] } } };
    const mod = await loadWith({ pendingMovement: true });

    mod.refreshSoundwavesForActiveMovement();

    target.visible = false;
    target.renderable = false;
    target.mesh = { visible: false, renderable: false };
    target.detectionFilterMesh = { visible: false, renderable: false, alpha: 0 };
    nowSpy.mockReturnValue(10001);
    mod.refreshSoundwavesForActiveMovement();

    expect(target).toMatchObject({
      visible: true,
      renderable: true,
      mesh: { visible: true, renderable: true },
    });
    expect(target.detectionFilterMesh).toEqual({ visible: true, renderable: true, alpha: 1 });
    globalThis.CONFIG = savedConfig;
  });

  test('keeps a previously-heard controlled mover full art through the drag gap', async () => {
    const savedConfig = globalThis.CONFIG;
    const soundwaveFilter = {};
    globalThis.CONFIG = {
      Canvas: {
        detectionModes: {
          hearing: { constructor: { getDetectionFilter: () => soundwaveFilter } },
        },
      },
    };
    const target = makeTarget();
    target.controlled = false;
    target.detectionFilter = soundwaveFilter;
    target.visible = true;
    target.renderable = true;
    target.mesh = { visible: true, renderable: true };
    globalThis.canvas = {
      tokens: { placeables: [target], preview: { children: [] }, _draggedToken: target },
    };
    const mod = await loadWith({ pendingMovement: false });
    mod.rememberSoundwaveDetectionBeforeCoreRefresh(target);

    target.controlled = true;
    target.detectionFilter = null;
    mod.refreshSoundwavesForActiveMovement();

    expect(target.detectionFilter).toBeNull();
    expect(target).toMatchObject({
      visible: true,
      renderable: true,
      mesh: { visible: true, renderable: true },
      detectionFilterMesh: { visible: false, renderable: false, alpha: 0 },
    });
    globalThis.CONFIG = savedConfig;
  });

  test('plain selection of a previously-heard token keeps its primary art renderable', async () => {
    const savedConfig = globalThis.CONFIG;
    const soundwaveFilter = {};
    globalThis.CONFIG = {
      Canvas: {
        detectionModes: {
          hearing: { constructor: { getDetectionFilter: () => soundwaveFilter } },
        },
      },
    };
    const target = makeTarget();
    target.detectionFilter = soundwaveFilter;
    target.mesh = { visible: true, renderable: true };
    globalThis.canvas = { tokens: { placeables: [target], preview: { children: [] } } };
    const mod = await loadWith({ pendingMovement: false });
    mod.rememberSoundwaveDetectionBeforeCoreRefresh(target);

    target.controlled = true;
    target.detectionFilter = null;
    mod.refreshSoundwavesForActiveMovement();

    expect(target.detectionFilter).toBeNull();
    expect(target.mesh).toEqual({ visible: true, renderable: true });
    globalThis.CONFIG = savedConfig;
  });

  test('preserves an existing core soundwave when geometric LOS crosses complete darkness', async () => {
    const savedConfig = globalThis.CONFIG;
    const soundwaveFilter = {};
    globalThis.CONFIG = {
      Canvas: {
        detectionModes: {
          hearing: { constructor: { getDetectionFilter: () => soundwaveFilter } },
        },
      },
    };
    const target = makeTarget();
    target.detectionFilter = soundwaveFilter;
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    target.mesh = { visible: true, renderable: true };
    const observers = [
      {
        document: { id: 'obs' },
        vision: {
          blinded: { darkness: true },
          los: { contains: () => true },
        },
      },
    ];
    globalThis.canvas = { tokens: { placeables: [target], preview: { children: [] } } };
    const mod = await loadWith({
      pendingMovement: true,
      observers,
      getVisibility: () => 'hidden',
    });

    mod.refreshSoundwavesForActiveMovement();

    expect(target.detectionFilter).toBe(soundwaveFilter);
    expect(target.mesh).toEqual({ visible: true, renderable: true });
    expect(target.detectionFilterMesh).toEqual({ visible: true, renderable: true, alpha: 1 });
    globalThis.CONFIG = savedConfig;
  });

  test('preserves Core hearing when effective visual detection fails despite geometric LOS', async () => {
    const savedConfig = globalThis.CONFIG;
    const soundwaveFilter = {};
    const basicSight = { testVisibility: jest.fn(() => false) };
    const lightPerception = { testVisibility: jest.fn(() => false) };
    globalThis.CONFIG = {
      Canvas: {
        detectionModes: {
          basicSight,
          lightPerception,
          hearing: { constructor: { getDetectionFilter: () => soundwaveFilter } },
        },
      },
    };
    const target = makeTarget();
    target.detectionFilter = soundwaveFilter;
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    target.mesh = { visible: true, renderable: false };
    const observers = [
      {
        document: {
          id: 'obs',
          detectionModes: {
            basicSight: { enabled: true },
            lightPerception: { enabled: true },
          },
        },
        vision: { los: { contains: () => true } },
      },
    ];
    globalThis.canvas = {
      tokens: { placeables: [target], preview: { children: [] } },
      visibility: { _createVisibilityTestConfig: jest.fn(() => ({ tests: [] })) },
    };
    const mod = await loadWith({
      pendingMovement: true,
      observers,
      getVisibility: () => 'hidden',
    });
    mod.installSoundwaveFilterOverride(target);

    mod.refreshSoundwavesForActiveMovement();

    expect(target.detectionFilter).toBe(soundwaveFilter);
    expect(target.mesh).toEqual({ visible: true, renderable: true });
    expect(target.detectionFilterMesh).toEqual({ visible: true, renderable: true, alpha: 1 });
    globalThis.CONFIG = savedConfig;
  });

  test('protects an existing core soundwave from the next movement repaint inside the throttle window', async () => {
    const savedConfig = globalThis.CONFIG;
    const soundwaveFilter = {};
    globalThis.CONFIG = {
      Canvas: {
        detectionModes: {
          hearing: { constructor: { getDetectionFilter: () => soundwaveFilter } },
        },
      },
    };
    const target = makeTarget();
    target.detectionFilter = soundwaveFilter;
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    target.mesh = { visible: false, renderable: false };
    const observers = [
      { document: { id: 'obs' }, vision: { los: { contains: () => false } } },
    ];
    globalThis.canvas = { tokens: { placeables: [target], preview: { children: [] } } };
    const mod = await loadWith({
      pendingMovement: true,
      observers,
      getVisibility: () => 'hidden',
      gmVisionBypass: false,
    });
    nowSpy.mockReturnValueOnce(10_000).mockReturnValue(10_001);

    mod.refreshSoundwavesForActiveMovement();

    target.detectionFilter = null;
    target.detectionFilterMesh = { visible: false, renderable: false, alpha: 0 };
    mod.refreshSoundwavesForActiveMovement();

    expect(target.detectionFilter).toBe(soundwaveFilter);
    expect(target.detectionFilterMesh).toEqual({ visible: true, renderable: true, alpha: 1 });
    globalThis.CONFIG = savedConfig;
  });

  test('drops a stale core soundwave when effective LOS now sees the target', async () => {
    const savedConfig = globalThis.CONFIG;
    const soundwaveFilter = {};
    globalThis.CONFIG = {
      Canvas: {
        detectionModes: {
          hearing: { constructor: { getDetectionFilter: () => soundwaveFilter } },
        },
      },
    };
    const target = makeTarget();
    target.visible = true;
    target.renderable = true;
    target.isVisible = true;
    target.detectionFilter = soundwaveFilter;
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    target.mesh = { visible: false, renderable: false, alpha: 1 };
    const observers = [{ document: { id: 'obs' }, vision: { los: { contains: () => true } } }];
    globalThis.canvas = { tokens: { placeables: [target], preview: { children: [] } } };
    const mod = await loadWith({
      pendingMovement: true,
      observers,
      getVisibility: () => 'hidden',
    });
    mod.installSoundwaveFilterOverride(target);

    mod.refreshSoundwavesForActiveMovement();

    expect(target.detectionFilter).toBeNull();
    expect(target.mesh).toEqual({ visible: true, renderable: true, alpha: 1 });
    expect(target.detectionFilterMesh).toEqual({ visible: false, renderable: false, alpha: 0 });
    globalThis.CONFIG = savedConfig;
  });

  test('does not reveal primary art when no observer has live sight and no soundwave applies', async () => {
    const releaseHardHideForLiveSight = jest.fn((target) => {
      target.visible = true;
      target.renderable = true;
      target.mesh.visible = true;
      target.mesh.renderable = true;
      return true;
    });
    const target = makeTarget();
    target.visible = false;
    target.renderable = false;
    target.isVisible = false;
    target.detectionFilter = null;
    target.mesh = { visible: false, renderable: false, alpha: 1 };
    const observers = [{ document: { id: 'obs' }, vision: { los: { contains: () => false } } }];
    globalThis.canvas = { tokens: { placeables: [target], preview: { children: [] } } };
    const mod = await loadWith({
      pendingMovement: true,
      observers,
      getVisibility: () => 'observed',
      releaseHardHideForLiveSight,
    });

    mod.refreshSoundwavesForActiveMovement();

    expect(releaseHardHideForLiveSight).not.toHaveBeenCalled();
    expect(target).toMatchObject({
      visible: false,
      renderable: false,
      mesh: { visible: false, renderable: false },
      detectionFilterMesh: { visible: false, renderable: false, alpha: 0 },
    });
  });

  test('does not release a hidden other-level token from 2D sight alone', async () => {
    const releaseHardHideForLiveSight = jest.fn();
    const observer = {
      document: { id: 'obs' },
      vision: { los: { contains: () => true } },
    };
    const target = makeTarget();
    target.visible = false;
    target.renderable = false;
    target.isVisible = false;
    target.detectionFilter = null;
    target.mesh = { visible: false, renderable: false, alpha: 1 };
    globalThis.canvas = { tokens: { placeables: [target], preview: { children: [] } } };
    const mod = await loadWith({
      pendingMovement: true,
      observers: [observer],
      getVisibility: () => 'undetected',
      levelsIntegration: {
        isLegacyActive: true,
        getVerticalDistance: () => 10,
        test3DCollision: () => true,
      },
      releaseHardHideForLiveSight,
    });

    mod.refreshSoundwavesForActiveMovement();

    expect(releaseHardHideForLiveSight).not.toHaveBeenCalled();
    expect(target).toMatchObject({
      visible: false,
      renderable: false,
      mesh: { visible: false, renderable: false },
    });
  });

  test('re-evaluates an active soundwave when stored undetected hard-hide lags live LOS', async () => {
    const savedConfig = globalThis.CONFIG;
    const soundwaveFilter = {};
    globalThis.CONFIG = {
      Canvas: {
        detectionModes: {
          hearing: { constructor: { getDetectionFilter: () => soundwaveFilter } },
        },
      },
    };
    let seesTarget = false;
    let hardHidden = false;
    const observer = {
      document: { id: 'obs' },
      vision: { los: { contains: () => seesTarget } },
    };
    const target = makeTarget();
    target.visible = true;
    target.renderable = true;
    target.isVisible = true;
    target.detectionFilter = null;
    target.mesh = { visible: true, renderable: true, alpha: 1 };
    globalThis.canvas = { tokens: { placeables: [target], preview: { children: [] } } };
    const mod = await loadWith({
      pendingMovement: true,
      observers: [observer],
      getVisibility: () => (hardHidden ? 'undetected' : 'hidden'),
      isHardHidden: () => hardHidden,
    });

    mod.refreshSoundwavesForActiveMovement();
    expect(target.detectionFilter).toBe(soundwaveFilter);

    hardHidden = true;
    seesTarget = true;
    mod.refreshSoundwavesForActiveMovement();

    expect(target.detectionFilter).toBeNull();
    expect(target.mesh).toEqual({ visible: true, renderable: true, alpha: 1 });
    expect(target.detectionFilterMesh).toEqual({ visible: false, renderable: false, alpha: 0 });
    globalThis.CONFIG = savedConfig;
  });

  test('leaves Core movement visibility on the controlled token untouched', async () => {
    const target = makeTarget();
    target.controlled = true;
    target.visible = false;
    target.renderable = false;
    target.mesh = { visible: false, renderable: false };
    target.detectionFilter = null;
    globalThis.canvas = {
      tokens: { placeables: [target], preview: { children: [] } },
    };
    const mod = await loadWith({ pendingMovement: true });

    mod.refreshSoundwavesForActiveMovement();

    expect(target).toMatchObject({
      visible: false,
      renderable: false,
      mesh: { visible: false, renderable: false },
      detectionFilter: null,
      detectionFilterMesh: { visible: false, renderable: false, alpha: 0 },
    });
  });

  test('does not repaint an active soundwave over another-level token suppressed by Core', async () => {
    const savedConfig = globalThis.CONFIG;
    const soundwaveFilter = {};
    globalThis.CONFIG = {
      Canvas: {
        detectionModes: {
          hearing: { constructor: { getDetectionFilter: () => soundwaveFilter } },
        },
      },
    };
    const target = makeTarget();
    target.visible = false;
    target.renderable = false;
    target.mesh = { visible: false, renderable: false };
    const enforceLevelSuppression = jest.fn((token) => {
      if (token !== target) return false;
      token.visible = false;
      token.renderable = false;
      token.mesh.visible = false;
      token.mesh.renderable = false;
      token.detectionFilterMesh.visible = false;
      token.detectionFilterMesh.renderable = false;
      token.detectionFilterMesh.alpha = 0;
      return true;
    });
    globalThis.canvas = { tokens: { placeables: [target], preview: { children: [] } } };
    const mod = await loadWith({
      pendingMovement: true,
      enforceControlledLevelTokenRendering: enforceLevelSuppression,
    });
    mod.installSoundwaveFilterOverride(target);

    mod.refreshSoundwavesForActiveMovement();

    expect(enforceLevelSuppression).toHaveBeenCalledWith(target);
    expect(target).toMatchObject({
      visible: false,
      renderable: false,
      mesh: { visible: false, renderable: false },
      detectionFilterMesh: { visible: false, renderable: false, alpha: 0 },
    });
    globalThis.CONFIG = savedConfig;
  });

  test('leaves moving preview clone visibility to Core', async () => {
    const savedConfig = globalThis.CONFIG;
    const soundwaveFilter = {};
    globalThis.CONFIG = {
      Canvas: {
        detectionModes: {
          hearing: { constructor: { getDetectionFilter: () => soundwaveFilter } },
        },
      },
    };
    const target = makeTarget();
    target.detectionFilter = soundwaveFilter;
    target.mesh = { visible: true, renderable: true };
    const preview = {
      ...makeTarget(),
      _original: target,
      detectionFilter: null,
      visible: false,
      renderable: false,
      mesh: { visible: false, renderable: false },
    };
    globalThis.canvas = {
      tokens: { placeables: [target], preview: { children: [preview] } },
    };
    const mod = await loadWith({ pendingMovement: false });
    mod.rememberSoundwaveDetectionBeforeCoreRefresh(target);

    target.controlled = true;
    target.detectionFilter = null;
    mod.refreshSoundwavesForActiveMovement();

    expect(preview.detectionFilter).toBeNull();
    expect(preview).toMatchObject({
      visible: false,
      renderable: false,
      mesh: { visible: false, renderable: false },
      detectionFilterMesh: { visible: false, renderable: false, alpha: 0 },
    });
    globalThis.CONFIG = savedConfig;
  });

  test('GM vision bypass paints no soundwaves and clears existing ones during move', async () => {
    const target = makeTarget();
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    globalThis.canvas = { tokens: { placeables: [target], preview: { children: [] } } };
    const mod = await loadWith({ pendingMovement: true, gmVisionBypass: true });

    mod.refreshSoundwavesForActiveMovement();

    expect(target.detectionFilter).toBeNull();
    expect(target.detectionFilterMesh).toEqual({ visible: false, renderable: false, alpha: 0 });
  });

  test('GM vision bypass clears a core-repainted soundwave inside the recompute throttle window', async () => {
    const target = makeTarget();
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    globalThis.canvas = { tokens: { placeables: [target], preview: { children: [] } } };
    const mod = await loadWith({ pendingMovement: true, gmVisionBypass: true });

    mod.refreshSoundwavesForActiveMovement();

    target.detectionFilter = 'CORE-REPAINTED';
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    nowSpy.mockReturnValue(10001);
    mod.refreshSoundwavesForActiveMovement();

    expect(target.detectionFilter).toBeNull();
    expect(target.detectionFilterMesh).toEqual({ visible: false, renderable: false, alpha: 0 });
  });

  test('GM vision bypass clears an explicit hidden pair soundwave during movement', async () => {
    const target = makeTarget();
    target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    target.document.getFlag = (_moduleId, key) =>
      key === 'avs-override-from-obs' ? { state: 'hidden', source: 'manual_action' } : null;
    globalThis.canvas = { tokens: { placeables: [target], preview: { children: [] } } };
    const mod = await loadWith({ pendingMovement: true, gmVisionBypass: true });

    mod.refreshSoundwavesForActiveMovement();

    expect(target.detectionFilter).toBeNull();
    expect(target.detectionFilterMesh).toEqual({ visible: false, renderable: false, alpha: 0 });
  });

  test('omits Party observers from visibility lookup', async () => {
    const partyObserver = { actor: { type: 'party' }, document: { id: 'party-observer' } };
    const characterObserver = {
      actor: { type: 'character' },
      document: { id: 'character-observer' },
      vision: { los: { contains: () => false } },
    };
    const target = makeTarget();
    const getVisibility = jest.fn(() => 'hidden');
    globalThis.canvas = { tokens: { placeables: [target], preview: { children: [] } } };
    const mod = await loadWith({
      pendingMovement: true,
      observers: [partyObserver, characterObserver],
      getVisibility,
    });

    mod.refreshSoundwavesForActiveMovement();

    expect(getVisibility).not.toHaveBeenCalledWith(partyObserver, target);
    expect(getVisibility).toHaveBeenCalledWith(characterObserver, target);
  });

  test('omits Party targets from visibility lookup while processing ordinary targets', async () => {
    const observer = {
      actor: { type: 'character' },
      document: { id: 'observer' },
      vision: { los: { contains: () => false } },
    };
    const partyTarget = {
      ...makeTarget(),
      actor: { type: 'party' },
      document: { id: 'party-target' },
    };
    const npcTarget = { ...makeTarget(), actor: { type: 'npc' }, document: { id: 'npc-target' } };
    const getVisibility = jest.fn(() => 'hidden');
    globalThis.canvas = {
      tokens: { placeables: [partyTarget, npcTarget], preview: { children: [] } },
    };
    const mod = await loadWith({ pendingMovement: true, observers: [observer], getVisibility });

    mod.refreshSoundwavesForActiveMovement();

    expect(getVisibility).not.toHaveBeenCalledWith(observer, partyTarget);
    expect(getVisibility).toHaveBeenCalledWith(observer, npcTarget);
  });

  test('clears active soundwaves when only Party observers remain', async () => {
    const savedConfig = globalThis.CONFIG;
    globalThis.CONFIG = {
      Canvas: { detectionModes: { hearing: { constructor: { getDetectionFilter: () => ({}) } } } },
    };
    const characterObserver = {
      actor: { type: 'character' },
      document: { id: 'character-observer' },
      vision: { los: { contains: () => false } },
    };
    const observers = [characterObserver];
    const target = makeTarget();
    target.detectionFilter = null;
    globalThis.canvas = { tokens: { placeables: [target], preview: { children: [] } } };
    const mod = await loadWith({ pendingMovement: true, observers });

    mod.refreshSoundwavesForActiveMovement();
    expect(Object.getOwnPropertyDescriptor(target, 'detectionFilter').get).toBeDefined();
    expect(target.detectionFilterMesh.visible).toBe(true);

    observers.splice(0, 1, { actor: { type: 'party' }, document: { id: 'party-observer' } });
    mod.refreshSoundwavesForActiveMovement();

    expect(Object.getOwnPropertyDescriptor(target, 'detectionFilter').get).toBeUndefined();
    expect(target.detectionFilter).toBeNull();
    expect(target.detectionFilterMesh).toEqual({ visible: false, renderable: false, alpha: 0 });
    globalThis.CONFIG = savedConfig;
  });

  test('protects an existing soundwave during movement outside the AVS combat gate', async () => {
    const savedConfig = globalThis.CONFIG;
    const savedRaf = globalThis.requestAnimationFrame;
    const soundwaveFilter = {};
    const rafCallbacks = [];
    let mod;
    try {
      globalThis.CONFIG = {
        Canvas: {
          detectionModes: {
            hearing: { constructor: { getDetectionFilter: () => soundwaveFilter } },
          },
        },
      };
      globalThis.requestAnimationFrame = jest.fn((callback) => rafCallbacks.push(callback));
      const target = makeTarget();
      target.detectionFilter = soundwaveFilter;
      target.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
      target.mesh = { visible: false, renderable: false };
      globalThis.canvas = {
        scene: { tokenVision: true },
        tokens: { placeables: [target], preview: { children: [] } },
      };
      mod = await loadWith({ pendingMovement: true, avsActiveGivenCombatGate: false });

      mod.ensureDuringMoveSoundwaveRefresh();

      expect(rafCallbacks).toHaveLength(1);
      target.detectionFilter = null;
      target.detectionFilterMesh.visible = false;
      target.detectionFilterMesh.renderable = false;
      target.detectionFilterMesh.alpha = 0;
      nowSpy.mockReturnValue(1);
      rafCallbacks.shift()();

      expect(target.detectionFilter).toBe(soundwaveFilter);
      expect(target.mesh).toEqual({ visible: true, renderable: true });
      expect(target.detectionFilterMesh).toEqual({ visible: true, renderable: true, alpha: 1 });
    } finally {
      mod?.clearDuringMoveSoundwaveState();
      globalThis.requestAnimationFrame = savedRaf;
      globalThis.CONFIG = savedConfig;
    }
  });
});

describe('ensureDuringMoveSoundwaveRefresh (avsOnlyInCombat gate)', () => {
  async function loadWith({ avsActiveGivenCombatGate }) {
    let mod;
    await jest.isolateModulesAsync(async () => {
      jest.doMock('../../../scripts/services/movement-tracking.js', () => ({
        hasActivePendingTokenMovement: () => false,
      }));
      jest.doMock('../../../scripts/services/Detection/current-view-hard-hide.js', () => ({
        currentViewVisionerObserversForTarget: () => [],
        targetIsHardHiddenFromCurrentView: () => false,
      }));
      jest.doMock('../../../scripts/services/Detection/detection-visibility-context.js', () => ({
        getVisionerVisibilityBetweenTokens: () => 'observed',
        isAvsActiveGivenCombatGate: () => avsActiveGivenCombatGate,
      }));
      jest.doMock('../../../scripts/services/gm-vision-bypass.js', () => ({
        shouldBypassAvsForGmVision: () => false,
      }));
      mod = await import('../../../scripts/services/during-move-soundwave.js');
    });
    return mod;
  }

  afterEach(() => {
    jest.resetModules();
  });

  test('does not start the soundwave render loop when out of the combat gate', async () => {
    const raf = jest.fn();
    const savedRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = raf;

    const mod = await loadWith({ avsActiveGivenCombatGate: false });
    mod.ensureDuringMoveSoundwaveRefresh();

    expect(raf).not.toHaveBeenCalled();
    globalThis.requestAnimationFrame = savedRaf;
  });

  test('starts the soundwave render loop when the combat gate is active', async () => {
    const raf = jest.fn();
    const savedRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = raf;

    const mod = await loadWith({ avsActiveGivenCombatGate: true });
    mod.ensureDuringMoveSoundwaveRefresh();

    expect(raf).toHaveBeenCalledTimes(1);
    globalThis.requestAnimationFrame = savedRaf;
  });
});
