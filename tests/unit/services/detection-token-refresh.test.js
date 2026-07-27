jest.mock('../../../scripts/services/gm-vision-bypass.js', () => ({
  shouldBypassAvsForGmVision: jest.fn(() => false),
}));

jest.mock('../../../scripts/services/movement-tracking.js', () => ({
  hasActivePendingTokenMovement: jest.fn(() => true),
}));

jest.mock('../../../scripts/services/Detection/current-view-hard-hide.js', () => ({
  applyCurrentViewHardHide: jest.fn(),
}));

jest.mock('../../../scripts/services/during-move-soundwave.js', () => ({
  ensureDuringMoveSoundwaveRefresh: jest.fn(),
  refreshSoundwavesForActiveMovement: jest.fn(),
  rememberSoundwaveDetectionBeforeCoreRefresh: jest.fn(),
}));

import {
  wrapTokenControl,
  wrapTokenRefreshVisibility,
} from '../../../scripts/services/Detection/detection-token-refresh.js';
import { applyCurrentViewHardHide } from '../../../scripts/services/Detection/current-view-hard-hide.js';
import {
  ensureDuringMoveSoundwaveRefresh,
  refreshSoundwavesForActiveMovement,
  rememberSoundwaveDetectionBeforeCoreRefresh,
} from '../../../scripts/services/during-move-soundwave.js';
import { hasActivePendingTokenMovement } from '../../../scripts/services/movement-tracking.js';
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
  beforeEach(() => {
    globalThis.game = { ready: true, user: { isGM: true } };
    hasActivePendingTokenMovement.mockReturnValue(true);
    applyCurrentViewHardHide.mockClear();
    rememberSoundwaveDetectionBeforeCoreRefresh.mockClear();
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
    const wrapped = jest.fn(() => 'controlled');

    expect(wrapTokenControl.call(token, wrapped, { releaseOthers: true })).toBe('controlled');

    expect(rememberSoundwaveDetectionBeforeCoreRefresh).toHaveBeenCalledWith(token);
    expect(wrapped).toHaveBeenCalledWith({ releaseOthers: true });
    expect(refreshSoundwavesForActiveMovement).toHaveBeenCalled();
    expect(ensureDuringMoveSoundwaveRefresh).toHaveBeenCalled();
  });
});
