/**
 * @jest-environment jsdom
 */

import {
  bindSeekInlineControls,
  toggleSeekHideFoundryHidden,
  toggleSeekIgnoreAllies,
  toggleSeekReactionsDropdown,
} from '../../../scripts/chat/dialogs/Seek/seek-dialog-controls.js';

describe('seek dialog controls', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.game = {
      settings: {
        set: jest.fn(async () => undefined),
      },
    };
  });

  function buildApp(overrides = {}) {
    return {
      bulkActionState: 'applied',
      outcomes: [],
      render: jest.fn(async () => undefined),
      getFilteredOutcomes: jest.fn(async () => [{ target: { id: 't1' } }]),
      toggleReactionsDropdown: jest.fn(),
      applyReaction: jest.fn(async () => undefined),
      applySenseUnseen: jest.fn(async () => undefined),
      ...overrides,
    };
  }

  test('toggle handlers update state, reset bulk state, and persist settings when needed', async () => {
    const app = buildApp();

    await toggleSeekIgnoreAllies(app, { checked: true });
    await toggleSeekHideFoundryHidden(app, { checked: false });

    expect(app.ignoreAllies).toBe(true);
    expect(app.hideFoundryHidden).toBe(false);
    expect(app.bulkActionState).toBe('initial');
    expect(game.settings.set).toHaveBeenCalledWith('pf2e-visioner', 'ignoreAllies', true);
    expect(game.settings.set).toHaveBeenCalledWith(
      'pf2e-visioner',
      'hideFoundryHiddenTokens',
      false,
    );
    expect(app.render).toHaveBeenCalledWith({ force: true });
  });

  test('inline filtering toggles refresh visible outcomes before rerender', async () => {
    const app = buildApp();
    const content = document.createElement('div');
    content.innerHTML = '<input type="checkbox" data-action="toggleIgnoreWalls" checked />';

    bindSeekInlineControls(app, content);
    content.querySelector('input').dispatchEvent(new Event('change', { bubbles: true }));

    await Promise.resolve();

    expect(app.ignoreWalls).toBe(true);
    expect(app.outcomes).toEqual([{ target: { id: 't1' } }]);
    expect(app.render).toHaveBeenCalledWith({ force: true });
  });

  test('reaction controls delegate through app methods', async () => {
    const app = buildApp();
    const content = document.createElement('div');
    content.innerHTML = `
      <button data-action="toggleReactions"></button>
      <button data-reaction="senseTheUnseen"></button>
      <button data-action="applySenseUnseen"></button>
    `;

    bindSeekInlineControls(app, content);
    content.querySelector('[data-action="toggleReactions"]').click();
    content.querySelector('[data-reaction]').click();
    content.querySelector('[data-action="applySenseUnseen"]').click();

    await Promise.resolve();

    expect(app.toggleReactionsDropdown).toHaveBeenCalled();
    expect(app.applyReaction).toHaveBeenCalledWith('senseTheUnseen');
    expect(app.applySenseUnseen).toHaveBeenCalled();
  });

  test('reaction dropdown toggles display and active classes', () => {
    const element = document.createElement('div');
    element.innerHTML = `
      <button class="reactions-toggle-button"></button>
      <i class="reactions-chevron"></i>
      <div class="reactions-dropdown" style="display: none"></div>
    `;

    toggleSeekReactionsDropdown({ element });
    expect(element.querySelector('.reactions-dropdown').style.display).toBe('block');
    expect(element.querySelector('.reactions-toggle-button').classList.contains('active')).toBe(
      true,
    );

    toggleSeekReactionsDropdown({ element });
    expect(element.querySelector('.reactions-dropdown').style.display).toBe('none');
    expect(element.querySelector('.reactions-chevron').classList.contains('rotated')).toBe(false);
  });
});
