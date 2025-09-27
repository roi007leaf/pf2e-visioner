// EnvironmentHelper
// Centralizes environment detection logic used across actions and feats.

function normalizeSlug(value = '') {
    try {
        const lower = String(value).toLowerCase();
        const noApos = lower.replace(/\u2019/g, "'").replace(/'+/g, '');
        const dashed = noApos.replace(/[^a-z0-9]+/g, '-');
        return dashed.replace(/^-+|-+$/g, '');
    } catch {
        return value;
    }
}

import RegionHelper from './region.js';

export default class EnvironmentHelper {
    // --- Resolution helpers
    static resolveActor(tokenOrActor) {
        if (!tokenOrActor) return null;
        if (tokenOrActor.actor) return tokenOrActor.actor;
        if (tokenOrActor.document?.actor) return tokenOrActor.document.actor;
        if (tokenOrActor.system?.attributes) return tokenOrActor; // already an actor
        return null;
    }

    static resolveToken(tokenOrActor) {
        try {
            if (!tokenOrActor) return null;
            if (tokenOrActor?.isToken || tokenOrActor?.center) return tokenOrActor;
            if (tokenOrActor?.object?.isToken || tokenOrActor?.object?.center) return tokenOrActor.object;
            if (tokenOrActor?.document?.object?.isToken) return tokenOrActor.document.object;
            const actor = this.resolveActor(tokenOrActor);
            if (actor?.getActiveTokens) {
                const tokens = actor.getActiveTokens(true);
                if (tokens?.length) return tokens[0];
            }
        } catch { }
        return null;
    }

    // --- Public API
    static isEnvironmentActive(tokenOrActor, environmentKey) {
        const key = normalizeSlug(environmentKey);
        if (!key) return false;
        const { sceneTypes, regionTypes, insideDifficult } = this.getActiveContext(tokenOrActor);

        const hasEnv = (env) => {
            const e = normalizeSlug(env);
            return sceneTypes.has(e) || regionTypes.has(e);
        };

        // Special Terrain Stalker combos
        if (key === 'underbrush') {
            // Forest environment + difficult terrain
            return hasEnv('forest') && insideDifficult;
        }
        if (key === 'rubble') {
            // Mountain, Underground, OR Urban environment + difficult terrain
            return (hasEnv('mountain') || hasEnv('underground') || hasEnv('urban')) && insideDifficult;
        }
        if (key === 'snow') {
            // Arctic environment + difficult terrain (snow is a feature that appears in arctic environments)
            return hasEnv('arctic') && insideDifficult;
        }

        // Default direct match
        return hasEnv(key);
    }

    static getActiveContext(tokenOrActor, opts = {}) {
        const movementType = opts?.movementType;
        // Scene envs
        let sceneTypes = new Set();
        try {
            sceneTypes = this.normalizeEnvTypes(canvas?.scene?.flags?.pf2e?.environmentTypes);
        } catch { }

        // Region envs for regions containing the token
        let regionTypes = new Set();
        let insideDifficult = false;
        try {
            const token = this.resolveToken(tokenOrActor);
            if (token && canvas?.regions?.placeables?.length) {
                for (const region of canvas.regions.placeables) {
                    if (!region?.document || region.document.hidden) continue;
                    if (!EnvironmentHelper.isTokenInsideRegion(token, region)) continue;

                    const envTypes = EnvironmentHelper.getRegionEnvironmentTypes(region);
                    for (const v of envTypes) regionTypes.add(v);
                    if (!insideDifficult && EnvironmentHelper.regionHasDifficultTerrain(region, movementType)) insideDifficult = true;
                }
            }
        } catch { }

        return { sceneTypes, regionTypes, insideDifficult };
    }

    /**
     * Get environment regions containing the token that match the given environment key
     * Applies Terrain Stalker combos: underbrush (forest + difficult), rubble (mountain|underground|urban + difficult), snow (arctic + difficult)
     * @param {Token|Actor} tokenOrActor
     * @param {string} environmentKey
     * @returns {Array} Array of Region placeables matching the environment for this token
     */
    static getMatchingEnvironmentRegions(tokenOrActor, environmentKey, opts = {}) {
        const key = normalizeSlug(environmentKey);
        if (!key) return [];
        const movementType = opts?.movementType;
        const matchesRegion = (region) => {
            try {
                const types = RegionHelper.extractEnvironmentTypes(region);
                const has = (env) => types.has(normalizeSlug(env));
                const difficult = RegionHelper.hasDifficultTerrain(region, movementType);
                if (key === 'underbrush') return has('forest') && difficult;
                if (key === 'rubble') return (has('mountain') || has('underground') || has('urban')) && difficult;
                if (key === 'snow') return has('arctic') && difficult;
                return has(key);
            } catch { return false; }
        };
        const token = this.resolveToken(tokenOrActor);
        if (!token || !canvas?.regions?.placeables?.length) return [];
        const regions = [];
        for (const region of canvas.regions.placeables) {
            try {
                if (!region?.document || region.document.hidden) continue;
                if (!this.isTokenInsideRegion(token, region)) continue;
                if (matchesRegion(region)) regions.push(region);
            } catch { /* ignore region */ }
        }
        return regions;
    }

    // --- Low-level helpers
    static normalizeEnvTypes(value) {
        const set = new Set();
        try {
            if (!value) return set;
            if (Array.isArray(value)) {
                for (const v of value) if (v) set.add(normalizeSlug(String(v)));
            } else if (typeof value === 'object') {
                for (const [k, v] of Object.entries(value)) if (v) set.add(normalizeSlug(String(k)));
            } else if (typeof value === 'string') {
                set.add(normalizeSlug(value));
            }
        } catch { }
        return set;
    }

    static getRegionEnvironmentTypes(region) {
        // Delegate to RegionHelper for extraction
        return RegionHelper.extractEnvironmentTypes(region);
    }

    static regionHasDifficultTerrain(region, movementType) {
        // Delegate to RegionHelper for detection
        return RegionHelper.hasDifficultTerrain(region, movementType);
    }

    static isTokenInsideRegion(token, region) {
        // Delegate to RegionHelper for containment test
        return RegionHelper.isTokenInside(region, token);
    }
}
