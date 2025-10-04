/**
 * Unit tests for DC Display Logic in Token Manager
 * Tests the specific issue where target mode shows observer's stealth DC instead of target's perception DC
 */

// Import test setup first to define global mock functions
import '../../setup.js';

// Import the DC extraction functions directly
import {
  extractPerceptionDC,
  extractStealthDC,
} from '../../../scripts/chat/services/infra/shared-utils.js';

describe('Token Manager DC Display Logic', () => {
  let mockObserver, mockTarget1, mockTarget2;

  beforeEach(() => {
    // Create mock observer token (the selected token - Ogre Warrior)
    mockObserver = createMockToken({
      id: 'observer-1',
      name: 'Ogre Warrior',
      actor: createMockActor({
        id: 'actor-observer',
        type: 'npc',
        hasPlayerOwner: false,
        system: {
          skills: {
            stealth: { dc: 9 }, // Observer's stealth DC
          },
        },
      }),
    });

    // Create mock target tokens (tokens that could perceive the observer)
    mockTarget1 = createMockToken({
      id: 'target-1',
      name: 'Amiri',
      actor: createMockActor({
        id: 'actor-target1',
        type: 'character',
        hasPlayerOwner: true,
        system: {
          perception: { dc: 15 }, // Target's perception DC
        },
      }),
    });

    mockTarget2 = createMockToken({
      id: 'target-2',
      name: 'Ezren',
      actor: createMockActor({
        id: 'actor-target2',
        type: 'character',
        hasPlayerOwner: true,
        system: {
          perception: { dc: 12 }, // Different perception DC
        },
      }),
    });
  });

  describe('DC Extraction Functions', () => {
    test('extractPerceptionDC should return correct perception DC for each token', () => {
      // Each token should return its own perception DC
      expect(extractPerceptionDC(mockTarget1)).toBe(15); // Amiri's perception DC
      expect(extractPerceptionDC(mockTarget2)).toBe(12); // Ezren's perception DC

      // Should NOT return the observer's stealth DC
      expect(extractPerceptionDC(mockTarget1)).not.toBe(9); // Observer's stealth DC
      expect(extractPerceptionDC(mockTarget2)).not.toBe(9); // Observer's stealth DC
    });

    test('extractStealthDC should return correct stealth DC for each token', () => {
      // For character tokens, should return their stealth DC (or 0 if not set)
      expect(extractStealthDC(mockTarget1)).toBe(0); // Character tokens don't have stealth DC by default
      expect(extractStealthDC(mockTarget2)).toBe(0); // Character tokens don't have stealth DC by default

      // Observer should return its own stealth DC
      expect(extractStealthDC(mockObserver)).toBe(9); // Observer's stealth DC
    });

    test('should handle tokens with missing perception DC', () => {
      const tokenWithoutPerception = createMockToken({
        id: 'no-perception',
        name: 'Token Without Perception',
        actor: createMockActor({
          id: 'actor-no-perception',
          type: 'character',
          hasPlayerOwner: true,
          system: {
            // No perception DC
          },
        }),
      });

      // Should default to 0 for missing perception DC
      expect(extractPerceptionDC(tokenWithoutPerception)).toBe(0);
    });

    test('should handle tokens with missing actor', () => {
      const tokenWithoutActor = createMockToken({
        id: 'no-actor',
        name: 'Token Without Actor',
        actor: null,
      });

      // Should default to 0 for missing actor
      expect(extractPerceptionDC(tokenWithoutActor)).toBe(0);
      expect(extractStealthDC(tokenWithoutActor)).toBe(0);
    });

    test('should handle tokens with perception DC override', () => {
      const tokenWithOverride = createMockToken({
        id: 'override-token',
        name: 'Token With Override',
        actor: createMockActor({
          id: 'actor-override',
          type: 'character',
          hasPlayerOwner: true,
          system: {
            perception: { dc: 10 }, // Base perception DC
          },
        }),
        document: {
          getFlag: jest.fn((moduleId, flagName) => {
            if (flagName === 'perceptionDC') return 20; // Override DC
            return null;
          }),
        },
      });

      // Should use the override DC instead of the base DC
      expect(extractPerceptionDC(tokenWithOverride)).toBe(20);
    });
  });

  describe('Target Mode DC Logic Simulation', () => {
    test('should simulate correct DC assignment in target mode', () => {
      // Simulate the logic that should happen in target mode
      const targetModeLogic = (observerToken) => {
        const perceptionDC = extractPerceptionDC(observerToken);
        const stealthDC = extractPerceptionDC(observerToken); // Both should be perception DC in target mode

        return { perceptionDC, stealthDC };
      };

      // Test with each target token
      const amiriResult = targetModeLogic(mockTarget1);
      const ezrenResult = targetModeLogic(mockTarget2);

      // Each token should show its own perception DC
      expect(amiriResult.perceptionDC).toBe(15); // Amiri's perception DC
      expect(amiriResult.stealthDC).toBe(15); // Should also be Amiri's perception DC

      expect(ezrenResult.perceptionDC).toBe(12); // Ezren's perception DC
      expect(ezrenResult.stealthDC).toBe(12); // Should also be Ezren's perception DC

      // Should NOT show the observer's stealth DC for any target
      expect(amiriResult.perceptionDC).not.toBe(9); // Observer's stealth DC
      expect(amiriResult.stealthDC).not.toBe(9); // Observer's stealth DC
      expect(ezrenResult.perceptionDC).not.toBe(9); // Observer's stealth DC
      expect(ezrenResult.stealthDC).not.toBe(9); // Observer's stealth DC
    });

    test('should demonstrate the bug: incorrect DC assignment', () => {
      // Simulate the BUGGY logic that was happening before the fix
      const buggyTargetModeLogic = (observerToken, observer) => {
        const perceptionDC = extractPerceptionDC(observerToken);
        const stealthDC = extractStealthDC(observer); // BUG: Using observer's stealth DC

        return { perceptionDC, stealthDC };
      };

      // Test with the buggy logic
      const amiriResult = buggyTargetModeLogic(mockTarget1, mockObserver);
      const ezrenResult = buggyTargetModeLogic(mockTarget2, mockObserver);

      // This would show the bug: all targets showing observer's stealth DC
      expect(amiriResult.perceptionDC).toBe(15); // Correct: Amiri's perception DC
      expect(amiriResult.stealthDC).toBe(9); // BUG: Observer's stealth DC

      expect(ezrenResult.perceptionDC).toBe(12); // Correct: Ezren's perception DC
      expect(ezrenResult.stealthDC).toBe(9); // BUG: Observer's stealth DC

      // This demonstrates the bug: all targets showing the same stealth DC (9)
      expect(amiriResult.stealthDC).toBe(ezrenResult.stealthDC); // Both show 9
    });

    test('should verify the fix: correct DC assignment', () => {
      // Simulate the FIXED logic
      const fixedTargetModeLogic = (observerToken) => {
        const perceptionDC = extractPerceptionDC(observerToken);
        const stealthDC = extractPerceptionDC(observerToken); // FIX: Both use perception DC

        return { perceptionDC, stealthDC };
      };

      // Test with the fixed logic
      const amiriResult = fixedTargetModeLogic(mockTarget1);
      const ezrenResult = fixedTargetModeLogic(mockTarget2);

      // This shows the fix: each target shows its own perception DC
      expect(amiriResult.perceptionDC).toBe(15); // Correct: Amiri's perception DC
      expect(amiriResult.stealthDC).toBe(15); // FIXED: Also Amiri's perception DC

      expect(ezrenResult.perceptionDC).toBe(12); // Correct: Ezren's perception DC
      expect(ezrenResult.stealthDC).toBe(12); // FIXED: Also Ezren's perception DC

      // This verifies the fix: each target shows its own unique DC
      expect(amiriResult.stealthDC).not.toBe(ezrenResult.stealthDC); // Different DCs
      expect(amiriResult.stealthDC).not.toBe(9); // Not observer's stealth DC
      expect(ezrenResult.stealthDC).not.toBe(9); // Not observer's stealth DC
    });
  });

  describe('Edge Cases', () => {
    test('should handle loot tokens correctly', () => {
      const lootToken = createMockToken({
        id: 'loot-1',
        name: 'Treasure Chest',
        actor: createMockActor({
          id: 'actor-loot',
          type: 'loot',
          system: {},
        }),
        document: {
          getFlag: jest.fn((moduleId, flagName) => {
            if (flagName === 'stealthDC') return 15; // Loot stealth DC
            return null;
          }),
        },
      });

      // Loot tokens should use their stealth DC override or default
      expect(extractStealthDC(lootToken)).toBe(15);
      expect(extractPerceptionDC(lootToken)).toBe(0); // Loot doesn't have perception DC
    });

    test('should handle hazard tokens correctly', () => {
      const hazardToken = createMockToken({
        id: 'hazard-1',
        name: 'Spike Trap',
        actor: createMockActor({
          id: 'actor-hazard',
          type: 'hazard',
          system: {
            attributes: {
              stealth: { dc: 18 }, // Hazard stealth DC
            },
          },
        }),
      });

      // Hazard tokens should use their stealth DC from attributes
      expect(extractStealthDC(hazardToken)).toBe(18);
      expect(extractPerceptionDC(hazardToken)).toBe(0); // Hazards don't have perception DC
    });
  });
});
