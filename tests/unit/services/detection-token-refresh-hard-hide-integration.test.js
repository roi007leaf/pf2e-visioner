import '../../setup.js';

jest.mock('../../../scripts/services/gm-vision-bypass.js', () => ({
  shouldBypassAvsForGmVision: jest.fn(() => false),
}));
jest.mock('../../../scripts/services/Detection/select-all-token-visibility-bypass.js', () => ({
  isSelectAllTokenVisibilityBypassActive: jest.fn(() => false),
}));
jest.mock('../../../scripts/services/movement-tracking.js', () => ({
  hasActivePendingTokenMovement: jest.fn(() => true),
}));

import {
  wrapTokenControl,
  wrapTokenApplyRenderFlags,
  wrapTokenRefreshVisibility,
} from '../../../scripts/services/Detection/detection-token-refresh.js';
import { registerDetectionWrappers } from '../../../scripts/services/Detection/detection-wrapper-registration.js';
import {
  applyCurrentViewHardHide,
  __setStoredVisibilityForTest,
} from '../../../scripts/services/Detection/current-view-hard-hide.js';
import { hasActivePendingTokenMovement } from '../../../scripts/services/movement-tracking.js';

function foundryHiddenTarget() {
  return {
    name: 'Hall of Mirrors',
    controlled: false,
    visible: true,
    renderable: true,
    mesh: { visible: true, renderable: true, alpha: 1 },
    detectionFilter: null,
    document: { id: 't', hidden: true, getFlag: () => null },
    actor: { type: 'npc', itemTypes: { condition: [] } },
  };
}

describe('nested _applyRenderFlags -> _refreshVisibility during a held drag (stale outer "before" snapshot)', () => {
  const observer = { document: { id: 'obs' }, controlled: true };

  beforeEach(() => {
    hasActivePendingTokenMovement.mockReturnValue(true);
    globalThis.game = { ready: true, user: { isGM: true } };
    globalThis.canvas = { tokens: { controlled: [observer], _draggedToken: null } };
  });

  it('keeps a Foundry-hidden target secret across a nested held-drag refresh', () => {
    const token = foundryHiddenTarget();

    // Prior ticks already hard-hid the GM-secret target.
    __setStoredVisibilityForTest(new Map([['obs:t', 'undetected']]));
    applyCurrentViewHardHide(token);
    expect(token.visible).toBe(false);
    expect(token._pvCurrentViewHardHidden).toBe(true);

    // Even if AVS visibility settles to observed, Foundry Hidden remains authoritative.
    __setStoredVisibilityForTest(new Map([['obs:t', 'observed']]));

    // Foundry's own _applyRenderFlags calls _refreshVisibility internally - both are wrapped,
    // so afterCoreRefresh runs twice for the same tick: once nested (inner), once outer.
    wrapTokenApplyRenderFlags.call(token, function outerCoreRefresh() {
      wrapTokenRefreshVisibility.call(token, function innerCoreRefresh() {
        token.visible = true;
        token.mesh.visible = true;
      });
    });

    expect(token.visible).toBe(false);
    expect(token.mesh.visible).toBe(false);
    expect(token._pvCurrentViewHardHidden).toBe(true);
  });
});

describe('multi-level hover visibility refresh ordering', () => {
  const observer = { document: { id: 'obs' }, controlled: true };

  beforeEach(() => {
    hasActivePendingTokenMovement.mockReturnValue(false);
    globalThis.game = { ready: true, user: { isGM: true } };
    globalThis.canvas = {
      scene: {
        levels: new Map([
          ['main', {}],
          ['upper', {}],
        ]),
        getSurfaces: jest.fn(),
        testSurfaceCollision: jest.fn(),
      },
      tokens: { controlled: [observer], _draggedToken: null },
    };
    __setStoredVisibilityForTest(new Map([['obs:t', 'undetected']]));
  });

  it('reasserts hard-hide before a Core hover refresh can paint one visible frame', () => {
    const token = foundryHiddenTarget();
    token.document.hidden = false;
    applyCurrentViewHardHide(token);
    expect(token.mesh.visible).toBe(false);

    wrapTokenRefreshVisibility.call(token, () => {
      token.mesh.visible = true;
    });

    expect(token.mesh.visible).toBe(false);
  });

  it('keeps detection-filter art authoritative when Core hover reveals the primary mesh', () => {
    const token = foundryHiddenTarget();
    token.document.hidden = false;
    applyCurrentViewHardHide(token);

    __setStoredVisibilityForTest(new Map([['obs:t', 'hidden']]));
    token.detectionFilter = { id: 'hidden-placeholder' };
    token.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };

    wrapTokenRefreshVisibility.call(token, () => {
      token.mesh.visible = true;
      token.mesh.renderable = true;
      token.mesh.alpha = 1;
    });

    expect(token.mesh.visible).toBe(false);
    expect(token.mesh.renderable).toBe(false);
    expect(token.detectionFilterMesh.visible).toBe(true);
    expect(token._pvCurrentViewHardHidden).toBe(false);
  });
});

describe('multi-level token selection frame ordering', () => {
  beforeEach(() => {
    hasActivePendingTokenMovement.mockReturnValue(false);
    globalThis.game = { ready: true, user: { isGM: true } };
  });

  it('suppresses other-level token surfaces before Core can paint the first selected frame', () => {
    const selected = {
      controlled: false,
      visible: true,
      renderable: true,
      mesh: { visible: true, renderable: true },
      document: { id: 'selected', level: 'hold', hidden: false, getFlag: () => null },
    };
    const otherLevelToken = {
      controlled: false,
      visible: true,
      renderable: true,
      _testCulled: jest.fn(() => true),
      mesh: { visible: true, renderable: true },
      detectionFilterMesh: { visible: true, renderable: true },
      effects: { visible: true },
      document: { id: 'other-level', level: 'main-deck' },
    };
    const sameLevelToken = {
      controlled: false,
      visible: true,
      renderable: true,
      mesh: { visible: true, renderable: true },
      document: { id: 'same-level', level: 'hold' },
    };
    const sceneView = jest.fn();
    globalThis.canvas = {
      level: { id: 'hold' },
      scene: {
        id: 'genies-smile',
        levels: new Map([
          ['main-deck', { id: 'main-deck', visibility: { levels: new Set() } }],
          ['hold', { id: 'hold', visibility: { levels: new Set() } }],
        ]),
        getSurfaces: jest.fn(),
        testSurfaceCollision: jest.fn(),
        view: sceneView,
      },
      tokens: {
        controlled: [],
        _draggedToken: null,
        placeables: [selected, otherLevelToken, sameLevelToken],
      },
    };

    const coreControl = jest.fn(() => {
      expect(otherLevelToken).toMatchObject({
        visible: false,
        renderable: false,
        mesh: { visible: false, renderable: false },
        detectionFilterMesh: { visible: false, renderable: false },
        effects: { visible: false },
      });
      expect(sameLevelToken).toMatchObject({
        visible: true,
        renderable: true,
        mesh: { visible: true, renderable: true },
      });
      selected.controlled = true;
      globalThis.canvas.tokens.controlled = [selected];
      return selected;
    });

    expect(wrapTokenControl.call(selected, coreControl)).toBe(selected);
    expect(sceneView).not.toHaveBeenCalled();
  });

  it('leaves existing token surfaces to Core when V14 controls a newly created token', () => {
    const created = {
      controlled: false,
      document: { id: 'created', level: 'hold', hidden: false, getFlag: () => null },
    };
    const existing = {
      controlled: false,
      visible: true,
      renderable: true,
      _testCulled: jest.fn(() => true),
      mesh: { visible: true, renderable: true, alpha: 1 },
      document: { id: 'existing', level: 'upper', hidden: false, getFlag: () => null },
    };
    globalThis.canvas = {
      level: { id: 'hold' },
      scene: {
        id: 'restored-keep',
        levels: new Map([
          ['hold', { id: 'hold' }],
          ['upper', { id: 'upper' }],
        ]),
        getSurfaces: jest.fn(),
        testSurfaceCollision: jest.fn(),
      },
      tokens: {
        controlled: [],
        _draggedToken: null,
        placeables: [existing, created],
      },
    };
    const coreControl = jest.fn(() => {
      expect(existing).toMatchObject({
        visible: true,
        renderable: true,
        mesh: { visible: true, renderable: true, alpha: 1 },
      });
      created.controlled = true;
      globalThis.canvas.tokens.controlled = [created];
      return created;
    });

    expect(wrapTokenControl.call(created, coreControl, { isNew: true, releaseOthers: true })).toBe(
      created,
    );
    expect(existing).toMatchObject({
      visible: true,
      renderable: true,
      mesh: { visible: true, renderable: true, alpha: 1 },
    });
  });

  it('keeps Anuithur suppressed through the delayed refresh after Celdar switches to Rootfall', () => {
    const celdar = {
      controlled: true,
      document: { id: 'celdar', level: 'main-deck', hidden: false, getFlag: () => null },
    };
    const rootfall = {
      controlled: false,
      document: { id: 'rootfall', level: 'main-deck', hidden: false, getFlag: () => null },
    };
    const anuithur = {
      controlled: false,
      visible: true,
      renderable: true,
      _testCulled: jest.fn(() => true),
      mesh: { visible: true, renderable: true, alpha: 1 },
      detectionFilter: null,
      document: { id: 'anuithur', level: 'upper-deck', hidden: false, getFlag: () => null },
      actor: { type: 'character', itemTypes: { condition: [] } },
    };
    globalThis.canvas = {
      level: { id: 'main-deck' },
      scene: {
        id: 'genies-smile',
        levels: new Map([
          ['main-deck', { id: 'main-deck' }],
          ['upper-deck', { id: 'upper-deck' }],
        ]),
        getSurfaces: jest.fn(),
        testSurfaceCollision: jest.fn(),
      },
      tokens: {
        controlled: [celdar],
        _draggedToken: null,
        placeables: [celdar, rootfall, anuithur],
      },
    };
    __setStoredVisibilityForTest(new Map([['rootfall:anuithur', 'observed']]));

    wrapTokenControl.call(
      rootfall,
      () => {
        celdar.controlled = false;
        rootfall.controlled = true;
        globalThis.canvas.tokens.controlled = [rootfall];
        return true;
      },
      { releaseOthers: true },
    );
    expect(anuithur.mesh.visible).toBe(false);

    wrapTokenRefreshVisibility.call(anuithur, () => {
      anuithur.visible = true;
      anuithur.renderable = true;
      anuithur.mesh.visible = true;
      anuithur.mesh.renderable = true;
    });

    expect(anuithur.visible).toBe(false);
    expect(anuithur.mesh.visible).toBe(false);

    globalThis.canvas.tokens.controlled = [];
    wrapTokenRefreshVisibility.call(anuithur, () => {
      anuithur.visible = true;
      anuithur.renderable = true;
      anuithur.mesh.visible = true;
      anuithur.mesh.renderable = true;
    });

    expect(anuithur.visible).toBe(true);
    expect(anuithur.mesh.visible).toBe(true);
  });

  it('keeps off-surface Silva visible after Celdar switches to Rootfall', () => {
    const celdar = {
      controlled: true,
      document: { id: 'celdar', level: 'main-deck', hidden: false, getFlag: () => null },
    };
    const rootfall = {
      controlled: false,
      document: { id: 'rootfall', level: 'main-deck', hidden: false, getFlag: () => null },
    };
    const silva = {
      controlled: false,
      visible: true,
      renderable: true,
      _testCulled: jest.fn(() => false),
      center: { x: 1600, y: 900 },
      mesh: { visible: true, renderable: true, alpha: 1 },
      detectionFilter: null,
      document: {
        id: 'silva',
        level: 'upper-deck',
        elevation: 20,
        hidden: false,
        getFlag: () => null,
      },
      actor: { type: 'character', itemTypes: { condition: [] } },
    };
    globalThis.canvas = {
      level: { id: 'main-deck' },
      scene: {
        id: 'genies-smile',
        levels: new Map([
          ['main-deck', { id: 'main-deck' }],
          ['upper-deck', { id: 'upper-deck' }],
        ]),
        getSurfaces: jest.fn(() => []),
        testSurfaceCollision: jest.fn(),
      },
      tokens: {
        controlled: [celdar],
        _draggedToken: null,
        placeables: [celdar, rootfall, silva],
      },
    };
    __setStoredVisibilityForTest(
      new Map([
        ['celdar:silva', 'undetected'],
        ['rootfall:silva', 'undetected'],
      ]),
    );

    wrapTokenControl.call(
      rootfall,
      () => {
        celdar.controlled = false;
        rootfall.controlled = true;
        globalThis.canvas.tokens.controlled = [rootfall];
        // Core exposes Silva during observer handoff because no culling surface covers her.
        silva.visible = true;
        silva.renderable = true;
        silva.mesh.visible = true;
        silva.mesh.renderable = true;
        return true;
      },
      { releaseOthers: true },
    );

    wrapTokenRefreshVisibility.call(silva, () => {
      silva.visible = true;
      silva.renderable = true;
      silva.mesh.visible = true;
      silva.mesh.renderable = true;
    });

    expect(silva.visible).toBe(true);
    expect(silva.renderable).toBe(true);
    expect(silva.mesh.visible).toBe(true);
    expect(silva.mesh.renderable).toBe(true);
  });

  it('keeps an off-surface token visible through repeated movement refreshes', () => {
    const mover = {
      controlled: false,
      document: { id: 'mover', level: 'main-deck', hidden: false, getFlag: () => null },
    };
    const outsideToken = {
      controlled: false,
      visible: true,
      renderable: true,
      _testCulled: jest.fn(() => false),
      center: { x: 1600, y: 900 },
      mesh: { visible: true, renderable: true, alpha: 1 },
      detectionFilter: null,
      document: {
        id: 'outside',
        level: 'upper-deck',
        elevation: 20,
        hidden: false,
        getFlag: () => null,
      },
      actor: { type: 'character', itemTypes: { condition: [] } },
    };
    const getSurfaces = jest.fn(() => []);
    globalThis.canvas = {
      level: { id: 'main-deck' },
      scene: {
        id: 'genies-smile',
        levels: new Map([
          ['main-deck', { id: 'main-deck' }],
          ['upper-deck', { id: 'upper-deck' }],
        ]),
        getSurfaces,
        testSurfaceCollision: jest.fn(),
      },
      tokens: {
        controlled: [],
        _draggedToken: null,
        placeables: [mover, outsideToken],
      },
    };

    wrapTokenControl.call(
      mover,
      () => {
        mover.controlled = true;
        globalThis.canvas.tokens.controlled = [mover];
        return true;
      },
      { releaseOthers: true },
    );
    hasActivePendingTokenMovement.mockReturnValue(true);

    const movementFrames = [];
    for (let frame = 0; frame < 6; frame += 1) {
      wrapTokenRefreshVisibility.call(outsideToken, () => {
        outsideToken.visible = true;
        outsideToken.renderable = true;
        outsideToken.mesh.visible = true;
        outsideToken.mesh.renderable = true;
      });
      movementFrames.push([outsideToken.visible, outsideToken.mesh.visible]);
    }

    expect(movementFrames).toEqual(Array.from({ length: 6 }, () => [true, true]));
  });

  it('keeps off-surface primary art stable when hover refresh finds a detection filter', () => {
    const mover = {
      controlled: false,
      document: { id: 'mover', level: 'main-deck', hidden: false, getFlag: () => null },
    };
    const outsideToken = {
      controlled: false,
      visible: true,
      renderable: true,
      _testCulled: jest.fn(() => false),
      center: { x: 1600, y: 900 },
      mesh: { visible: true, renderable: true, alpha: 1 },
      detectionFilter: { id: 'transient-hover-filter' },
      detectionFilterMesh: { visible: true, renderable: true, alpha: 1 },
      document: {
        id: 'outside',
        level: 'upper-deck',
        elevation: 20,
        hidden: false,
        getFlag: () => null,
      },
      actor: { type: 'character', itemTypes: { condition: [] } },
    };
    globalThis.canvas = {
      level: { id: 'main-deck' },
      scene: {
        id: 'genies-smile',
        levels: new Map([
          ['main-deck', { id: 'main-deck' }],
          ['upper-deck', { id: 'upper-deck' }],
        ]),
        getSurfaces: jest.fn(() => []),
        testSurfaceCollision: jest.fn(),
      },
      tokens: {
        controlled: [],
        _draggedToken: null,
        placeables: [mover, outsideToken],
      },
    };

    wrapTokenControl.call(
      mover,
      () => {
        mover.controlled = true;
        globalThis.canvas.tokens.controlled = [mover];
        return true;
      },
      { releaseOthers: true },
    );

    wrapTokenRefreshVisibility.call(outsideToken, () => {
      outsideToken.visible = true;
      outsideToken.renderable = true;
      outsideToken.mesh.visible = true;
      outsideToken.mesh.renderable = true;
    });

    expect(outsideToken.visible).toBe(true);
    expect(outsideToken.mesh.visible).toBe(true);
    expect(outsideToken.mesh.renderable).toBe(true);
  });
});

describe('multi-level drag preview vision continuity', () => {
  beforeEach(() => {
    globalThis.game = { ready: true, user: { isGM: true } };
    globalThis.canvas = {
      scene: {
        levels: new Map([
          ['main', {}],
          ['upper', {}],
        ]),
        getSurfaces: jest.fn(),
        testSurfaceCollision: jest.fn(),
      },
      tokens: { controlled: [] },
    };
  });

  it('keeps the original vision source registered through drag-clone initialization and teardown', () => {
    const registered = new Map();
    const libWrapperAdapter = {
      register: jest.fn((_moduleId, target, wrapper) => registered.set(target, wrapper)),
    };
    registerDetectionWrappers({ libWrapperAdapter, foundryGeneration: 14 });
    const initializeSources = registered.get(
      'foundry.canvas.placeables.Token.prototype.initializeSources',
    );
    const sourceId = 'Token.celdar';
    const activeSources = new Map();
    const originalVision = {
      sourceId,
      add: jest.fn(function () {
        activeSources.set(sourceId, this);
      }),
    };
    const original = {
      controlled: true,
      vision: originalVision,
      _isVisionSource: jest.fn(() => true),
    };
    const previewVision = {
      sourceId,
      add() {
        activeSources.set(sourceId, this);
      },
      remove() {
        activeSources.delete(sourceId);
      },
    };
    const preview = { _previewType: 'dragging', _original: original, vision: previewVision };
    const coreInitialize = jest.fn(({ deleted = false } = {}) => {
      if (deleted) previewVision.remove();
      else previewVision.add();
    });
    activeSources.set(sourceId, originalVision);

    initializeSources.call(preview, coreInitialize);

    expect(coreInitialize).toHaveBeenCalledTimes(1);
    expect(original._isVisionSource).toHaveBeenCalledTimes(1);
    expect(originalVision.add).toHaveBeenCalledTimes(1);
    expect(activeSources.get(sourceId)).toBe(originalVision);

    initializeSources.call(preview, coreInitialize, { deleted: true });

    expect(coreInitialize).toHaveBeenLastCalledWith({ deleted: true });
    expect(originalVision.add).toHaveBeenCalledTimes(2);
    expect(activeSources.get(sourceId)).toBe(originalVision);
  });

  it('leaves normal and single-level source initialization entirely to Core', () => {
    const registered = new Map();
    const libWrapperAdapter = {
      register: jest.fn((_moduleId, target, wrapper) => registered.set(target, wrapper)),
    };
    registerDetectionWrappers({ libWrapperAdapter, foundryGeneration: 14 });
    const initializeSources = registered.get(
      'foundry.canvas.placeables.Token.prototype.initializeSources',
    );
    const originalVision = { add: jest.fn() };
    const original = {
      controlled: true,
      vision: originalVision,
      _isVisionSource: jest.fn(() => true),
    };
    const normalToken = { _previewType: null, _original: original };
    const coreInitialize = jest.fn();

    initializeSources.call(normalToken, coreInitialize);
    globalThis.canvas.scene.levels = new Map([['main', {}]]);
    initializeSources.call({ _previewType: 'dragging', _original: original }, coreInitialize);

    expect(coreInitialize).toHaveBeenCalledTimes(2);
    expect(originalVision.add).not.toHaveBeenCalled();
  });
});

describe('Foundry V13 _applyRenderFlags effect-icon ordering', () => {
  const observer = { document: { id: 'obs' }, controlled: true };

  beforeEach(() => {
    hasActivePendingTokenMovement.mockReturnValue(false);
    globalThis.game = { ready: true, user: { isGM: false } };
    globalThis.canvas = { tokens: { controlled: [observer], _draggedToken: null } };
    __setStoredVisibilityForTest(new Map([['obs:t', 'undetected']]));
  });

  it('reasserts hidden effect icons after V13 refreshes effects later in _applyRenderFlags', () => {
    const registered = new Map();
    const libWrapperAdapter = {
      register: jest.fn((_moduleId, target, wrapper) => registered.set(target, wrapper)),
    };
    registerDetectionWrappers({ libWrapperAdapter, foundryGeneration: 13 });

    const refreshVisibility = registered.get(
      'foundry.canvas.placeables.Token.prototype._refreshVisibility',
    );
    const applyRenderFlags = registered.get(
      'foundry.canvas.placeables.Token.prototype._applyRenderFlags',
    );
    const token = {
      controlled: false,
      visible: true,
      renderable: true,
      mesh: { visible: true, renderable: true, alpha: 1 },
      effects: { visible: true },
      detectionFilter: null,
      document: { id: 't', hidden: false, getFlag: () => null },
      actor: { type: 'npc', itemTypes: { condition: [] } },
    };

    const coreApplyRenderFlags = () => {
      refreshVisibility.call(token, () => {});
      // V13 refreshes effect icons after its nested visibility refresh.
      token.effects.visible = true;
    };
    if (applyRenderFlags) applyRenderFlags.call(token, coreApplyRenderFlags);
    else coreApplyRenderFlags();

    expect(applyRenderFlags).toBeDefined();
    expect(token._pvCurrentViewHardHidden).toBe(true);
    expect(token.effects.visible).toBe(false);
  });

  it('hides condition icons when V13 renders only a detection-filter representation', () => {
    __setStoredVisibilityForTest(new Map([['obs:t', 'hidden']]));
    const registered = new Map();
    const libWrapperAdapter = {
      register: jest.fn((_moduleId, target, wrapper) => registered.set(target, wrapper)),
    };
    registerDetectionWrappers({ libWrapperAdapter, foundryGeneration: 13 });

    const refreshVisibility = registered.get(
      'foundry.canvas.placeables.Token.prototype._refreshVisibility',
    );
    const applyRenderFlags = registered.get(
      'foundry.canvas.placeables.Token.prototype._applyRenderFlags',
    );
    const token = {
      controlled: false,
      visible: true,
      renderable: true,
      mesh: { visible: false, renderable: false, alpha: 1 },
      effects: { visible: true },
      detectionFilter: { id: 'soundwave' },
      document: { id: 't', hidden: false, getFlag: () => null },
      actor: { type: 'npc', itemTypes: { condition: [] } },
    };

    applyRenderFlags.call(token, () => {
      refreshVisibility.call(token, () => {});
      token.effects.visible = true;
    });

    expect(token._pvCurrentViewHardHidden).not.toBe(true);
    expect(token.effects.visible).toBe(false);

    __setStoredVisibilityForTest(new Map([['obs:t', 'observed']]));
    token.detectionFilter = null;
    applyRenderFlags.call(token, () => refreshVisibility.call(token, () => {}));

    expect(token.effects.visible).toBe(true);
    expect('_pvLegacyFilteredEffectVisibility' in token).toBe(false);
  });

  it('keeps a Levels-hidden token non-renderable between V13 render passes without delaying LOS reveal', () => {
    __setStoredVisibilityForTest(new Map());
    globalThis.game.modules = new Map([['levels', { active: true }]]);
    globalThis.canvas.scene = {
      flags: {
        levels: {
          sceneLevels: [
            [0, 10],
            [10, 20],
          ],
        },
      },
    };

    const registered = new Map();
    const libWrapperAdapter = {
      register: jest.fn((_moduleId, target, wrapper) => registered.set(target, wrapper)),
    };
    registerDetectionWrappers({ libWrapperAdapter, foundryGeneration: 13 });

    const refreshVisibility = registered.get(
      'foundry.canvas.placeables.Token.prototype._refreshVisibility',
    );
    const applyRenderFlags = registered.get(
      'foundry.canvas.placeables.Token.prototype._applyRenderFlags',
    );
    const token = {
      controlled: false,
      visible: true,
      renderable: true,
      mesh: { visible: true, renderable: true, alpha: 1 },
      detectionFilter: null,
      document: { id: 't', hidden: false, elevation: 20, getFlag: () => null },
      actor: { type: 'npc', itemTypes: { condition: [] } },
    };

    applyRenderFlags.call(token, () => {
      refreshVisibility.call(token, () => {
        // V13 Levels' visibility test settles this token as hidden by the active LOS polygon.
        token.visible = false;
        token.mesh.visible = false;
      });
    });

    expect(token.visible).toBe(false);
    expect(token.renderable).toBe(false);
    expect(token.mesh.renderable).toBe(false);

    applyRenderFlags.call(token, () => {
      refreshVisibility.call(token, () => {
        // The LOS polygon can reveal the token on the very next pass.
        token.visible = true;
        token.mesh.visible = true;
      });
    });

    expect(token.visible).toBe(true);
    expect(token.renderable).toBe(true);
    expect(token.mesh.visible).toBe(true);
    expect(token.mesh.renderable).toBe(true);
  });

  it('preserves V13 renderability outside a configured Levels scene', () => {
    __setStoredVisibilityForTest(new Map());
    globalThis.game.modules = new Map([['levels', { active: true }]]);
    globalThis.canvas.scene = { flags: { levels: { sceneLevels: [] } } };

    const token = {
      controlled: false,
      visible: true,
      renderable: true,
      mesh: { visible: true, renderable: true, alpha: 1 },
      detectionFilter: null,
      document: { id: 't', hidden: false, getFlag: () => null },
      actor: { type: 'npc', itemTypes: { condition: [] } },
    };

    wrapTokenApplyRenderFlags.call(token, () => {
      token.visible = false;
      token.mesh.visible = false;
    });

    expect(token.renderable).toBe(true);
    expect(token.mesh.renderable).toBe(true);
  });

  it('does not install the legacy outer wrapper on V14', () => {
    const registered = new Map();
    const libWrapperAdapter = {
      register: jest.fn((_moduleId, target, wrapper) => registered.set(target, wrapper)),
    };

    registerDetectionWrappers({ libWrapperAdapter, foundryGeneration: 14 });

    expect(registered.has('foundry.canvas.placeables.Token.prototype._applyRenderFlags')).toBe(
      false,
    );
  });
});

describe('elevation tooltip hard-hide ordering', () => {
  const observer = { document: { id: 'obs' }, controlled: true };

  beforeEach(() => {
    hasActivePendingTokenMovement.mockReturnValue(false);
    globalThis.game = { ready: true, user: { isGM: false } };
    globalThis.canvas = { tokens: { controlled: [observer], _draggedToken: null } };
    __setStoredVisibilityForTest(new Map([['obs:t', 'undetected']]));
  });

  it.each([13, 14])('re-hides refreshed elevation text on Foundry V%s', (foundryGeneration) => {
    const registered = new Map();
    const libWrapperAdapter = {
      register: jest.fn((_moduleId, target, wrapper) => registered.set(target, wrapper)),
    };
    registerDetectionWrappers({ libWrapperAdapter, foundryGeneration });

    const refreshTooltip = registered.get(
      'foundry.canvas.placeables.Token.prototype._refreshTooltip',
    );
    const token = {
      controlled: false,
      visible: true,
      renderable: true,
      mesh: { visible: true, renderable: true, alpha: 1 },
      tooltip: { visible: true },
      detectionFilter: null,
      document: { id: 't', hidden: false, getFlag: () => null },
      actor: { type: 'npc', itemTypes: { condition: [] } },
    };

    expect(refreshTooltip).toBeDefined();
    refreshTooltip.call(token, () => {
      token.tooltip = { visible: true };
    });

    expect(token._pvCurrentViewHardHidden).toBe(true);
    expect(token.tooltip.visible).toBe(false);
  });

  it('re-hides elevation text after the V13 outer render pass restores tooltip visibility', () => {
    globalThis.canvas.scene = {
      levels: new Map([
        ['main', {}],
        ['upper', {}],
      ]),
      getSurfaces: jest.fn(),
      testSurfaceCollision: jest.fn(),
    };
    const queuedMicrotasks = [];
    const nativeQueueMicrotask = globalThis.queueMicrotask;
    globalThis.queueMicrotask = jest.fn((callback) => queuedMicrotasks.push(callback));
    const registered = new Map();
    const libWrapperAdapter = {
      register: jest.fn((_moduleId, target, wrapper) => registered.set(target, wrapper)),
    };
    registerDetectionWrappers({ libWrapperAdapter, foundryGeneration: 13 });

    const refreshTooltip = registered.get(
      'foundry.canvas.placeables.Token.prototype._refreshTooltip',
    );
    const applyRenderFlags = registered.get(
      'foundry.canvas.placeables.Token.prototype._applyRenderFlags',
    );
    const token = {
      controlled: false,
      visible: true,
      renderable: true,
      mesh: { visible: true, renderable: true, alpha: 1 },
      tooltip: { visible: true },
      detectionFilter: null,
      document: { id: 't', hidden: false, getFlag: () => null },
      actor: { type: 'npc', itemTypes: { condition: [] } },
    };

    try {
      applyRenderFlags.call(token, () => {
        refreshTooltip.call(token, () => {
          token.tooltip.visible = true;
        });
        expect(token.tooltip.visible).toBe(false);
        token.tooltip.visible = true;
      });

      expect(token._pvCurrentViewHardHidden).toBe(true);
      expect(token.tooltip.visible).toBe(false);
    } finally {
      globalThis.queueMicrotask = nativeQueueMicrotask;
    }
  });
});

describe('player hover guard for Visioner-hidden hazards and loot', () => {
  const observer = { document: { id: 'obs' }, controlled: true };

  beforeEach(() => {
    hasActivePendingTokenMovement.mockReturnValue(false);
    globalThis.game = {
      ready: true,
      release: { generation: 14 },
      user: { isGM: false },
      settings: { get: jest.fn(() => true) },
    };
    globalThis.canvas = {
      scene: { tokenVision: true, getFlag: jest.fn(() => false) },
      tokens: { controlled: [observer], _draggedToken: null },
    };
    __setStoredVisibilityForTest(new Map([['obs:t', 'hidden']]));
  });

  it('registers hover guards as MIXED because hidden tokens intentionally stop the wrapper chain', () => {
    const registered = new Map();
    const libWrapperAdapter = {
      register: jest.fn((_moduleId, target, wrapper, type) => {
        registered.set(target, { wrapper, type });
      }),
    };

    registerDetectionWrappers({ libWrapperAdapter, foundryGeneration: 14 });

    expect(
      registered.get('foundry.canvas.placeables.Token.prototype._canHover')?.type,
    ).toBe('MIXED');
    expect(
      registered.get('foundry.canvas.placeables.Token.prototype._onHoverIn')?.type,
    ).toBe('MIXED');
  });

  it.each([
    [13, 'hazard'],
    [13, 'loot'],
    [14, 'hazard'],
    [14, 'loot'],
  ])('blocks Core hover on V%s for player-hidden %s tokens', (foundryGeneration, actorType) => {
    const registered = new Map();
    const libWrapperAdapter = {
      register: jest.fn((_moduleId, target, wrapper) => registered.set(target, wrapper)),
    };
    registerDetectionWrappers({ libWrapperAdapter, foundryGeneration });

    const canHover = registered.get('foundry.canvas.placeables.Token.prototype._canHover');
    const hoverIn = registered.get('foundry.canvas.placeables.Token.prototype._onHoverIn');
    const coreCanHover = jest.fn(() => true);
    const coreHoverIn = jest.fn(() => true);
    const token = {
      controlled: false,
      _pvCurrentViewHardHidden: true,
      document: { id: 't', hidden: false, getFlag: () => null },
      actor: { type: actorType, itemTypes: { condition: [] } },
    };

    expect(canHover).toBeDefined();
    expect(canHover.call(token, coreCanHover, globalThis.game.user, {})).toBe(false);
    expect(coreCanHover).not.toHaveBeenCalled();
    expect(hoverIn).toBeDefined();
    expect(hoverIn.call(token, coreHoverIn, {}, {})).toBe(false);
    expect(coreHoverIn).not.toHaveBeenCalled();
  });

  it('blocks a hard-hidden token when its actor is unavailable to the player', () => {
    const registered = new Map();
    const libWrapperAdapter = {
      register: jest.fn((_moduleId, target, wrapper) => registered.set(target, wrapper)),
    };
    registerDetectionWrappers({ libWrapperAdapter, foundryGeneration: 14 });

    const canHover = registered.get('foundry.canvas.placeables.Token.prototype._canHover');
    const coreCanHover = jest.fn(() => true);
    const token = {
      controlled: false,
      _pvCurrentViewHardHidden: true,
      document: { id: 't', hidden: false, getFlag: () => null },
      actor: null,
    };

    expect(canHover.call(token, coreCanHover, globalThis.game.user, {})).toBe(false);
    expect(coreCanHover).not.toHaveBeenCalled();
  });

  it('preserves Core hover for observed hazards and GMs', () => {
    const registered = new Map();
    const libWrapperAdapter = {
      register: jest.fn((_moduleId, target, wrapper) => registered.set(target, wrapper)),
    };
    registerDetectionWrappers({ libWrapperAdapter, foundryGeneration: 14 });

    const canHover = registered.get('foundry.canvas.placeables.Token.prototype._canHover');
    const coreCanHover = jest.fn(() => true);
    const token = {
      controlled: false,
      document: { id: 't', hidden: false, getFlag: () => null },
      actor: { type: 'hazard', itemTypes: { condition: [] } },
    };

    __setStoredVisibilityForTest(new Map([['obs:t', 'observed']]));
    expect(canHover.call(token, coreCanHover, globalThis.game.user, {})).toBe(true);
    expect(coreCanHover).toHaveBeenCalledTimes(1);

    globalThis.game.user.isGM = true;
    __setStoredVisibilityForTest(new Map([['obs:t', 'hidden']]));
    expect(canHover.call(token, coreCanHover, globalThis.game.user, {})).toBe(true);
    expect(coreCanHover).toHaveBeenCalledTimes(2);
  });
});
