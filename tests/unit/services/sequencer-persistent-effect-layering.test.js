import '../../setup.js';

import {
  clearPersistentSequencerEffectLayering,
  refreshPersistentSequencerEffectLayering,
} from '../../../scripts/services/sequencer-persistent-effect-layering.js';

function effect({ persist = true, elevation = 0, sortLayer = 800, parent, voidProxy } = {}) {
  return {
    data: { persist },
    parent,
    elevation,
    sortLayer,
    _voidProxy: voidProxy,
  };
}

describe('persistent Sequencer effect layering', () => {
  let primary;

  beforeEach(() => {
    primary = { sortDirty: false };
    clearPersistentSequencerEffectLayering();
  });

  afterEach(() => {
    clearPersistentSequencerEffectLayering();
  });

  test('places persistent primary effects immediately below token art for a selected AVS observer', () => {
    const darkness = effect({ parent: primary });
    const transientSpell = effect({ persist: false, parent: primary });
    const aboveLighting = effect({ parent: {} });

    const result = refreshPersistentSequencerEffectLayering({
      effects: [darkness, transientSpell, aboveLighting],
      controlledTokens: [{ id: 'silva' }],
      primaryGroup: primary,
      tokenSortLayer: 700,
      avsEnabled: true,
      tokenVisionEnabled: true,
      bypassAvs: false,
    });

    expect(result).toEqual({ active: true, adjusted: 1 });
    expect(darkness.sortLayer).toBe(699);
    expect(transientSpell.sortLayer).toBe(800);
    expect(aboveLighting.sortLayer).toBe(800);
    expect(primary.sortDirty).toBe(true);
  });

  test('clamps a high-elevation persistent effect to the observer plane before sorting it below tokens', () => {
    const darkness = effect({ parent: primary, elevation: 999 });

    const result = refreshPersistentSequencerEffectLayering({
      effects: [darkness],
      controlledTokens: [{ id: 'silva', mesh: { elevation: 0 } }],
      primaryGroup: primary,
      tokenSortLayer: 700,
      avsEnabled: true,
      tokenVisionEnabled: true,
      bypassAvs: false,
    });

    expect(result).toEqual({ active: true, adjusted: 1 });
    expect(darkness.elevation).toBe(0);
    expect(darkness.sortLayer).toBe(699);

    clearPersistentSequencerEffectLayering();
    expect(darkness.elevation).toBe(999);
    expect(darkness.sortLayer).toBe(800);
  });

  test.each([
    ['observer deselected', { controlledTokens: [] }],
    ['AVS disabled', { avsEnabled: false }],
    ['Token Vision disabled', { tokenVisionEnabled: false }],
    ['GM Vision bypass active', { bypassAvs: true }],
  ])('restores exact Sequencer ordering when %s', (_label, override) => {
    const darkness = effect({ parent: primary, sortLayer: 850 });
    const base = {
      effects: [darkness],
      controlledTokens: [{ id: 'silva' }],
      primaryGroup: primary,
      tokenSortLayer: 700,
      avsEnabled: true,
      tokenVisionEnabled: true,
      bypassAvs: false,
    };

    refreshPersistentSequencerEffectLayering(base);
    expect(darkness.sortLayer).toBe(699);

    refreshPersistentSequencerEffectLayering({ ...base, ...override });
    expect(darkness.sortLayer).toBe(850);
  });

  test('leaves persistent effects already below tokens unchanged', () => {
    const floorEffect = effect({ parent: primary, sortLayer: 600 });

    const result = refreshPersistentSequencerEffectLayering({
      effects: [floorEffect],
      controlledTokens: [{ id: 'silva' }],
      primaryGroup: primary,
      tokenSortLayer: 700,
      avsEnabled: true,
      tokenVisionEnabled: true,
      bypassAvs: false,
    });

    expect(result).toEqual({ active: true, adjusted: 0 });
    expect(floorEffect.sortLayer).toBe(600);
  });

  test('teardown restores tracked effects', () => {
    const darkness = effect({ parent: primary });

    refreshPersistentSequencerEffectLayering({
      effects: [darkness],
      controlledTokens: [{ id: 'silva' }],
      primaryGroup: primary,
      tokenSortLayer: 700,
      avsEnabled: true,
      tokenVisionEnabled: true,
      bypassAvs: false,
    });

    clearPersistentSequencerEffectLayering();

    expect(darkness.sortLayer).toBe(800);
  });

  test('suppresses Sequencer interface erasure while lowered and restores it afterward', () => {
    const voidProxy = { renderable: true };
    const darkness = effect({ parent: primary, voidProxy });
    const base = {
      effects: [darkness],
      controlledTokens: [{ id: 'silva' }],
      primaryGroup: primary,
      tokenSortLayer: 700,
      avsEnabled: true,
      tokenVisionEnabled: true,
      bypassAvs: false,
    };

    refreshPersistentSequencerEffectLayering(base);
    expect(voidProxy.renderable).toBe(false);

    refreshPersistentSequencerEffectLayering({ ...base, controlledTokens: [] });
    expect(voidProxy.renderable).toBe(true);
  });
});
