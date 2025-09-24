/**
 * LightingPrecomputer precomputes light levels for a set of tokens at their current positions.
 */
export class LightingPrecomputer {
    /**
     * @param {Map<string, {x:number,y:number,elevation:number}>} [positions] - optional position map
     * @param {Iterable<Token>} tokens - tokens to precompute for
     * @returns {Promise<{map: Map<string, any>, stats: {batch: string, targetUsed: number, targetMiss: number, observerUsed: number, observerMiss: number}}>} 
     */
    static async precompute(tokens, positions = undefined) {
        const stats = { batch: 'process', targetUsed: 0, targetMiss: 0, observerUsed: 0, observerMiss: 0 };
        let map = null;
        try {
            const { LightingCalculator } = await import('../LightingCalculator.js');
            const lightingCalculator = LightingCalculator.getInstance?.();
            if (!lightingCalculator) return { map, stats };
            map = new Map();
            for (const tok of tokens) {
                try {
                    const pos = positions?.get?.(tok.document.id) || LightingPrecomputer.#getPos(tok);
                    const light = lightingCalculator.getLightLevelAt(pos, tok);
                    map.set(tok.document.id, light);
                } catch { /* best-effort per token */ }
            }
        } catch { map = null; }
        return { map, stats };
    }

    static #getPos(tok) {
        const gs = canvas.grid?.size || 1;
        return {
            x: tok.document.x + (tok.document.width * gs) / 2,
            y: tok.document.y + (tok.document.height * gs) / 2,
            elevation: tok.document.elevation || 0,
        };
    }
}
