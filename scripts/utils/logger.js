/**
 * Simple toggleable logger for PF2E Visioner
 * Gated by either settings: autoVisibilityDebugMode or debug
 */

import { MODULE_ID } from '../constants.js';

function isEnabled() {
    try {
        // Prefer AVS specific debug, fallback to global debug
        const avs = !!game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
        const global = !!game.settings.get(MODULE_ID, 'debug');
        return avs || global;
    } catch {
        return false;
    }
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
    if (!isEnabled()) return;
    const prefix = `PF2E Visioner ${fmtScope(scope)}`;
    const stamp = nowTs();
    try {
        // Support lazy evaluation to avoid heavy stringification when not needed
        const normalized = Array.from(args).map((a) => (typeof a === 'function' ? a() : a));
        console[level](`${prefix} ${stamp}:`, ...normalized);
    } catch {
        console[level](`${prefix} ${stamp}:`, ...args);
    }
}

export function getLogger(scope = '') {
    return {
        enabled: () => isEnabled(),
        debug: (...args) => baseLog('debug', scope, args),
        info: (...args) => baseLog('info', scope, args),
        warn: (...args) => baseLog('warn', scope, args),
        error: (...args) => baseLog('error', scope, args),
        group: (label) => {
            if (!isEnabled()) return;
            console.group(`PF2E Visioner ${fmtScope(scope)} ${nowTs()}: ${label}`);
        },
        groupCollapsed: (label) => {
            if (!isEnabled()) return;
            console.groupCollapsed(`PF2E Visioner ${fmtScope(scope)} ${nowTs()}: ${label}`);
        },
        groupEnd: () => {
            if (!isEnabled()) return;
            console.groupEnd();
        },
        time: (label) => {
            if (!isEnabled()) return;
            console.time(`PF2E Visioner ${fmtScope(scope)} ${label}`);
        },
        timeEnd: (label) => {
            if (!isEnabled()) return;
            console.timeEnd(`PF2E Visioner ${fmtScope(scope)} ${label}`);
        },
    };
}

export default { getLogger };
