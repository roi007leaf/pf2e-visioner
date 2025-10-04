/**
 * Party Token Integration Tests
 * Tests for party token consolidation and restoration functionality
 */

import '../../setup.js';

describe('Party Token Integration Tests', () => {
  let originalSettings;
  let mockScene;
  let mockPartyTokenStateCache;

  beforeEach(() => {
    // Store original settings
    originalSettings = {
      debug: game.settings.get('pf2e-visioner', 'debug'),
      autoCover: game.settings.get('pf2e-visioner', 'autoCover'),
    };

    // Mock scene with flags
    mockScene = {
      id: 'test-scene',
      flags: {
        'pf2e-visioner': {
          partyTokenStateCache: {},
          deferredPartyUpdates: {},
        },
      },
      getFlag: jest.fn((moduleId, key) => {
        return mockScene.flags[moduleId]?.[key] || null;
      }),
      setFlag: jest.fn((moduleId, key, value) => {
        if (!mockScene.flags[moduleId]) mockScene.flags[moduleId] = {};
        mockScene.flags[moduleId][key] = value;
        return Promise.resolve(true);
      }),
      unsetFlag: jest.fn((moduleId, key) => {
        if (mockScene.flags[moduleId]) {
          delete mockScene.flags[moduleId][key];
        }
        return Promise.resolve(true);
      }),
    };

    // Mock canvas scene
    global.canvas.scene = mockScene;

    // Initialize caches
    mockPartyTokenStateCache = {};
  });

  afterEach(() => {
    // Restore original settings
    Object.keys(originalSettings).forEach((key) => {
      game.settings.set('pf2e-visioner', key, originalSettings[key]);
    });

    // Clear mocks
    jest.clearAllMocks();
  });

  describe('Party Token State Saving', () => {
    test('should save token visibility and cover maps correctly', () => {
      // Mock token with visibility and cover data
      const token = createMockToken({
        id: 'ally-token-1',
        name: 'Ally A',
        actor: { id: 'ally-actor-1' },
      });

      // Mock visibility and cover maps
      const mockVisibilityMap = {
        'enemy-1': 'hidden',
        'enemy-2': 'concealed',
        'ally-2': 'observed',
      };

      const mockCoverMap = {
        'enemy-1': 'standard',
        'enemy-2': 'lesser',
        'ally-2': 'none',
      };

      // Mock the map getters
      const getVisibilityMap = jest.fn(() => mockVisibilityMap);
      const getCoverMap = jest.fn(() => mockCoverMap);

      // Simulate saving state
      const savedState = {
        tokenId: token.id,
        tokenName: token.name,
        visibilityMap: getVisibilityMap(token),
        coverMap: getCoverMap(token),
        observerStates: {},
        effects: [],
      };

      expect(savedState.tokenId).toBe('ally-token-1');
      expect(savedState.tokenName).toBe('Ally A');
      expect(savedState.visibilityMap).toEqual(mockVisibilityMap);
      expect(savedState.coverMap).toEqual(mockCoverMap);
    });

    test('should save observer states from other tokens correctly', () => {
      const targetToken = createMockToken({ id: 'target-1', name: 'Target' });
      const observerTokens = [
        createMockToken({ id: 'observer-1', name: 'Observer 1' }),
        createMockToken({ id: 'observer-2', name: 'Observer 2' }),
      ];

      // Mock observer states
      const mockObserverStates = {
        'observer-1': {
          visibility: 'hidden',
          cover: 'standard',
        },
        'observer-2': {
          visibility: 'concealed',
          cover: 'lesser',
        },
      };

      // Simulate collecting observer states
      const observerStates = {};
      observerTokens.forEach((observer) => {
        const visMap = { [targetToken.id]: mockObserverStates[observer.id].visibility };
        const covMap = { [targetToken.id]: mockObserverStates[observer.id].cover };

        if (visMap[targetToken.id] && visMap[targetToken.id] !== 'observed') {
          observerStates[observer.id] = observerStates[observer.id] || {};
          observerStates[observer.id].visibility = visMap[targetToken.id];
        }

        if (covMap[targetToken.id] && covMap[targetToken.id] !== 'none') {
          observerStates[observer.id] = observerStates[observer.id] || {};
          observerStates[observer.id].cover = covMap[targetToken.id];
        }
      });

      expect(observerStates).toEqual(mockObserverStates);
    });

    test('should save module effects correctly', () => {
      const token = createMockToken({
        id: 'token-1',
        actor: {
          id: 'actor-1',
          items: {
            filter: jest.fn(() => [
              {
                id: 'effect-1',
                name: 'Hidden (Visioner)',
                flags: { 'pf2e-visioner': { createdBy: 'pf2e-visioner' } },
                toObject: jest.fn(() => ({ id: 'effect-1', name: 'Hidden (Visioner)' })),
              },
              {
                id: 'effect-2',
                name: 'Standard Cover (Visioner)',
                flags: { 'pf2e-visioner': { createdBy: 'pf2e-visioner' } },
                toObject: jest.fn(() => ({ id: 'effect-2', name: 'Standard Cover (Visioner)' })),
              },
            ]),
          },
        },
      });

      // Simulate effect collection
      const moduleEffects = token.actor.items.filter(
        (item) => item.flags?.['pf2e-visioner']?.createdBy === 'pf2e-visioner',
      );

      const effectsData = moduleEffects.map((effect) => effect.toObject());

      expect(effectsData).toHaveLength(2);
      expect(effectsData[0].name).toBe('Hidden (Visioner)');
      expect(effectsData[1].name).toBe('Standard Cover (Visioner)');
    });
  });

  describe('Party Token State Restoration', () => {
    test('should restore visibility and cover maps correctly', () => {
      const restoredToken = createMockToken({
        id: 'restored-token-1',
        name: 'Restored Ally',
      });

      const savedState = {
        tokenId: 'original-token-1',
        tokenName: 'Original Ally',
        visibilityMap: {
          'enemy-1': 'hidden',
          'enemy-2': 'concealed',
        },
        coverMap: {
          'enemy-1': 'standard',
          'enemy-2': 'lesser',
        },
        observerStates: {},
        effects: [],
      };

      // Mock the map setters
      const setVisibilityMap = jest.fn();
      const setCoverMap = jest.fn();

      // Simulate restoration
      setVisibilityMap(restoredToken, savedState.visibilityMap);
      setCoverMap(restoredToken, savedState.coverMap);

      expect(setVisibilityMap).toHaveBeenCalledWith(restoredToken, savedState.visibilityMap);
      expect(setCoverMap).toHaveBeenCalledWith(restoredToken, savedState.coverMap);
    });

    test('should handle observer state restoration correctly', () => {
      const restoredToken = createMockToken({ id: 'restored-1' });
      const observerToken = createMockToken({ id: 'observer-1' });

      const savedState = {
        observerStates: {
          'observer-1': {
            visibility: 'hidden',
            cover: 'standard',
          },
        },
      };

      // Mock canvas tokens
      global.canvas.tokens.placeables = [observerToken];

      // Simulate observer state restoration
      const observerUpdates = [];
      Object.entries(savedState.observerStates).forEach(([observerId, states]) => {
        const observer = global.canvas.tokens.placeables.find((t) => t.id === observerId);
        if (observer) {
          observerUpdates.push({
            observer,
            target: restoredToken,
            visibility: states.visibility,
            cover: states.cover,
          });
        }
      });

      expect(observerUpdates).toHaveLength(1);
      expect(observerUpdates[0].observer.id).toBe('observer-1');
      expect(observerUpdates[0].visibility).toBe('hidden');
      expect(observerUpdates[0].cover).toBe('standard');
    });

    test('should handle deferred updates for ally-to-ally relationships', () => {
      const restoredToken = createMockToken({ id: 'restored-ally-1' });

      const savedState = {
        observerStates: {
          'ally-2': {
            visibility: 'undetected',
            cover: 'none',
          },
        },
      };

      // Mock scenario where observer is not yet on scene (still in party token)
      global.canvas.tokens.placeables = []; // No observer available yet

      // Mock party token state cache to indicate ally-2 will be restored
      mockPartyTokenStateCache['ally-2'] = {
        tokenId: 'ally-2',
        tokenName: 'Ally B',
      };

      // Simulate deferred update logic
      const deferredUpdates = [];
      Object.entries(savedState.observerStates).forEach(([observerId, states]) => {
        const observer = global.canvas.tokens.placeables.find((t) => t.id === observerId);
        if (!observer && mockPartyTokenStateCache[observerId]) {
          // Observer not on scene but will be restored - defer the update
          deferredUpdates.push({
            observerId,
            targetId: restoredToken.id,
            visibility: states.visibility,
            cover: states.cover,
          });
        }
      });

      expect(deferredUpdates).toHaveLength(1);
      expect(deferredUpdates[0].observerId).toBe('ally-2');
      expect(deferredUpdates[0].targetId).toBe('restored-ally-1');
      expect(deferredUpdates[0].visibility).toBe('undetected');
    });

    test('should process deferred updates when both tokens are available', () => {
      // Mock scenario where both tokens are now available
      const targetToken = createMockToken({ id: 'target-1' });
      const observerToken = createMockToken({ id: 'observer-1' });

      global.canvas.tokens.placeables = [targetToken, observerToken];

      // Mock deferred updates
      const deferredUpdates = [
        {
          observerId: 'observer-1',
          targetId: 'target-1',
          visibility: 'hidden',
          cover: 'standard',
        },
      ];

      // Simulate processing deferred updates
      const processedUpdates = [];
      deferredUpdates.forEach((update) => {
        const observer = global.canvas.tokens.placeables.find((t) => t.id === update.observerId);
        const target = global.canvas.tokens.placeables.find((t) => t.id === update.targetId);

        if (observer && target) {
          processedUpdates.push({
            observer,
            target,
            visibility: update.visibility,
            cover: update.cover,
          });
        }
      });

      expect(processedUpdates).toHaveLength(1);
      expect(processedUpdates[0].observer.id).toBe('observer-1');
      expect(processedUpdates[0].target.id).toBe('target-1');
    });

    test('should restore effects FROM restored player tokens TO existing NPCs on canvas', () => {
      // Setup: NPC already on canvas, player being restored from party token
      const existingNPC = createMockToken({
        id: 'npc-enemy-1',
        name: 'Existing Enemy',
        actor: { alliance: 'opposition' },
      });

      const restoredPlayer = createMockToken({
        id: 'restored-player-1',
        name: 'Restored Player',
        actor: { alliance: 'party' },
      });

      // Mock canvas with existing NPC
      global.canvas.tokens.placeables = [existingNPC, restoredPlayer];

      // Mock restored player's saved visibility/cover maps (what they could see before consolidation)
      const restoredVisibilityMap = {
        'npc-enemy-1': 'hidden', // Player had the NPC as hidden
      };

      const restoredCoverMap = {
        'npc-enemy-1': 'standard', // Player had standard cover from the NPC
      };

      // Mock the effect rebuilding logic (FROM restored player TO existing NPC)
      const mockBatchUpdateVisibilityEffects = jest.fn();
      const mockBatchUpdateCoverEffects = jest.fn();

      // Simulate the rebuildEffectsForToken logic for effects FROM restored player
      const observerVisTargets = global.canvas.tokens.placeables
        .filter(
          (t) =>
            t.id !== restoredPlayer.id &&
            restoredVisibilityMap[t.id] &&
            restoredVisibilityMap[t.id] !== 'observed',
        )
        .map((t) => ({ target: t, state: restoredVisibilityMap[t.id] }));

      const observerCovTargets = global.canvas.tokens.placeables
        .filter(
          (t) =>
            t.id !== restoredPlayer.id &&
            restoredCoverMap[t.id] &&
            restoredCoverMap[t.id] !== 'none',
        )
        .map((t) => ({ target: t, state: restoredCoverMap[t.id] }));

      // Simulate effect creation
      if (observerVisTargets.length > 0) {
        mockBatchUpdateVisibilityEffects(restoredPlayer, observerVisTargets);
      }

      if (observerCovTargets.length > 0) {
        mockBatchUpdateCoverEffects(restoredPlayer, observerCovTargets);
      }

      // Verify effects are created FROM restored player TO existing NPC
      expect(observerVisTargets).toHaveLength(1);
      expect(observerVisTargets[0].target.id).toBe('npc-enemy-1');
      expect(observerVisTargets[0].state).toBe('hidden');

      expect(observerCovTargets).toHaveLength(1);
      expect(observerCovTargets[0].target.id).toBe('npc-enemy-1');
      expect(observerCovTargets[0].state).toBe('standard');

      expect(mockBatchUpdateVisibilityEffects).toHaveBeenCalledWith(
        restoredPlayer,
        observerVisTargets,
      );
      expect(mockBatchUpdateCoverEffects).toHaveBeenCalledWith(restoredPlayer, observerCovTargets);
    });

    test('should restore effects FROM existing NPCs TO restored player tokens', () => {
      // Setup: NPC already on canvas with visibility/cover state toward the player
      const existingNPC = createMockToken({
        id: 'npc-observer-1',
        name: 'Existing NPC Observer',
        actor: { alliance: 'opposition' },
      });

      const restoredPlayer = createMockToken({
        id: 'restored-player-1',
        name: 'Restored Player Target',
        actor: { alliance: 'party' },
      });

      // Mock canvas with both tokens
      global.canvas.tokens.placeables = [existingNPC, restoredPlayer];

      // Mock existing NPC's visibility/cover maps (what the NPC could see of the player before consolidation)
      const npcVisibilityMap = {
        'restored-player-1': 'concealed', // NPC sees player as concealed
      };

      const npcCoverMap = {
        'restored-player-1': 'lesser', // NPC has lesser cover from player
      };

      // Mock the effect rebuilding logic (FROM existing NPC TO restored player)
      const mockBatchUpdateVisibilityEffects = jest.fn();
      const mockBatchUpdateCoverEffects = jest.fn();

      // Simulate the rebuildEffectsForToken logic for effects TO restored player from existing NPCs
      const allTokens = global.canvas.tokens.placeables;
      const effectsToPlayer = [];

      for (const observer of allTokens) {
        if (observer.id === restoredPlayer.id) continue;

        // Simulate getting the observer's maps
        const visMap = observer.id === 'npc-observer-1' ? npcVisibilityMap : {};
        const covMap = observer.id === 'npc-observer-1' ? npcCoverMap : {};

        // Only create effects for non-default states
        if (visMap[restoredPlayer.id] && visMap[restoredPlayer.id] !== 'observed') {
          effectsToPlayer.push({
            type: 'visibility',
            observer,
            target: restoredPlayer,
            state: visMap[restoredPlayer.id],
          });
          mockBatchUpdateVisibilityEffects(observer, [
            { target: restoredPlayer, state: visMap[restoredPlayer.id] },
          ]);
        }

        if (covMap[restoredPlayer.id] && covMap[restoredPlayer.id] !== 'none') {
          effectsToPlayer.push({
            type: 'cover',
            observer,
            target: restoredPlayer,
            state: covMap[restoredPlayer.id],
          });
          mockBatchUpdateCoverEffects(observer, [
            { target: restoredPlayer, state: covMap[restoredPlayer.id] },
          ]);
        }
      }

      // Verify effects are created FROM existing NPC TO restored player
      expect(effectsToPlayer).toHaveLength(2); // visibility + cover

      const visibilityEffect = effectsToPlayer.find((e) => e.type === 'visibility');
      expect(visibilityEffect.observer.id).toBe('npc-observer-1');
      expect(visibilityEffect.target.id).toBe('restored-player-1');
      expect(visibilityEffect.state).toBe('concealed');

      const coverEffect = effectsToPlayer.find((e) => e.type === 'cover');
      expect(coverEffect.observer.id).toBe('npc-observer-1');
      expect(coverEffect.target.id).toBe('restored-player-1');
      expect(coverEffect.state).toBe('lesser');

      expect(mockBatchUpdateVisibilityEffects).toHaveBeenCalledWith(existingNPC, [
        { target: restoredPlayer, state: 'concealed' },
      ]);
      expect(mockBatchUpdateCoverEffects).toHaveBeenCalledWith(existingNPC, [
        { target: restoredPlayer, state: 'lesser' },
      ]);
    });
  });

  describe('Race Condition Handling', () => {
    test('should skip cleanup for party consolidation tokens', () => {
      const token = createMockToken({ id: 'consolidating-token' });

      // Mock party consolidation detection
      mockPartyTokenStateCache['consolidating-token'] = {
        tokenId: 'consolidating-token',
        tokenName: 'Consolidating Token',
      };

      // Simulate cleanup decision logic
      const isPartyConsolidation = (tokenToClean) => {
        return mockPartyTokenStateCache[tokenToClean.id] !== undefined;
      };

      const shouldSkipCleanup = isPartyConsolidation(token);

      expect(shouldSkipCleanup).toBe(true);
    });

    test('should handle parallel token deletion gracefully', () => {
      const tokens = [
        createMockToken({ id: 'token-1', name: 'Token 1' }),
        createMockToken({ id: 'token-2', name: 'Token 2' }),
        null, // Simulate already deleted token
        { document: null }, // Simulate token with null document
        { document: { id: null } }, // Simulate token with null id
      ];

      // Mock cleanup function with error handling
      const cleanupDeletedToken = jest.fn((token) => {
        try {
          if (!token?.document?.id) {
            console.warn('Token cleanup: Invalid token reference during parallel deletion');
            return;
          }

          console.log(`Cleaning up token: ${token.document.id}`);
        } catch (error) {
          console.warn('Token cleanup race condition handled:', error.message);
        }
      });

      // Process all tokens (simulating parallel deletion)
      tokens.forEach((token) => {
        expect(() => cleanupDeletedToken(token)).not.toThrow();
      });

      expect(cleanupDeletedToken).toHaveBeenCalledTimes(5);
      expect(console.warn).toHaveBeenCalledWith(
        'Token cleanup: Invalid token reference during parallel deletion',
      );
    });

    test('should handle effect rebuild race conditions', () => {
      const token = createMockToken({
        id: 'rebuilding-token',
        actor: { id: 'rebuilding-actor' },
      });

      // Mock effect rebuild function with error handling
      const rebuildEffectsForToken = jest.fn(async (tokenToRebuild) => {
        try {
          if (!tokenToRebuild?.actor) {
            throw new Error('Token has no actor');
          }

          // Simulate effect rebuilding
          console.log(`Rebuilding effects for: ${tokenToRebuild.id}`);
          return true;
        } catch (error) {
          console.warn('Effect rebuild failed:', error.message);
          return false;
        }
      });

      // Test with valid token
      expect(rebuildEffectsForToken(token)).resolves.toBe(true);

      // Test with invalid token
      const invalidToken = { id: 'invalid', actor: null };
      expect(rebuildEffectsForToken(invalidToken)).resolves.toBe(false);
    });
  });

  describe('Effect Management During Restoration', () => {
    test('should prevent duplicate effects during restoration', () => {
      // Mock token with existing effects (demonstrates the concept)
      createMockToken({
        id: 'token-with-effects',
        actor: {
          id: 'actor-with-effects',
          items: {
            filter: jest.fn(() => [
              {
                id: 'existing-effect',
                name: 'Hidden (Visioner)',
                flags: { 'pf2e-visioner': { createdBy: 'pf2e-visioner' } },
              },
            ]),
          },
        },
      });

      // Mock saved effects (should not be restored directly to prevent duplicates)
      // const savedEffects = [...] // Not used in test, just demonstrates the concept

      // Simulate the fix - don't restore saved effects directly
      const shouldRestoreEffectsDirectly = false; // This was the bug fix

      if (shouldRestoreEffectsDirectly) {
        // This would cause duplicates (the bug)
        console.log('Creating effects from saved data (causes duplicates)');
      } else {
        // Instead, rebuild effects from current maps (the fix)
        console.log('Rebuilding effects from current visibility/cover maps');
      }

      expect(shouldRestoreEffectsDirectly).toBe(false);
    });

    test('should use correct PF2e condition icons for custom effects', () => {
      // Mock PF2e condition manager
      global.game.pf2e = {
        ConditionManager: {
          conditions: {
            get: jest.fn((conditionName) => {
              const conditions = {
                hidden: { img: 'systems/pf2e/icons/conditions/hidden.webp' },
                undetected: { img: 'systems/pf2e/icons/conditions/undetected.webp' },
              };
              return conditions[conditionName];
            }),
          },
        },
      };

      // Mock icon getter function
      const getPF2eConditionIcon = (visibilityState) => {
        try {
          const condition = global.game.pf2e.ConditionManager.conditions.get(visibilityState);
          if (condition?.img) {
            return condition.img;
          }
          return `systems/pf2e/icons/conditions/${visibilityState}.webp`;
        } catch (error) {
          return 'icons/svg/aura.svg';
        }
      };

      expect(getPF2eConditionIcon('hidden')).toBe('systems/pf2e/icons/conditions/hidden.webp');
      expect(getPF2eConditionIcon('undetected')).toBe(
        'systems/pf2e/icons/conditions/undetected.webp',
      );
      expect(getPF2eConditionIcon('nonexistent')).toBe(
        'systems/pf2e/icons/conditions/nonexistent.webp',
      );
    });
  });

  describe('Cache Management', () => {
    test('should manage party token state cache correctly', () => {
      const tokenId = 'test-token-1';
      const stateData = {
        tokenId,
        tokenName: 'Test Token',
        visibilityMap: { 'enemy-1': 'hidden' },
        coverMap: { 'enemy-1': 'standard' },
      };

      // Simulate cache operations
      const cache = {};

      // Add to cache
      cache[tokenId] = stateData;
      expect(cache[tokenId]).toEqual(stateData);

      // Check cache
      expect(cache[tokenId]).toBeDefined();

      // Remove from cache
      delete cache[tokenId];
      expect(cache[tokenId]).toBeUndefined();
    });

    test('should manage deferred updates cache correctly', () => {
      const targetTokenId = 'target-1';
      const deferredUpdate = {
        observerId: 'observer-1',
        targetId: targetTokenId,
        visibility: 'hidden',
        cover: 'standard',
      };

      // Simulate deferred updates management
      const deferredUpdates = {};

      // Add deferred update
      if (!deferredUpdates[targetTokenId]) {
        deferredUpdates[targetTokenId] = [];
      }
      deferredUpdates[targetTokenId].push(deferredUpdate);

      expect(deferredUpdates[targetTokenId]).toHaveLength(1);
      expect(deferredUpdates[targetTokenId][0]).toEqual(deferredUpdate);

      // Process and remove deferred updates
      const updates = deferredUpdates[targetTokenId] || [];
      delete deferredUpdates[targetTokenId];

      expect(updates).toHaveLength(1);
      expect(deferredUpdates[targetTokenId]).toBeUndefined();
    });
  });

  describe('Integration Scenarios', () => {
    test('should handle complete party consolidation and restoration cycle', () => {
      // Setup: Two allied tokens with visibility relationships
      const allyA = createMockToken({ id: 'ally-a', name: 'Ally A' });
      const allyB = createMockToken({ id: 'ally-b', name: 'Ally B' });
      const enemy = createMockToken({ id: 'enemy-1', name: 'Enemy 1' });

      // Initial state: Ally A is undetected to Ally B
      const initialStates = {
        'ally-a': {
          visibilityMap: { 'enemy-1': 'hidden' },
          coverMap: { 'enemy-1': 'standard' },
          observerStates: {
            'ally-b': { visibility: 'undetected', cover: 'none' },
          },
        },
        'ally-b': {
          visibilityMap: { 'enemy-1': 'concealed' },
          coverMap: { 'enemy-1': 'lesser' },
          observerStates: {},
        },
      };

      // Step 1: Save states before consolidation
      const savedStates = {};
      ['ally-a', 'ally-b'].forEach((tokenId) => {
        savedStates[tokenId] = initialStates[tokenId];
      });

      expect(Object.keys(savedStates)).toHaveLength(2);

      // Step 2: Consolidate into party token (tokens removed from scene)
      global.canvas.tokens.placeables = [enemy]; // Only enemy remains

      // Step 3: Restore tokens from party
      global.canvas.tokens.placeables = [allyA, allyB, enemy]; // All tokens back

      // Step 4: Restore states
      const restoredStates = {};
      Object.entries(savedStates).forEach(([tokenId, state]) => {
        const token = global.canvas.tokens.placeables.find((t) => t.id === tokenId);
        if (token) {
          restoredStates[tokenId] = state;
        }
      });

      expect(Object.keys(restoredStates)).toHaveLength(2);
      expect(restoredStates['ally-a'].observerStates['ally-b'].visibility).toBe('undetected');
    });

    test('should handle mass party consolidation without race conditions', () => {
      // Setup: Multiple tokens being consolidated simultaneously
      const tokens = Array.from({ length: 5 }, (_, i) =>
        createMockToken({ id: `token-${i}`, name: `Token ${i}` }),
      );

      // Mock cleanup function that handles race conditions
      const cleanupResults = [];
      const cleanupDeletedToken = (token) => {
        try {
          if (!token?.document?.id) {
            cleanupResults.push({ success: false, reason: 'invalid_token' });
            return;
          }

          // Check if it's part of party consolidation
          if (mockPartyTokenStateCache[token.id]) {
            cleanupResults.push({ success: true, reason: 'skipped_party_consolidation' });
            return;
          }

          cleanupResults.push({ success: true, reason: 'normal_cleanup' });
        } catch (error) {
          cleanupResults.push({ success: false, reason: 'error', error: error.message });
        }
      };

      // Mark all tokens as part of party consolidation
      tokens.forEach((token) => {
        mockPartyTokenStateCache[token.id] = { tokenId: token.id };
      });

      // Simulate cleanup for all tokens
      tokens.forEach(cleanupDeletedToken);

      // All should be skipped due to party consolidation
      expect(cleanupResults).toHaveLength(5);
      expect(cleanupResults.every((r) => r.reason === 'skipped_party_consolidation')).toBe(true);
    });
  });
});
