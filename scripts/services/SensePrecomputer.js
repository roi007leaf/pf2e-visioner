import { getActiveSceneHearingRange } from './scene-hearing-range.js';

function getSceneHearingRangeCacheKey() {
    const range = getActiveSceneHearingRange();
    return range === null ? 'none' : String(range);
}

function getTokenSensePrecomputeCacheKey(token) {
    const tokenId = token?.document?.id;
    if (!tokenId) return null;
    const sceneId = globalThis.canvas?.scene?.id ?? globalThis.canvas?.scene?._id ?? 'none';
    return `${tokenId}|scene:${sceneId}|hearing:${getSceneHearingRangeCacheKey()}`;
}

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
            const cacheKey = getTokenSensePrecomputeCacheKey(token) ?? tokenId;

            if (this.#cache.has(cacheKey)) {
                results.set(tokenId, this.#cache.get(cacheKey));
            } else {
                const capabilities = visionAnalyzer.getVisionCapabilities(token);
                this.#cache.set(cacheKey, capabilities);
                results.set(tokenId, capabilities);
            }
        }

        return results;
    }

    static get(tokenId) {
        if (this.#cache.has(tokenId)) return this.#cache.get(tokenId);
        const prefix = `${tokenId}|`;
        for (const [key, value] of this.#cache.entries()) {
            if (key.startsWith(prefix)) return value;
        }
        return undefined;
    }

    static clear() {
        this.#cache.clear();
        this.#lastUpdate = 0;
    }
}
