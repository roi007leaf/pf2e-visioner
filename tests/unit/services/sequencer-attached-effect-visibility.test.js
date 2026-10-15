import '../../setup.js';

import {
  attachedToken,
  syncAttachedEffectVisibility,
  tokenArtHidden,
} from '../../../scripts/services/sequencer-attached-effect-visibility.js';

function token(id, mesh = { visible: true, renderable: true, alpha: 1 }) {
  return { id, visible: true, mesh };
}

// `.attachTo(token)` in Sequencer records the source and `attachTo.active`; `.atLocation(token)`
// records the same source with `attachTo.active` false.
function effect(source, { attached = true } = {}) {
  return {
    data: { source, attachTo: { active: attached } },
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
    expect(tokenArtHidden({ id: 'a', visible: false, mesh: { visible: true } })).toBe(true);
  });

  test('a cosmetic alpha-0 token is not treated as hidden', () => {
    const shattering = token('a', { visible: true, renderable: true, alpha: 0 });
    expect(tokenArtHidden(shattering)).toBe(false);

    const slash = effect('Scene.abc.Token.a');
    syncAttachedEffectVisibility({ effects: [slash], tokens: new Map([['a', shattering]]) });
    expect(slash.renderable).toBe(true);
    expect(slash.recomputed).toBe(0);
  });

  test('hides an attached effect while the art is hidden, then hands visibility back to Sequencer', () => {
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

  test('hides an attached effect resolved through its source document', () => {
    const owlbear = token('owlbear', { visible: false, renderable: false, alpha: 0 });
    const aura = effect('Scene.abc.Token.owlbear');
    aura.data.source = undefined;
    aura.sourceDocument = { documentName: 'Token', object: owlbear };
    expect(attachedToken(aura, new Map())).toBe(owlbear);

    syncAttachedEffectVisibility({ effects: [aura], tokens: new Map() });
    expect(aura.renderable).toBe(false);
  });

  test('leaves an effect played at a hidden token location alone', () => {
    const owlbear = token('owlbear', { visible: false, renderable: false, alpha: 0 });
    const tokens = new Map([['owlbear', owlbear]]);
    const impact = effect('Scene.abc.Token.owlbear', { attached: false });
    impact.sourceDocument = { documentName: 'Token', object: owlbear };
    const legacy = { data: { source: 'Scene.abc.Token.owlbear' }, renderable: true };

    expect(attachedToken(impact, tokens)).toBeNull();
    syncAttachedEffectVisibility({ effects: [impact, legacy], tokens });
    expect(impact.renderable).toBe(true);
    expect(legacy.renderable).toBe(true);
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
