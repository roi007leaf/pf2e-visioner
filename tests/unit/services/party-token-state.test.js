import '../../setup.js';
import { jest } from '@jest/globals';

const mockGetVisibilityMap = jest.fn();
const mockSetVisibilityMap = jest.fn();
const mockGetCoverMap = jest.fn();
const mockSetCoverMap = jest.fn();

jest.mock('../../../scripts/stores/visibility-map.js', () => ({
  getVisibilityMap: (...args) => mockGetVisibilityMap(...args),
  normalizeVisibilityMap: (map = {}) =>
    Object.fromEntries(Object.entries(map).filter(([, state]) => state && state !== 'observed')),
  setVisibilityMap: (...args) => mockSetVisibilityMap(...args),
}));

jest.mock('../../../scripts/stores/cover-map.js', () => ({
  getCoverMap: (...args) => mockGetCoverMap(...args),
  setCoverMap: (...args) => mockSetCoverMap(...args),
}));

describe('Party token state normalization', () => {
  let scene;

  beforeEach(() => {
    jest.clearAllMocks();

    scene = {
      flags: {
        'pf2e-visioner': {
          partyTokenStateCache: {},
          deferredPartyUpdates: {},
        },
      },
      getFlag: jest.fn((moduleId, key) => scene.flags[moduleId]?.[key] || {}),
      setFlag: jest.fn(async (moduleId, key, value) => {
        scene.flags[moduleId] = scene.flags[moduleId] || {};
        scene.flags[moduleId][key] = value;
        return true;
      }),
      updateEmbeddedDocuments: jest.fn(async () => []),
    };

    global.game.user.isGM = true;
    global.canvas.scene = scene;
    global.canvas.tokens.get = jest.fn();
    global.canvas.tokens.placeables = [];
  });

  test('saveTokenStateForParty drops default observed and none states', async () => {
    const { saveTokenStateForParty } = await import('../../../scripts/services/party-token-state.js');

    const actor = { id: 'actor-1', signature: 'sig-1', items: { size: 0 } };
    const tokenDoc = {
      id: 'token-1',
      actor,
      parent: scene,
      name: 'Token One',
      object: null,
    };
    const token = { id: 'token-1', actor, document: tokenDoc, name: 'Token One' };
    tokenDoc.object = token;

    mockGetVisibilityMap.mockReturnValue({
      targetA: 'hidden',
      targetB: 'observed',
    });
    mockGetCoverMap.mockReturnValue({
      targetA: 'standard',
      targetB: 'none',
    });
    global.canvas.tokens.get.mockReturnValue(token);

    await saveTokenStateForParty(tokenDoc);

    const cache = scene.flags['pf2e-visioner'].partyTokenStateCache;
    expect(cache['sig-1'].visibility).toEqual({ targetA: 'hidden' });
    expect(cache['sig-1'].cover).toEqual({ targetA: 'standard' });
  });

  test('restoreTokenStateFromParty skips restoring observed-only visibility maps', async () => {
    const { restoreTokenStateFromParty } = await import('../../../scripts/services/party-token-state.js');

    const actor = { id: 'actor-1', signature: 'sig-1', itemTypes: { effect: [] } };
    const tokenDoc = {
      id: 'token-1',
      actor,
      parent: scene,
      name: 'Token One',
      object: null,
    };
    const token = { id: 'token-1', actor, document: tokenDoc, name: 'Token One' };
    tokenDoc.object = token;

    scene.flags['pf2e-visioner'].partyTokenStateCache = {
      'sig-1': {
        tokenId: 'old-token',
        actorId: 'actor-1',
        actorSignature: 'sig-1',
        savedAt: Date.now(),
        visibility: { targetA: 'observed' },
        cover: { targetA: 'none' },
        observerStates: {},
        effects: [],
      },
    };

    global.canvas.tokens.get.mockReturnValue(token);

    const restored = await restoreTokenStateFromParty(tokenDoc);

    expect(restored).toBe(true);
    expect(mockSetVisibilityMap).not.toHaveBeenCalled();
    expect(mockSetCoverMap).not.toHaveBeenCalled();
  });

  test('isLikelyPartyTokenRestoration skips cache entries for the same token id', async () => {
    const { isLikelyPartyTokenRestoration } = await import('../../../scripts/services/party-token-state.js');

    const actor = { id: 'actor-1', signature: 'sig-1' };
    const tokenDoc = {
      id: 'token-1',
      actor,
      parent: scene,
      getFlag: jest.fn(() => null),
    };

    scene.flags['pf2e-visioner'].partyTokenStateCache = {
      'sig-1': {
        tokenId: 'token-1',
        actorId: 'actor-1',
        actorSignature: 'sig-1',
        savedAt: Date.now(),
        visibility: {},
        cover: {},
        observerStates: {},
        effects: [],
      },
    };

    expect(isLikelyPartyTokenRestoration(tokenDoc)).toBe(false);
  });

  test('isLikelyPartyTokenRestoration skips states already restored onto the token', async () => {
    const { isLikelyPartyTokenRestoration } = await import('../../../scripts/services/party-token-state.js');
    const savedAt = Date.now();

    const actor = { id: 'actor-1', signature: 'sig-1' };
    const tokenDoc = {
      id: 'token-2',
      actor,
      parent: scene,
      getFlag: jest.fn((moduleId, key) => {
        if (moduleId === 'pf2e-visioner' && key === 'partyStateRestoredAt') {
          return savedAt;
        }
        return null;
      }),
    };

    scene.flags['pf2e-visioner'].partyTokenStateCache = {
      'sig-1': {
        tokenId: 'token-1',
        actorId: 'actor-1',
        actorSignature: 'sig-1',
        savedAt,
        visibility: {},
        cover: {},
        observerStates: {},
        effects: [],
      },
    };

    expect(isLikelyPartyTokenRestoration(tokenDoc)).toBe(false);
  });

  test('restoreTokenStateFromParty marks successful restorations on the token', async () => {
    const { restoreTokenStateFromParty } = await import('../../../scripts/services/party-token-state.js');
    const savedAt = Date.now();

    const actor = { id: 'actor-1', signature: 'sig-1', itemTypes: { effect: [] } };
    const tokenDoc = {
      id: 'token-2',
      actor,
      parent: scene,
      name: 'Token Two',
      object: null,
      getFlag: jest.fn(() => null),
      setFlag: jest.fn(async () => true),
    };
    const token = { id: 'token-2', actor, document: tokenDoc, name: 'Token Two' };
    tokenDoc.object = token;

    scene.flags['pf2e-visioner'].partyTokenStateCache = {
      'sig-1': {
        tokenId: 'token-1',
        actorId: 'actor-1',
        actorSignature: 'sig-1',
        savedAt,
        visibility: {},
        cover: {},
        observerStates: {},
        effects: [],
      },
    };

    global.canvas.tokens.get.mockReturnValue(token);

    const restored = await restoreTokenStateFromParty(tokenDoc);

    expect(restored).toBe(true);
    expect(tokenDoc.setFlag).toHaveBeenCalledWith(
      'pf2e-visioner',
      'partyStateRestoredAt',
      savedAt,
    );
  });
});
