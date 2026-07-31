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

  it('does not re-hide a target that applyCurrentViewHardHide already revealed earlier in the same nested refresh', () => {
    const token = foundryHiddenTarget();

    // Prior ticks already hard-hid it while undetected (mirrors a real move in progress).
    __setStoredVisibilityForTest(new Map([['obs:t', 'undetected']]));
    applyCurrentViewHardHide(token);
    expect(token.visible).toBe(false);
    expect(token._pvCurrentViewHardHidden).toBe(true);

    // Visibility settles to observed mid-move (e.g. the drag brought it back into view).
    __setStoredVisibilityForTest(new Map([['obs:t', 'observed']]));

    // Foundry's own _applyRenderFlags calls _refreshVisibility internally - both are wrapped,
    // so afterCoreRefresh runs twice for the same tick: once nested (inner), once outer.
    wrapTokenApplyRenderFlags.call(token, function outerCoreRefresh() {
      wrapTokenRefreshVisibility.call(token, function innerCoreRefresh() {
        token.visible = true;
        token.mesh.visible = true;
      });
    });

    expect(token.visible).toBe(true);
    expect(token.mesh.visible).toBe(true);
    expect(token._pvCurrentViewHardHidden).toBe(false);
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
});
