import { createBaseVisionerRuleElement } from './BaseVisionerRuleElement.js';

const recentChanges = new Map();

export function createCoverRuleElement(baseRuleElementClass, fields) {
    if (!baseRuleElementClass || !fields) {
        console.error('PF2E Visioner | Missing dependencies for CoverRuleElement creation');
        return null;
    }

    const BaseVisionerRuleElement = createBaseVisionerRuleElement(baseRuleElementClass, fields);
    if (!BaseVisionerRuleElement) return null;

    return class CoverRuleElement extends BaseVisionerRuleElement {
        static COVER_LEVELS = {
            NONE: 'none',
            LESSER: 'lesser',
            STANDARD: 'standard',
            GREATER: 'greater',
        };

        static get name() {
            return 'PF2eVisionerCover';
        }

        static get documentation() {
            return 'https://github.com/roi007leaf/pf2e-visioner/wiki/Rule-Elements#cover-rule-element';
        }

        static get description() {
            return 'Control cover states between tokens programmatically';
        }

        static get defaultKey() {
            return 'PF2eVisionerCover';
        }

        static defineSchema() {
            const schema = super.defineSchema();

            schema.coverLevel = new fields.StringField({
                required: true,
                choices: Object.values(CoverRuleElement.COVER_LEVELS),
                initial: 'standard',
                label: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.LABELS.COVER_LEVEL'),
                hint: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.HINTS.COVER_LEVEL'),
            });

            schema.applyBonuses = new fields.BooleanField({
                required: false,
                initial: true,
                label: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.LABELS.APPLY_BONUSES'),
                hint: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.HINTS.APPLY_BONUSES'),
            });

            schema.allowHide = new fields.BooleanField({
                required: false,
                initial: true,
                label: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.LABELS.ALLOW_HIDE'),
                hint: game.i18n.localize('PF2E_VISIONER.RULE_ELEMENTS.HINTS.ALLOW_HIDE'),
            });

            return schema;
        }

        onCreate(actorUpdates) {
            this.applyCoverChange();
        }

        onDelete(actorUpdates) {
            this.resetCover();
        }

        beforeRoll(domains, rollOptions) {
            if (domains.includes('attack-roll')) {
                this.addRollOptions(rollOptions);
            }
        }

        afterRoll({ roll, domains }) {
            if (domains.includes('attack-roll')) {
                this.applyCoverChange();
            }
        }

        onUpdateEncounter({ event }) {
            if (event === 'turn-start') {
                this.applyCoverChange();
            }
        }

        async applyCoverChange() {
            const api = window.PF2EVisioner?.api;
            if (!api || !this.shouldApply()) return;

            const rollOptions = this.getRollOptions();
            if (!this.testPredicate(rollOptions)) return;

            const pairs = this.generateTokenPairs();
            if (pairs.length === 0) return;

            const updates = [];

            for (const pair of pairs) {
                const { observer, subject } = pair;

                const currentCover = api.getCover?.(observer.id, subject.id) || 'none';
                const newCover = this.calculateNewCover(currentCover);

                if (currentCover === newCover) continue;

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
                    coverLevel: newCover,
                });
            }

            if (updates.length === 0) return;

            const options = {
                applyBonuses: this.applyBonuses,
                allowHide: this.allowHide,
                source: 'rule-element',
            };

            if (api.bulkSetCover) {
                await api.bulkSetCover(updates, options);
            } else if (api.setCover) {
                for (const update of updates) {
                    await api.setCover(update.observerId, update.subjectId, update.coverLevel, options);
                }
            }
        }

        calculateNewCover(currentCover) {
            const levels = ['none', 'lesser', 'standard', 'greater'];
            const currentIndex = levels.indexOf(currentCover);

            switch (this.mode) {
                case 'set':
                    return this.coverLevel;

                case 'increase': {
                    const steps = Math.min(this.steps || 1, levels.length - 1);
                    return levels[Math.min(currentIndex + steps, levels.length - 1)];
                }

                case 'decrease': {
                    const steps = Math.min(this.steps || 1, levels.length - 1);
                    return levels[Math.max(currentIndex - steps, 0)];
                }

                case 'remove':
                    return 'none';

                case 'toggle':
                    return currentCover === 'none' ? this.coverLevel : 'none';

                default:
                    return currentCover;
            }
        }

        async resetCover() {
            const api = window.PF2EVisioner?.api;
            if (!api) return;

            const pairs = this.generateTokenPairs();
            if (pairs.length === 0) return;

            const updates = pairs.map((pair) => ({
                observerId: pair.observer.id,
                subjectId: pair.subject.id,
                coverLevel: 'none',
            }));

            const options = {
                source: 'rule-element-cleanup',
            };

            if (api.bulkSetCover) {
                await api.bulkSetCover(updates, options);
            } else if (api.setCover) {
                for (const update of updates) {
                    await api.setCover(update.observerId, update.subjectId, update.coverLevel, options);
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
                const currentCover = api.getCover?.(observer.id, subject.id);

                if (!currentCover) continue;

                rollOptions.add(`cover:${currentCover}`);
                rollOptions.add(`cover:rule-element:${currentCover}`);

                if (this.applyBonuses) {
                    rollOptions.add(`cover:bonuses-active`);
                }

                if (this.allowHide) {
                    rollOptions.add(`cover:can-hide`);
                }
            }
        }
    };
}
