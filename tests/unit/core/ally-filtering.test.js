/**
 * Tests for ally filtering functionality
 * Covers shouldFilterAlly and filterOutcomesByAllies functions
 */

import '../../setup.js';

// Import the actual functions to test
import {
  filterOutcomesByAllies,
  shouldFilterAlly,
} from '../../../scripts/chat/services/infra/shared-utils.js';

describe('Ally Filtering Logic', () => {
  let playerToken, allyToken, enemyToken, neutralToken;
  let lootToken, hazardToken;

  beforeEach(() => {
    // Create tokens with different alliance types
    playerToken = createMockToken('player', 'character');
    allyToken = createMockToken('ally', 'character');
    enemyToken = createMockToken('enemy', 'character'); // Create as character first
    neutralToken = createMockToken('neutral', 'character');
    lootToken = createMockToken('loot', 'character');
    hazardToken = createMockToken('hazard', 'character');

    // Then override the actor types
    enemyToken.actor.type = 'npc';
    neutralToken.actor.type = 'npc';
    lootToken.actor.type = 'loot';
    hazardToken.actor.type = 'hazard';

    // Set up alliances
    playerToken.actor.alliance = 'party';
    allyToken.actor.alliance = 'party';
    enemyToken.actor.alliance = 'opposition';
    neutralToken.actor.alliance = null;

    // Set up dispositions as fallback
    playerToken.document.disposition = 1; // Friendly
    allyToken.document.disposition = 1; // Friendly
    enemyToken.document.disposition = -1; // Hostile
    neutralToken.document.disposition = 0; // Neutral
  });

  describe('shouldFilterAlly Function', () => {
    test('returns false when ignoreAllies is false', () => {
      const result = shouldFilterAlly(playerToken, enemyToken, 'enemies', false);
      expect(result).toBe(false);
    });

    test('returns false for non-token subjects', () => {
      const result = shouldFilterAlly(playerToken, null, 'enemies', true);
      expect(result).toBe(false);
    });

    test('filters allies when filterType is "enemies" and ignoreAllies is true', () => {
      // Same alliance - should be filtered out
      const result = shouldFilterAlly(playerToken, allyToken, 'enemies', true);
      expect(result).toBe(true);
    });

    test('does not filter enemies when filterType is "enemies" and ignoreAllies is true', () => {
      // Different alliance - should not be filtered
      const result = shouldFilterAlly(playerToken, enemyToken, 'enemies', true);
      expect(result).toBe(false);
    });

    test('filters enemies when filterType is "allies" and ignoreAllies is true', () => {
      // Different alliance - should be filtered out when looking for allies
      const result = shouldFilterAlly(playerToken, enemyToken, 'allies', true);
      expect(result).toBe(true);
    });

    test('uses disposition as fallback when alliance is not available', () => {
      // Remove alliance info
      playerToken.actor.alliance = null;
      allyToken.actor.alliance = null;

      // Same disposition - should be filtered out
      const result = shouldFilterAlly(playerToken, allyToken, 'enemies', true);
      expect(result).toBe(true);
    });

    test('uses actor type as final fallback', () => {
      // Remove both alliance and disposition
      playerToken.actor.alliance = null;
      allyToken.actor.alliance = null;
      enemyToken.actor.alliance = null;
      playerToken.document.disposition = null;
      allyToken.document.disposition = null;
      enemyToken.document.disposition = null;

      // Both characters - should be filtered out
      const result = shouldFilterAlly(playerToken, allyToken, 'enemies', true);
      expect(result).toBe(true);

      // Character vs NPC - should not be filtered
      const result2 = shouldFilterAlly(playerToken, enemyToken, 'enemies', true);
      expect(result2).toBe(false);
    });

    test('handles preferIgnoreAllies parameter correctly', () => {
      // Test with explicit preferIgnoreAllies override
      const result1 = shouldFilterAlly(playerToken, allyToken, 'enemies', null); // Uses global setting
      const result2 = shouldFilterAlly(playerToken, allyToken, 'enemies', true); // Override to true
      const result3 = shouldFilterAlly(playerToken, allyToken, 'enemies', false); // Override to false

      expect(result2).toBe(true); // Should filter allies
      expect(result3).toBe(false); // Should not filter
    });

    test('handles familiars correctly', () => {
      const familiarToken = createMockToken('familiar', 'familiar');
      familiarToken.actor.alliance = 'party';

      // Familiars should be treated as same side as characters
      const result = shouldFilterAlly(playerToken, familiarToken, 'enemies', true);
      expect(result).toBe(true); // Should filter familiar (same side)
    });
  });

  describe('filterOutcomesByAllies Function', () => {
    test('returns all outcomes when ignoreAllies is false', () => {
      const outcomes = [{ target: allyToken }, { target: enemyToken }, { target: neutralToken }];

      const filtered = filterOutcomesByAllies(outcomes, playerToken, false, 'target');
      expect(filtered).toEqual(outcomes);
    });

    test('filters out allies when ignoreAllies is true', () => {
      const outcomes = [{ target: allyToken }, { target: enemyToken }, { target: neutralToken }];

      const filtered = filterOutcomesByAllies(outcomes, playerToken, true, 'target');

      // Should only include enemies and neutrals, not allies
      expect(filtered).toHaveLength(2);
      expect(filtered.find((o) => o.target === allyToken)).toBeUndefined();
      expect(filtered.find((o) => o.target === enemyToken)).toBeDefined();
      expect(filtered.find((o) => o.target === neutralToken)).toBeDefined();
    });

    test('preserves wall outcomes regardless of filtering', () => {
      const outcomes = [
        { _isWall: true, wallId: 'wall1' },
        { target: allyToken },
        { target: enemyToken },
      ];

      const filtered = filterOutcomesByAllies(outcomes, playerToken, true, 'target');

      // Wall should always be preserved
      expect(filtered.find((o) => o._isWall)).toBeDefined();
      expect(filtered.find((o) => o.target === allyToken)).toBeUndefined();
      expect(filtered.find((o) => o.target === enemyToken)).toBeDefined();
    });

    test('handles different token property names', () => {
      const outcomes = [{ observer: allyToken }, { observer: enemyToken }];

      const filtered = filterOutcomesByAllies(outcomes, playerToken, true, 'observer');

      expect(filtered).toHaveLength(1);
      expect(filtered[0].observer).toBe(enemyToken);
    });

    test('handles null preferIgnoreAllies parameter', () => {
      const outcomes = [{ target: allyToken }, { target: enemyToken }];

      const filtered = filterOutcomesByAllies(outcomes, playerToken, null, 'target');

      // When preferIgnoreAllies is null (not true), no filtering should occur
      expect(filtered).toHaveLength(2);
      expect(filtered).toEqual(outcomes);
    });

    test('gracefully handles invalid outcomes array', () => {
      const filtered1 = filterOutcomesByAllies(null, playerToken, true, 'target');
      const filtered2 = filterOutcomesByAllies(undefined, playerToken, true, 'target');
      const filtered3 = filterOutcomesByAllies('not an array', playerToken, true, 'target');

      expect(filtered1).toBe(null);
      expect(filtered2).toBe(undefined);
      expect(filtered3).toBe('not an array');
    });

    test('handles outcomes without target tokens', () => {
      const outcomes = [
        { target: allyToken },
        { target: null },
        { target: undefined },
        {
          /* no target property */
        },
      ];

      const filtered = filterOutcomesByAllies(outcomes, playerToken, true, 'target');

      // Should filter out the ally but the invalid/missing targets will be filtered out too
      // because the function checks if the target token exists
      expect(filtered).toHaveLength(0); // All filtered out (ally + invalid targets)
      expect(filtered.find((o) => o.target === allyToken)).toBeUndefined();
    });
  });

  describe('Integration with Action Types', () => {
    test('Sneak action filtering - observers see sneaking token', () => {
      // In sneak, observers (other tokens) see the sneaking token differently
      const sneakOutcomes = [
        { token: allyToken }, // Ally observer
        { token: enemyToken }, // Enemy observer
      ];

      const filtered = filterOutcomesByAllies(sneakOutcomes, playerToken, true, 'token');

      // Should only affect enemies, not allies
      expect(filtered).toHaveLength(1);
      expect(filtered[0].token).toBe(enemyToken);
    });

    test('Diversion action filtering - observers see diverting token', () => {
      // In diversion, observers see the diverting token differently
      const diversionOutcomes = [
        { observer: allyToken }, // Ally observer
        { observer: enemyToken }, // Enemy observer
      ];

      const filtered = filterOutcomesByAllies(diversionOutcomes, playerToken, true, 'observer');

      // Should only affect enemies, not allies
      expect(filtered).toHaveLength(1);
      expect(filtered[0].observer).toBe(enemyToken);
    });

    test('Seek action filtering - seeker looks for targets', () => {
      // In seek, seeker looks for targets (usually enemies)
      const seekOutcomes = [
        { target: allyToken }, // Ally target
        { target: enemyToken }, // Enemy target
      ];

      const filtered = filterOutcomesByAllies(seekOutcomes, playerToken, true, 'target');

      // Should only target enemies, not allies
      expect(filtered).toHaveLength(1);
      expect(filtered[0].target).toBe(enemyToken);
    });
  });
});
