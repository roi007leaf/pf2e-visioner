
import { MODULE_ID } from '../../../constants.js';

/**
 * Manages token exclusion logic for the auto-visibility system.
 * Centralizes exclusion criteria including sneak-active handling, defeated tokens, loot, hazards.
 * 
 * @class ExclusionManager
 */
export class ExclusionManager {

    /**
     * Check if a token should be excluded from visibility calculations
     * @param {Object} token - Token to check
     * @returns {boolean} True if token should be excluded
     */
    isExcludedToken(token) {
        try {
            if (!token?.document) return true;
            if (token.document.hidden) return true;

            // Skip loot tokens and hazards - they don't have vision capabilities
            if (this._isLootOrHazardToken(token)) {
                return true;
            }

            // Skip defeated / unconscious / dead tokens: they can't currently observe others
            if (this._isDefeatedToken(token)) {
                return true;
            }

            // Note: Do not exclude based on sneak-active or viewport visibility; 
            // AVS must still process them for awareness and override validation

        } catch {
            // If in doubt, do not exclude
        }
        return false;
    }

    /**
     * Check if a token is sneaking (has sneak-active flag)
     * @param {Object} token - Token to check
     * @returns {boolean} True if token is sneaking
     */
    isSneakingToken(token) {
        try {
            return !!token?.document?.getFlag?.(MODULE_ID, 'sneak-active');
        } catch {
            return false;
        }
    }

    /**
     * Filter tokens to exclude those that should not participate in visibility calculations
     * @param {Array} tokens - Array of tokens to filter
     * @returns {Array} Filtered array of tokens
     */
    filterExcludedTokens(tokens) {
        return tokens.filter(token => !this.isExcludedToken(token));
    }

    /**
     * Filter tokens to include only those with actors and not excluded
     * @param {Array} tokens - Array of tokens to filter
     * @returns {Array} Filtered array of tokens with actors
     */
    filterValidActorTokens(tokens) {
        return tokens.filter(token => token.actor && !this.isExcludedToken(token));
    }

    /**
     * Get all tokens for a specific actor that are not excluded
     * @param {Object} actor - Actor to find tokens for
     * @returns {Array} Array of non-excluded tokens for the actor
     */
    getValidTokensForActor(actor) {
        const allTokens = canvas.tokens?.placeables || [];
        return allTokens.filter(
            (t) => t.actor?.id === actor.id && !this.isExcludedToken(t)
        );
    }

    /**
     * Check if any tokens for an actor are excluded due to specific conditions
     * @param {Object} actor - Actor to check
     * @returns {Object} Exclusion status information
     */
    getActorExclusionStatus(actor) {
        const allTokens = canvas.tokens?.placeables || [];
        const actorTokens = allTokens.filter(t => t.actor?.id === actor.id);

        const status = {
            totalTokens: actorTokens.length,
            excludedTokens: 0,
            validTokens: 0,
            sneakingTokens: 0,
            defeatedTokens: 0,
            hiddenTokens: 0,
            reasons: []
        };

        for (const token of actorTokens) {
            if (this.isExcludedToken(token)) {
                status.excludedTokens++;

                if (token.document.hidden) {
                    status.hiddenTokens++;
                    status.reasons.push('hidden');
                }
                if (this._isDefeatedToken(token)) {
                    status.defeatedTokens++;
                    status.reasons.push('defeated');
                }
                if (this._isLootOrHazardToken(token)) {
                    status.reasons.push('loot/hazard');
                }
            } else {
                status.validTokens++;
            }

            if (this.isSneakingToken(token)) {
                status.sneakingTokens++;
            }
        }

        // Remove duplicate reasons
        status.reasons = [...new Set(status.reasons)];

        return status;
    }

    // Private helper methods

    /**
     * Check if token is a loot or hazard type
     * @param {Object} token - Token to check
     * @returns {boolean} True if token is loot or hazard
     */
    _isLootOrHazardToken(token) {
        try {
            const actor = token.actor;
            if (!actor) return false;

            const actorType = actor.type?.toLowerCase();
            const actorName = actor.name?.toLowerCase() || '';

            // Check actor type
            if (actorType === 'loot' || actorType === 'hazard') {
                return true;
            }

            // Check name patterns (fallback detection)
            const excludePatterns = ['loot', 'hazard', 'treasure', 'chest'];
            for (const pattern of excludePatterns) {
                if (actorName.includes(pattern)) {
                    return true;
                }
            }

            return false;
        } catch {
            return false;
        }
    }

    /**
     * Check if token is defeated/unconscious/dead
     * @param {Object} token - Token to check
     * @returns {boolean} True if token is defeated
     */
    _isDefeatedToken(token) {
        try {
            const actor = token.actor;
            if (!actor) return false;

            // HP based check (covers 0 or negative)
            const hpValue = actor.hitPoints?.value ?? actor.system?.attributes?.hp?.value;
            if (typeof hpValue === 'number' && hpValue <= 0) {
                return true;
            }

            // Condition-based check (PF2e conditions use itemTypes.condition or conditions array)
            const conditionSlugs = new Set();

            if (Array.isArray(actor.itemTypes?.condition)) {
                for (const c of actor.itemTypes.condition) {
                    if (c?.slug) conditionSlugs.add(c.slug);
                    else if (typeof c?.name === 'string') conditionSlugs.add(c.name.toLowerCase());
                }
            }

            if (Array.isArray(actor.conditions)) {
                for (const c of actor.conditions) {
                    if (c?.slug) conditionSlugs.add(c.slug);
                    else if (typeof c?.name === 'string') conditionSlugs.add(c.name.toLowerCase());
                }
            }

            const defeatedSlugs = ['unconscious', 'dead', 'dying'];
            for (const slug of defeatedSlugs) {
                if (conditionSlugs.has(slug)) {
                    return true;
                }
            }

            return false;
        } catch {
            return false;
        }
    }
}