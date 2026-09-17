jest.mock('../../../scripts/services/gm-vision-bypass.js', () => ({
  shouldBypassAvsForGmVision: jest.fn(() => false),
}));

jest.mock('../../../scripts/services/movement-tracking.js', () => ({
  hasActivePendingTokenMovement: jest.fn(() => true),
}));

jest.mock('../../../scripts/services/Detection/current-view-hard-hide.js', () => ({
  applyCurrentViewHardHide: jest.fn(),
  releaseCurrentViewHardHideForLiveSight: jest.fn(),
  observerViewStateForCurrentView: jest.fn(() => null),
  usesCoreMultiLevelSurfaceRendering: jest.fn(() => false),
}));

jest.mock('../../../scripts/services/GmObserverView/gm-observer-view.js', () => ({
  gmObserverView: {
    isActive: jest.fn(() => false),
    beforeCoreTokenRefresh: jest.fn(),
    afterCoreTokenRefresh: jest.fn(),
  },
}));

jest.mock('../../../scripts/services/during-move-soundwave.js', () => ({
  ensureDuringMoveSoundwaveRefresh: jest.fn(),
  refreshSoundwavesForActiveMovement: jest.fn(),
  rememberSoundwaveDetectionBeforeCoreRefresh: jest.fn(),
}));

jest.mock('../../../scripts/services/Detection/multi-level-control-view.js', () => ({
  captureMultiLevelViewBeforeControl: jest.fn(),
  enforceControlledLevelTokenRendering: jest.fn(),
  reassertOtherLevelTokenRenderingSuppression: jest.fn(),
  restoreOtherLevelTokenRenderingSuppression: jest.fn(),
  suppressOtherLevelTokenRenderingBeforeControl: jest.fn(() => null),
  tokenIsOutsideControlledLevelCullingSurface: jest.fn(() => false),
}));

import {
  wrapPrimaryTokenMeshRender,
  wrapTokenControl,
  wrapTokenRefreshVisibility,
} from '../../../scripts/services/Detection/detection-token-refresh.js';
import {
  applyCurrentViewHardHide,
  observerViewStateForCurrentView,
  releaseCurrentViewHardHideForLiveSight,
  usesCoreMultiLevelSurfaceRendering,
} from '../../../scripts/services/Detection/current-view-hard-hide.js';
import { gmObserverView } from '../../../scripts/services/GmObserverView/gm-observer-view.js';
import {
  ensureDuringMoveSoundwaveRefresh,
  refreshSoundwavesForActiveMovement,
  rememberSoundwaveDetectionBeforeCoreRefresh,
} from '../../../scripts/services/during-move-soundwave.js';
import {
  captureMultiLevelViewBeforeControl,
  reassertOtherLevelTokenRenderingSuppression,
  restoreOtherLevelTokenRenderingSuppression,
  suppressOtherLevelTokenRenderingBeforeControl,
} from '../../../scripts/services/Detection/multi-level-control-view.js';
import { hasActivePendingTokenMovement } from '../../../scripts/services/movement-tracking.js';
import { clearAllDetectionFilterVisuals } from '../../../scripts/stores/visibility-map.js';
import { getDetectionSetting } from '../../../scripts/services/Detection/detection-setting-cache.js';

function foundryHiddenToken({ visible = false } = {}) {
  return {
    name: 'Ayles Megesen',
    controlled: false,
    visible,
    renderable: true,
    document: { id: 'target', hidden: true },
    mesh: { visible, renderable: true, alpha: 0.5 },
  };
}

describe('detection token refresh', () => {
  it('restores Visioner-cleared detection container flags when Core resumes hearing', () => {
    globalThis.canvas = { scene: { tokenVision: true }, tokens: {} };
    const token = foundryHiddenToken({ visible: true });
    token.document.hidden = false;
    token.detectionFilter = {};
    token.detectionFilterMesh = { visible: true, renderable: true, alpha: 1 };
    clearAllDetectionFilterVisuals([token]);
    clearAllDetectionFilterVisuals([token]);
    expect(token.detectionFilterMesh).toEqual({ visible: false, renderable: false, alpha: 0 });
    wrapTokenRefreshVisibility.call(token, () => { token.detectionFilter = {}; });
    expect(token.detectionFilterMesh).toEqual({ visible: true, renderable: true, alpha: 1 });
  });
  it('does not enable a detection container disabled outside Visioner', () => {
    const token = foundryHiddenToken({ visible: true });
    token.detectionFilterMesh = { visible: false, renderable: false, alpha: 0 };
    wrapTokenRefreshVisibility.call(token, () => { token.detectionFilter = {}; });
    expect(token.detectionFilterMesh).toEqual({ visible: false, renderable: false, alpha: 0 });
  });

  it('restores the primary render flag when Core clears a multilevel detection filter', () => {
    globalThis.canvas = { scene: { tokenVision: true }, tokens: {} };
    usesCoreMultiLevelSurfaceRendering.mockReturnValue(true);
    hasActivePendingTokenMovement.mockReturnValue(false);
    const token = foundryHiddenToken({ visible: true });
    token.document.hidden = false;
    token.detectionFilter = {};
    wrapTokenRefreshVisibility.call(token, () => {});
    expect(token.mesh.renderable).toBe(false);
    wrapTokenRefreshVisibility.call(token, () => {
      token.detectionFilter = null;
      token.mesh.visible = true;
    });
    expect(token.mesh.renderable).toBe(true);
    expect(token.mesh.visible).toBe(true);
  });
  it('draws only the filtered pass of an unowned detected token, preserving tiles and full-art transitions', () => {
    globalThis.game = { ready: true, user: { isGM: false } };
    const filter = {};
    const token = { document: { documentName: 'Token' }, controlled: false, detectionFilter: filter };
    const mesh = token.mesh = { object: token, filters: null };
    const draw = jest.fn();

    wrapPrimaryTokenMeshRender.call(mesh, draw);
    expect(draw).not.toHaveBeenCalled();
    mesh.filters = [filter];
    wrapPrimaryTokenMeshRender.call(mesh, draw);
    expect(draw).toHaveBeenCalledTimes(1);

    mesh.filters = null;
    token.detectionFilter = null;
    wrapPrimaryTokenMeshRender.call(mesh, draw);
    expect(draw).toHaveBeenCalledTimes(2);
    token.detectionFilter = filter;
    token.controlled = true;
    wrapPrimaryTokenMeshRender.call(mesh, draw);
    expect(draw).toHaveBeenCalledTimes(3);

    mesh.object = { document: { documentName: 'Tile' }, mesh, detectionFilter: filter };
    wrapPrimaryTokenMeshRender.call(mesh, draw);
    expect(draw).toHaveBeenCalledTimes(4);
  });

  beforeEach(() => {
    globalThis.game = { ready: true, user: { isGM: true } };
    hasActivePendingTokenMovement.mockReturnValue(true);
    usesCoreMultiLevelSurfaceRendering.mockReturnValue(false);
    observerViewStateForCurrentView.mockReturnValue(null);
    gmObserverView.isActive.mockReturnValue(false);
    gmObserverView.beforeCoreTokenRefresh.mockClear();
    gmObserverView.afterCoreTokenRefresh.mockClear();
    releaseCurrentViewHardHideForLiveSight.mockClear();
    applyCurrentViewHardHide.mockClear();
    rememberSoundwaveDetectionBeforeCoreRefresh.mockClear();
    refreshSoundwavesForActiveMovement.mockClear();
    ensureDuringMoveSoundwaveRefresh.mockClear();
    suppressOtherLevelTokenRenderingBeforeControl.mockClear();
    reassertOtherLevelTokenRenderingSuppression.mockClear();
    restoreOtherLevelTokenRenderingSuppression.mockClear();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('suppresses a newly visible Foundry-hidden target during GM observer movement', () => {
    const token = foundryHiddenToken();
    const wrapped = jest.fn(() => {
      token.visible = true;
      token.mesh.visible = true;
    });

    wrapTokenRefreshVisibility.call(token, wrapped);

    expect(token.visible).toBe(false);
    expect(token.renderable).toBe(true);
    expect(token.mesh).toEqual({ visible: false, renderable: true, alpha: 0.5 });
    expect(applyCurrentViewHardHide).toHaveBeenCalledWith(token);
  });

  it('hard-hides multi-level visuals synchronously and coalesces the settle pass', () => {
    usesCoreMultiLevelSurfaceRendering.mockReturnValue(true);
    const queued = [];
    jest
      .spyOn(globalThis, 'queueMicrotask')
      .mockImplementation((callback) => queued.push(callback));
    const token = foundryHiddenToken({ visible: true });
    const wrapped = jest.fn();

    wrapTokenRefreshVisibility.call(token, wrapped);
    wrapTokenRefreshVisibility.call(token, wrapped);

    expect(wrapped).toHaveBeenCalledTimes(2);
    expect(applyCurrentViewHardHide).toHaveBeenCalledTimes(2);
    expect(applyCurrentViewHardHide).toHaveBeenCalledWith(token);
    expect(queued).toHaveLength(1);

    queued[0]();
    expect(applyCurrentViewHardHide).toHaveBeenCalledTimes(3);
  });

  it('keeps an already-visible GM ghost visible during movement', () => {
    const token = foundryHiddenToken({ visible: true });
    const wrapped = jest.fn();

    wrapTokenRefreshVisibility.call(token, wrapped);

    expect(token.visible).toBe(true);
    expect(token.mesh.visible).toBe(true);
  });

  it('allows core to reveal the target when no movement is active', () => {
    hasActivePendingTokenMovement.mockReturnValue(false);
    const token = foundryHiddenToken();
    const wrapped = jest.fn(() => {
      token.visible = true;
      token.mesh.visible = true;
    });

    wrapTokenRefreshVisibility.call(token, wrapped);

    expect(token.visible).toBe(true);
    expect(token.mesh.visible).toBe(true);
  });

  it('uses Core and Visioner truth for observer presentation instead of hard-hiding', () => {
    gmObserverView.isActive.mockReturnValue(true);
    observerViewStateForCurrentView.mockReturnValue('undetected');
    const token = foundryHiddenToken();
    const wrapped = jest.fn(() => {
      token.visible = false;
      token.mesh.visible = false;
    });

    wrapTokenRefreshVisibility.call(token, wrapped);

    expect(applyCurrentViewHardHide).not.toHaveBeenCalled();
    expect(releaseCurrentViewHardHideForLiveSight).toHaveBeenCalledWith(token);
    expect(observerViewStateForCurrentView).toHaveBeenCalledWith(token, {
      includeObserved: true,
    });
    expect(gmObserverView.afterCoreTokenRefresh).toHaveBeenCalledWith(token, {
      coreVisible: false,
      visionerState: 'undetected',
    });
  });

  it('reads each detection setting once across one token visibility refresh', () => {
    const token = foundryHiddenToken({ visible: true });
    globalThis.game.settings = { get: jest.fn(() => false) };
    const wrapped = jest.fn(() => {
      for (let index = 0; index < 20; index += 1) {
        getDetectionSetting('avsOnlyInCombat');
      }
    });

    wrapTokenRefreshVisibility.call(token, wrapped);

    expect(globalThis.game.settings.get).toHaveBeenCalledTimes(1);
  });

  it('captures soundwave detection before core controls the token', () => {
    const token = foundryHiddenToken();
    const wrapped = jest.fn(() => {
      expect(captureMultiLevelViewBeforeControl).toHaveBeenCalledWith(token);
      expect(suppressOtherLevelTokenRenderingBeforeControl).toHaveBeenCalledWith(token, {
        releaseOthers: true,
      });
      return 'controlled';
    });

    expect(wrapTokenControl.call(token, wrapped, { releaseOthers: true })).toBe('controlled');

    expect(rememberSoundwaveDetectionBeforeCoreRefresh).toHaveBeenCalledWith(token);
    expect(wrapped).toHaveBeenCalledWith({ releaseOthers: true });
    expect(reassertOtherLevelTokenRenderingSuppression).toHaveBeenCalledWith(null);
    expect(refreshSoundwavesForActiveMovement).toHaveBeenCalled();
    expect(ensureDuringMoveSoundwaveRefresh).toHaveBeenCalled();
  });

  it('restores suppressed other-level surfaces when Core rejects control', () => {
    const token = foundryHiddenToken();
    const transition = { entries: [{ surface: token }] };
    suppressOtherLevelTokenRenderingBeforeControl.mockReturnValueOnce(transition);

    expect(wrapTokenControl.call(token, () => false)).toBe(false);

    expect(restoreOtherLevelTokenRenderingSuppression).toHaveBeenCalledWith(transition);
    expect(reassertOtherLevelTokenRenderingSuppression).not.toHaveBeenCalled();
  });

  it('scene Token Vision off runs only Core token refresh logic', () => {
    globalThis.canvas = { scene: { tokenVision: false } };
    const token = foundryHiddenToken();
    const wrapped = jest.fn(() => {
      token.visible = true;
      token.mesh.visible = true;
    });

    wrapTokenRefreshVisibility.call(token, wrapped);

    expect(wrapped).toHaveBeenCalledTimes(1);
    expect(applyCurrentViewHardHide).not.toHaveBeenCalled();
    expect(rememberSoundwaveDetectionBeforeCoreRefresh).not.toHaveBeenCalled();
    expect(refreshSoundwavesForActiveMovement).not.toHaveBeenCalled();
  });
});
