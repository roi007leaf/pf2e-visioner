/**
 * ViewportFilterService - Handles client-aware viewport filtering for performance optimization
 * Manages viewport bounds detection and token filtering based on client view
 */

import { MODULE_ID } from '../../../constants.js';

export class ViewportFilterService {
    /** @type {PositionManager} */
    #positionManager = null;

    /**
     * Initialize the viewport filter service
     * @param {PositionManager} positionManager - Position manager for token coordinates
     */
    initialize(positionManager) {
        this.#positionManager = positionManager;
    }

    /**
     * Check if client-aware (viewport) filtering is enabled.
     * @returns {boolean} Whether viewport filtering is enabled
     */
    isClientAwareFilteringEnabled() {
        try {
            const v = game.settings.get(MODULE_ID, 'clientViewportFiltering');
            return v !== false; // treat undefined as enabled
        } catch {
            return true; // Default to enabled
        }
    }

    /**
     * Get tokens currently visible in the viewport.
     * @param {number} paddingPx - Padding around viewport in pixels
     * @returns {Set<string>|null} Set of token IDs in viewport, or null if unavailable
     */
    getViewportTokenIdSet(paddingPx = 64) {
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

            const tokenIdSet = new Set();
            const tokens = canvas.tokens?.placeables || [];

            for (const token of tokens) {
                if (!this.#positionManager) {
                    // Fallback to basic token position if no position manager
                    const pos = { x: token.x, y: token.y };
                    if (pos.x >= minX && pos.x <= maxX && pos.y >= minY && pos.y <= maxY) {
                        tokenIdSet.add(token.document.id);
                    }
                } else {
                    const pos = this.#positionManager.getTokenPosition(token);
                    if (pos.x >= minX && pos.x <= maxX && pos.y >= minY && pos.y <= maxY) {
                        tokenIdSet.add(token.document.id);
                    }
                }
            }

            return tokenIdSet;
        } catch (error) {
            console.warn('PF2E Visioner | Viewport token detection failed:', error);
            return null;
        }
    }

    /**
     * Create viewport filter configuration for other services
     * @returns {Object|null} Viewport filter configuration or null if disabled
     */
    createViewportFilterConfig() {
        if (!this.isClientAwareFilteringEnabled()) {
            return null;
        }

        return {
            isEnabled: () => this.isClientAwareFilteringEnabled(),
            getTokenIdSet: () => this.getViewportTokenIdSet()
        };
    }

    /**
     * Check if a specific token is within the current viewport
     * @param {Token|string} tokenOrId - Token object or token ID
     * @param {number} paddingPx - Padding around viewport in pixels
     * @returns {boolean} True if token is in viewport
     */
    isTokenInViewport(tokenOrId, paddingPx = 64) {
        const viewportTokens = this.getViewportTokenIdSet(paddingPx);
        if (!viewportTokens) return true; // If viewport detection fails, assume visible

        const tokenId = typeof tokenOrId === 'string' ? tokenOrId : tokenOrId.document?.id;
        return viewportTokens.has(tokenId);
    }

    /**
     * Get viewport bounds in world coordinates
     * @param {number} paddingPx - Padding around viewport in pixels
     * @returns {Object|null} Bounds object with {minX, minY, maxX, maxY} or null if unavailable
     */
    getViewportBounds(paddingPx = 64) {
        try {
            const screen = canvas.app?.renderer?.screen;
            const wt = canvas.stage?.worldTransform;
            if (!screen || !wt || typeof wt.applyInverse !== 'function') return null;

            const topLeft = wt.applyInverse({ x: 0, y: 0 });
            const bottomRight = wt.applyInverse({ x: screen.width, y: screen.height });

            return {
                minX: Math.min(topLeft.x, bottomRight.x) - paddingPx,
                minY: Math.min(topLeft.y, bottomRight.y) - paddingPx,
                maxX: Math.max(topLeft.x, bottomRight.x) + paddingPx,
                maxY: Math.max(topLeft.y, bottomRight.y) + paddingPx
            };
        } catch {
            return null;
        }
    }

    /**
     * Get viewport statistics for debugging
     * @returns {Object} Viewport statistics
     */
    getViewportStats() {
        const bounds = this.getViewportBounds();
        const tokenCount = this.getViewportTokenIdSet()?.size || 0;

        return {
            isEnabled: this.isClientAwareFilteringEnabled(),
            bounds,
            tokensInViewport: tokenCount,
            hasCanvas: !!canvas.app?.renderer?.screen
        };
    }
}