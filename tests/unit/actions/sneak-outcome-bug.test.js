/**
 * Test for sneak outcome calculation bug
 * Issue: 14 vs DC 15 showing as Success instead of Failure
 */

import { determineOutcome } from '../../../scripts/chat/services/infra/shared-utils.js';

describe('Sneak Outcome Bug - 14 vs 15', () => {
    test('14 vs DC 15 should be Failure, not Success', () => {
        const roll = 14;
        const dc = 15;
        const die = 10; // Assume natural 10 (no 1 or 20)

        const outcome = determineOutcome(roll, die, dc);

        console.log(`Roll: ${roll}, DC: ${dc}, Margin: ${roll - dc}, Outcome: ${outcome}`);

        expect(outcome).toBe('failure');
        expect(outcome).not.toBe('success');
    });

    test('14 vs DC 17 should be Failure', () => {
        const roll = 14;
        const dc = 17;
        const die = 10;

        const outcome = determineOutcome(roll, die, dc);

        console.log(`Roll: ${roll}, DC: ${dc}, Margin: ${roll - dc}, Outcome: ${outcome}`);

        expect(outcome).toBe('failure');
    });

    test('14 vs DC 21 should be Failure', () => {
        const roll = 14;
        const dc = 21;
        const die = 10;

        const outcome = determineOutcome(roll, die, dc);

        console.log(`Roll: ${roll}, DC: ${dc}, Margin: ${roll - dc}, Outcome: ${outcome}`);

        expect(outcome).toBe('failure');
    });

    test('14 vs DC 25 should be Critical Failure', () => {
        const roll = 14;
        const dc = 25;
        const die = 10;

        const outcome = determineOutcome(roll, die, dc);

        console.log(`Roll: ${roll}, DC: ${dc}, Margin: ${roll - dc}, Outcome: ${outcome}`);

        expect(outcome).toBe('critical-failure');
    });

    test('15 vs DC 15 should be Success (meets DC)', () => {
        const roll = 15;
        const dc = 15;
        const die = 10;

        const outcome = determineOutcome(roll, die, dc);

        console.log(`Roll: ${roll}, DC: ${dc}, Margin: ${roll - dc}, Outcome: ${outcome}`);

        expect(outcome).toBe('success');
    });

    test('Natural 20 with 14 vs DC 15 should upgrade Failure to Success', () => {
        const roll = 14;
        const dc = 15;
        const die = 20; // Natural 20

        const outcome = determineOutcome(roll, die, dc);

        console.log(`Roll: ${roll} (nat 20), DC: ${dc}, Margin: ${roll - dc}, Outcome: ${outcome}`);

        // Natural 20 upgrades by one step: failure → success
        expect(outcome).toBe('success');
    });
});
