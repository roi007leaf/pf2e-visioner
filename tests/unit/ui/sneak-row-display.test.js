/**
 * @jest-environment jsdom
 */

import '../../setup.js';

import {
  updateSneakOutcomeDisplayForToken,
  updateSneakVisibilityStateIndicators,
} from '../../../scripts/chat/dialogs/Sneak/sneak-row-display.js';

describe('sneak row display', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  function buildApp(element, overrides = {}) {
    return {
      element,
      getOutcomeClass: jest.fn(() => 'success'),
      getOutcomeLabel: jest.fn(() => 'Success'),
      updateActionButtonsForToken: jest.fn(),
      ...overrides,
    };
  }

  test('updates selected visibility indicator in one row', () => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>
        <span class="state-icon selected" data-state="observed"></span>
        <span class="state-icon" data-state="hidden"></span>
      </td>
    `;

    updateSneakVisibilityStateIndicators(row, 'hidden');

    expect(row.querySelector('[data-state="observed"]').classList.contains('selected')).toBe(
      false,
    );
    expect(row.querySelector('[data-state="hidden"]').classList.contains('selected')).toBe(true);
  });

  test('updates outcome row inside dialog root only', async () => {
    const outside = document.createElement('section');
    outside.innerHTML = `
      <table><tbody>
        <tr data-token-id="target-1">
          <td class="outcome"><span class="outcome-text">outside</span></td>
          <td><span class="state-icon selected" data-state="observed"></span></td>
          <td class="actions"></td>
        </tr>
      </tbody></table>
    `;
    const element = document.createElement('section');
    element.innerHTML = `
      <table><tbody>
        <tr data-token-id="target-1">
          <td class="outcome">
            <span class="outcome-primary"></span>
            <span class="outcome-text">inside</span>
          </td>
          <td>
            <span class="state-icon selected" data-state="observed"></span>
            <span class="state-icon" data-state="hidden"></span>
          </td>
          <td class="actions"></td>
        </tr>
      </tbody></table>
    `;
    document.body.append(outside, element);
    const app = buildApp(element);

    const outcome = {
      outcome: 'success',
      newVisibility: 'hidden',
      oldVisibility: 'observed',
      currentVisibility: 'observed',
    };
    await updateSneakOutcomeDisplayForToken(app, 'target-1', outcome);

    expect(outside.querySelector('.outcome-text').textContent).toBe('outside');
    expect(element.querySelector('.outcome-text').textContent).toBe('Success');
    expect(element.querySelector('.outcome').className).toBe('outcome success');
    expect(element.querySelector('.outcome-primary').className).toBe(
      'outcome-primary sneak-result-success',
    );
    expect(element.querySelector('[data-state="hidden"]').classList.contains('selected')).toBe(
      true,
    );
    expect(outcome.hasActionableChange).toBe(true);
    expect(outcome.hasRevertableChange).toBe(true);
    expect(element.querySelector('.apply-change')).not.toBeNull();
    expect(element.querySelector('.revert-change')).not.toBeNull();
    expect(app.updateActionButtonsForToken).toHaveBeenCalledWith('target-1', true);
  });

  test('keeps revert visible when current state differs but new state matches old state', async () => {
    const element = document.createElement('section');
    element.innerHTML = `
      <table><tbody>
        <tr data-token-id="target-1">
          <td class="outcome"><span class="outcome-text"></span></td>
          <td class="actions"></td>
        </tr>
      </tbody></table>
    `;
    const actionsCell = element.querySelector('.actions');
    const app = buildApp(element, {
      updateActionButtonsForToken: jest.fn(() => {
        actionsCell.innerHTML = '<span class="no-action">No Change</span>';
      }),
    });

    const outcome = {
      outcome: 'success',
      newVisibility: 'hidden',
      oldVisibility: 'observed',
      currentVisibility: 'hidden',
      overrideState: 'observed',
    };
    await updateSneakOutcomeDisplayForToken(app, 'target-1', outcome);

    expect(outcome.hasActionableChange).toBe(false);
    expect(outcome.hasRevertableChange).toBe(true);
    expect(element.querySelector('.apply-change')).toBeNull();
    expect(element.querySelector('.revert-change').style.display).toBe('inline-flex');
    expect(element.querySelector('.no-action').textContent).toBe(
      'PF2E_VISIONER.UI.NO_CHANGE_LABEL',
    );
  });
});
