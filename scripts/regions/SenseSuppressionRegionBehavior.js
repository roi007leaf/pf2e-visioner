import { MODULE_ID, SPECIAL_SENSES } from '../constants.js';

const RegionBehaviorBase =
    typeof foundry !== 'undefined' &&
        foundry.data &&
        foundry.data.regionBehaviors &&
        foundry.data.regionBehaviors.RegionBehaviorType
        ? foundry.data.regionBehaviors.RegionBehaviorType
        : class { };

const BEHAVIOR_TYPE = `${MODULE_ID}.Pf2eVisionerSenseSuppression`;

const SENSE_KEY_VARIANTS = {
    'greater-darkvision': ['greater-darkvision', 'greaterDarkvision'],
    'low-light-vision': ['low-light-vision', 'lowLightVision'],
    'see-invisibility': ['see-invisibility', 'seeInvisibility'],
    'motion-sense': ['motion-sense', 'motionSense'],
    'infrared-vision': ['infrared-vision', 'infraredVision'],
    'light-perception': ['light-perception', 'lightPerception'],
};

export class SenseSuppressionRegionBehavior extends RegionBehaviorBase {
    static LOCALIZATION_PREFIXES = ['PF2E_VISIONER.REGION_BEHAVIOR'];

    static get label() {
        return 'PF2e Visioner Sense Suppression';
    }

    static defineSchema() {
        const fields = foundry.data.fields;

        return {
            events: this._createEventsField({
                events: [],
            }),

            enabled: new fields.BooleanField({
                required: false,
                initial: true,
                label: 'PF2E_VISIONER.REGION_BEHAVIOR.SENSE_SUPPRESSION_ENABLED.label',
                hint: 'PF2E_VISIONER.REGION_BEHAVIOR.SENSE_SUPPRESSION_ENABLED.hint',
            }),

            senses: new fields.SetField(
                new fields.StringField({
                    choices: Object.fromEntries(
                        Object.keys(SPECIAL_SENSES).map(key => [key, SPECIAL_SENSES[key].label])
                    ),
                }),
                {
                    required: false,
                    initial: [],
                    label: 'PF2E_VISIONER.REGION_BEHAVIOR.SENSE_SUPPRESSION_SENSES.label',
                    hint: 'PF2E_VISIONER.REGION_BEHAVIOR.SENSE_SUPPRESSION_SENSES.hint',
                },
            ),

            affectsObserver: new fields.BooleanField({
                required: false,
                initial: true,
                label: 'PF2E_VISIONER.REGION_BEHAVIOR.SENSE_SUPPRESSION_AFFECTS_OBSERVER.label',
                hint: 'PF2E_VISIONER.REGION_BEHAVIOR.SENSE_SUPPRESSION_AFFECTS_OBSERVER.hint',
            }),

            affectsTarget: new fields.BooleanField({
                required: false,
                initial: false,
                label: 'PF2E_VISIONER.REGION_BEHAVIOR.SENSE_SUPPRESSION_AFFECTS_TARGET.label',
                hint: 'PF2E_VISIONER.REGION_BEHAVIOR.SENSE_SUPPRESSION_AFFECTS_TARGET.hint',
            }),
        };
    }

    async _handleRegionEvent(event) {
    }

    static getAllSenseSuppressionRegions() {
        if (typeof canvas === 'undefined' || !canvas.scene?.regions) {
            return [];
        }

        const results = [];
        for (const region of canvas.scene.regions) {
            const behaviorsCollection = region.behaviors || region?.document?.behaviors;
            if (!behaviorsCollection) continue;

            for (const behavior of behaviorsCollection) {
                if (behavior.type !== BEHAVIOR_TYPE) continue;
                const isEnabled = behavior.enabled !== false && behavior.disabled !== true;
                if (!isEnabled) continue;

                const senses = behavior.system?.senses || behavior.senses;
                if (!senses || senses.size === 0) continue;

                results.push({ region, behavior });
            }
        }

        return results;
    }

    static getSuppressedSensesForObserver(position) {
        return SenseSuppressionRegionBehavior.#getSuppressedSenses(position, 'affectsObserver');
    }

    static getSuppressedSensesForTarget(position) {
        return SenseSuppressionRegionBehavior.#getSuppressedSenses(position, 'affectsTarget');
    }

    static #getSuppressedSenses(position, field) {
        const suppressed = new Set();
        if (!position) return suppressed;

        const plainPos = { x: position.x, y: position.y, elevation: position.elevation || 0 };
        const regions = SenseSuppressionRegionBehavior.getAllSenseSuppressionRegions();

        for (const { region, behavior } of regions) {
            const affectsFlag = behavior.system?.[field] ?? behavior[field];
            if (!affectsFlag) continue;

            const isInside = region.testPoint(plainPos, plainPos.elevation);
            if (!isInside) continue;

            const senses = behavior.system?.senses || behavior.senses;
            for (const sense of senses) {
                suppressed.add(sense);
            }
        }

        return suppressed;
    }

    static getKeyVariantsForSense(senseKey) {
        return SENSE_KEY_VARIANTS[senseKey] || [senseKey];
    }

    static deleteSenseFromCapabilities(precise, imprecise, senseKey) {
        const variants = SenseSuppressionRegionBehavior.getKeyVariantsForSense(senseKey);
        for (const variant of variants) {
            delete precise[variant];
            delete imprecise[variant];
        }
    }

    static applySenseSuppression(precise, imprecise, observerPosition, targetPosition) {
        const observerSuppressed = SenseSuppressionRegionBehavior.getSuppressedSensesForObserver(observerPosition);
        const targetSuppressed = SenseSuppressionRegionBehavior.getSuppressedSensesForTarget(targetPosition);

        for (const sense of observerSuppressed) {
            SenseSuppressionRegionBehavior.deleteSenseFromCapabilities(precise, imprecise, sense);
        }
        for (const sense of targetSuppressed) {
            SenseSuppressionRegionBehavior.deleteSenseFromCapabilities(precise, imprecise, sense);
        }
    }
}
