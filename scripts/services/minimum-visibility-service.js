/**
 * MinimumVisibilityService
 * 
 * Service for enforcing visibility limits on tokens:
 * - Target effects set MINIMUM visibility (floor): "I can't be seen BETTER than X"
 * - Observer effects set MAXIMUM visibility (ceiling): "I can't see BETTER than X"
 * 
 * Both work by taking the worse visibility state, but conceptually different:
 * 
 * Target Minimum (raises floor):
 * - Supernatural concealment (always at least concealed)
 * - Permanent invisibility effects (always undetected)
 * - Shadowy creatures (minimum hidden in dim+ light)
 * 
 * Observer Maximum (lowers ceiling):
 * - Blinded condition (can't see better than hidden)
 * - Vision impairment (can't see better than concealed)
 * - Specific perception limits
 * 
 * Follows SOLID principles with single responsibility for visibility limit enforcement.
 */
export class MinimumVisibilityService {
    constructor() {
    }

    /**
     * Get the minimum visibility state when a token is a target
     * @param {Token} token - The token to check
     * @returns {string|null} The minimum visibility state ('concealed', 'hidden', 'undetected') or null
     */
    getMinimumVisibilityAsTarget(token) {
        if (!token?.actor) return null;

        // Check the actor's rollOptions for the resolved minimum-visibility-target option
        const rollOptions = token.actor.getRollOptions?.(['all']) ?? [];

        for (const option of rollOptions) {
            const match = option.match(/^minimum-visibility-target:(concealed|hidden|undetected)$/);
            if (match) {
                return match[1];
            }
        }

        return null;
    }

    /**
     * Get the maximum visibility state when a token is an observer
     * This represents the BEST the observer can see (ceiling - e.g., blinded observer can't see better than hidden)
     * @param {Token} token - The token to check
     * @returns {string|null} The maximum visibility state ('observed', 'concealed', 'hidden', 'undetected') or null
     */
    getMaximumVisibilityAsObserver(token) {
        if (!token?.actor) return null;

        const rollOptions = token.actor.getRollOptions?.(['all']) ?? [];

        console.log('PF2E Visioner | MinimumVisibilityService: Checking observer maximum roll options', {
            observer: token.name || token.id,
            hasGetRollOptions: !!token.actor.getRollOptions,
            rollOptionsCount: rollOptions.length,
            rollOptions: rollOptions.filter(o => o.includes('visibility'))
        });

        for (const option of rollOptions) {
            const match = option.match(/^maximum-visibility-observer:(observed|concealed|hidden|undetected)$/);
            if (match) {
                return match[1];
            }
        }

        return null;
    }

    /**
     * Get the minimum visibility state when a token is an observer
     * This represents the WORST the observer sees (floor - e.g., special vision always sees at least concealed)
     * @param {Token} token - The token to check
     * @returns {string|null} The minimum visibility state ('observed', 'concealed', 'hidden', 'undetected') or null
     */
    getMinimumVisibilityAsObserver(token) {
        if (!token?.actor) return null;

        const rollOptions = token.actor.getRollOptions?.(['all']) ?? [];

        console.log('PF2E Visioner | MinimumVisibilityService: Checking observer minimum roll options', {
            observer: token.name || token.id,
            hasGetRollOptions: !!token.actor.getRollOptions,
            rollOptionsCount: rollOptions.length,
            rollOptions: rollOptions.filter(o => o.includes('visibility'))
        });

        for (const option of rollOptions) {
            const match = option.match(/^minimum-visibility-observer:(observed|concealed|hidden|undetected)$/);
            if (match) {
                return match[1];
            }
        }

        return null;
    }

    /**
     * Enforce minimum visibility floor (for targets) or maximum visibility ceiling (for observers)
     * Takes the worse of calculated state and limit state
     * 
     * @param {string} calculatedState - The calculated visibility state
     * @param {string} limitState - The limit state (minimum for targets, maximum for observers)
     * @returns {string} The final visibility state (worse of the two)
     */
    enforceVisibilityLimit(calculatedState, limitState) {
        if (!limitState) return calculatedState;

        const stateRank = {
            'observed': 0,
            'concealed': 1,
            'hidden': 2,
            'undetected': 3
        };

        const calculatedRank = stateRank[calculatedState] ?? 0;
        const limitRank = stateRank[limitState] ?? 0;

        return calculatedRank >= limitRank ? calculatedState : limitState;
    }

    /**
     * Enforce observer minimum visibility floor (special vision)
     * Takes the better of calculated state and minimum state
     * 
     * @param {string} calculatedState - The calculated visibility state
     * @param {string} minimumState - The minimum visibility state (floor)
     * @returns {string} The final visibility state (better of the two)
     */
    enforceObserverMinimum(calculatedState, minimumState) {
        if (!minimumState) return calculatedState;

        const stateRank = {
            'observed': 0,
            'concealed': 1,
            'hidden': 2,
            'undetected': 3
        };

        const calculatedRank = stateRank[calculatedState] ?? 0;
        const minimumRank = stateRank[minimumState] ?? 0;

        // Return the BETTER state (lower rank)
        return calculatedRank <= minimumRank ? calculatedState : minimumState;
    }

    /**
     * Apply visibility limits for target (minimum), observer maximum (ceiling), and observer minimum (floor)
     * 
     * Target minimum: "I can't be seen BETTER than X" (raises floor)
     * Observer maximum: "I can't see BETTER than X" (lowers ceiling) - for impairments
     * Observer minimum: "I always see at least X" (raises floor) - for special vision
     * 
     * @param {Token} observer - The observing token
     * @param {Token} target - The target token
     * @param {string} calculatedVisibility - The calculated visibility state
     * @returns {string} The final visibility state after applying limits
     */
    applyMinimumVisibilityForPair(observer, target, calculatedVisibility) {
        let finalVisibility = calculatedVisibility;

        // Apply target minimum (floor)
        try {
            const targetMinimum = this.getMinimumVisibilityAsTarget(target);
            if (targetMinimum) {
                console.log('PF2E Visioner | MinimumVisibilityService: Target minimum found', {
                    target: target.name || target.id,
                    minimum: targetMinimum,
                    calculated: calculatedVisibility
                });
                finalVisibility = this.enforceVisibilityLimit(finalVisibility, targetMinimum);
            }
        } catch (e) {
            console.warn('PF2E Visioner | Error applying minimum visibility (as target):', e);
        }

        // Apply observer maximum (ceiling) - for impairments like blinded
        try {
            const observerMaximum = this.getMaximumVisibilityAsObserver(observer);
            if (observerMaximum) {
                console.log('PF2E Visioner | MinimumVisibilityService: Observer maximum found', {
                    observer: observer.name || observer.id,
                    maximum: observerMaximum,
                    beforeLimit: finalVisibility
                });
                finalVisibility = this.enforceVisibilityLimit(finalVisibility, observerMaximum);
                console.log('PF2E Visioner | MinimumVisibilityService: After observer maximum', {
                    result: finalVisibility
                });
            }
        } catch (e) {
            console.warn('PF2E Visioner | Error applying maximum visibility (as observer):', e);
        }

        // Apply observer minimum (floor) - for special vision like "see through darkness"
        try {
            const observerMinimum = this.getMinimumVisibilityAsObserver(observer);
            if (observerMinimum) {
                console.log('PF2E Visioner | MinimumVisibilityService: Observer minimum found', {
                    observer: observer.name || observer.id,
                    minimum: observerMinimum,
                    beforeLimit: finalVisibility
                });
                finalVisibility = this.enforceObserverMinimum(finalVisibility, observerMinimum);
                console.log('PF2E Visioner | MinimumVisibilityService: After observer minimum', {
                    result: finalVisibility
                });
            }
        } catch (e) {
            console.warn('PF2E Visioner | Error applying minimum visibility (as observer):', e);
        }

        return finalVisibility;
    }
}
