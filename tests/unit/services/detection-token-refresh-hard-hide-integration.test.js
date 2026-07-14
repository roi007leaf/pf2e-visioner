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
import {
  applyCurrentViewHardHide,
  __setStoredVisibilityForTest,
} from '../../../scripts/services/Detection/current-view-hard-hide.js';

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
