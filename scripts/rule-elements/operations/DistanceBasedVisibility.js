export class DistanceBasedVisibility {
  static async applyDistanceBasedVisibility(operation, subjectToken) {
    if (!subjectToken) {
      console.warn('PF2E Visioner | No subject token provided to applyDistanceBasedVisibility');
      return;
    }

    const {
      observers = 'all',
      direction = 'from',
      distanceBands,
      source,
      priority = 100,
      tokenIds,
      predicate,
    } = operation;

    if (!distanceBands || distanceBands.length === 0) {
      console.warn('PF2E Visioner | distanceBasedVisibility requires distanceBands array');
      return;
    }

    await subjectToken.document.setFlag('pf2e-visioner', 'distanceBasedVisibility', {
      active: true,
      source: source || `distance-visibility-${Date.now()}`,
      distanceBands,
      direction,
      observers,
      priority,
      predicate,
    });

    if (window.pf2eVisioner?.services?.autoVisibilitySystem?.recalculateForTokens) {
      await window.pf2eVisioner.services.autoVisibilitySystem.recalculateForTokens([
        subjectToken.id,
      ]);
    } else if (window.pf2eVisioner?.services?.autoVisibilitySystem?.recalculateAll) {
      await window.pf2eVisioner.services.autoVisibilitySystem.recalculateAll();
    } else if (canvas?.perception) {
      canvas.perception.update({ refreshVision: true, refreshOcclusion: true });
    }
  }

  static getApplicableDistanceBand(distance, distanceBands) {
    const sortedBands = [...distanceBands].sort((a, b) => {
      const aMin = a.minDistance || 0;
      const bMin = b.minDistance || 0;
      return aMin - bMin;
    });

    for (const band of sortedBands) {
      const minDistance = band.minDistance || 0;
      const maxDistance = band.maxDistance || Infinity;

      if (distance >= minDistance && distance < maxDistance) {
        return band;
      }
    }

    return null;
  }

  static async removeDistanceBasedVisibility(operation, subjectToken) {
    if (!subjectToken) return;

    await subjectToken.document.unsetFlag('pf2e-visioner', 'distanceBasedVisibility');

    if (window.pf2eVisioner?.services?.autoVisibilitySystem?.recalculateForTokens) {
      await window.pf2eVisioner.services.autoVisibilitySystem.recalculateForTokens([
        subjectToken.id,
      ]);
    } else if (window.pf2eVisioner?.services?.autoVisibilitySystem?.recalculateAll) {
      await window.pf2eVisioner.services.autoVisibilitySystem.recalculateAll();
    } else if (canvas?.perception) {
      canvas.perception.update({ refreshVision: true, refreshOcclusion: true });
    }
  }
}
