const OBSOLETE_PERCEPTION_FLAGS = new Set(['refreshTiles', 'identifyInteriorWalls']);

/**
 * Filter perception update flags against the active Foundry version.
 * v14 removed legacy flags like refreshTiles; passing them now throws.
 */
export function sanitizePerceptionUpdateFlags(flags = {}) {
  const supportedFlags = canvas?.perception?.constructor?.RENDER_FLAGS;
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

export function updateCanvasPerception(flags = {}) {
  const sanitized = sanitizePerceptionUpdateFlags(flags);
  if (!Object.keys(sanitized).length) return;
  return canvas?.perception?.update?.(sanitized);
}
