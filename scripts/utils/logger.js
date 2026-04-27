/**
 * Simple toggleable logger for PF2E Visioner
 * Gated by either settings: autoVisibilityDebugMode or debug
 */

import { MODULE_ID } from '../constants.js';

let _cachedAvs = null;
let _cachedGlobal = null;

function _refreshCache() {
  try {
    _cachedAvs = !!game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
    _cachedGlobal = !!game.settings.get(MODULE_ID, 'debug');
  } catch {
    _cachedAvs = false;
    _cachedGlobal = false;
  }
}

function isEnabled(scope) {
  if (_cachedAvs === null) _refreshCache();

  const isAvsScope =
    scope &&
    (scope.includes('AVS') ||
      scope.includes('AutoVisibility') ||
      scope.includes('Batch') ||
      scope.includes('LightingEvent') ||
      scope.includes('TokenEvent') ||
      scope.includes('ActorEvent') ||
      scope.includes('EffectEvent') ||
      scope.includes('ItemEvent') ||
      scope.includes('VisibilityProcessor') ||
      scope.includes('CoverProcessor'));

  if (isAvsScope) {
    return _cachedAvs;
  }

  return _cachedGlobal;
}

function nowTs() {
  try {
    return (performance?.now?.() ?? Date.now()).toFixed(1);
  } catch {
    return `${Date.now()}`;
  }
}

function fmtScope(scope) {
  return scope ? `[${scope}]` : '';
}

function baseLog(level, scope, args) {
  if (!isEnabled(scope)) return;
  const prefix = `PF2E Visioner ${fmtScope(scope)}`;
  const stamp = nowTs();
  // Support lazy evaluation to avoid heavy payload creation when not needed.
  // Evaluate each function independently so one bad diagnostic cannot dump
  // function source text into the Foundry console.
  const normalized = Array.from(args).map((a) => {
    if (typeof a !== 'function') return a;
    try {
      return a();
    } catch (error) {
      return {
        msg: 'logger-lazy-payload-error',
        error: error?.message || String(error),
      };
    }
  });
  console[level](`${prefix} ${stamp}:`, ...normalized);
}

export function getLogger(scope = '') {
  return {
    enabled: () => isEnabled(scope),
    debug: (...args) => baseLog('debug', scope, args),
    info: (...args) => baseLog('info', scope, args),
    warn: (...args) => baseLog('warn', scope, args),
    error: (...args) => baseLog('error', scope, args),
    group: (label) => {
      if (!isEnabled(scope)) return;
      console.group(`PF2E Visioner ${fmtScope(scope)} ${nowTs()}: ${label}`);
    },
    groupCollapsed: (label) => {
      if (!isEnabled(scope)) return;
      console.groupCollapsed(`PF2E Visioner ${fmtScope(scope)} ${nowTs()}: ${label}`);
    },
    groupEnd: () => {
      if (!isEnabled(scope)) return;
      console.groupEnd();
    },
    time: (label) => {
      if (!isEnabled(scope)) return;
      console.time(`PF2E Visioner ${fmtScope(scope)} ${label}`);
    },
    timeEnd: (label) => {
      if (!isEnabled(scope)) return;
      console.timeEnd(`PF2E Visioner ${fmtScope(scope)} ${label}`);
    },
  };
}

export default { getLogger };
