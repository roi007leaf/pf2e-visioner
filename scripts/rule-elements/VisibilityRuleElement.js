import { createBaseVisionerRuleElement } from './BaseVisionerRuleElement.js';

const recentChanges = new Map();

export function createVisibilityRuleElement(baseRuleElementClass, fields) {
    if (!baseRuleElementClass || !fields) {
        console.error('PF2E Visioner | Missing dependencies for VisibilityRuleElement creation');
        return null;
    }

    const BaseVisionerRuleElement = createBaseVisionerRuleElement(baseRuleElementClass, fields);
    if (!BaseVisionerRuleElement) return null;

    return class VisibilityRuleElement extends BaseVisionerRuleElement {
        static VISIBILITY_STATES = {
            OBSERVED: 'observed',
            CONCEALED: 'concealed',
            HIDDEN: 'hidden',
            UNDETECTED: 'undetected',
        };

        static get name() {
            return 'PF2eVisionerVisibility';
        }

        static get documentation() {
            return 'https://github.com/roi007leaf/pf2e-visioner/wiki/Rule-Elements#visibility-rule-element';
        }

        static get description() {
            return 'Control visibility states between tokens programmatically';
        }

        static get defaultKey() {
            return 'PF2eVisionerVisibility';
        }

        static defineSchema() {
            const schema = super.defineSchema();

            schema.status = new fields.StringField({
                required: true,
                choices: Object.values(VisibilityRuleElement.VISIBILITY_STATES),
                initial: 'hidden',
                label: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.LABELS.STATUS'),
                hint: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.HINTS.STATUS'),
            });

            schema.steps = new fields.NumberField({
                required: false,
                initial: 1,
                label: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.LABELS.STEPS'),
                hint: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.HINTS.STEPS'),
            });

            schema.qualifyConcealment = new fields.BooleanField({
                required: false,
                nullable: true,
                initial: null,
                label: 'Qualify Concealment',
                hint: 'Override concealment for Hide/Sneak: true = qualify when observed (obscuring mist), false = disqualify when concealed (blur), null = normal rules',
            });

            return schema;
        }

        onCreate(actorUpdates) {
            this.applyVisibilityChange();
        }

        onDelete(actorUpdates) {
            this.resetVisibility();
        }

        beforeRoll(domains, rollOptions) {
            if (domains.includes('attack-roll')) {
                this.addRollOptions(rollOptions);
            }
        }

        afterRoll({ roll, domains }) {
            if (domains.includes('attack-roll')) {
                this.applyVisibilityChange();
            }
        }

        onUpdateEncounter({ event }) {
            if (event === 'turn-start') {
                this.applyVisibilityChange();
            }
        }

        async applyVisibilityChange() {
            const api = window.PF2EVisioner?.api;
            if (!api || !this.shouldApply()) return;

            const rollOptions = this.getRollOptions();
            if (!this.testPredicate(rollOptions)) return;

            const pairs = this.generateTokenPairs();
            if (pairs.length === 0) return;

            const updates = [];

            for (const pair of pairs) {
                const { observer, subject } = pair;

                const currentVisibility = api.getVisibility?.(observer.id, subject.id) || 'observed';
                const newVisibility = this.calculateNewVisibility(currentVisibility);

                if (currentVisibility === newVisibility) continue;

                const key = `${observer.id}-${subject.id}`;
                const now = game.time.worldTime;
                const lastChange = recentChanges.get(key);

                if (lastChange && now - lastChange < 1) {
                    continue;
                }

                recentChanges.set(key, now);

                updates.push({
                    observerId: observer.id,
                    subjectId: subject.id,
                    visibility: newVisibility,
                });
            }

            if (updates.length === 0) return;

            const options = {
                effectTarget: this.effectTarget,
                direction: this.direction,
                source: 'rule-element',
            };

            if (this.mode === 'remove') {
                options.removeAllEffects = true;
            }

            if (api.bulkSetVisibility) {
                await api.bulkSetVisibility(updates, options);
            } else if (api.setVisibility) {
                for (const update of updates) {
                    await api.setVisibility(
                        update.observerId,
                        update.subjectId,
                        update.visibility,
                        options,
                    );
                }
            }
        }

        calculateNewVisibility(currentVisibility) {
            const states = ['observed', 'concealed', 'hidden', 'undetected'];
            const currentIndex = states.indexOf(currentVisibility);
            const steps = Math.min(this.steps || 1, states.length - 1);

            switch (this.mode) {
                case 'set':
                    return this.status;

                case 'increase':
                    return states[Math.min(currentIndex + steps, states.length - 1)];

                case 'decrease':
                    return states[Math.max(currentIndex - steps, 0)];

                case 'remove':
                    return 'observed';

                case 'toggle':
                    return currentVisibility === 'observed' ? this.status : 'observed';

                default:
                    return currentVisibility;
            }
        }

        async resetVisibility() {
            const api = window.PF2EVisioner?.api;
            if (!api) return;

            const pairs = this.generateTokenPairs();
            if (pairs.length === 0) return;

            const updates = pairs.map((pair) => ({
                observerId: pair.observer.id,
                subjectId: pair.subject.id,
                visibility: 'observed',
            }));

            const options = {
                effectTarget: this.effectTarget,
                direction: this.direction,
                source: 'rule-element-cleanup',
                removeAllEffects: true,
            };

            if (api.bulkSetVisibility) {
                await api.bulkSetVisibility(updates, options);
            } else if (api.setVisibility) {
                for (const update of updates) {
                    await api.setVisibility(
                        update.observerId,
                        update.subjectId,
                        update.visibility,
                        options,
                    );
                }
            }
        }

        addRollOptions(rollOptions) {
            const api = window.PF2EVisioner?.api;
            if (!api) return;

            if (!this.testPredicate(rollOptions)) return;

            const pairs = this.generateTokenPairs();

            for (const pair of pairs) {
                const { observer, subject } = pair;
                const currentVisibility = api.getVisibility?.(observer.id, subject.id);

                if (!currentVisibility) continue;

                rollOptions.add(`visibility:${currentVisibility}`);
                rollOptions.add(`visibility:direction:${this.direction}`);
                rollOptions.add(`visibility:rule-element:${currentVisibility}`);

                if (this.areAllies(subject.actor, observer.actor)) {
                    rollOptions.add(`visibility:ally:${currentVisibility}`);
                } else {
                    rollOptions.add(`visibility:enemy:${currentVisibility}`);
                }

                // Add qualifyConcealment roll options
                if (this.qualifyConcealment === true) {
                    rollOptions.add('visibility:qualify-concealment');
                    rollOptions.add('visioner:qualify-concealment');
                    rollOptions.add('visioner:concealment-qualified');
                } else if (this.qualifyConcealment === false) {
                    rollOptions.add('visibility:disqualify-concealment');
                    rollOptions.add('visioner:disqualify-concealment');
                    rollOptions.add('visioner:concealment-disqualified');
                }
            }
        }
    };
}
