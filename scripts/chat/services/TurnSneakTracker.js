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
                rollOutcomes: new Map(), // Map<observerId, {failed: boolean, lastOutcome: string}>
                observerStates: new Map(), // Map<observerId, {currentVisibility: string}>
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
    recordDeferredCheck(sneakingToken, observerToken, positionData, originalOutcome = null) {
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
            originalOutcome: originalOutcome, // Store the complete original outcome for dialog reconstruction
            timestamp: Date.now()
        });
    }

    /**
     * Remove a deferred check for a specific observer
     * @param {Token} sneakingToken - Token performing sneak
     * @param {Token} observerToken - Observer token
     */
    removeDeferredCheck(sneakingToken, observerToken) {
        const combatantId = this._getCombatantId(sneakingToken);
        if (!combatantId) return;

        const turnState = this._turnSneakStates.get(combatantId);
        if (!turnState) return;

        const observerId = observerToken.document?.id || observerToken.id;
        turnState.deferredChecks.delete(observerId);
    }

    /**
     * Record roll outcome for a specific observer during sneak chain
     * @param {Token} sneakingToken - Token performing sneak
     * @param {Token} observerToken - Observer token
     * @param {string} outcome - Roll outcome: 'success', 'failure', 'critical-success', 'critical-failure'
     * @param {string} newVisibility - New visibility state that would result from this roll
     * @returns {boolean} True if outcome recorded, false if observer already failed a previous roll
     */
    recordRollOutcome(sneakingToken, observerToken, outcome, newVisibility) {
        const combatantId = this._getCombatantId(sneakingToken);
        if (!combatantId) return true; // Not in feat mode, allow normal processing

        const turnState = this._turnSneakStates.get(combatantId);
        if (!turnState || !turnState.isActive) return true; // Not in feat mode, allow normal processing

        const observerId = observerToken.document?.id || observerToken.id;

        // Check if this observer already failed a roll in this sneak chain
        const existing = turnState.rollOutcomes.get(observerId);
        if (existing && existing.failed) {
            // Observer already failed a previous roll - they remain observed
            return false; // Block this outcome from being applied
        }

        // Determine if this is a failed roll
        const isFailure = outcome === 'failure' || outcome === 'critical-failure';

        // Record the outcome
        turnState.rollOutcomes.set(observerId, {
            failed: isFailure,
            lastOutcome: outcome,
            lastVisibility: newVisibility,
            timestamp: Date.now()
        });

        // Update current state tracking
        if (isFailure) {
            // Failed roll - observer sees sneaking token as observed immediately
            turnState.observerStates.set(observerId, {
                currentVisibility: 'observed',
                reason: `Failed sneak roll (${outcome})`
            });
        } else {
            // Successful roll - maintain or improve visibility
            turnState.observerStates.set(observerId, {
                currentVisibility: newVisibility,
                reason: `Successful sneak roll (${outcome})`
            });
        }

        return !isFailure; // Allow outcome application only if not a failure (since failures make observer see as observed)
    }

    /**
     * Get the current visibility state for an observer during a sneak chain
     * @param {Token} sneakingToken - Token performing sneak
     * @param {Token} observerToken - Observer token
     * @returns {string|null} Current visibility state or null if not tracked
     */
    getCurrentVisibilityForObserver(sneakingToken, observerToken) {
        const combatantId = this._getCombatantId(sneakingToken);
        if (!combatantId) return null;

        const turnState = this._turnSneakStates.get(combatantId);
        if (!turnState || !turnState.isActive) return null;

        const observerId = observerToken.document?.id || observerToken.id;
        const observerState = turnState.observerStates.get(observerId);

        return observerState ? observerState.currentVisibility : null;
    }

    /**
     * Check if a specific observer token has been deferred in the current turn
     * @param {Token} sneakingToken - Token performing sneak
     * @param {Token} observerToken - Observer token to check
     * @returns {boolean} True if this specific observer has been deferred
     */
    isObserverDeferred(sneakingToken, observerToken) {
        const combatantId = this._getCombatantId(sneakingToken);
        if (!combatantId) return false;

        const turnState = this._turnSneakStates.get(combatantId);
        if (!turnState || !turnState.isActive) return false;

        const observerId = observerToken.document?.id || observerToken.id;
        return turnState.deferredChecks.has(observerId);
    }

    /**
     * Get deferred check data for a specific observer
     * @param {Token} sneakingToken - Token performing sneak
     * @param {Token} observerToken - Observer token
     * @returns {Object|null} Deferred check data or null
     */
    getDeferredData(sneakingToken, observerToken) {
        const combatantId = this._getCombatantId(sneakingToken);
        if (!combatantId) return null;

        const turnState = this._turnSneakStates.get(combatantId);
        if (!turnState || !turnState.isActive) return null;

        const observerId = observerToken.document?.id || observerToken.id;
        return turnState.deferredChecks.get(observerId) || null;
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

            // Verify this is actually the sneaking token's turn ending
            const sneakingCombatantId = this._getCombatantId(turnState.sneakingToken);
            if (sneakingCombatantId !== combatantId) {
                return;
            }


            // Perform deferred end-position checks if any exist
            if (turnState.deferredChecks.size > 0) {
                await this._processDeferredChecks(turnState);
            }

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
                    // Verify this is the sneaking token's turn that ended
                    const sneakingCombatantId = this._getCombatantId(turnState.sneakingToken);
                    if (sneakingCombatantId === combatantId) {
                        // Turn changed, process any remaining deferred checks
                        if (turnState.isActive) {
                            if (turnState.deferredChecks.size > 0) {
                                await this._processDeferredChecks(turnState);
                            }
                        }
                    }

                    // Clean up regardless (turn ended for this combatant)
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


        // Collect results for end-of-turn dialog
        const dialogResults = [];
        let hasVisibilityChanges = false;

        for (const [observerId, checkData] of turnState.deferredChecks.entries()) {
            try {
                const observerToken = checkData.observerToken;

                // Check if current position qualifies for stealth using original start position as reference
                const qualifies = await this._checkEndPositionQualifies(
                    sneakingToken,
                    observerToken,
                    currentPosition,
                    checkData.originalOutcome
                );

                // Get current visibility state for comparison
                const currentVisibility = this.getCurrentVisibilityForObserver(sneakingToken, observerToken) || 'observed';

                if (!qualifies) {

                    // Don't apply penalty automatically - let dialog handle it
                    // Record result for dialog to show user what would happen
                    dialogResults.push({
                        observerToken,
                        previousVisibility: currentVisibility,
                        newVisibility: 'observed',
                        positionQualified: false,
                        reason: 'End position lacks cover or concealment',
                        needsApplication: currentVisibility !== 'observed', // Only needs application if would actually change
                        originalOutcome: checkData.originalOutcome // Include original outcome data
                    });

                    if (currentVisibility !== 'observed') {
                        hasVisibilityChanges = true;
                    }
                } else {

                    // Record successful validation (no change needed)
                    dialogResults.push({
                        observerToken,
                        previousVisibility: currentVisibility,
                        newVisibility: currentVisibility,
                        positionQualified: true,
                        reason: 'End position maintains cover or concealment',
                        needsApplication: false, // No change needed
                        originalOutcome: checkData.originalOutcome // Include original outcome data
                    });
                }

            } catch (error) {
                console.error('PF2E Visioner | Error processing deferred check:', error);
            }
        }

        // Show end-of-turn dialog if there were any results to display
        if (dialogResults.length > 0) {
            await this._showEndOfTurnDialog(sneakingToken, dialogResults, hasVisibilityChanges);
        }

        // Deferred checks processing complete - flag and effect already cleared after each sneak
    }

    /**
     * Show end-of-turn dialog for deferred position check results
     * @param {Token} sneakingToken - Token that performed sneaks
     * @param {Array} dialogResults - Array of check results
     * @param {boolean} hasVisibilityChanges - Whether any visibility actually changed
     */
    async _showEndOfTurnDialog(sneakingToken, dialogResults, hasVisibilityChanges) {
        try {
            // Import dialog dynamically to avoid circular dependencies
            const { SneakPreviewDialog } = await import('../dialogs/SneakPreviewDialog.js');

            // Create action data structure compatible with SneakPreviewDialog
            const actionData = {
                actor: sneakingToken.actor,
                sneakingToken: sneakingToken,
                isEndOfTurnValidation: true,
                deferredResults: dialogResults,
                hasChanges: hasVisibilityChanges
            };

            // Create outcomes array using original outcome data where available
            const outcomes = dialogResults.map(result => {
                // Start with the original outcome if available, otherwise create minimal outcome
                const baseOutcome = result.originalOutcome ? { ...result.originalOutcome } : {
                    token: {
                        id: result.observerToken.id,
                        name: result.observerToken.name,
                        document: result.observerToken.document
                    }
                };

                // Merge with end-of-turn validation results
                const outcome = {
                    ...baseOutcome, // Preserve all original roll data (DC, roll result, etc.)
                    newVisibility: result.newVisibility,
                    previousVisibility: result.previousVisibility,
                    positionQualified: result.positionQualified,
                    reason: result.reason,
                    hasActionableChange: result.newVisibility !== result.previousVisibility,
                    hasRevertableChange: false, // End-of-turn results can't be reverted
                    changed: result.newVisibility !== result.previousVisibility,
                    isEndOfTurnCheck: true,
                    needsApplication: result.needsApplication, // Pass through the needs application flag
                    // Explicitly preserve original position data for end-of-turn dialog display
                    positionTransition: baseOutcome.positionTransition || null,
                    positionDisplay: baseOutcome.positionDisplay || null,
                    canDefer: false // End-of-turn outcomes can't be deferred again
                };

                return outcome;
            });

            // Show dialog with special title and messaging for end-of-turn
            const dialog = new SneakPreviewDialog(
                sneakingToken,
                outcomes,
                {}, // Empty changes object for end-of-turn dialog
                actionData,
                {
                    title: game.i18n.format('PF2E_VISIONER.DIALOG_TITLES.END_TURN_STEALTH', { name: sneakingToken.name }),
                    isEndOfTurnDialog: true
                }
            );

            dialog.render(true);

        } catch (error) {
            console.error('PF2E Visioner | Error showing end-of-turn dialog:', error);
            // Fall back to console notification if dialog fails
            ui.notifications?.info(`End-of-turn stealth validation completed for ${sneakingToken.name}`);
        }
    }

    /**
     * Check if token's end position qualifies for maintaining stealth
     * @param {Token} sneakingToken - Token performing sneak
     * @param {Token} observerToken - Observer token
     * @param {Object} position - Current position data
     * @returns {boolean} True if position qualifies
     */
    async _checkEndPositionQualifies(sneakingToken, observerToken, position, originalOutcome = null) {
        try {
            try {
                const { ActionQualifier } = await import('../../rule-elements/operations/ActionQualifier.js');
                if (ActionQualifier.forceEndQualifies(sneakingToken, 'sneak')) {
                    return true;
                }
            } catch { }

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

            // For deferred checks, use the original start position qualification as reference
            if (originalOutcome) {
                // Extract the original start visibility state that qualified for sneak
                const originalStartVisibility = this._getOriginalStartVisibility(originalOutcome, observerToken);

                // End position should maintain at least the same qualification level as start
                return this._endPositionMaintainsQualification(coverState, visibility, originalStartVisibility);
            }

            // Fallback: PF2e rules - Need standard/greater cover OR concealment to maintain stealth
            const hasSufficientCover = coverState === 'standard' || coverState === 'greater';
            const hasConcealment = visibility === 'concealed';

            return hasSufficientCover || hasConcealment;

        } catch (error) {
            console.error('PF2E Visioner | Error checking end position qualification:', error);
            return false; // Fail safe
        }
    }

    /**
     * Extract the original start visibility that qualified for the sneak
     * @param {Object} originalOutcome - Original outcome data from sneak
     * @param {Token} observerToken - Observer token
     * @returns {string} Start visibility state ('hidden', 'undetected', etc.)
     * @private
     */
    _getOriginalStartVisibility(originalOutcome, observerToken) {
        // Try various sources of start visibility data
        if (originalOutcome.startVisibility) {
            return originalOutcome.startVisibility;
        }

        if (originalOutcome.startState?.visibility) {
            return originalOutcome.startState.visibility;
        }

        // Check position display data
        if (originalOutcome.positionDisplay?.startPosition?.visibility) {
            return originalOutcome.positionDisplay.startPosition.visibility;
        }

        // Fallback - assume was hidden if sneak was allowed to proceed
        console.warn('PF2E Visioner | Could not determine original start visibility, assuming hidden');
        return 'hidden';
    }

    /**
     * Check if end position maintains the qualification level of the start position
     * @param {string} coverState - Current cover state ('none', 'lesser', 'standard', 'greater')
     * @param {string} visibility - Current visibility state ('observed', 'concealed', 'hidden', 'undetected')
     * @param {string} originalStartVisibility - Original start visibility that qualified for sneak
     * @returns {boolean} True if end position maintains qualification
     * @private
     */
    _endPositionMaintainsQualification(coverState, visibility, originalStartVisibility) {
        // PF2e Rules: Start must be Hidden or Undetected, end needs cover or concealment

        // If start was undetected, end position needs to maintain undetected or at least hidden
        if (originalStartVisibility === 'undetected') {
            return visibility === 'undetected' || visibility === 'hidden' ||
                coverState === 'standard' || coverState === 'greater' ||
                visibility === 'concealed';
        }

        // If start was hidden, end position needs cover or concealment to maintain stealth
        if (originalStartVisibility === 'hidden') {
            return coverState === 'standard' || coverState === 'greater' ||
                visibility === 'concealed' || visibility === 'hidden' || visibility === 'undetected';
        }

        // Fallback for other start states - use standard end position rules
        return coverState === 'standard' || coverState === 'greater' || visibility === 'concealed';
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