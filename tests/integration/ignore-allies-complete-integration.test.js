/**
 * Complete integration test for ignore allies functionality
 * This test verifies the ENTIRE chain from template to filtering
 * and would have caught the missing ApplicationV2 action registration
 */

import { jest } from '@jest/globals';

describe('Ignore Allies Complete Integration', () => {
  let originalGame, originalCanvas, originalFoundry;

  beforeEach(() => {
    jest.clearAllMocks();

    // Store original globals
    originalGame = global.game;
    originalCanvas = global.canvas;
    originalFoundry = global.foundry;

    // Setup mock environment
    global.game = {
      settings: {
        get: jest.fn().mockImplementation((module, setting) => {
          if (module === 'pf2e-visioner' && setting === 'ignoreAllies') return false;
          return false;
        }),
      },
    };

    global.canvas = {
      tokens: { placeables: [] },
    };

    global.MODULE_ID = 'pf2e-visioner';

    // Mock foundry ApplicationV2
    global.foundry = {
      applications: {
        api: {
          ApplicationV2: class MockApplicationV2 {
            constructor(options = {}) {
              this.options = options;
            }

            static DEFAULT_OPTIONS = {
              actions: {},
            };
          },
        },
      },
    };
  });

  afterEach(() => {
    // Restore original globals
    global.game = originalGame;
    global.canvas = originalCanvas;
    global.foundry = originalFoundry;
    jest.restoreAllMocks();
  });

  describe('1. Function Implementation', () => {
    test('toggleIgnoreAllies function should exist in ui.js', async () => {
      const uiActions = await import('../../scripts/managers/token-manager/actions/ui.js');

      expect(uiActions.toggleIgnoreAllies).toBeDefined();
      expect(typeof uiActions.toggleIgnoreAllies).toBe('function');
      expect(uiActions.toggleIgnoreAllies.constructor.name).toBe('AsyncFunction');
    });

    test('toggleIgnoreAllies should be exported from index.js', async () => {
      const indexActions = await import('../../scripts/managers/token-manager/actions/index.js');

      expect(indexActions.toggleIgnoreAllies).toBeDefined();
      expect(typeof indexActions.toggleIgnoreAllies).toBe('function');
    });
  });

  describe('2. Token Manager Class Integration', () => {
    test('VisionerTokenManager should have static toggleIgnoreAllies method', async () => {
      const { VisionerTokenManager } = await import(
        '../../scripts/managers/token-manager/TokenManager.js'
      );

      expect(VisionerTokenManager.toggleIgnoreAllies).toBeDefined();
      expect(typeof VisionerTokenManager.toggleIgnoreAllies).toBe('function');
      expect(VisionerTokenManager.toggleIgnoreAllies.constructor.name).toBe('AsyncFunction');
    });

    test('CRITICAL: toggleIgnoreAllies should be registered in ApplicationV2 actions', async () => {
      const { VisionerTokenManager } = await import(
        '../../scripts/managers/token-manager/TokenManager.js'
      );

      // This is the test that would have caught the bug!
      const defaultOptions = VisionerTokenManager.DEFAULT_OPTIONS;
      expect(defaultOptions).toBeDefined();
      expect(defaultOptions.actions).toBeDefined();
      expect(defaultOptions.actions.toggleIgnoreAllies).toBeDefined();
      expect(defaultOptions.actions.toggleIgnoreAllies).toBe(
        VisionerTokenManager.toggleIgnoreAllies,
      );

      console.log(
        '✅ CRITICAL TEST PASSED: toggleIgnoreAllies is registered in ApplicationV2 actions',
      );
    });

    test('toggleIgnoreAllies should be alongside other working actions', async () => {
      const { VisionerTokenManager } = await import(
        '../../scripts/managers/token-manager/TokenManager.js'
      );

      const actions = VisionerTokenManager.DEFAULT_OPTIONS.actions;

      // Verify all expected toggle actions are present
      expect(actions.toggleEncounterFilter).toBeDefined();
      expect(actions.toggleIgnoreAllies).toBeDefined(); // This would have failed before the fix
      expect(actions.toggleMode).toBeDefined();
      expect(actions.toggleTab).toBeDefined();

      // Verify they're all pointing to functions (binding may override static methods)
      expect(typeof actions.toggleEncounterFilter).toBe('function');
      expect(typeof actions.toggleIgnoreAllies).toBe('function');
      expect(typeof actions.toggleMode).toBe('function');
      expect(typeof actions.toggleTab).toBe('function');
    });
  });

  describe('3. Template Integration', () => {
    test('observer-info.hbs should have correct data-action attribute', async () => {
      const fs = await import('fs');
      const path = await import('path');

      const templatePath = path.resolve('templates/observer-info.hbs');
      const templateContent = fs.readFileSync(templatePath, 'utf8');

      // Check for the ignore allies checkbox with correct data-action
      expect(templateContent).toMatch(/data-action="toggleIgnoreAllies"/);
      expect(templateContent).toMatch(/{{#if ignoreAllies}}checked{{\/if}}/);

      // Verify it's structured like the working encounter filter
      expect(templateContent).toMatch(/data-action="toggleEncounterFilter"/);

      console.log('✅ Template has correct data-action attributes');
    });

    test('all preview templates should have ignore allies checkbox', async () => {
      const fs = await import('fs');
      const path = await import('path');

      const templatesDir = path.resolve('templates');
      const templateFiles = fs.readdirSync(templatesDir).filter((f) => f.endsWith('-preview.hbs'));

      let templatesWithIgnoreAllies = 0;

      for (const templateFile of templateFiles) {
        const templatePath = path.join(templatesDir, templateFile);
        const content = fs.readFileSync(templatePath, 'utf8');

        if (content.includes('data-action="toggleIgnoreAllies"')) {
          templatesWithIgnoreAllies++;

          // Verify the checkbox structure is correct
          expect(content).toMatch(/{{#if ignoreAllies}}checked{{\/if}}/);
        }
      }

      // Should have ignore allies in multiple preview templates
      expect(templatesWithIgnoreAllies).toBeGreaterThan(0);
      console.log(
        `✅ Found ignore allies checkbox in ${templatesWithIgnoreAllies} preview templates`,
      );
    });
  });

  describe('4. End-to-End Workflow Simulation', () => {
    test('complete workflow: action registration -> method call -> state change', async () => {
      const { VisionerTokenManager } = await import(
        '../../scripts/managers/token-manager/TokenManager.js'
      );

      // 1. Verify action is registered (this would have caught the bug)
      const toggleAction = VisionerTokenManager.DEFAULT_OPTIONS.actions.toggleIgnoreAllies;
      expect(toggleAction).toBeDefined();

      // 2. Create mock token manager instance
      const mockInstance = {
        ignoreAllies: false,
        render: jest.fn().mockResolvedValue(undefined),
      };

      // 3. Simulate ApplicationV2 calling the action (what happens when checkbox is clicked)
      const mockEvent = { type: 'change', target: { checked: true } };
      const mockButton = { dataset: {} };

      // 4. Call the action method (simulating ApplicationV2 action system)
      await toggleAction.call(mockInstance, mockEvent, mockButton);

      // 5. Verify the state changed and render was called
      expect(mockInstance.ignoreAllies).toBe(true);
      expect(mockInstance.render).toHaveBeenCalledWith({ force: true });

      console.log('✅ Complete workflow simulation passed');
    });

    test('filtering logic verification: shouldFilterAlly function works correctly', async () => {
      // Test the core filtering logic directly (avoiding module import issues)
      const sharedUtils = await import('../../scripts/chat/services/infra/shared-utils.js');

      const observer = {
        actor: { alliance: 'party', type: 'character' },
        document: { disposition: 1 },
      };

      const ally = {
        actor: { alliance: 'party', type: 'character' },
        document: { disposition: 1 },
      };

      const enemy = {
        actor: { alliance: 'opposition', type: 'npc' },
        document: { disposition: -1 },
      };

      // Test the core filtering logic
      expect(sharedUtils.shouldFilterAlly(observer, ally, 'enemies', false)).toBe(false); // No filtering when ignoreAllies=false
      expect(sharedUtils.shouldFilterAlly(observer, ally, 'enemies', true)).toBe(true); // Filter ally when ignoreAllies=true
      expect(sharedUtils.shouldFilterAlly(observer, enemy, 'enemies', true)).toBe(false); // Don't filter enemy when ignoreAllies=true

      console.log('✅ Core filtering logic works correctly');
    });
  });

  describe('5. Regression Prevention', () => {
    test('should prevent the exact bug that occurred: missing action registration', async () => {
      const { VisionerTokenManager } = await import(
        '../../scripts/managers/token-manager/TokenManager.js'
      );

      // This test specifically checks for the bug that occurred
      const actions = VisionerTokenManager.DEFAULT_OPTIONS.actions;

      // These are the critical checks that would have caught the issue
      expect(actions).toHaveProperty('toggleIgnoreAllies');
      expect(actions.toggleIgnoreAllies).toBe(VisionerTokenManager.toggleIgnoreAllies);

      // Verify it's not undefined or null (the actual bug)
      expect(actions.toggleIgnoreAllies).not.toBeUndefined();
      expect(actions.toggleIgnoreAllies).not.toBeNull();

      // Verify it's a function that can be called
      expect(typeof actions.toggleIgnoreAllies).toBe('function');

      console.log('✅ REGRESSION TEST PASSED: The exact bug that occurred is now prevented');
    });

    test('should verify all toggle actions are consistently registered', async () => {
      const { VisionerTokenManager } = await import(
        '../../scripts/managers/token-manager/TokenManager.js'
      );

      const actions = VisionerTokenManager.DEFAULT_OPTIONS.actions;
      const toggleActions = [
        'toggleMode',
        'toggleEncounterFilter',
        'toggleIgnoreAllies',
        'toggleTab',
      ];

      for (const actionName of toggleActions) {
        // Each toggle action should be registered
        expect(actions).toHaveProperty(actionName);
        expect(actions[actionName]).toBeDefined();
        expect(typeof actions[actionName]).toBe('function');

        // Each should be a function (binding may override static methods)
        expect(typeof actions[actionName]).toBe('function');
      }

      console.log('✅ All toggle actions are consistently registered');
    });
  });

  describe('6. Future-Proofing', () => {
    test('should detect if new toggle actions are added but not registered', async () => {
      const { VisionerTokenManager } = await import(
        '../../scripts/managers/token-manager/TokenManager.js'
      );

      // Get all static methods that look like toggle actions
      const staticMethods = Object.getOwnPropertyNames(VisionerTokenManager).filter(
        (name) => name.startsWith('toggle') && typeof VisionerTokenManager[name] === 'function',
      );

      const registeredActions = Object.keys(VisionerTokenManager.DEFAULT_OPTIONS.actions).filter(
        (name) => name.startsWith('toggle'),
      );

      // Every static toggle method should be registered as an action
      for (const methodName of staticMethods) {
        expect(registeredActions).toContain(methodName);
        expect(typeof VisionerTokenManager.DEFAULT_OPTIONS.actions[methodName]).toBe('function');
      }

      console.log(
        `✅ Future-proofing: All ${staticMethods.length} toggle methods are properly registered`,
      );
    });
  });
});
