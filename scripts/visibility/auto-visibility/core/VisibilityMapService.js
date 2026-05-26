import {
    getDocumentVisibilityMap as storeGetDocumentVisibilityMap,
    getVisibilityMap as storeGetVisibilityMap,
    setVisibilityMap as storeSetVisibilityMap,
    setVisibilityMapsBatch as storeSetVisibilityMapsBatch,
    setVisibilityBetween as storeSetVisibilityBetween,
} from '../../../stores/visibility-map.js';
/**
 * VisibilityMapService
 * Thin wrapper service around the visibility map store utilities.
 */
export class VisibilityMapService {
    constructor() { }

    /**
     * Get the visibility map for a token (observer -> { targetId: state }).
     * @param {Token} token
     * @returns {Record<string, string>}
     */
    getVisibilityMap(token) {
        try {
            return storeGetVisibilityMap(token) || {};
        } catch {
            return {};
        }
    }

    getDocumentVisibilityMap(token) {
        try {
            return storeGetDocumentVisibilityMap(token) || {};
        } catch {
            return {};
        }
    }

    /**
     * Set visibility state between two tokens.
     * @param {Token} observer
     * @param {Token} target
     * @param {string} state
     * @param {object} [options]
     */
    async setVisibilityBetween(observer, target, state, options = undefined) {
        return storeSetVisibilityBetween(observer, target, state, options);
    }

    async setVisibilityMap(token, visibilityMap, options = undefined) {
        return storeSetVisibilityMap(token, visibilityMap, options);
    }

    async setVisibilityMaps(entries, options = undefined) {
        return storeSetVisibilityMapsBatch(entries, options);
    }
}
