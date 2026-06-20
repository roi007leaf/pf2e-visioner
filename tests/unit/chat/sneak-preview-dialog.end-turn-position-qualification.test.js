/**
 * @jest-environment jsdom
 */

import {
  prepareSneakPositionDisplay,
  sortSneakOutcomesByQualification,
} from '../../../scripts/chat/dialogs/Sneak/sneak-position-display.js';

describe('Sneak end-of-turn position qualification', () => {
  test('end-of-turn preserved position display recalculates live qualifications', () => {
    const observer = { id: 'observer-1' };
    const outcome = {
      positionDisplay: {
        startPosition: { qualifies: true },
        endPosition: { qualifies: false },
      },
    };
    const dialog = {
      isEndOfTurnDialog: true,
      _startPositionQualifiesForSneak: jest.fn(() => false),
      _endPositionQualifiesForSneak: jest.fn(() => true),
    };

    const display = prepareSneakPositionDisplay(dialog, null, observer, outcome);

    expect(display.startPosition.qualifies).toBe(false);
    expect(display.endPosition.qualifies).toBe(true);
    expect(dialog._startPositionQualifiesForSneak).toHaveBeenCalledWith(observer, outcome);
    expect(dialog._endPositionQualifiesForSneak).toHaveBeenCalledWith(observer, outcome);
  });

  test('fallback position display is explicitly non-qualifying', () => {
    const display = prepareSneakPositionDisplay({ isEndOfTurnDialog: false }, null, {}, {});

    expect(display.transitionType).toBe('unknown');
    expect(display.startPosition.qualifies).toBe(false);
    expect(display.endPosition.qualifies).toBe(false);
  });

  test('sorts qualifying outcomes first without changing equal-order groups', () => {
    const outcomes = [
      { id: 'a', positionDisplay: { startPosition: { qualifies: true }, endPosition: { qualifies: false } } },
      { id: 'b', positionDisplay: { startPosition: { qualifies: true }, endPosition: { qualifies: true } } },
      { id: 'c', positionDisplay: { startPosition: { qualifies: false }, endPosition: { qualifies: true } } },
    ];

    expect(sortSneakOutcomesByQualification(outcomes).map((outcome) => outcome.id)).toEqual([
      'b',
      'a',
      'c',
    ]);
  });
});
