/**
 * @jest-environment jsdom
 */

jest.mock('../../../scripts/visibility/perception-profile.js', () => ({
  overrideToDisplayVisibility: jest.fn((flag) => flag.visibility),
}));

jest.mock('../../../scripts/chat/dialogs/Sneak/sneak-outcome-context.js', () => ({
  calculateSneakOutcomeActionability: jest.fn(() => true),
  collectSneakerOverrideFlagsByObserverId: jest.fn(
    () => new Map([['observer-doc', { visibility: 'hidden' }]]),
  ),
}));

import {
  addSneakIconClickHandlers,
  applySneakOverrideState,
  updateSneakIconSelection,
} from '../../../scripts/chat/dialogs/Sneak/sneak-override-state.js';
import {
  calculateSneakOutcomeActionability,
  collectSneakerOverrideFlagsByObserverId,
} from '../../../scripts/chat/dialogs/Sneak/sneak-outcome-context.js';

describe('sneak override state', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
  });

  function buildApp(overrides = {}) {
    return {
      sneakingToken: { id: 'sneak' },
      outcomes: [
        {
          token: { id: 'observer', document: { id: 'observer-doc' } },
          currentVisibility: 'observed',
          newVisibility: 'concealed',
          overrideState: null,
        },
      ],
      getOutcomeTokenId: (outcome) => outcome.token.id,
      getVisibilityBetween: jest.fn(() => 'observed'),
      isOldStateAvsControlled: jest.fn(() => false),
      isCurrentStateAvsControlled: jest.fn(() => false),
      updateIconSelection: jest.fn(),
      updateActionButtonsForToken: jest.fn(),
      updateChangesCount: jest.fn(),
      ...overrides,
    };
  }

  test('applies override state and recalculates actionability with override-aware old state', () => {
    const app = buildApp();
    const target = document.createElement('button');
    target.dataset.tokenId = 'observer';
    target.dataset.state = 'hidden';

    applySneakOverrideState(app, target);

    expect(app.outcomes[0].overrideState).toBe('hidden');
    expect(collectSneakerOverrideFlagsByObserverId).toHaveBeenCalledWith(app);
    expect(calculateSneakOutcomeActionability).toHaveBeenCalledWith(
      app,
      app.outcomes[0],
      expect.objectContaining({
        baseOldState: 'hidden',
        effectiveNewState: 'hidden',
      }),
    );
    expect(app.updateIconSelection).toHaveBeenCalledWith('observer', 'hidden', false);
    expect(app.updateChangesCount).toHaveBeenCalled();
  });

  test('updates selected icon and hidden input in matching row only', () => {
    const element = document.createElement('section');
    element.innerHTML = `
      <table><tbody>
        <tr data-token-id="observer">
          <td><button data-token-id="observer"></button></td>
          <td>
            <span class="state-icon" data-state="hidden"></span>
            <span class="state-icon selected" data-state="observed"></span>
            <input type="hidden" value="observed" />
          </td>
        </tr>
      </tbody></table>
    `;

    updateSneakIconSelection({ element }, 'observer', 'hidden');

    expect(element.querySelector('[data-state="hidden"]').classList.contains('selected')).toBe(
      true,
    );
    expect(element.querySelector('[data-state="observed"]').classList.contains('selected')).toBe(
      false,
    );
    expect(element.querySelector('input').value).toBe('hidden');
  });

  test('icon click handler updates outcome and row controls', () => {
    const element = document.createElement('section');
    element.innerHTML = `
      <table><tbody>
        <tr data-token-id="observer">
          <td class="override-icons">
            <span class="state-icon" data-token-id="observer" data-state="hidden"></span>
            <input type="hidden" />
          </td>
        </tr>
      </tbody></table>
    `;
    const app = buildApp({
      element,
      isOldStateAvsControlled: jest.fn(() => false),
      updateActionButtonsForToken: jest.fn(),
    });

    addSneakIconClickHandlers(app);
    element.querySelector('.state-icon').click();

    expect(app.outcomes[0].overrideState).toBe('hidden');
    expect(app.outcomes[0].hasActionableChange).toBe(true);
    expect(element.querySelector('input').value).toBe('hidden');
    expect(app.updateActionButtonsForToken).toHaveBeenCalledWith('observer', true, {
      row: element.querySelector('tr'),
    });
  });
});
