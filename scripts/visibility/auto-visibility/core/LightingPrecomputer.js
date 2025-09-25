/**
 * LightingPrecomputer precomputes light levels for a set of tokens at their current positions.
 */
export class LightingPrecomputer {
    // Short-term memoization for lighting environment hash (200ms TTL for more aggressive caching)
    static #lightingHashMemo = { hash: null, ts: 0 };
    // Cache for expensive canvas.tokens API calls (100ms TTL for rapid batch sequences)
    static #cachedTokenData = { tokens: null, timestamp: 0 };
    /**
     * @param {Map<string, {x:number,y:number,elevation:number}>} [positions] - optional position map
     * @param {Iterable<Token>} tokens - tokens to precompute for
     * @returns {Promise<{map: Map<string, any>, stats: {batch: string, targetUsed: number, targetMiss: number, observerUsed: number, observerMiss: number}}>} 
     */
    static async precompute(tokens, positions = undefined, previous = undefined) {
        const stats = { batch: 'process', targetUsed: 0, targetMiss: 0, observerUsed: 0, observerMiss: 0 };
        let map = null;
        let posKeyMap = null;
        let currentLightingHash = null;
        try {
            const prevMap = previous?.map instanceof Map ? previous.map : null;
            const prevPosKeyMap = previous?.posKeyMap instanceof Map ? previous.posKeyMap : null;
            const previousTs = typeof previous?.ts === 'number' ? previous.ts : 0;
            const nowTs = Date.now();
            const BURST_TTL_MS = 150; // very short TTL for micro-batch reuse (skip lighting hash)

            // Super-fast path: within burst TTL, reuse previous results if token set and posKeys are unchanged.
            // This avoids computing the lighting environment hash entirely for micro-batches where nothing moved.
            if (prevMap && prevPosKeyMap && previousTs && (nowTs - previousTs) < BURST_TTL_MS) {
                const gs = canvas.grid?.size || 1;
                const quant = Math.max(1, Math.floor(gs / 2)); // half-grid quantization

                let allPositionsUnchanged = true;
                const currentTokenIds = new Set();

                for (const tok of tokens) {
                    const id = tok?.document?.id;
                    if (!id) continue;
                    currentTokenIds.add(id);
                    try {
                        const pos = positions?.get?.(id) || LightingPrecomputer.#getPos(tok);
                        const posKey = `${Math.round(pos.x / quant) * quant}:${Math.round(pos.y / quant) * quant}:${pos.elevation || 0}`;
                        if (!prevPosKeyMap.has(id) || prevPosKeyMap.get(id) !== posKey) {
                            allPositionsUnchanged = false;
                            break;
                        }
                    } catch {
                        allPositionsUnchanged = false;
                        break;
                    }
                }

                if (allPositionsUnchanged && prevMap.size === currentTokenIds.size) {
                    for (const id of currentTokenIds) {
                        if (!prevMap.has(id)) { allPositionsUnchanged = false; break; }
                    }
                }

                if (allPositionsUnchanged) {
                    stats.targetUsed = prevMap.size;
                    stats.fastPathUsed = true;
                    // Preserve prior lighting hash if available; do not recompute
                    const lightingHash = previous?.lightingHash || null;
                    return { map: prevMap, stats, posKeyMap: prevPosKeyMap, lightingHash };
                }
            }

            const { LightingCalculator } = await import('../LightingCalculator.js');
            const lightingCalculator = LightingCalculator.getInstance?.();
            if (!lightingCalculator) return { map, stats, posKeyMap };

            // OPTIMIZATION: Compute lighting hash once and reuse throughout the batch
            currentLightingHash = LightingPrecomputer.#getLightingEnvironmentHash();
            const previousLightingHash = previous?.lightingHash;
            const lightingChanged = currentLightingHash !== previousLightingHash;
            stats.lightingChanged = !!previousLightingHash && lightingChanged;

            // Early return optimization: if we have previous data, check if both token positions 
            // AND lighting environment are unchanged
            if (prevMap && prevPosKeyMap && tokens && !lightingChanged) {
                const gs = canvas.grid?.size || 1;
                const quant = Math.max(1, Math.floor(gs / 2)); // half-grid quantization

                let allPositionsUnchanged = true;
                const currentTokenIds = new Set();

                // Quick pass to check if all positions are unchanged
                for (const tok of tokens) {
                    const id = tok?.document?.id;
                    if (!id) continue;
                    currentTokenIds.add(id);

                    try {
                        const pos = positions?.get?.(id) || LightingPrecomputer.#getPos(tok);
                        const posKey = `${Math.round(pos.x / quant) * quant}:${Math.round(pos.y / quant) * quant}:${pos.elevation || 0}`;

                        if (!prevPosKeyMap.has(id) || prevPosKeyMap.get(id) !== posKey) {
                            allPositionsUnchanged = false;
                            break;
                        }
                    } catch {
                        allPositionsUnchanged = false;
                        break;
                    }
                }

                // Check if token set is identical (no additions/removals)
                if (allPositionsUnchanged && prevMap.size === currentTokenIds.size) {
                    for (const id of currentTokenIds) {
                        if (!prevMap.has(id)) {
                            allPositionsUnchanged = false;
                            break;
                        }
                    }
                }

                // If everything is unchanged, return the previous results immediately
                if (allPositionsUnchanged) {
                    stats.targetUsed = prevMap.size;
                    stats.targetMiss = 0;
                    stats.fastPathUsed = true; // Track that we used the fast path
                    return { map: prevMap, stats, posKeyMap: prevPosKeyMap, lightingHash: currentLightingHash };
                }
            }

            const gs = canvas.grid?.size || 1;
            const quant = Math.max(1, Math.floor(gs / 2)); // half-grid quantization

            map = new Map();
            posKeyMap = new Map();

            for (const tok of tokens) {
                const id = tok?.document?.id;
                if (!id) continue;
                try {
                    const pos = positions?.get?.(id) || LightingPrecomputer.#getPos(tok);
                    const posKey = `${Math.round(pos.x / quant) * quant}:${Math.round(pos.y / quant) * quant}:${pos.elevation || 0}`;
                    posKeyMap.set(id, posKey);

                    // Reuse if previous value exists and position key unchanged AND lighting environment hasn't changed
                    const canReuseCache = !lightingChanged && prevMap && prevPosKeyMap && prevPosKeyMap.get(id) === posKey && prevMap.has(id);
                    if (canReuseCache) {
                        map.set(id, prevMap.get(id));
                        stats.targetUsed += 1;
                        continue;
                    }

                    const light = lightingCalculator.getLightLevelAt(pos, tok);
                    map.set(id, light);
                    stats.targetMiss += 1;
                } catch {
                    // best-effort per token
                }
            }
        } catch {
            map = null;
            posKeyMap = null;
        }
        // Use already computed lighting hash to avoid redundant computation
        const finalLightingHash = currentLightingHash || LightingPrecomputer.#getLightingEnvironmentHash();
        const precomputeEnd = performance.now();
        return { map, stats, posKeyMap, lightingHash: finalLightingHash };
    }

    /**
     * Generate a hash of the current lighting environment to detect changes.
     * @returns {string} Hash representing current lighting state
     */
    static #getLightingEnvironmentHash() {
        // Aggressive memoization (200ms) to avoid expensive canvas API calls during rapid batch sequences
        const now = Date.now();
        if (LightingPrecomputer.#lightingHashMemo.hash && (now - LightingPrecomputer.#lightingHashMemo.ts) < 200) {
            return LightingPrecomputer.#lightingHashMemo.hash;
        }

        const hashStart = performance.now();
        try {
            const scene = canvas.scene;
            if (!scene) return 'no-scene';

            const parts = [];

            // Include global darkness level
            parts.push(`darkness:${scene.environment?.darknessLevel || 0}`);

            // OPTIMIZED: Streamlined ambient light processing - only essential properties
            const lights = scene.lights?.contents || [];
            if (lights.length > 0) {
                let lightHash = '';
                for (const light of lights) {
                    if (light.hidden === true) continue;
                    const config = light.config || {};
                    // Only include properties that significantly affect lighting calculations
                    lightHash += `${light.id}:${light.x}:${light.y}:${light.disabled ? 0 : 1}:${config.bright || 0}:${config.dim || 0}|`;
                }
                parts.push(`lights:${lightHash}`);
            } else {
                parts.push('lights:none');
            }

            // OPTIMIZED: Streamlined token light processing with aggressive caching
            try {
                let tokens;
                const canvasCallStart = performance.now();

                // Use cached tokens if available and recent (within 100ms)
                if (LightingPrecomputer.#cachedTokenData.tokens &&
                    (now - LightingPrecomputer.#cachedTokenData.timestamp) < 100) {
                    tokens = LightingPrecomputer.#cachedTokenData.tokens;
                } else {
                    // Expensive canvas API call - cache the result
                    tokens = canvas.tokens?.placeables || [];
                    LightingPrecomputer.#cachedTokenData = {
                        tokens: tokens,
                        timestamp: now
                    };
                    const canvasCallTime = performance.now() - canvasCallStart;
                }

                if (tokens.length > 0) {
                    let tokenLightHash = '';
                    for (const token of tokens) {
                        const lightConfig = token.document?.light;
                        if (!lightConfig || (lightConfig.bright <= 0 && lightConfig.dim <= 0) || token.document.hidden) continue;
                        // Include ALL properties that affect lighting calculations, especially for directional lights
                        const angle = lightConfig.angle || 360;
                        const lightRotation = lightConfig.rotation || 0;
                        const tokenRotation = token.document.rotation || 0;


                        tokenLightHash += `${token.id}:${token.x}:${token.y}:${lightConfig.bright || 0}:${lightConfig.dim || 0}:${angle}:${lightRotation}:${tokenRotation}|`;
                    }
                    const tokenLightPart = `tokenLights:${tokenLightHash}`;
                    parts.push(tokenLightPart);
                } else {
                    parts.push('tokenLights:none');
                }
            } catch {
                parts.push('tokenLights:none');
            }

            // OPTIMIZED: Simplified region processing - only check if regions exist
            try {
                const regions = scene.regions?.contents || [];
                if (regions.length > 0) {
                    let regionHash = '';
                    for (const r of regions) {
                        const darknessBehavior = r.behaviors?.find(b => b.active && b.type === 'adjustDarknessLevel');
                        if (darknessBehavior) {
                            regionHash += `${r.id}:${darknessBehavior.system?.darknessLevel || 0}|`;
                        }
                    }
                    parts.push(`regions:${regionHash}`);
                } else {
                    parts.push('regions:none');
                }
            } catch {
                parts.push('regions:none');
            }

            const hash = parts.join(';');
            // Store in memo for short-term reuse
            LightingPrecomputer.#lightingHashMemo = { hash, ts: now };
            return hash;
        } catch {
            const hashEnd = performance.now();
            // Fallback hash that will force recalculation
            const fallbackHash = `fallback:${Date.now()}`;
            LightingPrecomputer.#lightingHashMemo = { hash: fallbackHash, ts: now };
            return fallbackHash;
        }
    }

    static #getPos(tok) {
        const gs = canvas.grid?.size || 1;
        return {
            x: tok.document.x + (tok.document.width * gs) / 2,
            y: tok.document.y + (tok.document.height * gs) / 2,
            elevation: tok.document.elevation || 0,
        };
    }
}
