import '../../setup.js';

describe('EventDrivenVisibilitySystem invalidation coordinator wiring', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('constructs one invalidation coordinator and passes it to EventHandlerFactory', async () => {
    await jest.isolateModulesAsync(async () => {
      const systemStateProvider = {
        setEnabled: jest.fn(),
      };
      const visibilityStateManager = {
        markAllTokensChangedImmediate: jest.fn(),
      };
      const cacheManagementService = { clearAllCaches: jest.fn() };
      const viewportFilterService = {
        createViewportFilterConfig: jest.fn(() => ({ filter: 'viewport' })),
      };
      const batchProcessor = {};
      const movementSnapshot = {
        active: false,
        currentSession: null,
        totals: { suppressedLightingRefreshes: 2 },
      };
      const batchOrchestrator = {
        enqueueTokens: jest.fn(),
        getMovementPerformanceSnapshot: jest.fn(() => movementSnapshot),
      };
      const coreServices = {
        positionManager: {},
        exclusionManager: {},
        optimizedVisibilityCalculator: { initialize: jest.fn() },
        visibilityMapService: {},
        overrideValidationManager: {},
        spatialAnalysisService: { getAffectedTokens: jest.fn() },
        globalLosCache: {},
        globalVisibilityCache: {},
        overrideService: {},
        visionAnalyzer: { clearCache: jest.fn() },
        telemetryReporter: {},
        lightingCalculator: {},
        conditionManager: {},
        lightingRasterService: {},
      };
      const services = {
        cacheManagementService,
        viewportFilterService,
        batchProcessor,
        batchOrchestrator,
        visibilityStateManager,
      };
      const container = {
        getCoreServices: jest.fn(async () => coreServices),
        get: jest.fn(async (name) => services[name]),
        createSystemStateProvider: jest.fn(async () => systemStateProvider),
      };
      const DependencyInjectionContainer = jest.fn(() => container);
      const coordinatorInstances = [];
      const AvsInvalidationCoordinator = jest.fn(function AvsInvalidationCoordinator(deps) {
        this.deps = deps;
        coordinatorInstances.push(this);
      });
      const EventHandlerFactory = {
        createHandlers: jest.fn(async () => ({})),
      };

      jest.doMock(
        '../../../scripts/visibility/auto-visibility/core/DependencyInjectionContainer.js',
        () => ({ __esModule: true, DependencyInjectionContainer }),
      );
      jest.doMock(
        '../../../scripts/visibility/auto-visibility/core/AvsInvalidationCoordinator.js',
        () => ({ __esModule: true, AvsInvalidationCoordinator }),
      );
      jest.doMock(
        '../../../scripts/visibility/auto-visibility/core/EventHandlerFactory.js',
        () => ({ __esModule: true, EventHandlerFactory }),
      );
      jest.doMock('../../../scripts/chat/services/infra/AvsOverrideManager.js', () => ({
        __esModule: true,
        default: { registerHooks: jest.fn() },
      }));

      const { EventDrivenVisibilitySystem } = await import(
        '../../../scripts/visibility/auto-visibility/EventDrivenVisibilitySystem.js'
      );

      const system = new EventDrivenVisibilitySystem();
      await system.initialize();

      expect(system.getMovementPerformanceSnapshot()).toEqual({
        ...movementSnapshot,
      });
      expect(AvsInvalidationCoordinator).toHaveBeenCalledWith({
        systemStateProvider,
        visibilityStateManager,
        cacheManager: cacheManagementService,
        batchOrchestrator,
        visionAnalyzer: coreServices.visionAnalyzer,
        spatialAnalyzer: coreServices.spatialAnalysisService,
        overrideValidationManager: coreServices.overrideValidationManager,
      });
      expect(EventHandlerFactory.createHandlers).toHaveBeenCalledWith(
        systemStateProvider,
        visibilityStateManager,
        expect.objectContaining({
          spatialAnalysisService: coreServices.spatialAnalysisService,
          exclusionManager: coreServices.exclusionManager,
          overrideValidationManager: coreServices.overrideValidationManager,
          positionManager: coreServices.positionManager,
          cacheManager: cacheManagementService,
        }),
        {
          batchOrchestrator,
          invalidationCoordinator: coordinatorInstances[0],
        },
      );
    });
  });

  test('coalesces concurrent initialization and ignores later initialize calls', async () => {
    await jest.isolateModulesAsync(async () => {
      const systemStateProvider = {
        setEnabled: jest.fn(),
      };
      const visibilityStateManager = {
        markAllTokensChangedImmediate: jest.fn(),
      };
      const cacheManagementService = { clearAllCaches: jest.fn() };
      const viewportFilterService = {
        createViewportFilterConfig: jest.fn(() => ({ filter: 'viewport' })),
      };
      const batchProcessor = {};
      const batchOrchestrator = { enqueueTokens: jest.fn() };
      const coreServices = {
        positionManager: {},
        exclusionManager: {},
        optimizedVisibilityCalculator: { initialize: jest.fn() },
        visibilityMapService: {},
        overrideValidationManager: {},
        spatialAnalysisService: { getAffectedTokens: jest.fn() },
        globalLosCache: {},
        globalVisibilityCache: {},
        overrideService: {},
        visionAnalyzer: { clearCache: jest.fn() },
        telemetryReporter: {},
        lightingCalculator: {},
        conditionManager: {},
        lightingRasterService: {},
      };
      const services = {
        cacheManagementService,
        viewportFilterService,
        batchProcessor,
        batchOrchestrator,
        visibilityStateManager,
      };
      let resolveCoreServices;
      const coreServicesPromise = new Promise((resolve) => {
        resolveCoreServices = () => resolve(coreServices);
      });
      const container = {
        getCoreServices: jest.fn(() => coreServicesPromise),
        get: jest.fn(async (name) => services[name]),
        createSystemStateProvider: jest.fn(async () => systemStateProvider),
      };
      const DependencyInjectionContainer = jest.fn(() => container);
      const AvsInvalidationCoordinator = jest.fn();
      const EventHandlerFactory = {
        createHandlers: jest.fn(async () => ({})),
      };
      const AvsOverrideManager = { registerHooks: jest.fn() };

      jest.doMock(
        '../../../scripts/visibility/auto-visibility/core/DependencyInjectionContainer.js',
        () => ({ __esModule: true, DependencyInjectionContainer }),
      );
      jest.doMock(
        '../../../scripts/visibility/auto-visibility/core/AvsInvalidationCoordinator.js',
        () => ({ __esModule: true, AvsInvalidationCoordinator }),
      );
      jest.doMock(
        '../../../scripts/visibility/auto-visibility/core/EventHandlerFactory.js',
        () => ({ __esModule: true, EventHandlerFactory }),
      );
      jest.doMock('../../../scripts/chat/services/infra/AvsOverrideManager.js', () => ({
        __esModule: true,
        default: AvsOverrideManager,
      }));

      const { EventDrivenVisibilitySystem } = await import(
        '../../../scripts/visibility/auto-visibility/EventDrivenVisibilitySystem.js'
      );

      const system = new EventDrivenVisibilitySystem();
      const firstInitialize = system.initialize();
      const secondInitialize = system.initialize();

      await Promise.resolve();
      expect(container.getCoreServices).toHaveBeenCalledTimes(1);

      resolveCoreServices();
      await Promise.all([firstInitialize, secondInitialize]);

      expect(EventHandlerFactory.createHandlers).toHaveBeenCalledTimes(1);
      expect(AvsOverrideManager.registerHooks).toHaveBeenCalledTimes(1);

      await system.initialize();

      expect(container.getCoreServices).toHaveBeenCalledTimes(1);
      expect(EventHandlerFactory.createHandlers).toHaveBeenCalledTimes(1);
      expect(AvsOverrideManager.registerHooks).toHaveBeenCalledTimes(1);
    });
  });
});
