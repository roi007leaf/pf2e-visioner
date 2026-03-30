import { MODULE_ID } from '../../../constants.js';
import { getLogger } from '../../../utils/logger.js';

const log = getLogger('DeferredSeek');
const DEFERRED_FLAG = 'deferredSeekResults';

class DeferredSeekManager {
  static #instance = null;
  #initialized = false;

  static getInstance() {
    if (!DeferredSeekManager.#instance) {
      DeferredSeekManager.#instance = new DeferredSeekManager();
    }
    return DeferredSeekManager.#instance;
  }

  initialize() {
    if (this.#initialized) return;
    this.#initialized = true;

    Hooks.on('pf2e-visioner.tokenMovementComplete', (movedTokenIds) => {
      this.#onMovementComplete(movedTokenIds);
    });
  }

  async storeDeferredResults(observerTokenId, results) {
    if (!results || results.length === 0) return;
    const token = canvas.tokens.placeables.find(
      (t) => t.document?.id === observerTokenId
    );
    if (!token) return;

    const existing = token.document.getFlag(MODULE_ID, DEFERRED_FLAG) ?? [];
    const merged = [...existing];
    for (const r of results) {
      const idx = merged.findIndex((e) => e.targetId === r.targetId);
      const entry = {
        targetId: r.targetId,
        newVisibility: r.newVisibility,
        oldVisibility: r.oldVisibility,
        outcome: r.outcome,
        timestamp: Date.now(),
      };
      if (idx >= 0) {
        merged[idx] = entry;
      } else {
        merged.push(entry);
      }
    }
    await token.document.setFlag(MODULE_ID, DEFERRED_FLAG, merged);
    log.debug(() => ({
      msg: 'stored deferred seek results',
      observer: token.name,
      targetCount: results.length,
    }));
  }

  async checkAndApplyDeferred(movedTokenId) {
    if (!game.user?.isGM) return;

    const observer = canvas.tokens.placeables.find(
      (t) => t.document?.id === movedTokenId
    );
    console.log('PF2E Visioner | checkAndApplyDeferred:', {
      movedTokenId,
      observerName: observer?.name,
      hasObserver: !!observer,
    });
    if (!observer) return;

    const deferred = observer.document.getFlag(MODULE_ID, DEFERRED_FLAG);
    console.log('PF2E Visioner | checkAndApplyDeferred deferred:', {
      observerName: observer.name,
      deferredCount: deferred?.length ?? 0,
      targets: deferred?.map(d => d.targetId) ?? [],
    });
    if (!deferred || deferred.length === 0) return;

    const { VisionAnalyzer } = await import(
      '../../../visibility/auto-visibility/VisionAnalyzer.js'
    );
    const { applyVisibilityChanges } = await import('./shared-utils.js');
    const va = VisionAnalyzer.getInstance();
    va.clearCache();

    const toApply = [];
    const stillDeferred = [];

    for (const entry of deferred) {
      const target = canvas.tokens.placeables.find(
        (t) => t.document?.id === entry.targetId
      );
      if (!target) continue;

      const los = va.hasLineOfSight(observer, target);
      console.log('PF2E Visioner | checkAndApplyDeferred LOS:', {
        observer: observer.name,
        target: target.name,
        los,
        newVis: entry.newVisibility,
      });
      if (los !== false) {
        toApply.push({ target, newVisibility: entry.newVisibility });
      } else {
        stillDeferred.push(entry);
      }
    }

    console.log('PF2E Visioner | checkAndApplyDeferred result:', {
      toApply: toApply.length,
      stillDeferred: stillDeferred.length,
    });
    if (toApply.length > 0) {
      try {
        await applyVisibilityChanges(observer, toApply, {
          direction: 'observer_to_target',
          source: 'seek_action_deferred',
          setAVSOverrides: true,
          skipIndicatorRefresh: true,
        });
        log.debug(() => ({
          msg: 'applied deferred seek results',
          observer: observer.name,
          appliedCount: toApply.length,
        }));
      } catch (e) {
        console.warn('PF2E Visioner | Failed to apply deferred seek results:', e);
      }
      try {
        const { default: indicator } = await import(
          '../../../ui/OverrideValidationIndicator.js'
        );
        const appliedOverrides = toApply.map((item) => ({
          observerId: movedTokenId,
          targetId: item.target?.document?.id,
          observerName: observer.name,
          targetName: item.target?.name,
          state: item.newVisibility,
          currentVisibility: item.newVisibility === 'hidden' ? 'observed' : 'observed',
          source: 'seek_action_deferred',
        }));
        indicator.show(appliedOverrides, observer.name, movedTokenId);
      } catch { }
    }

    if (stillDeferred.length > 0) {
      await observer.document.setFlag(MODULE_ID, DEFERRED_FLAG, stillDeferred);
    } else {
      await observer.document.unsetFlag(MODULE_ID, DEFERRED_FLAG);
    }
  }

  async clearDeferredForToken(tokenId) {
    const token = canvas.tokens.placeables.find(
      (t) => t.document?.id === tokenId
    );
    if (!token) return;
    try {
      await token.document.unsetFlag(MODULE_ID, DEFERRED_FLAG);
    } catch { }
  }

  async clearAll() {
    for (const token of canvas.tokens.placeables) {
      try {
        if (token.document.getFlag(MODULE_ID, DEFERRED_FLAG)) {
          await token.document.unsetFlag(MODULE_ID, DEFERRED_FLAG);
        }
      } catch { }
    }
  }

  getDeferredForToken(tokenId) {
    const token = canvas.tokens.placeables.find(
      (t) => t.document?.id === tokenId
    );
    return token?.document?.getFlag(MODULE_ID, DEFERRED_FLAG) ?? [];
  }

  async #onMovementComplete(movedTokenIds) {
    if (!game.user?.isGM) return;
    try {
      for (const tokenId of movedTokenIds) {
        await this.checkAndApplyDeferred(tokenId);
      }
    } catch (e) {
      console.warn('PF2E Visioner | Error checking deferred seek results:', e);
    }
  }
}

export default DeferredSeekManager.getInstance();
