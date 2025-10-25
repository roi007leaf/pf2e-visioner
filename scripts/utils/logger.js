/**
 * Simple toggleable logger for PF2E Visioner
 * Gated by either settings: autoVisibilityDebugMode or debug
 */

import { MODULE_ID } from '../constants.js';

function isEnabled(scope) {
    try {
        const avs = !!game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
        const global = !!game.settings.get(MODULE_ID, 'debug');

        const isAvsScope = scope && (
            scope.includes('AVS') ||
            scope.includes('AutoVisibility') ||
            scope.includes('Batch') ||
            scope.includes('LightingEvent') ||
            scope.includes('TokenEvent') ||
            scope.includes('ActorEvent') ||
            scope.includes('EffectEvent') ||
            scope.includes('ItemEvent') ||
            scope.includes('VisibilityProcessor') ||
            scope.includes('CoverProcessor')
        );

        if (isAvsScope) {
            return avs;
        }

        return global;
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
