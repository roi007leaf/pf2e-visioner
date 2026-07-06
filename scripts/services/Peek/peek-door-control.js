import { MODULE_ID } from '../../constants.js';
import { isDoorPeekAllowed } from './peek-door-dc.js';
import { isWithinDoorPeekRange } from './peek-geometry.js';

let _registered = false;
let _hoveredDoorControl = null;

export function setHoveredDoorControl(control) {
  _hoveredDoorControl = control ?? null;
}

export function clearHoveredDoorControl(control = null) {
  if (!control || _hoveredDoorControl === control) _hoveredDoorControl = null;
}

export async function handleDoorPeekKeyDown(manager, { control = _hoveredDoorControl } = {}) {
  const controlled = canvas?.tokens?.controlled ?? [];
  if (controlled.length === 1) {
    const id = controlled[0]?.document?.id;
    if (id && manager?.getActivePeek?.(id)) {
      manager.endPeek(id, 'toggle');
      return true;
    }
  }
  return handleDoorRightDown(manager, control);
}

function doorControlTarget(method) {
  if (globalThis.foundry?.canvas?.containers?.DoorControl?.prototype) {
    return `foundry.canvas.containers.DoorControl.prototype.${method}`;
  }
  if (typeof DoorControl !== 'undefined') return `DoorControl.prototype.${method}`;
  return null;
}

export async function handleDoorRightDown(manager, control) {
  const controlled = canvas?.tokens?.controlled ?? [];
  if (controlled.length !== 1) return false;
  const token = controlled[0];
  const wallDoc = control?.wall?.document;
  if (!wallDoc) return false;
  if (!isDoorPeekAllowed(wallDoc)) {
    globalThis.ui?.notifications?.warn?.(game.i18n.localize('PF2E_VISIONER.PEEK.NOT_ALLOWED'));
    return false;
  }
  const gridSize = canvas?.grid?.size ?? 100;
  const maxDistance = gridSize * 1.5;
  if (!isWithinDoorPeekRange(token.center, { c: wallDoc.c }, maxDistance)) {
    globalThis.ui?.notifications?.warn?.(game.i18n.localize('PF2E_VISIONER.PEEK.TOO_FAR'));
    return false;
  }
  await manager.tryStartDoorPeek(token, wallDoc, canvas?.mousePosition);
  return true;
}

export function registerDoorPeekInteraction(_manager, { libWrapperAdapter } = {}) {
  if (_registered) return;
  const adapter = libWrapperAdapter || (typeof libWrapper !== 'undefined' ? libWrapper : null);
  if (!adapter) return;
  const hoverInTarget = doorControlTarget('_onMouseOver');
  const hoverOutTarget = doorControlTarget('_onMouseOut');
  if (!hoverInTarget || !hoverOutTarget) return;
  _registered = true;
  adapter.register(
    MODULE_ID,
    hoverInTarget,
    function (wrapped, event, ...args) {
      const result = wrapped.call(this, event, ...args);
      if (result !== false) setHoveredDoorControl(this);
      return result;
    },
    'MIXED',
  );
  adapter.register(
    MODULE_ID,
    hoverOutTarget,
    function (wrapped, event, ...args) {
      const result = wrapped.call(this, event, ...args);
      if (result !== false) clearHoveredDoorControl(this);
      return result;
    },
    'MIXED',
  );
}
