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
 * @param {string} input.target.coverLevel - "none" | "lesser" | "standard" | "greater"
 * @param {boolean} input.target.concealment - Whether target has concealment
 * @param {string[]} input.target.auxiliary - Additional conditions like ["invisible"]
 * @param {number} input.target.elevation - Target's elevation (for tremorsense checks)
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
 * @param {number} input.observer.elevation - Observer's elevation (for tremorsense checks)
 * @param {Object|null} input.rayDarkness - Ray darkness information (if ray passes through darkness)
 * @param {boolean} input.rayDarkness.passesThroughDarkness - Whether ray passes through darkness
 * @param {number} input.rayDarkness.rank - Darkness rank along the ray (1-3 = magical, 4+ = greater magical)
 * @param {string} input.rayDarkness.lightingLevel - Lighting level of darkness along ray
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

    // Decision tree: follow PF2e visibility rules in priority order

    // 1. Check if observer is completely incapacitated (blinded)
    if (observer.conditions.blinded) {
        return handleBlindedObserver(observer, target);
    }

    // 2. Check for precise non-visual senses (bypass most conditions)
    const preciseNonVisualResult = checkPreciseNonVisualSenses(observer, target);
    if (preciseNonVisualResult) {
        return preciseNonVisualResult;
    }

    // 3. Determine visual detection capability based on lighting and senses
    const visualDetection = determineVisualDetection(observer, target, rayDarkness);

    // 4. Check for imprecise senses if visual detection fails
    const impreciseResult = checkImpreciseSenses(observer, target, visualDetection);

    if (impreciseResult && !visualDetection.canDetect) {
        return impreciseResult;
    }

    // 5. Apply visual detection result with modifiers
    if (visualDetection.canDetect) {
        return applyVisualModifiers(visualDetection, observer, target);
    }

    // 6. Default: undetected (no senses can detect)
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
        coverLevel: target.coverLevel || 'none',
        concealment: target.concealment ?? false,
        auxiliary: Array.isArray(target.auxiliary) ? target.auxiliary : [],
        elevation: target.elevation ?? 0
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
        elevation: observer.elevation ?? 0 // Observer's elevation for tremorsense checks
    };
}

/**
 * Handle blinded observer - can only use non-visual senses
 */
function handleBlindedObserver(observer, target) {
    // Check for non-visual senses that still work when blinded
    const nonVisualPrecise = checkPreciseNonVisualSenses(observer, target);
    if (nonVisualPrecise) {
        return nonVisualPrecise;
    }

    const nonVisualImprecise = checkImpreciseSenses(observer, target, { canDetect: false });
    if (nonVisualImprecise) {
        return nonVisualImprecise;
    }

    // Blinded with no non-visual senses = hidden (not undetected, because target might make noise)
    return {
        state: 'hidden',
        detection: null
    };
}

/**
 * Check precise non-visual senses (these bypass invisibility and most conditions)
 * Precise non-visual senses include echolocation, blindsense, thoughtsense, tremorsense, etc.
 * These work regardless of lighting and are unaffected by invisibility
 */
function checkPreciseNonVisualSenses(observer, target) {
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
        'light-perception' // CRITICAL: light-perception is a visual sense affected by lighting
    ]);

    // Check all precise non-visual senses dynamically
    // These senses:
    // - Work in any lighting condition
    // - Bypass invisibility completely
    // - Are not affected by dazzled or blinded (they're non-visual)

    for (const [senseType, senseData] of Object.entries(precise)) {
        // Skip visual senses
        if (visualSenses.has(senseType)) {
            continue;
        }

        // Any non-visual precise sense allows observation
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
function determineVisualDetection(observer, target, rayDarkness = null) {
    const { lightingLevel } = target;
    const { precise, conditions, lightingLevel: observerLighting } = observer;

    // Dazzled condition makes everything concealed (but doesn't prevent detection)
    const isDazzled = conditions.dazzled;

    // Determine effective lighting level: use the most restrictive of target, observer, or ray
    // Priority: greaterMagicalDarkness > magicalDarkness > darkness > dim > bright
    let effectiveLightingLevel = lightingLevel;

    // If observer is in magical darkness, that can impair their vision
    if (observerLighting === 'greaterMagicalDarkness') {
        effectiveLightingLevel = 'greaterMagicalDarkness';
    } else if (observerLighting === 'magicalDarkness' && effectiveLightingLevel !== 'greaterMagicalDarkness') {
        effectiveLightingLevel = 'magicalDarkness';
    } else if (observerLighting === 'darkness' && effectiveLightingLevel === 'bright') {
        // Observer in darkness looking at bright target: darkness takes priority for normal vision
        effectiveLightingLevel = 'darkness';
    }

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
    // CRITICAL: Darkvision must be checked BEFORE light-perception
    // Some creatures have both, and darkvision is superior

    // Greater darkvision: works in all lighting, including magical darkness
    if (precise.greaterDarkvision || precise['greater-darkvision']) {
        return {
            canDetect: true,
            sense: 'greaterDarkvision',
            isPrecise: true,
            baseState: isDazzled ? 'concealed' : 'observed'
        };
    }

    // Regular darkvision: works in darkness and dim light
    // SPECIAL CASE: If observer is in greater magical darkness (rank 4+), darkvision sees everything as concealed
    // In greater magical darkness (rank 4+), sees concealed
    // In magical darkness (rank 1-3), sees observed
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
                baseState: isDazzled ? 'concealed' : 'observed'
            };
        } else if (effectiveLightingLevel === 'dim') {
            // In dim light, darkvision sees clearly
            return {
                canDetect: true,
                sense: 'darkvision',
                isPrecise: true,
                baseState: isDazzled ? 'concealed' : 'observed'
            };
        } else if (effectiveLightingLevel === 'bright') {
            // In bright light, darkvision works like normal vision
            return {
                canDetect: true,
                sense: 'darkvision',
                isPrecise: true,
                baseState: isDazzled ? 'concealed' : 'observed'
            };
        }
    }

    // Light-perception: Special PF2e sense
    // In PF2e, light-perception allows seeing in natural darkness but is NOT darkvision
    // CRITICAL: Checked AFTER darkvision because creatures with both should use darkvision
    // In ANY magical darkness (rank 1+), light-perception cannot see without actual darkvision
    if (precise['light-perception']) {
        // Any magical darkness: light-perception fails (needs actual darkvision)
        if (effectiveLightingLevel === 'greaterMagicalDarkness' || effectiveLightingLevel === 'magicalDarkness') {
            return { canDetect: false };
        }

        // In natural darkness or dim/bright light: sees clearly
        return {
            canDetect: true,
            sense: 'light-perception',
            isPrecise: true,
            baseState: isDazzled ? 'concealed' : 'observed'
        };
    }

    // Low-light vision: treats dim light as bright light, but doesn't help in any darkness
    if (precise.lowLightVision) {
        if (effectiveLightingLevel === 'bright' || effectiveLightingLevel === 'dim') {
            return {
                canDetect: true,
                sense: 'lowLightVision',
                isPrecise: true,
                baseState: isDazzled ? 'concealed' : 'observed'
            };
        } else {
            // Low-light vision doesn't work in any type of darkness (including ray darkness)
            return { canDetect: false };
        }
    }

    // Normal vision: works in bright light, concealed in dim light, fails in any darkness
    if (precise.vision) {
        if (effectiveLightingLevel === 'bright') {
            return {
                canDetect: true,
                sense: 'vision',
                isPrecise: true,
                baseState: isDazzled ? 'concealed' : 'observed'
            };
        } else if (effectiveLightingLevel === 'dim') {
            // Dim light causes concealment for normal vision
            return {
                canDetect: true,
                sense: 'vision',
                isPrecise: true,
                baseState: 'concealed' // Always concealed in dim light with normal vision
            };
        } else {
            // Any type of darkness: normal vision cannot detect
            return { canDetect: false };
        }
    }

    // No visual senses
    return { canDetect: false };
}

/**
 * Check imprecise senses (hearing, tremorsense, lifesense, scent)
 * These provide hidden state when they detect
 */
function checkImpreciseSenses(observer, target, visualDetection) {
    const { imprecise, conditions, elevation: observerElevation } = observer;
    const { auxiliary, elevation: targetElevation } = target;
    const isInvisible = auxiliary.includes('invisible');

    // Check each imprecise sense in priority order
    // Note: These senses detect at "hidden" level (precise location unknown)

    // Tremorsense: detects ground-based vibrations, BYPASSES invisibility
    // CRITICAL: Tremorsense only works if target is on the ground at the same elevation
    if (imprecise.tremorsense) {
        // Check if target is elevated (not on the ground at observer's level)
        const isTargetElevated = targetElevation !== observerElevation;

        if (!isTargetElevated) {
            // Target is at same elevation - tremorsense detects them
            return {
                state: 'hidden',
                detection: {
                    isPrecise: false,
                    sense: 'tremorsense'
                }
            };
        }
        // If elevated, tremorsense fails - continue to check other senses
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

    // Lifesense: detects living creatures, BYPASSES invisibility
    if (imprecise.lifesense) {
        // Note: This assumes target is alive. In full implementation, would check target properties
        return {
            state: 'hidden',
            detection: {
                isPrecise: false,
                sense: 'lifesense'
            }
        };
    }

    // Hearing: affected by deafened condition and DOES NOT bypass invisibility
    // Hearing follows special invisibility rules: 
    // - Normally detects at hidden level
    // - With invisible target: returns undetected (invisibility makes target undetected to visual senses)
    if (imprecise.hearing && !conditions.deafened) {
        if (isInvisible) {
            return {
                state: 'undetected',
                detection: null  // Invisible makes target undetected to visual-based detection
            };
        }
        return {
            state: 'hidden',
            detection: {
                isPrecise: false,
                sense: 'hearing'
            }
        };
    }

    // No imprecise senses detected the target
    // This includes cases where tremorsense was the only sense but target was elevated
    return null;
}

/**
 * Apply visual modifiers (concealment, cover, invisibility) to base visual detection
 */
function applyVisualModifiers(visualDetection, observer, target) {
    let finalState = visualDetection.baseState;
    const { auxiliary, concealment, coverLevel } = target;

    // 1. Apply invisibility (most significant modifier)
    if (auxiliary.includes('invisible')) {
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
    determineVisualDetection,
    checkImpreciseSenses,
    applyVisualModifiers
};
