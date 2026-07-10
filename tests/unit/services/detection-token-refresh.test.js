jest.mock('../../../scripts/services/gm-vision-bypass.js', () => ({
  shouldBypassAvsForGmVision: jest.fn(() => false),
}));

jest.mock('../../../scripts/services/movement-tracking.js', () => ({
  hasActivePendingTokenMovement: jest.fn(() => true),
}));

jest.mock('../../../scripts/services/Detection/current-view-hard-hide.js', () => ({
  applyCurrentViewHardHide: jest.fn(),
}));

import { wrapTokenRefreshVisibility } from '../../../scripts/services/Detection/detection-token-refresh.js';
import { applyCurrentViewHardHide } from '../../../scripts/services/Detection/current-view-hard-hide.js';
import { hasActivePendingTokenMovement } from '../../../scripts/services/movement-tracking.js';

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
});
