import { MODULE_ID } from '../../constants.js';
import { isLedgeWall } from './ledge-walls.js';

export const LEDGE_WALL_COLOR = 0x33bbee;

let registered = false;

export function ledgeWallColorWrapper(wrapped, ...args) {
  if (isLedgeWall(this?.document)) return LEDGE_WALL_COLOR;
  return wrapped(...args);
}

export function registerLedgeWallColor() {
  if (registered) return;
  if (typeof libWrapper === 'undefined' || typeof libWrapper.register !== 'function') return;
  try {
    libWrapper.register(
      MODULE_ID,
      'foundry.canvas.placeables.Wall.prototype._getWallColor',
      ledgeWallColorWrapper,
      'MIXED',
    );
    registered = true;
  } catch (error) {
    console.warn('[PF2E-Visioner] Failed to register ledge wall color wrapper:', error);
  }
}
