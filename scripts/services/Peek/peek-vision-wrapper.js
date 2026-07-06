import { MODULE_ID } from '../../constants.js';

let _registered = false;

export function radiansToFoundryRotation(radians) {
  const degrees = (radians * 180) / Math.PI - 90;
  return ((degrees % 360) + 360) % 360;
}

export function applyPeekOverrideToData(data, override) {
  if (!data || !override?.origin) return data;
  data.x = override.origin.x;
  data.y = override.origin.y;
  if (override.origin.elevation !== undefined && override.origin.elevation !== null) {
    data.elevation = override.origin.elevation;
  }
  if (typeof override.fov === 'number') {
    // Keep Foundry's source full-angle; PeekVisionSourceController applies the actual cone.
    // This avoids externalRadius becoming a full-circle bleed outside narrow door peeks.
    data.angle = 360;
  }
  if (typeof override.direction === 'number') {
    data.rotation = radiansToFoundryRotation(override.direction);
  }
  if (typeof override.range === 'number' && override.range > 0) {
    data.radius = override.range;
    data.externalRadius = override.range;
  } else if (typeof data.radius === 'number' && data.radius > 0) {
    // Foundry uses externalRadius when darkness-blinding a non-darkvision source.
    // Keep peek geometry from collapsing to the token footprint during that path.
    data.externalRadius = data.radius;
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
