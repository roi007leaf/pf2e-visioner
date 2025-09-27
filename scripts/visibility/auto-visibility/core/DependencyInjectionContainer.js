/**
 * DependencyInjectionContainer manages all dependency creation and injection for the visibility system.
 * Provides centralized dependency management and reduces constructor complexity.
 */
export class DependencyInjectionContainer {
    #services = new Map();
    #factories = new Map();
    #singletons = new Map();

    constructor() {
        this.#registerFactories();
    }

    /**
     * Register all service factories.
     * @private
     */
    #registerFactories() {
        // Core calculator services
        this.#factories.set('lightingCalculator', async () => {
            const { LightingCalculator } = await import('../LightingCalculator.js');
            return LightingCalculator.getInstance();
        });

        this.#factories.set('visionAnalyzer', async () => {
            const { VisionAnalyzer } = await import('../VisionAnalyzer.js');
            return VisionAnalyzer.getInstance();
        });

        this.#factories.set('conditionManager', async () => {
            const { ConditionManager } = await import('../ConditionManager.js');
            return ConditionManager.getInstance();
        });

        this.#factories.set('optimizedVisibilityCalculator', async () => {
            const { optimizedVisibilityCalculator } = await import('../VisibilityCalculator.js');
            return optimizedVisibilityCalculator;
        });

        // Lighting raster service (fast-path darkness sampling)
        this.#factories.set('lightingRasterService', async () => {
            const { LightingRasterService } = await import('./LightingRasterService.js');
            return new LightingRasterService();
        });

        // Cache services
        this.#factories.set('globalLosCache', async () => {
            const { GlobalLosCache } = await import('../utils/GlobalLosCache.js');
            return new GlobalLosCache(5000); // 5 second TTL
        });

        this.#factories.set('globalVisibilityCache', async () => {
            const { GlobalVisibilityCache } = await import('../utils/GlobalVisibilityCache.js');
            return new GlobalVisibilityCache(3000); // 3 second TTL
        });

        // Visibility map service
        this.#factories.set('visibilityMapService', async () => {
            const { VisibilityMapService } = await import('./VisibilityMapService.js');
            return new VisibilityMapService();
        });

        // Override service
        this.#factories.set('overrideService', async () => {
            const { OverrideService } = await import('./OverrideService.js');
            return new OverrideService();
        });

        // Core manager services (require AVS instance)
        this.#factories.set('telemetryReporter', async () => {
            const { TelemetryReporter } = await import('./TelemetryReporter.js');
            return new TelemetryReporter();
        });

        this.#factories.set('performanceMetricsCollector', async () => {
            const { PerformanceMetricsCollector } = await import('./PerformanceMetricsCollector.js');
            return new PerformanceMetricsCollector();
        });

        this.#factories.set('overrideValidationManager', async (dependencies) => {
            const { OverrideValidationManager } = await import('./OverrideValidationManager.js');
            return new OverrideValidationManager(dependencies.exclusionManager, dependencies.positionManager, dependencies.optimizedVisibilityCalculator);
        });

        this.#factories.set('positionManager', async (dependencies) => {
            const { PositionManager } = await import('./PositionManager.js');
            return new PositionManager(dependencies);
        });

        this.#factories.set('exclusionManager', async () => {
            const { ExclusionManager } = await import('./ExclusionManager.js');
            return new ExclusionManager();
        });

        // System state provider factory
        this.#factories.set('systemStateProvider', async () => {
            const { SystemStateProvider } = await import('./SystemStateProvider.js');
            return new SystemStateProvider();
        });

        // Visibility state manager factory
        this.#factories.set('visibilityStateManager', async (dependencies) => {
            const { VisibilityStateManager } = await import('./VisibilityStateManager.js');
            return new VisibilityStateManager({
                batchProcessor: dependencies.batchProcessor,
                spatialAnalyzer: dependencies.spatialAnalyzer,
                exclusionManager: dependencies.exclusionManager,
                systemStateProvider: dependencies.systemStateProvider
            });
        });

        // Batch processor factory
        this.#factories.set('batchProcessor', async (dependencies) => {
            const { BatchProcessor } = await import('./BatchProcessor.js');
            return new BatchProcessor({
                spatialAnalyzer: dependencies.spatialAnalyzer,
                viewportFilter: dependencies.viewportFilter,
                optimizedVisibilityCalculator: dependencies.optimizedVisibilityCalculator,
                globalLosCache: dependencies.globalLosCache,
                globalVisibilityCache: dependencies.globalVisibilityCache,
                positionManager: dependencies.positionManager,
                overrideService: dependencies.overrideService,
                visibilityMapService: dependencies.visibilityMapService,
                debug: dependencies.debug,
                maxVisibilityDistance: dependencies.maxVisibilityDistance
            });
        });

        // Batch orchestrator factory
        this.#factories.set('batchOrchestrator', async (dependencies) => {
            const { BatchOrchestrator } = await import('./BatchOrchestrator.js');
            return new BatchOrchestrator({
                batchProcessor: dependencies.batchProcessor,
                telemetryReporter: dependencies.telemetryReporter,
                exclusionManager: dependencies.exclusionManager,
                viewportFilterService: dependencies.viewportFilterService,
                visibilityMapService: dependencies.visibilityMapService,
                moduleId: dependencies.moduleId
            });
        });

        // Spatial analysis service factory
        this.#factories.set('spatialAnalysisService', async (dependencies) => {
            const { SpatialAnalysisService } = await import('./SpatialAnalysisService.js');
            const service = new SpatialAnalysisService(
                dependencies.positionManager,
                dependencies.exclusionManager,
                dependencies.performanceMetricsCollector
            );
            return service;
        });

        // Cache management service factory
        this.#factories.set('cacheManagementService', async (dependencies) => {
            const { CacheManagementService } = await import('./CacheManagementService.js');
            const service = new CacheManagementService();
            if (dependencies.coreServices) {
                service.initialize(dependencies.coreServices);
            }
            return service;
        });

        // Viewport filter service factory
        this.#factories.set('viewportFilterService', async (dependencies) => {
            const { ViewportFilterService } = await import('./ViewportFilterService.js');
            const service = new ViewportFilterService();
            if (dependencies.positionManager) {
                service.initialize(dependencies.positionManager);
            }
            return service;
        });
    }

    /**
     * Get or create a service by name.
     * @param {string} serviceName - Name of the service to get
     * @param {any} dependencies - Dependencies to pass to the factory
     * @returns {Promise<any>} The service instance
     */
    async get(serviceName, dependencies = null) {
        // Check if it's a singleton and already exists
        if (this.#singletons.has(serviceName)) {
            return this.#singletons.get(serviceName);
        }

        // Check if service is already created
        if (this.#services.has(serviceName)) {
            return this.#services.get(serviceName);
        }

        // Get factory and create service
        const factory = this.#factories.get(serviceName);
        if (!factory) {
            throw new Error(`Unknown service: ${serviceName}`);
        }

        const service = await factory(dependencies);
        this.#services.set(serviceName, service);

        return service;
    }

    /**
     * Register a service as a singleton.
     * @param {string} serviceName - Name of the service
     * @param {any} instance - Service instance
     */
    setSingleton(serviceName, instance) {
        this.#singletons.set(serviceName, instance);
    }

    /**
     * Get all core dependencies needed for AVS initialization.
     * @returns {Promise<Object>} Object containing all dependencies
     */
    async getCoreServices() {
        // Get basic services first
        const [
            lightingCalculator,
            visionAnalyzer,
            conditionManager,
            optimizedVisibilityCalculator,
            globalLosCache,
            globalVisibilityCache,
            performanceMetricsCollector,
            systemStateProvider
        ] = await Promise.all([
            this.get('lightingCalculator'),
            this.get('visionAnalyzer'),
            this.get('conditionManager'),
            this.get('optimizedVisibilityCalculator'),
            this.get('globalLosCache'),
            this.get('globalVisibilityCache'),
            this.get('performanceMetricsCollector'),
            this.get('systemStateProvider')
        ]);

        // Get manager services that depend on AVS instance
        // First get the dependencies for spatial analysis service
        const positionManager = await this.get('positionManager', systemStateProvider);
        const exclusionManager = await this.get('exclusionManager');

        const [
            telemetryReporter,
            spatialAnalysisService,
            overrideValidationManager
        ] = await Promise.all([
            this.get('telemetryReporter'),
            this.get('spatialAnalysisService', {
                positionManager: positionManager,
                exclusionManager: exclusionManager,
                performanceMetricsCollector: performanceMetricsCollector
            }),
            this.get('overrideValidationManager', {
                exclusionManager: exclusionManager,
                positionManager: positionManager,
                optimizedVisibilityCalculator: optimizedVisibilityCalculator
            })
        ]);

        return {
            // Core calculators
            lightingCalculator,
            visionAnalyzer,
            conditionManager,
            optimizedVisibilityCalculator,
            lightingRasterService: await this.get('lightingRasterService'),

            // Caches
            globalLosCache,
            globalVisibilityCache,

            // Visibility map service
            visibilityMapService: await this.get('visibilityMapService'),

            // Override service
            overrideService: await this.get('overrideService'),

            // Managers
            telemetryReporter,
            spatialAnalysisService,
            maxVisibilityDistance: spatialAnalysisService?.getMaxVisibilityDistance?.(),
            overrideValidationManager,
            positionManager,
            exclusionManager,
            performanceMetricsCollector
        };
    }

    /**
     * Create system state provider with proper dependencies.
     * @returns {Promise<SystemStateProvider>}
     */
    async createSystemStateProvider() {
        return this.get('systemStateProvider');
    }

    /**
     * Clear all cached services (useful for testing or reinitialization).
     */
    clear() {
        this.#services.clear();
        this.#singletons.clear();
    }

    /**
     * Get service registry stats for debugging.
     * @returns {Object} Registry statistics
     */
    getStats() {
        return {
            registeredFactories: this.#factories.size,
            createdServices: this.#services.size,
            singletons: this.#singletons.size,
            serviceNames: Array.from(this.#services.keys()),
            singletonNames: Array.from(this.#singletons.keys())
        };
    }
}