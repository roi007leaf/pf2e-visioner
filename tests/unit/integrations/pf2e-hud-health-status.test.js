jest.mock('../../../scripts/services/Detection/current-view-hard-hide.js', () => ({
  observerViewStateForCurrentView: jest.fn(),
}));
jest.mock('../../../scripts/services/gm-vision-bypass.js', () => ({
  shouldBypassAvsForGmVision: jest.fn(),
}));
jest.mock('../../../scripts/services/scene-token-vision.js', () => ({
  isSceneTokenVisionDisabled: jest.fn(),
}));

import { observerViewStateForCurrentView } from '../../../scripts/services/Detection/current-view-hard-hide.js';
import { DEFAULT_SETTINGS, MODULE_ID } from '../../../scripts/constants.js';
import { shouldBypassAvsForGmVision } from '../../../scripts/services/gm-vision-bypass.js';
import { isSceneTokenVisionDisabled } from '../../../scripts/services/scene-token-vision.js';
import {
  registerPf2eHudHealthStatusIntegration,
  syncPf2eHudHealthStatus,
} from '../../../scripts/integrations/pf2e-hud-health-status.js';

describe('PF2e HUD health status visibility', () => {
  let app;
  let status;

  beforeEach(() => {
    game.user.isGM = false;
    game.modules.get = jest.fn(() => ({ active: true }));
    game.settings.get = jest.fn((moduleId, key) =>
      moduleId === MODULE_ID && key === 'hideHiddenTokenHealthEstimates' ? 'players' : false,
    );
    document.body.innerHTML = `<section id="pf2e-hud-tooltip"><div class="wrapper">
      <div data-panel="distance">20 feet</div>
      <div data-panel="health-status" style="color: red">Injured</div>
    </div></section>`;
    app = {
      id: 'pf2e-hud-tooltip',
      element: document.body.firstElementChild,
      token: { document: { id: 'target' } },
    };
    status = app.element.querySelector('[data-panel="health-status"]');
    observerViewStateForCurrentView.mockReturnValue('hidden');
    shouldBypassAvsForGmVision.mockReturnValue(false);
    isSceneTokenVisionDisabled.mockReturnValue(false);
  });

  it('hides health estimate on a rendered Hidden silhouette while preserving distance', () => {
    syncPf2eHudHealthStatus(app);
    expect(status.style.display).toBe('none');
    expect(app.element.querySelector('[data-panel="distance"]').style.display).toBe('');
    expect(status.style.color).toBe('red');
  });

  it('defines a GM-controlled three-way world setting defaulting to off', () => {
    expect(DEFAULT_SETTINGS.hideHiddenTokenHealthEstimates).toMatchObject({
      scope: 'world',
      config: true,
      restricted: true,
      type: String,
      default: 'off',
    });
    expect(Object.keys(DEFAULT_SETTINGS.hideHiddenTokenHealthEstimates.choices)).toEqual([
      'off',
      'players',
      'all',
    ]);
  });

  it.each([
    ['off', false, false],
    ['off', true, false],
    ['players', false, true],
    ['players', true, false],
    ['all', false, true],
    ['all', true, true],
    [true, false, true],
    ['true', false, true],
    ['true', true, false],
    [false, false, false],
    ['false', false, false],
  ])('applies mode %s with GM=%s: suppress=%s', (mode, isGM, suppress) => {
    game.settings.get.mockReturnValue(mode);
    game.user.isGM = isGM;
    app.token.detectionFilter = {};
    syncPf2eHudHealthStatus(app);
    expect(status.style.display).toBe(suppress ? 'none' : '');
  });

  it('restores a GM estimate when switching from all to players only', () => {
    game.user.isGM = true;
    game.settings.get.mockReturnValue('all');
    syncPf2eHudHealthStatus(app);
    expect(status.style.display).toBe('none');
    game.settings.get.mockReturnValue('players');
    syncPf2eHudHealthStatus(app);
    expect(status.style.display).toBe('');
  });

  it.each(['undetected', 'unnoticed'])('suppresses estimates for %s targets', (state) => {
    observerViewStateForCurrentView.mockReturnValue(state);
    syncPf2eHudHealthStatus(app);
    expect(status.style.display).toBe('none');
  });

  it.each([null, 'observed', 'concealed'])('keeps estimates for %s presentation', (state) => {
    observerViewStateForCurrentView.mockReturnValue(state);
    syncPf2eHudHealthStatus(app);
    expect(status.style.display).toBe('');
  });

  it('restores existing estimate after target becomes observed', () => {
    status.style.setProperty('display', 'flex', 'important');
    syncPf2eHudHealthStatus(app);
    expect(status.style.display).toBe('none');
    observerViewStateForCurrentView.mockReturnValue(null);
    syncPf2eHudHealthStatus(app);
    expect(status.style.display).toBe('flex');
    expect(status.style.getPropertyPriority('display')).toBe('important');
  });

  it.each(['hidden', 'undetected', 'unnoticed'])(
    'keeps GM estimates visible for %s silhouettes',
    (state) => {
      game.user.isGM = true;
      app.token.detectionFilter = {};
      observerViewStateForCurrentView.mockReturnValue(state);
      syncPf2eHudHealthStatus(app);
      expect(status.style.display).toBe('');
    },
  );

  it('restores suppressed estimate when player becomes GM, hides again when returning to player', () => {
    syncPf2eHudHealthStatus(app);
    expect(status.style.display).toBe('none');
    game.user.isGM = true;
    syncPf2eHudHealthStatus(app);
    expect(status.style.display).toBe('');
    game.user.isGM = false;
    syncPf2eHudHealthStatus(app);
    expect(status.style.display).toBe('none');
  });

  it('ignores other HUD panels and inactive HUD', () => {
    app.id = 'pf2e-hud-tracker';
    syncPf2eHudHealthStatus(app);
    expect(status.style.display).toBe('');
    app.id = 'pf2e-hud-tooltip';
    game.modules.get.mockReturnValue({ active: false });
    syncPf2eHudHealthStatus(app);
    expect(status.style.display).toBe('');
  });

  it('blocks Core silhouette estimates with no selected observer, then restores after filter clears', () => {
    observerViewStateForCurrentView.mockReturnValue(null);
    app.token.detectionFilter = {};
    syncPf2eHudHealthStatus(app);
    expect(status.style.display).toBe('none');
    app.token.detectionFilter = null;
    syncPf2eHudHealthStatus(app);
    expect(status.style.display).toBe('');
  });

  it.each(['gmVision', 'disabledVision', 'controlled'])('respects %s filter bypass', (mode) => {
    observerViewStateForCurrentView.mockReturnValue(null);
    app.token.detectionFilter = {};
    shouldBypassAvsForGmVision.mockReturnValue(mode === 'gmVision');
    isSceneTokenVisionDisabled.mockReturnValue(mode === 'disabledVision');
    app.token.controlled = mode === 'controlled';
    syncPf2eHudHealthStatus(app);
    expect(status.style.display).toBe('');
  });

  it('handles render, state change, observer switch, rerender, and close hooks', async () => {
    const callbacks = new Map();
    const on = jest.spyOn(Hooks, 'on').mockImplementation((event, callback) => {
      callbacks.set(event, callback);
    });
    try {
      registerPf2eHudHealthStatusIntegration();
      callbacks.get('renderApplicationV2')(app, app.element);
      expect(status.style.display).toBe('none');
      game.settings.get.mockReturnValue('off');
      callbacks.get('updateSetting')();
      await Promise.resolve();
      expect(status.style.display).toBe('');
      game.settings.get.mockReturnValue('players');
      callbacks.get('updateSetting')();
      await Promise.resolve();
      expect(status.style.display).toBe('none');
      observerViewStateForCurrentView.mockReturnValue('observed');
      callbacks.get('pf2e-visioner.visibilityMapUpdated')();
      await Promise.resolve();
      expect(status.style.display).toBe('');
      observerViewStateForCurrentView.mockReturnValue('hidden');
      callbacks.get('controlToken')();
      await Promise.resolve();
      expect(status.style.display).toBe('none');
      app.element.innerHTML = '<div data-panel="health-status">Uninjured</div>';
      status = app.element.firstElementChild;
      callbacks.get('renderApplicationV2')(app, app.element);
      expect(status.style.display).toBe('none');
      callbacks.get('closeApplicationV2')(app);
      observerViewStateForCurrentView.mockReturnValue('observed');
      callbacks.get('refreshToken')();
      await Promise.resolve();
      expect(status.style.display).toBe('none');
    } finally {
      on.mockRestore();
    }
  });
});
