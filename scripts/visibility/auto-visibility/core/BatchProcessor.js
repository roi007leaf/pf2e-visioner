import { RuleElementChecker } from '../../../rule-elements/RuleElementChecker.js';
import { FeatsHandler } from '../../../chat/services/FeatsHandler.js';
import { applyActiveSceneHearingRangeLimit } from '../../../services/scene-hearing-range.js';
import { SensePrecomputer } from '../../../services/SensePrecomputer.js';
import { getLogger } from '../../../utils/logger.js';
import { getCacheInvalidationRevision } from '../../../utils/cache-invalidation.js';
import { GlobalLosCache } from '../utils/GlobalLosCache.js';
import { GlobalVisibilityCache } from '../utils/GlobalVisibilityCache.js';
import { VisionAnalyzer } from '../VisionAnalyzer.js';
import { BatchDirectionalLosResolver } from './BatchDirectionalLosResolver.js';
import { BatchDirectionalVisibilityResolver } from './BatchDirectionalVisibilityResolver.js';
import { HashGridIndex } from './HashGridIndex.js';
import { LightingPrecomputer } from './LightingPrecomputer.js';
import { OverrideBatchCache } from './OverrideBatchCache.js';
import { OverrideService } from './OverrideService.js';
import { PositionBatchCache } from './PositionBatchCache.js';
import { PositionManager } from './PositionManager.js';
import { RuleElementBatchContext } from './RuleElementBatchContext.js';
import { SensesCapabilitiesCache } from './SensesCapabilitiesCache.js';
import {
  TokenSenseSignatureCache,
  buildTokenSensesCacheKey as buildTokenSensesCacheKeyFromCache,
} from './TokenSenseSignatureCache.js';
import { ViewportFilterService } from './ViewportFilterService.js';
import { VisibilityMapBatchCache } from './VisibilityMapBatchCache.js';
import { VisibilityMapService } from './VisibilityMapService.js';
import {
  getVisibilityReplacementMetadata,
  visibilityReplacementMetadataEquals,
} from '../../perception-profile.js';

export { buildTokenSensesCacheKey } from './TokenSenseSignatureCache.js';

const log = getLogger('AVS/BatchProcessor');
const EXPLICIT_VISIBLE_STATES = new Set(['observed', 'concealed']);
const VISUAL_SENSE_TYPES = new Set([
  'vision',
  'darkvision',
  'greater-darkvision',
  'greaterdarkvision',
  'low-light-vision',
  'lowlightvision',
  'light-perception',
  'lightperception',
  'see-invisibility',
  'seeinvisibility',
  'see-all',
  'seeall',
  'infrared-vision',
  'infraredvision',
  'truesight',
]);
const NON_VISUAL_SENSE_DEFAULT_RANGES = {
  lifesense: 10,
  thoughtsense: 30,
  scent: 30,
  echolocation: 40,
  tremorsense: 30,
  bloodsense: 30,
  magicsense: 30,
  'electromagnetic-sense': 30,
  'motion-sense': 30,
  spiritsense: 30,
  wavesense: 30,
  hearing: Infinity,
};

function buildVisibilityReplacementProfileMetadata(ruleElementResult, originalVisibility) {
  if (ruleElementResult?.type !== 'visibilityReplacement') return {};
  return {
    visibilityReplacementSource: ruleElementResult.source,
    visibilityReplacementOriginalState:
      ruleElementResult.fromState ?? ruleElementResult.originalState ?? originalVisibility,
  };
}

function normalizeSenseType(sense) {
  return String(sense?.type ?? '')
    .trim()
    .toLowerCase();
}

function getSenseRange(sense, senseType) {
  const explicitRange = Number(sense?.range);
  if (Number.isFinite(explicitRange)) return explicitRange;
  const defaultRange = NON_VISUAL_SENSE_DEFAULT_RANGES[senseType] ?? 0;
  return Number.isFinite(defaultRange) ? defaultRange : Infinity;
}

function getActorTraits(token) {
  const traits = token?.actor?.system?.traits;
  const value = Array.isArray(traits?.value) ? traits.value : Array.isArray(traits) ? traits : [];
  return value.map((trait) => String(trait).toLowerCase());
}

function canLifesenseReachTarget(target) {
  const traits = getActorTraits(target);
  return !traits.includes('construct');
}

function canThoughtsenseReachTarget(target) {
  const traits = getActorTraits(target);
  return !traits.includes('mindless') && !traits.includes('construct') && !traits.includes('ooze');
}

function canSenseReachDistance(sense, senseType, distanceInFeet) {
  const range = getSenseRange(sense, senseType);
  return range > 0 && distanceInFeet <= range;
}

function canSpecialSenseBypassLineOfSight(sense, target, distanceInFeet, isDeafened) {
  const senseType = normalizeSenseType(sense);
  if (!senseType || VISUAL_SENSE_TYPES.has(senseType)) return false;
  if (senseType === 'tremorsense') return false;
  if (!canSenseReachDistance(sense, senseType, distanceInFeet)) return false;

  if (senseType === 'echolocation' || senseType === 'hearing') return !isDeafened;
  if (senseType === 'lifesense') return canLifesenseReachTarget(target);
  if (senseType === 'thoughtsense') return canThoughtsenseReachTarget(target);

  return true;
}

function calculateSenseDistanceInFeet(observer, target, distanceInGridUnits) {
  if (typeof observer?.distanceTo === 'function') {
    try {
      const tokenDistance = Number(observer.distanceTo(target));
      if (Number.isFinite(tokenDistance)) return tokenDistance;
    } catch (_) {}
  }
  return calculateApproximateSenseDistanceInFeet(distanceInGridUnits);
}

function calculateApproximateSenseDistanceInFeet(distanceInGridUnits) {
  const gridDistance =
    Number(canvas?.scene?.grid?.distance ?? canvas?.dimensions?.distance ?? 5) || 5;
  return distanceInGridUnits * gridDistance;
}

function normalizeSenseList(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    return Object.entries(value).map(([type, range]) => ({ type, range }));
  }
  return [];
}

function shouldUseExactSenseDistance(sensingSummary) {
  const allSenses = [
    ...normalizeSenseList(sensingSummary?.precise),
    ...normalizeSenseList(sensingSummary?.imprecise),
  ];
  if (
    allSenses.some((sense) => {
      const senseType = normalizeSenseType(sense);
      return senseType && !VISUAL_SENSE_TYPES.has(senseType);
    })
  ) {
    return true;
  }
  return !!sensingSummary?.hearing;
}

function normalizeCacheKeyNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(numeric) : '0';
}

function getSceneCacheId() {
  return String(canvas?.scene?.id ?? canvas?.scene?._id ?? 'none');
}

function getTokenPositionForCacheKey(token, posCache, positionManager) {
  try {
    return (
      posCache?.getPosition?.(token) ||
      positionManager?.getTokenPosition?.(token) || {
        x: token?.document?.x,
        y: token?.document?.y,
        elevation: token?.document?.elevation,
      }
    );
  } catch {
    return {
      x: token?.document?.x,
      y: token?.document?.y,
      elevation: token?.document?.elevation,
    };
  }
}

export function buildTokenIdCacheKey(tokens) {
  const ids = (tokens || [])
    .map((token) => token?.document?.id)
    .filter(Boolean)
    .map(String)
    .sort();

  return `scene:${getSceneCacheId()}|count:${ids.length}|${ids.join('|')}`;
}

export function buildTokenPositionCacheKey(tokens, posCache = null, positionManager = null) {
  const entries = (tokens || [])
    .map((token) => {
      const id = token?.document?.id;
      if (!id) return null;

      const position = getTokenPositionForCacheKey(token, posCache, positionManager);
      const x = normalizeCacheKeyNumber(position?.x ?? token?.document?.x);
      const y = normalizeCacheKeyNumber(position?.y ?? token?.document?.y);
      const elevation = normalizeCacheKeyNumber(position?.elevation ?? token?.document?.elevation);
      const width = normalizeCacheKeyNumber(token?.document?.width ?? 1);
      const height = normalizeCacheKeyNumber(token?.document?.height ?? 1);

      return `${String(id)}@${x},${y},${elevation},${width},${height}`;
    })
    .filter(Boolean)
    .sort();

  return `scene:${getSceneCacheId()}|count:${entries.length}|${entries.join('|')}`;
}

function getTokenId(tokenOrObject) {
  return tokenOrObject?.document?.id ?? tokenOrObject?.id ?? null;
}

function sourceEntries(sources) {
  return Array.from(sources || [], (entry) => (Array.isArray(entry) ? entry[1] : entry)).filter(
    Boolean,
  );
}

function getVisibilityTestPoints(token) {
  try {
    const points = token?.document?.getVisibilityTestPoints?.();
    if (Array.isArray(points) && points.length > 0) return points;
  } catch {
    // fall through
  }

  return token?.center ? [token.center] : [];
}

function hasCoreLosFromControlledObserver(observerToken, targetToken) {
  const observerId = getTokenId(observerToken);
  if (!observerId || !targetToken) return false;

  try {
    const controlled = canvas?.tokens?.controlled || [];
    if (!controlled.some((token) => getTokenId(token) === observerId)) return false;

    const sources = [
      ...sourceEntries(canvas?.effects?.visionSources),
      ...sourceEntries(canvas?.effects?.lightSources),
    ].filter((source) => source?.active && getTokenId(source.object) === observerId);
    if (sources.length === 0) return false;

    const points = getVisibilityTestPoints(targetToken);
    if (points.length === 0) return false;

    return sources.some((source) =>
      points.some(
        (point) =>
          source?.los?.contains?.(point.x, point.y) || source?.shape?.contains?.(point.x, point.y),
      ),
    );
  } catch {
    return false;
  }
}

function addCoreLosTargetsForControlledObserver(observerToken, relevantTokens, allTokens) {
  if (!observerToken?.document?.id) return relevantTokens;

  const byId = new Map();
  for (const token of relevantTokens || []) {
    const id = token?.document?.id;
    if (id) byId.set(id, token);
  }

  for (const token of allTokens || []) {
    const id = token?.document?.id;
    if (!id || id === observerToken.document.id || byId.has(id)) continue;
    if (hasCoreLosFromControlledObserver(observerToken, token)) {
      byId.set(id, token);
    }
  }

  return Array.from(byId.values());
}

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
   * @param {Function} [dependencies.nowProvider] - Optional timing source for performance telemetry
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
    this.movementSightLineResolver =
      typeof dependencies.movementSightLineResolver === 'function'
        ? dependencies.movementSightLineResolver
        : null;
    this.maxVisibilityDistance = dependencies.maxVisibilityDistance;
    this.nowProvider =
      dependencies.nowProvider ||
      (() => {
        try {
          return performance?.now?.() ?? Date.now();
        } catch {
          return Date.now();
        }
      });
    this.getCacheInvalidationRevision =
      dependencies.getCacheInvalidationRevision || getCacheInvalidationRevision;
    this._tokenSenseSignatureCache =
      dependencies.tokenSenseSignatureCache || new TokenSenseSignatureCache();

    // Persistent caches to reduce expensive rebuilding between batches
    this._persistentCaches = {
      sensesCache: null,
      sensesCacheTs: 0,
      sensesCacheKey: null,
      idToTokenMap: null,
      idToTokenMapTs: 0,
      idToTokenMapKey: null,
      spatialIndex: null,
      spatialIndexTs: 0,
      spatialIndexKey: null,
      cacheInvalidationRevision: this.getCacheInvalidationRevision(),
      // TTL for cache invalidation (5 seconds)
      CACHE_TTL_MS: 5000,
    };
  }

  clearPersistentCaches() {
    const caches = this._persistentCaches;
    if (!caches) return;

    caches.sensesCache = null;
    caches.sensesCacheTs = 0;
    caches.sensesCacheKey = null;
    caches.idToTokenMap = null;
    caches.idToTokenMapTs = 0;
    caches.idToTokenMapKey = null;
    caches.spatialIndex = null;
    caches.spatialIndexTs = 0;
    caches.spatialIndexKey = null;
    caches.cacheInvalidationRevision = this.getCacheInvalidationRevision();
    this._tokenSenseSignatureCache?.clear?.();
  }

  _clearPersistentCachesIfInvalidated() {
    const caches = this._persistentCaches;
    if (!caches) return;
    const revision = this.getCacheInvalidationRevision();
    if (caches.cacheInvalidationRevision === revision) return;
    this.clearPersistentCaches();
  }

  /**
   * Process a batch of changed tokens and compute visibility updates.
   * @param {Token[]} allTokens - tokens eligible for processing (already exclusion+viewport filtered)
   * @param {Set<string>} changedTokenIds - ids of tokens that changed this batch
   * @param {Object} calcOptions - options passed to calculator (precomputedLights, hasDarknessSources, precomputeStats)
   * @returns {Promise<{updates:Array<{observer:Token,target:Token,visibility:string}>, breakdown:any, processedTokens:number, precomputeStats:any, detailedTimings:Object}>}
   */
  async process(allTokens, changedTokenIds, calcOptions) {
    log.debug(() => ({
      msg: 'BatchProcessor:process:start',
      allTokenCount: allTokens.length,
      changedTokenCount: changedTokenIds.size,
      changedTokens: Array.from(changedTokenIds),
      skipPrecomputedLOS: !!calcOptions?.skipPrecomputedLOS,
      skipViewportFilter: !!calcOptions?.skipViewportFilter,
      burstLosMemoSize: calcOptions?.burstLosMemo?.size ?? 0,
    }));

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
      pairsSkippedDoorScope: 0,
    };
    let processedTokens = 0;
    const now = Date.now();
    this._clearPersistentCachesIfInvalidated();

    // Precompute token positions and position keys once per batch (always needed fresh)
    let stageStart = this.nowProvider();
    const posCache = new PositionBatchCache(this.positionManager);
    posCache.build(allTokens);

    // Position provider uses batch cache first, then PositionManager
    const getPos = (t) => posCache.getPosition(t) || this.positionManager.getTokenPosition(t);
    const tokenPositionCacheKey = buildTokenPositionCacheKey(
      allTokens,
      posCache,
      this.positionManager,
    );
    const tokenIdCacheKey = buildTokenIdCacheKey(allTokens);
    const tokenSensesCacheKey = buildTokenSensesCacheKeyFromCache(
      allTokens,
      this._tokenSenseSignatureCache,
    );

    // Build or reuse spatial index with revision-key + TTL-based invalidation
    let index;
    if (
      this._persistentCaches.spatialIndex &&
      this._persistentCaches.spatialIndexKey === tokenPositionCacheKey &&
      now - this._persistentCaches.spatialIndexTs < this._persistentCaches.CACHE_TTL_MS
    ) {
      // Reuse existing spatial index if the token positions are unchanged and recent enough
      index = this._persistentCaches.spatialIndex;
    } else {
      // Build fresh spatial index
      index = new HashGridIndex();
      index.build(allTokens, (t) => getPos(t));
      this._persistentCaches.spatialIndex = index;
      this._persistentCaches.spatialIndexTs = now;
      this._persistentCaches.spatialIndexKey = tokenPositionCacheKey;
    }

    // Build or reuse id -> token map with revision-key + TTL-based invalidation
    let idToToken;
    if (
      this._persistentCaches.idToTokenMap &&
      this._persistentCaches.idToTokenMapKey === tokenIdCacheKey &&
      now - this._persistentCaches.idToTokenMapTs < this._persistentCaches.CACHE_TTL_MS
    ) {
      // Reuse existing id map if the token set is unchanged and recent enough
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
      this._persistentCaches.idToTokenMapKey = tokenIdCacheKey;
    }

    // Build or reuse senses capabilities cache with TTL-based invalidation
    let sensesCache = null;
    try {
      if (
        this._persistentCaches.sensesCache &&
        this._persistentCaches.sensesCacheKey === tokenSensesCacheKey &&
        now - this._persistentCaches.sensesCacheTs < this._persistentCaches.CACHE_TTL_MS
      ) {
        // Reuse existing senses cache if sensing inputs are unchanged and recent enough
        sensesCache = this._persistentCaches.sensesCache;
      } else {
        // Build fresh senses cache
        const visionAnalyzer = VisionAnalyzer.getInstance();
        sensesCache = new SensesCapabilitiesCache(visionAnalyzer);
        sensesCache.build(allTokens);
        this._persistentCaches.sensesCache = sensesCache;
        this._persistentCaches.sensesCacheTs = now;
        this._persistentCaches.sensesCacheKey = tokenSensesCacheKey;
      }
    } catch {
      // best effort; fall back to on-demand analyzer reads
    }

    // Cache visibility maps once per token for original state comparisons (always needed fresh)
    const visCache = new VisibilityMapBatchCache(this.visibilityMapService);
    visCache.build(allTokens);
    const documentVisCache = new VisibilityMapBatchCache({
      getVisibilityMap: (token) =>
        this.visibilityMapService?.getDocumentVisibilityMap?.(token) ??
        this.visibilityMapService?.getVisibilityMap?.(token) ??
        {},
    });
    documentVisCache.build(allTokens);
    const profileCache = new VisibilityMapBatchCache({
      getVisibilityMap: (token) =>
        this.visibilityMapService?.getPerceptionProfileMap?.(token) ?? {},
    });
    profileCache.build(allTokens);

    // Per-batch override memoization (always needed fresh)
    const overridesCache = new OverrideBatchCache(this.overrideService);
    overridesCache.build(allTokens);
    detailedTimings.cacheBuilding += this.nowProvider() - stageStart;

    // Precompute lighting per token once per batch (best-effort)
    // Prefer orchestrator-provided precompute (via calcOptions) and DO NOT override with nulls.
    stageStart = this.nowProvider();
    let precomputedLights = (calcOptions && calcOptions.precomputedLights) || null;
    let precomputeStats = (calcOptions && calcOptions.precomputeStats) || null;
    if (!precomputedLights) {
      try {
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
    detailedTimings.lightingPrecompute += this.nowProvider() - stageStart;
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

    // Lazily populated during the main directional LOS checks below. This avoids an eager
    // all-pairs LOS pass followed by a second LOS pass in the main loop.
    const precomputedLOS = new Map();

    // Precompute sense capabilities for all tokens
    stageStart = this.nowProvider();
    const precomputedSenses = SensePrecomputer.precompute(allTokens, this.visionAnalyzer);
    detailedTimings.cacheBuilding += this.nowProvider() - stageStart;

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
      visibilityMapCache: visCache,
    };

    const processedChangedPairKeys = new Set();
    let viewportTokenIds = null;
    if (!calcOptions?.skipViewportFilter) {
      viewportTokenIds =
        this.viewportFilterService.getTokenIdSet?.(64, index, (t) => getPos(t)) || null;
    }
    const isDoorStateBatch =
      calcOptions?.postBatchPerceptionSuppression?.reason === 'door-state-change';
    const isMovementBatch = calcOptions?.isMovementBatch === true;
    const controlledChangedTokenIds = new Set(
      (canvas?.tokens?.controlled || [])
        .map((token) => token?.document?.id)
        .filter((id) => id && changedTokenIds.has(id)),
    );
    const hasControlledChangedToken = controlledChangedTokenIds.size > 0;
    const doorScopeCoords = this.#getDoorScopeCoords(calcOptions);
    const skipGlobalVisCache =
      LightingPrecomputer.isForcingFreshComputation() ||
      !!calcOptions?.skipPrecomputedLOS ||
      isDoorStateBatch ||
      hasControlledChangedToken;
    const skipLosCache = !!calcOptions?.skipPrecomputedLOS || isDoorStateBatch;
    const directionalLosResolver = new BatchDirectionalLosResolver({
      visionAnalyzer: this.visionAnalyzer,
      globalLosCache: this.globalLosCache,
      batchLosCache,
      burstLosMemo: calcOptions?.burstLosMemo,
      precomputedLOS,
      breakdown,
      skipLosCache,
      sourcePolygonLosResolver: hasCoreLosFromControlledObserver,
      movementSightLineResolver:
        isMovementBatch || hasControlledChangedToken ? this.movementSightLineResolver : null,
    });
    const directionalVisibilityResolver = new BatchDirectionalVisibilityResolver({
      optimizedVisibilityCalculator: this.optimizedVisibilityCalculator,
      globalVisibilityCache: this.globalVisibilityCache,
      batchVisibilityCache,
      commonCalcOptions,
      breakdown,
      skipGlobalVisCache,
    });
    const ruleElementContext = new RuleElementBatchContext({
      checker: RuleElementChecker,
      tokens: allTokens,
    });
    const applyVisibilityReplacement = (observerToken, targetToken, visibility) => {
      if (!visibility) return { visibility, profileMetadata: {} };
      const ruleElementResult = ruleElementContext.checkVisibilityReplacement(
        observerToken,
        targetToken,
        visibility,
      );
      const featResult = FeatsHandler.getVisibilityReplacement(
        observerToken,
        targetToken,
        visibility,
      );
      const replacementResult = ruleElementResult || featResult;
      if (!replacementResult) return { visibility, profileMetadata: {} };
      return {
        visibility: replacementResult.state,
        profileMetadata: buildVisibilityReplacementProfileMetadata(replacementResult, visibility),
      };
    };
    const applyFeatVisibilityReplacement = (observerToken, targetToken, visibility) => {
      if (!visibility) return { visibility, profileMetadata: {} };
      const featResult = FeatsHandler.getVisibilityReplacement(observerToken, targetToken, visibility);
      if (!featResult) return { visibility, profileMetadata: {} };
      return {
        visibility: featResult.state,
        profileMetadata: buildVisibilityReplacementProfileMetadata(featResult, visibility),
      };
    };

    const mainLoopStart = this.nowProvider();
    for (const changedTokenId of changedTokenIds) {
      const changedToken = idToToken.get(changedTokenId);
      if (!changedToken) {
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
      stageStart = this.nowProvider();
      const gridSize = canvas.grid?.size || 1;
      const radiusPx = (this.maxVisibilityDistance || 20) * gridSize;
      const candidates = index.queryCircle(changedTokenPos.x, changedTokenPos.y, radiusPx);
      let relevantTokens = candidates
        .map((pt) => pt.token)
        .filter((t) => t?.document?.id && t.document.id !== changedTokenId);
      relevantTokens = addCoreLosTargetsForControlledObserver(
        changedToken,
        relevantTokens,
        allTokens,
      );
      const usedMovementFallback =
        calcOptions?.isMovementBatch === true && relevantTokens.length === 0;
      if (usedMovementFallback) {
        relevantTokens = allTokens.filter(
          (token) => token?.document?.id && token.document.id !== changedTokenId,
        );
      }

      // Optional client-side viewport filtering for relevant tokens.
      // Skipped for movement batches: the destination room may be off-screen from the GM's
      // viewport, so creatures there must still be included for correct recalculation.
      if (viewportTokenIds && viewportTokenIds.size > 0) {
        relevantTokens = relevantTokens.filter((t) => viewportTokenIds.has(t.document.id));
      }

      const potentialOthers = Math.max(0, allTokens.length - 1);
      const spatiallySkipped = Math.max(0, potentialOthers - relevantTokens.length);
      breakdown.pairsSkippedSpatial += spatiallySkipped * 2;
      detailedTimings.spatialFiltering += this.nowProvider() - stageStart;

      for (const otherToken of relevantTokens) {
        if (otherToken.document.id === changedTokenId) continue;

        const aId = changedToken.document.id;
        const bId = otherToken.document.id;
        if (changedTokenIds.has(bId)) {
          const pairKey = aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
          if (processedChangedPairKeys.has(pairKey)) continue;
          processedChangedPairKeys.add(pairKey);
        }

        const posA = changedTokenPos; // reuse memoized
        const posB =
          posCache.getPositionById(bId) || this.positionManager.getTokenPosition(otherToken);

        if (
          doorScopeCoords &&
          !this.#doesPairCrossDoorScope(changedToken, otherToken, posA, posB, doorScopeCoords)
        ) {
          breakdown.pairsSkippedDoorScope += 2;
          continue;
        }

        const posKeyA = posCache.getPositionKeyById(aId, posA);
        const posKeyB = posCache.getPositionKeyById(bId, posB);
        // LOS keys use coarse grid-cell indices to improve cache reuse across micro-movements
        const coarseA = posCache.getCoarseKeyById(aId, posA);
        const coarseB = posCache.getCoarseKeyById(bId, posB);
        const losKey1 = posCache.makeLosPairKey(aId, coarseA, bId, coarseB);
        const losKey2 = posCache.makeLosPairKey(bId, coarseB, aId, coarseA);

        // Capture ORIGINAL map values BEFORE any calculations or override application
        // This ensures we compare against the true previous state, not values updated during processing
        const originalVisibility1 = visCache.getMapById(aId)?.[bId] || 'observed';
        const originalVisibility2 = visCache.getMapById(bId)?.[aId] || 'observed';
        const originalDocumentVisibility1 = documentVisCache.getMapById(aId)?.[bId] || 'observed';
        const originalDocumentVisibility2 = documentVisCache.getMapById(bId)?.[aId] || 'observed';
        const originalProfileMetadata1 = getVisibilityReplacementMetadata(
          profileCache.getMapById(aId)?.[bId],
        );
        const originalProfileMetadata2 = getVisibilityReplacementMetadata(
          profileCache.getMapById(bId)?.[aId],
        );

        let effectiveVisibility1, effectiveVisibility2;
        let profileMetadata1 = {};
        let profileMetadata2 = {};
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
        if (hasOverride1) {
          const replacement = applyVisibilityReplacement(
            changedToken,
            otherToken,
            effectiveVisibility1,
          );
          effectiveVisibility1 = replacement.visibility;
          profileMetadata1 = replacement.profileMetadata;
        }
        if (hasOverride2) {
          const replacement = applyVisibilityReplacement(
            otherToken,
            changedToken,
            effectiveVisibility2,
          );
          effectiveVisibility2 = replacement.visibility;
          profileMetadata2 = replacement.profileMetadata;
        }

        // For observer movement: recalculate visibility even if observer has overrides
        // Only skip if target has overrides that would prevent meaningful recalculation
        const shouldSkipDueToTargetOverride = hasOverride2; // otherToken -> changedToken override

        if (shouldSkipDueToTargetOverride) {
          // Target has override preventing recalculation - skip expensive calculation
          if (hasOverride1) breakdown.pairsSkippedOverride += 1;
          if (hasOverride2) breakdown.pairsSkippedOverride += 1;

          if (
            hasOverride1 &&
            (effectiveVisibility1 !== originalVisibility1 ||
              effectiveVisibility1 !== originalDocumentVisibility1 ||
              !visibilityReplacementMetadataEquals(originalProfileMetadata1, profileMetadata1))
          ) {
            updates.push({
              observer: changedToken,
              target: otherToken,
              visibility: effectiveVisibility1,
              profileMetadata: profileMetadata1,
              forceProfileMetadataSync: !visibilityReplacementMetadataEquals(
                originalProfileMetadata1,
                profileMetadata1,
              ),
            });
          }
          if (
            hasOverride2 &&
            (effectiveVisibility2 !== originalVisibility2 ||
              effectiveVisibility2 !== originalDocumentVisibility2 ||
              !visibilityReplacementMetadataEquals(originalProfileMetadata2, profileMetadata2))
          ) {
            updates.push({
              observer: otherToken,
              target: changedToken,
              visibility: effectiveVisibility2,
              profileMetadata: profileMetadata2,
              forceProfileMetadataSync: !visibilityReplacementMetadataEquals(
                originalProfileMetadata2,
                profileMetadata2,
              ),
            });
          }
          continue;
        }

        // If only observer has override (hasOverride1), apply it but don't skip calculation
        // The moving observer should recalculate visibility to targets regardless of existing overrides
        if (
          hasOverride1 &&
          (effectiveVisibility1 !== originalVisibility1 ||
            effectiveVisibility1 !== originalDocumentVisibility1 ||
            !visibilityReplacementMetadataEquals(originalProfileMetadata1, profileMetadata1))
        ) {
          updates.push({
            observer: changedToken,
            target: otherToken,
            visibility: effectiveVisibility1,
            profileMetadata: profileMetadata1,
            forceProfileMetadataSync: !visibilityReplacementMetadataEquals(
              originalProfileMetadata1,
              profileMetadata1,
            ),
          });
        }

        // Early short-circuit: if both directional vis states are in global cache and equal originals, skip pair entirely.
        // Door batches skip this cache because Foundry vision state can lag behind wall state changes.
        stageStart = this.nowProvider();
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
            hit2 === originalVisibility2 &&
            hit1 === originalDocumentVisibility1 &&
            hit2 === originalDocumentVisibility2 &&
            !ruleElementContext.hasRuleElementState
          ) {
            // Nothing to update for this pair; skip LOS and further work
            breakdown.pairsSkippedNoChange++;
            detailedTimings.cacheOperations += this.nowProvider() - stageStart;
            continue;
          }
        }
        detailedTimings.cacheOperations += this.nowProvider() - stageStart;

        stageStart = this.nowProvider();
        const los1 = directionalLosResolver.get(changedToken, otherToken, losKey1);
        const los2 = directionalLosResolver.get(otherToken, changedToken, losKey2);
        detailedTimings.losCalculations += this.nowProvider() - stageStart;
        const distance =
          Math.sqrt(Math.pow(posA.x - posB.x, 2) + Math.pow(posA.y - posB.y, 2)) / canvas.grid.size;
        let skipVisibilityCalc1 = false;
        let skipVisibilityCalc2 = false;

        if (!hasOverride1 && !los1) {
          const hasNonVisualSenses1 = this.#canUseNonVisualSenses(
            changedToken,
            otherToken,
            distance,
          );
          if (!hasNonVisualSenses1) {
            effectiveVisibility1 = 'undetected';
            const replacement = applyVisibilityReplacement(
              changedToken,
              otherToken,
              effectiveVisibility1,
            );
            effectiveVisibility1 = replacement.visibility;
            profileMetadata1 = replacement.profileMetadata;
            skipVisibilityCalc1 = true;
            breakdown.pairsSkippedLOS++;
          }
        }

        if (!hasOverride2 && !los2) {
          const hasNonVisualSenses2 = this.#canUseNonVisualSenses(
            otherToken,
            changedToken,
            distance,
          );
          if (!hasNonVisualSenses2) {
            effectiveVisibility2 = 'undetected';
            const replacement = applyVisibilityReplacement(
              otherToken,
              changedToken,
              effectiveVisibility2,
            );
            effectiveVisibility2 = replacement.visibility;
            profileMetadata2 = replacement.profileMetadata;
            skipVisibilityCalc2 = true;
            breakdown.pairsSkippedLOS++;
          }
        }

        // Compute visibility in both directions when not overridden
        // Direction 1: changedToken -> otherToken (only calculate if no override)
        stageStart = this.nowProvider();
        if (!hasOverride1 && !skipVisibilityCalc1) {
          breakdown.pairsConsidered++;
          const vKey1 = posCache.makeDirectionalKey(aId, posKeyA, bId, posKeyB);
          const visibility1 = await directionalVisibilityResolver.get({
            observerToken: changedToken,
            targetToken: otherToken,
            observerPosition: posA,
            targetPosition: posB,
            cacheKey: vKey1,
          });
          effectiveVisibility1 = visibility1;

          const ruleElementResult1 = ruleElementContext.checkRuleElements(
            changedToken,
            otherToken,
            visibility1,
          );
          if (ruleElementResult1) {
            effectiveVisibility1 = ruleElementResult1.state;
            profileMetadata1 = buildVisibilityReplacementProfileMetadata(
              ruleElementResult1,
              visibility1,
            );
          }
          const featReplacement1 = applyFeatVisibilityReplacement(
            changedToken,
            otherToken,
            effectiveVisibility1,
          );
          effectiveVisibility1 = featReplacement1.visibility;
          if (Object.keys(featReplacement1.profileMetadata).length > 0) {
            profileMetadata1 = featReplacement1.profileMetadata;
          }
        }
        // Direction 2: otherToken -> changedToken (only calculate if no override)
        if (!hasOverride2 && !skipVisibilityCalc2) {
          breakdown.pairsConsidered++;
          const vKey2 = posCache.makeDirectionalKey(bId, posKeyB, aId, posKeyA);
          const visibility2 = await directionalVisibilityResolver.get({
            observerToken: otherToken,
            targetToken: changedToken,
            observerPosition: posB,
            targetPosition: posA,
            cacheKey: vKey2,
          });
          effectiveVisibility2 = visibility2;

          const ruleElementResult2 = ruleElementContext.checkRuleElements(
            otherToken,
            changedToken,
            visibility2,
          );
          if (ruleElementResult2) {
            effectiveVisibility2 = ruleElementResult2.state;
            profileMetadata2 = buildVisibilityReplacementProfileMetadata(
              ruleElementResult2,
              visibility2,
            );
          }
          const featReplacement2 = applyFeatVisibilityReplacement(
            otherToken,
            changedToken,
            effectiveVisibility2,
          );
          effectiveVisibility2 = featReplacement2.visibility;
          if (Object.keys(featReplacement2.profileMetadata).length > 0) {
            profileMetadata2 = featReplacement2.profileMetadata;
          }
        }
        detailedTimings.visibilityCalculations += this.nowProvider() - stageStart;

        // Queue updates if changed from ORIGINAL map state (before any calculations)
        // OR if we need to force ephemeral effect updates (e.g., when suppression flags change)
        stageStart = this.nowProvider();
        const needsEphemeralUpdate1 = effectiveVisibility1 !== originalVisibility1;
        const needsEphemeralUpdate2 = effectiveVisibility2 !== originalVisibility2;
        const needsDocumentSync1 = effectiveVisibility1 !== originalDocumentVisibility1;
        const needsDocumentSync2 = effectiveVisibility2 !== originalDocumentVisibility2;
        const needsProfileMetadataSync1 = !visibilityReplacementMetadataEquals(
          originalProfileMetadata1,
          profileMetadata1,
        );
        const needsProfileMetadataSync2 = !visibilityReplacementMetadataEquals(
          originalProfileMetadata2,
          profileMetadata2,
        );
        const needsVisibilityUpdate1 =
          needsEphemeralUpdate1 || needsDocumentSync1 || needsProfileMetadataSync1;
        const needsVisibilityUpdate2 =
          needsEphemeralUpdate2 || needsDocumentSync2 || needsProfileMetadataSync2;
        const explicitVisiblePair1 =
          !hasOverride1 && los1 === true && EXPLICIT_VISIBLE_STATES.has(effectiveVisibility1);
        const explicitVisiblePair2 =
          !hasOverride2 && los2 === true && EXPLICIT_VISIBLE_STATES.has(effectiveVisibility2);
        const needsDoorDetectionSync1 =
          isDoorStateBatch &&
          !hasOverride1 &&
          !needsVisibilityUpdate1 &&
          (explicitVisiblePair1 || los1 === false);
        const needsDoorDetectionSync2 =
          isDoorStateBatch &&
          !hasOverride2 &&
          !needsVisibilityUpdate2 &&
          (explicitVisiblePair2 || los2 === false);
        const needsMovementDetectionSync1 =
          isMovementBatch && !hasOverride1 && !needsVisibilityUpdate1 && explicitVisiblePair1;
        const needsMovementDetectionSync2 =
          isMovementBatch && !hasOverride2 && !needsVisibilityUpdate2 && explicitVisiblePair2;

        if (needsVisibilityUpdate1) {
          updates.push({
            observer: changedToken,
            target: otherToken,
            visibility: effectiveVisibility1,
            profileMetadata: profileMetadata1,
            forceProfileMetadataSync: needsProfileMetadataSync1,
            explicitVisiblePair: explicitVisiblePair1,
          });
        }
        if (needsVisibilityUpdate2) {
          updates.push({
            observer: otherToken,
            target: changedToken,
            visibility: effectiveVisibility2,
            profileMetadata: profileMetadata2,
            forceProfileMetadataSync: needsProfileMetadataSync2,
            explicitVisiblePair: explicitVisiblePair2,
          });
        }
        if (needsDoorDetectionSync1 || needsMovementDetectionSync1) {
          updates.push({
            observer: changedToken,
            target: otherToken,
            visibility: effectiveVisibility1,
            forceDetectionSyncOnly: true,
            explicitVisiblePair: los1 === false ? false : explicitVisiblePair1,
          });
        }
        if (needsDoorDetectionSync2 || needsMovementDetectionSync2) {
          updates.push({
            observer: otherToken,
            target: changedToken,
            visibility: effectiveVisibility2,
            forceDetectionSyncOnly: true,
            explicitVisiblePair: los2 === false ? false : explicitVisiblePair2,
          });
        }

        // Ephemeral-only resync for unchanged pairs is skipped here for performance.
        // Off-guard suppression changes (e.g. Blind-Fight added/removed) are handled via
        // calcOptions.forceEphemeralResync, which is set by ItemEventHandler when needed.
        if (calcOptions?.forceEphemeralResync) {
          if (!needsVisibilityUpdate1 && effectiveVisibility1) {
            updates.push({
              observer: changedToken,
              target: otherToken,
              visibility: effectiveVisibility1,
              forceEphemeralOnly: true,
            });
          }
          if (!needsVisibilityUpdate2 && effectiveVisibility2) {
            updates.push({
              observer: otherToken,
              target: changedToken,
              visibility: effectiveVisibility2,
              forceEphemeralOnly: true,
            });
          }
        }
        detailedTimings.updateCollection += this.nowProvider() - stageStart;
      }
    }
    detailedTimings.mainProcessingLoop += this.nowProvider() - mainLoopStart;

    // Periodically prune expired cache entries
    stageStart = this.nowProvider();
    if (this.globalLosCache) {
      this.globalLosCache.pruneIfDue(1000);
    }
    if (this.globalVisibilityCache) {
      this.globalVisibilityCache.pruneIfDue(1000);
    }
    detailedTimings.cacheOperations += this.nowProvider() - stageStart;

    // TODO: Performance optimization opportunity
    // Multiple batches are triggered per lighting change, causing redundant LOS calculations.
    // Low cache hit rates indicate calculations are repeated across batches.
    // Burst memo (150ms TTL) helps but may need longer TTL or better batch deduplication.

    log.debug(() => ({
      msg: 'BatchProcessor:process:complete',
      updatesCount: updates.length,
      processedTokens,
      breakdown,
    }));

    return { updates, breakdown, processedTokens, precomputeStats, detailedTimings };
  }

  /**
   * Check if observer has non-visual senses that could work without LoS.
   * @param {Token} observer - The observing token
   * @param {Token} target - The target token
   * @param {number} distance - Distance between tokens in grid units
   * @returns {boolean} True if observer has non-visual senses that could detect the target
   */
  #canUseNonVisualSenses(observer, target, distance) {
    // Get observer's sensing summary using the VisionAnalyzer (proper dependency injection)
    const { sensingSummary, isDeafened } = this.visionAnalyzer.getVisionCapabilities(observer);
    if (!sensingSummary) {
      return false;
    }
    const approximateDistanceInFeet = calculateApproximateSenseDistanceInFeet(distance);
    const distanceInFeet = shouldUseExactSenseDistance(sensingSummary)
      ? calculateSenseDistanceInFeet(observer, target, distance)
      : approximateDistanceInFeet;

    const allSenses = [
      ...normalizeSenseList(sensingSummary.precise),
      ...normalizeSenseList(sensingSummary.imprecise),
    ];
    const hasSpecialSense = allSenses.some((sense) =>
      canSpecialSenseBypassLineOfSight(sense, target, distanceInFeet, isDeafened),
    );
    if (hasSpecialSense) return true;

    // Tremorsense also requires both tokens to be on the ground.
    const tremorsenseSense = allSenses.find((sense) => sense.type === 'tremorsense');
    if (tremorsenseSense) {
      const tremorsenseRange = getSenseRange(tremorsenseSense, 'tremorsense');
      const observerElevation = observer.document.elevation || 0;
      const targetElevation = target.document.elevation || 0;

      // Tremorsense works if both tokens are on ground and within range
      if (observerElevation === 0 && targetElevation === 0 && distanceInFeet <= tremorsenseRange) {
        return true;
      }
    }

    // Check for hearing - could work through thin walls depending on range
    // PF2e creatures normally have hearing even when it is not explicitly surfaced as a
    // detection mode. Treat missing hearing as implicit unless the observer is deafened.
    const implicitHearingRange = applyActiveSceneHearingRangeLimit(null);
    const hearing =
      sensingSummary.hearing || (isDeafened ? null : { range: implicitHearingRange ?? Infinity });
    if (hearing && hearing.range) {
      const hearingRange = applyActiveSceneHearingRangeLimit(hearing.range ?? Infinity) ?? Infinity;
      const hearingDistanceInFeet = sensingSummary.hearing
        ? distanceInFeet
        : approximateDistanceInFeet;
      if (hearingRange > 0 && hearingDistanceInFeet <= hearingRange) {
        return true;
      }
    }

    return false;
  }

  #getDoorScopeCoords(calcOptions) {
    const suppression = calcOptions?.postBatchPerceptionSuppression;
    if (suppression?.reason !== 'door-state-change') return null;
    const coords = suppression?.doorCoords;
    if (!Array.isArray(coords) || coords.length < 4) return null;
    const numericCoords = coords.slice(0, 4).map((value) => Number(value));
    return numericCoords.every((value) => Number.isFinite(value)) ? numericCoords : null;
  }

  #doesPairCrossDoorScope(tokenA, tokenB, posA, posB, doorCoords) {
    if (!posA || !posB || !doorCoords) return true;
    const doorStart = { x: doorCoords[0], y: doorCoords[1] };
    const doorEnd = { x: doorCoords[2], y: doorCoords[3] };
    const tokenBSamples = this.#getDoorScopeTokenSamples(tokenB, posB);
    if (tokenBSamples.some((sample) => this.#segmentsIntersect(posA, sample, doorStart, doorEnd))) {
      return true;
    }
    const tokenASamples = this.#getDoorScopeTokenSamples(tokenA, posA);
    return tokenASamples.some((sample) =>
      this.#segmentsIntersect(posB, sample, doorStart, doorEnd),
    );
  }

  #getDoorScopeTokenSamples(token, fallbackPosition) {
    const samples = [];
    if (fallbackPosition) {
      samples.push({ x: fallbackPosition.x, y: fallbackPosition.y });
    }
    const document = token?.document;
    const gridSize = globalThis.canvas?.grid?.size || 100;
    const x = Number(document?.x);
    const y = Number(document?.y);
    const width = (Number(document?.width) || 1) * gridSize;
    const height = (Number(document?.height) || 1) * gridSize;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return samples;
    samples.push(
      { x, y },
      { x: x + width, y },
      { x, y: y + height },
      { x: x + width, y: y + height },
    );
    return samples;
  }

  #segmentsIntersect(a, b, c, d) {
    if (!a || !b || !c || !d) return false;
    const denominator = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
    const epsilon = 1e-6;
    if (Math.abs(denominator) < epsilon) {
      return (
        this.#isPointOnSegment(a, c, b) ||
        this.#isPointOnSegment(a, d, b) ||
        this.#isPointOnSegment(c, a, d) ||
        this.#isPointOnSegment(c, b, d)
      );
    }
    const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / denominator;
    const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / denominator;
    return t >= -epsilon && t <= 1 + epsilon && u >= -epsilon && u <= 1 + epsilon;
  }

  #isPointOnSegment(a, point, b) {
    const epsilon = 1e-6;
    const cross = (point.y - a.y) * (b.x - a.x) - (point.x - a.x) * (b.y - a.y);
    if (Math.abs(cross) > epsilon) return false;
    const dot = (point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y);
    if (dot < -epsilon) return false;
    const lengthSquared = Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2);
    return dot <= lengthSquared + epsilon;
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
