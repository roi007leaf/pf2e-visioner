/**
 * Turn-based Sneak Tracker Service
 * 
 * Handles the Sneaky and Very Sneaky feat mechanics that allow consecutive
 * Sneak actions within a single turn with deferred end-position checks.
 * 
 * Feat Mechanics:
 * - Sneaky: Allows consecutive Sneak actions in one turn
 * - Very Sneaky: Allows consecutive Sneak actions in one turn  
 * - End-position prerequisite check is deferred to end of turn
 * - If end position doesn't qualify at end of turn, become observed
 */


class TurnSneakTracker {
    constructor() {
        this._turnSneakStates = new Map(); // Map<combatantId, TurnSneakState>
        this._registeredHooks = false;
        this._registerHooks();
    }

    /**
     * Register combat turn hooks for end-of-turn processing
     */
    _registerHooks() {
        if (this._registeredHooks) return;

        // Register PF2e end turn hook to check deferred prerequisites
        Hooks.on('pf2e.endTurn', (combatant, encounter, userId) => {
            this._onTurnEnd(combatant, encounter, userId);
        });

        // Also register standard combat hooks as fallback
        Hooks.on('updateCombat', (combat, updateData, options, userId) => {
            this._onCombatUpdate(combat, updateData, options, userId);
        });

        this._registeredHooks = true;
    }

    /**
     * Check if a token has Sneaky or Very Sneaky feat
     * @param {Token} token - Token to check
     * @returns {boolean} True if token has the feat
     */
    hasSneakyFeat(token) {
        if (!token?.actor) return false;

        const feats =
            token.actor.itemTypes?.feat ?? token.actor.items?.filter?.((i) => i?.type === 'feat') ?? [];
        return feats.some((feat) => {
            const name = feat?.name?.toLowerCase?.() || '';
            const slug = feat?.system?.slug?.toLowerCase?.() || '';

            // Check for exact matches
            if (name === 'sneaky' || slug === 'sneaky') return true;
            if (name === 'very sneaky' || slug === 'very-sneaky') return true;

            return false;
        });
    }

    /**
     * Start tracking consecutive sneaks for a token in current turn
     * @param {Token} sneakingToken - Token performing sneak
     * @param {Object} actionData - Action data from sneak action
     * @returns {boolean} True if tracking started (token has feat)
     */
    startTurnSneak(sneakingToken, actionData) {
        if (!this.hasSneakyFeat(sneakingToken)) {
            return false; // No feat, use normal sneak mechanics
        }

        const combatantId = this._getCombatantId(sneakingToken);
        if (!combatantId) {
            return false; // Not in combat, use normal mechanics
        }

        // Get or create turn sneak state
        let turnState = this._turnSneakStates.get(combatantId);
        if (!turnState) {
            turnState = {
                combatantId,
                sneakingToken,
                round: game.combat?.round || 0,
                turn: game.combat?.turn || 0,
                sneakActions: [],
                startPosition: null,
                deferredChecks: new Map(), // Map<observerId, {position, visibility}>
                isActive: true
            };
            this._turnSneakStates.set(combatantId, turnState);
        }

        // Capture start position for first sneak in turn
        if (turnState.sneakActions.length === 0) {
            turnState.startPosition = this._captureTokenPosition(sneakingToken);
        }

        // Record this sneak action
        turnState.sneakActions.push({
            actionData,
            timestamp: Date.now(),
            position: this._captureTokenPosition(sneakingToken)
        });

        return true; // Tracking active
    }

    /**
     * Check if end-position prerequisites should be deferred for this sneak
     * @param {Token} sneakingToken - Token performing sneak
     * @param {Token} observerToken - Observer token
     * @returns {boolean} True if should defer check to end of turn
     */
    shouldDeferEndPositionCheck(sneakingToken, observerToken) {
        const combatantId = this._getCombatantId(sneakingToken);
        if (!combatantId) return false;

        const turnState = this._turnSneakStates.get(combatantId);
        if (!turnState || !turnState.isActive) return false;

        // Check if this is part of consecutive sneak actions (2nd or later in turn)
        const currentRound = game.combat?.round || 0;
        const currentTurn = game.combat?.turn || 0;

        return (
            turnState.round === currentRound &&
            turnState.turn === currentTurn &&
            turnState.sneakActions.length > 1
        );
    }

    /**
     * Record deferred end-position check for end of turn
     * @param {Token} sneakingToken - Token performing sneak
     * @param {Token} observerToken - Observer token
     * @param {Object} positionData - Position and visibility data
     */
    recordDeferredCheck(sneakingToken, observerToken, positionData) {
        const combatantId = this._getCombatantId(sneakingToken);
        if (!combatantId) return;

        const turnState = this._turnSneakStates.get(combatantId);
        if (!turnState || !turnState.isActive) return;

        const observerId = observerToken.document?.id || observerToken.id;
        turnState.deferredChecks.set(observerId, {
            observerToken,
            position: positionData.position || this._captureTokenPosition(sneakingToken),
            visibility: positionData.visibility,
            coverState: positionData.coverState,
            timestamp: Date.now()
        });
    }

    /**
     * Get current turn sneak state for a token
     * @param {Token} token - Token to check
     * @returns {Object|null} Turn sneak state or null
     */
    getTurnSneakState(token) {
        const combatantId = this._getCombatantId(token);
        if (!combatantId) return null;

        return this._turnSneakStates.get(combatantId) || null;
    }

    /**
     * Check if a token's sneak-active flag should persist until end of turn
     * This applies to tokens with Sneaky/Very Sneaky feats that are actively tracked
     * @param {Token} token - Token to check
     * @returns {boolean} True if sneak-active flag should persist until end of turn
     */
    shouldPreserveSneakActiveFlag(token) {
        if (!token) return false;

        // Only preserve if token has the feat and is being actively tracked
        if (!this.hasSneakyFeat(token)) return false;

        const turnState = this.getTurnSneakState(token);
        return turnState && turnState.isActive;
    }

    /**
     * Handle end of turn - perform deferred prerequisite checks
     * @param {Combatant} combatant - Combatant whose turn ended
     * @param {Combat} encounter - Combat encounter
     * @param {string} userId - User ID
     */
    async _onTurnEnd(combatant, encounter, userId) {
        try {
            // Only process for GM or token owner
            if (!game.user.isGM && game.user.id !== userId) return;

            const combatantId = combatant?.id;
            if (!combatantId) return;

            const turnState = this._turnSneakStates.get(combatantId);
            if (!turnState || !turnState.isActive) return;

            console.log('PF2E Visioner | Processing end-of-turn sneak checks for:', turnState.sneakingToken.name);

            // Perform deferred end-position checks
            await this._processDeferredChecks(turnState);

            // Clean up turn state
            turnState.isActive = false;
            this._turnSneakStates.delete(combatantId);

        } catch (error) {
            console.error('PF2E Visioner | Error in turn end sneak processing:', error);
        }
    }

    /**
     * Handle combat updates (fallback for turn detection)
     * @param {Combat} combat - Combat document
     * @param {Object} updateData - Update data
     * @param {Object} options - Update options
     * @param {string} userId - User ID
     */
    async _onCombatUpdate(combat, updateData, options, userId) {
        try {
            // Check if turn advanced
            const turnChanged = 'turn' in updateData;
            const roundChanged = 'round' in updateData;

            if (!turnChanged && !roundChanged) return;

            // Clean up any stale turn states when turn/round changes
            const currentRound = combat.round || 0;
            const currentTurn = combat.turn || 0;

            for (const [combatantId, turnState] of this._turnSneakStates.entries()) {
                if (turnState.round !== currentRound || turnState.turn !== currentTurn) {
                    // Turn changed, process any remaining deferred checks
                    if (turnState.isActive && turnState.deferredChecks.size > 0) {
                        console.log('PF2E Visioner | Processing deferred sneak checks from combat update for:', turnState.sneakingToken.name);
                        await this._processDeferredChecks(turnState);
                    }

                    // Clean up
                    turnState.isActive = false;
                    this._turnSneakStates.delete(combatantId);
                }
            }

        } catch (error) {
            console.error('PF2E Visioner | Error in combat update sneak processing:', error);
        }
    }

    /**
     * Process all deferred end-position checks for a turn state
     * @param {Object} turnState - Turn sneak state
     */
    async _processDeferredChecks(turnState) {
        if (!turnState.deferredChecks.size) return;

        const sneakingToken = turnState.sneakingToken;
        const currentPosition = this._captureTokenPosition(sneakingToken);

        console.log(`PF2E Visioner | Processing ${turnState.deferredChecks.size} deferred checks for ${sneakingToken.name}`);

        for (const [observerId, checkData] of turnState.deferredChecks.entries()) {
            try {
                const observerToken = checkData.observerToken;

                // Check if current position qualifies for stealth
                const qualifies = await this._checkEndPositionQualifies(
                    sneakingToken,
                    observerToken,
                    currentPosition
                );

                if (!qualifies) {
                    console.log(`PF2E Visioner | End position check failed - setting ${sneakingToken.name} to observed by ${observerToken.name}`);

                    // Apply penalty: become observed by this observer
                    await this._applyEndPositionPenalty(sneakingToken, observerToken);
                } else {
                    console.log(`PF2E Visioner | End position check passed for ${sneakingToken.name} vs ${observerToken.name}`);
                }

            } catch (error) {
                console.error('PF2E Visioner | Error processing deferred check:', error);
            }
        }

        // Clear sneak-active flag and Sneaking effect now that end-of-turn evaluation is complete
        await this._clearSneakActiveFlag(sneakingToken);
        await this._clearSneakingEffect(sneakingToken);
    }

    /**
     * Clear sneak-active flag from a token
     * @param {Token} token - Token to clear flag from
     */
    async _clearSneakActiveFlag(token) {
        try {
            await token.document.unsetFlag('pf2e-visioner', 'sneak-active');
            console.log(`PF2E Visioner | Cleared sneak-active flag for ${token.name} at end of turn`);
        } catch (error) {
            console.warn('PF2E Visioner | Failed to clear sneak-active flag:', error);
        }
    }

    /**
     * Clear Sneaking effect from a token
     * @param {Token} token - Token to clear effect from
     */
    async _clearSneakingEffect(token) {
        try {
            const { SneakSpeedService } = await import('../sneak-speed-service.js');
            // Force removal of the Sneaking effect by calling restore with bypass flag
            await SneakSpeedService._forceRestoreSneakWalkSpeed(token);
            console.log(`PF2E Visioner | Cleared Sneaking effect for ${token.name} at end of turn`);
        } catch (error) {
            console.warn('PF2E Visioner | Failed to clear Sneaking effect:', error);
        }
    }

    /**
     * Check if token's end position qualifies for maintaining stealth
     * @param {Token} sneakingToken - Token performing sneak
     * @param {Token} observerToken - Observer token
     * @param {Object} position - Current position data
     * @returns {boolean} True if position qualifies
     */
    async _checkEndPositionQualifies(sneakingToken, observerToken, position) {
        try {
            // Calculate current cover state
            let coverState = 'none';
            try {
                const { getCoverBetween } = await import('../../utils.js');
                coverState = getCoverBetween(observerToken, sneakingToken) || 'none';
            } catch (error) {
                console.warn('PF2E Visioner | Failed to calculate cover for end position check:', error);
            }

            // Calculate current visibility
            let visibility = 'observed';
            try {
                const { optimizedVisibilityCalculator } = await import(
                    '../../visibility/auto-visibility/index.js'
                );
                visibility = await optimizedVisibilityCalculator.calculateVisibility(
                    observerToken,
                    sneakingToken
                );
            } catch (error) {
                console.warn('PF2E Visioner | Failed to calculate visibility for end position check:', error);
            }

            // PF2e rules: Need standard/greater cover OR concealment to maintain stealth
            const hasSufficientCover = coverState === 'standard' || coverState === 'greater';
            const hasConcealment = visibility === 'concealed';

            return hasSufficientCover || hasConcealment;

        } catch (error) {
            console.error('PF2E Visioner | Error checking end position qualification:', error);
            return false; // Fail safe
        }
    }

    /**
     * Apply penalty for failing end-position check (become observed)
     * @param {Token} sneakingToken - Token that failed check
     * @param {Token} observerToken - Observer token
     */
    async _applyEndPositionPenalty(sneakingToken, observerToken) {
        try {
            // Import visibility services
            const { getVisibilityMap, setVisibilityMap } = await import('../../stores/visibility-map.js');

            // Set visibility to observed in observer's visibility map
            const observerVisibilityMap = getVisibilityMap(observerToken);
            observerVisibilityMap[sneakingToken.document.id] = 'observed';

            // Update the visibility map
            await setVisibilityMap(observerToken, observerVisibilityMap);

            // Notify about the change
            const { notify } = await import('./infra/notifications.js');
            notify.info(`${sneakingToken.name} became observed by ${observerToken.name} (Sneaky feat end-position check failed)`);

            // Trigger visual updates
            try {
                const { eventDrivenVisibilitySystem } = await import(
                    '../../visibility/auto-visibility/EventDrivenVisibilitySystem.js'
                );
                if (eventDrivenVisibilitySystem?.refreshVisibilityForTokens) {
                    await eventDrivenVisibilitySystem.refreshVisibilityForTokens([sneakingToken]);
                }
            } catch (error) {
                console.warn('PF2E Visioner | Failed to trigger visibility refresh:', error);
            }

        } catch (error) {
            console.error('PF2E Visioner | Error applying end position penalty:', error);
        }
    }

    /**
     * Get combatant ID for a token
     * @param {Token} token - Token to get combatant for
     * @returns {string|null} Combatant ID or null
     */
    _getCombatantId(token) {
        if (!game.combat || !token) return null;

        const combatant = game.combat.combatants.find(c =>
            c.token?.id === token.id ||
            c.tokenId === token.id ||
            c.token?.document?.id === token.document?.id
        );

        return combatant?.id || null;
    }

    /**
     * Capture current token position data
     * @param {Token} token - Token to capture position for
     * @returns {Object} Position data
     */
    _captureTokenPosition(token) {
        return {
            x: token.document?.x || token.x,
            y: token.document?.y || token.y,
            elevation: token.document?.elevation || token.elevation || 0,
            center: token.center ? { x: token.center.x, y: token.center.y } : null,
            timestamp: Date.now()
        };
    }

    /**
     * Clean up all turn states (for testing or reset)
     */
    cleanup() {
        this._turnSneakStates.clear();
    }
}

// Export both class and singleton instance
export { TurnSneakTracker };
export default new TurnSneakTracker();