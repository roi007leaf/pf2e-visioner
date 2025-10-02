/**
 * SensingCapabilitiesBuilder
 * 
 * Minimal data builder that categorizes senses into precise and imprecise objects.
 * 
 * Responsibilities:
 * - Parse senses from various formats (array, object, detection modes)
 * - Normalize sense data into consistent structure
 * - Categorize into precise/imprecise objects keyed by sense type
 * 
 * Does NOT:
 * - Interpret special senses (hearing, lifesense, echolocation) - that's VisionAnalyzer's job
 * - Answer queries about capabilities
 * - Handle line of sight or distance checks
 * - Make decisions about visibility states
 */

const PRECISE = 'precise';
const IMPRECISE = 'imprecise';

// Normalize sense type names to canonical forms
const SENSE_TYPE_ALIASES = {
    'light-perception': 'vision',
    'lightperception': 'vision',

    'lowlightvision': 'low-light-vision',
    'low-light': 'low-light-vision',

    'darkvision': 'darkvision',
    'dark-vision': 'darkvision',

    'greater-darkvision': 'greater-darkvision',
    'greaterdarkvision': 'greater-darkvision',

    'vision': 'vision',
    'sight': 'vision',
    'basicsight': 'vision',
    'basic-sight': 'vision',

    'tremorsense': 'tremorsense',
    'feeltremor': 'tremorsense',
    'feel-tremor': 'tremorsense',

    'scent': 'scent',
    'smell': 'scent',

    'lifesense': 'lifesense',
    'life-sense': 'lifesense',

    'hearing': 'hearing',

    'see-invisibility': 'see-invisibility',
    'seeinvisibility': 'see-invisibility',

    'see-all': 'see-all',
    'seeall': 'see-all',

    'sense-all': 'sense-all',
    'senseall': 'sense-all',

    'echolocation': 'echolocation',
    'echo-location': 'echolocation',
};

export class SensingCapabilitiesBuilder {
    /**
     * Build sensing capabilities from token/actor data
     * @param {Object} options
     * @param {Array|Object} options.senses - Traditional senses from actor.system.perception.senses
     * @param {Object} options.detectionModes - Detection modes object
     * @returns {SensingCapabilities}
     */
    static build({ senses, detectionModes }) {
        const capabilities = {
            precise: {},   // { senseType: range }
            imprecise: {}, // { senseType: range }
        };

        // Process detection modes first (vision, darkvision, etc.)
        if (detectionModes && typeof detectionModes === 'object') {
            this.#processDetectionModes(capabilities, detectionModes);
        }

        // Process traditional senses (can override detection modes)
        if (senses) {
            this.#processSenses(capabilities, senses);
        }

        return capabilities;
    }

    /**
     * Process detection modes into capabilities
     * @private
     */
    static #processDetectionModes(capabilities, detectionModes) {
        const modeMapping = {
            lightPerception: { type: 'vision', acuity: PRECISE },
            basicSight: { type: 'vision', acuity: PRECISE },
            seeInvisibility: { type: 'see-invisibility', acuity: PRECISE },
            senseInvisibility: { type: 'sense-invisibility', acuity: PRECISE },
            feelTremor: { type: 'tremorsense', acuity: IMPRECISE },
            seeAll: { type: 'see-all', acuity: PRECISE },
            senseAll: { type: 'sense-all', acuity: PRECISE },
            hearing: { type: 'hearing', acuity: IMPRECISE },
        };

        for (const [modeId, modeData] of Object.entries(detectionModes)) {
            if (!modeData?.enabled || modeData.range <= 0) continue;

            const mapping = modeMapping[modeId];
            const type = mapping?.type || modeId;
            const acuity = modeData.acuity?.trim?.() || mapping?.acuity || IMPRECISE;

            this.#addSense(capabilities, {
                type,
                acuity,
                range: modeData.range,
            });
        }
    }

    /**
     * Process traditional senses (array or object format)
     * @private
     */
    static #processSenses(capabilities, senses) {
        if (Array.isArray(senses)) {
            // NPC format: array of sense objects
            for (const sense of senses) {
                const type = sense?.type ?? sense?.slug ?? sense?.name ?? sense?.label ?? sense?.id;
                if (!type) continue;

                const acuity = sense?.acuity ?? sense?.value?.acuity ?? IMPRECISE;
                const range = sense?.range ?? sense?.value?.range ?? Infinity;

                this.#addSense(capabilities, {
                    type,
                    acuity,
                    range,
                    allowOverride: true,
                });
            }
        } else if (typeof senses === 'object') {
            // PC format: object with sense keys
            for (const [type, senseData] of Object.entries(senses)) {
                const acuity = senseData?.acuity ?? senseData?.value ?? IMPRECISE;
                const range = senseData?.range ?? Infinity;

                this.#addSense(capabilities, {
                    type,
                    acuity,
                    range,
                    allowOverride: true,
                });
            }
        }
    }

    /**
     * Add a sense to capabilities - just categorizes into precise/imprecise objects
     * @private
     */
    static #addSense(capabilities, {
        type,
        acuity = IMPRECISE,
        range,
        allowOverride = false,
    }) {
        if (!type) return;

        const rawType = String(type).toLowerCase().trim();
        const senseType = SENSE_TYPE_ALIASES[rawType] || rawType;
        const normalizedRange = this.#normalizeRange(range);
        const normalizedAcuity = String(acuity || IMPRECISE).toLowerCase().trim();

        // Handle override: remove from both categories if it exists
        if (allowOverride) {
            delete capabilities.precise[senseType];
            delete capabilities.imprecise[senseType];
        }

        // If this sense already exists in the precise category, don't add it to imprecise
        if (capabilities.precise[senseType] !== undefined) {
            // If new range is better (longer) and acuity is the same or better, upgrade
            if (normalizedAcuity === PRECISE && normalizedRange > capabilities.precise[senseType]) {
                capabilities.precise[senseType] = normalizedRange;
            }
            return;
        }

        // If adding as precise and it exists as imprecise, upgrade it
        if (normalizedAcuity === PRECISE && capabilities.imprecise[senseType] !== undefined) {
            delete capabilities.imprecise[senseType];
            capabilities.precise[senseType] = normalizedRange;
            return;
        }

        // Check if already exists with same range in imprecise (skip if not override)
        if (!allowOverride && capabilities.imprecise[senseType] === normalizedRange) {
            return;
        }

        // Add to appropriate category
        if (normalizedAcuity === PRECISE) {
            capabilities.precise[senseType] = normalizedRange;
        } else {
            capabilities.imprecise[senseType] = normalizedRange;
        }
    }

    /**
     * Normalize range value to a number
     * @private
     */
    static #normalizeRange(raw) {
        const parsed = Number(raw);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : Infinity;
    }
}

/**
 * @typedef {Object} SensingCapabilities
 * @property {Object<string, number>} precise - Precise senses { senseType: range }
 * @property {Object<string, number>} imprecise - Imprecise senses { senseType: range }
 */
