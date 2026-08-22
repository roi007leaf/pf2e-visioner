import '../../setup.js';

import { gmObserverView } from '../../../scripts/services/GmObserverView/gm-observer-view.js';

const INDICATOR_POSITION_KEY = 'pf2e-visioner-gm-observer-indicator-pos';

class FakeBaseFilter {
  constructor(_vertex, _fragment, uniforms) {
    this.uniforms = uniforms;
    this.enabled = true;
    this.destroy = jest.fn();
  }

  static create(uniforms = {}) {
    return new this(null, null, { ...this.defaultUniforms, ...uniforms });
  }
}

function makeToken() {
  const foreignMeshFilter = { id: 'foreign-mesh-filter' };
  const detectionFilter = { id: 'core-detection-filter' };
  return {
    controlled: false,
    visible: false,
    renderable: false,
    detectionFilter,
    detectionFilterMesh: { visible: true, renderable: true },
    mesh: {
      visible: false,
      renderable: false,
      alpha: 0,
      filters: [foreignMeshFilter],
    },
    document: { id: 'target', hidden: false },
    foreignMeshFilter,
  };
}

describe('GM Observer View token presentation', () => {
  let soundwaveFilter;

  beforeEach(() => {
    globalThis.localStorage?.removeItem(INDICATOR_POSITION_KEY);
    soundwaveFilter = { id: 'soundwave-filter' };
    globalThis.PIXI = { Program: { defaultFragmentPrecision: 'mediump' } };
    globalThis.foundry = {
      canvas: { rendering: { filters: { AbstractBaseFilter: FakeBaseFilter } } },
    };
    globalThis.CONFIG = {
      Canvas: {
        darknessColor: 0x111111,
        detectionModes: {
          hearing: { constructor: { getDetectionFilter: () => soundwaveFilter } },
        },
      },
      PF2E: { Canvas: { darkness: { gmVision: 0xd1d1ff } } },
    };
    globalThis.game = {
      user: { isGM: true },
      modules: { get: jest.fn(() => null) },
      i18n: {
        localize: jest.fn((key) =>
          key.endsWith('GM_OBSERVER_VIEW.name') ? 'GM Observer View' : key,
        ),
      },
      settings: {
        get: jest.fn((namespace, key) => namespace === 'pf2e-visioner' && key === 'gmObserverView'),
      },
    };
    globalThis.canvas = {
      ready: true,
      environment: { initialize: jest.fn() },
      tokens: { controlled: [{ document: { id: 'observer' } }], placeables: [] },
    };
  });

  afterEach(() => {
    gmObserverView.clear();
    globalThis.localStorage?.removeItem(INDICATOR_POSITION_KEY);
    jest.restoreAllMocks();
  });

  it('adds its own hatch without taking ownership of Core detectionFilter', () => {
    const token = makeToken();
    globalThis.canvas.tokens.placeables = [token];

    gmObserverView.afterCoreTokenRefresh(token, {
      coreVisible: false,
      visionerHidden: false,
    });

    expect(token.visible).toBe(true);
    expect(token.renderable).toBe(true);
    expect(token.mesh.visible).toBe(true);
    expect(token.mesh.renderable).toBe(true);
    expect(token.mesh.alpha).toBe(1);
    expect(token.mesh.filters).toContain(token.foreignMeshFilter);
    expect(token.mesh.filters).toHaveLength(2);
    expect(token.mesh.filters[1]).toMatchObject({
      padding: 5,
      uniforms: {
        stripeColor: [1, 0.7, 0.2],
        outlineColor: [1, 0.28, 0.12],
        stripeOpacity: 0.24,
        stripeSpacing: 18,
        stripeWidth: 0.09,
      },
    });
    expect(token.detectionFilter).toEqual({ id: 'core-detection-filter' });
    expect(token.detectionFilterMesh.visible).toBe(false);
  });

  it('preserves movement soundwaves across consecutive observer presentation refreshes', () => {
    const token = makeToken();
    token.detectionFilter = soundwaveFilter;
    token.detectionFilterMesh.alpha = 1;
    globalThis.canvas.tokens.placeables = [token];

    for (let frame = 0; frame < 2; frame += 1) {
      gmObserverView.afterCoreTokenRefresh(token, {
        coreVisible: false,
        visionerHidden: true,
      });

      expect(token.detectionFilter).toBe(soundwaveFilter);
      expect(token.detectionFilterMesh).toMatchObject({
        visible: true,
        renderable: true,
        alpha: 1,
      });

      if (frame === 0) gmObserverView.beforeCoreTokenRefresh(token);
    }
  });

  it('shows a persistent active-mode indicator that can disable the view', () => {
    const disable = jest.spyOn(gmObserverView, 'setEnabled').mockResolvedValue(false);

    gmObserverView.refresh({ perception: false });

    const indicator = document.getElementById('pf2e-visioner-gm-observer-indicator');
    expect(indicator).not.toBeNull();
    expect(indicator.textContent).toContain('GM Observer View');
    expect(indicator.textContent).not.toContain('ACTIVE');
    expect(indicator.querySelector('.pf2e-visioner-gm-observer-indicator-status')).toBeNull();
    expect(document.body.classList).toContain('pf2e-visioner-gm-observer-view-active');

    indicator.click();
    expect(disable).toHaveBeenCalledWith(false);

    gmObserverView.clear();
    expect(document.getElementById('pf2e-visioner-gm-observer-indicator')).toBeNull();
    expect(document.body.classList).not.toContain('pf2e-visioner-gm-observer-view-active');
  });

  it('drags the active-mode indicator anywhere onscreen and remembers its position', () => {
    const disable = jest.spyOn(gmObserverView, 'setEnabled').mockResolvedValue(false);
    Object.defineProperties(window, {
      innerWidth: { configurable: true, value: 800 },
      innerHeight: { configurable: true, value: 600 },
    });

    gmObserverView.refresh({ perception: false });

    const indicator = document.getElementById('pf2e-visioner-gm-observer-indicator');
    Object.defineProperties(indicator, {
      offsetWidth: { configurable: true, value: 240 },
      offsetHeight: { configurable: true, value: 40 },
    });
    indicator.getBoundingClientRect = jest.fn(() => ({ left: 280, top: 68 }));

    indicator.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 300, clientY: 80 }),
    );
    document.dispatchEvent(
      new MouseEvent('mousemove', { bubbles: true, clientX: 900, clientY: 700 }),
    );

    expect(indicator.style.left).toBe('280px');
    expect(indicator.style.top).toBe('68px');
    expect(indicator.style.transform).toBe('translate3d(280px, 492px, 0)');

    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    indicator.click();

    expect(indicator.style.left).toBe('560px');
    expect(indicator.style.top).toBe('560px');
    expect(indicator.style.transform).toBe('none');
    expect(globalThis.localStorage.getItem(INDICATOR_POSITION_KEY)).toBe(
      JSON.stringify({ left: 560, top: 560 }),
    );
    expect(disable).not.toHaveBeenCalled();

    gmObserverView.clear();
    gmObserverView.refresh({ perception: false });

    const restored = document.getElementById('pf2e-visioner-gm-observer-indicator');
    expect(restored.style.left).toBe('560px');
    expect(restored.style.top).toBe('560px');
    expect(restored.style.transform).toBe('none');
  });

  it('restores Core state and removes only its own hatch before the next Core refresh', () => {
    const token = makeToken();
    globalThis.canvas.tokens.placeables = [token];

    gmObserverView.afterCoreTokenRefresh(token, {
      coreVisible: false,
      visionerHidden: true,
    });
    gmObserverView.beforeCoreTokenRefresh(token);

    expect(token).toMatchObject({ visible: false, renderable: false });
    expect(token.mesh).toMatchObject({ visible: false, renderable: false, alpha: 0 });
    expect(token.mesh.filters).toEqual([token.foreignMeshFilter]);
    expect(token.detectionFilterMesh).toMatchObject({ visible: true, renderable: true });
    expect(token.detectionFilter).toEqual({ id: 'core-detection-filter' });
  });

  it('does not alter a target already perceived by the selected observer', () => {
    const token = makeToken();
    token.visible = true;
    token.renderable = true;
    token.mesh.visible = true;
    token.mesh.renderable = true;
    token.mesh.alpha = 1;
    globalThis.canvas.tokens.placeables = [token];

    expect(
      gmObserverView.afterCoreTokenRefresh(token, {
        coreVisible: true,
        visionerHidden: false,
      }),
    ).toBe('unchanged');

    expect(token.mesh.filters).toEqual([token.foreignMeshFilter]);
    expect(token.detectionFilterMesh.visible).toBe(true);
  });

  it('shows all eligible tokens normally when no observer is selected', () => {
    const token = makeToken();
    globalThis.canvas.tokens.controlled = [];
    globalThis.canvas.tokens.placeables = [token];

    expect(
      gmObserverView.afterCoreTokenRefresh(token, {
        coreVisible: false,
        visionerHidden: true,
      }),
    ).toBe('normal');

    expect(token.mesh.filters).toEqual([token.foreignMeshFilter]);
    expect(token.mesh.visible).toBe(true);
    expect(token.detectionFilterMesh.visible).toBe(false);
  });

  it('never activates for players', () => {
    globalThis.game.user.isGM = false;
    expect(gmObserverView.isActive()).toBe(false);
  });

  it('reveals fog and lightens darkness without changing active vision sources', () => {
    const visionSource = { active: true };
    globalThis.canvas.scene = { tokenVision: true };
    globalThis.canvas.visibility = { visible: true };
    globalThis.canvas.effects = {
      darkness: { alpha: 1 },
      visionSources: [visionSource],
    };

    gmObserverView.syncCanvas();

    expect(globalThis.canvas.visibility.visible).toBe(false);
    expect(globalThis.canvas.effects.darkness.alpha).toBe(0.5);
    expect(globalThis.CONFIG.Canvas.darknessColor).toBe(0xd1d1ff);
    expect(visionSource.active).toBe(true);

    gmObserverView.clear();
    expect(globalThis.canvas.visibility.visible).toBe(true);
    expect(globalThis.canvas.effects.darkness.alpha).toBe(1);
    expect(globalThis.CONFIG.Canvas.darknessColor).toBe(0x111111);
    expect(globalThis.canvas.environment.initialize).toHaveBeenCalledTimes(2);
  });

  it('keeps observer token markings colored through PF2e monochrome darkvision', () => {
    const uniforms = { saturation: -1 };
    globalThis.canvas.scene = { tokenVision: true };
    globalThis.canvas.visibility = {
      visible: true,
      visionModeData: { source: { visionMode: { id: 'darkvision' } } },
    };
    globalThis.canvas.primary = { sprite: { shader: { uniforms } } };
    globalThis.canvas.effects = {
      darkness: { alpha: 1 },
      visionSources: [{ active: true }],
    };

    gmObserverView.syncCanvas();

    expect(uniforms.saturation).toBe(0);

    // Core reapplies the vision-mode uniforms during Primary refreshes; sightRefresh must win again.
    uniforms.saturation = -1;
    gmObserverView.syncCanvas();
    expect(uniforms.saturation).toBe(0);

    gmObserverView.clear();
    expect(uniforms.saturation).toBe(-1);
  });

  it('turns off competing GM Vision modes before enabling Observer View', async () => {
    globalThis.game.modules.get.mockImplementation((id) =>
      id === 'gm-vision' ? { active: true } : null,
    );
    globalThis.game.settings.get.mockImplementation((namespace, key) => {
      if (namespace === 'pf2e' && key === 'gmVision') return true;
      if (namespace === 'gm-vision' && key === 'active') return true;
      return namespace === 'pf2e-visioner' && key === 'gmObserverView';
    });
    globalThis.game.settings.set = jest.fn().mockResolvedValue(undefined);

    await gmObserverView.setEnabled(true);

    expect(globalThis.game.settings.set.mock.calls).toEqual([
      ['pf2e', 'gmVision', false],
      ['gm-vision', 'active', false],
      ['pf2e-visioner', 'gmObserverView', true],
    ]);
  });
});
