import '../../setup.js';

import {
  syncAttachedEffectVisibility,
  tokenArtHidden,
} from '../../../scripts/services/sequencer-attached-effect-visibility.js';

function token(id, mesh = { visible: true, renderable: true, alpha: 1 }) {
  return { id, visible: true, mesh };
}

function effect(source) {
  return {
    data: { source },
    renderable: true,
    recomputed: 0,
    _recomputeRenderable() {
      this.recomputed += 1;
      this.renderable = true;
    },
  };
}

describe('Sequencer effects attached to a token whose art Visioner hides', () => {
  test('detects hidden token art from the mesh', () => {
    expect(tokenArtHidden(token('a'))).toBe(false);
    expect(tokenArtHidden(token('a', { visible: false }))).toBe(true);
    expect(tokenArtHidden(token('a', { renderable: false }))).toBe(true);
    expect(tokenArtHidden(token('a', { alpha: 0 }))).toBe(true);
  });

  test('hides the effect while the art is hidden, then hands visibility back to Sequencer', () => {
    const owlbear = token('owlbear', { visible: false, renderable: false, alpha: 0 });
    const tokens = new Map([['owlbear', owlbear]]);
    const marker = effect('Scene.abc.Token.owlbear');
    const area = effect('Scene.abc.Region.darkness');

    syncAttachedEffectVisibility({ effects: [marker, area], tokens });
    expect(marker.renderable).toBe(false);
    expect(area.renderable).toBe(true);

    owlbear.mesh = { visible: true, renderable: true, alpha: 1 };
    syncAttachedEffectVisibility({ effects: [marker, area], tokens });
    expect(marker.renderable).toBe(true);
    expect(marker.recomputed).toBe(1);
    expect(area.recomputed).toBe(0);
  });

  test('leaves effects on visible tokens untouched', () => {
    const silva = token('silva');
    const marker = effect('Scene.abc.Token.silva');
    marker.renderable = false; // Sequencer's own decision (e.g. another level)
    syncAttachedEffectVisibility({ effects: [marker], tokens: new Map([['silva', silva]]) });
    expect(marker.renderable).toBe(false);
    expect(marker.recomputed).toBe(0);
  });
});
