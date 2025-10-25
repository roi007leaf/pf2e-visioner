export class LightingLevelCache {
    static #instance = null;

    #cache = new Map();
    #lastUpdate = 0;
    #ttlMs = 2000;
    #lightingCalculator = null;

    static getInstance() {
        if (!LightingLevelCache.#instance) {
            LightingLevelCache.#instance = new LightingLevelCache();
        }
        return LightingLevelCache.#instance;
    }

    initialize(lightingCalculator) {
        this.#lightingCalculator = lightingCalculator;
    }

    getLightLevel(tokenId, position, token) {
        const now = Date.now();

        if (now - this.#lastUpdate > this.#ttlMs) {
            this.#cache.clear();
            this.#lastUpdate = now;
        }

        const key = `${tokenId}-${Math.round(position.x)}-${Math.round(position.y)}`;

        if (this.#cache.has(key)) {
            return this.#cache.get(key);
        }

        const result = this.#lightingCalculator.getLightLevelAt(position, token);
        this.#cache.set(key, result);

        return result;
    }

    precomputeForTokens(tokens) {
        const results = new Map();

        for (const token of tokens) {
            const adjustedPos = token.getMovementAdjustedPoint?.(token.center) ?? token.center;
            const position = {
                x: adjustedPos.x,
                y: adjustedPos.y,
                elevation: token.document.elevation || 0
            };

            const key = `${token.document.id}-${Math.round(position.x)}-${Math.round(position.y)}`;

            if (!this.#cache.has(key)) {
                const result = this.#lightingCalculator.getLightLevelAt(position, token);
                this.#cache.set(key, result);
                results.set(token.document.id, result);
            } else {
                results.set(token.document.id, this.#cache.get(key));
            }
        }

        return results;
    }

    clear() {
        this.#cache.clear();
        this.#lastUpdate = 0;
    }
}
