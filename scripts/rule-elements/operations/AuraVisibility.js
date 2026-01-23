import { SourceTracker } from '../SourceTracker.js';

export class AuraVisibility {
  static async applyAuraVisibility(operation, subjectToken) {
    if (!subjectToken) {
      console.warn('PF2E Visioner | No subject token provided to applyAuraVisibility');
      return;
    }

    const {
      auraRadius = 10,
      insideOutsideState = 'concealed',
      outsideInsideState = 'concealed',
      sourceExempt = true,
      includeSourceAsTarget = false,
      auraTargets = 'all',
      source,
      priority = 150,
    } = operation;

    const sourceId = source || `aura-visibility-${Date.now()}`;

    console.log('PF2E Visioner | applyAuraVisibility:', {
      token: subjectToken.name,
      radius: auraRadius,
      sourceId,
    });

    await subjectToken.document.setFlag('pf2e-visioner', 'auraVisibility', {
      active: true,
      source: sourceId,
      auraRadius,
      insideOutsideState,
      outsideInsideState,
      sourceExempt,
      includeSourceAsTarget,
      auraTargets,
      priority,
    });

    console.log('PF2E Visioner | auraVisibility flag set, triggering recalculation');

    if (window.pf2eVisioner?.services?.autoVisibilitySystem?.recalculateAll) {
      await window.pf2eVisioner.services.autoVisibilitySystem.recalculateAll();
      console.log('PF2E Visioner | recalculateAll completed');
    } else if (canvas?.perception) {
      canvas.perception.update({ refreshVision: true, refreshOcclusion: true });
      console.log('PF2E Visioner | canvas.perception.update triggered');
    }
  }

  static partitionTokensByAura(subjectToken, radius) {
    const allTokens = canvas.tokens?.placeables.filter((t) => t.actor && t.id !== subjectToken.id) || [];
    const inside = [];
    const outside = [];

    for (const token of allTokens) {
      const distance = subjectToken.distanceTo(token);

      if (distance <= radius) {
        inside.push(token);
      } else {
        outside.push(token);
      }
    }

    return { inside, outside };
  }

  static async removeAuraVisibility(operation, subjectToken) {
    if (!subjectToken) return;

    const sourceId =
      operation?.source || subjectToken.document.getFlag('pf2e-visioner', 'auraVisibility')?.source;

    if (!sourceId) return;

    const allTokens = canvas.tokens?.placeables.filter((t) => t.actor) || [];

    for (const token of allTokens) {
      await SourceTracker.removeSource(token, sourceId, 'visibility');
    }

    await subjectToken.document.unsetFlag('pf2e-visioner', 'auraVisibility');

    const { setVisibilityMap } = await import('../../stores/visibility-map.js');
    for (const token of allTokens) {
      await setVisibilityMap(token, {});
    }

    if (window.pf2eVisioner?.services?.autoVisibilitySystem?.recalculateAll) {
      await window.pf2eVisioner.services.autoVisibilitySystem.recalculateAll();
    } else if (canvas?.perception) {
      canvas.perception.update({ refreshVision: true, refreshOcclusion: true });
    }
  }
}
