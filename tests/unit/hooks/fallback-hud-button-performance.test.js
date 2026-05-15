import '../../setup.js';

describe('fallback HUD button performance', () => {
  let listeners;
  let originalAddEventListener;

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    listeners = { mousemove: 0, mouseup: 0 };
    originalAddEventListener = document.addEventListener;
    document.addEventListener = jest.fn((type, listener, options) => {
      if (type === 'mousemove' || type === 'mouseup') listeners[type] += 1;
      return originalAddEventListener.call(document, type, listener, options);
    });
    global.game.user.isGM = true;
    global.game.settings.get = jest.fn((moduleId, key) => {
      if (moduleId === 'pf2e-visioner' && key === 'useHudButton') return false;
      return false;
    });
  });

  afterEach(() => {
    document.addEventListener = originalAddEventListener;
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  test('repeated token control does not accumulate document drag listeners', async () => {
    const { setupFallbackHUDButton } = await import('../../../scripts/hooks/lifecycle.js');
    setupFallbackHUDButton();
    const controlTokenCallback = Hooks.on.mock.calls.find(([hook]) => hook === 'controlToken')?.[1];
    expect(controlTokenCallback).toBeInstanceOf(Function);

    const tokenA = createMockToken({ id: 'A' });
    const tokenB = createMockToken({ id: 'B' });

    controlTokenCallback(tokenA, true);
    controlTokenCallback(tokenB, true);
    controlTokenCallback(tokenA, true);

    expect(listeners.mousemove).toBe(1);
    expect(listeners.mouseup).toBe(1);
    expect(document.querySelectorAll('.pf2e-visioner-floating-button')).toHaveLength(1);
  });
});
