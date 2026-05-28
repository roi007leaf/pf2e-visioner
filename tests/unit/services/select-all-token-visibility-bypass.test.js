import { jest } from '@jest/globals';

describe('select-all token visibility bypass', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    delete global.__pf2eVisionerSelectAllBypass;
    global.canvas.tokens = { placeables: [], controlled: [] };
    global.canvas.activeLayer = global.canvas.tokens;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('Ctrl+A on the active token layer primes a one-tick visibility bypass', async () => {
    const {
      isSelectAllTokenVisibilityBypassActive,
      primeSelectAllTokenVisibilityBypassFromKeyboard,
    } = await import('../../../scripts/services/Detection/select-all-token-visibility-bypass.js');

    expect(isSelectAllTokenVisibilityBypassActive()).toBe(false);

    const primed = primeSelectAllTokenVisibilityBypassFromKeyboard({
      ctrlKey: true,
      key: 'a',
      target: document.body,
    });

    expect(primed).toBe(true);
    expect(isSelectAllTokenVisibilityBypassActive()).toBe(true);

    jest.advanceTimersByTime(99);

    expect(isSelectAllTokenVisibilityBypassActive()).toBe(true);

    jest.advanceTimersByTime(1);

    expect(isSelectAllTokenVisibilityBypassActive()).toBe(false);
  });

  test('keeps bypass active while Ctrl+A selection still controls every selectable token', async () => {
    const {
      isSelectAllTokenVisibilityBypassActive,
      primeSelectAllTokenVisibilityBypassFromKeyboard,
    } = await import('../../../scripts/services/Detection/select-all-token-visibility-bypass.js');
    const observer = { document: { id: 'observer', hidden: false } };
    const target = { document: { id: 'target', hidden: false } };
    global.canvas.tokens = {
      placeables: [observer, target],
      controlled: [],
    };
    global.canvas.activeLayer = global.canvas.tokens;

    primeSelectAllTokenVisibilityBypassFromKeyboard({
      ctrlKey: true,
      key: 'a',
      target: document.body,
    });
    global.canvas.tokens.controlled = [observer, target];

    jest.advanceTimersByTime(100);

    expect(isSelectAllTokenVisibilityBypassActive()).toBe(true);

    global.canvas.tokens.controlled = [observer];

    expect(isSelectAllTokenVisibilityBypassActive()).toBe(false);
  });

  test('ignores Ctrl+A in editable elements', async () => {
    const {
      isSelectAllTokenVisibilityBypassActive,
      primeSelectAllTokenVisibilityBypassFromKeyboard,
    } = await import('../../../scripts/services/Detection/select-all-token-visibility-bypass.js');

    const input = document.createElement('input');
    const primed = primeSelectAllTokenVisibilityBypassFromKeyboard({
      ctrlKey: true,
      key: 'a',
      target: input,
    });

    expect(primed).toBe(false);
    expect(isSelectAllTokenVisibilityBypassActive()).toBe(false);
  });

  test('canvas visibility wrapper defers to core during select-all bypass', async () => {
    const { primeSelectAllTokenVisibilityBypassFromKeyboard } = await import(
      '../../../scripts/services/Detection/select-all-token-visibility-bypass.js'
    );
    const { wrapCanvasVisibilityTest } = await import(
      '../../../scripts/services/Detection/detection-canvas-visibility.js'
    );
    const wrapped = jest.fn(() => true);

    primeSelectAllTokenVisibilityBypassFromKeyboard({
      ctrlKey: true,
      key: 'a',
      target: document.body,
    });

    expect(wrapCanvasVisibilityTest(wrapped, [{ x: 0, y: 0 }], { object: { id: 'hidden' } }))
      .toBe(true);
    expect(wrapped).toHaveBeenCalledWith([{ x: 0, y: 0 }], { object: { id: 'hidden' } });
  });

  test('can-detect wrapper keeps core detection result during select-all bypass', async () => {
    const { primeSelectAllTokenVisibilityBypassFromKeyboard } = await import(
      '../../../scripts/services/Detection/select-all-token-visibility-bypass.js'
    );
    const { createCanDetectVisibilityWrapper } = await import(
      '../../../scripts/services/Detection/detection-can-detect.js'
    );
    const wrapped = jest.fn(() => true);
    const wrapper = createCanDetectVisibilityWrapper(1);

    primeSelectAllTokenVisibilityBypassFromKeyboard({
      ctrlKey: true,
      key: 'a',
      target: document.body,
    });

    expect(wrapper.call({ id: 'basicSight' }, wrapped, { object: { id: 'observer' } }, { id: 'target' }))
      .toBe(true);
  });
});
