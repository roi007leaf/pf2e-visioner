/**
 * Adapter for converting token-based visibility calculations to stateless format
 * 
 * This adapter bridges the existing VisibilityCalculator (which works with Token objects)
 * and the new StatelessVisibilityCalculator (which works with standardized JSON inputs).
 * 
 * @module VisibilityCalculatorAdapter
 */

import { MODULE_ID } from '../constants.js';
import { calculateDistanceInFeet } from '../helpers/geometry-utils.js';
import { ConcealmentRegionBehavior } from '../regions/ConcealmentRegionBehavior.js';
import { calculateVisibility } from './StatelessVisibilityCalculator.js';
import { FeatsHandler } from '../chat/services/FeatsHandler.js';
import { LevelsIntegration } from '../services/LevelsIntegration.js';

/**
 * Convert token and game state to standardized visibility input
 * 
 * @param {Token} observer - The observing token
 * @param {Token} target - The target token
 * @param {Object} lightingCalculator - Lighting calculator to determine target lighting level
 * @param {Object} visionAnalyzer - Vision analyzer to extract observer capabilities
 * @param {Object} conditionManager - Condition manager to check observer conditions
 * @param {Object} lightingRasterService - Lighting raster service for ray darkness checks
 * @param {Object} options - Optional calculation options
 * @returns {Promise<Object>} Standardized visibility input for StatelessVisibilityCalculator
 */
export async function tokenStateToInput(
    observer,
    target,
    lightingCalculator,
    visionAnalyzer,
    conditionManager,
    lightingRasterService,
    options = {}
) {
    // Guard against null tokens or missing documents
    if (!observer || !target || !observer.document || !target.document) {
        return null;
    }

    // Calculate positions first (needed by multiple functions)
    const observerPosition = {
        x: observer.document.x + (observer.document.width * canvas.grid.size) / 2,
        y: observer.document.y + (observer.document.height * canvas.grid.size) / 2,
        elevation: observer.document.elevation || 0
    };

    const targetPosition = {
        x: target.document.x + (target.document.width * canvas.grid.size) / 2,
        y: target.document.y + (target.document.height * canvas.grid.size) / 2,
        elevation: target.document.elevation || 0
    };

    const targetState = extractTargetState(target, lightingCalculator, options, observerPosition, targetPosition);

    // Calculate distance for sense range filtering using PF2e rules (5-10-5 diagonal pattern)
    // Use Levels integration for 3D distance if available
    let distanceInFeet = calculateDistanceInFeet(observer, target);
    const levelsIntegration = LevelsIntegration.getInstance();
    if (levelsIntegration.isActive) {
        const distance3D = levelsIntegration.getTotalDistance(observer, target);
        if (distance3D !== Infinity) {
            const feetPerGrid = canvas.scene?.grid?.distance || 5;
            distanceInFeet = distance3D * feetPerGrid;
        }
    }

    const observerState = extractObserverState(observer, visionAnalyzer, conditionManager, lightingCalculator, options, distanceInFeet);

    // Check if there's line of sight (no sight-blocking walls)
    // However, if either observer or target is in magical darkness, the darkness polygon might be
    // incorrectly treated as a sight-blocking wall. In those cases, ignore the LOS check and let
    // the darkvision/lighting logic handle visibility properly.


    // Get ray darkness information if lightingRasterService is available
    let rayDarkness = null;

    // Check if ray passes through darkness
    const { linePassesThroughDarkness, rayDarknessRank } =
        await checkDarknessRayIntersection(
            lightingRasterService,
            observer,
            target,
            observerPosition,
            targetPosition
        );

    // Allow skipping LOS check via options (useful for diagnostic APIs)
    const hasLineOfSight = options?.skipLOS ? undefined : visionAnalyzer.hasLineOfSight(observer, target);
    const soundBlocked = visionAnalyzer.isSoundBlocked(observer, target);


    if (linePassesThroughDarkness && rayDarknessRank > 0) {
        // Map darkness rank to lighting level for the ray
        let rayLightingLevel = 'darkness';
        if (rayDarknessRank >= 4) {
            rayLightingLevel = 'greaterMagicalDarkness';
        } else if (rayDarknessRank >= 1) {
            rayLightingLevel = 'magicalDarkness';
        }

        rayDarkness = {
            passesThroughDarkness: true,
            rank: rayDarknessRank,
            lightingLevel: rayLightingLevel
        };
    }


    return {
        target: targetState,
        observer: observerState,
        rayDarkness: rayDarkness,
        soundBlocked: soundBlocked,  // Add sound blocking information
        hasLineOfSight: hasLineOfSight  // Add line of sight information
    };
}

/**
 * Extract target state from token and game state
 */
function extractTargetState(target, lightingCalculator, options, observerPosition = null, targetPosition = null) {
    // Get lighting level at target position
    if (!targetPosition) {
        targetPosition = {
            x: target.document.x + (target.document.width * canvas.grid.size) / 2,
            y: target.document.y + (target.document.height * canvas.grid.size) / 2,
            elevation: target.document.elevation || 0
        };
    }

    const lightLevel = lightingCalculator.getLightLevelAt(targetPosition, target);

    // Map lighting calculator output to standard format
    let lightingLevel = 'bright';
    if (lightLevel) {
        const darknessRank = lightLevel.darknessRank ?? 0;
        const isDarknessSource = lightLevel.isDarknessSource ?? false;


        if (darknessRank >= 4 && isDarknessSource) {
            // Rank 4+ magical darkness (e.g., heightened Darkness spell)
            lightingLevel = 'greaterMagicalDarkness';
        } else if (darknessRank >= 1 && isDarknessSource) {
            // Rank 1-3 magical darkness (e.g., Darkness spell)
            lightingLevel = 'magicalDarkness';
        } else if (darknessRank >= 1 || lightLevel.level === 'darkness') {
            // Natural darkness (no light sources)
            lightingLevel = 'darkness';
        } else if (lightLevel.level === 'dim') {
            lightingLevel = 'dim';
        } else {
            lightingLevel = 'bright';
        }

    }


    // Check for concealment (from terrain, effects, etc.)
    let concealment = extractConcealment(target, options);

    // Check for region-based concealment (if observer position is available)
    if (!concealment && observerPosition && targetPosition) {
        const regionConcealment = checkRegionConcealment(observerPosition, targetPosition);
        concealment = regionConcealment;
    } else if (!observerPosition || !targetPosition) {
    }


    // Extract auxiliary conditions (invisible, etc.)
    const auxiliary = extractAuxiliaryConditions(target, options);

    // Extract traits from actor (for lifesense and other sense checks)
    const traits = target?.actor?.system?.traits?.value ?? [];

    return {
        lightingLevel,
        concealment,
        auxiliary,
        traits,
        movementAction: target.document.movementAction // Add elevation for tremorsense checks
    };
}

/**
 * Extract observer state from token and game state
 * 
 * Extracts observer's vision capabilities, senses, conditions, and lighting level.
 * Uses capabilities.sensingSummary as the single source of truth for all senses.
 * Filters senses by range to ensure only in-range senses are passed to visibility calculator.
 * 
 * @param {Token} observer - The observing token
 * @param {Object} visionAnalyzer - Vision analyzer instance
 * @param {Object} conditionManager - Condition manager instance
 * @param {Object} lightingCalculator - Lighting calculator instance
 * @param {Object} options - Additional options
 * @param {number} distanceInFeet - Distance to target in feet (for range filtering)
 * @returns {Object} Observer state for StatelessVisibilityCalculator
 */
function extractObserverState(observer, visionAnalyzer, conditionManager, lightingCalculator, options, distanceInFeet) {
    const visionCapabilities = visionAnalyzer.getVisionCapabilities(observer);

    // Extract precise and imprecise senses from sensingSummary (single source of truth)
    // Filter by range - only include senses that can reach the target
    const precise = extractPreciseSenses(visionCapabilities, distanceInFeet);
    const imprecise = extractImpreciseSenses(visionCapabilities, distanceInFeet);

    // Extract observer conditions
    const conditions = {
        blinded: conditionManager.isBlinded(observer),
        deafened: conditionManager.isDeafened?.(observer) ?? false,
        dazzled: conditionManager.isDazzled(observer)
    };

    // Extract observer's lighting level (needed for magical darkness rules)
    const observerPosition = {
        x: observer.document.x + (observer.document.width * canvas.grid.size) / 2,
        y: observer.document.y + (observer.document.height * canvas.grid.size) / 2,
        elevation: observer.document.elevation || 0
    };

    const observerLightLevel = lightingCalculator.getLightLevelAt(observerPosition, observer);
    let observerLightingLevel = 'bright';

    if (observerLightLevel) {
        const darknessRank = observerLightLevel.darknessRank ?? 0;
        const isDarknessSource = observerLightLevel.isDarknessSource ?? false;


        if (darknessRank >= 4 && isDarknessSource) {
            observerLightingLevel = 'greaterMagicalDarkness';
        } else if (darknessRank >= 1 && isDarknessSource) {
            observerLightingLevel = 'magicalDarkness';
        } else if (darknessRank >= 1 || observerLightLevel.level === 'darkness') {
            observerLightingLevel = 'darkness';
        } else if (observerLightLevel.level === 'dim') {
            observerLightingLevel = 'dim';
        } else {
            observerLightingLevel = 'bright';
        }
    }

    return {
        precise,
        imprecise,
        conditions,
        lightingLevel: observerLightingLevel, // Observer's own lighting level
        movementAction: observer.document.movementAction, // Observer's movement action for tremorsense checks
        _visionAnalyzer: visionAnalyzer, // Pass through for fallback checks
        _observer: observer // Pass through for fallback checks
    };
}

/**
 * Extract precise senses from vision capabilities
 * Uses sensingSummary as single source of truth - NO hardcoded ranges
 * Filters senses by range - only includes senses that can reach the target distance.
 * 
 * @param {Object} capabilities - Vision capabilities from VisionAnalyzer
 * @param {number} distanceInFeet - Distance to target in feet
 * @returns {Object} Precise senses object filtered by range
 */
function extractPreciseSenses(capabilities, distanceInFeet) {
    const precise = {};
    const sensingSummary = capabilities.sensingSummary || {};

    // Extract ALL precise senses from sensingSummary.precise array
    // This includes vision, darkvision, greater-darkvision, low-light-vision, echolocation, etc.
    const preciseSenses = sensingSummary.precise || [];
    for (const sense of preciseSenses) {
        if (sense.type && sense.range !== undefined) {
            // Only include senses that are within range
            // CRITICAL: Exclude range-0 senses (they don't exist/are disabled)
            if (sense.range > 0 && (sense.range >= distanceInFeet || !Number.isFinite(sense.range))) {
                precise[sense.type] = { range: sense.range };
            }
        }
    }

    // CRITICAL: Also check top-level vision capability flags
    // These are set by VisionAnalyzer but may not be in sensingSummary.precise
    if (capabilities.hasGreaterDarkvision) {
        const range = capabilities.darkvisionRange || Infinity;
        if (range >= distanceInFeet || !Number.isFinite(range)) {
            if (!precise.greaterDarkvision && !precise['greater-darkvision']) {
                precise.greaterDarkvision = { range };
            }
        }
    }

    if (capabilities.hasDarkvision && !capabilities.hasGreaterDarkvision) {
        const range = capabilities.darkvisionRange || Infinity;
        if (range >= distanceInFeet || !Number.isFinite(range)) {
            if (!precise.darkvision) {
                precise.darkvision = { range };
            }
        }
    }

    if (capabilities.hasLowLightVision) {
        const range = capabilities.lowLightRange || Infinity;
        if (range >= distanceInFeet || !Number.isFinite(range)) {
            if (!precise.lowLightVision && !precise['low-light-vision']) {
                precise.lowLightVision = { range };
            }
        }
    }

    // Normal vision - default for most creatures unless explicitly disabled
    if (capabilities.hasVision) {
        if (!precise.vision) {
            // Normal vision typically has no specific range limit (uses lighting)
            precise.vision = { range: Infinity };
        }
    }

    return precise;
}

/**
 * Extract imprecise senses from vision capabilities
 * Uses sensingSummary as single source of truth
 * Filters senses by range - only includes senses that can reach the target distance.
 * 
 * @param {Object} capabilities - Vision capabilities from VisionAnalyzer
 * @param {number} distanceInFeet - Distance to target in feet
 * @returns {Object} Imprecise senses object filtered by range
 */
function extractImpreciseSenses(capabilities, distanceInFeet) {
    const imprecise = {};
    const sensingSummary = capabilities.sensingSummary || {};

    // Process all imprecise senses from sensingSummary
    const impreciseSenses = sensingSummary.imprecise || [];
    for (const sense of impreciseSenses) {
        if (sense.type && sense.range !== undefined) {
            // Only include senses that are within range
            // CRITICAL: Exclude range-0 senses (they don't exist/are disabled)
            const senseRange = sense.range || 0;
            if (senseRange > 0 && (senseRange >= distanceInFeet || !Number.isFinite(senseRange))) {
                imprecise[sense.type] = { range: senseRange };
            }
        }
    }

    // Extract hearing from sensingSummary with proper fallback
    // In PF2e, hearing defaults to Infinity range unless explicitly limited or deafened
    if (sensingSummary.hearing) {
        const hearingRange = sensingSummary.hearing.range ?? Infinity;
        // CRITICAL: Exclude range-0 hearing (explicitly disabled)
        if (hearingRange > 0 && (hearingRange >= distanceInFeet || !Number.isFinite(hearingRange))) {
            imprecise.hearing = { range: hearingRange };
        }
    } else if (!capabilities.conditions?.deafened) {
        // Default: creatures have hearing unless deafened (always in range with Infinity)
        imprecise.hearing = { range: Infinity };
    }

    return imprecise;
}

/**
 * Extract concealment from target
 */
function extractConcealment(target, options) {
    // Check for concealment effects
    const flags = target?.document?.flags?.['pf2e-visioner'] || {};

    if (flags.concealment !== undefined) {
        return flags.concealment;
    }

    // Check PF2e actor conditions
    if (target.actor?.conditions) {
        const concealed = target.actor.conditions.find(c => c.slug === 'concealed');
        if (concealed) return true;
    }

    return false;
}

/**
 * Check if ray crosses concealment region boundaries
 * @param {Object} observerPosition - Observer's position {x, y}
 * @param {Object} targetPosition - Target's position {x, y}
 * @returns {boolean} True if ray crosses any concealment region boundary
 */
function checkRegionConcealment(observerPosition, targetPosition) {
    try {
        const result = ConcealmentRegionBehavior.doesRayHaveConcealment(observerPosition, targetPosition);
        return result;
    } catch (error) {
        console.error('PF2e Visioner | Error checking region concealment:', error);
        return false;
    }
}

/**
 * Extract auxiliary conditions (invisible, etc.)
 */
function extractAuxiliaryConditions(target, options) {
    const auxiliary = [];

    // Check for invisible condition
    if (target.actor?.conditions) {
        const invisible = target.actor.conditions.find(c =>
            c.slug === 'invisible' || c.name?.toLowerCase().includes('invisible')
        );
        if (invisible) {
            auxiliary.push('invisible');
        }
    }

    // Check flags for invisible
    const flags = target?.document?.flags?.['pf2e-visioner'] || {};
    if (flags.invisible || flags.invisibility) {
        if (!auxiliary.includes('invisible')) {
            auxiliary.push('invisible');
        }
    }

    // Check for Petal Step feat (immune to tremorsense)
    if (FeatsHandler.hasFeat(target, 'petal-step')) {
        auxiliary.push('petal-step');
    }

    return auxiliary;
}

/**
 * Calculate visibility using stateless calculator with token inputs
 * 
 * This is the main adapter function that allows using the stateless calculator
 * with the existing token-based API.
 * 
 * @param {Token} observer - The observing token
 * @param {Token} target - The target token
 * @param {Object} dependencies - Calculator dependencies
 * @param {Object} dependencies.lightingCalculator - Lighting calculator instance
 * @param {Object} dependencies.visionAnalyzer - Vision analyzer instance
 * @param {Object} dependencies.conditionManager - Condition manager instance
 * @param {Object} dependencies.lightingRasterService - Lighting raster service instance (for ray darkness checks)
 * @param {Object} options - Optional calculation options
 * @returns {Promise<Object>} Visibility result with state and detection info
 */
export async function calculateVisibilityFromTokens(
    observer,
    target,
    dependencies,
    options = {}
) {
    const { lightingCalculator, visionAnalyzer, conditionManager, lightingRasterService } = dependencies;

    // Convert tokens to standardized input (now async due to ray darkness check)
    const input = await tokenStateToInput(
        observer,
        target,
        lightingCalculator,
        visionAnalyzer,
        conditionManager,
        lightingRasterService,
        options
    );

    // Handle null input (invalid tokens)
    if (!input) {
        return {
            state: 'undetected',
            detectionType: 'none',
            senses: []
        };
    }

    // Add debug context for logging (not used by stateless calculator)
    input._debug = {
        observerName: observer?.name,
        targetName: target?.name,
        observerId: observer?.id,
        targetId: target?.id
    };

    // Calculate using stateless calculator
    return calculateVisibility(input);
}



/**
 * Find darkness rank from intersected darkness sources
 * @param {Object} observerPosition
 * @param {Object} targetPosition
 * @returns {Promise<number>} Maximum darkness rank found
 * @private
 */
const findIntersectedDarknessRank = async (observerPosition, targetPosition) => {
    const ray = new foundry.canvas.geometry.Ray(observerPosition, targetPosition);

    // Get all darkness sources
    const allSources = getAllDarknessSources();
    const intersectedSources = filterIntersectedDarknessSources(ray, allSources);

    let maxFoundRank = getDarknessRankFromSources(intersectedSources);

    return maxFoundRank;
}

/**
 * Check if line passes through darkness and get the maximum darkness rank
 * @param {Token} observer
 * @param {Token} target
 * @param {Object} observerPosition
 * @param {Object} targetPosition
 * @returns {Promise<Object>} Object with linePassesThroughDarkness and rayDarknessRank
 * @private
 */
const checkDarknessRayIntersection = async (lightingRasterService, observer, target, observerPosition, targetPosition) => {
    let linePassesThroughDarkness = false;
    let rayDarknessRank = 0;

    // Prefer raster service for fast approximation
    let darknessResult = null;
    try {
        if (
            lightingRasterService &&
            typeof lightingRasterService.getRayDarknessInfo === 'function'
        ) {
            darknessResult = await lightingRasterService.getRayDarknessInfo(
                observer,
                target,
                observerPosition,
                targetPosition,
            );
        }
    } catch (error) {
        // Raster service failed, will use fallback
    }

    if (!darknessResult) {
        // Fallback to precise shape-based detector
        darknessResult = doesLinePassThroughDarkness(
            observer,
            target,
            observerPosition,
            targetPosition,
        ) || { passesThroughDarkness: false, maxDarknessRank: 0 };
    } else if (
        darknessResult &&
        darknessResult.passesThroughDarkness === false &&
        darknessResult.maxDarknessRank === 0
    ) {
        // Double-check with precise detector if raster found no darkness
        const preciseResult = doesLinePassThroughDarkness(
            observer,
            target,
            observerPosition,
            targetPosition,
        ) || { passesThroughDarkness: false, maxDarknessRank: 0 };

        if (preciseResult.passesThroughDarkness || preciseResult.maxDarknessRank > 0) {
            darknessResult = preciseResult;
        }
    }

    linePassesThroughDarkness = !!darknessResult.passesThroughDarkness;
    rayDarknessRank = Number(darknessResult.maxDarknessRank || 0) || 0;

    // If raster service detected darkness but rank is 0, find actual darkness sources
    if (linePassesThroughDarkness && rayDarknessRank === 0) {
        rayDarknessRank = await findIntersectedDarknessRank(observerPosition, targetPosition);
    }

    return { linePassesThroughDarkness, rayDarknessRank };
}


/**
 * Check if the line between two tokens passes through darkness
 * This is used to detect when tokens are on opposite sides of a darkness effect
 * @param {Token} observer - The observing token
 * @param {Token} target - The target token
 * @returns {boolean} True if the line passes through darkness
 */
const doesLinePassThroughDarkness = (
    observer,
    target,
    observerPosOverride = null,
    targetPosOverride = null,
) => {
    try {
        const observerPos = observerPosOverride || this._getTokenPosition(observer);
        const targetPos = targetPosOverride || this._getTokenPosition(target);

        // Precise darkness detection using shape-based intersection

        // Cast a ray between the tokens to check for darkness effects
        const ray = new foundry.canvas.geometry.Ray(observerPos, targetPos);

        // Get all darkness sources that the ray passes through
        let lightSources = [];
        try {
            // First check canvas.effects.darknessSources (used by LightingCalculator)
            const darknessSources = canvas.effects?.darknessSources || [];
            // Also check canvas.lighting for additional darkness sources
            const lightObjects =
                canvas.lighting?.objects?.children || canvas.lighting?.placeables || [];

            // Combine both sources
            const allSources = [...darknessSources, ...lightObjects];

            lightSources = allSources.filter((light) => {
                // Check for darkness sources - either isDarknessSource property or negative config
                const isDarkness = light.isDarknessSource || light.document?.config?.negative || false;

                // Treat undefined active as true (some darkness sources may not have explicit active property)
                const isActive = light.active !== false;
                const isVisible = light.visible !== false;

                if (!isDarkness || !isActive || !isVisible) {
                    return false;
                }

                // Check if the ray intersects with the light source's area
                // For circular darkness sources, use precise circle-line intersection
                let intersects = false;
                try {
                    // Get the radius for circular intersection test
                    // For darkness sources, use total effective area (bright + dim) to match visual rendering
                    // PointDarknessSource has calculated values in data property
                    const brightValue = light.data?.bright || light.config?.bright || light.bright || 0;
                    const dimValue = light.data?.dim || light.config?.dim || light.dim || 0;
                    const totalRadius = brightValue + dimValue;

                    // For darkness sources with visual coverage but no bright/dim values,
                    // Use the actual configured radius without artificial expansion
                    let radius = totalRadius > 0 ? totalRadius : light.radius || 0;

                    const centerX = light.x;
                    const centerY = light.y;

                    if (radius > 0) {
                        // Use precise circle-line intersection for circular darkness sources
                        intersects = rayIntersectsCircle(ray, centerX, centerY, radius);
                    } else {
                        // Fallback to shape-based intersection for non-circular sources
                        if (light.shape) {
                            intersects = rayIntersectsShape(ray, light.shape);
                        } else {
                            // Final fallback to bounds check
                            const lightBounds = light.bounds;
                            if (!lightBounds) {
                                return false;
                            }

                            // Try different intersection methods
                            if (typeof ray.intersectRectangle === 'function') {
                                intersects = ray.intersectRectangle(lightBounds);
                            } else if (typeof ray.intersects === 'function') {
                                intersects = ray.intersects(lightBounds);
                            } else {
                                // Manual rectangle intersection check
                                const rayStart = ray.A;
                                const rayEnd = ray.B;

                                // Check if ray intersects rectangle bounds
                                const left = lightBounds.x;
                                const right = lightBounds.x + lightBounds.width;
                                const top = lightBounds.y;
                                const bottom = lightBounds.y + lightBounds.height;

                                // Use line-rectangle intersection algorithm
                                intersects = lineIntersectsRectangle(
                                    rayStart,
                                    rayEnd,
                                    left,
                                    top,
                                    right,
                                    bottom,
                                );
                            }
                        }
                    }
                } catch (error) {
                    console.error('PF2E Visioner | Ray intersection failed:', {
                        id: light.id,
                        error: error.message,
                        errorType: error.constructor.name,
                        hasRadius: !!(light.radius || light.data?.bright || light.data?.dim),
                        ray: { A: ray.A, B: ray.B },
                    });
                    return false;
                }

                return intersects;
            });
        } catch (error) {
            console.error('PF2E Visioner | Error filtering light sources:', error);
        }

        // Check for darkness effects along the ray
        let passesThroughDarkness = false;
        let darknessEffects = [];

        // Check each darkness source the ray passes through
        for (const lightSource of lightSources) {
            // Find the ambient light document to get the proper rank flag
            let ambientDoc = null;
            let darknessRank = 0;

            // Try to get document directly
            if (lightSource.document) {
                ambientDoc = lightSource.document;
            }
            // Try to find by sourceId
            else if (lightSource.sourceId) {
                try {
                    // sourceId format is usually "DocumentType.documentId"
                    const [docType, docId] = lightSource.sourceId.split('.');
                    if (docType === 'AmbientLight' && docId) {
                        ambientDoc = canvas.scene.lights.get(docId);
                    }
                } catch (error) {
                    // Silently continue if we can't parse the sourceId
                }
            }
            // Try to find by ID
            else if (lightSource.id) {
                ambientDoc = canvas.scene.lights.get(lightSource.id);
            }

            // Get darkness rank from the ambient light document flag
            if (ambientDoc?.getFlag) {
                darknessRank = Number(ambientDoc.getFlag(MODULE_ID, 'darknessRank') || 0) || 0;
            }

            // Fallback to other methods if no flag found
            if (darknessRank === 0 && lightSource.data?.darknessRank) {
                darknessRank = Number(lightSource.data.darknessRank) || 0;
            }

            if (darknessRank === 0 && ambientDoc?.config) {
                const config = ambientDoc.config;
                darknessRank = Number(config.darknessRank || config.spellLevel || 0) || 0;
            }

            // Default to rank 4 for darkness sources if no specific rank is found
            // This matches the expectation that darkness spells are typically rank 4
            if (darknessRank === 0) darknessRank = 4;

            darknessEffects.push({
                light: lightSource,
                darkness: lightSource.data?.darkness || 1,
                darknessRank: darknessRank,
            });
            passesThroughDarkness = true;
        }

        // Return both whether it passes through darkness and the maximum darkness rank
        const maxDarknessRank =
            darknessEffects.length > 0
                ? Math.max(...darknessEffects.map((effect) => effect.darknessRank))
                : 0;

        return {
            passesThroughDarkness,
            maxDarknessRank,
        };
    } catch (error) {
        console.error('PF2E Visioner | Error checking darkness line of sight:', {
            observer: observer.name,
            target: target.name,
            error: error.message,
            stack: error.stack,
        });
        return { passesThroughDarkness: false, maxDarknessRank: 0 };
    }
}


/**
 * Check if a ray intersects with a FoundryVTT shape (polygon)
 * @param {foundry.canvas.geometry.Ray} ray - The ray to check
 * @param {PIXI.Polygon} shape - The shape to check against
 * @returns {boolean} - Whether the ray intersects the shape
 */
const rayIntersectsShape = (ray, shape) => {
    try {
        // Convert ray to line segment points
        const rayStart = ray.A;
        const rayEnd = ray.B;

        // Check if either endpoint is inside the shape
        if (shape.contains(rayStart.x, rayStart.y) || shape.contains(rayEnd.x, rayEnd.y)) {
            return true;
        }

        // Check if ray intersects any edge of the polygon
        const points = shape.points;
        for (let i = 0; i < points.length; i += 2) {
            const j = (i + 2) % points.length;

            const edge = {
                x1: points[i],
                y1: points[i + 1],
                x2: points[j],
                y2: points[j + 1],
            };

            if (lineSegmentsIntersect(rayStart, rayEnd, edge)) {
                return true;
            }
        }

        return false;
    } catch (error) {
        console.error('PF2E Visioner | Error checking ray-shape intersection:', {
            error: error.message,
            hasShape: !!shape,
            hasPoints: !!shape?.points,
            ray: { A: ray.A, B: ray.B },
        });
        return false;
    }
}



/**
 * Manual line-rectangle intersection check
 * @param {Object} rayStart - Ray start point {x, y}
 * @param {Object} rayEnd - Ray end point {x, y}
 * @param {number} left - Rectangle left edge
 * @param {number} top - Rectangle top edge
 * @param {number} right - Rectangle right edge
 * @param {number} bottom - Rectangle bottom edge
 * @returns {boolean} - Whether the line intersects the rectangle
 */
const lineIntersectsRectangle = (rayStart, rayEnd, left, top, right, bottom) => {
    // Check if either endpoint is inside the rectangle
    if (
        (rayStart.x >= left && rayStart.x <= right && rayStart.y >= top && rayStart.y <= bottom) ||
        (rayEnd.x >= left && rayEnd.x <= right && rayEnd.y >= top && rayEnd.y <= bottom)
    ) {
        return true;
    }

    // Check intersection with each edge of the rectangle
    const edges = [
        { x1: left, y1: top, x2: right, y2: top }, // top edge
        { x1: right, y1: top, x2: right, y2: bottom }, // right edge
        { x1: right, y1: bottom, x2: left, y2: bottom }, // bottom edge
        { x1: left, y1: bottom, x2: left, y2: top }, // left edge
    ];

    for (const edge of edges) {
        if (lineSegmentsIntersect(rayStart, rayEnd, edge)) {
            return true;
        }
    }

    return false;
}


/**
 * Check if two line segments intersect
 * @param {Object} line1Start - First line start point {x, y}
 * @param {Object} line1End - First line end point {x, y}
 * @param {Object} line2 - Second line with {x1, y1, x2, y2}
 * @returns {boolean} - Whether the line segments intersect
 */
const lineSegmentsIntersect = (line1Start, line1End, line2) => {
    const x1 = line1Start.x,
        y1 = line1Start.y;
    const x2 = line1End.x,
        y2 = line1End.y;
    const x3 = line2.x1,
        y3 = line2.y1;
    const x4 = line2.x2,
        y4 = line2.y2;

    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 1e-10) return false; // Lines are parallel

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}




/**
 * Get all available darkness sources from canvas
 * @returns {Array} Array of darkness sources
 * @private
 */
const getAllDarknessSources = () => {
    let allSources = [];
    try {
        const darknessSources = canvas.effects?.darknessSources || [];
        const lightObjects = canvas.lighting?.objects?.children || canvas.lighting?.placeables || [];
        allSources = [...darknessSources, ...lightObjects];
    } catch (error) {
        console.error('DEBUG Error getting light sources:', error);
    }
    return allSources;
}

/**
 * Filter darkness sources that intersect with the ray
 * @param {Ray} ray
 * @param {Array} allSources
 * @returns {Array} Filtered intersected sources
 * @private
 */
const filterIntersectedDarknessSources = (ray, allSources) => {
    return allSources.filter((light) => {
        const isDarkness = light.isDarknessSource || light.document?.config?.negative || false;
        const isActive = light.active !== false;
        const isVisible = light.visible !== false;

        if (!isDarkness || !isActive || !isVisible) {
            return false;
        }

        try {
            const brightValue = light.data?.bright || light.config?.bright || light.bright || 0;
            const dimValue = light.data?.dim || light.config?.dim || light.dim || 0;
            const totalRadius = brightValue + dimValue;
            let radius = totalRadius > 0 ? totalRadius : light.radius || 0;

            const centerX = light.x;
            const centerY = light.y;

            if (radius > 0) {
                return rayIntersectsCircle(ray, centerX, centerY, radius);
            }
        } catch (error) {
            console.error('DEBUG Error checking ray intersection:', error);
        }

        return false;
    });
}


/**
 * Check if a ray intersects with a circle
 * @param {foundry.canvas.geometry.Ray} ray - The ray to check
 * @param {number} centerX - Circle center X coordinate
 * @param {number} centerY - Circle center Y coordinate
 * @param {number} radius - Circle radius
 * @returns {boolean} - Whether the ray intersects the circle
 */
const rayIntersectsCircle = (ray, centerX, centerY, radius) => {
    try {
        const rayStart = ray.A;
        const rayEnd = ray.B;

        // Check if either endpoint is inside the circle
        const distStart = Math.sqrt((rayStart.x - centerX) ** 2 + (rayStart.y - centerY) ** 2);
        const distEnd = Math.sqrt((rayEnd.x - centerX) ** 2 + (rayEnd.y - centerY) ** 2);

        if (distStart <= radius || distEnd <= radius) {
            return true;
        }

        // Check if the line segment intersects the circle
        // Calculate closest point on line to circle center
        const dx = rayEnd.x - rayStart.x;
        const dy = rayEnd.y - rayStart.y;
        const lineLengthSquared = dx * dx + dy * dy;

        if (lineLengthSquared === 0) {
            // Ray start and end are the same point
            return distStart <= radius;
        }

        const t = Math.max(
            0,
            Math.min(
                1,
                ((centerX - rayStart.x) * dx + (centerY - rayStart.y) * dy) / lineLengthSquared,
            ),
        );
        const closestX = rayStart.x + t * dx;
        const closestY = rayStart.y + t * dy;

        const distToCenter = Math.sqrt((closestX - centerX) ** 2 + (closestY - centerY) ** 2);

        return distToCenter <= radius;
    } catch (error) {
        console.error('PF2E Visioner | Error checking ray-circle intersection:', {
            error: error.message,
            centerX,
            centerY,
            radius,
            ray: { A: ray.A, B: ray.B },
        });
        return false;
    }
}

/**
 * Get darkness rank from intersected sources
 * @param {Array} intersectedSources
 * @returns {number} Maximum darkness rank found
 * @private
 */
const getDarknessRankFromSources = (intersectedSources) => {
    let maxFoundRank = 0;

    for (const lightSource of intersectedSources) {
        let darknessRank = 0;
        const ambientDoc = findAmbientLightDocument(lightSource);

        if (ambientDoc?.getFlag) {
            darknessRank = Number(ambientDoc.getFlag('pf2e-visioner', 'darknessRank') || 0) || 0;
        }

        // Fallback methods
        if (darknessRank === 0 && lightSource.data?.darknessRank) {
            darknessRank = Number(lightSource.data.darknessRank) || 0;
        }

        if (darknessRank === 0 && ambientDoc?.config) {
            const config = ambientDoc.config;
            darknessRank = Number(config.darknessRank || config.spellLevel || 0) || 0;
        }

        // Default to rank 2 if we can't determine (most darkness spells are rank 1-3)
        if (darknessRank === 0) darknessRank = 2;

        maxFoundRank = Math.max(maxFoundRank, darknessRank);
    }

    return maxFoundRank;
}

/**
 * Find ambient light document for a light source
 * @param {Object} lightSource
 * @returns {Object|null} Ambient light document
 * @private
 */
const findAmbientLightDocument = (lightSource) => {
    if (lightSource.document) {
        return lightSource.document;
    }

    if (lightSource.sourceId) {
        try {
            const [docType, docId] = lightSource.sourceId.split('.');
            if (docType === 'AmbientLight' && docId) {
                return canvas.scene.lights.get(docId);
            }
        } catch (error) {
            console.error('DEBUG Error parsing sourceId:', lightSource.sourceId, error);
        }
    }

    if (lightSource.id) {
        return canvas.scene.lights.get(lightSource.id);
    }

    return null;
}

/**
 * Backward compatibility wrapper that returns just the state string
 */
export async function calculateVisibilityStateFromTokens(
    observer,
    target,
    dependencies,
    options = {}
) {
    const result = await calculateVisibilityFromTokens(observer, target, dependencies, options);
    return result.state;
}
