import { GlobalLosCache } from "../utils/GlobalLosCache.js";
import { GlobalVisibilityCache } from "../utils/GlobalVisibilityCache.js";
import { SpatialAnalysisService } from "./SpatialAnalysisService.js";
import { ViewportFilterService } from "./ViewportFilterService.js";

/**
 * BatchProcessor centralizes the heavy per-batch computation:
 * - Token collection per-changed-token (spatial + optional viewport filter)
 * - LOS checks (via SpatialAnalyzer)
 * - Directional visibility calculation with positional overrides
 * - Override resolution (active overrides + legacy flags) and delta extraction
 * Returns the list of updates to apply plus per-batch breakdown counters.
 */
export class BatchProcessor {
    /**
     * Creates a new BatchProcessor with injected dependencies.
     * @param {Object} dependencies - All required dependencies
     * @param {SpatialAnalysisService} dependencies.spatialAnalyzer - SpatialAnalyzer instance
     * @param {ViewportFilterService|null} dependencies.viewportFilter - ViewportFilter instance (optional)
     * @param {Object} dependencies.optimizedVisibilityCalculator
     * @param {GlobalLosCache} dependencies.globalLosCache - Global LOS cache for optimization
     * @param {GlobalVisibilityCache} dependencies.globalVisibilityCache - Global visibility cache for optimization
     * @param {(t:Token)=>{x:number,y:number,elevation:number}} dependencies.getTokenPosition
     * @param {(observerId:string,targetId:string)=>{state:string}|null} dependencies.getActiveOverride
     * @param {(token:Token)=>Record<string,string>} dependencies.getVisibilityMap
     * @param {number} dependencies.maxVisibilityDistance
     */
    constructor(dependencies) {
        this.spatialAnalyzer = dependencies.spatialAnalyzer;
        this.viewportFilter = dependencies.viewportFilter;
        this.optimizedVisibilityCalculator = dependencies.optimizedVisibilityCalculator;
        this.globalLosCache = dependencies.globalLosCache;
        this.globalVisibilityCache = dependencies.globalVisibilityCache;
        this.getTokenPosition = dependencies.getTokenPosition;
        this.getActiveOverride = dependencies.getActiveOverride;
        this.getVisibilityMap = dependencies.getVisibilityMap;
        this.maxVisibilityDistance = dependencies.maxVisibilityDistance;
    }

    /**
     * Process a batch of changed tokens and compute visibility updates.
     * @param {Token[]} allTokens - tokens eligible for processing (already exclusion+viewport filtered)
     * @param {Set<string>} changedTokenIds - ids of tokens that changed this batch
     * @param {Object} calcOptions - options passed to calculator (precomputedLights, hasDarknessSources, precomputeStats)
     * @returns {Promise<{updates:Array<{observer:Token,target:Token,visibility:string}>, breakdown:any, processedTokens:number, precomputeStats:any}>}
     */
    async process(allTokens, changedTokenIds, calcOptions) {
        // Use injected dependencies and establish per-batch memoization

        const updates = [];
        const batchVisibilityCache = new Map(); // directional cache
        const batchLosCache = new Map();
        const breakdown = {
            pairsConsidered: 0,
            pairsComputed: 0,
            pairsCached: 0,
            pairsSkippedSpatial: 0,
            pairsSkippedLOS: 0,
            pairsSkippedOverride: 0,
            pairsSkippedNoChange: 0,
            losCacheHits: 0,
            losCacheMisses: 0,
            visGlobalHits: 0,
            visGlobalMisses: 0,
            visGlobalExpired: 0,
            losGlobalHits: 0,
            losGlobalMisses: 0,
            losGlobalExpired: 0,
        };
        let processedTokens = 0;

        // Precompute token positions and position keys once per batch
        const posById = new Map();
        const posKeyById = new Map();
        for (const t of allTokens) {
            try {
                const p = this.getTokenPosition(t);
                posById.set(t.document.id, p);
                const k = `${Math.round(p.x)}:${Math.round(p.y)}:${p.elevation ?? 0}`;
                posKeyById.set(t.document.id, k);
            } catch {
                // Best-effort; missing positions will be computed on-demand below
            }
        }

        // Cache visibility maps once per token for original state comparisons
        const visMapById = new Map();
        for (const t of allTokens) {
            try {
                visMapById.set(t.document.id, this.getVisibilityMap?.(t) || {});
            } catch {
                visMapById.set(t.document.id, {});
            }
        }

        // Memoize overrides per directed pair (a->b)
        const overrideMemo = new Map();
        const getOverrideState = (aId, bId, tokenA, tokenB) => {
            const key = `${aId}->${bId}`;
            if (overrideMemo.has(key)) return overrideMemo.get(key);
            let state = null;
            try {
                const avsOverride = this.getActiveOverride?.(aId, bId) || null;
                if (avsOverride?.state) {
                    state = avsOverride.state;
                } else {
                    // Legacy flag fallback on tokenB
                    const overrideFlagKey = `avs-override-from-${aId}`;
                    const flag = tokenB?.document?.getFlag?.('pf2e-visioner', overrideFlagKey);
                    if (flag?.state) state = flag.state;
                }
            } catch {
                // noop
            }
            overrideMemo.set(key, state);
            return state;
        };

        for (const changedTokenId of changedTokenIds) {
            const changedToken = allTokens.find((t) => t.document.id === changedTokenId);
            if (!changedToken) {
                continue;
            }
            processedTokens++;

            // Use precomputed position if available
            const changedTokenPos = posById.get(changedTokenId) || this.getTokenPosition(changedToken);
            let relevantTokens = this.spatialAnalyzer.getTokensInRange(
                changedTokenPos,
                this.maxVisibilityDistance,
                changedTokenId,
            );

            // Optional client-side viewport filtering for relevant tokens
            if (this.viewportFilter?.isEnabled?.()) {
                const inView = this.viewportFilter.getTokenIdSet?.(64, undefined, this.getTokenPosition) || null;
                if (inView && inView.size > 0) {
                    relevantTokens = relevantTokens.filter((t) => inView.has(t.document.id));
                }
            }

            const potentialOthers = Math.max(0, allTokens.length - 1);
            const spatiallySkipped = Math.max(0, potentialOthers - relevantTokens.length);
            breakdown.pairsSkippedSpatial += spatiallySkipped * 2;

            for (const otherToken of relevantTokens) {
                if (otherToken.document.id === changedTokenId) continue;

                const aId = changedToken.document.id;
                const bId = otherToken.document.id;
                const posA = changedTokenPos; // reuse memoized
                const posB = posById.get(bId) || this.getTokenPosition(otherToken);

                const posKeyA = posKeyById.get(aId) || `${Math.round(posA.x)}:${Math.round(posA.y)}:${posA.elevation ?? 0}`;
                const posKeyB = posKeyById.get(bId) || `${Math.round(posB.x)}:${Math.round(posB.y)}:${posB.elevation ?? 0}`;
                const pairKey = aId < bId ? `${aId}|${posKeyA}::${bId}|${posKeyB}` : `${bId}|${posKeyB}::${aId}|${posKeyA}`;

                // Capture ORIGINAL map values BEFORE any calculations or override application
                // This ensures we compare against the true previous state, not values updated during processing
                const originalVisibility1 = visMapById.get(aId)?.[bId] || 'observed';
                const originalVisibility2 = visMapById.get(bId)?.[aId] || 'observed';

                let effectiveVisibility1, effectiveVisibility2;
                let hasOverride1 = false;
                let hasOverride2 = false;

                // Active override (new system)
                try {
                    const s1 = getOverrideState(aId, bId, changedToken, otherToken);
                    if (s1) { effectiveVisibility1 = s1; hasOverride1 = true; }
                    const s2 = getOverrideState(bId, aId, otherToken, changedToken);
                    if (s2) { effectiveVisibility2 = s2; hasOverride2 = true; }
                } catch (overrideError) {
                    console.warn('PF2E Visioner | Failed to check visibility overrides:', overrideError);
                }

                // If either direction has an active override (including legacy flags),
                // avoid expensive calculations and apply only the override(s) as updates.
                if (hasOverride1 || hasOverride2) {
                    if (hasOverride1) breakdown.pairsSkippedOverride += 1;
                    if (hasOverride2) breakdown.pairsSkippedOverride += 1;

                    if (hasOverride1 && effectiveVisibility1 !== originalVisibility1) {
                        updates.push({ observer: changedToken, target: otherToken, visibility: effectiveVisibility1 });
                    }
                    if (hasOverride2 && effectiveVisibility2 !== originalVisibility2) {
                        updates.push({ observer: otherToken, target: changedToken, visibility: effectiveVisibility2 });
                    }
                    continue;
                }

                // Early short-circuit: if both directional vis states are in global cache and equal originals, skip pair entirely
                {
                    const vKey1 = `${aId}|${posKeyA}>>${bId}|${posKeyB}`;
                    const vKey2 = `${bId}|${posKeyB}>>${aId}|${posKeyA}`;
                    let hit1 = null, hit2 = null;
                    if (this.globalVisibilityCache) {
                        const g1 = this.globalVisibilityCache.getWithMeta(vKey1);
                        const g2 = this.globalVisibilityCache.getWithMeta(vKey2);
                        if (g1.state === 'hit') {
                            hit1 = g1.value; breakdown.visGlobalHits++;
                        } else if (g1.state === 'expired') {
                            breakdown.visGlobalExpired++; breakdown.visGlobalMisses++;
                        } else {
                            breakdown.visGlobalMisses++;
                        }
                        if (g2.state === 'hit') {
                            hit2 = g2.value; breakdown.visGlobalHits++;
                        } else if (g2.state === 'expired') {
                            breakdown.visGlobalExpired++; breakdown.visGlobalMisses++;
                        } else {
                            breakdown.visGlobalMisses++;
                        }
                    }
                    if (hit1 !== null && hit2 !== null && hit1 === originalVisibility1 && hit2 === originalVisibility2) {
                        // Nothing to update for this pair; skip LOS and further work
                        breakdown.pairsSkippedNoChange++;
                        continue;
                    }
                }

                // Check LOS with global cache integration (after early no-change short-circuit)
                let los = batchLosCache.get(pairKey);
                if (los === undefined) {
                    // Check global LOS cache first
                    if (this.globalLosCache) {
                        const globalResult = this.globalLosCache.getWithMeta(pairKey);
                        if (globalResult.state === 'hit') {
                            los = globalResult.value;
                            breakdown.losGlobalHits++;
                        } else if (globalResult.state === 'expired') {
                            breakdown.losGlobalExpired++;
                            breakdown.losGlobalMisses++;
                        } else {
                            breakdown.losGlobalMisses++;
                        }
                    }

                    // If not in global cache, compute it
                    if (los === undefined) {
                        los = this.spatialAnalyzer.canTokensSeeEachOther(changedToken, otherToken);
                        // Store in global cache for future use
                        if (this.globalLosCache) {
                            this.globalLosCache.set(pairKey, los);
                        }
                    }

                    batchLosCache.set(pairKey, los);
                }

                if (!los) {
                    // tokens filtered by LOS are skipped
                    breakdown.pairsSkippedLOS++;
                    continue;
                }

                // Compute visibility in both directions when not overridden
                {
                    breakdown.pairsConsidered++;
                    const vKey1 = `${aId}|${posKeyA}>>${bId}|${posKeyB}`;
                    let visibility1 = batchVisibilityCache.get(vKey1);
                    if (visibility1 === undefined) {
                        // Check global visibility cache first
                        if (this.globalVisibilityCache) {
                            const globalResult = this.globalVisibilityCache.getWithMeta(vKey1);
                            if (globalResult.state === 'hit') {
                                visibility1 = globalResult.value;
                                breakdown.visGlobalHits++;
                            } else if (globalResult.state === 'expired') {
                                breakdown.visGlobalExpired++;
                                breakdown.visGlobalMisses++;
                            } else {
                                breakdown.visGlobalMisses++;
                            }
                        }

                        // If not in global cache, compute it
                        if (visibility1 === undefined) {
                            visibility1 = await this.optimizedVisibilityCalculator.calculateVisibilityWithPosition(
                                changedToken,
                                otherToken,
                                posA,
                                posB,
                                calcOptions,
                            );
                            // Store in global cache for future use
                            if (this.globalVisibilityCache) {
                                this.globalVisibilityCache.set(vKey1, visibility1);
                            }
                            breakdown.pairsComputed++;
                        }

                        batchVisibilityCache.set(vKey1, visibility1);
                    } else {
                        breakdown.pairsCached++;
                    }
                    effectiveVisibility1 = visibility1;
                }
                {
                    breakdown.pairsConsidered++;
                    const vKey2 = `${bId}|${posKeyB}>>${aId}|${posKeyA}`;
                    let visibility2 = batchVisibilityCache.get(vKey2);
                    if (visibility2 === undefined) {
                        // Check global visibility cache first
                        if (this.globalVisibilityCache) {
                            const globalResult = this.globalVisibilityCache.getWithMeta(vKey2);
                            if (globalResult.state === 'hit') {
                                visibility2 = globalResult.value;
                                breakdown.visGlobalHits++;
                            } else if (globalResult.state === 'expired') {
                                breakdown.visGlobalExpired++;
                                breakdown.visGlobalMisses++;
                            } else {
                                breakdown.visGlobalMisses++;
                            }
                        }

                        // If not in global cache, compute it
                        if (visibility2 === undefined) {
                            visibility2 = await this.optimizedVisibilityCalculator.calculateVisibilityWithPosition(
                                otherToken,
                                changedToken,
                                posB,
                                posA,
                                calcOptions,
                            );
                            // Store in global cache for future use
                            if (this.globalVisibilityCache) {
                                this.globalVisibilityCache.set(vKey2, visibility2);
                            }
                            breakdown.pairsComputed++;
                        }

                        batchVisibilityCache.set(vKey2, visibility2);
                    } else {
                        breakdown.pairsCached++;
                    }
                    effectiveVisibility2 = visibility2;
                }

                // Queue updates if changed from ORIGINAL map state (before any calculations)
                if (effectiveVisibility1 !== originalVisibility1) {
                    updates.push({ observer: changedToken, target: otherToken, visibility: effectiveVisibility1 });
                }
                if (effectiveVisibility2 !== originalVisibility2) {
                    updates.push({ observer: otherToken, target: changedToken, visibility: effectiveVisibility2 });
                }
            }
        }

        // Periodically prune expired cache entries
        if (this.globalLosCache) {
            this.globalLosCache.pruneIfDue(1000);
        }
        if (this.globalVisibilityCache) {
            this.globalVisibilityCache.pruneIfDue(1000);
        }

        return { updates, breakdown, processedTokens, precomputeStats: calcOptions?.precomputeStats };
    }
}
