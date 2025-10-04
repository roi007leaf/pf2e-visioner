import { MODULE_ID } from '../../../constants.js';

/**
 * DarknessDetector encapsulates best-effort detection of darkness sources on the scene.
 */
export class DarknessDetector {
    /**
     * Returns true if the scene likely has darkness sources (negative lights, darkness ranks, etc.).
     */
    static hasDarknessSources() {
        try {
            const ds = canvas.effects?.darknessSources || [];
            if (Array.isArray(ds) && ds.length > 0) {
                return true;
            }
        } catch { /* noop */ }

        try {
            const lightObjs = canvas.lighting?.objects?.children || canvas.lighting?.placeables || [];
            for (const l of lightObjs) {
                const negCfg = l?.document?.config?.negative ? 1 : 0;
                const rankFlag = Number(l?.document?.getFlag?.(MODULE_ID, 'darknessRank') || 0) || 0;
                if (negCfg > 0 || rankFlag > 0 || l?.isDarknessSource) {
                    return true;
                }
            }
        } catch { /* noop */ }

        return false;
    }
}
