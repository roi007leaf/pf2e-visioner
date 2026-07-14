import '../../setup.js';

describe('StealthInitiativeCoverCoordinator', () => {
  let mockDialogInstances;
  let mockWaitingDialogInstances;
  let requestGMStealthInitiativeCover;
  let sendStealthInitiativeCoverResponse;
  let coordinator;

  beforeEach(async () => {
    jest.resetModules();
    mockDialogInstances = [];
    mockWaitingDialogInstances = [];

    jest.doMock('../../../scripts/cover/QuickOverrideDialog.js', () => ({
      __esModule: true,
      CoverQuickOverrideDialog: jest.fn().mockImplementation((initialState, manualCover, options) => {
        const instance = {
          initialState,
          manualCover,
          options,
          _resolver: null,
          setResolver: jest.fn((fn) => {
            instance._resolver = fn;
          }),
          render: jest.fn(),
        };
        mockDialogInstances.push(instance);
        return instance;
      }),
    }));

    jest.doMock('../../../scripts/cover/StealthInitiativeCoverWaitingDialog.js', () => ({
      __esModule: true,
      StealthInitiativeCoverWaitingDialog: jest.fn().mockImplementation(() => {
        const instance = {
          render: jest.fn(),
          close: jest.fn(),
        };
        mockWaitingDialogInstances.push(instance);
        return instance;
      }),
    }));

    requestGMStealthInitiativeCover = jest.fn().mockReturnValue(true);
    sendStealthInitiativeCoverResponse = jest.fn();
    jest.doMock('../../../scripts/services/socket.js', () => ({
      __esModule: true,
      requestGMStealthInitiativeCover,
      sendStealthInitiativeCoverResponse,
    }));

    global.game.user.isGM = true;
    global.foundry.utils.randomID = jest.fn(() => 'request-id-1');

    const mod = await import(
      '../../../scripts/cover/auto-cover/StealthInitiativeCoverCoordinator.js'
    );
    coordinator = mod.default;
  });

  afterEach(() => {
    global.game.user.isGM = true;
  });

  test('returns the manual cover state immediately without opening a dialog', async () => {
    const hider = global.createMockToken({ id: 'hider', name: 'Aria' });

    const result = await coordinator.resolveCoverState({
      hider,
      suggestedState: 'lesser',
      manualCoverState: 'greater',
    });

    expect(result).toBe('greater');
    expect(mockDialogInstances).toHaveLength(0);
    expect(requestGMStealthInitiativeCover).not.toHaveBeenCalled();
  });

  test('clamps manual cover up to the higher auto-detected suggestion in mixed manual/auto scenarios', async () => {
    const hider = global.createMockToken({ id: 'hider', name: 'Aria' });

    const result = await coordinator.resolveCoverState({
      hider,
      suggestedState: 'greater',
      manualCoverState: 'lesser',
    });

    expect(result).toBe('greater');
    expect(mockDialogInstances).toHaveLength(0);
  });

  test('opens the dialog locally and resolves with the GM choice when the current client is GM', async () => {
    global.game.user.isGM = true;
    const hider = global.createMockToken({ id: 'hider', name: 'Aria' });

    const promise = coordinator.resolveCoverState({ hider, suggestedState: 'standard' });

    expect(mockDialogInstances).toHaveLength(1);
    mockDialogInstances[0]._resolver('greater');

    const result = await promise;

    expect(result).toBe('greater');
    expect(requestGMStealthInitiativeCover).not.toHaveBeenCalled();
  });

  test('falls back to the suggestion when the GM dialog is dismissed without a choice', async () => {
    global.game.user.isGM = true;
    const hider = global.createMockToken({ id: 'hider', name: 'Aria' });

    const promise = coordinator.resolveCoverState({ hider, suggestedState: 'standard' });
    mockDialogInstances[0]._resolver(null);

    expect(await promise).toBe('standard');
  });

  test('requests the GM over the socket and resolves once the GM responds', async () => {
    global.game.user.isGM = false;
    global.game.userId = 'player-1';
    const hider = global.createMockToken({ id: 'hider', name: 'Aria' });

    const promise = coordinator.resolveCoverState({ hider, suggestedState: 'lesser' });

    expect(requestGMStealthInitiativeCover).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'request-id-1',
        hiderTokenId: 'hider',
        hiderName: 'Aria',
        suggestedState: 'lesser',
        userId: 'player-1',
      }),
    );
    expect(mockWaitingDialogInstances).toHaveLength(1);

    coordinator.handleGMResponse({ requestId: 'request-id-1', chosenState: 'standard' });

    expect(await promise).toBe('standard');
    expect(mockWaitingDialogInstances[0].close).toHaveBeenCalled();
  });

  test('falls back to the suggestion when the socket request cannot be sent', async () => {
    global.game.user.isGM = false;
    requestGMStealthInitiativeCover.mockReturnValue(false);
    const hider = global.createMockToken({ id: 'hider', name: 'Aria' });

    const result = await coordinator.resolveCoverState({ hider, suggestedState: 'lesser' });

    expect(result).toBe('lesser');
    expect(mockWaitingDialogInstances).toHaveLength(0);
  });

  test('falls back to the suggestion when the GM never responds before the timeout', async () => {
    jest.useFakeTimers();
    global.game.user.isGM = false;
    const hider = global.createMockToken({ id: 'hider', name: 'Aria' });

    const promise = coordinator.resolveCoverState({ hider, suggestedState: 'lesser' });
    expect(mockWaitingDialogInstances).toHaveLength(1);
    jest.advanceTimersByTime(30000);

    expect(await promise).toBe('lesser');
    expect(mockWaitingDialogInstances[0].close).toHaveBeenCalled();
    jest.useRealTimers();
  });

  test('handleIncomingGMRequest opens the dialog and sends the response back to the requesting user', async () => {
    global.game.user.isGM = true;

    const handled = coordinator.handleIncomingGMRequest({
      requestId: 'req-9',
      hiderTokenId: 'hider-9',
      hiderName: 'Bram',
      suggestedState: 'lesser',
      userId: 'player-9',
    });

    expect(mockDialogInstances).toHaveLength(1);
    mockDialogInstances[0]._resolver('greater');
    await handled;

    expect(sendStealthInitiativeCoverResponse).toHaveBeenCalledWith('player-9', {
      requestId: 'req-9',
      chosenState: 'greater',
    });
  });

  test('handleIncomingGMRequest does nothing when the current client is not GM', async () => {
    global.game.user.isGM = false;

    await coordinator.handleIncomingGMRequest({
      requestId: 'req-10',
      hiderTokenId: 'hider-10',
      hiderName: 'Bram',
      suggestedState: 'lesser',
      userId: 'player-10',
    });

    expect(mockDialogInstances).toHaveLength(0);
    expect(sendStealthInitiativeCoverResponse).not.toHaveBeenCalled();
  });
});
