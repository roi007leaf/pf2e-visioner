/**
 * OverrideBatchCache
 * Per-batch memoization of visibility override states for directed pairs (aId -> bId).
 * It consults the provided getActiveOverride function and falls back to legacy flags on the target token.
 */
import { overrideToDisplayVisibility } from '../../perception-profile.js';

function hasOverrideVisibilityData(override) {
    return !!(
        override &&
        typeof override === 'object' &&
        (typeof override.state === 'string' ||
            typeof override.detectionState === 'string' ||
            typeof override.hasConcealment === 'boolean')
    );
}

function actorHasInvisibleCondition(actor) {
    return !!(
        actor?.hasCondition?.('invisible') ||
        actor?.system?.conditions?.invisible?.active ||
        actor?.conditions?.has?.('invisible') ||
        actor?.itemTypes?.condition?.some?.(
            (condition) => condition.slug === 'invisible' && !condition.isExpired,
        )
    );
}

function applyInvisibleTransitionToOverride(state, observerId, targetToken) {
    if (!state || !actorHasInvisibleCondition(targetToken?.actor)) return state;

    const invisibilityFlags = targetToken?.document?.getFlag?.('pf2e-visioner', 'invisibility') ?? {};
    const previousState = invisibilityFlags?.[observerId]?.previousState || state;

    switch (previousState) {
        case 'observed':
        case 'concealed':
            return 'hidden';
        case 'hidden':
        case 'undetected':
            return 'undetected';
        default:
            return state;
    }
}

export class OverrideBatchCache {
    /**
     * @param {{ getActiveOverrideForTokens: (observer: Token, target: Token) => Promise<{ state?: string } | null> | ({ state?: string } | null) }} overrideService
     */
    constructor(overrideService, options = {}) {
        /** @type {{ getActiveOverrideForTokens: (observer: Token, target: Token) => Promise<{ state?: string } | null> | ({ state?: string } | null) }} */
        this._overrideService = overrideService || null;
        this._applyInvisibilityTransition = options.applyInvisibilityTransition !== false;
        /** @type {Map<string, string | null>} */
        this._memo = new Map();
    }

    /**
     * Build is a no-op for now; retained for symmetry with other caches.
     * @param {Token[]} _tokens
     */
    build(_tokens) {
        this._memo.clear();
    }

    /**
     * Get the override state for a directed pair, cached per batch.
     * @param {string} aId Observer token id
     * @param {string} bId Target token id
     * @param {Token} tokenA Observer token
     * @param {Token} tokenB Target token
     * @returns {string | null}
     */
    getOverrideState(aId, bId, tokenA, tokenB) {
        const key = `${aId}->${bId}`;
        if (this._memo.has(key)) return this._memo.get(key);
        let state = null;
        try {
            const res = this._overrideService?.getActiveOverrideForTokens?.(tokenA, tokenB);
            const ov = (typeof res?.then === 'function') ? undefined : res; // avoid awaiting in sync path
            if (hasOverrideVisibilityData(ov)) state = overrideToDisplayVisibility(ov);
            if (state == null) {
                // Legacy flag fallback on tokenB
                const overrideFlagKey = `avs-override-from-${aId}`;
                const flag = tokenB?.document?.getFlag?.('pf2e-visioner', overrideFlagKey);
                if (hasOverrideVisibilityData(flag)) state = overrideToDisplayVisibility(flag);
            }
        } catch {
            // noop
        }

        if (this._applyInvisibilityTransition) {
            state = applyInvisibleTransitionToOverride(state, aId, tokenB);
        }

        this._memo.set(key, state);
        return state;
    }
}
