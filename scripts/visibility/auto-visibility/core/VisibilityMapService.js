import { getVisibilityMap as storeGetVisibilityMap, setVisibilityBetween as storeSetVisibilityBetween } from '../../../stores/visibility-map.js';
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
}
