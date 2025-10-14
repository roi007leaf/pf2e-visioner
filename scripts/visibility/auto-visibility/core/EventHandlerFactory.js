/**
 * EventHandlerFactory creates and initializes all event handlers with consistent patterns.
 * Eliminates repetitive initialization code and centralizes handler management.
 */

import { ActorEventHandler } from './ActorEventHandler.js';
import { EffectEventHandler } from './EffectEventHandler.js';
import { ItemEventHandler } from './ItemEventHandler.js';
import { LightingEventHandler } from './LightingEventHandler.js';
import { SceneEventHandler } from './SceneEventHandler.js';
import { TemplateEventHandler } from './TemplateEventHandler.js';
import { TokenEventHandler } from './TokenEventHandler.js';
import { WallEventHandler } from './WallEventHandler.js';

export class EventHandlerFactory {
    /**
     * Create all event handlers with proper dependency injection.
     * @param {SystemStateProvider} systemStateProvider 
     * @param {VisibilityStateManager} visibilityStateManager 
     * @param {Object} managers - Collection of manager instances
     * @param {Object} [options] - Optional dependencies like batchOrchestrator
     * @returns {Promise<Object>} Collection of initialized event handlers
     */
    static async createHandlers(systemStateProvider, visibilityStateManager, managers, options = {}) {
        const {
            spatialAnalysisService,
            exclusionManager,
            overrideValidationManager,
            positionManager,
            cacheManager
        } = managers;

        const { batchOrchestrator = null } = options;

        // Define handler configurations
        const handlerConfigs = [
            {
                name: 'tokenEventHandler',
                Handler: TokenEventHandler,
                deps: [
                    systemStateProvider,
                    visibilityStateManager,
                    spatialAnalysisService,
                    exclusionManager,
                    overrideValidationManager,
                    positionManager,
                    cacheManager,
                    batchOrchestrator
                ]
            },
            {
                name: 'templateEventHandler',
                Handler: TemplateEventHandler,
                deps: [systemStateProvider, visibilityStateManager]
            },
            {
                name: 'lightingEventHandler',
                Handler: LightingEventHandler,
                deps: [systemStateProvider, visibilityStateManager, cacheManager]
            },
            {
                name: 'wallEventHandler',
                Handler: WallEventHandler,
                deps: [systemStateProvider, visibilityStateManager, cacheManager, batchOrchestrator]
            },
            {
                name: 'actorEventHandler',
                Handler: ActorEventHandler,
                deps: [systemStateProvider, visibilityStateManager, exclusionManager]
            },
            {
                name: 'itemEventHandler',
                Handler: ItemEventHandler,
                deps: [systemStateProvider, visibilityStateManager, exclusionManager, cacheManager]
            },
            {
                name: 'effectEventHandler',
                Handler: EffectEventHandler,
                deps: [systemStateProvider, visibilityStateManager, exclusionManager]
            },
            {
                name: 'sceneEventHandler',
                Handler: SceneEventHandler,
                deps: [systemStateProvider, visibilityStateManager, cacheManager]
            }
        ];

        const handlers = {};

        for (const config of handlerConfigs) {
            try {
                handlers[config.name] = new config.Handler(...config.deps);
                handlers[config.name].initialize();
            } catch (error) {
                console.error(`PF2E Visioner | Failed to initialize ${config.name}:`, error);
                // Continue with other handlers even if one fails
            }
        }

        return handlers;
    }

    /**
     * Create handlers using dependency injection container.
     * @param {DependencyInjectionContainer} container - DI container
     * @returns {Promise<Object>} Collection of initialized event handlers
     */
    static async createHandlersWithContainer(container) {
        const systemStateProvider = await container.createSystemStateProvider();

        // Get core services
        const coreServices = await container.getCoreServices();

        // Create batch orchestrator
        const batchOrchestrator = await container.get('batchOrchestrator', {
            batchProcessor: coreServices.batchProcessor,
            telemetryReporter: coreServices.telemetryReporter,
            exclusionManager: coreServices.exclusionManager,
            setVisibilityBetween: coreServices.setVisibilityBetween,
            getAllTokens: () => canvas.tokens?.placeables || [],
            moduleId: 'pf2e-visioner'
        });

        // Create visibility state manager
        const visibilityStateManager = await container.get('visibilityStateManager', {
            batchProcessor: (changedTokens) => batchOrchestrator.enqueueTokens(changedTokens),
            spatialAnalyzer: (oldPos, newPos, tokenId) =>
                coreServices.spatialAnalysisService.getAffectedTokens(oldPos, newPos, tokenId),
            exclusionManager: () => coreServices.exclusionManager
        });

        // Create handlers with the factory
        return this.createHandlers(
            systemStateProvider,
            visibilityStateManager,
            {
                spatialAnalysisService: coreServices.spatialAnalysisService,
                exclusionManager: coreServices.exclusionManager,
                overrideValidationManager: coreServices.overrideValidationManager,
                positionManager: coreServices.positionManager,
                cacheManager: coreServices.cacheManager
            },
            { batchOrchestrator }
        );
    }
}