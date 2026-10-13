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
  }
  // externalRadius is the source footprint, not its sight range. Foundry uses
  // it for proximity/distance thresholds and attenuation as well as angles.
  return data;
}

export function createPeekVisionPolygonConfigurationWrapper(controller) {
  return function peekVisionPolygonConfigurationWrapper(wrapped, ...args) {
    const config = wrapped.call(this, ...args);
    const override = controller?.getOverride?.(this?.object?.document?.id);
    if (!override || !this.blinded?.darkness || this.data?.disabled || this.suppressed) return config;
    // Retain the darkness fallback LOS used by peek's post-init cone without
    // changing the footprint supplied to Foundry's wall threshold calculations.
    const radius = override.range > 0 ? override.range : globalThis.canvas?.dimensions?.maxR;
    if (Number.isFinite(radius) && radius > 0) config.radius = radius;
    return config;
  };
}

export function createPeekVisionSourceDataWrapper(controller) {
  return function peekVisionSourceDataWrapper(wrapped, ...args) {
    const data = wrapped.call(this, ...args);
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

export function createPeekLightSourceDataWrapper(controller) {
  return createPeekVisionSourceDataWrapper(controller);
}

export function createPeekSourceInitializeWrapper(controller) {
  return function peekSourceInitializeWrapper(wrapped, ...args) {
    const result = wrapped.call(this, ...args);
    try {
      const token = this?.object;
      const tokenId = token?.document?.id;
      if (tokenId && controller?.getOverride?.(tokenId)) {
        controller?.constrainToken?.(token);
      }
    } catch (_) {}
    return result;
  };
}

export function registerPeekVisionWrapper(controller) {
  if (_registered) return;
  if (typeof libWrapper === 'undefined' || typeof libWrapper.register !== 'function') return;
  let registered = false;
  try {
    libWrapper.register(
      MODULE_ID,
      'foundry.canvas.sources.PointVisionSource.prototype._getPolygonConfiguration',
      createPeekVisionPolygonConfigurationWrapper(controller),
      'WRAPPER',
    );
    registered = true;
  } catch (error) {
    console.warn('[PF2E-Visioner] Failed to register peek vision polygon wrapper:', error);
  }
  try {
    libWrapper.register(
      MODULE_ID,
      'foundry.canvas.placeables.Token.prototype._getVisionSourceData',
      createPeekVisionSourceDataWrapper(controller),
      'WRAPPER',
    );
    registered = true;
  } catch (error) {
    console.warn('[PF2E-Visioner] Failed to register peek vision wrapper:', error);
  }
  try {
    libWrapper.register(
      MODULE_ID,
      'foundry.canvas.placeables.Token.prototype._getLightSourceData',
      createPeekLightSourceDataWrapper(controller),
      'WRAPPER',
    );
    registered = true;
  } catch (error) {
    console.warn('[PF2E-Visioner] Failed to register peek light wrapper:', error);
  }
  try {
    libWrapper.register(
      MODULE_ID,
      'foundry.canvas.sources.PointVisionSource.prototype.initialize',
      createPeekSourceInitializeWrapper(controller),
      'WRAPPER',
    );
    registered = true;
  } catch (error) {
    console.warn('[PF2E-Visioner] Failed to register peek vision-source initializer wrapper:', error);
  }
  try {
    libWrapper.register(
      MODULE_ID,
      'foundry.canvas.sources.PointLightSource.prototype.initialize',
      createPeekSourceInitializeWrapper(controller),
      'WRAPPER',
    );
    registered = true;
  } catch (error) {
    console.warn('[PF2E-Visioner] Failed to register peek light-source initializer wrapper:', error);
  }
  try {
    libWrapper.register(
      MODULE_ID,
      'foundry.canvas.sources.PointDarknessSource.prototype.initialize',
      createPeekSourceInitializeWrapper(controller),
      'WRAPPER',
    );
    registered = true;
  } catch (error) {
    console.warn('[PF2E-Visioner] Failed to register peek darkness-source initializer wrapper:', error);
  }
  _registered = registered;
}
