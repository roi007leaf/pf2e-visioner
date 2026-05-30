import { MODULE_ID } from '../../constants.js';

let _registered = false;

function radiansToFoundryRotation(radians) {
  const degrees = (radians * 180) / Math.PI + 90;
  return ((degrees % 360) + 360) % 360;
}

function applyPeekOverrideToData(data, override) {
  if (!data || !override?.origin) return data;
  data.x = override.origin.x;
  data.y = override.origin.y;
  if (override.origin.elevation !== undefined && override.origin.elevation !== null) {
    data.elevation = override.origin.elevation;
  }
  if (typeof override.fov === 'number') {
    data.angle = override.fov;
  }
  if (typeof override.direction === 'number') {
    data.rotation = radiansToFoundryRotation(override.direction);
  }
  return data;
}

export function createPeekVisionSourceDataWrapper(controller) {
  return function peekVisionSourceDataWrapper(wrapped, ...args) {
    const data = wrapped(...args);
    try {
      const tokenId = this?.document?.id;
      if (!tokenId) return data;
      const override = controller?.getOverride?.(tokenId);
      if (!override) return data;
      return applyPeekOverrideToData(data, override);
    } catch (_) {
      return data;
    }
  };
}

export function registerPeekVisionWrapper(controller) {
  if (_registered) return;
  if (typeof libWrapper === 'undefined' || typeof libWrapper.register !== 'function') return;
  try {
    libWrapper.register(
      MODULE_ID,
      'foundry.canvas.placeables.Token.prototype._getVisionSourceData',
      createPeekVisionSourceDataWrapper(controller),
      'WRAPPER',
    );
    _registered = true;
  } catch (error) {
    console.warn('[PF2E-Visioner] Failed to register peek vision wrapper:', error);
  }
}
