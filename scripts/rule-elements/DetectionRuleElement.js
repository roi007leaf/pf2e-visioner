import { createBaseVisionerRuleElement } from './BaseVisionerRuleElement.js';

export function createDetectionRuleElement(baseRuleElementClass, fields) {
    if (!baseRuleElementClass || !fields) {
        console.error('PF2E Visioner | Missing dependencies for DetectionRuleElement creation');
        return null;
    }

    const BaseVisionerRuleElement = createBaseVisionerRuleElement(baseRuleElementClass, fields);
    if (!BaseVisionerRuleElement) return null;

    return class DetectionRuleElement extends BaseVisionerRuleElement {
        static SENSE_TYPES = {
            DARKVISION: 'darkvision',
            LOW_LIGHT_VISION: 'low-light-vision',
            GREATER_DARKVISION: 'greater-darkvision',
            TREMORSENSE: 'tremorsense',
            SCENT: 'scent',
            LIFESENSE: 'lifesense',
            ECHOLOCATION: 'echolocation',
            THOUGHTSENSE: 'thoughtsense',
            WAVESENSE: 'wavesense',
        };

        static ACUITY_TYPES = {
            PRECISE: 'precise',
            IMPRECISE: 'imprecise',
            VAGUE: 'vague',
        };

        static get name() {
            return 'PF2eVisionerDetection';
        }

        static get documentation() {
            return 'https://github.com/roi007leaf/pf2e-visioner/wiki/Rule-Elements#detection-rule-element';
        }

        static get description() {
            return 'Grant or modify detection senses programmatically';
        }

        static get defaultKey() {
            return 'PF2eVisionerDetection';
        }

        static defineSchema() {
            const schema = super.defineSchema();

            schema.sense = new fields.StringField({
                required: true,
                choices: Object.values(DetectionRuleElement.SENSE_TYPES),
                initial: 'darkvision',
                label: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.LABELS.SENSE'),
                hint: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.HINTS.SENSE'),
            });

            schema.senseRange = new fields.NumberField({
                required: false,
                initial: 60,
                label: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.LABELS.SENSE_RANGE'),
                hint: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.HINTS.SENSE_RANGE'),
            });

            schema.acuity = new fields.StringField({
                required: false,
                choices: Object.values(DetectionRuleElement.ACUITY_TYPES),
                initial: 'precise',
                label: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.LABELS.ACUITY'),
                hint: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.HINTS.ACUITY'),
            });

            schema.modifyExisting = new fields.BooleanField({
                required: false,
                initial: false,
                label: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.LABELS.MODIFY_EXISTING'),
                hint: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.HINTS.MODIFY_EXISTING'),
            });

            return schema;
        }

        onCreate(actorUpdates) {
            this.applyDetectionChange();
        }

        onDelete(actorUpdates) {
            this.removeDetectionChange();
        }

        async applyDetectionChange() {
            if (!this.shouldApply()) return;

            const rollOptions = this.getRollOptions();
            if (!this.testPredicate(rollOptions)) return;

            const tokens = this.getTokensForSubject();
            if (tokens.length === 0) return;

            for (const token of tokens) {
                const actor = token.actor;
                if (!actor) continue;

                const senseData = {
                    type: this.sense,
                    range: this.senseRange,
                    acuity: this.acuity,
                    source: `Rule Element: ${this.parent.name}`,
                };

                await this.addOrModifySense(actor, senseData);
            }

            const api = window.PF2EVisioner?.api;
            if (api?.autoVisibilitySystem) {
                await api.autoVisibilitySystem.refresh();
            }
        }

        async removeDetectionChange() {
            const tokens = this.getTokensForSubject();
            if (tokens.length === 0) return;

            for (const token of tokens) {
                const actor = token.actor;
                if (!actor) continue;

                await this.removeSense(actor, this.sense);
            }

            const api = window.PF2EVisioner?.api;
            if (api?.autoVisibilitySystem) {
                await api.autoVisibilitySystem.refresh();
            }
        }

        async addOrModifySense(actor, senseData) {
            const existingSenses = actor.system?.traits?.senses || [];
            const existingIndex = existingSenses.findIndex((s) => s.type === senseData.type);

            if (existingIndex !== -1 && this.modifyExisting) {
                const updatedSenses = [...existingSenses];
                updatedSenses[existingIndex] = {
                    ...updatedSenses[existingIndex],
                    range: Math.max(updatedSenses[existingIndex].range || 0, senseData.range),
                    acuity: senseData.acuity,
                };

                await actor.update({
                    'system.traits.senses': updatedSenses,
                });
            } else if (existingIndex === -1) {
                const updatedSenses = [...existingSenses, senseData];
                await actor.update({
                    'system.traits.senses': updatedSenses,
                });
            }
        }

        async removeSense(actor, senseType) {
            const existingSenses = actor.system?.traits?.senses || [];
            const filtered = existingSenses.filter((s) => s.type !== senseType);

            if (filtered.length !== existingSenses.length) {
                await actor.update({
                    'system.traits.senses': filtered,
                });
            }
        }

        beforeRoll(domains, rollOptions) {
            const tokens = this.getTokensForSubject();

            for (const token of tokens) {
                rollOptions.add(`sense:${this.sense}`);
                rollOptions.add(`sense:${this.sense}:${this.acuity}`);
                rollOptions.add(`sense:${this.sense}:range:${this.senseRange}`);
                rollOptions.add(`sense:rule-element:${this.sense}`);
            }
        }
    };
}
