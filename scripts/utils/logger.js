/**
 * Simple toggleable logger for PF2E Visioner
 * Now supports separate AVS and general debugging
 */

import { MODULE_ID } from '../constants.js';

// Global debug state - will be set by the debug logger
let avsDebugEnabled = false;
let generalDebugEnabled = false;

// Function to set debug state (called by debug logger)
export function setDebugState(avs, general) {
    avsDebugEnabled = avs;
    generalDebugEnabled = general;
}

function isAVSEnabled() {
    return avsDebugEnabled || !!game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
}

function isGeneralEnabled() {
    return generalDebugEnabled || !!game.settings.get(MODULE_ID, 'debug');
}

function isEnabled(scope) {
    // Check if this is an AVS scope
    if (scope && scope.includes('AVS')) {
        return isAVSEnabled();
    }
    // For non-AVS scopes, check general debugging
    return isGeneralEnabled();
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
