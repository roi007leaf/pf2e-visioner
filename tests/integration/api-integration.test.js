/**
 * API Integration tests for PF2E Visioner
 * Tests the integration between different module components
 */

import { getCoverBetween, setCoverBetween } from '../../scripts/stores/cover-map.js';
import { getVisibilityBetween, setVisibilityBetween } from '../../scripts/stores/visibility-map.js';

describe('PF2E Visioner API Integration Tests', () => {
  let observer, target, ally, enemy;

  beforeEach(() => {
    // Create test tokens
    observer = createMockToken({
      id: 'observer-pc',
      x: 100,
      y: 100,
      actor: createMockActor({
        id: 'actor-pc',
        type: 'character',
        hasPlayerOwner: true,
      }),
    });

    target = createMockToken({
      id: 'target-npc',
      x: 300,
      y: 300,
      actor: createMockActor({
        id: 'actor-npc',
        type: 'npc',
        hasPlayerOwner: false,
      }),
    });

    ally = createMockToken({
      id: 'ally-pc',
      x: 150,
      y: 150,
      actor: createMockActor({
        id: 'actor-ally',
        type: 'character',
        hasPlayerOwner: true,
      }),
    });

    enemy = createMockToken({
      id: 'enemy-npc',
      x: 400,
      y: 400,
      actor: createMockActor({
        id: 'actor-enemy',
        type: 'npc',
        hasPlayerOwner: false,
      }),
    });
  });

  describe('Core API Integration', () => {
    test('should manage visibility states between multiple tokens', async () => {
      // Set different visibility states
      await setVisibilityBetween(observer, target, 'hidden');
      await setVisibilityBetween(observer, ally, 'concealed');
      await setVisibilityBetween(observer, enemy, 'undetected');

      // Verify states are independent
      expect(getVisibilityBetween(observer, target)).toBe('hidden');
      expect(getVisibilityBetween(observer, ally)).toBe('concealed');
      expect(getVisibilityBetween(observer, enemy)).toBe('undetected');

      // Verify default state for unset relationships
      expect(getVisibilityBetween(target, observer)).toBe('observed');
    });

    test('should manage cover states between multiple tokens', async () => {
      // Set different cover states
      await setCoverBetween(observer, target, 'standard');
      await setCoverBetween(observer, ally, 'lesser');
      await setCoverBetween(observer, enemy, 'greater');

      // Verify states are independent
      expect(getCoverBetween(observer, target)).toBe('standard');
      expect(getCoverBetween(observer, ally)).toBe('lesser');
      expect(getCoverBetween(observer, enemy)).toBe('greater');

      // Verify default state for unset relationships
      expect(getCoverBetween(target, observer)).toBe('none');
    });

    test('should handle complex multi-token scenarios', async () => {
      // Create a complex scenario with multiple relationships
      const tokens = [observer, target, ally, enemy];
      const visibilityStates = ['observed', 'hidden', 'concealed', 'undetected'];
      const coverStates = ['none', 'lesser', 'standard', 'greater'];

      // Set up a matrix of relationships
      for (let i = 0; i < tokens.length; i++) {
        for (let j = 0; j < tokens.length; j++) {
          if (i !== j) {
            await setVisibilityBetween(tokens[i], tokens[j], visibilityStates[j]);
            await setCoverBetween(tokens[i], tokens[j], coverStates[j]);
          }
        }
      }

      // Verify all relationships are correct
      for (let i = 0; i < tokens.length; i++) {
        for (let j = 0; j < tokens.length; j++) {
          if (i !== j) {
            expect(getVisibilityBetween(tokens[i], tokens[j])).toBe(visibilityStates[j]);
            expect(getCoverBetween(tokens[i], tokens[j])).toBe(coverStates[j]);
          }
        }
      }
    });
  });

  describe('State Management Integration', () => {
    test('should persist states across function calls', async () => {
      // Set initial states
      await setVisibilityBetween(observer, target, 'hidden');
      await setCoverBetween(observer, target, 'standard');

      // Verify persistence through multiple reads
      for (let i = 0; i < 5; i++) {
        expect(getVisibilityBetween(observer, target)).toBe('hidden');
        expect(getCoverBetween(observer, target)).toBe('standard');
      }
    });

    test('should handle state updates correctly', async () => {
      // Start with one state
      await setVisibilityBetween(observer, target, 'observed');
      expect(getVisibilityBetween(observer, target)).toBe('observed');

      // Update to different states
      const states = ['hidden', 'concealed', 'undetected', 'observed'];

      for (const state of states) {
        await setVisibilityBetween(observer, target, state);
        expect(getVisibilityBetween(observer, target)).toBe(state);
      }
    });

    test('should handle concurrent state operations', async () => {
      // Set up multiple simultaneous operations
      const promises = [];

      promises.push(setVisibilityBetween(observer, target, 'hidden'));
      promises.push(setVisibilityBetween(ally, target, 'concealed'));
      promises.push(setCoverBetween(observer, target, 'standard'));
      promises.push(setCoverBetween(ally, target, 'lesser'));

      // Wait for all operations to complete
      await Promise.all(promises);

      // Verify all states are correct
      expect(getVisibilityBetween(observer, target)).toBe('hidden');
      expect(getVisibilityBetween(ally, target)).toBe('concealed');
      expect(getCoverBetween(observer, target)).toBe('standard');
      expect(getCoverBetween(ally, target)).toBe('lesser');
    });
  });

  describe('Token Integration', () => {
    test('should work with different token types', async () => {
      // Test with different actor types
      const lootToken = createMockToken({
        id: 'loot-token',
        x: 500,
        y: 500,
        actor: createMockActor({ type: 'loot' }),
      });

      const vehicleToken = createMockToken({
        id: 'vehicle-token',
        x: 600,
        y: 600,
        actor: createMockActor({ type: 'vehicle' }),
      });

      // Set states for different token types
      await setVisibilityBetween(observer, lootToken, 'hidden');
      await setVisibilityBetween(observer, vehicleToken, 'concealed');
      await setCoverBetween(observer, lootToken, 'greater');
      await setCoverBetween(observer, vehicleToken, 'standard');

      // Verify states work for all token types
      expect(getVisibilityBetween(observer, lootToken)).toBe('hidden');
      expect(getVisibilityBetween(observer, vehicleToken)).toBe('concealed');
      expect(getCoverBetween(observer, lootToken)).toBe('greater');
      expect(getCoverBetween(observer, vehicleToken)).toBe('standard');
    });

    test('should handle token edge cases', async () => {
      // Test with tokens that have minimal data
      const minimalToken = createMockToken({
        id: 'minimal-token',
        actor: null, // No actor
      });

      // Should not throw errors
      expect(() => getVisibilityBetween(observer, minimalToken)).not.toThrow();
      expect(() => getCoverBetween(observer, minimalToken)).not.toThrow();

      // Should handle setting states
      await setVisibilityBetween(observer, minimalToken, 'hidden');
      await setCoverBetween(observer, minimalToken, 'standard');

      expect(getVisibilityBetween(observer, minimalToken)).toBe('hidden');
      expect(getCoverBetween(observer, minimalToken)).toBe('standard');
    });
  });

  describe('Performance Integration', () => {
    test('should handle many tokens efficiently', async () => {
      // Create many tokens
      const manyTokens = Array.from({ length: 50 }, (_, i) =>
        createMockToken({
          id: `perf-token-${i}`,
          x: (i % 10) * 50,
          y: Math.floor(i / 10) * 50,
          actor: createMockActor({ type: 'character' }),
        }),
      );

      const startTime = performance.now();

      // Set states for all tokens
      for (const token of manyTokens) {
        await setVisibilityBetween(observer, token, 'hidden');
        await setCoverBetween(observer, token, 'standard');
      }

      // Read states for all tokens
      for (const token of manyTokens) {
        getVisibilityBetween(observer, token);
        getCoverBetween(observer, token);
      }

      const endTime = performance.now();

      // Should complete in reasonable time (less than 1000ms for 50 tokens)
      expect(endTime - startTime).toBeLessThan(1000);

      // Verify a few random states
      expect(getVisibilityBetween(observer, manyTokens[0])).toBe('hidden');
      expect(getCoverBetween(observer, manyTokens[25])).toBe('standard');
      expect(getVisibilityBetween(observer, manyTokens[49])).toBe('hidden');
    });

    test('should handle rapid state changes efficiently', async () => {
      const startTime = performance.now();

      // Rapidly change states
      for (let i = 0; i < 100; i++) {
        const visState = ['observed', 'hidden', 'concealed', 'undetected'][i % 4];
        const coverState = ['none', 'lesser', 'standard', 'greater'][i % 4];

        await setVisibilityBetween(observer, target, visState);
        await setCoverBetween(observer, target, coverState);
      }

      const endTime = performance.now();

      // Should complete in reasonable time (less than 500ms for 100 changes)
      expect(endTime - startTime).toBeLessThan(500);

      // Final state should match the last iteration (99 % 4 = 3)
      expect(getVisibilityBetween(observer, target)).toBe('undetected'); // index 3
      expect(getCoverBetween(observer, target)).toBe('greater'); // index 3
    });
  });

  describe('Error Handling Integration', () => {
    test('should handle invalid inputs gracefully', async () => {
      // Test with null tokens
      expect(() => getVisibilityBetween(null, target)).not.toThrow();
      expect(() => getVisibilityBetween(observer, null)).not.toThrow();
      expect(() => getCoverBetween(null, target)).not.toThrow();
      expect(() => getCoverBetween(observer, null)).not.toThrow();

      // Setting with null tokens should not throw
      expect(() => setVisibilityBetween(null, target, 'hidden')).not.toThrow();
      expect(() => setVisibilityBetween(observer, null, 'hidden')).not.toThrow();
      expect(() => setCoverBetween(null, target, 'standard')).not.toThrow();
      expect(() => setCoverBetween(observer, null, 'standard')).not.toThrow();
    });

    test('should handle invalid states gracefully', async () => {
      // Invalid visibility states should not crash the system
      await setVisibilityBetween(observer, target, 'invalid-state');
      // v2-only visibility storage ignores unknown legacy states
      expect(getVisibilityBetween(observer, target)).toBe('observed');

      // Same for cover states
      await setCoverBetween(observer, target, 'invalid-cover');
      expect(getCoverBetween(observer, target)).toBe('invalid-cover');
    });
  });
});
