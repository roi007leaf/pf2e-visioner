// RegionHelper
// Centralizes region-related utilities (point-in-region tests, behaviors, environment types, terrain checks)

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

export default class RegionHelper {
    // Get region behaviors array (safe)
    static getBehaviors(region) {
        try {
            return region?.document?.behaviors ?? [];
        } catch { return []; }
    }

    // Get region bounds box (safe)
    static getBounds(region) {
        try {
            return region?.bounds ?? region?.document?.bounds ?? null;
        } catch { return null; }
    }

    // Generic point-in-region support
    static isPointInside(region, point) {
        try {
            if (!region || !point) return false;
            // Prefer RegionDocument#testPoint with ElevatedPoint in v13+
            if (typeof region?.document?.testPoint === 'function') {
                const elev = (p) => ({ x: p.x, y: p.y, z: p.z ?? p.elevation ?? 0 });
                try { if (region.document.testPoint(elev(point))) return true; } catch { }
            }
            // Some regions expose containsPoint in different signatures
            if (typeof region?.containsPoint === 'function') {
                try { if (region.containsPoint(point)) return true; } catch { }
                try { if (region.containsPoint(point.x, point.y)) return true; } catch { }
            }
            if (region?.shape && typeof region.shape.containsPoint === 'function' && typeof PIXI !== 'undefined') {
                try { if (region.shape.containsPoint(new PIXI.Point(point.x, point.y))) return true; } catch { }
            }
            // Polygon arrays in various props
            const pts = region.points ?? region.geometry?.points ?? region.boundary ?? null;
            if (Array.isArray(pts) && pts.length) {
                const poly = pts.map((p) => (Array.isArray(p) ? p : [p.x ?? p[0], p.y ?? p[1]]));
                let inside = false;
                for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                    const xi = poly[i][0], yi = poly[i][1];
                    const xj = poly[j][0], yj = poly[j][1];
                    const intersect = (yi > point.y) !== (yj > point.y) && point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || 1e-9) + xi;
                    if (intersect) inside = !inside;
                }
                return inside;
            }
            // Bounds fallback
            const b = this.getBounds(region);
            if (b) return point.x >= b.x && point.x <= (b.x + b.width) && point.y >= b.y && point.y <= (b.y + b.height);
        } catch { }
        return false;
    }

    // Token-or-point convenience wrapper
    static isTokenInside(region, tokenOrPoint) {
        try {
            const c = tokenOrPoint?.center ?? tokenOrPoint;
            if (!c) return false;
            // Build elevated point from token/document when possible
            const elevation = tokenOrPoint?.document?.elevation ?? tokenOrPoint?.elevation ?? tokenOrPoint?.elevationZ ?? c?.z ?? c?.elevation ?? 0;
            const pt = { x: c.x, y: c.y, z: elevation };
            return this.isPointInside(region, pt);
        } catch { return false; }
    }

    // Difficult terrain heuristic
    static hasDifficultTerrain(region) {
        try {
            const behaviors = this.getBehaviors(region);
            for (const b of behaviors) {
                const t = String(b?.type ?? '').toLowerCase();
                const sys = b?.system ?? b?.value?.system ?? {};
                // Primary: environmentfeature behavior with system.terrain.difficult
                if (t === 'environmentfeature' || t.includes('environmentfeature')) {
                    if (sys?.terrain?.difficult) return true;
                }
                // Fallback heuristics for older/custom data
                if (t.includes('difficult')) return true;
                if (sys?.terrain && typeof sys.terrain === 'object') {
                    try { if (sys.terrain.difficult) return true; } catch { }
                }
                const keys = Object.keys(sys).map((k) => k.toLowerCase());
                if (keys.some((k) => k.includes('difficult'))) return true;
            }
        } catch { }
        return false;
    }

    // Extract environment types attached to region behaviors
    static extractEnvironmentTypes(region) {
        const set = new Set();
        try {
            // 1) Core behaviors-provided environment types
            const behaviors = this.getBehaviors(region);
            for (const b of behaviors) {
                const viaValue = b?.value?.system?.environmentTypes;
                const _viaSystem = b?.system?.environmentTypes;
                const viaSystem = _viaSystem instanceof Set ? Array.from(_viaSystem) : _viaSystem;
                // Removed debugger statement
                const push = (val) => {
                    if (!val) return;
                    if (Array.isArray(val)) {
                        for (const v of val) if (v) set.add(normalizeSlug(String(v)));
                    } else if (typeof val === 'object') {
                        for (const [k, v] of Object.entries(val)) if (v) set.add(normalizeSlug(String(k)));
                    } else if (typeof val === 'string') {
                        set.add(normalizeSlug(val));
                    }
                };
                push(viaValue ?? viaSystem);
            }

            // 2) Also respect explicit flags on the Region document: flags.pf2e.environmentTypes
            try {
                const flagEnv = region?.document?.flags?.pf2e?.environmentTypes;
                if (flagEnv) {
                    if (Array.isArray(flagEnv)) {
                        for (const v of flagEnv) if (v) set.add(normalizeSlug(String(v)));
                    } else if (typeof flagEnv === 'object') {
                        for (const [k, v] of Object.entries(flagEnv)) if (v) set.add(normalizeSlug(String(k)));
                    } else if (typeof flagEnv === 'string') {
                        set.add(normalizeSlug(flagEnv));
                    }
                }
            } catch { /* ignore */ }
        } catch { }
        return set;
    }
}
