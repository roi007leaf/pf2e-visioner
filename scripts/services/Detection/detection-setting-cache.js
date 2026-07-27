import { MODULE_ID } from '../../constants.js';

let activeCache = null;
let scopeDepth = 0;

export function getDetectionSetting(key) {
  if (activeCache?.has(key)) return activeCache.get(key);

  const value = globalThis.game?.settings?.get?.(MODULE_ID, key);
  activeCache?.set(key, value);
  return value;
}

export function withDetectionSettingCache(callback) {
  const isOuterScope = scopeDepth === 0;
  if (isOuterScope) activeCache = new Map();
  scopeDepth += 1;

  try {
    return callback();
  } finally {
    scopeDepth -= 1;
    if (isOuterScope) activeCache = null;
  }
}
