import { HashGridIndex } from './HashGridIndex.js';
import { VisionAnalyzer } from '../VisionAnalyzer.js';

/**
 * SpatialAnalysisService provides spatial analysis functionality.
 * Handles token positioning, distance calculations, LOS checks, and movement analysis.
 */
export class SpatialAnalysisService {
    #positionManager;
    #exclusionManager;
    #maxVisibilityDistance = 100; // Default max visibility distance in feet (updated from grid units)
    #dynamicMaxDistance = null; // Cache for dynamically calculated max distance
    #lastDistanceCalcTime = 0; // Timestamp of last distance calculation
    #performanceMetrics;
    #visionAnalyzer;

    constructor(positionManager, exclusionManager, performanceMetrics) {
        this.#positionManager = positionManager;
        this.#exclusionManager = exclusionManager;
        this.#performanceMetrics = performanceMetrics;
        this.#visionAnalyzer = VisionAnalyzer.getInstance();
    }

    /**
     * Get tokens within a certain distance of a position for spatial optimization.
     * @param {Object} position - {x, y} position to search around
     * @param {number} maxDistance - Maximum distance in grid units
     * @param {string} excludeTokenId - Token ID to exclude from results
     * @returns {Token[]} Array of tokens within range
     */
    getTokensInRange(position, maxDistance = this.#maxVisibilityDistance, excludeTokenId = null) {
        const tokens = canvas.tokens?.placeables?.filter((t) => {
            if (!t.actor || this.#exclusionManager.isExcludedToken(t)) return false;
            if (excludeTokenId && t.document.id === excludeTokenId) return false;

            // Create a temporary token-like object for the position to use with distanceFeet
            const positionToken = { center: position, distanceTo: (other) => {
                const otherCenter = other.center || { x: other.x, y: other.y };
                const dx = position.x - otherCenter.x;
                const dy = position.y - otherCenter.y;
                const pixelDistance = Math.hypot(dx, dy);
                return pixelDistance / (canvas.grid?.size || 1); // Return in grid squares
            }};
            
            // Use standardized distance calculation
            const distanceFeet = this.#visionAnalyzer.distanceFeet(positionToken, t);
            return distanceFeet <= maxDistance;
        }) || [];

        this.#performanceMetrics.incrementSpatialOptimizations();
        return tokens;
    }

    /**
     * Check if two tokens can see each other (bidirectional line of sight or special senses)
     * @param {Token} token1 - First token
     * @param {Token} token2 - Second token
     * @returns {boolean} True if either token can detect the other through sight or special senses
     */
    canTokensSeeEachOther(token1, token2) {
        try {
            // Use standardized distance calculation in feet
            const distanceFeet = this.#visionAnalyzer.distanceFeet(token1, token2);

            if (distanceFeet > this.#maxVisibilityDistance) {
                // Still need to check if special senses have longer ranges
                if (!this._hasSpecialSenseInRange(token1, token2, distanceFeet) &&
                    !this._hasSpecialSenseInRange(token2, token1, distanceFeet)) {
                    return false;
                }
            }

            // Check for walls blocking line of sight in both directions
            const walls = canvas.walls?.objects?.children || [];
            let wallsBlockSight = false;

            if (walls.length > 0) {
                try {
                    // Get token positions for wall collision check
                    const pos1 = this.#positionManager.getTokenPosition(token1);
                    const pos2 = this.#positionManager.getTokenPosition(token2);
                    
                    // Create Ray using the correct FoundryVTT API
                    const ray = new foundry.canvas.geometry.Ray(pos1, pos2);
                    const wallsInBounds = canvas.walls.quadtree.getObjects(ray.bounds);

                    // Check if any walls actually block the line
                    for (const wall of wallsInBounds) {
                        // A wall is solid if it blocks movement (move > 0) and is not a door (door === 0 or door === null)
                        const isSolidWall =
                            wall.document.move > 0 && (wall.document.door === 0 || wall.document.door === null);

                        if (isSolidWall) {
                            // This is a solid wall, check if it intersects our ray
                            if (ray.intersectSegment(wall.coords)) {
                                wallsBlockSight = true;
                                break;
                            }
                        }
                    }
                } catch {
                    // If we can't check walls properly, assume they can see (conservative approach)
                    return true;
                }
            }

            // If walls don't block sight, they can see each other normally
            if (!wallsBlockSight) {
                return true;
            }

            // Walls block normal sight - check if either token has special senses that work through walls
            return this._hasSpecialSenseInRange(token1, token2, distanceFeet) ||
                this._hasSpecialSenseInRange(token2, token1, distanceFeet);
        } catch {
            // If we can't determine, assume they can see (conservative approach)
            return true;
        }
    }

    /**
     * Check if observer has special senses that can detect target at given distance
     * @param {Token} observer - Observing token
     * @param {Token} target - Target token
     * @param {number} distanceFeet - Distance between tokens in feet
     * @returns {boolean} True if observer has special sense that can detect target
     * @private
     */
    _hasSpecialSenseInRange(observer, target, distanceFeet) {
        try {
            // Check for tremorsense (works through walls, ground contact required)
            const tremorsense = this._getSenseRange(observer, 'tremorsense');
            if (tremorsense > 0 && distanceFeet <= tremorsense) {
                // Tremorsense works if both tokens are on the ground
                const observerElevation = observer.document?.elevation || 0;
                const targetElevation = target.document?.elevation || 0;
                if (observerElevation === 0 && targetElevation === 0) {
                    return true;
                }
            }

            // Check for echolocation (works through some obstacles)
            const echolocation = this._getSenseRange(observer, 'echolocation');
            if (echolocation > 0 && distanceFeet <= echolocation) {
                return true;
            }

            // Check for lifesense (detects living creatures through walls)
            const lifesense = this._getSenseRange(observer, 'lifesense');
            if (lifesense > 0 && distanceFeet <= lifesense) {
                // Only works on living creatures
                if (this._isLivingCreature(target)) {
                    return true;
                }
            }

            // Check for other precise non-visual senses
            const senseAcuity = this._getSenseRange(observer, 'senseAcuity');
            if (senseAcuity > 0 && distanceFeet <= senseAcuity) {
                return true;
            }

            return false;
        } catch {
            return false;
        }
    }

    /**
     * Get the range of a specific sense for a token
     * @param {Token} token - Token to check senses for
     * @param {string} senseType - Type of sense to check
     * @returns {number} Range in feet, 0 if sense not present
     * @private
     */
    _getSenseRange(token, senseType) {
        try {
            // Try to get sense information from the actor
            const actor = token.actor;
            if (!actor?.system?.perception?.senses) {
                return 0;
            }

            // Check different possible sense formats in PF2e
            const senses = actor.system.perception.senses;

            // Look for the sense in various formats
            const senseData = senses[senseType] ||
                senses.find(s => s.type === senseType || s.label?.toLowerCase().includes(senseType));

            if (senseData) {
                // Handle different range formats
                if (typeof senseData.range === 'number') {
                    return senseData.range;
                }
                if (typeof senseData === 'object' && senseData.value) {
                    return parseInt(senseData.value) || 0;
                }
                if (typeof senseData === 'number') {
                    return senseData;
                }
            }

            return 0;
        } catch {
            return 0;
        }
    }

    /**
     * Check if a token represents a living creature
     * @param {Token} token - Token to check
     * @returns {boolean} True if token is a living creature
     * @private
     */
    _isLivingCreature(token) {
        try {
            const actor = token.actor;
            if (!actor) return false;

            // Check actor type - living types
            const livingTypes = ['character', 'npc', 'familiar'];
            if (livingTypes.includes(actor.type)) {
                // Check for undead, construct, or other non-living traits
                const traits = actor.system?.traits?.value || [];
                const nonLivingTraits = ['undead', 'construct', 'fiend', 'celestial'];

                return !nonLivingTraits.some(trait => traits.includes(trait));
            }

            return false;
        } catch {
            return false;
        }
    }

    /**
     * Optimized version of canTokenSeePosition with better performance tracking
     * @param {Token} token - The observing token
     * @param {Object} position - {x, y} position to check
     * @param {Object} metrics - Metrics object to track performance
     * @returns {boolean} True if the token can see the position
     */
    canTokenSeePositionOptimized(token, position, metrics) {
        try {
            // Get token position - use basic position if no position manager
            const tokenPos = this.#positionManager
                ? this.#positionManager.getTokenPosition(token)
                : { x: token.x, y: token.y, elevation: token.document.elevation || 0 };

            // Create ray from token to position
            const ray = new foundry.canvas.geometry.Ray(tokenPos, position);
            metrics.raysCreated++;

            // Check for walls blocking line of sight
            if (canvas.walls?.length > 0) {
                try {
                    const wallsInBounds = canvas.walls.quadtree.getObjects(ray.bounds);
                    metrics.wallChecks += wallsInBounds.length;

                    // Check if any walls actually block the line
                    for (const wall of wallsInBounds) {
                        // A wall is solid if it blocks movement (move > 0) and is not a door (door === 0 or door === null)
                        const isSolidWall =
                            wall.document.move > 0 && (wall.document.door === 0 || wall.document.door === null);

                        if (isSolidWall) {
                            // This is a solid wall, check if it intersects our ray
                            if (ray.intersectSegment(wall.coords)) {
                                return false; // Wall blocks line of sight
                            }
                        }
                    }
                } catch {
                    // If we can't check walls properly, assume they can see (conservative approach)
                    return true;
                }
            }

            return true;
        } catch {
            // If we can't determine, assume they can see (conservative approach)
            return true;
        }
    }

    /**
     * Check if client-aware (viewport) filtering is enabled.
     * @returns {boolean} Whether viewport filtering is enabled
     */
    isClientAwareFilteringEnabled() {
        try {
            return !!game.settings.get('pf2e-visioner', 'clientAwareFiltering');
        } catch {
            return true; // Default to enabled
        }
    }

    /**
     * Get tokens currently visible in the viewport.
     * @param {number} paddingPx - Padding around viewport in pixels
     * @returns {Set<string>} Set of token IDs in viewport
     */
    getViewportTokenIdSet(paddingPx = 64) {
        const tokenIds = new Set();

        try {
            if (!canvas.tokens?.placeables) return tokenIds;

            const canvasBounds = canvas.app.view.getBoundingClientRect();
            const viewportBounds = {
                left: -paddingPx,
                top: -paddingPx,
                right: canvasBounds.width + paddingPx,
                bottom: canvasBounds.height + paddingPx,
            };

            for (const token of canvas.tokens.placeables) {
                if (!token.bounds) continue;

                const tokenBounds = token.bounds;
                if (
                    tokenBounds.right >= viewportBounds.left &&
                    tokenBounds.left <= viewportBounds.right &&
                    tokenBounds.bottom >= viewportBounds.top &&
                    tokenBounds.top <= viewportBounds.bottom
                ) {
                    tokenIds.add(token.document.id);
                }
            }
        } catch (error) {
            console.warn('PF2E Visioner | Viewport token detection failed:', error);
        }

        return tokenIds;
    }

    /**
     * Get tokens affected by movement between two positions
     * @param {Object} oldPos - Previous position {x, y}
     * @param {Object} newPos - New position {x, y}
     * @param {string} movingTokenId - ID of the moving token
     * @returns {Set} Set of affected tokens
     */
    getAffectedTokensByMovement(oldPos, newPos, movingTokenId) {
        const startTime = performance.now();
        const metrics = {
            movementDistance: 0,
            midpointSkipped: false,
            tokensChecked: 0,
            distanceChecks: 0,
            losChecks: 0,
            wallChecks: 0,
            raysCreated: 0,
            totalTime: 0,
            optimizationSavings: 0,
        };

        // Distances used for candidate selection heuristics
        const movementDistance = Math.hypot(newPos.x - oldPos.x, newPos.y - oldPos.y);
        const gridMovementDistance = movementDistance / (canvas.grid?.size || 1);

        const affectedTokens = new Set();
        const allNearbyTokens = new Set();

        // Build a transient grid index and sweep an expanded AABB over the movement path
        try {
            const index = new HashGridIndex();
            const tokens = canvas.tokens?.placeables || [];
            index.build(tokens, (t) => this.#positionManager.getTokenPosition(t));

            const gridSize = canvas.grid?.size || 1;
            const radiusPx = this.#maxVisibilityDistance * gridSize;

            const minX = Math.min(oldPos.x, newPos.x) - radiusPx;
            const minY = Math.min(oldPos.y, newPos.y) - radiusPx;
            const maxX = Math.max(oldPos.x, newPos.x) + radiusPx;
            const maxY = Math.max(oldPos.y, newPos.y) + radiusPx;
            const rect = { x: minX, y: minY, width: (maxX - minX), height: (maxY - minY) };

            const pts = index.queryRect(rect);
            for (const pt of pts) {
                const tok = pt.token;
                if (!tok?.actor) continue; // match getTokensInRange actor filter
                if (!tok?.document?.id || tok.document.id === movingTokenId) continue;
                if (this.#exclusionManager?.isExcludedToken?.(tok)) continue;
                allNearbyTokens.add(tok);
            }
            // We skipped midpoint heuristic by design
            metrics.midpointSkipped = true;
        } catch (e) {
            // Fallback to original range queries if index fails
            const startTokens = this.getTokensInRange(oldPos, this.#maxVisibilityDistance, movingTokenId);
            startTokens.forEach((t) => allNearbyTokens.add(t));
            const endTokens = this.getTokensInRange(newPos, this.#maxVisibilityDistance, movingTokenId);
            endTokens.forEach((t) => allNearbyTokens.add(t));
            if (gridMovementDistance > 2) {
                const midPos = { x: (oldPos.x + newPos.x) / 2, y: (oldPos.y + newPos.y) / 2 };
                const midTokens = this.getTokensInRange(midPos, this.#maxVisibilityDistance, movingTokenId);
                midTokens.forEach((t) => allNearbyTokens.add(t));
            } else {
                metrics.midpointSkipped = true;
            }
        }

        // Now filter by actual line of sight with optimized checks
        for (const token of allNearbyTokens) {
            metrics.tokensChecked++;
            const tokenPos = this.#positionManager.getTokenPosition(token);

            // Quick distance check using standardized feet calculation
            // Create temporary token-like objects for distance calculation
            const oldPosToken = { center: oldPos, distanceTo: (other) => {
                const otherCenter = other.center || { x: other.x, y: other.y };
                const dx = oldPos.x - otherCenter.x;
                const dy = oldPos.y - otherCenter.y;
                const pixelDistance = Math.hypot(dx, dy);
                return pixelDistance / (canvas.grid?.size || 1); // Return in grid squares
            }};
            const newPosToken = { center: newPos, distanceTo: (other) => {
                const otherCenter = other.center || { x: other.x, y: other.y };
                const dx = newPos.x - otherCenter.x;
                const dy = newPos.y - otherCenter.y;
                const pixelDistance = Math.hypot(dx, dy);
                return pixelDistance / (canvas.grid?.size || 1); // Return in grid squares
            }};
            
            const oldDistanceFeet = this.#visionAnalyzer.distanceFeet(token, oldPosToken);
            const newDistanceFeet = this.#visionAnalyzer.distanceFeet(token, newPosToken);
            metrics.distanceChecks += 2;

            const canSeeOld =
                oldDistanceFeet <= this.#maxVisibilityDistance &&
                this.canTokenSeePositionOptimized(token, oldPos, metrics);
            const canSeeNew =
                newDistanceFeet <= this.#maxVisibilityDistance &&
                this.canTokenSeePositionOptimized(token, newPos, metrics);
            metrics.losChecks += 2;

            // If the token can see either position, it's affected
            if (canSeeOld || canSeeNew) {
                affectedTokens.add(token);
            }
        }

        const endTime = performance.now();
        metrics.totalTime = endTime - startTime;

        // Calculate optimization savings
        const theoreticalChecks = allNearbyTokens.size * 2; // Old + New position checks
        const actualChecks = metrics.losChecks;
        metrics.optimizationSavings = theoreticalChecks > 0 ?
            (((theoreticalChecks - actualChecks) / theoreticalChecks) * 100).toFixed(1) : '0.0';

        // Update cumulative metrics
        this.#performanceMetrics.updateMovementMetrics(metrics);

        return affectedTokens;
    }

    /**
     * Get tokens affected by movement between two positions (alias method)
     * @param {Object} oldPos - Previous position {x, y}
     * @param {Object} newPos - New position {x, y}
     * @param {string} movingTokenId - ID of the moving token
     * @returns {Set} Set of affected tokens
     */
    getAffectedTokens(oldPos, newPos, movingTokenId) {
        return this.getAffectedTokensByMovement(oldPos, newPos, movingTokenId);
    }

    /**
     * Calculate spatial optimization metrics for a token movement
     * @param {Object} oldPos - Previous position {x, y}
     * @param {Object} newPos - New position {x, y}
     * @param {string} movingTokenId - ID of the moving token
     * @returns {Object} Optimization metrics
     */
    calculateOptimizationMetrics(oldPos, newPos, movingTokenId) {
        const movementDistance = Math.hypot(newPos.x - oldPos.x, newPos.y - oldPos.y);
        const gridMovementDistance = movementDistance / (canvas.grid?.size || 1);

        const startTokens = this.getTokensInRange(oldPos, this.#maxVisibilityDistance, movingTokenId);
        const endTokens = this.getTokensInRange(newPos, this.#maxVisibilityDistance, movingTokenId);
        const allNearbyTokens = new Set([...startTokens, ...endTokens]);

        const totalTokens = canvas.tokens?.placeables?.length || 0;
        const nearbyTokens = allNearbyTokens.size;
        const reductionPercentage = totalTokens > 0 ?
            (((totalTokens - nearbyTokens) / totalTokens) * 100).toFixed(1) : '0.0';

        return {
            movementDistance: gridMovementDistance.toFixed(2),
            totalTokens,
            nearbyTokens,
            reductionPercentage: reductionPercentage + '%',
            shouldCheckMidpoint: gridMovementDistance > 2
        };
    }

    /**
     * Check if a token emits light (has active light sources)
     * @param {Object} tokenDoc - Token document to check
     * @param {Object} changes - Changes being made to the token (optional)
     * @returns {boolean} True if the token emits light
     */
    tokenEmitsLight(tokenDoc, changes = {}) {
        try {
            // Check if the token has light configuration
            const lightConfig = changes.light !== undefined ? changes.light : tokenDoc.light;

            if (!lightConfig) return false;

            // Token emits light if:
            // 1. Light is enabled AND
            // 2. Has a bright radius > 0 OR dim radius > 0
            return lightConfig.enabled === true &&
                (lightConfig.bright > 0 || lightConfig.dim > 0);
        } catch (error) {
            console.warn('PF2E Visioner | Error checking token light emission:', error);
            return false;
        }
    }

    /**
     * Calculate the maximum visibility distance considering all special senses in the scene
     * @returns {number} Maximum visibility distance in grid units
     * @private
     */
    #calculateDynamicMaxDistance() {
        const now = Date.now();
        
        // Cache the calculation for 5 seconds to avoid recalculating every frame
        if (this.#dynamicMaxDistance !== null && (now - this.#lastDistanceCalcTime) < 5000) {
            return this.#dynamicMaxDistance;
        }

        let maxDistance = this.#maxVisibilityDistance; // Start with base distance
        
        try {
            const tokens = canvas.tokens?.placeables || [];
            
            for (const token of tokens) {
                if (!token.actor) continue;
                
                // Check for tremorsense
                const tremorsenseRange = this._getSenseRange(token, 'tremorsense');
                if (tremorsenseRange > 0) {
                    maxDistance = Math.max(maxDistance, tremorsenseRange);
                }
                
                // Check for echolocation
                const echolocationRange = this._getSenseRange(token, 'echolocation');
                if (echolocationRange > 0) {
                    maxDistance = Math.max(maxDistance, echolocationRange);
                }
                
                // Check for lifesense
                const lifesenseRange = this._getSenseRange(token, 'lifesense');
                if (lifesenseRange > 0) {
                    maxDistance = Math.max(maxDistance, lifesenseRange);
                }
                
                // Check for blindsense/blindsight
                const blindsenseRange = this._getSenseRange(token, 'blindsense') || this._getSenseRange(token, 'blindsight');
                if (blindsenseRange > 0) {
                    maxDistance = Math.max(maxDistance, blindsenseRange);
                }
            }
        } catch (error) {
            console.warn('PF2E Visioner | Error calculating dynamic max distance:', error);
        }
        
        this.#dynamicMaxDistance = maxDistance;
        this.#lastDistanceCalcTime = now;
        
        return maxDistance;
    }

    getMaxVisibilityDistance() {
        return this.#calculateDynamicMaxDistance();
    }

}