import { RuleElementChecker } from '../../../rule-elements/RuleElementChecker.js';
import { GlobalLosCache } from '../utils/GlobalLosCache.js';
import { GlobalVisibilityCache } from '../utils/GlobalVisibilityCache.js';
import { VisionAnalyzer } from '../VisionAnalyzer.js';
import { HashGridIndex } from './HashGridIndex.js';
import { LightingPrecomputer } from './LightingPrecomputer.js';
import { OverrideBatchCache } from './OverrideBatchCache.js';
import { OverrideService } from './OverrideService.js';
import { PositionBatchCache } from './PositionBatchCache.js';
import { PositionManager } from './PositionManager.js';
import { SensesCapabilitiesCache } from './SensesCapabilitiesCache.js';
import { ViewportFilterService } from './ViewportFilterService.js';
import { VisibilityMapBatchCache } from './VisibilityMapBatchCache.js';
import { VisibilityMapService } from './VisibilityMapService.js';

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
   * @param {ViewportFilterService|null} dependencies.viewportFilterService - ViewportFilterService instance (optional)
   * @param {Object} dependencies.optimizedVisibilityCalculator
   * @param {GlobalLosCache} dependencies.globalLosCache - Global LOS cache for optimization
   * @param {GlobalVisibilityCache} dependencies.globalVisibilityCache - Global visibility cache for optimization
   * @param {PositionManager} dependencies.positionManager
   * @param {OverrideService} dependencies.overrideService
   * @param {VisibilityMapService} dependencies.visibilityMapService
   * @param {VisionAnalyzer} dependencies.visionAnalyzer - VisionAnalyzer for senses detection
   * @param {number} dependencies.maxVisibilityDistance
   */
  constructor(dependencies) {
    this.viewportFilterService = dependencies.viewportFilterService;
    this.optimizedVisibilityCalculator = dependencies.optimizedVisibilityCalculator;
    this.globalLosCache = dependencies.globalLosCache;
    this.globalVisibilityCache = dependencies.globalVisibilityCache;
    // Prefer injected PositionManager, but support legacy getTokenPosition for tests/back-compat
    this.positionManager = dependencies.positionManager;
    this.overrideService = dependencies.overrideService;
    this.visibilityMapService = dependencies.visibilityMapService;
    this.visionAnalyzer = dependencies.visionAnalyzer || VisionAnalyzer.getInstance();
    this.maxVisibilityDistance = dependencies.maxVisibilityDistance;

    // Persistent caches to reduce expensive rebuilding between batches
    this._persistentCaches = {
      sensesCache: null,
      sensesCacheTs: 0,
      idToTokenMap: null,
      idToTokenMapTs: 0,
      spatialIndex: null,
      spatialIndexTs: 0,
      // TTL for cache invalidation (5 seconds)
      CACHE_TTL_MS: 5000,
    };
  }

  /**
   * Process a batch of changed tokens and compute visibility updates.
   * @param {Token[]} allTokens - tokens eligible for processing (already exclusion+viewport filtered)
   * @param {Set<string>} changedTokenIds - ids of tokens that changed this batch
   * @param {Object} calcOptions - options passed to calculator (precomputedLights, hasDarknessSources, precomputeStats)
   * @returns {Promise<{updates:Array<{observer:Token,target:Token,visibility:string}>, breakdown:any, processedTokens:number, precomputeStats:any, detailedTimings:Object}>}
   */
  async process(allTokens, changedTokenIds, calcOptions) {
    // Detailed timing collection for performance analysis
    const detailedTimings = {
      cacheBuilding: 0,
      lightingPrecompute: 0,
      mainProcessingLoop: 0,
      spatialFiltering: 0,
      losCalculations: 0,
      visibilityCalculations: 0,
      cacheOperations: 0,
      updateCollection: 0,
    };

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
      burstMemoHits: 0,
      visGlobalHits: 0,
      visGlobalMisses: 0,
      visGlobalExpired: 0,
      losGlobalHits: 0,
      losGlobalMisses: 0,
      losGlobalExpired: 0,
    };
    let processedTokens = 0;
    const now = Date.now();

    // Precompute token positions and position keys once per batch (always needed fresh)
    const posCache = new PositionBatchCache(this.positionManager);
    posCache.build(allTokens);

    // Position provider uses batch cache first, then PositionManager
    const getPos = (t) => posCache.getPosition(t) || this.positionManager.getTokenPosition(t);

    // Build or reuse spatial index with TTL-based invalidation
    let index;
    if (
      this._persistentCaches.spatialIndex &&
      now - this._persistentCaches.spatialIndexTs < this._persistentCaches.CACHE_TTL_MS
    ) {
      // Reuse existing spatial index if recent enough
      index = this._persistentCaches.spatialIndex;
    } else {
      // Build fresh spatial index
      index = new HashGridIndex();
      index.build(allTokens, (t) => getPos(t));
      this._persistentCaches.spatialIndex = index;
      this._persistentCaches.spatialIndexTs = now;
    }

    // Build or reuse id -> token map with TTL-based invalidation
    let idToToken;
    if (
      this._persistentCaches.idToTokenMap &&
      now - this._persistentCaches.idToTokenMapTs < this._persistentCaches.CACHE_TTL_MS
    ) {
      // Reuse existing id map if recent enough
      idToToken = this._persistentCaches.idToTokenMap;
    } else {
      // Build fresh id -> token map
      idToToken = new Map();
      for (const t of allTokens) {
        const id = t?.document?.id;
        if (id) idToToken.set(id, t);
      }
      this._persistentCaches.idToTokenMap = idToToken;
      this._persistentCaches.idToTokenMapTs = now;
    }

    // Build or reuse senses capabilities cache with TTL-based invalidation
    let sensesCache = null;
    try {
      if (
        this._persistentCaches.sensesCache &&
        now - this._persistentCaches.sensesCacheTs < this._persistentCaches.CACHE_TTL_MS
      ) {
        // Reuse existing senses cache if recent enough
        sensesCache = this._persistentCaches.sensesCache;
      } else {
        // Build fresh senses cache
        const { VisionAnalyzer } = await import('../VisionAnalyzer.js');
        const visionAnalyzer = VisionAnalyzer.getInstance();
        sensesCache = new SensesCapabilitiesCache(visionAnalyzer);
        sensesCache.build(allTokens);
        this._persistentCaches.sensesCache = sensesCache;
        this._persistentCaches.sensesCacheTs = now;
      }
    } catch {
      // best effort; fall back to on-demand analyzer reads
    }

    // Cache visibility maps once per token for original state comparisons (always needed fresh)
    const visCache = new VisibilityMapBatchCache(this.visibilityMapService);
    visCache.build(allTokens);

    // Per-batch override memoization (always needed fresh)
    const overridesCache = new OverrideBatchCache(this.overrideService);
    overridesCache.build(allTokens);

    // Precompute lighting per token once per batch (best-effort)
    // Prefer orchestrator-provided precompute (via calcOptions) and DO NOT override with nulls.
    let precomputedLights = (calcOptions && calcOptions.precomputedLights) || null;
    let precomputeStats = (calcOptions && calcOptions.precomputeStats) || null;
    if (!precomputedLights) {
      try {
        const { LightingPrecomputer } = await import('../LightingPrecomputer.js');
        const positions = new Map();
        for (const t of allTokens) {
          const id = t?.document?.id;
          if (!id) continue;
          const p = posCache.getPosition(t) || this.positionManager.getTokenPosition(t);
          positions.set(id, p);
        }
        const res = await LightingPrecomputer.precompute(allTokens, positions);
        precomputedLights = res?.map || null;
        precomputeStats = precomputeStats || res?.stats || null;
      } catch {
        // optional: continue without precomputed lights
      }
    }
    // Ensure we always pass a mutable stats object so calculator can record used/miss, even if no lights were precomputed.
    if (!precomputeStats) {
      precomputeStats = {
        batch: 'process',
        targetUsed: 0,
        targetMiss: 0,
        observerUsed: 0,
        observerMiss: 0,
      };
    }

    // Precompute LOS for all token pairs to avoid redundant checks
    const precomputedLOS = new Map();
    for (let i = 0; i < allTokens.length; i++) {
      for (let j = i + 1; j < allTokens.length; j++) {
        const tokenA = allTokens[i];
        const tokenB = allTokens[j];
        const losAB = this.visionAnalyzer.hasLineOfSight(tokenA, tokenB);
        precomputedLOS.set(`${tokenA.document.id}-${tokenB.document.id}`, losAB);
        precomputedLOS.set(`${tokenB.document.id}-${tokenA.document.id}`, losAB);
      }
    }

    // Precompute sense capabilities for all tokens
    const { SensePrecomputer } = await import('../../../services/SensePrecomputer.js');
    const precomputedSenses = SensePrecomputer.precompute(allTokens, this.visionAnalyzer);

    // Common calc options composed once per batch
    const commonCalcOptions = {
      ...calcOptions,
      // Never pass undefined; explicitly pass null or the actual map
      precomputedLights: precomputedLights || null,
      precomputedLOS: precomputedLOS,
      precomputedSenses: precomputedSenses,
      precomputeStats, // guaranteed non-null object
      sensesCache: sensesCache?.getMap?.(),
      idToToken,
      // Use stateless calculator for better performance and testability
      useStatelessCalculator: true,
    };

    for (const changedTokenId of changedTokenIds) {
      const changedToken = idToToken.get(changedTokenId);
      if (!changedToken) {
        continue;
      }

      if (this._hasRuleElementOverride(changedToken)) {
        continue;
      }

      processedTokens++;

      // Use precomputed position if available (with early exit optimization)
      const changedTokenPos =
        posCache.getPositionById(changedTokenId) ||
        this.positionManager.getTokenPosition(changedToken);
      if (!changedTokenPos) {
        continue;
      }
      // Use quadtree to preselect tokens in range (AABB+circle), then filter out excluded/self
      const gridSize = canvas.grid?.size || 1;
      const radiusPx = (this.maxVisibilityDistance || 20) * gridSize;
      const candidates = index.queryCircle(changedTokenPos.x, changedTokenPos.y, radiusPx);
      let relevantTokens = candidates
        .map((pt) => pt.token)
        .filter((t) => t?.document?.id && t.document.id !== changedTokenId);

      // Optional client-side viewport filtering for relevant tokens
      // Prefer the per-batch cached positions and quadtree for fast viewport filtering
      const inView =
        this.viewportFilterService.getTokenIdSet?.(64, index, (t) => getPos(t)) || null;
      if (inView && inView.size > 0) {
        relevantTokens = relevantTokens.filter((t) => inView.has(t.document.id));
      }

      const potentialOthers = Math.max(0, allTokens.length - 1);
      const spatiallySkipped = Math.max(0, potentialOthers - relevantTokens.length);
      breakdown.pairsSkippedSpatial += spatiallySkipped * 2;

      for (const otherToken of relevantTokens) {
        if (otherToken.document.id === changedTokenId) continue;

        const aId = changedToken.document.id;
        const bId = otherToken.document.id;
        const posA = changedTokenPos; // reuse memoized
        const posB =
          posCache.getPositionById(bId) || this.positionManager.getTokenPosition(otherToken);

        const posKeyA = posCache.getPositionKeyById(aId, posA);
        const posKeyB = posCache.getPositionKeyById(bId, posB);
        // LOS keys use coarse grid-cell indices to improve cache reuse across micro-movements
        const coarseA = posCache.getCoarseKeyById(aId, posA);
        const coarseB = posCache.getCoarseKeyById(bId, posB);
        const pairKey = posCache.makeLosPairKey(aId, coarseA, bId, coarseB);

        // Capture ORIGINAL map values BEFORE any calculations or override application
        // This ensures we compare against the true previous state, not values updated during processing
        const originalVisibility1 = visCache.getMapById(aId)?.[bId] || 'observed';
        const originalVisibility2 = visCache.getMapById(bId)?.[aId] || 'observed';

        let effectiveVisibility1, effectiveVisibility2;
        let hasOverride1 = false;
        let hasOverride2 = false;

        // Active override (new system)
        try {
          const s1 = overridesCache.getOverrideState(aId, bId, changedToken, otherToken);
          if (s1) {
            effectiveVisibility1 = s1;
            hasOverride1 = true;
          }
          const s2 = overridesCache.getOverrideState(bId, aId, otherToken, changedToken);
          if (s2) {
            effectiveVisibility2 = s2;
            hasOverride2 = true;
          }
        } catch (overrideError) {
          console.warn('PF2E Visioner | Failed to check visibility overrides:', overrideError);
        }

        // For observer movement: recalculate visibility even if observer has overrides
        // Only skip if target has overrides that would prevent meaningful recalculation
        const shouldSkipDueToTargetOverride = hasOverride2; // otherToken -> changedToken override

        if (shouldSkipDueToTargetOverride) {
          // Target has override preventing recalculation - skip expensive calculation
          if (hasOverride1) breakdown.pairsSkippedOverride += 1;
          if (hasOverride2) breakdown.pairsSkippedOverride += 1;

          if (hasOverride1 && effectiveVisibility1 !== originalVisibility1) {
            updates.push({
              observer: changedToken,
              target: otherToken,
              visibility: effectiveVisibility1,
            });
          }
          if (hasOverride2 && effectiveVisibility2 !== originalVisibility2) {
            updates.push({
              observer: otherToken,
              target: changedToken,
              visibility: effectiveVisibility2,
            });
          }
          continue;
        }

        // If only observer has override (hasOverride1), apply it but don't skip calculation
        // The moving observer should recalculate visibility to targets regardless of existing overrides
        if (hasOverride1 && effectiveVisibility1 !== originalVisibility1) {
          updates.push({
            observer: changedToken,
            target: otherToken,
            visibility: effectiveVisibility1,
          });
        }

        // Early short-circuit: if both directional vis states are in global cache and equal originals, skip pair entirely
        // Skip global cache when forcing fresh computation due to lighting changes
        const skipGlobalVisCache = LightingPrecomputer.isForcingFreshComputation();
        {
          const vKey1 = posCache.makeDirectionalKey(aId, posKeyA, bId, posKeyB);
          const vKey2 = posCache.makeDirectionalKey(bId, posKeyB, aId, posKeyA);
          let hit1 = null,
            hit2 = null;
          if (this.globalVisibilityCache && !skipGlobalVisCache) {
            const g1 = this.globalVisibilityCache.getWithMeta(vKey1);
            const g2 = this.globalVisibilityCache.getWithMeta(vKey2);
            if (g1.state === 'hit') {
              hit1 = g1.value;
              breakdown.visGlobalHits++;
            } else if (g1.state === 'expired') {
              breakdown.visGlobalExpired++;
              breakdown.visGlobalMisses++;
            } else {
              breakdown.visGlobalMisses++;
            }
            if (g2.state === 'hit') {
              hit2 = g2.value;
              breakdown.visGlobalHits++;
            } else if (g2.state === 'expired') {
              breakdown.visGlobalExpired++;
              breakdown.visGlobalMisses++;
            } else {
              breakdown.visGlobalMisses++;
            }
          } else if (skipGlobalVisCache) {
            breakdown.visGlobalMisses += 2;
          }

          if (
            hit1 !== null &&
            hit2 !== null &&
            hit1 === originalVisibility1 &&
            hit2 === originalVisibility2
          ) {
            // Nothing to update for this pair; skip LOS and further work
            breakdown.pairsSkippedNoChange++;
            continue;
          }
        }

        // Check LOS with global cache integration (after early no-change short-circuit)
        // Try per-batch cache first
        let los = batchLosCache.get(pairKey);
        if (los === undefined) {
          // Batch-level cache miss for LOS
          breakdown.losCacheMisses++;

          // Check orchestrator-provided short-lived memo (burst reuse across micro-batches)
          const burstLos = calcOptions?.burstLosMemo;
          if (burstLos && burstLos.has(pairKey)) {
            los = burstLos.get(pairKey);
            // Treat as a hit analogous to batch-local reuse for telemetry simplicity
            breakdown.losCacheHits++;
            breakdown.burstMemoHits++;
          }
          // Check global LOS cache first
          if (los === undefined && this.globalLosCache) {
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
            los = this.visionAnalyzer.hasLineOfSight(changedToken, otherToken, 'sight');

            // Store in global cache for future use
            if (this.globalLosCache) {
              this.globalLosCache.set(pairKey, los);
            }
            // Populate burst memo for immediate subsequent batches
            try {
              if (calcOptions?.burstLosMemo) calcOptions.burstLosMemo.set(pairKey, los);
            } catch {}
          }

          batchLosCache.set(pairKey, los);
        } else {
          // Batch-level cache hit for LOS
          breakdown.losCacheHits++;
        }

        if (!los) {
          // Check if observer has non-visual senses that could work without LoS
          // Calculate distance using the existing position data
          const distance =
            Math.sqrt(Math.pow(posA.x - posB.x, 2) + Math.pow(posA.y - posB.y, 2)) /
            canvas.grid.size;
          const hasNonVisualSenses = this.#canUseNonVisualSenses(
            changedToken,
            otherToken,
            distance,
          );

          if (!hasNonVisualSenses) {
            // No LoS and no non-visual senses available - skip this pair
            breakdown.pairsSkippedLOS++;
            continue; // Skip to next pair instead of computing visibility
          }
          // Either has non-visual senses OR blocked LoS (will be undetected) - proceed with visibility calculation
        }

        // Compute visibility in both directions when not overridden
        // Direction 1: changedToken -> otherToken (only calculate if no override)
        if (!hasOverride1) {
          breakdown.pairsConsidered++;
          const vKey1 = posCache.makeDirectionalKey(aId, posKeyA, bId, posKeyB);
          let visibility1 = batchVisibilityCache.get(vKey1);

          if (visibility1 === undefined) {
            // Check global visibility cache first (skip if forcing fresh computation)
            if (this.globalVisibilityCache && !skipGlobalVisCache) {
              const globalResult = this.globalVisibilityCache.getWithMeta(vKey1);
              if (globalResult.state === 'hit' && globalResult.value !== undefined) {
                visibility1 = globalResult.value;
                breakdown.visGlobalHits++;
              } else if (globalResult.state === 'expired') {
                breakdown.visGlobalExpired++;
                breakdown.visGlobalMisses++;
              } else {
                breakdown.visGlobalMisses++;
              }
            } else if (skipGlobalVisCache) {
              breakdown.visGlobalMisses++;
            }

            // If not in global cache, compute it
            if (visibility1 === undefined) {
              visibility1 =
                await this.optimizedVisibilityCalculator.calculateVisibilityBetweenTokens(
                  changedToken,
                  otherToken,
                  posA,
                  posB,
                  commonCalcOptions,
                );

              // Store in global cache for future use (skip if forcing fresh computation)
              if (this.globalVisibilityCache && !skipGlobalVisCache) {
                this.globalVisibilityCache.set(vKey1, visibility1);
              }
              breakdown.pairsComputed++;
            }

            batchVisibilityCache.set(vKey1, visibility1);
          } else {
            breakdown.pairsCached++;
          }
          effectiveVisibility1 = visibility1;

          const ruleElementResult1 = RuleElementChecker.checkRuleElements(changedToken, otherToken);
          if (ruleElementResult1) {
            effectiveVisibility1 = ruleElementResult1.state;
          }
        }
        // Direction 2: otherToken -> changedToken (only calculate if no override)
        if (!hasOverride2) {
          breakdown.pairsConsidered++;
          const vKey2 = posCache.makeDirectionalKey(bId, posKeyB, aId, posKeyA);
          let visibility2 = batchVisibilityCache.get(vKey2);

          if (visibility2 === undefined) {
            // Check global visibility cache first (skip if forcing fresh computation)
            if (this.globalVisibilityCache && !skipGlobalVisCache) {
              const globalResult = this.globalVisibilityCache.getWithMeta(vKey2);
              if (globalResult.state === 'hit' && globalResult.value !== undefined) {
                visibility2 = globalResult.value;
                breakdown.visGlobalHits++;
              } else if (globalResult.state === 'expired') {
                breakdown.visGlobalExpired++;
                breakdown.visGlobalMisses++;
              } else {
                breakdown.visGlobalMisses++;
              }
            } else if (skipGlobalVisCache) {
              breakdown.visGlobalMisses++;
            }

            // If not in global cache, compute it
            if (visibility2 === undefined) {
              visibility2 =
                await this.optimizedVisibilityCalculator.calculateVisibilityBetweenTokens(
                  otherToken,
                  changedToken,
                  posB,
                  posA,
                  commonCalcOptions,
                );

              // Store in global cache for future use (skip if forcing fresh computation)
              if (this.globalVisibilityCache && !skipGlobalVisCache) {
                this.globalVisibilityCache.set(vKey2, visibility2);
              }
              breakdown.pairsComputed++;
            }

            batchVisibilityCache.set(vKey2, visibility2);
          } else {
            breakdown.pairsCached++;
          }
          effectiveVisibility2 = visibility2;

          const ruleElementResult2 = RuleElementChecker.checkRuleElements(otherToken, changedToken);
          if (ruleElementResult2) {
            effectiveVisibility2 = ruleElementResult2.state;
          }
        }

        // Queue updates if changed from ORIGINAL map state (before any calculations)
        if (effectiveVisibility1 !== originalVisibility1) {
          updates.push({
            observer: changedToken,
            target: otherToken,
            visibility: effectiveVisibility1,
          });
        }
        if (effectiveVisibility2 !== originalVisibility2) {
          updates.push({
            observer: otherToken,
            target: changedToken,
            visibility: effectiveVisibility2,
          });
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

    // TODO: Performance optimization opportunity
    // Multiple batches are triggered per lighting change, causing redundant LOS calculations.
    // Low cache hit rates indicate calculations are repeated across batches.
    // Burst memo (150ms TTL) helps but may need longer TTL or better batch deduplication.

    return { updates, breakdown, processedTokens, precomputeStats, detailedTimings };
  }

  /**
   * Check if observer has non-visual senses (tremorsense, hearing) that could work without LoS.
   * @param {Token} observer - The observing token
   * @param {Token} target - The target token
   * @param {number} distance - Distance between tokens in grid units
   * @returns {boolean} True if observer has non-visual senses that could detect the target
   */
  #canUseNonVisualSenses(observer, target, distance) {
    // Get observer's sensing summary using the VisionAnalyzer (proper dependency injection)
    const { sensingSummary } = this.visionAnalyzer.getVisionCapabilities(observer);
    if (!sensingSummary) {
      return false;
    }

    // Check for tremorsense in precise or imprecise senses - works through walls if both tokens on ground
    const allSenses = [...(sensingSummary.precise || []), ...(sensingSummary.imprecise || [])];
    const tremorsenseSense = allSenses.find((sense) => sense.type === 'tremorsense');
    if (tremorsenseSense) {
      const tremorsenseRange = tremorsenseSense.range || 30;
      const observerElevation = observer.document.elevation || 0;
      const targetElevation = target.document.elevation || 0;

      // Tremorsense works if both tokens are on ground and within range
      if (observerElevation === 0 && targetElevation === 0 && distance <= tremorsenseRange) {
        return true;
      }
    }

    // Check for hearing - could work through thin walls depending on range
    if (sensingSummary.hearing && sensingSummary.hearing.range) {
      const hearingRange = sensingSummary.hearing.range || 60;
      if (distance <= hearingRange) {
        return true;
      }
    }

    // Could add other non-visual senses here (scent, etc.)
    return false;
  }

  _hasRuleElementOverride(token) {
    try {
      const override = token?.document?.getFlag('pf2e-visioner', 'ruleElementOverride');
      return override?.active === true;
    } catch (error) {
      return false;
    }
  }
}
