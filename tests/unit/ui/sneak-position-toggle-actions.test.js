/**
 * @jest-environment jsdom
 */

jest.mock('../../../scripts/chat/services/TurnSneakTracker.js', () => ({
  __esModule: true,
  default: {
    isObserverDeferred: jest.fn(() => false),
    removeDeferredCheck: jest.fn(),
  },
}));

jest.mock('../../../scripts/chat/services/infra/notifications.js', () => ({
  notify: {
    info: jest.fn(),
  },
}));

import { toggleSneakPosition } from '../../../scripts/chat/dialogs/Sneak/sneak-position-toggle-actions.js';
import turnSneakTracker from '../../../scripts/chat/services/TurnSneakTracker.js';

describe('sneak position toggle actions', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  function buildOutcome(overrides = {}) {
    return {
      token: { id: 'target-1', name: 'Target' },
      hasPositionData: true,
      positionDisplay: {
        startPosition: { qualifies: false },
        endPosition: { qualifies: false },
      },
      ...overrides,
    };
  }

  function buildApp(outcome, overrides = {}) {
    return {
      sneakingToken: { id: 'sneaker' },
      outcomes: [outcome],
      _deferredChecks: new Set(),
      _recalculateNewVisibilityForOutcome: jest.fn(() => Promise.resolve()),
      _recalculateDeferEligibility: jest.fn(),
      _updateBulkDeferButton: jest.fn(),
      _updateEndTurnValidationButton: jest.fn(),
      ...overrides,
    };
  }

  function buildPositionButton(positionType = 'start') {
    const button = document.createElement('button');
    button.dataset.tokenId = 'target-1';
    button.dataset.action = positionType === 'start' ? 'toggleStartPosition' : 'toggleEndPosition';
    button.innerHTML = '<i class="fas fa-times"></i>';
    return button;
  }

  test('toggles qualification, updates button, clears non-deferred feat override', async () => {
    const outcome = buildOutcome({ _featPositionOverride: 'start' });
    const app = buildApp(outcome);
    const button = buildPositionButton('start');

    await toggleSneakPosition(app, button, 'start');

    expect(outcome.positionDisplay.startPosition.qualifies).toBe(true);
    expect(outcome._featPositionOverride).toBeUndefined();
    expect(button.className).toBe('position-requirement-btn position-check active');
    expect(button.querySelector('i').className).toBe('fas fa-check');
    expect(button.dataset.tooltip).toBe('start position qualifies for sneak');
    expect(app._recalculateNewVisibilityForOutcome).toHaveBeenCalledWith(outcome);
    expect(app._recalculateDeferEligibility).toHaveBeenCalledWith(outcome);
  });

  test('keeps feat override while observer remains deferred', async () => {
    turnSneakTracker.isObserverDeferred.mockReturnValueOnce(true);
    const outcome = buildOutcome({ _featPositionOverride: 'end' });
    const app = buildApp(outcome);
    const button = buildPositionButton('start');

    await toggleSneakPosition(app, button, 'start');

    expect(outcome._featPositionOverride).toBe('end');
  });

  test('auto-undefers deferred observer when end position now qualifies', async () => {
    const row = document.createElement('tr');
    row.className = 'row-deferred deferred-row';
    row.dataset.deferred = 'true';
    row.innerHTML = `
      <td>
        <button data-action="toggleDefer" class="deferred active" disabled>
          <i class="fas fa-clock"></i>
        </button>
        <button data-token-id="target-1"><i class="fas fa-times"></i></button>
      </td>
    `;
    document.body.append(row);
    const positionButton = row.querySelector('[data-token-id="target-1"]');
    const deferButton = row.querySelector('[data-action="toggleDefer"]');
    const outcome = buildOutcome({ isDeferred: true });
    const app = buildApp(outcome, { _deferredChecks: new Set(['target-1']) });

    await toggleSneakPosition(app, positionButton, 'end');

    expect(app._deferredChecks.has('target-1')).toBe(false);
    expect(turnSneakTracker.removeDeferredCheck).toHaveBeenCalledWith(
      app.sneakingToken,
      outcome.token,
    );
    expect(outcome.isDeferred).toBe(false);
    expect(deferButton.classList.contains('deferred')).toBe(false);
    expect(deferButton.disabled).toBe(false);
    expect(row.classList.contains('row-deferred')).toBe(false);
    expect(row.hasAttribute('data-deferred')).toBe(false);
    expect(app._updateBulkDeferButton).toHaveBeenCalled();
    expect(app._updateEndTurnValidationButton).toHaveBeenCalled();
  });
});
