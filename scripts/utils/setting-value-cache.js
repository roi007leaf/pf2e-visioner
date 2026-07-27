import { MODULE_ID } from '../constants.js';

let settingsReference = null;
const values = new Map();

function syncSettingsReference() {
  const current = globalThis.game?.settings ?? null;
  if (current === settingsReference) return current;
  settingsReference = current;
  values.clear();
  return current;
}

export function getCachedSettingValue(key, fallback = undefined) {
  const settings = syncSettingsReference();
  if (values.has(key)) return values.get(key);

  try {
    const value = settings?.get?.(MODULE_ID, key);
    values.set(key, value);
    return value;
  } catch {
    return fallback;
  }
}

export function setCachedSettingValue(key, value) {
  syncSettingsReference();
  values.set(key, value);
}

export function clearSettingValueCache() {
  values.clear();
  settingsReference = null;
}
