const SUPPORTED_SYSTEMS = ['pf2e', 'sf2e'];

let _systemId = null;

export function getSystemId() {
  if (_systemId) return _systemId;
  const id = game?.system?.id;
  if (SUPPORTED_SYSTEMS.includes(id)) {
    _systemId = id;
  } else {
    _systemId = 'pf2e';
  }
  return _systemId;
}

export function isSF2E() {
  return getSystemId() === 'sf2e';
}

export function systemIconPath(relative) {
  return `systems/${getSystemId()}/icons/${relative}`;
}

export function systemCompendiumId(packDotId) {
  return `${getSystemId()}.${packDotId}`;
}

export function systemSettingGet(key) {
  return game.settings.get(getSystemId(), key);
}

export function isSystemSetting(setting, key) {
  const k = setting?.key ?? setting?.id ?? '';
  return k === `${getSystemId()}.${key}`;
}

export function validateSystemApi() {
  if (!game.pf2e) {
    console.warn(
      `PF2E Visioner: Running under ${getSystemId()} but game.pf2e API not found. Module may not function correctly.`,
    );
    return false;
  }
  return true;
}

export function resetSystemId() {
  _systemId = null;
}
