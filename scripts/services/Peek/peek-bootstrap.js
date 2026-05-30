import { peekRegistry } from './PeekRegistry.js';
import { PeekManager } from './PeekManager.js';
import { PeekVisionSourceController } from './PeekVisionSourceController.js';
import { registerPeekVisionWrapper } from './peek-vision-wrapper.js';
import { PeekSocketSender } from './peek-socket.js';
import { emitPeekUpdate } from '../socket.js';
import { MODULE_ID } from '../../constants.js';
import { readPeekDC, rollPeekCheck, defaultPeekRoll } from './peek-door-dc.js';
import { peekLocalVisibility } from './peek-local-visibility.js';

export function createPeekManager() {
  const renderer = new PeekVisionSourceController({});
  registerPeekVisionWrapper(renderer);
  const sender = new PeekSocketSender({ emit: (channel, data) => emitPeekUpdate(channel, data), minIntervalMs: 50 });
  const recompute = (tokenId) => {
    try {
      game.modules.get(MODULE_ID)?.api?.autoVisibility?.updateTokens?.([tokenId]);
    } catch (_) {}
  };
  let _revealInFlight = false;
  let _revealPending = null;
  const refreshPerception = () => {
    try {
      globalThis.canvas?.perception?.update?.({ refreshVision: true });
    } catch (_) {}
  };
  const runReveal = (tokenId) => {
    const observer = globalThis.canvas?.tokens?.get?.(tokenId);
    const api = game.modules.get(MODULE_ID)?.api?.autoVisibility;
    if (!observer || !api?.calculateVisibility) {
      _revealInFlight = false;
      return;
    }
    _revealInFlight = true;
    const targets = (globalThis.canvas?.tokens?.placeables || []).filter(
      (t) => t && t !== observer && t.actor,
    );
    Promise.all(
      targets.map(async (t) => {
        try {
          const result = await api.calculateVisibility(observer, t);
          const state =
            typeof result === 'string' ? result : (result?.visibility ?? result?.state ?? null);
          if (state) peekLocalVisibility.set(tokenId, t.document.id, state);
        } catch (_) {}
      }),
    ).finally(() => {
      refreshPerception();
      _revealInFlight = false;
      if (_revealPending != null) {
        const next = _revealPending;
        _revealPending = null;
        runReveal(next);
      }
    });
  };
  const localReveal = (tokenId) => {
    if (_revealInFlight) {
      _revealPending = tokenId;
      return;
    }
    runReveal(tokenId);
  };
  const clearLocalReveal = (tokenId) => {
    peekLocalVisibility.clearObserver(tokenId);
    refreshPerception();
  };
  const manager = new PeekManager({
    registry: peekRegistry,
    renderer: { apply: (t, p) => renderer.apply(t, p), clear: (t) => renderer.clear(t) },
    socket: { sendUpdate: (id, p) => sender.sendUpdate(id, p), sendEnd: (id) => sender.sendEnd(id) },
    recompute,
    now: () => Date.now(),
    readDC: readPeekDC,
    rollPeek: ({ token, dc }) => rollPeekCheck({ token, dc, roll: defaultPeekRoll }),
    localReveal,
    clearLocalReveal,
  });
  manager._visionController = renderer;
  return manager;
}
