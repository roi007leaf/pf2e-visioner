/**
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';
import {
  buildTooltipTokenManagerRequest,
  highlightTokenManagerRow,
  scheduleTokenManagerRowHighlight,
} from '../../../scripts/services/HoverTooltip/hover-tooltip-token-manager-click.js';

describe('hover tooltip token-manager click helpers', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  function token(id) {
    return { id };
  }

  test('target badges with actual target open target mode and highlight observer row', () => {
    const observerToken = token('observer');
    const targetToken = token('badge-target');
    const actualTarget = token('actual-target');

    expect(
      buildTooltipTokenManagerRequest({
        observerToken,
        targetToken,
        actualTarget,
        mode: 'target',
      }),
    ).toEqual({
      tokenToOpen: actualTarget,
      modeToUse: 'target',
      rowTokenId: 'observer',
    });
  });

  test('observer badges open observer mode and highlight target row', () => {
    const observerToken = token('observer');
    const targetToken = token('target');

    expect(
      buildTooltipTokenManagerRequest({
        observerToken,
        targetToken,
        mode: 'observer',
      }),
    ).toEqual({
      tokenToOpen: observerToken,
      modeToUse: 'observer',
      rowTokenId: 'target',
    });
  });

  test('highlights token rows by attribute value without CSS selector interpolation', () => {
    document.body.innerHTML = `
      <section class="visibility-section">
        <table>
          <tr class="token-row row-hover" data-token-id="old"></tr>
          <tr class="token-row" data-token-id="bad&quot;token"></tr>
        </table>
      </section>
    `;
    const app = { element: document.body, activeTab: 'visibility' };
    const scrollIntoView = jest.fn();
    const targetRow = Array.from(document.querySelectorAll('tr[data-token-id]')).find(
      (row) => row.getAttribute('data-token-id') === 'bad"token',
    );
    targetRow.scrollIntoView = scrollIntoView;

    const result = highlightTokenManagerRow({
      app,
      rowTokenId: 'bad"token',
      requestAnimationFrameFn: (callback) => callback(),
    });

    expect(result).toBe('highlighted');
    expect(document.querySelector('tr[data-token-id="old"]').classList.contains('row-hover')).toBe(
      false,
    );
    expect(targetRow.classList.contains('row-hover')).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
  });

  test('retries highlight while token-manager element is not ready', () => {
    jest.useFakeTimers();
    const app = {};
    const setTimeoutFn = jest.fn((callback, delay) => setTimeout(callback, delay));

    scheduleTokenManagerRowHighlight({
      app,
      rowTokenId: 'target',
      setTimeoutFn,
      maxRetries: 1,
      retryDelayMs: 50,
    });

    expect(setTimeoutFn).toHaveBeenCalledWith(expect.any(Function), 50);

    app.element = document.createElement('div');
    app.element.innerHTML = `
      <section class="visibility-section">
        <table><tr class="token-row" data-token-id="target"></tr></table>
      </section>
    `;
    const row = app.element.querySelector('tr[data-token-id="target"]');
    row.scrollIntoView = jest.fn();

    jest.advanceTimersByTime(50);

    expect(row.classList.contains('row-hover')).toBe(true);
  });
});
