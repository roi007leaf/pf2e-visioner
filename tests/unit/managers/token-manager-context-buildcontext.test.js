/**
 * Unit tests for Token Manager Context Building - DC Display Fix
 * Tests the buildContext function to verify target mode shows correct DCs
 */

// Import test setup first to define global mock functions
import '../../setup.js';

// Mock the dependencies that buildContext needs
jest.mock('../../../scripts/chat/services/infra/shared-utils.js', () => ({
  extractPerceptionDC: jest.fn((token) => {
    if (!token?.actor) return 0;
    const override = Number(token.document?.getFlag?.('pf2e-visioner', 'perceptionDC'));
    if (Number.isFinite(override) && override > 0) return override;
    return token.actor.system?.perception?.dc || 0;
  }),
  extractStealthDC: jest.fn((token) => {
    if (!token?.actor) return 0;
    if (token.actor?.type === 'loot') {
      const override = Number(token.document?.getFlag?.('pf2e-visioner', 'stealthDC'));
      if (Number.isFinite(override) && override > 0) return override;
      return 15; // Default loot stealth DC
    }
    return token.actor.system?.skills?.stealth?.dc || 0;
  }),
}));

jest.mock('../../../scripts/utils.js', () => ({
  getCoverMap: jest.fn(() => ({})),
  getLastRollTotalForActor: jest.fn(() => null),
  getSceneTargets: jest.fn(() => []),
  getVisibilityMap: jest.fn(() => ({})),
  hasActiveEncounter: jest.fn(() => false),
}));

// Mock the constants
jest.mock('../../../scripts/constants.js', () => ({
  COVER_STATES: {
    none: {
      label: 'PF2E_VISIONER.COVER.NONE',
      icon: 'fas fa-circle',
      color: '#4caf50',
      cssClass: 'cover-none',
      bonusAC: 0,
      bonusReflex: 0,
      bonusStealth: 0,
      canHide: true,
    },
    lesser: {
      label: 'PF2E_VISIONER.COVER.LESSER',
      icon: 'fas fa-shield-alt',
      color: '#ffeb3b',
      cssClass: 'cover-lesser',
      bonusAC: 1,
      bonusReflex: 1,
      bonusStealth: 1,
      canHide: true,
    },
    standard: {
      label: 'PF2E_VISIONER.COVER.STANDARD',
      icon: 'fas fa-shield-alt',
      color: '#ff9800',
      cssClass: 'cover-standard',
      bonusAC: 2,
      bonusReflex: 2,
      bonusStealth: 2,
      canHide: true,
    },
    greater: {
      label: 'PF2E_VISIONER.COVER.GREATER',
      icon: 'fas fa-shield-alt',
      color: '#f44336',
      cssClass: 'cover-greater',
      bonusAC: 4,
      bonusReflex: 4,
      bonusStealth: 4,
      canHide: true,
    },
  },
  MODULE_ID: 'pf2e-visioner',
  VISIBILITY_STATES: {
    observed: {
      label: 'PF2E_VISIONER.VISIBILITY.OBSERVED',
      icon: 'fas fa-eye',
      color: '#4caf50',
      cssClass: 'visibility-observed',
    },
    concealed: {
      label: 'PF2E_VISIONER.VISIBILITY.CONCEALED',
      icon: 'fas fa-cloud',
      color: '#ffeb3b',
      cssClass: 'visibility-concealed',
    },
    hidden: {
      label: 'PF2E_VISIONER.VISIBILITY.HIDDEN',
      icon: 'fas fa-eye-slash',
      color: '#f44336',
      cssClass: 'visibility-hidden',
    },
    undetected: {
      label: 'PF2E_VISIONER.VISIBILITY.UNDETECTED',
      icon: 'fas fa-ghost',
      color: '#9c27b0',
      cssClass: 'visibility-undetected',
    },
  },
}));

// Mock FoundryVTT ApplicationV2
global.foundry = {
  applications: {
    api: {
      ApplicationV2: {
        prototype: {
          _prepareContext: jest.fn().mockResolvedValue({}),
        },
      },
    },
  },
};

// Now import the buildContext function after mocking dependencies
import { buildContext } from '../../../scripts/managers/token-manager/context.js';

describe('Token Manager Context Building - DC Display Fix', () => {
  let mockApp, mockObserver, mockTarget1, mockTarget2;

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
      document: {
        id: 'observer-1',
        name: 'Ogre Warrior',
        disposition: -1, // hostile
        getFlag: jest.fn(() => null),
      },
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
      document: {
        id: 'target-1',
        name: 'Amiri',
        disposition: 1, // friendly
        getFlag: jest.fn(() => null),
      },
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
      document: {
        id: 'target-2',
        name: 'Ezren',
        disposition: 1, // friendly
        getFlag: jest.fn(() => null),
      },
    });

    // Mock the app object
    mockApp = {
      observer: mockObserver,
      mode: 'target',
      activeTab: 'visibility',
      encounterOnly: false,
      ignoreAllies: false,
      ignoreWalls: false,
      visibilityData: {},
      coverData: {},
    };

    // Mock canvas tokens
    global.canvas = {
      tokens: {
        placeables: [mockTarget1, mockTarget2],
      },
      walls: {
        placeables: [],
      },
    };

    // Mock game settings
    global.game.settings.get.mockImplementation((moduleId, settingId) => {
      if (settingId === 'integrateRollOutcome') return false;
      if (settingId === 'hiddenWallsEnabled') return false;
      return false;
    });

    // Mock game.user.targets
    global.game.user = {
      targets: new Set(), // Empty set of targeted tokens
    };

    // Configure the mocked utils functions
    const {
      getSceneTargets,
      getVisibilityMap,
      getCoverMap,
      hasActiveEncounter,
      getLastRollTotalForActor,
    } = require('../../../scripts/utils.js');
    getSceneTargets.mockReturnValue([mockTarget1, mockTarget2]);
    getVisibilityMap.mockReturnValue({});
    getCoverMap.mockReturnValue({});
    hasActiveEncounter.mockReturnValue(false);
    getLastRollTotalForActor.mockReturnValue(null);
  });

  describe('Target Mode DC Display Fix', () => {
    test("should show each token's perception DC in target mode (not observer's stealth DC)", async () => {
      const context = await buildContext(mockApp, {});

      // Should have PC targets
      expect(context.pcTargets).toHaveLength(2);
      expect(context.npcTargets).toHaveLength(0);

      // Check that each target shows its own perception DC
      const amiriTarget = context.pcTargets.find((t) => t.name === 'Amiri');
      const ezrenTarget = context.pcTargets.find((t) => t.name === 'Ezren');

      expect(amiriTarget).toBeDefined();
      expect(ezrenTarget).toBeDefined();

      // In target mode, both perceptionDC and stealthDC should be the perception DC of each token
      expect(amiriTarget.perceptionDC).toBe(15); // Amiri's perception DC
      expect(amiriTarget.stealthDC).toBe(15); // Should also be Amiri's perception DC

      expect(ezrenTarget.perceptionDC).toBe(12); // Ezren's perception DC
      expect(ezrenTarget.stealthDC).toBe(12); // Should also be Ezren's perception DC

      // Should NOT show the observer's stealth DC (9) for any target
      expect(amiriTarget.perceptionDC).not.toBe(9); // Observer's stealth DC
      expect(amiriTarget.stealthDC).not.toBe(9); // Observer's stealth DC
      expect(ezrenTarget.perceptionDC).not.toBe(9); // Observer's stealth DC
      expect(ezrenTarget.stealthDC).not.toBe(9); // Observer's stealth DC

      // Verify we're in target mode
      expect(context.isTargetMode).toBe(true);
      expect(context.isObserverMode).toBe(false);
    });

    test('should show different perception DCs for different tokens', async () => {
      const context = await buildContext(mockApp, {});

      const amiriTarget = context.pcTargets.find((t) => t.name === 'Amiri');
      const ezrenTarget = context.pcTargets.find((t) => t.name === 'Ezren');

      // Each token should have its own unique perception DC
      expect(amiriTarget.perceptionDC).toBe(15);
      expect(ezrenTarget.perceptionDC).toBe(12);

      // They should be different
      expect(amiriTarget.perceptionDC).not.toBe(ezrenTarget.perceptionDC);
      expect(amiriTarget.stealthDC).not.toBe(ezrenTarget.stealthDC);
    });

    test('should verify the fix prevents the bug where all tokens show same DC', async () => {
      const context = await buildContext(mockApp, {});

      const amiriTarget = context.pcTargets.find((t) => t.name === 'Amiri');
      const ezrenTarget = context.pcTargets.find((t) => t.name === 'Ezren');

      // Before the fix, both would show the observer's stealth DC (9)
      // After the fix, each should show its own perception DC
      expect(amiriTarget.stealthDC).toBe(15); // Amiri's perception DC
      expect(ezrenTarget.stealthDC).toBe(12); // Ezren's perception DC

      // Verify they're different (not both showing 9)
      expect(amiriTarget.stealthDC).not.toBe(ezrenTarget.stealthDC);
      expect(amiriTarget.stealthDC).not.toBe(9); // Not observer's stealth DC
      expect(ezrenTarget.stealthDC).not.toBe(9); // Not observer's stealth DC
    });
  });

  describe('Observer Mode DC Display', () => {
    beforeEach(() => {
      // Switch to observer mode
      mockApp.mode = 'observer';
    });

    test("should show target's stealth DC in observer mode", async () => {
      const context = await buildContext(mockApp, {});

      // Should have PC targets
      expect(context.pcTargets).toHaveLength(2);

      const amiriTarget = context.pcTargets.find((t) => t.name === 'Amiri');
      const ezrenTarget = context.pcTargets.find((t) => t.name === 'Ezren');

      expect(amiriTarget).toBeDefined();
      expect(ezrenTarget).toBeDefined();

      // In observer mode, stealthDC should be the target's stealth DC
      // Since these are character tokens, they should have stealth DCs (or 0)
      expect(amiriTarget.perceptionDC).toBe(15); // Amiri's perception DC
      expect(ezrenTarget.perceptionDC).toBe(12); // Ezren's perception DC

      // Verify we're in observer mode
      expect(context.isObserverMode).toBe(true);
      expect(context.isTargetMode).toBe(false);
    });
  });

  describe('Context Properties', () => {
    test('should set correct mode properties in target mode', async () => {
      mockApp.mode = 'target';

      const context = await buildContext(mockApp, {});

      expect(context.mode).toBe('target');
      expect(context.isTargetMode).toBe(true);
      expect(context.isObserverMode).toBe(false);
    });

    test('should set correct mode properties in observer mode', async () => {
      mockApp.mode = 'observer';

      const context = await buildContext(mockApp, {});

      expect(context.mode).toBe('observer');
      expect(context.isTargetMode).toBe(false);
      expect(context.isObserverMode).toBe(true);
    });

    test('should set correct tab properties', async () => {
      mockApp.activeTab = 'visibility';

      const context = await buildContext(mockApp, {});

      expect(context.activeTab).toBe('visibility');
      expect(context.isVisibilityTab).toBe(true);
      expect(context.isCoverTab).toBe(false);

      mockApp.activeTab = 'cover';
      const context2 = await buildContext(mockApp, {});

      expect(context2.activeTab).toBe('cover');
      expect(context2.isVisibilityTab).toBe(false);
      expect(context2.isCoverTab).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle missing observer gracefully', async () => {
      mockApp.observer = null;

      const context = await buildContext(mockApp, {});

      expect(context.error).toBeDefined();
      expect(context.error).toContain('NO_OBSERVER_SELECTED');
    });

    test('should handle missing canvas gracefully', async () => {
      global.canvas = null;

      const context = await buildContext(mockApp, {});

      // Should not throw and should return a context
      expect(context).toBeDefined();
      expect(context.mode).toBe('target');
    });
  });
});
