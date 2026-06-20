import { VisibilityStateManager } from '../../../scripts/visibility/auto-visibility/core/VisibilityStateManager.js';

describe('VisibilityStateManager debug overhead', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    global.canvas.tokens.placeables = [
      createMockToken({ id: 'A', actor: { id: 'actor-a' } }),
      createMockToken({ id: 'B', actor: { id: 'actor-b' } }),
    ];
    global.canvas.grid = { size: 100 };
  });

  test('does not capture stack details when debug mode is disabled', () => {
    const debugStackFactory = jest.fn(() => 'Error\n    at caller');
    const debug = jest.fn();
    const batchProcessor = jest.fn();
    const manager = new VisibilityStateManager({
      batchProcessor,
      debugStackFactory,
      systemStateProvider: {
        debug,
        isDebugMode: jest.fn(() => false),
        isEnabled: jest.fn(() => true),
        shouldProcessEvents: jest.fn(() => true),
      },
    });

    manager.markTokenChangedImmediate('A');
    manager.markAllTokensChangedImmediate();
    manager.markAllTokensChangedThrottled();
    manager.recalculateForTokens(['A', 'B']);

    expect(debugStackFactory).not.toHaveBeenCalled();
    expect(debug).not.toHaveBeenCalledWith('VSM:recalculateForTokens', expect.anything());
  });

  test('captures stack details when debug mode is enabled', () => {
    const debugStackFactory = jest.fn(() => 'Error\n    at caller');
    const debug = jest.fn();
    const manager = new VisibilityStateManager({
      batchProcessor: jest.fn(),
      debugStackFactory,
      systemStateProvider: {
        debug,
        isDebugMode: jest.fn(() => true),
        isEnabled: jest.fn(() => true),
        shouldProcessEvents: jest.fn(() => true),
      },
    });

    manager.markTokenChangedImmediate('A');

    expect(debugStackFactory).toHaveBeenCalledTimes(1);
    expect(debug).toHaveBeenCalledWith(
      'VSM:markTokenChangedImmediate',
      expect.objectContaining({
        caller: 'at caller',
        stack: 'at caller',
      }),
    );
  });

  test('captures recalculate token details when debug mode is enabled', () => {
    const debugStackFactory = jest.fn(() => 'Error\n    at recalculateCaller');
    const debug = jest.fn();
    const manager = new VisibilityStateManager({
      batchProcessor: jest.fn(),
      debugStackFactory,
      systemStateProvider: {
        debug,
        isDebugMode: jest.fn(() => true),
        isEnabled: jest.fn(() => true),
        shouldProcessEvents: jest.fn(() => true),
      },
    });

    manager.recalculateForTokens(['A', 'B']);

    expect(debugStackFactory).toHaveBeenCalledTimes(1);
    expect(debug).toHaveBeenCalledWith(
      'VSM:recalculateForTokens',
      expect.objectContaining({
        tokenIds: ['A', 'B'],
        count: 2,
        caller: 'at recalculateCaller',
        stack: 'at recalculateCaller',
      }),
    );
  });
});
