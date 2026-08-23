import { MODULE_ID } from '../constants.js';
import { SenseSuppressionRegionBehavior } from './SenseSuppressionRegionBehavior.js';

const VISUAL_SUPPRESSION_SENSES = new Set(['darkvision', 'greater-darkvision', 'low-light-vision']);
const SENSE_SUPPRESSION_BEHAVIOR_TYPE = `${MODULE_ID}.Pf2eVisionerSenseSuppression`;
const BOOLEAN_OVERRIDE_DESCRIPTORS = new WeakMap();

let registered = false;
let refreshHooksRegistered = false;
let refreshQueued = false;

function normalizeSenseType(senseType) {
  return String(senseType || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
}

function actorSenseTypes(actor) {
  const types = new Set();
  const senses = actor?.perception?.senses ?? actor?.system?.perception?.senses;

  if (Array.isArray(senses)) {
    for (const sense of senses) {
      const type = normalizeSenseType(sense?.type ?? sense);
      if (type) types.add(type);
    }
    return types;
  }

  if (senses && typeof senses.keys === 'function') {
    for (const key of senses.keys()) {
      const type = normalizeSenseType(key);
      if (type) types.add(type);
    }
  }

  if (types.size === 0 && senses && typeof senses[Symbol.iterator] === 'function') {
    for (const sense of senses) {
      const value = Array.isArray(sense) ? sense[1] : sense;
      const type = normalizeSenseType(value?.type ?? value);
      if (type) types.add(type);
    }
  }

  return types;
}

function restoreBooleanOverrides(document) {
  const descriptors = BOOLEAN_OVERRIDE_DESCRIPTORS.get(document);
  if (!descriptors) return;

  for (const [property, descriptor] of Object.entries(descriptors)) {
    if (descriptor) Object.defineProperty(document, property, descriptor);
    else delete document[property];
  }
  BOOLEAN_OVERRIDE_DESCRIPTORS.delete(document);
}

function overrideVisionBooleans(document, values) {
  const descriptors = {};
  for (const [property, value] of Object.entries(values)) {
    descriptors[property] = Object.getOwnPropertyDescriptor(document, property) ?? null;
    Object.defineProperty(document, property, {
      configurable: true,
      enumerable: false,
      value,
      writable: false,
    });
  }
  BOOLEAN_OVERRIDE_DESCRIPTORS.set(document, descriptors);
}

function downgradeDarkvisionSource(document) {
  if (document?.sight?.visionMode !== 'darkvision') return;

  const defaults = globalThis.CONFIG?.Canvas?.visionModes?.basic?.vision?.defaults ?? {};
  document.sight.visionMode = 'basic';
  document.sight.range = 0;
  document.sight.brightness = defaults.brightness ?? 0;
  document.sight.contrast = defaults.contrast ?? 0;
  document.sight.saturation = defaults.saturation ?? 0;

  if (document.detectionModes?.basicSight) {
    document.detectionModes.basicSight.range = 0;
  }
}

/**
 * Apply region suppression to PF2e's transient, prepared token perception data.
 * Actor and token source data remain untouched.
 */
export function applySenseSuppressionToPreparedTokenDocument(document, suppressedSenses) {
  if (!document) return document;

  restoreBooleanOverrides(document);

  const suppressed = new Set([...(suppressedSenses ?? [])].map(normalizeSenseType));
  if (![...suppressed].some((sense) => VISUAL_SUPPRESSION_SENSES.has(sense))) {
    return document;
  }

  const actor = document.actor;
  const senseTypes = actorSenseTypes(actor);
  const actorHasDarkvision = Boolean(actor?.hasDarkvision);
  const actorHasLowLightVision = Boolean(actor?.hasLowLightVision);

  let hasGreaterDarkvision = senseTypes.has('greater-darkvision');
  let hasDarkvision = senseTypes.has('darkvision');
  let hasLowLightVision = senseTypes.has('low-light-vision');

  // Defensive fallback for actor implementations that expose only aggregate booleans.
  if (!hasGreaterDarkvision && !hasDarkvision && actorHasDarkvision) hasDarkvision = true;
  if (!hasLowLightVision && !actorHasDarkvision && actorHasLowLightVision) {
    hasLowLightVision = true;
  }

  const effectiveDarkvision =
    (hasGreaterDarkvision && !suppressed.has('greater-darkvision')) ||
    (hasDarkvision && !suppressed.has('darkvision'));
  const effectiveLowLightVision =
    effectiveDarkvision || (hasLowLightVision && !suppressed.has('low-light-vision'));

  overrideVisionBooleans(document, {
    hasDarkvision: effectiveDarkvision,
    hasLowLightVision: effectiveLowLightVision,
  });

  if (!effectiveDarkvision) downgradeDarkvisionSource(document);
  return document;
}

export function tokenDocumentCenter(document) {
  const gridSize = Number(
    globalThis.canvas?.grid?.size ?? globalThis.canvas?.scene?.grid?.size ?? 0,
  );
  if (Number.isFinite(document?.x) && Number.isFinite(document?.y) && gridSize > 0) {
    return {
      x: document.x + (Number(document.width ?? 1) * gridSize) / 2,
      y: document.y + (Number(document.height ?? 1) * gridSize) / 2,
      elevation: Number(document.elevation ?? 0) || 0,
    };
  }

  const objectCenter = document?.object?.center;
  if (!Number.isFinite(objectCenter?.x) || !Number.isFinite(objectCenter?.y)) return null;
  return {
    x: objectCenter.x,
    y: objectCenter.y,
    elevation: Number(document.elevation ?? objectCenter.elevation ?? 0) || 0,
  };
}

export function createSenseSuppressionDetectionModesWrapper(
  suppressionBehavior = SenseSuppressionRegionBehavior,
) {
  return function senseSuppressionDetectionModesWrapper(wrapped, ...args) {
    restoreBooleanOverrides(this);
    const result = wrapped.call(this, ...args);
    try {
      const position = tokenDocumentCenter(this);
      const suppressed = suppressionBehavior.getSuppressedSensesForObserver(position);
      applySenseSuppressionToPreparedTokenDocument(this, suppressed);
    } catch {
      restoreBooleanOverrides(this);
    }
    return result;
  };
}

function refreshPreparedVisionSources() {
  refreshQueued = false;
  const tokens = globalThis.canvas?.tokens?.placeables ?? [];

  for (const token of tokens) {
    try {
      token.document?._prepareDetectionModes?.();
      token.initializeVisionSource?.();
    } catch {
      // Keep other token sources refreshing if one document is incomplete.
    }
  }

  globalThis.canvas?.perception?.update?.({
    initializeVision: true,
    refreshLighting: true,
  });
}

function queuePreparedVisionRefresh() {
  if (refreshQueued) return;
  refreshQueued = true;
  Promise.resolve().then(refreshPreparedVisionSources);
}

function regionHasSenseSuppression(region) {
  const behaviors = region?.behaviors ?? region?.document?.behaviors;
  if (!behaviors || typeof behaviors[Symbol.iterator] !== 'function') return false;
  return [...behaviors].some((behavior) => behavior?.type === SENSE_SUPPRESSION_BEHAVIOR_TYPE);
}

function registerRefreshHooks(hooks) {
  if (refreshHooksRegistered || typeof hooks?.on !== 'function') return;
  refreshHooksRegistered = true;

  for (const hook of ['createRegion', 'updateRegion', 'deleteRegion']) {
    hooks.on(hook, (region) => {
      if (regionHasSenseSuppression(region)) queuePreparedVisionRefresh();
    });
  }
  for (const hook of ['createRegionBehavior', 'updateRegionBehavior', 'deleteRegionBehavior']) {
    hooks.on(hook, (behavior) => {
      if (behavior?.type === SENSE_SUPPRESSION_BEHAVIOR_TYPE) {
        queuePreparedVisionRefresh();
      }
    });
  }
}

export function registerSenseSuppressionVisionIntegration({
  libWrapperAdapter = globalThis.libWrapper,
  hooks = globalThis.Hooks,
} = {}) {
  if (registered) return true;
  if (typeof libWrapperAdapter?.register !== 'function') return false;

  try {
    libWrapperAdapter.register(
      MODULE_ID,
      'CONFIG.Token.documentClass.prototype._prepareDetectionModes',
      createSenseSuppressionDetectionModesWrapper(),
      'WRAPPER',
    );
    registered = true;
    registerRefreshHooks(hooks);
    return true;
  } catch (error) {
    console.warn('[PF2E-Visioner] Failed to register sense-suppression vision wrapper:', error);
    return false;
  }
}
