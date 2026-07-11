import { peekRegistry } from './PeekRegistry.js';
import { PeekManager } from './PeekManager.js';
import { PeekVisionSourceController } from './PeekVisionSourceController.js';
import { registerPeekVisionWrapper } from './peek-vision-wrapper.js';
import { PeekSocketSender } from './peek-socket.js';
import { emitPeekUpdate, requestGMDoorPeekApproval } from '../socket.js';
import { MODULE_ID } from '../../constants.js';
import { readPeekDC, rollPeekCheck, defaultPeekRoll } from './peek-door-dc.js';
import { peekGmOverlay } from './peek-gm-overlay.js';

export function createPeekManager() {
  const renderer = new PeekVisionSourceController({});
  registerPeekVisionWrapper(renderer);
  const sender = new PeekSocketSender({ emit: (channel, data) => emitPeekUpdate(channel, data), minIntervalMs: 50 });
  const recompute = (tokenId) => {
    try {
      game.modules.get(MODULE_ID)?.api?.autoVisibility?.updateTokens?.([tokenId]);
    } catch (_) {}
  };
  const manager = new PeekManager({
    registry: peekRegistry,
    renderer: {
      apply: (t, p) => { renderer.apply(t, p); peekGmOverlay.render(); },
      clear: (t) => { renderer.clear(t); peekGmOverlay.render(); },
    },
    socket: { sendUpdate: (id, p) => sender.sendUpdate(id, p), sendEnd: (id) => sender.sendEnd(id) },
    recompute,
    now: () => Date.now(),
    readDC: readPeekDC,
    rollPeek: ({ token, dc }) => rollPeekCheck({ token, dc, roll: defaultPeekRoll }),
    approvalRequester: requestGMDoorPeekApproval,
  });
  manager._visionController = renderer;
  return manager;
}
