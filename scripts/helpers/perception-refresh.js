const OBSOLETE_PERCEPTION_FLAGS = new Set(['refreshTiles', 'identifyInteriorWalls']);
const DEFAULT_REFRESH_DELAY_MS = 0;

let scheduledPerceptionFlags = null;
let scheduledPerceptionAdapter = null;
let scheduledPerceptionTimer = null;

/**
 * Filter perception update flags against the active Foundry version.
 * v14 removed legacy flags like refreshTiles; passing them now throws.
 */
export function sanitizePerceptionUpdateFlags(
  flags = {},
  { perception = globalThis.canvas?.perception } = {},
) {
  const supportedFlags = perception?.constructor?.RENDER_FLAGS;
  const sanitized = {};

  for (const [key, value] of Object.entries(flags ?? {})) {
    if (value === undefined) continue;

    if (supportedFlags) {
      if (!Object.prototype.hasOwnProperty.call(supportedFlags, key)) continue;
      sanitized[key] = value;
      continue;
    }

    if (OBSOLETE_PERCEPTION_FLAGS.has(key)) continue;
    sanitized[key] = value;
  }

  return sanitized;
}

export function updateCanvasPerception(
  flags = {},
  { perception = globalThis.canvas?.perception } = {},
) {
  const sanitized = sanitizePerceptionUpdateFlags(flags, { perception });
  if (!Object.keys(sanitized).length) return;
  return perception?.update?.(sanitized);
}

function mergePerceptionFlags(base, next) {
  const merged = { ...(base ?? {}) };
  for (const [key, value] of Object.entries(next ?? {})) {
    if (value === undefined) continue;
    merged[key] = merged[key] === true || value === true ? true : value;
  }
  return merged;
}

export function flushScheduledCanvasPerceptionUpdate() {
  const flags = scheduledPerceptionFlags;
  const perception = scheduledPerceptionAdapter;
  const timer = scheduledPerceptionTimer;
  scheduledPerceptionFlags = null;
  scheduledPerceptionAdapter = null;
  scheduledPerceptionTimer = null;
  if (timer !== null) {
    globalThis.clearTimeout(timer);
  }
  if (!flags) return;
  return updateCanvasPerception(flags, { perception });
}

export function scheduleCanvasPerceptionUpdate(
  flags = {},
  { delayMs = DEFAULT_REFRESH_DELAY_MS, perception = globalThis.canvas?.perception } = {},
) {
  if (typeof perception?.update !== 'function') return null;
  const sanitized = sanitizePerceptionUpdateFlags(flags, { perception });
  if (!Object.keys(sanitized).length) return null;

  if (scheduledPerceptionAdapter && scheduledPerceptionAdapter !== perception) {
    flushScheduledCanvasPerceptionUpdate();
  }

  scheduledPerceptionAdapter = perception;
  scheduledPerceptionFlags = mergePerceptionFlags(scheduledPerceptionFlags, sanitized);
  if (scheduledPerceptionTimer !== null) return scheduledPerceptionTimer;

  scheduledPerceptionTimer = globalThis.setTimeout(flushScheduledCanvasPerceptionUpdate, delayMs);
  return scheduledPerceptionTimer;
}

export function clearScheduledCanvasPerceptionUpdate() {
  if (scheduledPerceptionTimer !== null) {
    globalThis.clearTimeout(scheduledPerceptionTimer);
  }
  scheduledPerceptionFlags = null;
  scheduledPerceptionAdapter = null;
  scheduledPerceptionTimer = null;
}
