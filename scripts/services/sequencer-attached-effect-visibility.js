// Visioner hides a Hidden/Undetected creature's art from the selected observer by switching off
// its token mesh, while the token itself stays "visible". Sequencer shows an attached effect
// while its token is visible, so lasting effects on that creature (condition markers, auras,
// other modules' persistent animations) stayed on screen and gave its position away. Each
// frame, before drawing, an effect attached to a token is hidden while that token's art is.

const hiddenByUs = new Set();
let registered = false;

function attachedToken(effect, tokens) {
  const doc = effect?.sourceDocument;
  if (doc?.documentName === 'Token') return doc.object ?? null;
  const id = /(?:^|\.)Token\.([^.]+)$/.exec(String(effect?.data?.source ?? ''))?.[1];
  return id ? (tokens?.get?.(id) ?? null) : null;
}

export function tokenArtHidden(token) {
  if (!token) return false;
  const mesh = token.mesh;
  return (
    token.visible === false ||
    mesh?.visible === false ||
    mesh?.renderable === false ||
    (Number.isFinite(mesh?.alpha) && mesh.alpha <= 0)
  );
}

export function syncAttachedEffectVisibility({ effects, tokens } = {}) {
  const list = effects ?? globalThis.Sequencer?.EffectManager?.effects ?? [];
  const placeables = tokens ?? globalThis.canvas?.tokens;
  const seen = new Set();
  for (const effect of list) {
    if (!effect || effect.destroyed) continue;
    const token = attachedToken(effect, placeables);
    if (!token) continue;
    seen.add(effect);
    if (tokenArtHidden(token)) {
      if (effect.renderable !== false) effect.renderable = false;
      hiddenByUs.add(effect);
    } else if (hiddenByUs.delete(effect)) {
      // Hand the decision back to Sequencer (its own sight, level and pause rules).
      if (typeof effect._recomputeRenderable === 'function') effect._recomputeRenderable();
      else effect.renderable = true;
    }
  }
  for (const effect of hiddenByUs) if (!seen.has(effect)) hiddenByUs.delete(effect);
}

export function registerAttachedEffectVisibility() {
  if (registered || !globalThis.Hooks?.on) return;
  registered = true;
  const tick = () => {
    try {
      syncAttachedEffectVisibility();
    } catch {
      /* best-effort: never break the render loop */
    }
  };
  const attach = () => {
    const ticker = globalThis.canvas?.app?.ticker;
    if (!ticker) return;
    ticker.remove(tick);
    // After Foundry refreshes tokens and Visioner hides bodies, before the frame is drawn.
    ticker.add(tick, null, (globalThis.PIXI?.UPDATE_PRIORITY?.LOW ?? -25) + 1);
  };
  Hooks.on('canvasReady', attach);
  if (globalThis.canvas?.ready) attach();
  Hooks.on('canvasTearDown', () => hiddenByUs.clear());
}
