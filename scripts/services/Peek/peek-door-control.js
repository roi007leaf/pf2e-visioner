import { MODULE_ID } from '../../constants.js';
import { isWithinDoorPeekRange } from './peek-geometry.js';

let _registered = false;

export function shouldPeekDoor(event) {
  try {
    if (game?.keyboard?.isModifierActive && typeof KeyboardManager !== 'undefined') {
      return game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.SHIFT);
    }
  } catch (_) {}
  return !!(event?.shiftKey ?? event?.nativeEvent?.shiftKey ?? event?.data?.originalEvent?.shiftKey);
}

export async function handleDoorRightDown(manager, control) {
  const controlled = canvas?.tokens?.controlled ?? [];
  if (controlled.length !== 1) return false;
  const token = controlled[0];
  const wallDoc = control?.wall?.document;
  if (!wallDoc) return false;
  const gridSize = canvas?.grid?.size ?? 100;
  const maxDistance = gridSize * 1.5;
  if (!isWithinDoorPeekRange(token.center, { c: wallDoc.c }, maxDistance)) {
    globalThis.ui?.notifications?.warn?.(game.i18n.localize('PF2E_VISIONER.PEEK.TOO_FAR'));
    return false;
  }
  await manager.tryStartDoorPeek(token, wallDoc, canvas?.mousePosition);
  return true;
}

export function registerDoorPeekInteraction(manager, { libWrapperAdapter } = {}) {
  if (_registered) return;
  const adapter = libWrapperAdapter || (typeof libWrapper !== 'undefined' ? libWrapper : null);
  if (!adapter) return;
  const hasNamespaced = !!globalThis.foundry?.canvas?.containers?.DoorControl?.prototype;
  const target = hasNamespaced
    ? 'foundry.canvas.containers.DoorControl.prototype._onRightDown'
    : typeof DoorControl !== 'undefined'
      ? 'DoorControl.prototype._onRightDown'
      : null;
  if (!target) return;
  _registered = true;
  adapter.register(
    MODULE_ID,
    target,
    function (wrapped, event, ...args) {
      try {
        if (shouldPeekDoor(event)) {
          handleDoorRightDown(manager, this);
          return;
        }
      } catch (_) {}
      return wrapped.call(this, event, ...args);
    },
    'MIXED',
  );
}
