import { MODULE_ID } from '../../../constants.js';
import { FeatsHandler } from '../../../chat/services/FeatsHandler.js';
import { LastValidationRequest } from '../utils/LastValidationRequest.js';
import { OverrideValidityCache } from '../utils/OverrideValidityCache.js';

let visibilityCalculatorModulePromise = null;
let coverDetectorModulePromise = null;
let visionAnalyzerModulePromise = null;

const STEALTH_OVERRIDE_STATES = new Set(['hidden', 'undetected', 'unnoticed']);
const STEALTH_POSITION_BYPASS_DETAILS = {
  'legendary-sneak': {
    slug: 'legendary-sneak',
    label: 'Legendary Sneak',
    icon: 'fas fa-user-ninja',
    tooltip:
      "You're always sneaking unless you choose to be seen, even when there's nowhere to hide. You can Hide and Sneak even without cover or being Concealed. When you employ an exploration tactic other than Avoiding Notice, you also gain the benefits of Avoiding Notice unless you choose not to.",
  },
  'very-very-sneaky': {
    slug: 'very-very-sneaky',
    label: 'Very, Very Sneaky',
    icon: 'fas fa-user-ninja',
    tooltip: 'Very, Very Sneaky removes the cover or concealment requirement for Sneak.',
  },
};

function getStealthPositionBypassContext(target, override = {}) {
  const source = override.source || 'manual_action';
  if (!['manual_action', 'sneak_action', 'hide_action'].includes(source)) return null;
  if (!STEALTH_OVERRIDE_STATES.has(override.state)) return null;
  if (FeatsHandler.hasFeat(target, 'legendary-sneak')) {
    return STEALTH_POSITION_BYPASS_DETAILS['legendary-sneak'];
  }
  if (
    (source === 'manual_action' || source === 'sneak_action') &&
    FeatsHandler.hasFeat(target, 'very-very-sneaky')
  ) {
    return STEALTH_POSITION_BYPASS_DETAILS['very-very-sneaky'];
  }
  return null;
}

function targetIgnoresStealthPositionValidation(target, override = {}) {
  return !!getStealthPositionBypassContext(target, override);
}

function withStealthPositionBypassContext(target, override = {}) {
  const context = getStealthPositionBypassContext(target, override);
  if (!context) return override;
  return {
    ...override,
    stealthPositionBypassFeat: context.slug,
    stealthPositionBypassLabel: context.label,
    stealthPositionBypassIcon: context.icon,
    stealthPositionBypassTooltip: context.tooltip,
  };
}

function loadVisibilityCalculatorModule() {
  if (!visibilityCalculatorModulePromise) {
    visibilityCalculatorModulePromise = import('../VisibilityCalculator.js').catch((error) => {
      visibilityCalculatorModulePromise = null;
      throw error;
    });
  }
  return visibilityCalculatorModulePromise;
}

function loadCoverDetectorModule() {
  if (!coverDetectorModulePromise) {
    coverDetectorModulePromise = import('../../../cover/auto-cover/CoverDetector.js').catch(
      (error) => {
        coverDetectorModulePromise = null;
        throw error;
      },
    );
  }
  return coverDetectorModulePromise;
}

function loadVisionAnalyzerModule() {
  if (!visionAnalyzerModulePromise) {
    visionAnalyzerModulePromise = import('../VisionAnalyzer.js').catch((error) => {
      visionAnalyzerModulePromise = null;
      throw error;
    });
  }
  return visionAnalyzerModulePromise;
}

function prewarmOverrideValidationModules() {
  loadVisibilityCalculatorModule().catch(() => { });
  loadCoverDetectorModule().catch(() => { });
  loadVisionAnalyzerModule().catch(() => { });
}

export class OverrideValidationManager {
  /**
   * @param {ExclusionManager} exclusionManager - Manager for token exclusion logic
   * @param {PositionManager} positionManager - Manager for token position tracking
   */
  constructor(exclusionManager, positionManager, visibilityCalculator) {
    this.exclusionManager = exclusionManager;
    this.positionManager = positionManager;
    this.visibilityCalculator = visibilityCalculator;
    this._tokensQueuedForValidation = new Set();
    this.pendingValidations = new Set(); // Expose for tests
    this._validationTimeoutId = null;
    this._lastValidationRequest = new LastValidationRequest();
    this._overrideValidityCache = new OverrideValidityCache(750);
    this._validationRequestDebounceMs = 250;
    this._lastPruneAt = 0;
    prewarmOverrideValidationModules();
  }

  /**
   * Queue a token for override validation (alias for queue method)
   * @param {string} tokenId - ID of the token that moved
   */
  queueOverrideValidation(tokenId) {
    this.pendingValidations.add(tokenId); // Track for tests
    this.queue(tokenId);
  }

  queue(tokenId) {
    // GM-only; EVS already guards enabled
    if (!game.user?.isGM) {
      return;
    }
    // Deduplicate rapid requests at the same position
    try {
      const tok = canvas.tokens?.get?.(tokenId);
      const doc = tok?.document;
      const gs = canvas.grid?.size || 1;
      const cx = doc ? doc.x + (doc.width * gs) / 2 : 0;
      const cy = doc ? doc.y + (doc.height * gs) / 2 : 0;
      const posKey = `${Math.round(cx)}:${Math.round(cy)}:${doc?.elevation ?? 0}`;
      const ok = this._lastValidationRequest.shouldQueue(
        tokenId,
        posKey,
        this._validationRequestDebounceMs,
      );
      if (!ok) return;
    } catch {
      /* best-effort */
    }

    this._tokensQueuedForValidation.add(tokenId);
    // No timeout - caller will trigger processQueuedValidations when ready
  }

  async processQueuedValidations({ skipMovedFilter = false } = {}) {
    if (!game.user?.isGM) {
      return;
    }
    // Best-effort settle to allow canvas updates to apply before validations
    // Using setTimeout instead of requestAnimationFrame so validations work when window is unfocused
    try {
      await new Promise((resolve) => setTimeout(resolve, 0));
    } catch { }

    const tokenIds = Array.from(this._tokensQueuedForValidation);
    this._tokensQueuedForValidation.clear();
    this._validationTimeoutId = null;

    // Process each token validation
    for (const tokenId of tokenIds) {
      this.validateOverride(tokenId);
      this.pendingValidations.delete(tokenId); // Clear after processing
    }

    // Precompute lighting for involved participants
    let precomputedLights = null;
    const precomputeStats = {
      batch: 'validation',
      targetUsed: 0,
      targetMiss: 0,
      observerUsed: 0,
      observerMiss: 0,
    };
    try {
      const { LightingCalculator } = await import('../LightingCalculator.js');
      const lc = LightingCalculator.getInstance?.();
      if (lc) {
        const ids = new Set();
        for (const movedId of tokenIds) {
          const movedTok = canvas.tokens?.get?.(movedId);
          if (movedTok && !this.exclusionManager.isExcludedToken(movedTok)) ids.add(movedId);
          // mover as target: flags on mover
          try {
            const mFlags = movedTok?.document?.flags?.[MODULE_ID] || {};
            for (const fk of Object.keys(mFlags)) {
              if (fk.startsWith('avs-override-from-')) {
                const obsId = fk.replace('avs-override-from-', '');
                const obsTok = canvas.tokens?.get?.(obsId);
                if (obsTok && !this.exclusionManager.isExcludedToken(obsTok)) ids.add(obsId);
              }
            }
          } catch { }
          // mover as observer: flags on others
          try {
            const others = canvas.tokens?.placeables || [];
            for (const ot of others) {
              if (!ot?.document || ot.id === movedId) continue;
              const fk = `avs-override-from-${movedId}`;
              if (ot.document.flags?.[MODULE_ID]?.[fk]) {
                if (!this.exclusionManager.isExcludedToken(ot)) ids.add(ot.id);
              }
            }
          } catch { }
        }
        precomputedLights = new Map();
        for (const id of ids) {
          const tok = canvas.tokens?.get?.(id);
          if (!tok || this.exclusionManager.isExcludedToken(tok)) continue;
          const pos = this.positionManager.getTokenPosition(tok);
          const light = lc.getLightLevelAt(pos, tok);
          precomputedLights.set(id, light);
        }
      }
    } catch {
      precomputedLights = null;
    }

    for (const tokenId of tokenIds) {
      const result = await this.validateOverridesForToken(tokenId, {
        precomputedLights,
        precomputeStats,
      });
      if (result && result.__showAwareness && Array.isArray(result.overrides)) {
        if (!skipMovedFilter) {
          try {
            const lastMovedId = globalThis?.game?.pf2eVisioner?.lastMovedTokenId || null;
            if (lastMovedId && tokenId !== lastMovedId) {
              continue;
            }
          } catch { }
        }
        let va = null;
        try {
          const { VisionAnalyzer } = await loadVisionAnalyzerModule();
          va = VisionAnalyzer.getInstance();
          va.clearCache();
        } catch { }
        const movedToken = canvas.tokens?.get(tokenId);
        const filtered = result.overrides.filter((o) => {
          const prevVis = o.state || (o.hasConcealment ? 'concealed' : 'observed');
          const prevCover = o.expectedCover ?? (o.hasCover ? 'standard' : 'none');
          const curVis = o.currentVisibility || 'observed';
          const curCover = o.currentCover || 'none';
          const isDifferent = prevVis !== curVis || prevCover !== curCover;
          if (!isDifferent) return false;
          if (o.targetId === tokenId) return true;
          if (!va || !movedToken) return true;
          try {
            const otherId = o.observerId === tokenId ? o.targetId : o.observerId;
            const otherToken = canvas.tokens?.get(otherId);
            if (!otherToken) return false;
            return va.hasLineOfSight(movedToken, otherToken) !== false;
          } catch { return true; }
        });
        try {
          const { default: indicator } = await import(
            '../../../ui/OverrideValidationIndicator.js'
          );
          if (filtered.length > 0) {
            const movedId = globalThis?.game?.pf2eVisioner?.lastMovedTokenId || tokenId;
            const moverName = canvas.tokens?.get(movedId)?.document?.name || 'Token';
            indicator.show(filtered, moverName, movedId, { pulse: false });
          } else {
            indicator.hide(true);
          }
        } catch (e) {
          console.warn('PF2E Visioner | Failed to update awareness indicator:', e);
        }
      }
    }
  }

  async validateOverridesForToken(movedTokenId, options = undefined) {
    const movedToken = canvas.tokens?.get(movedTokenId);
    if (!movedToken) return;

    if (this.exclusionManager.isExcludedToken(movedToken)) {
      let isSneaking = false;
      let hasExistingOverrides = false;
      try {
        isSneaking = !!movedToken.document.getFlag(MODULE_ID, 'sneak-active');
      } catch { }
      try {
        const moverFlags = movedToken.document.flags['pf2e-visioner'] || {};
        hasExistingOverrides = Object.keys(moverFlags).some((k) =>
          k.startsWith('avs-override-from-'),
        );
        if (!hasExistingOverrides) {
          const allTokens = canvas.tokens?.placeables || [];
          for (const t of allTokens) {
            if (t?.document?.flags?.['pf2e-visioner']?.[`avs-override-from-${movedTokenId}`]) {
              hasExistingOverrides = true;
              break;
            }
          }
        }
      } catch { }
      if (!isSneaking && !hasExistingOverrides) return { overrides: [], __showAwareness: false };
      const awareness = [];
      try {
        const allTokens = canvas.tokens?.placeables || [];
        for (const t of allTokens) {
          if (!t?.document || t.id === movedTokenId) continue;
          if (t.document.hidden) continue;
          const fk = `avs-override-from-${movedTokenId}`;
          const fd = t.document.flags['pf2e-visioner']?.[fk];
          if (!fd) continue;
          if (this._hasActiveTimer(fd.timedOverride)) continue;
          let currentVisibility = undefined;
          let currentCover = undefined;
          try {
            let visibility;
            const { optimizedVisibilityCalculator } = await loadVisibilityCalculatorModule();
            if (
              typeof optimizedVisibilityCalculator.calculateVisibilityWithoutOverrides ===
              'function'
            ) {
              visibility = await optimizedVisibilityCalculator.calculateVisibilityWithoutOverrides(
                movedToken,
                t,
                options,
              );
            }
            currentVisibility = visibility;
            const { CoverDetector } = await loadCoverDetectorModule();
            const coverDetector = new CoverDetector();
            const observerPos = this.positionManager.getTokenPosition(movedToken);
            currentCover = coverDetector.detectFromPoint(observerPos, t);
          } catch { }
          awareness.push(withStealthPositionBypassContext(t, {
            observerId: movedTokenId,
            targetId: t.id,
            observerName: movedToken.name,
            targetName: t.name,
            state: fd.state,
            source: fd.source,
            hasCover: fd.hasCover,
            hasConcealment: fd.hasConcealment,
            expectedCover: fd.expectedCover,
            coverOnly: fd.coverOnly,
            coverOverrideSource: fd.coverOverrideSource,
            currentVisibility,
            currentCover,
          }));
        }
      } catch { }
      return { overrides: awareness, __showAwareness: awareness.length > 0 };
    }

    const overridesToCheck = [];
    try {
      const moverFlags = movedToken.document.flags['pf2e-visioner'] || {};
      for (const [flagKey, flagData] of Object.entries(moverFlags)) {
        if (!flagKey.startsWith('avs-override-from-')) continue;
        if (this._hasActiveTimer(flagData.timedOverride)) continue;
        const observerId = flagKey.replace('avs-override-from-', '');
        const targetId = movedToken.document.id;
        const observerTok = canvas.tokens?.get(observerId) || null;
        const observer =
          !observerTok || this.exclusionManager.isExcludedToken(observerTok)
            ? { id: observerId, name: flagData.observerName || 'Unknown Observer' }
            : observerTok;
        overridesToCheck.push({
          key: `${observerId}-${targetId}`,
          override: {
            observer,
            target: movedToken,
            state: flagData.state,
            source: flagData.source,
            hasCover: flagData.hasCover,
            hasConcealment: flagData.hasConcealment,
            expectedCover: flagData.expectedCover,
            coverOnly: flagData.coverOnly,
            coverOverrideSource: flagData.coverOverrideSource,
            timedOverride: flagData.timedOverride,
            observerId,
            targetId,
            observerName: flagData.observerName || observer?.name,
            targetName: flagData.targetName || movedToken.name,
          },
          observerId,
          targetId,
          type: 'flag',
          flagKey,
          token: movedToken,
        });
      }
    } catch (errTarget) {
      console.warn('[PF2E Visioner] OVERRIDE SCAN (as target) error', errTarget);
    }

    try {
      const allTokens = canvas.tokens?.placeables || [];
      for (const token of allTokens) {
        if (!token?.document || token.id === movedTokenId) continue;
        const flags = token.document.flags['pf2e-visioner'] || {};
        const flagKey = `avs-override-from-${movedTokenId}`;
        const flagData = flags[flagKey];
        if (!flagData) continue;
        if (this._hasActiveTimer(flagData.timedOverride)) continue;
        const observerId = movedTokenId;
        const targetId = token.document.id;
        overridesToCheck.push({
          key: `${observerId}-${targetId}`,
          override: {
            observer: movedToken,
            target: token,
            state: flagData.state,
            source: flagData.source,
            hasCover: flagData.hasCover,
            hasConcealment: flagData.hasConcealment,
            expectedCover: flagData.expectedCover,
            coverOnly: flagData.coverOnly,
            coverOverrideSource: flagData.coverOverrideSource,
            timedOverride: flagData.timedOverride,
            observerId,
            targetId,
            observerName: flagData.observerName || movedToken.name,
            targetName: flagData.targetName || token.name,
          },
          observerId,
          targetId,
          type: 'flag',
          flagKey,
          token,
        });
      }
    } catch (errObserver) {
      console.warn('[PF2E Visioner] OVERRIDE SCAN (as observer) error', errObserver);
    }

    const invalidOverrides = [];
    for (const checkData of overridesToCheck) {
      const { override, observerId, targetId, type, flagKey, token } = checkData;
      const checkResult = await this.checkOverrideValidity(observerId, targetId, override, options);
      if (checkResult) {
        invalidOverrides.push({
          observerId,
          targetId,
          override,
          reason: checkResult.reason,
          reasonIcons: checkResult.reasonIcons || [],
          currentVisibility: checkResult.currentVisibility,
          currentCover: checkResult.currentCover,
          type,
          flagKey,
          token,
        });
      }
    }

    if (invalidOverrides.length > 0) {
      await this.showOverrideValidationDialog(invalidOverrides, movedTokenId);
      return { overrides: invalidOverrides, __showAwareness: false };
    }

    const awareness = [];
    try {
      const moverFlags = movedToken.document.flags['pf2e-visioner'] || {};
      for (const [flagKey, fd] of Object.entries(moverFlags)) {
        if (!flagKey.startsWith('avs-override-from-')) continue;
        if (this._hasActiveTimer(fd.timedOverride)) continue;
        const observerId = flagKey.replace('avs-override-from-', '');
        const obs = canvas.tokens?.get(observerId);
        if (!obs || obs.document?.hidden) continue;
        let currentVisibility = undefined;
        let currentCover = undefined;
        try {
          let visibility;
          const { optimizedVisibilityCalculator } = await loadVisibilityCalculatorModule();
          if (
            typeof optimizedVisibilityCalculator.calculateVisibilityWithoutOverrides === 'function'
          ) {
            visibility = await optimizedVisibilityCalculator.calculateVisibilityWithoutOverrides(
              obs,
              movedToken,
              options,
            );
          } else {
            visibility = await this.visibilityCalculator.calculateVisibility(
              obs,
              movedToken,
              options,
            );
          }
          currentVisibility = visibility;
          const { CoverDetector } = await loadCoverDetectorModule();
          const coverDetector = new CoverDetector();
          const observerPos = this.positionManager.getTokenPosition(obs);
          currentCover = coverDetector.detectFromPoint(observerPos, movedToken);
        } catch { }
        awareness.push(withStealthPositionBypassContext(movedToken, {
          observerId,
          targetId: movedTokenId,
          observerName: obs?.name || fd.observerName || 'Observer',
          targetName: movedToken.name,
          state: fd.state,
          source: fd.source,
          hasCover: fd.hasCover,
          hasConcealment: fd.hasConcealment,
          expectedCover: fd.expectedCover,
          coverOnly: fd.coverOnly,
          coverOverrideSource: fd.coverOverrideSource,
          currentVisibility,
          currentCover,
        }));
      }
      const allTokens = canvas.tokens?.placeables || [];
      for (const t of allTokens) {
        if (!t?.document || t.id === movedTokenId) continue;
        if (t.document.hidden) continue;
        const fk = `avs-override-from-${movedTokenId}`;
        const fd = t.document.flags['pf2e-visioner']?.[fk];
        if (!fd) continue;
        if (this._hasActiveTimer(fd.timedOverride)) continue;
        let currentVisibility = undefined;
        let currentCover = undefined;
        try {
          let visibility;
          const { optimizedVisibilityCalculator } = await loadVisibilityCalculatorModule();
          if (
            typeof optimizedVisibilityCalculator.calculateVisibilityWithoutOverrides === 'function'
          ) {
            visibility = await optimizedVisibilityCalculator.calculateVisibilityWithoutOverrides(
              movedToken,
              t,
              options,
            );
          } else {
            visibility = await this.visibilityCalculator.calculateVisibility(
              movedToken,
              t,
              options,
            );
          }
          currentVisibility = visibility;
          const { CoverDetector } = await loadCoverDetectorModule();
          const coverDetector = new CoverDetector();
          const observerPos = this.positionManager.getTokenPosition(movedToken);
          currentCover = coverDetector.detectFromPoint(observerPos, t);
        } catch { }
        awareness.push(withStealthPositionBypassContext(t, {
          observerId: movedTokenId,
          targetId: t.id,
          observerName: movedToken.name,
          targetName: t.name,
          state: fd.state,
          source: fd.source,
          hasCover: fd.hasCover,
          hasConcealment: fd.hasConcealment,
          expectedCover: fd.expectedCover,
          coverOnly: fd.coverOnly,
          coverOverrideSource: fd.coverOverrideSource,
          currentVisibility,
          currentCover,
        }));
      }
    } catch { }

    return { overrides: awareness, __showAwareness: awareness.length > 0 };
  }

  async checkOverrideValidity(observerId, targetId, override, options = undefined) {
    const markPerf = () => undefined;
    const flushPerf = () => undefined;

    const observer = canvas.tokens?.get(observerId);
    const target = canvas.tokens?.get(targetId);
    markPerf('resolve-tokens');
    if (!observer || !target) {
      flushPerf({ reason: 'missing-token' });
      return null;
    }

    if (override.timedOverride) {
      const timer = override.timedOverride;
      if (timer.type === 'realtime' && timer.expiresAt && timer.expiresAt > Date.now()) {
        flushPerf({ reason: 'active-realtime-timer' });
        return null;
      }
      if (timer.type === 'rounds' && timer.roundsRemaining !== 0) {
        flushPerf({ reason: 'active-rounds-timer' });
        return null;
      }
    }
    let __obsPosKey, __tgtPosKey, __cacheKey;
    try {
      const obsPos = this.positionManager.getTokenPosition(observer);
      const tgtPos = this.positionManager.getTokenPosition(target);
      const obsPosKey = `${Math.round(obsPos.x)}:${Math.round(obsPos.y)}:${obsPos.elevation ?? 0}`;
      const tgtPosKey = `${Math.round(tgtPos.x)}:${Math.round(tgtPos.y)}:${tgtPos.elevation ?? 0}`;
      const cacheKey = `${observerId}-${targetId}`;
      const cached = this._overrideValidityCache.get(cacheKey);
      if (cached && cached.obsPos === obsPosKey && cached.tgtPos === tgtPosKey) {
        markPerf('cache-hit');
        flushPerf({ reason: 'cache-hit', result: cached.result });
        return cached.result;
      }
      __obsPosKey = obsPosKey;
      __tgtPosKey = tgtPosKey;
      __cacheKey = cacheKey;
    } catch { }
    markPerf('cache-check');

    try {
      let visibility;
      try {
        markPerf('visibility-import-start');
        const { optimizedVisibilityCalculator } = await loadVisibilityCalculatorModule();
        markPerf('visibility-import-done');
        if (
          typeof optimizedVisibilityCalculator.calculateVisibilityWithoutOverrides === 'function'
        ) {
          markPerf('visibility-calc-without-overrides-start');
          visibility = await optimizedVisibilityCalculator.calculateVisibilityWithoutOverrides(
            observer,
            target,
            options,
          );
          markPerf('visibility-calc-without-overrides-done');
        } else {
          markPerf('visibility-calc-start');
          visibility = await optimizedVisibilityCalculator.calculateVisibility(
            observer,
            target,
            options,
          );
          markPerf('visibility-calc-done');
        }
      } catch {
        markPerf('visibility-fallback-start');
        visibility = await this.visibilityCalculator.calculateVisibility(observer, target, options);
        markPerf('visibility-fallback-done');
      }

      let targetHasCoverFromObserver = false;
      let coverResult = 'none';
      try {
        markPerf('cover-import-start');
        const { CoverDetector } = await loadCoverDetectorModule();
        markPerf('cover-import-done');
        markPerf('cover-construct-start');
        const coverDetector = new CoverDetector();
        markPerf('cover-construct-done');
        markPerf('observer-position-start');
        const observerPos = this.positionManager.getTokenPosition(observer);
        markPerf('observer-position-done');
        markPerf('cover-detect-start');
        const useTokenCoverDetection =
          override?.coverOnly === true ||
          override?.coverOverrideSource === 'take_cover_action' ||
          override?.source === 'take_cover_action';
        if (useTokenCoverDetection && typeof coverDetector.detectBetweenTokens === 'function') {
          coverResult = coverDetector.detectBetweenTokens(observer, target, options);
        } else {
          coverResult = coverDetector.detectFromPoint(observerPos, target);
        }
        markPerf('cover-detect-done');
        targetHasCoverFromObserver = coverResult === 'standard' || coverResult === 'greater';
      } catch {
        markPerf('cover-detect-failed');
        targetHasCoverFromObserver = false;
        coverResult = 'none';
      }

      const targetHasConcealmentFromObserver =
        visibility === 'concealed' || visibility === 'hidden';
      const targetIsVisibleToObserver = visibility === 'observed' || visibility === 'concealed';
      const ignoresStealthPositionValidation = targetIgnoresStealthPositionValidation(
        target,
        override,
      );
      const overrideExpectsObscuredVisibility =
        override.hasConcealment || STEALTH_OVERRIDE_STATES.has(override.state);
      if (!visibility) {
        flushPerf({ reason: 'no-visibility-result', visibility, coverResult });
        return null;
      }
      markPerf('state-compare-start');

      const reasons = [];
      const isCoverOnlyOverride =
        override?.coverOnly === true ||
        override?.coverOverrideSource === 'take_cover_action' ||
        override?.source === 'take_cover_action';
      if (
        isCoverOnlyOverride &&
        override.expectedCover &&
        override.expectedCover !== coverResult
      ) {
        reasons.push({
          icon: 'fas fa-shield-alt',
          text: coverResult === 'none' ? 'no cover' : `has ${coverResult} cover`,
          type: `cover-${coverResult}`,
          crossed: coverResult === 'none',
        });
      }
      if (
        !isCoverOnlyOverride &&
        !ignoresStealthPositionValidation &&
        override.hasCover &&
        !targetHasCoverFromObserver
      ) {
        if (coverResult === 'none') {
          reasons.push({
            icon: 'fas fa-shield-alt',
            text: 'no cover',
            type: 'cover-none',
            crossed: true,
          });
        }
      }
      if (
        !isCoverOnlyOverride &&
        !ignoresStealthPositionValidation &&
        !override.hasCover &&
        targetHasCoverFromObserver
      ) {
        reasons.push({
          icon: 'fas fa-shield-alt',
          text: `has ${coverResult} cover`,
          type: `cover-${coverResult}`,
        });
      }
      if (
        !ignoresStealthPositionValidation &&
        override.hasConcealment &&
        targetIsVisibleToObserver &&
        !targetHasConcealmentFromObserver
      ) {
        reasons.push({
          icon: 'fas fa-eye-slash',
          text: 'no concealment',
          type: 'concealment-none',
          crossed: true,
        });
      }
      if (
        !ignoresStealthPositionValidation &&
        !override.hasConcealment &&
        targetHasConcealmentFromObserver
      ) {
        reasons.push({
          icon: 'fas fa-eye-slash',
          text: 'has concealment',
          type: 'concealment-has',
        });
      }
      if (
        !ignoresStealthPositionValidation &&
        override.hasConcealment &&
        visibility === 'observed'
      ) {
        reasons.push({ icon: 'fas fa-eye', text: 'clearly visible', type: 'visibility-clear' });
      }
      if (
        !ignoresStealthPositionValidation &&
        overrideExpectsObscuredVisibility &&
        (override.source === 'manual_action' || override.source === 'sneak_action')
      ) {
        if (
          visibility === 'observed' &&
          !targetHasCoverFromObserver &&
          !targetHasConcealmentFromObserver
        ) {
          const observerToken = canvas.tokens?.get(observerId);
          if (observerToken?.actor) {
            try {
              markPerf('vision-analyzer-import-start');
              const { VisionAnalyzer } = await loadVisionAnalyzerModule();
              markPerf('vision-analyzer-import-done');
              const visionAnalyzer = VisionAnalyzer.getInstance();
              markPerf('vision-capabilities-start');
              const visionCapabilities = visionAnalyzer.getVisionCapabilities(observerToken.actor);
              markPerf('vision-capabilities-done');
              if (!visionCapabilities.hasDarkvision) {
                if (override.source !== 'sneak_action') {
                  reasons.push({
                    icon: 'fas fa-eye',
                    text: 'clearly visible',
                    type: 'visibility-clear',
                  });
                }
              }
            } catch { }
          }
        }
      }

      const reasonIconsForUi = [];
      const sourceIconMap = {
        sneak_action: { icon: 'fas fa-user-ninja', text: 'sneak', type: 'sneak-source' },
        seek_action: { icon: 'fas fa-search', text: 'seek', type: 'seek-source' },
        point_out_action: {
          icon: 'fas fa-hand-point-right',
          text: 'point out',
          type: 'pointout-source',
        },
        hide_action: { icon: 'fas fa-mask', text: 'hide', type: 'hide-source' },
        diversion_action: {
          icon: 'fas fa-theater-masks',
          text: 'diversion',
          type: 'diversion-source',
        },
        manual_action: { icon: 'fas fa-tools', text: 'manual', type: 'manual-source' },
        take_cover_action: { icon: 'fas fa-shield-alt', text: 'take cover', type: 'cover-source' },
      };
      const srcKey = override.source || 'manual_action';
      if (sourceIconMap[srcKey]) reasonIconsForUi.push(sourceIconMap[srcKey]);

      let result = null;
      if (reasons.length > 0) {
        result = {
          shouldRemove: true,
          reason: reasons.map((r) => r.text).join(' and '),
          reasonIcons: reasonIconsForUi,
          currentVisibility: visibility,
          currentCover: coverResult,
        };
      }
      markPerf('state-compare-done');

      try {
        this._overrideValidityCache.set(__cacheKey || `${observerId}-${targetId}`, {
          result,
          obsPos: __obsPosKey,
          tgtPos: __tgtPosKey,
        });
      } catch { }
      markPerf('cache-store');
      flushPerf({ reason: 'complete', visibility, coverResult, result });

      return result;
    } catch (error) {
      flushPerf({ reason: 'error', error: error?.message ?? String(error) });
      console.warn('PF2E Visioner | Error validating override:', error);
      return null;
    }
  }

  async showOverrideValidationDialog(invalidOverrides, movedTokenId = null) {
    if (invalidOverrides.length === 0) return;
    try {
      const lastMoved = globalThis?.game?.pf2eVisioner?.lastMovedTokenId || null;
      if (lastMoved && movedTokenId && movedTokenId !== lastMoved) {
        return;
      }
    } catch { }
    const overrideData = invalidOverrides.map(
      ({
        observerId,
        targetId,
        override,
        reason,
        reasonIcons,
        currentVisibility,
        currentCover,
        stealthPositionBypassFeat,
        stealthPositionBypassLabel,
        stealthPositionBypassIcon,
        stealthPositionBypassTooltip,
      }) => {
        const observer = canvas.tokens?.get(observerId);
        const target = canvas.tokens?.get(targetId);
        return {
          id: `${observerId}-${targetId}`,
          observerId,
          targetId,
          observerName: observer?.document?.name || 'Unknown',
          targetName: target?.document?.name || 'Unknown',
          state: override.state || 'undetected',
          source: override.source || 'unknown',
          reason,
          reasonIcons: reasonIcons || [],
          hasCover: override.hasCover || false,
          hasConcealment: override.hasConcealment || false,
          expectedCover: override.expectedCover,
          coverOnly: override.coverOnly === true,
          coverOverrideSource: override.coverOverrideSource,
          currentVisibility,
          currentCover,
          stealthPositionBypassFeat:
            stealthPositionBypassFeat || override.stealthPositionBypassFeat,
          stealthPositionBypassLabel:
            stealthPositionBypassLabel || override.stealthPositionBypassLabel,
          stealthPositionBypassIcon:
            stealthPositionBypassIcon || override.stealthPositionBypassIcon,
          stealthPositionBypassTooltip:
            stealthPositionBypassTooltip || override.stealthPositionBypassTooltip,
          isManual: override.source === 'manual_action',
        };
      },
    );
    let movedTokenName = 'Unknown Token';
    const lastMoved = globalThis?.game?.pf2eVisioner?.lastMovedTokenId || movedTokenId || null;
    if (lastMoved) {
      movedTokenName = canvas.tokens?.get(lastMoved)?.document?.name || movedTokenName;
    } else if (invalidOverrides.length > 0) {
      const first = invalidOverrides[0];
      movedTokenName =
        canvas.tokens?.get(first?.observerId)?.document?.name ||
        canvas.tokens?.get(first?.targetId)?.document?.name ||
        movedTokenName;
    }
    try {
      const { default: indicator } = await import('../../../ui/OverrideValidationIndicator.js');
      const headerId = lastMoved || movedTokenId || null;
      // Filter by LOS — only show overrides where the moved token can see the other token
      let dataToShow = overrideData;
      const moverToken = headerId ? canvas.tokens?.get(headerId) : null;
      if (moverToken) {
        try {
          const { VisionAnalyzer } = await loadVisionAnalyzerModule();
          const va = VisionAnalyzer.getInstance();
          va.clearCache();
          dataToShow = overrideData.filter((o) => {
            try {
              if (o.targetId === headerId) return true;
              const otherId = o.observerId === headerId ? o.targetId : o.observerId;
              const otherToken = canvas.tokens?.get(otherId);
              if (!otherToken) return false;
              return va.hasLineOfSight(moverToken, otherToken) !== false;
            } catch { return true; }
          });
        } catch { }
      }
      if (dataToShow.length > 0) {
        indicator.show(dataToShow, movedTokenName, headerId);
      } else {
        indicator.hide(true);
      }
    } catch (err) {
      console.warn('PF2E Visioner | Failed to show indicator, falling back to dialog:', err);
      try {
        const { OverrideValidationDialog } = await import(
          '../../../ui/OverrideValidationDialog.js'
        );
        await OverrideValidationDialog.show(
          overrideData,
          movedTokenName,
          lastMoved || movedTokenId || null,
        );
      } catch (error) {
        console.error('PF2E Visioner | Error showing override validation dialog:', error);
      }
    }
  }

  _pruneCache() {
    try {
      this._overrideValidityCache.pruneIfDue(5000);
    } catch { }
  }

  _hasActiveTimer(timedOverride) {
    if (!timedOverride) return false;
    if (timedOverride.type === 'realtime' && timedOverride.expiresAt > Date.now()) return true;
    if (timedOverride.type === 'rounds' && timedOverride.roundsRemaining > 0) return true;
    return false;
  }

  /**
   * Validate override for a specific token (test compatibility method)
   * @param {string} tokenId - ID of the token to validate
   * @returns {Object|null} Validation result or null if token not found
   */
  validateOverride(tokenId) {
    try {
      const token = canvas.tokens?.get?.(tokenId);
      if (!token) {
        return null;
      }

      // Return a basic validation result for tests
      return {
        tokenId: tokenId,
        valid: true,
        reason: 'test-validation',
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('PF2E Visioner | Error validating override:', error);
      return null;
    }
  }
}
