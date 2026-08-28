const BEHAVIOR_TYPES = [
  'pf2e-visioner.Pf2eVisionerVisibility',
  'pf2e-visioner.Pf2eVisionerConcealment',
  'pf2e-visioner.Pf2eVisionerCover',
  'pf2e-visioner.Pf2eVisionerSenseSuppression',
];

describe('Visioner Region behavior registration lifecycle', () => {
  let originalConfig;
  let originalFoundry;
  let originalHooks;

  beforeEach(() => {
    jest.resetModules();

    originalConfig = global.CONFIG;
    originalFoundry = global.foundry;
    originalHooks = global.Hooks;

    global.foundry = {
      data: {
        regionBehaviors: {
          RegionBehaviorType: class RegionBehaviorType {
            static defineSchema() {
              return {};
            }

            static _createEventsField(events) {
              return events;
            }

            _getTerrainEffects() {
              return [];
            }
          },
        },
      },
    };
    global.CONFIG = {
      RegionBehavior: {
        dataModels: {},
        typeIcons: {},
        typeLabels: {},
      },
    };
  });

  afterEach(() => {
    global.CONFIG = originalConfig;
    global.foundry = originalFoundry;
    global.Hooks = originalHooks;
  });

  test('registers data models before existing Scene behaviors hydrate', async () => {
    const callbacks = new Map();
    global.Hooks = {
      once: jest.fn((hook, callback) => callbacks.set(hook, callback)),
    };

    await import('../../../scripts/regions/register.js');

    callbacks.get('init')?.();

    const hydratedSystems = BEHAVIOR_TYPES.map((type) => {
      const BehaviorModel = CONFIG.RegionBehavior.dataModels[type] ?? class UnknownBehavior {};
      return new BehaviorModel();
    });

    callbacks.get('ready')?.();

    for (const system of hydratedSystems) {
      expect(typeof system._getTerrainEffects).toBe('function');
    }
  });
});
