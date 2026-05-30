import { MODULE_ID } from '../../constants.js';

export function registerDoorPeekInteraction(manager) {
  if (typeof Hooks === 'undefined') return;
  Hooks.on('renderDoorControl', (control, html) => {
    const el = html?.jquery ? html[0] : html;
    if (!el) return;
    el.addEventListener('contextmenu', async (event) => {
      if (!event.shiftKey) return;
      const token = canvas?.tokens?.controlled?.[0];
      if (!token || canvas.tokens.controlled.length !== 1) return;
      const wallDoc = control.wall?.document;
      if (!wallDoc) return;
      event.preventDefault();
      event.stopPropagation();
      await manager.tryStartDoorPeek(token, wallDoc);
    });
  });
}
