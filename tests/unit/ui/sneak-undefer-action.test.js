/**
 * @jest-environment jsdom
 */

jest.mock('../../../scripts/chat/services/TurnSneakTracker.js', () => ({
  __esModule: true,
  default: {
    isObserverDeferred: jest.fn(() => false),
    removeDeferredCheck: jest.fn(),
    _getCombatantId: jest.fn(() => 'combatant-1'),
    _turnSneakStates: new Map(),
  },
}));

jest.mock('../../../scripts/chat/services/infra/notifications.js', () => ({
  notify: {
    info: jest.fn(),
  },
}));

import { undeferSneakCheck } from '../../../scripts/chat/dialogs/Sneak/sneak-undefer-action.js';
import turnSneakTracker from '../../../scripts/chat/services/TurnSneakTracker.js';
import { notify } from '../../../scripts/chat/services/infra/notifications.js';

describe('sneak undefer action', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
    turnSneakTracker._turnSneakStates.clear();
    global.game = {
      i18n: {
        localize: jest.fn((key) => key),
      },
    };
    global.ui = {
      notifications: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
    };
  });

  function buildRow() {
    const row = document.createElement('tr');
    row.className = 'row-deferred deferred-row';
    row.dataset.deferred = 'true';
    row.innerHTML = `
      <td>
        <button data-action="toggleDefer" class="deferred active">
          <i class="fas fa-clock"></i>
        </button>
        <button data-action="undeferCheck" data-token-id="target-1"></button>
      </td>
    `;
    document.body.append(row);
    return row;
  }

  function buildApp(outcome, overrides = {}) {
    return {
      sneakingToken: { id: 'sneaker' },
      outcomes: [outcome],
      _deferredChecks: new Set(['target-1']),
      _updateBulkDeferButton: jest.fn(),
      _updateEndTurnValidationButton: jest.fn(),
      _getPositionTransitionForToken: jest.fn(() => ({ endPosition: { x: 10, y: 20 } })),
      _endPositionQualifiesForSneak: jest.fn(() => true),
      _enrichOutcomes: jest.fn((outcomes) => outcomes),
      render: jest.fn(() => Promise.resolve()),
      ...overrides,
    };
  }

  test('reports missing dialog through existing notification key', async () => {
    const target = document.createElement('button');
    target.dataset.tokenId = 'target-1';

    await undeferSneakCheck(null, target);

    expect(global.ui.notifications.error).toHaveBeenCalledWith(
      'PF2E_VISIONER.NOTIFICATIONS.NO_SNEAK_DIALOG',
    );
  });

  test('removes defer state and restores stored start-position outcome data', async () => {
    const row = buildRow();
    const target = row.querySelector('[data-action="undeferCheck"]');
    const outcome = {
      token: { id: 'target-1', name: 'Target', document: { id: 'observer-doc' } },
      isDeferred: true,
      startQualifies: false,
      endQualifies: false,
    };
    const app = buildApp(outcome);
    turnSneakTracker._turnSneakStates.set('combatant-1', {
      deferredChecks: new Map([
        [
          'observer-doc',
          {
            originalOutcome: {
              startQualifies: true,
              startCover: 'standard',
              startVisibility: 'hidden',
            },
          },
        ],
      ]),
    });

    await undeferSneakCheck(app, target);

    expect(app._deferredChecks.has('target-1')).toBe(false);
    expect(turnSneakTracker.removeDeferredCheck).toHaveBeenCalledWith(
      app.sneakingToken,
      outcome.token,
    );
    expect(row.classList.contains('row-deferred')).toBe(false);
    expect(row.classList.contains('deferred-row')).toBe(false);
    expect(row.hasAttribute('data-deferred')).toBe(false);
    expect(row.querySelector('[data-action="toggleDefer"]').classList.contains('deferred')).toBe(
      false,
    );
    expect(app.outcomes[0]).toMatchObject({
      startQualifies: true,
      startCover: 'standard',
      startVisibility: 'hidden',
      endQualifies: true,
      isDeferred: false,
    });
    expect(app._updateBulkDeferButton).toHaveBeenCalled();
    expect(app._updateEndTurnValidationButton).toHaveBeenCalled();
    expect(app.render).toHaveBeenCalledWith(false, { force: true });
    expect(notify.info).toHaveBeenCalledWith('Undeferred check for Target');
  });
});
