/**
 * @jest-environment jsdom
 */

import {
  applySeekOverrideState,
  filterSeekOverrideStatesForOutcome,
  isCurrentSeekStateAvsControlled,
  isOldSeekStateAvsControlled,
  updateSeekIconSelection,
} from '../../../scripts/chat/dialogs/Seek/seek-override-state.js';

describe('seek override state', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.game = {
      settings: {
        get: jest.fn(() => true),
      },
    };
  });

  test('filters AVS override state for walls, loot, and hazards', () => {
    const states = [{ value: 'observed' }, { value: 'avs' }];

    expect(filterSeekOverrideStatesForOutcome(states, { _isWall: true })).toEqual([
      { value: 'observed' },
    ]);
    expect(
      filterSeekOverrideStatesForOutcome(states, { target: { actor: { type: 'loot' } } }),
    ).toEqual([{ value: 'observed' }]);
    expect(filterSeekOverrideStatesForOutcome(states, { target: { actor: { type: 'npc' } } }))
      .toEqual(states);
  });

  test('detects old AVS control only when AVS enabled and no manual override flag exists', () => {
    const app = { actorToken: { id: 'observer' } };
    const target = {
      document: {
        getFlag: jest.fn(() => false),
      },
    };

    expect(isOldSeekStateAvsControlled(app, { target })).toBe(true);

    target.document.getFlag.mockReturnValueOnce('hidden');
    expect(isOldSeekStateAvsControlled(app, { target })).toBe(false);

    game.settings.get.mockReturnValueOnce(false);
    expect(isOldSeekStateAvsControlled(app, { target })).toBe(false);
  });

  test('current AVS control excludes wall/loot/hazard outcomes before base check', () => {
    const base = jest.fn(() => true);

    expect(isCurrentSeekStateAvsControlled({ _isWall: true }, base)).toBe(false);
    expect(isCurrentSeekStateAvsControlled({ target: { actor: { type: 'hazard' } } }, base))
      .toBe(false);
    expect(isCurrentSeekStateAvsControlled({ target: { actor: { type: 'npc' } } }, base)).toBe(
      true,
    );
  });

  test('updates icon selection and hidden input for target row', () => {
    const element = document.createElement('table');
    element.innerHTML = `
      <tr>
        <td><button data-token-id="t1"></button></td>
        <td>
          <span class="state-icon" data-state="hidden"></span>
          <span class="state-icon selected" data-state="observed"></span>
          <input type="hidden" value="observed" />
        </td>
      </tr>
    `;

    updateSeekIconSelection({ element }, 't1', 'hidden');

    expect(element.querySelector('[data-state="hidden"]').classList.contains('selected')).toBe(
      true,
    );
    expect(element.querySelector('[data-state="observed"]').classList.contains('selected')).toBe(
      false,
    );
    expect(element.querySelector('input').value).toBe('hidden');
  });

  test('applies override state and updates row controls', () => {
    const app = {
      outcomes: [{ target: { id: 't1' }, overrideState: null }],
      getOutcomeTokenId: (outcome) => outcome.target.id,
      calculateHasActionableChange: jest.fn(() => true),
      updateIconSelection: jest.fn(),
      updateActionButtonsForToken: jest.fn(),
      updateChangesCount: jest.fn(),
    };

    applySeekOverrideState(app, {
      dataset: { tokenId: 't1', state: 'hidden' },
    });

    expect(app.outcomes[0].overrideState).toBe('hidden');
    expect(app.outcomes[0].hasActionableChange).toBe(true);
    expect(app.updateIconSelection).toHaveBeenCalledWith('t1', 'hidden', false);
    expect(app.updateActionButtonsForToken).toHaveBeenCalledWith('t1', true, { isWall: false });
    expect(app.updateChangesCount).toHaveBeenCalled();
  });
});
