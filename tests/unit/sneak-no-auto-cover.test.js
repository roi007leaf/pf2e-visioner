import { calculateStealthRollTotals } from '../../scripts/chat/services/infra/shared-utils.js';

describe('Sneak Action - No Auto-Cover Application', () => {
    describe('calculateStealthRollTotals with null autoCover', () => {
        test('should not apply cover bonus when autoCover is null', () => {
            const baseTotal = 14;
            const autoCover = null;
            const actionData = {
                roll: { total: 14 },
                context: {},
            };

            const result = calculateStealthRollTotals(baseTotal, autoCover, actionData);

            expect(result.total).toBe(14);
        });

        test('should not apply cover bonus when autoCover is undefined', () => {
            const baseTotal = 14;
            const autoCover = undefined;
            const actionData = {
                roll: { total: 14 },
                context: {},
            };

            const result = calculateStealthRollTotals(baseTotal, autoCover, actionData);

            expect(result.total).toBe(14);
        });

        test('should not apply standard cover (+2) automatically', () => {
            const baseTotal = 14;
            const autoCover = null;
            const actionData = {
                roll: { total: 14 },
                context: {},
            };

            const result = calculateStealthRollTotals(baseTotal, autoCover, actionData);

            expect(result.total).not.toBe(16);
            expect(result.total).toBe(14);
        });

        test('should not apply greater cover (+4) automatically', () => {
            const baseTotal = 14;
            const autoCover = null;
            const actionData = {
                roll: { total: 14 },
                context: {},
            };

            const result = calculateStealthRollTotals(baseTotal, autoCover, actionData);

            expect(result.total).not.toBe(18);
            expect(result.total).toBe(14);
        });

        test('roll of 14 vs DC 15 should be failure without automatic cover', () => {
            const baseTotal = 14;
            const dc = 15;
            const autoCover = null;
            const actionData = {
                roll: { total: 14 },
                context: {},
            };

            const result = calculateStealthRollTotals(baseTotal, autoCover, actionData);

            expect(result.total).toBe(14);
            expect(result.total).toBeLessThan(dc);
        });

        test('roll of 14 vs DC 17 should be failure without automatic cover', () => {
            const baseTotal = 14;
            const dc = 17;
            const autoCover = null;
            const actionData = {
                roll: { total: 14 },
                context: {},
            };

            const result = calculateStealthRollTotals(baseTotal, autoCover, actionData);

            expect(result.total).toBe(14);
            expect(result.total).toBeLessThan(dc);
        });
    });

    describe('Cover should only be applied via explicit parameter', () => {
        test('cover bonus should be applied only when explicitly provided via UI', () => {
            const baseTotal = 14;
            const actionData = {
                roll: { total: 14 },
                context: {},
            };

            const withNoCover = calculateStealthRollTotals(baseTotal, null, actionData);
            expect(withNoCover.total).toBe(14);
        });

        test('multiple rolls should all use base total without auto-detection', () => {
            const actionData = {
                roll: { total: 14 },
                context: {},
            };

            const roll1 = calculateStealthRollTotals(14, null, actionData);
            const roll2 = calculateStealthRollTotals(18, null, actionData);
            const roll3 = calculateStealthRollTotals(22, null, actionData);

            expect(roll1.total).toBe(14);
            expect(roll2.total).toBe(18);
            expect(roll3.total).toBe(22);
        });
    });
});
