/**
 * StatelessVisibilityCalculator - Pure function-based visibility calculation
 * 
 * Calculates visibility state based on standardized input describing target and observer states.
 * Uses a decision tree approach following PF2e visibility rules.
 * 
 * @module StatelessVisibilityCalculator
 */

/**
 * Calculate visibility state from standardized input
 * 
 * @param {Object} input - Standardized visibility calculation input
 * @param {Object} input.target - Target state
 * @param {string} input.target.lightingLevel - "bright" | "dim" | "darkness" | "magicalDarkness" | "greaterMagicalDarkness"
 * @param {boolean} input.target.concealment - Whether target has concealment
 * @param {string[]} input.target.auxiliary - Additional conditions like ["invisible"]
 * @param {string[]} input.target.traits - Target traits like ["undead", "construct"]
 * @param {number} input.target.movementAction - Target's movement action (for tremorsense checks)
 * @param {Object} input.observer - Observer state
 * @param {Object} input.observer.precise - Precise senses with ranges
 * @param {Object} input.observer.precise.vision - {range: number|"Infinity"}
 * @param {Object} input.observer.precise.lowLightVision - {range: number|"Infinity"}
 * @param {Object} input.observer.precise.darkvision - {range: number|"Infinity"}
 * @param {Object} input.observer.precise.greaterDarkvision - {range: number|"Infinity"}
 * @param {Object} input.observer.imprecise - Imprecise senses with ranges
 * @param {Object} input.observer.imprecise.hearing - {range: number}
 * @param {Object} input.observer.imprecise.tremorsense - {range: number}
 * @param {Object} input.observer.imprecise.lifesense - {range: number}
 * @param {Object} input.observer.imprecise.scent - {range: number}
 * @param {Object} input.observer.conditions - Observer conditions
 * @param {boolean} input.observer.conditions.blinded - Is observer blinded
 * @param {boolean} input.observer.conditions.deafened - Is observer deafened
 * @param {boolean} input.observer.conditions.dazzled - Is observer dazzled
 * @param {number} input.observer.movementAction - Observer's movement action (for tremorsense checks)
 * @param {Object|null} input.rayDarkness - Ray darkness information (if ray passes through darkness)
 * @param {boolean} input.rayDarkness.passesThroughDarkness - Whether ray passes through darkness
 * @param {number} input.rayDarkness.rank - Darkness rank along the ray (1-3 = magical, 4+ = greater magical)
 * @param {string} input.rayDarkness.lightingLevel - Lighting level of darkness along ray
 * @param {boolean} input.soundBlocked - Whether sound is blocked between observer and target (walls with sound restriction)
 * 
 * @returns {Object} Visibility result
 * @returns {string} result.state - "observed" | "concealed" | "hidden" | "undetected"
 * @returns {Object|null} result.detection - Detection info or null if undetected
 * @returns {boolean} result.detection.isPrecise - Whether detection is precise
 * @returns {string} result.detection.sense - Which sense detected: "vision" | "darkvision" | "lowLightVision" | "greaterDarkvision" | "hearing" | "tremorsense" | "lifesense" | "scent"
 */
export function calculateVisibility(input) {
    // Normalize input
    const target = normalizeTargetState(input.target);
    const observer = normalizeObserverState(input.observer);
    const rayDarkness = input.rayDarkness || null;
    const soundBlocked = input.soundBlocked ?? false;
    const hasLineOfSight = input.hasLineOfSight ?? undefined; // Default to undefined (ie unknown)
    const isInvisible = target.auxiliary.includes('invisible');

    // Decision tree: follow PF2e visibility rules in priority order

    // 1. Check if observer is completely incapacitated (blinded)
    if (observer.conditions.blinded) {
        return handleBlindedObserver(observer, target, soundBlocked);
    }

    // 2. Check all available senses and return the best detection result
    // This ensures non-visual senses (like lifesense) work through walls even without blinded/deafened
    const allDetectionResults = [];

    // 2a. Check precise non-visual senses (bypass invisibility, lighting, and walls)
    const preciseNonVisualResult = checkPreciseNonVisualSenses(observer, target, soundBlocked);
    if (preciseNonVisualResult) {
        allDetectionResults.push(preciseNonVisualResult);
    }

    // 2b. Determine visual detection capability (affected by LOS, lighting, invisibility)
    const visualDetection = determineVisualDetection(observer, target, rayDarkness, hasLineOfSight);
    if (visualDetection.canDetect) {
        const visualResult = applyVisualModifiers(visualDetection, observer, target);
        allDetectionResults.push(visualResult);
    }

    // 2c. Check imprecise senses (work through walls but provide worse detection)
    const impreciseResult = checkImpreciseSenses(observer, target, soundBlocked, visualDetection);
    if (impreciseResult) {
        allDetectionResults.push(impreciseResult);
    }

    // 3. Return the best detection result based on priority
    // Priority: observed (precise) > concealed > hidden (imprecise) > undetected
    const bestResult = selectBestDetection(allDetectionResults);
    if (bestResult) {
        return bestResult;
    }

    // 4. Default: undetected (no senses can detect)
    return {
        state: 'undetected',
        detection: null
    };
}

/**
 * Normalize target state to ensure all fields are present
 */
function normalizeTargetState(target) {
    return {
        lightingLevel: target.lightingLevel || 'bright',
        concealment: target.concealment ?? false,
        auxiliary: Array.isArray(target.auxiliary) ? target.auxiliary : [],
        traits: Array.isArray(target.traits) ? target.traits : [],
        movementAction: target.movementAction ?? 0
    };
}

/**
 * Normalize observer state to ensure all fields are present
 */
function normalizeObserverState(observer) {
    const precise = observer.precise || {};
    const imprecise = observer.imprecise || {};
    const conditions = observer.conditions || {};

    return {
        precise: { ...precise },
        imprecise: { ...imprecise },
        conditions: {
            blinded: conditions.blinded ?? false,
            deafened: conditions.deafened ?? false,
            dazzled: conditions.dazzled ?? false
        },
        lightingLevel: observer.lightingLevel || 'bright', // Observer's own lighting level
        movementAction: observer.movementAction ?? 0 // Observer's movement action for tremorsense checks
    };
}

/**
 * Handle blinded observer - can only use non-visual senses
 */
function handleBlindedObserver(observer, target, soundBlocked) {
    // Check for non-visual senses that still work when blinded
    const nonVisualPrecise = checkPreciseNonVisualSenses(observer, target, soundBlocked);
    if (nonVisualPrecise) {
        return nonVisualPrecise;
    }

    const nonVisualImprecise = checkImpreciseSenses(observer, target, soundBlocked, { canDetect: false });
    if (nonVisualImprecise) {
        return nonVisualImprecise;
    }

    // Blinded with no working non-visual senses = undetected
    // (This means they have no precise non-visual senses AND no imprecise non-visual senses that work)
    return {
        state: 'undetected',
        detection: null
    };
}

/**
 * Check non-auditory imprecise senses (lifesense, tremorsense, scent)
 * Used when observer is deafened or sound is blocked - hearing cannot work
 * @param {Object} observer - Observer state
 * @param {Object} target - Target state
 * @returns {Object|null} Detection result or null
 */
function checkNonAuditorySenses(observer, target) {
    const { imprecise, movementAction: observerMovementAction } = observer;
    const { movementAction: targetMovementAction } = target;

    // Tremorsense: detects ground-based vibrations, BYPASSES invisibility
    if (imprecise.tremorsense) {
        const isTargetElevated = targetMovementAction === 'fly' || observerMovementAction === 'fly';
        if (!isTargetElevated) {
            return {
                state: 'hidden',
                detection: {
                    isPrecise: false,
                    sense: 'tremorsense'
                }
            };
        }
    }

    // Scent: detects by smell, BYPASSES invisibility
    if (imprecise.scent) {
        return {
            state: 'hidden',
            detection: {
                isPrecise: false,
                sense: 'scent'
            }
        };
    }

    // Lifesense: detects living or undead creatures, BYPASSES invisibility
    if (imprecise.lifesense && canLifesenseDetect(target)) {
        return {
            state: 'hidden',
            detection: {
                isPrecise: false,
                sense: 'lifesense'
            }
        };
    }

    return null;
}

/**
 * Check if lifesense can detect the target based on creature traits
 * @param {Object} target - Target state
 * @returns {boolean} Whether lifesense can detect this target
 */
function canLifesenseDetect(target) {
    const { traits } = target;
    const isUndead = traits.includes('undead');
    const isConstruct = traits.includes('construct');
    const isLiving = !isUndead && !isConstruct;

    return isLiving || isUndead;
}

/**
 * Select the best detection result from multiple sense detection results
 * Priority: observed (precise senses) > concealed > hidden (imprecise senses) > undetected
 * When states are equal, prefer visual senses over non-visual senses (vision is primary)
 * @param {Array<Object>} results - Array of detection results
 * @returns {Object|null} The best detection result, or null if no results
 */
function selectBestDetection(results) {
    if (!results || results.length === 0) {
        return null;
    }

    // State priority ranking (lower number = better detection)
    const statePriority = {
        'observed': 1,
        'concealed': 2,
        'hidden': 3,
        'undetected': 4
    };

    // Visual senses (preferred when state is equal)
    const visualSenses = new Set([
        'vision',
        'darkvision',
        'greater-darkvision',
        'greaterDarkvision',
        'low-light-vision',
        'lowLightVision',
        'light-perception'
    ]);

    // Sort by state priority (best first), then by visual preference
    const sorted = results.sort((a, b) => {
        const aPriority = statePriority[a.state] || 999;
        const bPriority = statePriority[b.state] || 999;

        // First compare by state priority
        if (aPriority !== bPriority) {
            return aPriority - bPriority;
        }

        // If states are equal, prefer visual senses (vision is the primary sense)
        const aIsVisual = a.detection?.sense && visualSenses.has(a.detection.sense);
        const bIsVisual = b.detection?.sense && visualSenses.has(b.detection.sense);

        if (aIsVisual && !bIsVisual) return -1; // a is visual, prefer it
        if (!aIsVisual && bIsVisual) return 1;  // b is visual, prefer it

        return 0;
    });

    // Return the best result
    return sorted[0];
}

/**
 * Check if observer has any precise non-visual senses
 * Used for determining if dazzled condition applies (only applies if vision is the ONLY precise sense)
 * @param {Object} observer - Observer state
 * @returns {boolean} True if observer has at least one precise non-visual sense
 */
function checkHasPreciseNonVisualSense(observer) {
    const { precise } = observer;

    // Visual senses that should be excluded
    const visualSenses = new Set([
        'vision',
        'darkvision',
        'greater-darkvision',
        'greaterDarkvision',
        'low-light-vision',
        'lowLightVision',
        'light-perception'
    ]);

    // Check if there are any precise non-visual senses with range > 0
    for (const [senseType, senseData] of Object.entries(precise)) {
        if (!visualSenses.has(senseType) && senseData && senseData.range > 0) {
            return true;
        }
    }

    return false;
}

/**
 * Check precise non-visual senses (these bypass invisibility and most conditions)
 * Precise non-visual senses include echolocation, blindsense, thoughtsense, tremorsense, etc.
 * These work regardless of lighting and are unaffected by invisibility
 * @param {Object} observer - Observer state
 * @param {Object} target - Target state
 * @param {boolean} soundBlocked - Whether sound is blocked (affects echolocation)
 */
function checkPreciseNonVisualSenses(observer, target, soundBlocked = false) {
    const { precise, conditions } = observer;
    const { auxiliary } = target;

    // Visual senses that should be excluded from non-visual checks
    // These are affected by lighting conditions and should go through determineVisualDetection
    const visualSenses = new Set([
        'vision',
        'darkvision',
        'greater-darkvision',
        'greaterDarkvision',
        'low-light-vision',
        'lowLightVision',
        'light-perception',
        'see-invisibility',  // Visual sense that counters invisibility
        'seeInvisibility'
    ]);

    // Check all precise non-visual senses dynamically
    // These senses:
    // - Work in any lighting condition
    // - Bypass invisibility completely
    // - Are not affected by dazzled or blinded (they're non-visual)
    // - EXCEPTION: Echolocation requires hearing (blocked by deafened condition or Silence)

    for (const [senseType, senseData] of Object.entries(precise)) {
        // Skip visual senses
        if (visualSenses.has(senseType)) {
            continue;
        }

        // Special handling for echolocation: requires hearing (blocked if deafened or sound blocked)
        if (senseType === 'echolocation') {
            if (conditions.deafened || soundBlocked) {
                continue; // Cannot use echolocation when deafened or sound is blocked
            }
            if (senseData && senseData.range > 0) {
                return {
                    state: 'observed',
                    detection: {
                        isPrecise: true,
                        sense: 'echolocation'
                    }
                };
            }
            continue;
        }

        // Special handling for lifesense: check creature traits
        if (senseType === 'lifesense') {
            if (senseData && senseData.range > 0 && canLifesenseDetect(target)) {
                return {
                    state: 'observed',
                    detection: {
                        isPrecise: true,
                        sense: 'lifesense'
                    }
                };
            }
            continue;
        }

        // Any other non-visual precise sense allows observation
        if (senseData && senseData.range > 0) {
            return {
                state: 'observed',
                detection: {
                    isPrecise: true,
                    sense: senseType
                }
            };
        }
    }

    return null;
}

/**
 * Determine if observer can detect target visually based on lighting and vision capabilities
 */
function determineVisualDetection(observer, target, rayDarkness = null, hasLineOfSight = undefined) {
    // CRITICAL: Blinded observers cannot use any visual senses
    if (observer.conditions.blinded) {
        return {
            canDetect: false,
            sense: null,
            isPrecise: false,
            baseState: null
        };
    }

    // CRITICAL: If there's no line of sight (sight-blocking wall), visual detection fails
    if (hasLineOfSight === false) {
        return {
            canDetect: false,
            sense: null,
            isPrecise: false,
            baseState: null
        };
    }

    // Check if observer has see-invisibility sense BEFORE checking invisibility
    const hasSeeInvisibility = observer.precise['see-invisibility'] || observer.precise.seeInvisibility;

    // CRITICAL: Invisible targets cannot be detected by visual senses UNLESS observer has see-invisibility
    const isInvisible = target.auxiliary.includes('invisible');
    if (isInvisible && !hasSeeInvisibility) {
        return {
            canDetect: false,
            sense: null,
            isPrecise: false,
            baseState: null
        };
    }

    const { lightingLevel } = target;
    const { precise, conditions, lightingLevel: observerLighting } = observer;

    // Dazzled condition: "If vision is your only precise sense, all creatures and objects are Concealed from you."
    // This means dazzled ONLY applies concealment if the observer has no precise non-visual senses
    const isDazzled = conditions.dazzled;

    // Check if observer has any precise non-visual senses
    const hasPreciseNonVisualSense = checkHasPreciseNonVisualSense(observer);

    // Dazzled only applies if vision is the ONLY precise sense
    const dazzledApplies = isDazzled && !hasPreciseNonVisualSense;

    // Determine effective lighting level: use the most restrictive of target, observer, or ray
    // Priority: greaterMagicalDarkness > magicalDarkness > darkness > dim > bright
    let effectiveLightingLevel = lightingLevel;

    // If observer is in magical darkness, that affects their vision even if target is in light
    if (observerLighting === 'greaterMagicalDarkness') {
        effectiveLightingLevel = 'greaterMagicalDarkness';
    } else if (observerLighting === 'magicalDarkness' && effectiveLightingLevel !== 'greaterMagicalDarkness') {
        effectiveLightingLevel = 'magicalDarkness';
    }

    // CRITICAL FIX: Observer in regular darkness can still see targets in bright/dim light!
    // Regular darkness only matters if BOTH are in darkness, not cross-boundary
    // Do NOT override effectiveLightingLevel if target is in bright/dim light

    // If ray passes through darkness, consider that as well
    if (rayDarkness && rayDarkness.passesThroughDarkness) {
        const rayLevel = rayDarkness.lightingLevel;

        // Ray darkness becomes the effective level if it's more restrictive
        if (rayLevel === 'greaterMagicalDarkness') {
            effectiveLightingLevel = 'greaterMagicalDarkness';
        } else if (rayLevel === 'magicalDarkness' && effectiveLightingLevel !== 'greaterMagicalDarkness') {
            effectiveLightingLevel = 'magicalDarkness';
        }
    }

    // Check visual senses in priority order

    // See-invisibility: allows detection of invisible creatures as concealed
    // This is checked FIRST because it specifically counters invisibility
    if (hasSeeInvisibility && isInvisible) {
        return {
            canDetect: true,
            sense: 'see-invisibility',
            isPrecise: true,
            baseState: 'concealed' // Invisible creatures seen with see-invisibility are concealed
        };
    }

    // Greater darkvision: works in all lighting, including magical darkness
    if (precise.greaterDarkvision || precise['greater-darkvision']) {
        return {
            canDetect: true,
            sense: 'greaterDarkvision',
            isPrecise: true,
            baseState: dazzledApplies ? 'concealed' : 'observed'
        };
    }

    // Regular darkvision: works in darkness and dim light
    // In greater magical darkness (rank 4+), sees concealed
    // In magical darkness (rank 1-3) or natural darkness, sees observed
    if (precise.darkvision) {
        // If effective lighting is rank 4+ magical darkness (from observer, target, or ray), darkvision sees concealed
        if (effectiveLightingLevel === 'greaterMagicalDarkness') {
            return {
                canDetect: true,
                sense: 'darkvision',
                isPrecise: true,
                baseState: 'concealed' // Impaired by greater magical darkness
            };
        }

        // In magical darkness (rank 1-3) or natural darkness: darkvision sees clearly
        if (effectiveLightingLevel === 'magicalDarkness' || effectiveLightingLevel === 'darkness') {
            return {
                canDetect: true,
                sense: 'darkvision',
                isPrecise: true,
                baseState: dazzledApplies ? 'concealed' : 'observed'
            };
        } else if (effectiveLightingLevel === 'dim') {
            // In dim light, darkvision sees clearly
            return {
                canDetect: true,
                sense: 'darkvision',
                isPrecise: true,
                baseState: dazzledApplies ? 'concealed' : 'observed'
            };
        } else if (effectiveLightingLevel === 'bright') {
            // In bright light, darkvision works like normal vision
            return {
                canDetect: true,
                sense: 'darkvision',
                isPrecise: true,
                baseState: dazzledApplies ? 'concealed' : 'observed'
            };
        }
    }

    // Low-light vision: treats dim light as bright light, but doesn't help in any darkness
    if (precise.lowLightVision || precise['low-light-vision']) {
        if (effectiveLightingLevel === 'bright' || effectiveLightingLevel === 'dim') {
            return {
                canDetect: true,
                sense: 'lowLightVision',
                isPrecise: true,
                baseState: dazzledApplies ? 'concealed' : 'observed'
            };
        } else {
            // Low-light vision doesn't work in any type of darkness
            return { canDetect: false };
        }
    }

    // Light-perception and normal vision: work the same way
    // Both work in bright light, concealed in dim light, fail in any darkness
    if (precise['light-perception'] || precise.vision) {
        const senseUsed = precise['light-perception'] ? 'light-perception' : 'vision';


        if (effectiveLightingLevel === 'bright') {
            return {
                canDetect: true,
                sense: senseUsed,
                isPrecise: true,
                baseState: dazzledApplies ? 'concealed' : 'observed'
            };
        } else if (effectiveLightingLevel === 'dim') {
            // Dim light causes concealment for normal vision
            return {
                canDetect: true,
                sense: senseUsed,
                isPrecise: true,
                baseState: 'concealed' // Always concealed in dim light
            };
        } else {
            // Any type of darkness: cannot detect
            return { canDetect: false };
        }
    }

    // No visual senses
    return { canDetect: false };
}

/**
 * Check imprecise senses (hearing, tremorsense, lifesense, scent)
 * These provide hidden state when they detect
 * 
 * IMPORTANT: Checks ALL imprecise senses and returns the BEST detection based on priority.
 * This ensures that tremorsense/lifesense are used even if hearing also works.
 * 
 * Priority: Tremorsense > Lifesense > Scent > Hearing
 * (Hearing is last because it doesn't bypass invisibility and can make targets undetected)
 * 
 * @param {Object} observer - Observer state
 * @param {Object} target - Target state
 * @param {boolean} soundBlocked - Whether sound is blocked between observer and target
 * @param {Object} visualDetection - Visual detection result (unused but kept for backward compatibility)
 */
function checkImpreciseSenses(observer, target, soundBlocked = false, visualDetection) {
    const { imprecise, conditions, movementAction: observerMovementAction } = observer;
    const { auxiliary, movementAction: targetMovementAction } = target;
    const isInvisible = auxiliary.includes('invisible');

    // Collect all working senses with their priority
    const workingSenses = [];

    // Tremorsense: detects ground-based vibrations, BYPASSES invisibility
    // CRITICAL: Tremorsense only works if target is on the ground at the same elevation
    // Priority: 1 (highest)
    if (imprecise.tremorsense) {
        // Check if target is elevated (not on the ground at observer's level)
        const isTargetElevated = targetMovementAction === 'fly' || observerMovementAction === 'fly';

        // Check if target has Petal Step feat (immune to tremorsense)
        const hasPetalStep = target.auxiliary.includes('petal-step');

        if (!isTargetElevated && !hasPetalStep) {
            // Target is at same elevation and doesn't have Petal Step - tremorsense detects them
            workingSenses.push({
                priority: 1,
                state: 'hidden',
                detection: {
                    isPrecise: false,
                    sense: 'tremorsense'
                }
            });
        }
    }

    // Lifesense: detects living or undead creatures, BYPASSES invisibility
    // Can be configured to detect either living creatures OR undead
    // Living = absence of "undead" and "construct" traits
    // Undead = presence of "undead" trait
    // Priority: 2
    if (imprecise.lifesense && canLifesenseDetect(target)) {
        workingSenses.push({
            priority: 2,
            state: 'hidden',
            detection: {
                isPrecise: false,
                sense: 'lifesense'
            }
        });
    }

    // Scent: detects by smell, BYPASSES invisibility
    // No conditions or restrictions
    // Priority: 3
    if (imprecise.scent) {
        workingSenses.push({
            priority: 3,
            state: 'hidden',
            detection: {
                isPrecise: false,
                sense: 'scent'
            }
        });
    }

    // Hearing: affected by deafened condition and DOES NOT bypass invisibility
    // CRITICAL: Hearing is blocked by sound-blocking walls
    // Hearing follows special invisibility rules: 
    // - Normally detects at hidden level
    // - With invisible target: returns undetected (invisibility makes target undetected to visual senses)
    // - With sound blocked: cannot detect (treated as if observer is deafened for this target)
    // Priority: 4 (lowest - because it can return "undetected" for invisible targets)
    if (imprecise.hearing && !conditions.deafened && !soundBlocked) {
        if (isInvisible) {
            workingSenses.push({
                priority: 4,
                state: 'undetected',
                detection: null  // Invisible makes target undetected to visual-based detection
            });
        } else {
            workingSenses.push({
                priority: 4,
                state: 'hidden',
                detection: {
                    isPrecise: false,
                    sense: 'hearing'
                }
            });
        }
    }

    // Return the best sense (lowest priority number = highest priority)
    if (workingSenses.length === 0) {
        return null;
    }

    // Sort by priority (ascending) and return the best
    workingSenses.sort((a, b) => a.priority - b.priority);
    const best = workingSenses[0];

    return {
        state: best.state,
        detection: best.detection
    };
}

/**
 * Apply visual modifiers (concealment, cover, invisibility) to base visual detection
 */
function applyVisualModifiers(visualDetection, observer, target) {
    let finalState = visualDetection.baseState;
    const { auxiliary, concealment } = target;

    // 1. Apply invisibility (most significant modifier)
    // EXCEPTION: see-invisibility sense already handled invisibility in determineVisualDetection
    if (auxiliary.includes('invisible') && visualDetection.sense !== 'see-invisibility') {
        // In PF2e, invisible creatures are undetected
        // (they can still be detected by imprecise senses like hearing, tremorsense, etc.,
        // but those are handled separately in the imprecise sense detection logic)
        return {
            state: 'undetected',
            detection: null
        };
    }

    // 2. Apply concealment (from target's concealment property)
    if (concealment && finalState === 'observed') {
        finalState = 'concealed';
    }

    // 3. Apply cover (affects targeting but not detection state in PF2e)
    // Cover doesn't change visibility state, just provides AC/Reflex bonuses
    // We track it but don't modify the state

    // 4. Check for state degradation from multiple factors
    // If already concealed or worse, additional concealment doesn't stack

    return {
        state: finalState,
        detection: {
            isPrecise: visualDetection.isPrecise,
            sense: visualDetection.sense
        }
    };
}

/**
 * Export for testing
 */
export const _internal = {
    normalizeTargetState,
    normalizeObserverState,
    handleBlindedObserver,
    checkPreciseNonVisualSenses,
    checkHasPreciseNonVisualSense,
    checkNonAuditorySenses,
    determineVisualDetection,
    checkImpreciseSenses,
    applyVisualModifiers,
    canLifesenseDetect,
    selectBestDetection
};
