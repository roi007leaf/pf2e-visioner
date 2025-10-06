/**
 * Manages token position tracking, pinning, and coordinate calculations for the auto-visibility system.
 * Handles position updates, position pinning during animations, and coordinate transformations.
 * 
 * @class PositionManager
 */
export class PositionManager {
    constructor(systemStateProvider) {
        this.systemStateProvider = systemStateProvider;

        // Position tracking state
        this.updatedTokenDocs = new Map(); // Store updated token documents for position calculations
        this.pinnedPositions = new Map(); // Token positions pinned during animations

        // Configuration
        this.pinDurationMs = 2000; // Duration to pin positions during animations
        this.pinEpsilon = 5; // Distance threshold for considering positions synchronized
    }

    /**
     * Store updated token document data for position calculations
     * @param {string} tokenId - Token ID
     * @param {Object} docData - Updated document data with x, y, width, height, etc.
     */
    storeUpdatedTokenDoc(tokenId, docData) {
        this.updatedTokenDocs.set(tokenId, docData);
        this.systemStateProvider.debug('store-updatedDoc', tokenId, {
            x: docData.x,
            y: docData.y,
            w: docData.width,
            h: docData.height,
        });
    }

    /**
     * Pin a token position during animation to ensure consistent visibility calculations
     * @param {string} tokenId - Token ID
     * @param {Object} positionData - Position data with x, y, elevation, until timestamp
     */
    pinPosition(tokenId, positionData) {
        this.pinnedPositions.set(tokenId, positionData);
        this.systemStateProvider.debug('pin-position', tokenId, {
            x: positionData.x,
            y: positionData.y,
            untilMs: positionData.until - Date.now(),
        });
    }

    /**
     * Calculate token center position with priority for updated coordinates during animations
     * @param {Object} token - Token object
     * @returns {Object} Position object with x, y, elevation
     */
    getTokenPosition(token) {
        // Priority 1: Updated document coordinates during an update cycle
        const updatedDoc = this.updatedTokenDocs.get(token.document.id);
        if (updatedDoc) {
            const position = {
                x: updatedDoc.x + (updatedDoc.width * canvas.grid.size) / 2,
                y: updatedDoc.y + (updatedDoc.height * canvas.grid.size) / 2,
                elevation: updatedDoc.elevation || 0,
            };
            return position;
        }

        // Priority 2: Pinned position during animation
        const pin = this.pinnedPositions.get(token.document.id);
        if (pin) {
            const now = Date.now();
            const canvasToken = canvas.tokens.get(token.document.id);

            // Check if canvas position has caught up to pinned position
            let close = false;
            if (canvasToken?.document) {
                const cx = canvasToken.document.x + (canvasToken.document.width * canvas.grid.size) / 2;
                const cy = canvasToken.document.y + (canvasToken.document.height * canvas.grid.size) / 2;
                close = Math.hypot(cx - pin.x, cy - pin.y) <= this.pinEpsilon;
            }

            // Use pinned position if not expired and canvas hasn't caught up
            if (now <= pin.until && !close) {
                return { x: pin.x, y: pin.y, elevation: pin.elevation };
            }

            // Clear expired or synchronized pins
            if (now > pin.until || close) {
                this.pinnedPositions.delete(token.document.id);
                this.systemStateProvider.debug('clear-pin', token.document.id, {
                    reason: now > pin.until ? 'expired' : 'synced',
                });
            }
        }

        // Priority 3: Live canvas token position
        const canvasToken = canvas.tokens.get(token.document.id);
        if (canvasToken?.document) {
            return {
                x: canvasToken.document.x + (canvasToken.document.width * canvas.grid.size) / 2,
                y: canvasToken.document.y + (canvasToken.document.height * canvas.grid.size) / 2,
                elevation: canvasToken.document.elevation || 0,
            };
        }

        // Priority 4: Fallback to document coordinates
        return {
            x: token.document.x + (token.document.width * canvas.grid.size) / 2,
            y: token.document.y + (token.document.height * canvas.grid.size) / 2,
            elevation: token.document.elevation || 0,
        };
    }

    /**
     * Get token position with preference for visual continuity (for visual effects)
     * Uses canvas position when available to avoid visual teleporting
     * @param {Object} token - Token object
     * @returns {Object} Position object with x, y, elevation
     */
    getTokenPositionVisual(token) {
        // Priority 1: Live canvas token position (prevents visual jumps)
        const canvasToken = canvas.tokens.get(token.document.id);
        if (canvasToken?.document) {
            return {
                x: canvasToken.document.x + (canvasToken.document.width * canvas.grid.size) / 2,
                y: canvasToken.document.y + (canvasToken.document.height * canvas.grid.size) / 2,
                elevation: canvasToken.document.elevation || 0,
            };
        }

        // Priority 2: Updated document coordinates during an update cycle
        const updatedDoc = this.updatedTokenDocs.get(token.document.id);
        if (updatedDoc) {
            return {
                x: updatedDoc.x + (updatedDoc.width * canvas.grid.size) / 2,
                y: updatedDoc.y + (updatedDoc.height * canvas.grid.size) / 2,
                elevation: updatedDoc.elevation || 0,
            };
        }

        // Priority 3: Pinned position (only if very recent to avoid stale data)
        const pin = this.pinnedPositions.get(token.document.id);
        if (pin) {
            const now = Date.now();
            const pinAge = now - (pin.until - this.pinDurationMs);

            // Only use pinned position if it's very fresh (less than 100ms old)
            if (now <= pin.until && pinAge < 100) {
                return { x: pin.x, y: pin.y, elevation: pin.elevation };
            }
        }

        // Priority 4: Fallback to document coordinates
        return {
            x: token.document.x + (token.document.width * canvas.grid.size) / 2,
            y: token.document.y + (token.document.height * canvas.grid.size) / 2,
            elevation: token.document.elevation || 0,
        };
    }

    /**
     * Calculate token center position from document coordinates and changes
     * @param {Object} tokenDoc - Token document
     * @param {Object} changes - Changes object with potential x/y updates
     * @returns {Object} Position object with x, y
     */
    calculateUpdatedPosition(tokenDoc, changes) {
        const x = changes.x !== undefined ? changes.x : tokenDoc.x;
        const y = changes.y !== undefined ? changes.y : tokenDoc.y;

        return {
            x: x + (tokenDoc.width * canvas.grid.size) / 2,
            y: y + (tokenDoc.height * canvas.grid.size) / 2,
        };
    }

    /**
     * Pin a token's destination position during a movement update
     * @param {Object} tokenDoc - Token document
     * @param {Object} changes - Changes object with position updates
     */
    pinTokenDestination(tokenDoc, changes) {
        if (!canvas?.grid?.size) return;

        const hasPositionChange = changes.x !== undefined || changes.y !== undefined;
        if (!hasPositionChange) return;

        try {
            const position = this.calculateUpdatedPosition(tokenDoc, changes);
            this.pinPosition(tokenDoc.id, {
                x: position.x,
                y: position.y,
                elevation: tokenDoc.elevation || 0,
                until: Date.now() + this.pinDurationMs,
            });
        } catch (error) {
            // Ignore errors in position pinning
        }
    }

    /**
     * Calculate distance between two tokens
     * @param {Object} token1 - First token
     * @param {Object} token2 - Second token
     * @returns {number} Distance in pixels
     */
    calculateDistance(token1, token2) {
        const pos1 = this.getTokenPosition(token1);
        const pos2 = this.getTokenPosition(token2);
        return Math.hypot(pos2.x - pos1.x, pos2.y - pos1.y);
    }

    /**
     * Get all tokens within a specified range of a position
     * @param {Object} position - Center position {x, y}
     * @param {number} maxDistance - Maximum distance in grid units
     * @param {string} excludeId - Token ID to exclude from results
     * @returns {Array} Array of tokens within range
     */
    getTokensInRange(position, maxDistance, excludeId) {
        const allTokens = canvas.tokens?.placeables || [];
        const tokensInRange = [];
        const maxPixelDistance = maxDistance * (canvas.grid?.size || 1);

        for (const token of allTokens) {
            if (token.document.id === excludeId) continue;

            const tokenPos = this.getTokenPosition(token);
            const distance = Math.hypot(tokenPos.x - position.x, tokenPos.y - position.y);

            if (distance <= maxPixelDistance) {
                tokensInRange.push(token);
            }
        }

        return tokensInRange;
    }

    /**
     * Clear stored position data for a token
     * @param {string} tokenId - Token ID to clear
     */
    clearTokenPositionData(tokenId) {
        this.updatedTokenDocs.delete(tokenId);
        this.pinnedPositions.delete(tokenId);
    }

    /**
     * Clean up expired position data
     */
    cleanup() {
        const now = Date.now();

        // Clean up expired pinned positions
        for (const [tokenId, pin] of this.pinnedPositions.entries()) {
            if (now > pin.until) {
                this.pinnedPositions.delete(tokenId);
                this.systemStateProvider.debug('cleanup-expired-pin', tokenId);
            }
        }
    }

    /**
     * Get current configuration
     */
    getConfig() {
        return {
            pinDurationMs: this.pinDurationMs,
            pinEpsilon: this.pinEpsilon,
        };
    }

    /**
     * Update configuration
     * @param {Object} config - Configuration updates
     */
    updateConfig(config) {
        if (config.pinDurationMs !== undefined) {
            this.pinDurationMs = config.pinDurationMs;
        }
        if (config.pinEpsilon !== undefined) {
            this.pinEpsilon = config.pinEpsilon;
        }
    }

    /**
     * Getter for current pin duration (ms)
     * @returns {number}
     */
    getPinDurationMs() {
        return this.pinDurationMs;
    }
}