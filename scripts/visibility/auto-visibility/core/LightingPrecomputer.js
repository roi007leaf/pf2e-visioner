/**
 * LightingPrecomputer precomputes light levels for a set of tokens at their current positions.
 */
import { MODULE_ID } from '../../../constants.js';
export class LightingPrecomputer {
    // Short-term memoization for lighting environment hash (200ms TTL for more aggressive caching)
    static #lightingHashMemo = { hash: null, ts: 0 };
    // Cache for expensive canvas.tokens API calls (100ms TTL for rapid batch sequences)
    static #cachedTokenData = { tokens: null, timestamp: 0 };
    // Force flag to bypass burst optimization when lighting changes without token movement
    static #forceFreshComputation = false;
    static #forceResetTimeout = null;
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
            // Skip this optimization if we've been told to force fresh computation (e.g., lighting changed)
            const shouldBypassBurstOptimization = LightingPrecomputer.#forceFreshComputation;

            if (prevMap && prevPosKeyMap && previousTs && (nowTs - previousTs) < BURST_TTL_MS && !shouldBypassBurstOptimization) {
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
                    // Don't reset the force flag here - let it persist for rapid batches
                    return { map: prevMap, stats, posKeyMap: prevPosKeyMap, lightingHash };
                }
            }

            const { LightingCalculator } = await import('../LightingCalculator.js');
            const lightingCalculator = LightingCalculator.getInstance?.();
            if (!lightingCalculator) {
                // Don't reset the force flag on error - let it persist
                return { map, stats, posKeyMap };
            }

            // OPTIMIZATION: Compute lighting hash once and reuse throughout the batch
            currentLightingHash = LightingPrecomputer.#getLightingEnvironmentHash();
            const previousLightingHash = previous?.lightingHash;
            // Treat lighting as changed if the force flag is set, ensuring a full recompute after cache clears
            const lightingChanged = LightingPrecomputer.#forceFreshComputation || (currentLightingHash !== previousLightingHash);
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
                    // Always get current position from token document to avoid stale data
                    const currentPos = LightingPrecomputer.#getPos(tok);
                    const providedPos = positions?.get?.(id);

                    // Use provided position only if it matches current token position exactly
                    let pos = currentPos;
                    if (providedPos &&
                        providedPos.x === currentPos.x &&
                        providedPos.y === currentPos.y &&
                        (providedPos.elevation || 0) === (currentPos.elevation || 0)) {
                        pos = providedPos;
                    }

                    const posKey = `${Math.round(pos.x / quant) * quant}:${Math.round(pos.y / quant) * quant}:${pos.elevation || 0}`;
                    posKeyMap.set(id, posKey);

                    // Reuse if previous value exists and position key unchanged AND lighting environment hasn't changed
                    // Additional safety: ensure the previous position key actually exists and matches exactly
                    const prevPosKey = prevPosKeyMap?.get(id);
                    const hasPrevData = prevMap?.has(id) && prevPosKey !== undefined;
                    const positionUnchanged = hasPrevData && prevPosKey === posKey;
                    const canReuseCache = !lightingChanged && positionUnchanged;

                    if (canReuseCache) {
                        map.set(id, prevMap.get(id));
                        stats.targetUsed += 1;
                        continue;
                    }

                    // Position changed or no previous data - recalculate
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
        // Don't reset the force flag here - let it persist for a brief time to handle multiple rapid batches
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
                    // Use native Foundry light config
                    const config = light.config || {};
                    // Only include properties that significantly affect lighting calculations
                    // Include native darkness toggle and module flags that affect visibility logic
                    const negative = config?.negative ? 1 : 0;
                    let heightened = 0;
                    let rank = 0;
                    try {
                        heightened = light.getFlag?.(MODULE_ID, 'heightenedDarkness') ? 1 : 0;
                        rank = Number(light.getFlag?.(MODULE_ID, 'darknessRank') ?? 0) || 0;
                    } catch { /* ignore flag access issues */ }
                    lightHash += `${light.id}:${light.center?.x || light.x || 0}:${light.center?.y || light.y || 0}:${light.disabled ? 0 : 1}:${light.brightRadius || light.config?.bright || 0}:${light.dimRadius || light.config?.dim || 0}:${negative}:${heightened}:${rank}|`;
                }
                parts.push(`lights:${lightHash}`);
            } else {
                parts.push('lights:none');
            }

            // OPTIMIZED: Streamlined token light processing with aggressive caching
            try {
                let tokens;

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
                }

                if (tokens.length > 0) {
                    let tokenLightHash = '';
                    for (const token of tokens) {
                        const lightConfig = token.document?.light;
                        // Use native Foundry visibility check
                        if (!lightConfig || (lightConfig.bright <= 0 && lightConfig.dim <= 0) || token.isVisible === false || token.document.hidden) continue;
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
            // Fallback hash that will force recalculation
            const fallbackHash = `fallback:${Date.now()}`;
            LightingPrecomputer.#lightingHashMemo = { hash: fallbackHash, ts: now };
            return fallbackHash;
        }
    }

    /**
     * Check if fresh lighting computation is being forced
     * @returns {boolean} True if visibility calculations should skip global cache
     */
    static isForcingFreshComputation() {
        return LightingPrecomputer.#forceFreshComputation;
    }

    /**
     * Clear all static caches to force fresh lighting calculations
     * Called when ambient lights change to ensure lighting environment hash is recalculated
     * @param {GlobalVisibilityCache} [globalVisibilityCache] - Optional global cache to clear
     */
    static clearLightingCaches(globalVisibilityCache = null) {
        LightingPrecomputer.#lightingHashMemo = { hash: null, ts: 0 };
        LightingPrecomputer.#cachedTokenData = { tokens: null, timestamp: 0 };
        LightingPrecomputer.#forceFreshComputation = true; // Force bypass of burst optimization

        if (globalVisibilityCache) {
            globalVisibilityCache.clear();
        }

        // Clear any existing timeout
        if (LightingPrecomputer.#forceResetTimeout) {
            clearTimeout(LightingPrecomputer.#forceResetTimeout);
        }

        // Reset the force flag after a brief delay to allow multiple rapid batches to complete
        // Extended to 3000ms to match global visibility cache TTL and prevent stale entries
        LightingPrecomputer.#forceResetTimeout = setTimeout(() => {
            LightingPrecomputer.#forceFreshComputation = false;
            LightingPrecomputer.#forceResetTimeout = null;
        }, 3000); // Match global visibility cache TTL to prevent stale cache entries
    }

    static #getPos(tok) {
        // Use native Foundry properties for position calculation
        return {
            x: tok.document.x + tok.w / 2,
            y: tok.document.y + tok.h / 2,
            elevation: tok.document.elevation || 0,
        };
    }
}
