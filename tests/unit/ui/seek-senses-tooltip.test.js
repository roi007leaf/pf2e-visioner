/**
 * @jest-environment jsdom
 */

import {
  hideSeekSensesTooltip,
  setupSeekSensesButtonTooltips,
  showSeekSensesTooltip,
} from '../../../scripts/chat/dialogs/Seek/seek-senses-tooltip.js';

describe('seek senses tooltip', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    global.requestAnimationFrame = (callback) => callback();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    jest.useRealTimers();
    delete global.requestAnimationFrame;
  });

  test('binds button hover to show and hide tooltip content', () => {
    const app = {};
    const content = document.createElement('div');
    content.innerHTML = `
      <button class="senses-button" data-tooltip-html="sense-tip"></button>
      <div id="sense-tip"><strong>Precise vision</strong></div>
    `;

    setupSeekSensesButtonTooltips(app, content);
    const button = content.querySelector('button');
    button.dispatchEvent(new Event('mouseover', { bubbles: true }));

    expect(button.getAttribute('data-tooltip')).toBe('');
    expect(document.body.querySelector('.senses-tooltip-content')?.innerHTML).toContain(
      'Precise vision',
    );

    button.dispatchEvent(new Event('mouseout', { bubbles: true }));
    jest.advanceTimersByTime(200);

    expect(document.body.querySelector('.senses-tooltip-content')).toBeNull();
  });

  test('stale hide timer only removes old tooltip', () => {
    const app = {};
    const anchor = document.createElement('button');
    const first = document.createElement('div');
    const second = document.createElement('div');
    first.innerHTML = 'first';
    second.innerHTML = 'second';

    showSeekSensesTooltip(app, anchor, first);
    const firstTooltip = app._currentTooltip;
    showSeekSensesTooltip(app, anchor, second);
    const secondTooltip = app._currentTooltip;

    expect(firstTooltip).not.toBe(secondTooltip);
    jest.advanceTimersByTime(200);

    expect(document.body.contains(firstTooltip)).toBe(false);
    expect(document.body.contains(secondTooltip)).toBe(true);

    hideSeekSensesTooltip(app);
    jest.advanceTimersByTime(200);
    expect(document.body.contains(secondTooltip)).toBe(false);
  });
});
