import { beforeEach, describe, expect, jest, test } from '@jest/globals';

describe('SeekDialogAdapter', () => {
    let adapter;
    let mockObserver;
    let mockTarget;
    let visionAnalyzer;

    beforeEach(async () => {
        jest.clearAllMocks();

        const { SeekDialogAdapter } = await import(
            '../../scripts/visibility/auto-visibility/SeekDialogAdapter.js'
        );
        const { VisionAnalyzer } = await import(
            '../../scripts/visibility/auto-visibility/VisionAnalyzer.js'
        );

        visionAnalyzer = VisionAnalyzer.getInstance();

        // Mock VisionAnalyzer methods using jest.spyOn
        jest.spyOn(visionAnalyzer, 'getVisionCapabilities');
        jest.spyOn(visionAnalyzer, 'distanceFeet');
        jest.spyOn(visionAnalyzer, 'hasLineOfSight');
        jest.spyOn(visionAnalyzer, 'hasPreciseNonVisualInRange');
        jest.spyOn(visionAnalyzer, 'canDetectWithSpecialSense');

        adapter = new SeekDialogAdapter(visionAnalyzer);

        mockObserver = {
            id: 'observer1',
            name: 'Observer',
            actor: {
                system: {
                    details: { creatureType: 'humanoid' },
                },
            },
        };

        mockTarget = {
            id: 'target1',
            name: 'Target',
            actor: {
                system: {
                    details: { creatureType: 'humanoid' },
                },
            },
        };
    });

    describe('Static Methods', () => {
        test('isVisualSenseType identifies visual senses correctly', async () => {
            const { SeekDialogAdapter } = await import(
                '../../scripts/visibility/auto-visibility/SeekDialogAdapter.js'
            );

            expect(SeekDialogAdapter.isVisualSenseType('vision')).toBe(true);
            expect(SeekDialogAdapter.isVisualSenseType('darkvision')).toBe(true);
            expect(SeekDialogAdapter.isVisualSenseType('greater-darkvision')).toBe(true);
            expect(SeekDialogAdapter.isVisualSenseType('low-light-vision')).toBe(true);
            expect(SeekDialogAdapter.isVisualSenseType('truesight')).toBe(true);

            expect(SeekDialogAdapter.isVisualSenseType('hearing')).toBe(false);
            expect(SeekDialogAdapter.isVisualSenseType('echolocation')).toBe(false);
            expect(SeekDialogAdapter.isVisualSenseType('lifesense')).toBe(false);
            expect(SeekDialogAdapter.isVisualSenseType('scent')).toBe(false);
            expect(SeekDialogAdapter.isVisualSenseType('tremorsense')).toBe(false);
        });

        test('VISUAL_SENSE_PRIORITY has correct hierarchy', async () => {
            const { SeekDialogAdapter } = await import(
                '../../scripts/visibility/auto-visibility/SeekDialogAdapter.js'
            );

            const priority = SeekDialogAdapter.VISUAL_SENSE_PRIORITY;
            expect(priority).toEqual([
                'truesight',
                'greater-darkvision',
                'darkvision',
                'low-light-vision',
                'infrared-vision',
                'vision',
            ]);
        });
    });

    describe('checkSenseLimitations', () => {
        test('lifesense fails against constructs', async () => {
            mockTarget.actor.system.details.creatureType = 'construct';

            const result = await adapter.checkSenseLimitations(mockTarget, 'lifesense');

            expect(result.valid).toBe(false);
            expect(result.reason).toContain('life force');
        });

        test('scent fails against constructs', async () => {
            mockTarget.actor.system.details.creatureType = 'construct';

            const result = await adapter.checkSenseLimitations(mockTarget, 'scent');

            expect(result.valid).toBe(false);
            expect(result.reason).toContain('scent');
            expect(result.reason).toContain('construct');
        });

        test('lifesense works against undead (has negative energy)', async () => {
            mockTarget.actor.system.details.creatureType = 'undead';

            const result = await adapter.checkSenseLimitations(mockTarget, 'lifesense');

            expect(result.valid).toBe(true);
            expect(result.reason).toBeUndefined();
        });

        test('scent works against living creatures', async () => {
            mockTarget.actor.system.details.creatureType = 'humanoid';

            const result = await adapter.checkSenseLimitations(mockTarget, 'scent');

            expect(result.valid).toBe(true);
            expect(result.reason).toBeUndefined();
        });

        test('visual senses always work regardless of creature type', async () => {
            mockTarget.actor.system.details.creatureType = 'construct';

            const visionResult = await adapter.checkSenseLimitations(mockTarget, 'vision');
            const darkvisionResult = await adapter.checkSenseLimitations(mockTarget, 'darkvision');
            const greaterResult = await adapter.checkSenseLimitations(mockTarget, 'greater-darkvision');
            const truesightResult = await adapter.checkSenseLimitations(mockTarget, 'truesight');

            expect(visionResult.valid).toBe(true);
            expect(darkvisionResult.valid).toBe(true);
            expect(greaterResult.valid).toBe(true);
            expect(truesightResult.valid).toBe(true);
        });

        test('other non-visual precise senses work regardless of creature type', async () => {
            mockTarget.actor.system.details.creatureType = 'construct';

            const echoResult = await adapter.checkSenseLimitations(mockTarget, 'echolocation');
            const tremorResult = await adapter.checkSenseLimitations(mockTarget, 'tremorsense');
            const hearingResult = await adapter.checkSenseLimitations(mockTarget, 'hearing');

            expect(echoResult.valid).toBe(true);
            expect(tremorResult.valid).toBe(true);
            expect(hearingResult.valid).toBe(true);
        });
    });

    describe('determineSenseUsed', () => {
        test('returns precise visual sense when available and in range', async () => {
            visionAnalyzer.getVisionCapabilities.mockReturnValue({
                hasVision: true,
                precise: { vision: { range: Infinity } },
                imprecise: {},
                sensingSummary: {
                    precise: [{ type: 'vision', range: Infinity }],
                    imprecise: [],
                },
            });
            visionAnalyzer.distanceFeet.mockReturnValue(30);
            visionAnalyzer.hasLineOfSight.mockReturnValue(true);

            const result = await adapter.determineSenseUsed(mockObserver, mockTarget);

            expect(result.canDetect).toBe(true);
            expect(result.senseType).toBe('vision');
            expect(result.precision).toBe('precise');
            expect(result.unmetCondition).toBeUndefined();
            expect(result.outOfRange).toBe(false);
        });

        test('returns darkvision over vision when both available', async () => {
            visionAnalyzer.getVisionCapabilities.mockReturnValue({
                hasVision: true,
                precise: {
                    vision: { range: Infinity },
                    darkvision: { range: 60 },
                },
                imprecise: {},
                sensingSummary: {
                    precise: [
                        { type: 'vision', range: Infinity },
                        { type: 'darkvision', range: 60 },
                    ],
                    imprecise: [],
                },
            });
            visionAnalyzer.distanceFeet.mockReturnValue(30);
            visionAnalyzer.hasLineOfSight.mockReturnValue(true);

            const result = await adapter.determineSenseUsed(mockObserver, mockTarget);

            expect(result.canDetect).toBe(true);
            expect(result.senseType).toBe('darkvision');
            expect(result.precision).toBe('precise');
        });

        test('returns non-visual precise sense when no visual sense available', async () => {
            visionAnalyzer.getVisionCapabilities.mockReturnValue({
                hasVision: false,
                isBlinded: true,
                precise: { echolocation: { range: 30 } },
                imprecise: {},
                sensingSummary: {
                    precise: [{ type: 'echolocation', range: 30 }],
                    imprecise: [],
                },
            });
            visionAnalyzer.distanceFeet.mockReturnValue(20);
            visionAnalyzer.hasPreciseNonVisualInRange.mockReturnValue(true);

            const result = await adapter.determineSenseUsed(mockObserver, mockTarget);

            expect(result.canDetect).toBe(true);
            expect(result.senseType).toBe('echolocation');
            expect(result.precision).toBe('precise');
        });

        test('returns imprecise sense when no precise sense available', async () => {
            visionAnalyzer.getVisionCapabilities.mockReturnValue({
                hasVision: false,
                isBlinded: true,
                precise: {},
                imprecise: { hearing: { range: 30 } },
                sensingSummary: {
                    precise: [],
                    imprecise: [{ type: 'hearing', range: 30 }],
                },
            });
            visionAnalyzer.distanceFeet.mockReturnValue(20);
            visionAnalyzer.hasPreciseNonVisualInRange.mockReturnValue(false);
            visionAnalyzer.canDetectWithSpecialSense.mockReturnValue(true);

            const result = await adapter.determineSenseUsed(mockObserver, mockTarget);

            expect(result.canDetect).toBe(true);
            expect(result.senseType).toBe('hearing');
            expect(result.precision).toBe('imprecise');
        });

        test('returns unmet condition when lifesense cannot detect construct', async () => {
            mockTarget.actor.system.details.creatureType = 'construct';

            visionAnalyzer.getVisionCapabilities.mockReturnValue({
                hasVision: false,
                isBlinded: true,
                precise: {},
                imprecise: { lifesense: { range: 30 } },
                sensingSummary: {
                    precise: [],
                    imprecise: [{ type: 'lifesense', range: 30 }],
                },
            });
            visionAnalyzer.distanceFeet.mockReturnValue(20);
            visionAnalyzer.hasPreciseNonVisualInRange.mockReturnValue(false);
            visionAnalyzer.canDetectWithSpecialSense.mockReturnValue(false);

            const result = await adapter.determineSenseUsed(mockObserver, mockTarget);

            expect(result.canDetect).toBe(false);
            expect(result.senseType).toBe('lifesense');
            expect(result.precision).toBe('imprecise');
            expect(result.unmetCondition).toBeTruthy();
            expect(result.reason).toContain('life force');
        });

        test('returns unmet condition when scent cannot detect construct', async () => {
            mockTarget.actor.system.details.creatureType = 'construct';

            visionAnalyzer.getVisionCapabilities.mockReturnValue({
                hasVision: false,
                precise: {},
                imprecise: { scent: { range: 30 } },
                sensingSummary: {
                    precise: [],
                    imprecise: [{ type: 'scent', range: 30 }],
                },
            });
            visionAnalyzer.distanceFeet.mockReturnValue(20);
            visionAnalyzer.hasPreciseNonVisualInRange.mockReturnValue(false);
            visionAnalyzer.canDetectWithSpecialSense.mockReturnValue(false);

            const result = await adapter.determineSenseUsed(mockObserver, mockTarget);

            expect(result.canDetect).toBe(false);
            expect(result.senseType).toBe('scent');
            expect(result.unmetCondition).toBeTruthy();
            expect(result.reason).toContain('scent');
            expect(result.reason).toContain('construct');
        });

        test('returns out of range when target beyond sense range', async () => {
            visionAnalyzer.getVisionCapabilities.mockReturnValue({
                hasVision: false,
                precise: {},
                imprecise: { hearing: { range: 10 } },
                sensingSummary: {
                    precise: [],
                    imprecise: [{ type: 'hearing', range: 10 }],
                },
            });
            visionAnalyzer.distanceFeet.mockReturnValue(50);
            visionAnalyzer.hasPreciseNonVisualInRange.mockReturnValue(false);
            visionAnalyzer.canDetectWithSpecialSense.mockReturnValue(true);

            const result = await adapter.determineSenseUsed(mockObserver, mockTarget);

            expect(result.outOfRange).toBe(true);
            expect(result.senseType).toBe('hearing');
            expect(result.range).toBe(10);
            expect(result.reason).toContain('50');
            expect(result.reason).toContain('10');
        });

        test('returns cannot detect when no senses available', async () => {
            visionAnalyzer.getVisionCapabilities.mockReturnValue({
                hasVision: false,
                isBlinded: true,
                precise: {},
                imprecise: {},
                sensingSummary: {
                    precise: [],
                    imprecise: [],
                },
            });
            visionAnalyzer.distanceFeet.mockReturnValue(20);
            visionAnalyzer.hasPreciseNonVisualInRange.mockReturnValue(false);
            visionAnalyzer.canDetectWithSpecialSense.mockReturnValue(false);

            const result = await adapter.determineSenseUsed(mockObserver, mockTarget);

            expect(result.canDetect).toBe(false);
            expect(result.senseType).toBeNull();
            expect(result.reason).toContain('No senses available');
        });
    });
});
