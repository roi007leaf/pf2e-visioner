import { MODULE_ID } from '../constants.js';
import { getSystemId } from '../system-adapter.js';

let bypassCache = {
  valid: false,
  value: false,
};
let bypassCacheGeneration = 0;

function cacheGmVisionBypassForCurrentBurst(value) {
  const generation = ++bypassCacheGeneration;
  bypassCache = { valid: true, value };
  const clear = () => {
    if (bypassCacheGeneration === generation) bypassCache.valid = false;
  };
  if (typeof queueMicrotask === 'function') queueMicrotask(clear);
  else Promise.resolve().then(clear);
}

let gmVisionSettingFrame = null;
let gmVisionSettingValue = null;

function currentRenderFrameStamp() {
  const stamp = globalThis.canvas?.app?.ticker?.lastTime;
  return typeof stamp === 'number' ? stamp : null;
}

function readGmVisionSetting() {
  try {
    const setting = globalThis.game?.settings?.get?.(getSystemId(), 'gmVision');
    if (typeof setting === 'boolean') return setting;
  } catch {
    /* ignore */
  }

  return null;
}

function gmVisionSettingEnabled() {
  const frame = currentRenderFrameStamp();
  if (frame === null) return readGmVisionSetting();
  if (frame !== gmVisionSettingFrame) {
    gmVisionSettingFrame = frame;
    gmVisionSettingValue = readGmVisionSetting();
  }
  return gmVisionSettingValue;
}

function gmVisionControlEnabled() {
  try {
    const controls = globalThis.ui?.controls?.controls;
    if (!Array.isArray(controls)) return null;

    for (const control of controls) {
      const tools = control?.tools;
      if (!Array.isArray(tools)) continue;
      const tool = tools.find((entry) => {
        const name = String(entry?.name ?? '');
        return /gm.*vision|vision.*gm/i.test(name) || name === 'gmVision' || name === 'gm-vision';
      });
      if (!tool) continue;

      const values = [tool.active, tool.toggled, tool._active, tool.enabled, tool.state];
      const bool = values.find((value) => typeof value === 'boolean');
      if (typeof bool === 'boolean') return bool;
    }
  } catch {
    /* ignore */
  }

  return null;
}

function gmVisionCanvasModeEnabled() {
  try {
    const canvas = globalThis.canvas;
    const gmMode = globalThis.CONST?.VISION_MODES?.GM;
    const perceptionMode = canvas?.perception?.visionMode ?? canvas?.perception?.mode;
    if (gmMode !== undefined && perceptionMode === gmMode) return true;
    if (typeof perceptionMode === 'string' && perceptionMode.toLowerCase() === 'gm') return true;

    const visibility = canvas?.effects?.visibility ?? canvas?.visibility;
    const direct =
      visibility?.isGMVision ??
      visibility?.gmVision ??
      visibility?.gmVisionEnabled ??
      visibility?.gmVisionActive;
    if (typeof direct === 'boolean') return direct;

    const mode = visibility?.visionMode ?? visibility?.mode;
    if (gmMode !== undefined && mode === gmMode) return true;
    if (typeof mode === 'string' && mode.toLowerCase() === 'gm') return true;
  } catch {
    /* ignore */
  }

  return false;
}

export function gmVisionEnabled() {
  const setting = gmVisionSettingEnabled();
  if (typeof setting === 'boolean') return setting;

  const control = gmVisionControlEnabled();
  if (typeof control === 'boolean') return control;

  return gmVisionCanvasModeEnabled();
}

export function isGmVisionModeActive() {
  if (!globalThis.game?.user?.isGM) return false;

  try {
    if (!(globalThis.game?.settings?.get?.(MODULE_ID, 'autoVisibilityEnabled') ?? false)) {
      return false;
    }
  } catch {
    return false;
  }

  try {
    if (globalThis.canvas?.scene?.getFlag?.(MODULE_ID, 'disableAVS')) return false;
  } catch {
    return false;
  }

  return gmVisionEnabled();
}

function isGmCoreVisionActive() {
  if (!globalThis.game?.user?.isGM) return false;
  return gmVisionEnabled();
}

export function shouldBypassAvsForGmVision() {
  let gmCoreVisionActive;
  if (globalThis.canvas?.ready !== true) {
    gmCoreVisionActive = isGmCoreVisionActive();
  } else {
    if (bypassCache.valid) {
      gmCoreVisionActive = bypassCache.value;
    } else {
      gmCoreVisionActive = isGmCoreVisionActive();
      cacheGmVisionBypassForCurrentBurst(gmCoreVisionActive);
    }
  }

  if (!gmCoreVisionActive) return false;
  return true;
}

export function clearGmVisionBypassCache() {
  bypassCacheGeneration += 1;
  bypassCache = {
    valid: false,
    value: false,
  };
  gmVisionSettingFrame = null;
  gmVisionSettingValue = null;
}
