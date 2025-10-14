export class SensePrecomputer {
    static #cache = new Map();
    static #lastUpdate = 0;
    static #ttlMs = 2000;

    static precompute(tokens, visionAnalyzer) {
        const now = Date.now();

        if (now - this.#lastUpdate > this.#ttlMs) {
            this.#cache.clear();
            this.#lastUpdate = now;
        }

        const results = new Map();

        for (const token of tokens) {
            const tokenId = token.document.id;

            if (this.#cache.has(tokenId)) {
                results.set(tokenId, this.#cache.get(tokenId));
            } else {
                const capabilities = visionAnalyzer.getVisionCapabilities(token);
                this.#cache.set(tokenId, capabilities);
                results.set(tokenId, capabilities);
            }
        }

        return results;
    }

    static get(tokenId) {
        return this.#cache.get(tokenId);
    }

    static clear() {
        this.#cache.clear();
        this.#lastUpdate = 0;
    }
}
