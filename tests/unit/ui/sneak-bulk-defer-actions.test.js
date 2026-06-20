/**
 * @jest-environment jsdom
 */

jest.mock('../../../scripts/chat/services/TurnSneakTracker.js', () => ({
  __esModule: true,
  default: {
    recordDeferredCheck: jest.fn(),
    removeDeferredCheck: jest.fn(),
    _getCombatantId: jest.fn(() => 'combatant-1'),
    _turnSneakStates: new Map(),
  },
}));

import {
  bulkDeferAllEligible,
  bulkRestoreDefers,
  bulkUndeferAll,
  resetBulkUndeferButton,
  updateBulkDeferButton,
  updateEndTurnValidationButton,
} from '../../../scripts/chat/dialogs/Sneak/sneak-bulk-defer-actions.js';
import turnSneakTracker from '../../../scripts/chat/services/TurnSneakTracker.js';

describe('sneak bulk defer actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
    turnSneakTracker._turnSneakStates.clear();
    global.ui = {
      notifications: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
    };
    global.game = {
      i18n: {
        localize: jest.fn((key) => key),
        format: jest.fn((key, data) => `${key}:${data.count}`),
      },
    };
  });

  function buildElement() {
    const element = document.createElement('section');
    element.innerHTML = `
      <table><tbody>
        <tr data-token-id="t1">
          <td>
            <button data-action="toggleDefer" data-token-id="t1">
              <i class="fas fa-hourglass-half"></i>
            </button>
          </td>
        </tr>
      </tbody></table>
      <button data-action="bulkDefer"></button>
      <button data-action="bulkUndefer"></button>
      <div class="bulk-action-group">
        <button data-action="processEndTurnValidation"><span></span></button>
      </div>
    `;
    document.body.append(element);
    return element;
  }

  function buildApp(overrides = {}) {
    const token = { id: 't1', document: { id: 'tdoc1' } };
    return {
      element: buildElement(),
      sneakingToken: { id: 'sneak' },
      _deferredChecks: new Set(),
      _bulkUndeferredOutcomes: new Map(),
      _bulkUndeferButtonState: 'undefer',
      _lastRenderedOutcomes: [
        { token, canDefer: true, isDeferred: false, newVisibility: 'avs', endCover: 'none' },
      ],
      outcomes: [{ token, canDefer: true, isDeferred: false, newVisibility: 'avs' }],
      _getPositionTransitionForToken: jest.fn(() => ({ endPosition: { coverState: 'none' } })),
      _endPositionQualifiesForSneak: jest.fn(() => false),
      render: jest.fn(() => Promise.resolve()),
      ...overrides,
    };
  }

  test('bulk defers visible eligible outcomes and updates buttons', () => {
    const app = buildApp();

    bulkDeferAllEligible(app);

    const row = app.element.querySelector('tr[data-token-id="t1"]');
    const button = app.element.querySelector('[data-action="toggleDefer"]');
    expect(app._deferredChecks.has('t1')).toBe(true);
    expect(row.classList.contains('row-deferred')).toBe(true);
    expect(button.classList.contains('deferred')).toBe(true);
    expect(turnSneakTracker.recordDeferredCheck).toHaveBeenCalled();
    expect(ui.notifications.info).toHaveBeenCalled();
  });

  test('bulk undefer stores restore state and switches button mode', () => {
    const app = buildApp({
      _deferredChecks: new Set(['t1']),
      _lastRenderedOutcomes: [
        {
          token: { id: 't1', document: { id: 'tdoc1' } },
          canDefer: false,
          isDeferred: true,
          newVisibility: 'hidden',
        },
      ],
      outcomes: [{ token: { id: 't1', document: { id: 'tdoc1' } }, isDeferred: true }],
    });
    turnSneakTracker._turnSneakStates.set('combatant-1', {
      deferredChecks: new Map([
        ['tdoc1', { originalOutcome: { startQualifies: true, startCover: 'none' } }],
      ]),
    });

    bulkUndeferAll(app);

    expect(app._deferredChecks.has('t1')).toBe(false);
    expect(app._bulkUndeferredOutcomes.has('t1')).toBe(true);
    expect(app._bulkUndeferButtonState).toBe('restore');
    expect(app.element.querySelector('[data-action="bulkUndefer"]').classList.contains(
      'ready-to-restore',
    )).toBe(true);
    expect(turnSneakTracker.removeDeferredCheck).toHaveBeenCalled();
  });

  test('bulk restore records checks again and resets restore mode', () => {
    const app = buildApp({
      _bulkUndeferButtonState: 'restore',
      _bulkUndeferredOutcomes: new Map([
        ['t1', { token: { id: 't1' }, newVisibility: 'hidden', endCover: 'none' }],
      ]),
      outcomes: [{ token: { id: 't1' }, isDeferred: false }],
    });

    bulkRestoreDefers(app);

    expect(app.outcomes[0].isDeferred).toBeUndefined();
    expect(app._deferredChecks.has('t1')).toBe(true);
    expect(app._bulkUndeferButtonState).toBe('undefer');
    expect(turnSneakTracker.recordDeferredCheck).toHaveBeenCalled();
  });

  test('updates bulk availability and end-turn validation count from rendered outcomes', () => {
    const app = buildApp({
      _deferredChecks: new Set(['t1']),
      _lastRenderedOutcomes: [
        { token: { id: 't1' }, canDefer: false, isDeferred: true },
        { token: { id: 't2' }, canDefer: true, isDeferred: false },
      ],
    });

    updateBulkDeferButton(app);
    updateEndTurnValidationButton(app);

    expect(app.element.querySelector('[data-action="bulkDefer"]').classList.contains('available'))
      .toBe(true);
    expect(app.element.querySelector('[data-action="bulkUndefer"]').classList.contains(
      'available',
    )).toBe(true);
    expect(app.element.querySelector('[data-action="processEndTurnValidation"] span').textContent)
      .toBe('End Turn Validation (1)');
  });

  test('reset bulk undefer button follows tracked restore state', () => {
    const app = buildApp({ _bulkUndeferButtonState: 'restore' });

    resetBulkUndeferButton(app);

    expect(app.element.querySelector('[data-action="bulkUndefer"]').innerHTML).toContain(
      'PF2E_VISIONER.UI.RESTORE_DEFERS_BUTTON',
    );
  });
});
