import '../../../setup.js';
import {
  _socketService,
  bindDoorPeekApprovalPanLink,
  buildDoorPeekApprovalContent,
  collectPeekRefreshTokenIds,
  doorPeekApprovalRequestHandler,
  doorPeekApprovalResponseHandler,
  executeSocketForUser,
  panCanvasToDoor,
  peekEndHandler,
  refreshPeekRevealTargets,
  peekRevealRefreshHandler,
  peekUpdateHandler,
  requestGMDoorPeekApproval,
  schedulePeekRevealRefresh,
} from '../../../../scripts/services/socket.js';
import { peekRegistry } from '../../../../scripts/services/Peek/PeekRegistry.js';
import { consumeFullVisibilityScopeRecalc } from '../../../../scripts/services/runtime-state.js';

describe('GM peek socket handlers', () => {
  let sceneId;
  beforeEach(() => {
    sceneId = global.canvas?.scene?.id;
    global.game.user.isGM = true;
  });
  afterEach(() => {
    peekRegistry.clearAll();
    global.game.user.isGM = true;
    consumeFullVisibilityScopeRecalc();
  });

  test('peekUpdateHandler ignores non-GM', () => {
    global.game.user.isGM = false;
    peekUpdateHandler({ tokenId: 't', sceneId, origin: { x: 1, y: 2 }, direction: 0, fov: 90, ignoredWallIds: [] });
    expect(peekRegistry.has('t')).toBe(false);
  });

  test('peekUpdateHandler ignores other scenes', () => {
    peekUpdateHandler({ tokenId: 't', sceneId: 'OTHER', origin: { x: 1, y: 2 }, direction: 0, fov: 90, ignoredWallIds: [] });
    expect(peekRegistry.has('t')).toBe(false);
  });

  test('peekUpdateHandler stores on this scene as GM', () => {
    peekUpdateHandler({ tokenId: 't', sceneId, origin: { x: 1, y: 2 }, direction: 0, fov: 90, ignoredWallIds: ['w'] });
    expect(peekRegistry.get('t').ignoredWallIds).toEqual(['w']);
  });

  test('peekUpdateHandler forces full-scope AVS recalc instead of GM viewport filtering', () => {
    const originalModules = global.game.modules;
    const updateTokens = jest.fn();
    global.game.modules = {
      get: jest.fn(() => ({ api: { autoVisibility: { updateTokens } } })),
    };

    try {
      peekUpdateHandler({
        tokenId: 'peeker',
        sceneId,
        origin: { x: 0, y: 0 },
        direction: 0,
        fov: 30,
        ignoredWallIds: ['door1'],
        userId: 'player1',
      });

      expect(updateTokens).toHaveBeenCalledWith(['peeker']);
      expect(consumeFullVisibilityScopeRecalc()).toBe(true);
    } finally {
      global.game.modules = originalModules;
    }
  });

  test('peekUpdateHandler schedules a targeted reveal refresh for the peeking player', () => {
    jest.useFakeTimers();
    const originalSocket = _socketService._socket;
    const originalTokens = global.canvas.tokens;
    const executeForUsers = jest.fn();
    _socketService._socket = { executeForUsers };
    global.canvas.tokens = {
      ...global.canvas.tokens,
      placeables: [
        { id: 'peeker', document: { id: 'peeker', x: 0, y: 0, width: 1, height: 1 } },
        { id: 'inside', document: { id: 'inside', x: 100, y: 0, width: 1, height: 1 } },
        { id: 'outside', document: { id: 'outside', x: 0, y: 100, width: 1, height: 1 } },
      ],
    };

    try {
      peekUpdateHandler({
        tokenId: 'peeker',
        sceneId,
        origin: { x: 0, y: 0 },
        direction: 0,
        fov: 30,
        range: 0,
        ignoredWallIds: ['door1'],
        userId: 'player1',
      });
      jest.advanceTimersByTime(75);

      expect(executeForUsers).toHaveBeenCalledWith(
        'PeekRevealRefresh',
        ['player1'],
        expect.objectContaining({
          tokenId: 'peeker',
          targetIds: expect.arrayContaining(['peeker', 'inside']),
        }),
      );
      expect(executeForUsers.mock.calls[0][2].targetIds).not.toContain('outside');
    } finally {
      jest.useRealTimers();
      _socketService._socket = originalSocket;
      global.canvas.tokens = originalTokens;
    }
  });

  test('schedulePeekRevealRefresh coalesces rapid re-aim calls for the same token into a single send', () => {
    jest.useFakeTimers();
    const originalSocket = _socketService._socket;
    const executeForUsers = jest.fn();
    _socketService._socket = { executeForUsers };

    try {
      schedulePeekRevealRefresh('player1', { sceneId, tokenId: 'peeker', targetIds: ['a'] });
      schedulePeekRevealRefresh('player1', { sceneId, tokenId: 'peeker', targetIds: ['a', 'b'] });
      schedulePeekRevealRefresh('player1', { sceneId, tokenId: 'peeker', targetIds: ['a', 'b', 'c'] });

      jest.advanceTimersByTime(75);

      expect(executeForUsers).toHaveBeenCalledTimes(1);
      expect(executeForUsers).toHaveBeenCalledWith(
        'PeekRevealRefresh',
        ['player1'],
        expect.objectContaining({ targetIds: ['a', 'b', 'c'] }),
      );
    } finally {
      jest.useRealTimers();
      _socketService._socket = originalSocket;
    }
  });

  test('collectPeekRefreshTokenIds respects fov and range', () => {
    const ids = collectPeekRefreshTokenIds(
      {
        tokenId: 'peeker',
        origin: { x: 0, y: 0 },
        direction: 0,
        fov: 30,
        range: 125,
      },
      {
        tokens: [
          { id: 'near', center: { x: 100, y: 0 }, document: { id: 'near', width: 1, height: 1 } },
          { id: 'wide', center: { x: 100, y: 100 }, document: { id: 'wide', width: 1, height: 1 } },
          { id: 'far', center: { x: 500, y: 0 }, document: { id: 'far', width: 1, height: 1 } },
        ],
      },
    );

    expect(ids).toEqual(['peeker', 'near']);
  });

  test('peekRevealRefreshHandler refreshes targeted visuals immediately and after replication delays', async () => {
    const refreshTargets = jest.fn(async () => {});
    const refreshPerception = jest.fn();
    const timers = [];
    const setTimer = jest.fn((fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    });

    const handled = await peekRevealRefreshHandler(
      { sceneId, tokenId: 'peeker', targetIds: ['inside'] },
      { refreshTargets, refreshPerception, setTimer },
    );

    expect(handled).toBe(true);
    expect(refreshTargets).toHaveBeenCalledWith(['inside']);
    expect(refreshPerception).toHaveBeenCalledTimes(1);
    expect(timers.map((timer) => timer.ms)).toEqual([75, 200]);

    timers[0].fn();
    await Promise.resolve();
    timers[1].fn();
    await Promise.resolve();

    expect(refreshTargets).toHaveBeenCalledTimes(3);
    expect(refreshPerception).toHaveBeenCalledTimes(3);
  });

  test('refreshPeekRevealTargets re-evaluates targets that are currently invisible', () => {
    const hiddenTarget = {
      id: 'inside',
      visible: false,
      renderFlags: { set: jest.fn() },
      refresh: jest.fn(),
    };
    const tokensLayer = { get: jest.fn((id) => (id === 'inside' ? hiddenTarget : null)) };

    expect(refreshPeekRevealTargets(['inside', 'missing', 'inside'], { tokensLayer })).toBe(1);
    expect(hiddenTarget.renderFlags.set).toHaveBeenCalledWith({
      refreshState: true,
      refreshMesh: true,
      refreshVisibility: true,
    });
    expect(hiddenTarget.refresh).toHaveBeenCalledTimes(1);
  });

  test('refreshPeekRevealTargets skips a token whose turn marker mesh is not ready yet', () => {
    const notReadyTarget = {
      id: 'inside',
      visible: false,
      turnMarker: { mesh: null },
      renderFlags: { set: jest.fn() },
      refresh: jest.fn(),
    };
    const tokensLayer = { get: jest.fn(() => notReadyTarget) };

    expect(refreshPeekRevealTargets(['inside'], { tokensLayer })).toBe(0);
    expect(notReadyTarget.renderFlags.set).not.toHaveBeenCalled();
    expect(notReadyTarget.refresh).not.toHaveBeenCalled();
  });

  test('refreshPeekRevealTargets refreshes a token whose turn marker mesh is ready', () => {
    const readyTarget = {
      id: 'inside',
      visible: false,
      turnMarker: { mesh: {} },
      renderFlags: { set: jest.fn() },
      refresh: jest.fn(),
    };
    const tokensLayer = { get: jest.fn(() => readyTarget) };

    expect(refreshPeekRevealTargets(['inside'], { tokensLayer })).toBe(1);
    expect(readyTarget.refresh).toHaveBeenCalledTimes(1);
  });

  test('peekEndHandler clears', () => {
    peekRegistry.set('t', { origin: { x: 0, y: 0 }, direction: 0, fov: 90, ignoredWallIds: [] }, 1);
    peekEndHandler({ tokenId: 't', sceneId });
    expect(peekRegistry.has('t')).toBe(false);
  });

  test('peekEndHandler ignores non-GM', () => {
    global.game.user.isGM = false;
    peekRegistry.set('t', { origin: { x: 0, y: 0 }, direction: 0, fov: 90, ignoredWallIds: [] }, 1);
    peekEndHandler({ tokenId: 't', sceneId });
    expect(peekRegistry.has('t')).toBe(true);
  });

  test('peekEndHandler ignores other scenes', () => {
    peekRegistry.set('t', { origin: { x: 0, y: 0 }, direction: 0, fov: 90, ignoredWallIds: [] }, 1);
    peekEndHandler({ tokenId: 't', sceneId: 'OTHER' });
    expect(peekRegistry.has('t')).toBe(true);
  });
});

describe('door peek approval socket handlers', () => {
  let sceneId;
  let originalSocket;
  let originalModules;

  beforeEach(() => {
    sceneId = global.canvas?.scene?.id;
    originalSocket = _socketService._socket;
    originalModules = global.game.modules;
    global.game.user.isGM = true;
  });

  afterEach(() => {
    _socketService._socket = originalSocket;
    global.game.modules = originalModules;
    global.game.user.isGM = true;
  });

  test('requestGMDoorPeekApproval sends an approval request to the GM', () => {
    const executeAsGM = jest.fn();
    _socketService._socket = { executeAsGM };

    const sent = requestGMDoorPeekApproval({ requestId: 'r1', tokenId: 't', wallId: 'w' });

    expect(sent).toBe(true);
    expect(executeAsGM).toHaveBeenCalledWith(
      'DoorPeekApprovalRequest',
      expect.objectContaining({ requestId: 'r1' }),
    );
  });

  test('GM approval request opens confirm path and sends targeted approval response', async () => {
    const executeForUsers = jest.fn();
    _socketService._socket = { executeForUsers };

    await doorPeekApprovalRequestHandler(
      { requestId: 'r1', sceneId, tokenId: 't', wallId: 'w', userId: 'player1' },
      { confirm: jest.fn(async () => true) },
    );

    expect(executeForUsers).toHaveBeenCalledWith(
      'DoorPeekApprovalResponse',
      ['player1'],
      expect.objectContaining({ requestId: 'r1', approved: true }),
    );
  });

  test('targeted socket helper uses socketlib executeForUsers argument order', () => {
    const executeForUsers = jest.fn();
    _socketService._socket = { executeForUsers };

    const sent = executeSocketForUser('DoorPeekApprovalResponse', 'player1', { requestId: 'r1' });

    expect(sent).toBe(true);
    expect(executeForUsers).toHaveBeenCalledWith(
      'DoorPeekApprovalResponse',
      ['player1'],
      { requestId: 'r1' },
    );
  });

  test('approval response is delivered to the local peek manager', async () => {
    const handleDoorPeekApprovalResponse = jest.fn(async () => true);
    global.game.modules = {
      get: jest.fn(() => ({ api: { peekManager: { handleDoorPeekApprovalResponse } } })),
    };

    const handled = await doorPeekApprovalResponseHandler({
      requestId: 'r1',
      sceneId,
      approved: true,
    });

    expect(handled).toBe(true);
    expect(handleDoorPeekApprovalResponse).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'r1', approved: true }),
    );
  });

  test('approval dialog content makes the door id visibly clickable', () => {
    const content = buildDoorPeekApprovalContent({
      userName: 'Player',
      tokenName: 'Celdar',
      doorName: 'North Door',
      wallId: 'door1',
    });

    expect(content).toContain('data-action="pan-door"');
    expect(content).toContain('data-wall-id="door1"');
    expect(content).toContain('door1');
  });

  test('clicking the door id pans canvas to the door midpoint', () => {
    const originalCanvas = global.canvas;
    const animatePan = jest.fn();
    global.canvas = {
      ...global.canvas,
      animatePan,
      walls: {
        get: jest.fn(() => ({ document: { c: [10, 20, 30, 40] } })),
      },
    };
    const root = document.createElement('div');
    root.innerHTML = buildDoorPeekApprovalContent({
      userName: 'Player',
      tokenName: 'Celdar',
      doorName: 'North Door',
      wallId: 'door1',
    });

    try {
      bindDoorPeekApprovalPanLink(root);
      root.querySelector('[data-action="pan-door"]').click();

      expect(animatePan).toHaveBeenCalledWith({ x: 20, y: 30, duration: 500 });
    } finally {
      global.canvas = originalCanvas;
    }
  });

  test('panCanvasToDoor returns false for a missing wall', () => {
    const originalCanvas = global.canvas;
    global.canvas = {
      ...global.canvas,
      walls: { get: jest.fn(() => null), placeables: [] },
      scene: { walls: { get: jest.fn(() => null) } },
    };

    try {
      expect(panCanvasToDoor('missing')).toBe(false);
    } finally {
      global.canvas = originalCanvas;
    }
  });
});
