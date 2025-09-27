import { MODULE_ID } from '../../../constants.js';

/**
 * ViewportFilter
 * - Encapsulates client-aware filtering (setting + viewport bounds sampling)
 */
export class ViewportFilter {
    isEnabled() {
        try {
            const v = game.settings.get(MODULE_ID, 'clientViewportFiltering');
            return v !== false; // treat undefined as enabled
        } catch {
            return true;
        }
    }

    /**
     * Returns a Set<string> of token ids whose centers fall within the current viewport (+ padding),
     * or null when viewport context isn't available (so callers can skip filtering gracefully).
     * @param {number} paddingPx
     * @param {Map<string, {x:number,y:number,elevation:number}>} [positions]
     */
    getTokenIdSet(paddingPx = 64, positions = undefined, getTokenPosition = undefined) {
        try {
            const screen = canvas.app?.renderer?.screen;
            const wt = canvas.stage?.worldTransform;
            if (!screen || !wt || typeof wt.applyInverse !== 'function') return null;

            const topLeft = wt.applyInverse({ x: 0, y: 0 });
            const bottomRight = wt.applyInverse({ x: screen.width, y: screen.height });
            const minX = Math.min(topLeft.x, bottomRight.x) - paddingPx;
            const minY = Math.min(topLeft.y, bottomRight.y) - paddingPx;
            const maxX = Math.max(topLeft.x, bottomRight.x) + paddingPx;
            const maxY = Math.max(topLeft.y, bottomRight.y) + paddingPx;

            const set = new Set();
            const tokens = canvas.tokens?.placeables || [];
            for (const t of tokens) {
                const pos = positions?.get?.(t.document.id)
                    || (typeof getTokenPosition === 'function' ? getTokenPosition(t) : undefined);
                if (!pos) continue;
                if (pos.x >= minX && pos.x <= maxX && pos.y >= minY && pos.y <= maxY) {
                    set.add(t.document.id);
                }
            }
            return set;
        } catch {
            return null;
        }
    }
}
