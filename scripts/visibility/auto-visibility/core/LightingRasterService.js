/**
 * LightingRasterService
 * Fast, approximate darkness sampling along a ray using LightingCalculator.
 * Avoids iterating light shapes and complex geometry in hot paths.
 */
export class LightingRasterService {
  constructor() {
    this._lightingCalculator = null;
  }

  async _ensureCalculator() {
    if (this._lightingCalculator) return this._lightingCalculator;
    const { LightingCalculator } = await import('../LightingCalculator.js');
    this._lightingCalculator = LightingCalculator.getInstance?.();
    return this._lightingCalculator;
  }

  /**
   * Sample along the ray between observer and target and report darkness presence and max rank.
   * @param {Token} observer
   * @param {Token} target
   * @param {{x:number,y:number,elevation?:number}} observerPos
   * @param {{x:number,y:number,elevation?:number}} targetPos
   * @returns {Promise<{passesThroughDarkness:boolean, maxDarknessRank:number}>}
   */
  async getRayDarknessInfo(observer, target, observerPos, targetPos) {
    try {
      const calc = await this._ensureCalculator();
      if (!calc || !observerPos || !targetPos) return { passesThroughDarkness: false, maxDarknessRank: 0 };

      const dx = targetPos.x - observerPos.x;
      const dy = targetPos.y - observerPos.y;
      const dist = Math.hypot(dx, dy) || 1;
      const gs = canvas.grid?.size || 1;
      // Sample roughly once per grid cell, clamped for safety
      const rawSteps = Math.ceil(dist / gs);
      const steps = Math.max(3, Math.min(rawSteps, 64));
      let maxRank = 0;
      let passes = false;

      for (let i = 1; i < steps; i++) { // skip endpoints (positions already evaluated separately)
        const t = i / steps;
        const x = observerPos.x + dx * t;
        const y = observerPos.y + dy * t;
        const pos = { x, y, elevation: observerPos.elevation ?? observer?.document?.elevation ?? 0 };
        try {
          const level = calc.getLightLevelAt(pos, observer || target || null);
          const r = Number(level?.darknessRank || 0) || 0;
          if (r > 0) {
            passes = true;
            if (r > maxRank) maxRank = r;
            if (maxRank >= 4) break; // early exit on highest meaningful rank
          }
        } catch { /* continue sampling */ }
      }
      return { passesThroughDarkness: passes, maxDarknessRank: maxRank };
    } catch {
      return { passesThroughDarkness: false, maxDarknessRank: 0 };
    }
  }
}
