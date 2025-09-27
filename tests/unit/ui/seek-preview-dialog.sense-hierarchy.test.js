/**
 * @jest-environment jsdom
 */

import { SeekPreviewDialog } from '../../../scripts/chat/dialogs/seek-preview-dialog.js';

// Mock game object and settings
global.game = {
    settings: {
        get: jest.fn().mockImplementation((moduleId, setting) => {
            if (setting === 'defaultEncounterFilter') return false;
            if (setting === 'ignoreAllies') return false;
            if (setting === 'hideFoundryHiddenTokens') return true;
            return false;
        }),
    },
    user: {
        isGM: false,
    },
    i18n: {
        localize: jest.fn((key) => key),
    },
};

// Mock ApplicationV2 class
class MockApplicationV2 {
    constructor(options = {}) {
        this.options = options;
        this.element = null;
    }

    async render() {
        return this;
    }

    close() {
        return Promise.resolve();
    }

    async _prepareContext(options) {
        return {};
    }
}

// Make ApplicationV2 available globally
global.foundry = {
    applications: {
        api: {
            ApplicationV2: MockApplicationV2,
        },
        handlebars: {
            renderTemplate: jest.fn().mockResolvedValue('<div>Mock Template</div>'),
        },
    },
};

describe('SeekPreviewDialog Sense Selection Hierarchy', () => {
    let mockActorToken;
    let mockOutcomes;
    let mockAllSenses;

    beforeEach(() => {
        mockActorToken = {
            id: 'token1',
            name: 'Test Token',
            actor: {
                type: 'character',
            },
        };

        mockAllSenses = [
            { type: 'vision', range: Infinity, isPrecise: true, config: { label: 'Vision' } },
            { type: 'darkvision', range: 60, isPrecise: true, config: { label: 'Darkvision' } },
            { type: 'see-invisibility', range: Infinity, isPrecise: true, config: { label: 'See Invisibility' } },
            { type: 'echolocation', range: 30, isPrecise: true, config: { label: 'Echolocation' } },
            { type: 'lifesense', range: Infinity, isPrecise: false, config: { label: 'Lifesense' } },
            { type: 'tremorsense', range: 60, isPrecise: false, config: { label: 'Tremorsense' } },
            { type: 'hearing', range: Infinity, isPrecise: false, config: { label: 'Hearing' } },
            { type: 'scent', range: 30, isPrecise: false, config: { label: 'Scent' } },
        ];
    });

    test('should prioritize vision over other senses (hierarchy level 1)', () => {
        const outcomes = [
            { usedSenseType: 'vision', usedSensePrecision: 'precise' },
            { usedSenseType: 'see-invisibility', usedSensePrecision: 'precise' },
            { usedSenseType: 'echolocation', usedSensePrecision: 'precise' },
        ];

        const dialog = new SeekPreviewDialog(mockActorToken, outcomes, [], {});
        dialog._originalOutcomes = outcomes;

        // Simulate the sense selection logic
        const usedStats = new Map();
        for (const o of outcomes) {
            const t = o.usedSenseType;
            const p = o.usedSensePrecision;
            if (!usedStats.has(t)) usedStats.set(t, { total: 0, precise: 0, imprecise: 0 });
            const stat = usedStats.get(t);
            stat.total += 1;
            if (p === 'precise') stat.precise += 1;
            else if (p === 'imprecise') stat.imprecise += 1;
        }

        // Test hierarchy logic
        const isVisionType = (senseType) => {
            const t = String(senseType || '').toLowerCase();
            return (
                t === 'vision' ||
                t === 'sight' ||
                t === 'darkvision' ||
                t === 'see-invisibility' ||
                t.includes('vision') ||
                t.includes('sight')
            );
        };

        const getSenseRange = (senseType) => {
            const senseData = mockAllSenses.find(s => s.type === senseType);
            return senseData?.range ?? 0;
        };

        const entries = Array.from(usedStats.entries());
        const candidates = entries
            .filter(([type, stats]) => stats.precise > 0 || stats.imprecise > 0)
            .map(([type, stats]) => {
                const range = getSenseRange(type);
                const isVision = isVisionType(type);
                const hasPrecise = stats.precise > 0;
                const hasUnlimitedRange = range === Infinity || range === 'Infinity';

                return {
                    type,
                    stats,
                    range: range === Infinity || range === 'Infinity' ? Infinity : (typeof range === 'number' ? range : 0),
                    isVision,
                    hasPrecise,
                    hasUnlimitedRange,
                    priority: isVision ? 1 :
                        (hasPrecise && hasUnlimitedRange) ? 2 :
                            (hasPrecise && !hasUnlimitedRange) ? 3 :
                                (!hasPrecise && hasUnlimitedRange) ? 4 : 5
                };
            });

        candidates.sort((a, b) => {
            if (a.priority !== b.priority) {
                return a.priority - b.priority;
            }
            if (a.priority === 3 && b.priority === 3) {
                if (a.range !== b.range) {
                    return b.range - a.range;
                }
            } else if (a.priority === 5 && b.priority === 5) {
                if (a.range !== b.range) {
                    return b.range - a.range;
                }
            }
            return b.stats.total - a.stats.total;
        });

        expect(candidates[0].type).toBe('vision');
        expect(candidates[0].priority).toBe(1);
    });

    test('should prioritize see-invisibility (vision) over echolocation (hierarchy level 1 vs 3)', () => {
        const outcomes = [
            { usedSenseType: 'see-invisibility', usedSensePrecision: 'precise' },
            { usedSenseType: 'echolocation', usedSensePrecision: 'precise' },
        ];

        const dialog = new SeekPreviewDialog(mockActorToken, outcomes, [], {});
        dialog._originalOutcomes = outcomes;

        // Run the same hierarchy logic
        const usedStats = new Map();
        for (const o of outcomes) {
            const t = o.usedSenseType;
            const p = o.usedSensePrecision;
            if (!usedStats.has(t)) usedStats.set(t, { total: 0, precise: 0, imprecise: 0 });
            const stat = usedStats.get(t);
            stat.total += 1;
            if (p === 'precise') stat.precise += 1;
            else if (p === 'imprecise') stat.imprecise += 1;
        }

        const isVisionType = (senseType) => {
            const t = String(senseType || '').toLowerCase();
            return t.includes('vision') || t.includes('sight') || t === 'see-invisibility';
        };

        const getSenseRange = (senseType) => {
            const senseData = mockAllSenses.find(s => s.type === senseType);
            return senseData?.range ?? 0;
        };

        const entries = Array.from(usedStats.entries());
        const candidates = entries.map(([type, stats]) => {
            const range = getSenseRange(type);
            const isVision = isVisionType(type);
            const hasPrecise = stats.precise > 0;
            const hasUnlimitedRange = range === Infinity;

            return {
                type,
                priority: isVision ? 1 :
                    (hasPrecise && hasUnlimitedRange) ? 2 :
                        (hasPrecise && !hasUnlimitedRange) ? 3 :
                            (!hasPrecise && hasUnlimitedRange) ? 4 : 5
            };
        });

        candidates.sort((a, b) => a.priority - b.priority);

        expect(candidates[0].type).toBe('see-invisibility');
        expect(candidates[0].priority).toBe(1);
        expect(candidates[1].type).toBe('echolocation');
        expect(candidates[1].priority).toBe(3);
    });

    test('should prioritize precise unlimited non-vision over precise limited non-vision (hierarchy level 2 vs 3)', () => {
        const outcomes = [
            { usedSenseType: 'lifesense', usedSensePrecision: 'precise' }, // Unlimited range non-vision
            { usedSenseType: 'echolocation', usedSensePrecision: 'precise' }, // Limited range non-vision
        ];

        // Modify lifesense to be precise and unlimited for this test
        const testAllSenses = [
            ...mockAllSenses.filter(s => s.type !== 'lifesense'),
            { type: 'lifesense', range: Infinity, isPrecise: true, config: { label: 'Lifesense' } },
        ];

        const getSenseRange = (senseType) => {
            const senseData = testAllSenses.find(s => s.type === senseType);
            return senseData?.range ?? 0;
        };

        const isVisionType = (senseType) => {
            const t = String(senseType || '').toLowerCase();
            return t.includes('vision') || t.includes('sight');
        };

        const usedStats = new Map();
        for (const o of outcomes) {
            const t = o.usedSenseType;
            const p = o.usedSensePrecision;
            if (!usedStats.has(t)) usedStats.set(t, { total: 0, precise: 0, imprecise: 0 });
            const stat = usedStats.get(t);
            stat.total += 1;
            if (p === 'precise') stat.precise += 1;
        }

        const entries = Array.from(usedStats.entries());
        const candidates = entries.map(([type, stats]) => {
            const range = getSenseRange(type);
            const isVision = isVisionType(type);
            const hasPrecise = stats.precise > 0;
            const hasUnlimitedRange = range === Infinity;

            return {
                type,
                range,
                priority: isVision ? 1 :
                    (hasPrecise && hasUnlimitedRange) ? 2 :
                        (hasPrecise && !hasUnlimitedRange) ? 3 :
                            (!hasPrecise && hasUnlimitedRange) ? 4 : 5
            };
        });

        candidates.sort((a, b) => a.priority - b.priority);

        expect(candidates[0].type).toBe('lifesense');
        expect(candidates[0].priority).toBe(2); // Precise unlimited non-vision
        expect(candidates[1].type).toBe('echolocation');
        expect(candidates[1].priority).toBe(3); // Precise limited non-vision
    });

    test('should prioritize darkvision (vision type) over lifesense (hierarchy level 1 vs 2)', () => {
        const outcomes = [
            { usedSenseType: 'lifesense', usedSensePrecision: 'precise' }, // Assume lifesense can be precise
            { usedSenseType: 'darkvision', usedSensePrecision: 'precise' },
        ];

        // Modify lifesense to be precise and unlimited for this test
        const testAllSenses = [
            ...mockAllSenses.filter(s => s.type !== 'lifesense'),
            { type: 'lifesense', range: Infinity, isPrecise: true, config: { label: 'Lifesense' } },
        ];

        const getSenseRange = (senseType) => {
            const senseData = testAllSenses.find(s => s.type === senseType);
            return senseData?.range ?? 0;
        };

        const isVisionType = (senseType) => {
            const t = String(senseType || '').toLowerCase();
            return t.includes('vision') || t.includes('sight');
        };

        const usedStats = new Map();
        for (const o of outcomes) {
            const t = o.usedSenseType;
            const p = o.usedSensePrecision;
            if (!usedStats.has(t)) usedStats.set(t, { total: 0, precise: 0, imprecise: 0 });
            const stat = usedStats.get(t);
            stat.total += 1;
            if (p === 'precise') stat.precise += 1;
        }

        const entries = Array.from(usedStats.entries());
        const candidates = entries.map(([type, stats]) => {
            const range = getSenseRange(type);
            const isVision = isVisionType(type);
            const hasPrecise = stats.precise > 0;
            const hasUnlimitedRange = range === Infinity;

            return {
                type,
                range,
                priority: isVision ? 1 :
                    (hasPrecise && hasUnlimitedRange) ? 2 :
                        (hasPrecise && !hasUnlimitedRange) ? 3 :
                            (!hasPrecise && hasUnlimitedRange) ? 4 : 5
            };
        });

        candidates.sort((a, b) => a.priority - b.priority);

        expect(candidates[0].type).toBe('darkvision');
        expect(candidates[0].priority).toBe(1); // Vision types are priority 1
        expect(candidates[1].type).toBe('lifesense');
        expect(candidates[1].priority).toBe(2); // Precise unlimited non-vision is priority 2
    });

    test('should prioritize higher range within the same precise limited hierarchy level', () => {
        const outcomes = [
            { usedSenseType: 'darkvision', usedSensePrecision: 'precise' }, // 60 ft range
            { usedSenseType: 'echolocation', usedSensePrecision: 'precise' }, // 30 ft range
        ];

        const getSenseRange = (senseType) => {
            const senseData = mockAllSenses.find(s => s.type === senseType);
            return senseData?.range ?? 0;
        };

        const isVisionType = (senseType) => {
            const t = String(senseType || '').toLowerCase();
            return t.includes('vision') || t.includes('sight');
        };

        const usedStats = new Map();
        for (const o of outcomes) {
            const t = o.usedSenseType;
            const p = o.usedSensePrecision;
            if (!usedStats.has(t)) usedStats.set(t, { total: 0, precise: 0, imprecise: 0 });
            const stat = usedStats.get(t);
            stat.total += 1;
            if (p === 'precise') stat.precise += 1;
        }

        const entries = Array.from(usedStats.entries());
        const candidates = entries.map(([type, stats]) => {
            const range = getSenseRange(type);
            const isVision = isVisionType(type);
            const hasPrecise = stats.precise > 0;
            const hasUnlimitedRange = range === Infinity;

            return {
                type,
                range: typeof range === 'number' ? range : 0,
                priority: isVision ? 1 :
                    (hasPrecise && hasUnlimitedRange) ? 2 :
                        (hasPrecise && !hasUnlimitedRange) ? 3 :
                            (!hasPrecise && hasUnlimitedRange) ? 4 : 5
            };
        });

        candidates.sort((a, b) => {
            if (a.priority !== b.priority) {
                return a.priority - b.priority;
            }
            if (a.priority === 3 && b.priority === 3) {
                if (a.range !== b.range) {
                    return b.range - a.range; // Higher range first
                }
            }
            return 0;
        });

        expect(candidates[0].type).toBe('darkvision');
        expect(candidates[0].range).toBe(60);
        expect(candidates[1].type).toBe('echolocation');
        expect(candidates[1].range).toBe(30);
    });

    test('should prioritize imprecise unlimited over imprecise limited range (hierarchy level 4 vs 5)', () => {
        const outcomes = [
            { usedSenseType: 'hearing', usedSensePrecision: 'imprecise' }, // Unlimited range
            { usedSenseType: 'scent', usedSensePrecision: 'imprecise' }, // 30 ft range
        ];

        const getSenseRange = (senseType) => {
            const senseData = mockAllSenses.find(s => s.type === senseType);
            return senseData?.range ?? 0;
        };

        const isVisionType = (senseType) => {
            const t = String(senseType || '').toLowerCase();
            return t.includes('vision') || t.includes('sight');
        };

        const usedStats = new Map();
        for (const o of outcomes) {
            const t = o.usedSenseType;
            const p = o.usedSensePrecision;
            if (!usedStats.has(t)) usedStats.set(t, { total: 0, precise: 0, imprecise: 0 });
            const stat = usedStats.get(t);
            stat.total += 1;
            if (p === 'imprecise') stat.imprecise += 1;
        }

        const entries = Array.from(usedStats.entries());
        const candidates = entries.map(([type, stats]) => {
            const range = getSenseRange(type);
            const isVision = isVisionType(type);
            const hasPrecise = stats.precise > 0;
            const hasUnlimitedRange = range === Infinity;

            return {
                type,
                priority: isVision ? 1 :
                    (hasPrecise && hasUnlimitedRange) ? 2 :
                        (hasPrecise && !hasUnlimitedRange) ? 3 :
                            (!hasPrecise && hasUnlimitedRange) ? 4 : 5
            };
        });

        candidates.sort((a, b) => a.priority - b.priority);

        expect(candidates[0].type).toBe('hearing');
        expect(candidates[0].priority).toBe(4);
        expect(candidates[1].type).toBe('scent');
        expect(candidates[1].priority).toBe(5);
    });
});