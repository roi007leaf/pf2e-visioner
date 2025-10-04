/**
 * SeekDialogAdapter
 * 
 * Adapter between VisionAnalyzer and Seek action/dialog.
 * Centralizes all sense detection logic for Seek action.
 * 
 * Responsibilities:
 * - Determine which sense is used for detection (visual vs non-visual, precise vs imprecise)
 * - Check sense limitations (lifesense vs constructs, range limits, etc.)
 * - Format sensing data for UI display (badges, tooltips)
 * - Validate creature type compatibility with special senses
 * 
 * Does NOT:
 * - Build raw sensing capabilities (delegates to VisionAnalyzer)
 * - Make DC comparisons or outcome determinations (that's ActionHandler's job)
 * - Apply visibility changes (that's the service layer's job)
 */

export class SeekDialogAdapter {
    #visionAnalyzer;

    constructor(visionAnalyzer) {
        this.#visionAnalyzer = visionAnalyzer;
    }

    /**
     * Sense type hierarchy for priority determination
     * Higher priority senses are checked first
     */
    static VISUAL_SENSE_PRIORITY = [
        'truesight',
        'greater-darkvision',
        'darkvision',
        'low-light-vision',
        'infrared-vision',
        'vision',
    ];

    /**
     * Check if a sense type is visual
     */
    static isVisualSenseType(senseType) {
        const t = String(senseType || '').toLowerCase();
        return (
            t === 'vision' ||
            t === 'sight' ||
            t === 'darkvision' ||
            t === 'greater-darkvision' ||
            t === 'greaterdarkvision' ||
            t === 'low-light-vision' ||
            t === 'lowlightvision' ||
            t === 'truesight' ||
            t.includes('vision') ||
            t.includes('sight')
        );
    }

    /**
     * Determine which sense the observer is using to detect the target
     * This is the main method that replaces ~240 lines in SeekAction.js
     * 
     * @param {Token} observer - The observing token
     * @param {Token} target - The target token
     * @returns {Promise<Object>} Sense detection result
     *   {
     *     canDetect: boolean,
     *     senseType: string,
     *     precision: 'precise'|'imprecise',
     *     unmetCondition: boolean,
     *     reason: string,
     *     range: number,
     *     outOfRange: boolean
     *   }
     */
    async determineSenseUsed(observer, target) {
        if (!observer || !target) {
            return {
                canDetect: false,
                senseType: null,
                precision: null,
                unmetCondition: false,
                reason: 'Missing observer or target',
            };
        }

        // Get observer's vision capabilities
        const visCaps = this.#visionAnalyzer.getVisionCapabilities(observer);
        const sensingSummary = visCaps.sensingSummary || {};

        // Calculate distance for range checks
        const distance = this.#visionAnalyzer.distanceFeet(observer, target);

        // PRIORITY 1: Check for precise senses (visual or non-visual)
        const preciseResult = await this.#checkPreciseSenses(observer, target, visCaps, sensingSummary, distance);
        if (preciseResult.canDetect) {
            return preciseResult;
        }

        // PRIORITY 2: Fall back to imprecise senses
        const impreciseResult = await this.#checkImpreciseSenses(observer, target, visCaps, sensingSummary, distance);
        return impreciseResult;
    }

    /**
     * Check if observer has precise senses that can detect target
     * @private
     */
    async #checkPreciseSenses(observer, target, visCaps, sensingSummary, distance) {
        // Check visual precise senses first (highest priority)
        const hasLoS = this.#visionAnalyzer.hasLineOfSight?.(observer, target, true) ?? true;
        const hasVisualPrecise = !!(visCaps?.hasVision && !visCaps?.isBlinded && hasLoS);

        if (hasVisualPrecise) {
            const visualSense = this.#selectBestVisualSense(sensingSummary.precise || [], distance);
            if (visualSense) {
                return {
                    canDetect: true,
                    senseType: visualSense.type,
                    precision: 'precise',
                    range: visualSense.range,
                    outOfRange: false,
                };
            }
        }

        // Check non-visual precise senses
        const hasNonVisualPrecise = this.#visionAnalyzer.hasPreciseNonVisualInRange(observer, target);
        if (hasNonVisualPrecise && Array.isArray(sensingSummary.precise)) {
            for (const sense of sensingSummary.precise) {
                if (!sense || SeekDialogAdapter.isVisualSenseType(sense.type)) continue;

                const inRange = !Number.isFinite(sense.range) || sense.range >= distance;
                if (inRange) {
                    // Check creature type compatibility
                    const limitation = await this.checkSenseLimitations(target, sense.type);
                    if (!limitation.valid) {
                        return {
                            canDetect: false,
                            senseType: sense.type,
                            precision: 'precise',
                            unmetCondition: true,
                            reason: limitation.reason,
                            range: sense.range,
                        };
                    }

                    return {
                        canDetect: true,
                        senseType: sense.type,
                        precision: 'precise',
                        range: sense.range,
                        outOfRange: false,
                    };
                }
            }
        }

        return { canDetect: false, senseType: null, precision: null };
    }

    /**
     * Check if observer has imprecise senses that can detect target
     * @private
     */
    async #checkImpreciseSenses(observer, target, visCaps, sensingSummary, distance) {
        // Check hearing
        const hearing = sensingSummary.hearing;
        if (hearing && !visCaps.isDeafened) {
            const hearingRange = Number(hearing.range);
            const inRange = !Number.isFinite(hearingRange) || hearingRange >= distance;

            if (inRange) {
                return {
                    canDetect: true,
                    senseType: 'hearing',
                    precision: 'imprecise',
                    range: hearingRange,
                    outOfRange: false,
                };
            } else {
                return {
                    canDetect: false,
                    senseType: 'hearing',
                    precision: 'imprecise',
                    range: hearingRange,
                    outOfRange: true,
                    reason: `Out of hearing range (${distance}ft > ${hearingRange}ft)`,
                };
            }
        }

        // Check other imprecise senses
        if (Array.isArray(sensingSummary.imprecise)) {
            for (const sense of sensingSummary.imprecise) {
                if (!sense) continue;

                const senseRange = Number(sense.range);
                const inRange = !Number.isFinite(senseRange) || senseRange >= distance;

                if (inRange) {
                    // Check creature type compatibility
                    const limitation = await this.checkSenseLimitations(target, sense.type);
                    if (!limitation.valid) {
                        return {
                            canDetect: false,
                            senseType: sense.type,
                            precision: 'imprecise',
                            unmetCondition: true,
                            reason: limitation.reason,
                            range: senseRange,
                        };
                    }

                    return {
                        canDetect: true,
                        senseType: sense.type,
                        precision: 'imprecise',
                        range: senseRange,
                        outOfRange: false,
                    };
                } else {
                    return {
                        canDetect: false,
                        senseType: sense.type,
                        precision: 'imprecise',
                        range: senseRange,
                        outOfRange: true,
                        reason: `Out of ${sense.type} range (${distance}ft > ${senseRange}ft)`,
                    };
                }
            }
        }

        // No senses available
        return {
            canDetect: false,
            senseType: null,
            precision: null,
            unmetCondition: false,
            reason: 'No senses available to detect target',
        };
    }

    /**
     * Select the best visual sense from available options
     * Follows PF2e hierarchy: truesight > greater-darkvision > darkvision > low-light-vision > vision
     * @private
     */
    #selectBestVisualSense(preciseSenses, distance) {
        const visualSenses = preciseSenses.filter(s =>
            s && SeekDialogAdapter.isVisualSenseType(s.type)
        );

        // Add default vision if not present
        if (!visualSenses.some(s => s.type === 'vision')) {
            visualSenses.push({ type: 'vision', range: Infinity });
        }

        // Try each sense in priority order
        for (const preferredType of SeekDialogAdapter.VISUAL_SENSE_PRIORITY) {
            const match = visualSenses.find(s => {
                if (s.type.toLowerCase() !== preferredType) return false;
                const inRange = !Number.isFinite(s.range) || s.range >= distance;
                return inRange;
            });
            if (match) return match;
        }

        return null;
    }

    /**
     * Check if a special sense can detect a specific creature type
     * 
     * @param {Token} target - The target token
     * @param {string} senseType - Type of sense (lifesense, scent, etc.)
     * @returns {Promise<Object>} { valid: boolean, reason: string }
     */
    async checkSenseLimitations(target, senseType) {
        try {
            // Import constants dynamically to avoid circular dependencies
            const { SPECIAL_SENSES } = await import('../../constants.js');
            const senseConfig = SPECIAL_SENSES[senseType];

            if (!senseConfig) {
                return { valid: true }; // Unknown sense types pass by default
            }

            const actor = target?.actor;
            if (!actor) {
                return { valid: true };
            }

            const creatureType = actor.system?.details?.creatureType || actor.type;
            const traits = actor.system?.traits?.value || actor.system?.details?.traits?.value || [];

            // Check construct limitation
            if (!senseConfig.detectsConstructs) {
                const isConstruct = creatureType === 'construct' ||
                    traits.some(t => String(t).toLowerCase() === 'construct');

                if (isConstruct) {
                    const reason = senseType === 'lifesense'
                        ? 'Constructs have no life force or void energy to detect'
                        : `${senseType} cannot detect constructs`;
                    return { valid: false, reason };
                }
            }

            // Check undead limitation
            if (!senseConfig.detectsUndead) {
                const isUndead = creatureType === 'undead' ||
                    traits.some(t => String(t).toLowerCase() === 'undead');

                if (isUndead) {
                    return {
                        valid: false,
                        reason: `${senseType} cannot detect undead`
                    };
                }
            }

            return { valid: true };
        } catch (error) {
            console.warn('Error checking sense limitations:', error);
            return { valid: true }; // Fail open
        }
    }

    /**
     * Get all sense badges for display in seek dialog
     * @param {Token} observer
     * @returns {Array<{type: string, acuity: string, range: number}>}
     */
    getSenseBadges(observer) {
        const capabilities = this.#visionAnalyzer.getSensingCapabilities(observer);
        const badges = [];

        // Add precise senses from object
        for (const [senseType, range] of Object.entries(capabilities.precise)) {
            badges.push({
                type: senseType,
                acuity: 'precise',
                range,
            });
        }

        // Add imprecise senses from object
        for (const [senseType, range] of Object.entries(capabilities.imprecise)) {
            badges.push({
                type: senseType,
                acuity: 'imprecise',
                range,
            });
        }

        return badges;
    }

    /**
     * Get all senses formatted for preview dialog display
     * @param {Token} observer - The observing token
     * @param {object} options - Display options
     * @param {boolean} options.includeVision - Include basic vision sense
     * @param {boolean} options.includeHearing - Include hearing sense
     * @param {boolean} options.includeEcholocation - Include echolocation sense
     * @param {boolean} options.filterVisualIfBlinded - Remove visual senses if blinded
     * @param {string} options.usedSenseType - Sense type that was used (for marking)
     * @returns {Array<{type: string, range: number, isPrecise: boolean, config: object, displayRange: string, wasUsed: boolean}>}
     */
    async getAllSensesForDisplay(observer, options = {}) {
        const {
            includeVision = true,
            includeHearing = true,
            includeEcholocation = true,
            filterVisualIfBlinded = true,
            usedSenseType = null,
        } = options;

        const { SPECIAL_SENSES } = await import('../../constants.js');
        const capabilities = this.#visionAnalyzer.getSensingCapabilities(observer);
        const caps = this.#visionAnalyzer.getVisionCapabilities(observer);
        const allSenses = [];

        // First, add all precise senses
        for (const [senseType, range] of Object.entries(capabilities.precise)) {
            const senseConfig = SPECIAL_SENSES[senseType] || {
                label: `PF2E_VISIONER.SENSES.${senseType.toUpperCase()}`,
                icon: 'fas fa-eye',
                description: `PF2E_VISIONER.SENSES.${senseType.toUpperCase()}_DESC`,
            };
            allSenses.push({
                type: senseType,
                range,
                isPrecise: true,
                config: senseConfig,
                displayRange: range === Infinity ? '∞' : String(range),
                wasUsed: senseType === usedSenseType,
            });
        }

        if (includeVision && caps?.hasVision && !caps?.isBlinded) {
            if (!allSenses.some(s => s.type === 'vision')) {
                const senseConfig = SPECIAL_SENSES.vision || {
                    label: 'PF2E_VISIONER.SPECIAL_SENSES.vision',
                    icon: 'fas fa-eye',
                    description: 'PF2E_VISIONER.SPECIAL_SENSES.vision_description',
                };
                allSenses.push({
                    type: 'vision',
                    range: Infinity,
                    isPrecise: true,
                    config: senseConfig,
                    displayRange: '∞',
                    wasUsed: 'vision' === usedSenseType,
                });
            }
        }

        // Add imprecise senses ONLY if they don't already exist as precise
        for (const [senseType, range] of Object.entries(capabilities.imprecise)) {
            // Check if this sense type already exists in the precise list
            const existingPrecise = allSenses.find(s => s.type === senseType && s.isPrecise);
            if (!existingPrecise) {
                const senseConfig = SPECIAL_SENSES[senseType] || {
                    label: `PF2E_VISIONER.SENSES.${senseType.toUpperCase()}`,
                    icon: 'fas fa-wave-square',
                    description: `PF2E_VISIONER.SENSES.${senseType.toUpperCase()}_DESC`,
                };
                allSenses.push({
                    type: senseType,
                    range,
                    isPrecise: false,
                    config: senseConfig,
                    displayRange: range === Infinity ? '∞' : String(range),
                    wasUsed: senseType === usedSenseType,
                });
            }
        }

        const sensingSummary = caps?.sensingSummary || {};
        if (includeHearing && sensingSummary.hearing) {
            const existingHearing = allSenses.find(s => s.type === 'hearing');
            if (!existingHearing) {
                const hearingConfig = SPECIAL_SENSES.hearing || {
                    label: 'PF2E_VISIONER.SPECIAL_SENSES.hearing',
                    icon: 'fas fa-volume-up',
                    description: 'PF2E_VISIONER.SPECIAL_SENSES.hearing_description',
                };
                allSenses.push({
                    type: 'hearing',
                    range: sensingSummary.hearing.range,
                    isPrecise: sensingSummary.hearing.acuity === 'precise',
                    config: hearingConfig,
                    displayRange: sensingSummary.hearing.range === Infinity ? '∞' : String(sensingSummary.hearing.range),
                    wasUsed: 'hearing' === usedSenseType,
                });
            }
        }

        if (includeEcholocation && sensingSummary.echolocationActive) {
            const existingEcho = allSenses.find(s => s.type === 'echolocation');
            if (!existingEcho) {
                const echolocationConfig = SPECIAL_SENSES.echolocation || {
                    label: 'PF2E_VISIONER.SENSES.ECHOLOCATION',
                    icon: 'fas fa-broadcast-tower',
                    description: 'PF2E_VISIONER.SENSES.ECHOLOCATION_DESC',
                };
                allSenses.push({
                    type: 'echolocation',
                    range: sensingSummary.echolocationRange,
                    isPrecise: true,
                    config: echolocationConfig,
                    displayRange: String(sensingSummary.echolocationRange),
                    wasUsed: 'echolocation' === usedSenseType,
                });
            }
        }

        if (filterVisualIfBlinded && caps?.isBlinded) {
            const filteredSenses = allSenses.filter(s => !SeekDialogAdapter.isVisualSenseType(s.type));
            return this.#sortSensesForDisplay(filteredSenses);
        }

        return this.#sortSensesForDisplay(allSenses);
    }

    /**
     * Sort senses for display (precise first, then alphabetical)
     * @private
     */
    #sortSensesForDisplay(senses) {
        return senses.sort((a, b) => {
            if (a.isPrecise !== b.isPrecise) {
                return a.isPrecise ? -1 : 1;
            }
            const labelA = a.config?.label || a.type;
            const labelB = b.config?.label || b.type;
            return labelA.localeCompare(labelB);
        });
    }

    /**
     * Check if observer can attempt seek on target
     * @param {Token} observer
     * @param {Token} target
     * @returns {boolean}
     */
    canSeekTarget(observer, target) {
        const capabilities = this.#visionAnalyzer.getSensingCapabilities(observer);

        return Object.keys(capabilities.precise).length > 0 ||
            Object.keys(capabilities.imprecise).length > 0;
    }

    /**
     * Get available sense types for seek action
     * @param {Token} observer
     * @param {Token} target
     * @returns {Array<{type: string, canUse: boolean, reason?: string}>}
     */
    getAvailableSenseTypes(observer, target) {
        const capabilities = this.#visionAnalyzer.getSensingCapabilities(observer);
        const distance = this.#visionAnalyzer.distanceFeet(observer, target);
        const senseTypes = [];

        // Check precise senses from object
        for (const [senseType, range] of Object.entries(capabilities.precise)) {
            const canUse = distance <= range;
            senseTypes.push({
                type: senseType,
                acuity: 'precise',
                canUse,
                reason: canUse ? null : `Out of range (${distance}ft > ${range}ft)`,
            });
        }

        // Check imprecise senses from object
        for (const [senseType, range] of Object.entries(capabilities.imprecise)) {
            const canUse = distance <= range;
            senseTypes.push({
                type: senseType,
                acuity: 'imprecise',
                canUse,
                reason: canUse ? null : `Out of range (${distance}ft > ${range}ft)`,
            });
        }

        return senseTypes;
    }

    /**
     * Get recommended sense for seek action
     * @param {Token} observer
     * @param {Token} target
     * @returns {{type: string, acuity: string}|null}
     */
    getRecommendedSense(observer, target) {
        const available = this.getAvailableSenseTypes(observer, target);

        // Prefer precise senses
        const preciseSense = available.find(s => s.acuity === 'precise' && s.canUse);
        if (preciseSense) {
            return { type: preciseSense.type, acuity: 'precise' };
        }

        // Fall back to imprecise
        const impreciseSense = available.find(s => s.acuity === 'imprecise' && s.canUse);
        if (impreciseSense) {
            return { type: impreciseSense.type, acuity: 'imprecise' };
        }

        return null;
    }

    /**
     * Format sense for display
     * @param {string} type
     * @param {string} acuity
     * @param {number} range
     * @returns {string}
     */
    formatSenseDisplay(type, acuity, range) {
        const typeDisplay = type.replace(/-/g, ' ')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');

        const rangeDisplay = range === Infinity ? '∞' : `${range}ft`;
        const acuityDisplay = acuity.charAt(0).toUpperCase() + acuity.slice(1);

        return `${typeDisplay} (${acuityDisplay}, ${rangeDisplay})`;
    }
}
