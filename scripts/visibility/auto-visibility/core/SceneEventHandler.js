import { CacheManagementService } from './CacheManagementService.js';
import { SystemStateProvider } from './SystemStateProvider.js';
import { VisibilityStateManager } from './VisibilityStateManager.js';

/**
 * SceneEventHandler - Handles scene-related events that may affect visibility
 * 
 * This includes:
 * - Darkness level changes
 * - Environment lighting changes
 * - Scene configuration changes that affect perception
 * 
 * Follows SOLID principles by focusing solely on scene event processing
 * and delegating state management to injected dependencies.
 */
export class SceneEventHandler {
    /** @type {SystemStateProvider} */
    #systemStateProvider = null;

    /** @type {VisibilityStateManager} */
    #visibilityStateManager = null;

    /** @type {CacheManagementService} */
    #cacheManager = null;


    constructor(systemStateProvider, visibilityStateManager, cacheManager = null) {
        this.#systemStateProvider = systemStateProvider;
        this.#visibilityStateManager = visibilityStateManager;
        this.#cacheManager = cacheManager;
    }

    /**
     * Initialize the scene event handler by registering hooks
     */
    initialize() {
        // Scene events that affect lighting and perception
        Hooks.on('updateScene', this.#onSceneUpdate.bind(this));

        // Track SceneConfig open/close to defer visibility recalculations until Save
        Hooks.on('renderSceneConfig', this.#onSceneConfigOpen.bind(this));
        Hooks.on('closeSceneConfig', this.#onSceneConfigClose.bind(this));
        // PF2e-specific subclass hooks
        Hooks.on('renderSceneConfigPF2e', this.#onSceneConfigOpen.bind(this));
        Hooks.on('closeSceneConfigPF2e', this.#onSceneConfigClose.bind(this));
    }

    /**
     * Check if scene changes affect visibility calculations
     * @param {Object} changes - The scene change data
     * @returns {boolean} Whether these changes affect visibility
     */
    #affectsVisibility(changes) {
        if (!changes) return false;

        // Check for lighting-related changes that affect visibility
        const visibilityFields = [
            'darkness',                      // Global darkness level
            'environment.darknessLevel',     // Environment darkness
            'environment.globalLight',       // Global illumination
            'environment.globalLightThreshold', // Light threshold changes
            'grid.distance',                 // Grid changes that affect distance calculations
            'grid.size',                     // Grid size changes
            'walls',                         // Wall changes
            'lights'                         // Light changes
        ];

        return visibilityFields.some(field => foundry.utils.hasProperty(changes, field));
    }

    /**
     * Handle scene update events
     * @param {Scene} scene - The updated scene
     * @param {Object} changes - The changes made to the scene
     * @param {Object} [options] - Update options (Foundry)
     * @param {string} [userId] - ID of the user that initiated the update
     */
    #onSceneUpdate(scene, changes, options = {}, userId) {
        if (!this.#systemStateProvider.shouldProcessEvents()) return;

        // Only proceed if changes affect visibility
        if (!this.#affectsVisibility(changes)) return;

        // Ignore ephemeral/preview updates from SceneConfig to prevent feedback loops
        // Foundry often uses { temporary: true } or { diff: false } or { render: false } for live previews
        if (options?.temporary === true || options?.diff === false || options?.render === false) {
            // But if the SceneConfig is open and this affects visibility, mark as pending so we flush on close
            if (this.#systemStateProvider.isSceneConfigOpen() && this.#affectsVisibility(changes)) {
                this.#systemStateProvider.markPendingLightingChange();
                this.#systemStateProvider.debug('SceneEventHandler: preview lighting change detected - deferring');
            }
            return;
        }

        // Check if darkness level or other lighting changed (FoundryVTT v13+ compatibility)
        const darknessChanged =
            changes.environment?.darknessLevel !== undefined || changes.darkness !== undefined;

        const environmentChanged = changes.environment !== undefined;
        const lightingChanged = darknessChanged || environmentChanged;

        if (lightingChanged) {
            // If Scene Config is open, defer applying changes until the config is closed (Save)
            if (this.#systemStateProvider.isSceneConfigOpen()) {
                this.#systemStateProvider.markPendingLightingChange();
                this.#systemStateProvider.debug('SceneEventHandler: deferring lighting change until SceneConfig closes');
                return;
            }

            this.#systemStateProvider.debug('SceneEventHandler: scene lighting change detected', {
                sceneId: scene.id,
                sceneName: scene.name,
                darknessChanged,
                environmentChanged,
                changes: {
                    darkness: changes.darkness,
                    environment: changes.environment
                }
            });

            // Persisted lighting changes: clear caches and recalc immediately
            if (this.#cacheManager?.clearAllCaches) {
                this.#cacheManager.clearAllCaches();
            }
            this.#visibilityStateManager.markAllTokensChangedImmediate();
        }
    }

    /**
     * When the Scene Config application opens, start deferring lighting updates
     */
    #onSceneConfigOpen() {
        this.#systemStateProvider.setSceneConfigOpen(true);
        this.#systemStateProvider.debug('SceneEventHandler: SceneConfig opened - deferring lighting updates');
    }

    /**
     * When the Scene Config closes (Save/Close), flush any pending lighting changes once
     */
    #onSceneConfigClose() {
        const hadPending = this.#systemStateProvider.consumePendingLightingChange();
        this.#systemStateProvider.setSceneConfigOpen(false);

        if (!this.#systemStateProvider.shouldProcessEvents()) return;

        if (hadPending) {
            this.#systemStateProvider.debug('SceneEventHandler: SceneConfig closed - applying deferred lighting updates');
            if (this.#cacheManager?.clearAllCaches) {
                this.#cacheManager.clearAllCaches();
            }
            this.#visibilityStateManager.markAllTokensChangedImmediate();
        }
    }
}