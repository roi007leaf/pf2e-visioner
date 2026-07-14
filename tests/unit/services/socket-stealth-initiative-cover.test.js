import '../../setup.js';
import {
  _socketService,
  requestGMStealthInitiativeCover,
  sendStealthInitiativeCoverResponse,
  stealthInitiativeCoverRequestHandler,
  stealthInitiativeCoverResponseHandler,
} from '../../../scripts/services/socket.js';

describe('stealth-initiative cover socket channels', () => {
  afterEach(() => {
    jest.resetModules();
  });

  test('requestGMStealthInitiativeCover sends the request payload to the GM and returns true', () => {
    const executeAsGM = jest.fn();
    const originalSocket = _socketService._socket;
    _socketService._socket = { executeAsGM };

    try {
      const sent = requestGMStealthInitiativeCover({
        requestId: 'req-1',
        hiderTokenId: 'hider-1',
        hiderName: 'Aria',
        suggestedState: 'standard',
        userId: 'player-1',
      });

      expect(sent).toBe(true);
      expect(executeAsGM).toHaveBeenCalledWith(
        'StealthInitiativeCoverRequest',
        expect.objectContaining({ requestId: 'req-1', hiderTokenId: 'hider-1' }),
      );
    } finally {
      _socketService._socket = originalSocket;
    }
  });

  test('requestGMStealthInitiativeCover returns false when no socket is registered', () => {
    const originalSocket = _socketService._socket;
    _socketService._socket = null;

    try {
      expect(requestGMStealthInitiativeCover({ requestId: 'req-1' })).toBe(false);
    } finally {
      _socketService._socket = originalSocket;
    }
  });

  test('stealthInitiativeCoverRequestHandler does nothing when the current user is not GM', async () => {
    global.game.user.isGM = false;
    const handleIncomingGMRequest = jest.fn();

    jest.doMock(
      '../../../scripts/cover/auto-cover/StealthInitiativeCoverCoordinator.js',
      () => ({ __esModule: true, default: { handleIncomingGMRequest } }),
      { virtual: true },
    );

    await stealthInitiativeCoverRequestHandler({ requestId: 'req-1' });

    expect(handleIncomingGMRequest).not.toHaveBeenCalled();

    global.game.user.isGM = true;
  });

  test('stealthInitiativeCoverRequestHandler delegates to the coordinator when GM', async () => {
    global.game.user.isGM = true;
    const handleIncomingGMRequest = jest.fn().mockResolvedValue(undefined);

    jest.doMock(
      '../../../scripts/cover/auto-cover/StealthInitiativeCoverCoordinator.js',
      () => ({ __esModule: true, default: { handleIncomingGMRequest } }),
      { virtual: true },
    );

    const payload = { requestId: 'req-2', hiderTokenId: 'hider-2', hiderName: 'Bram', suggestedState: 'lesser', userId: 'player-2' };
    await stealthInitiativeCoverRequestHandler(payload);

    expect(handleIncomingGMRequest).toHaveBeenCalledWith(payload);
  });

  test('sendStealthInitiativeCoverResponse forwards to the requesting user', () => {
    const executeForUsers = jest.fn();
    const originalSocket = _socketService._socket;
    _socketService._socket = { executeForUsers };

    try {
      sendStealthInitiativeCoverResponse('player-1', { requestId: 'req-1', chosenState: 'greater' });

      expect(executeForUsers).toHaveBeenCalledWith(
        'StealthInitiativeCoverResponse',
        ['player-1'],
        { requestId: 'req-1', chosenState: 'greater' },
      );
    } finally {
      _socketService._socket = originalSocket;
    }
  });

  test('stealthInitiativeCoverResponseHandler delegates to the coordinator', async () => {
    const handleGMResponse = jest.fn();

    jest.doMock(
      '../../../scripts/cover/auto-cover/StealthInitiativeCoverCoordinator.js',
      () => ({ __esModule: true, default: { handleGMResponse } }),
      { virtual: true },
    );

    const payload = { requestId: 'req-3', chosenState: 'standard' };
    await stealthInitiativeCoverResponseHandler(payload);

    expect(handleGMResponse).toHaveBeenCalledWith(payload);
  });
});
