/**
 * WallEventHandler - Handles wall-related events that affect line of sight
 * Manages wall create, update, and delete events that impact token visibility
 * 
 * Follows SOLID principles by depending on abstractions rather than concrete implementations.
 */
export class WallEventHandler {
    constructor(systemStateProvider, visibilityStateManager, cacheManager = null) {
        this.systemState = systemStateProvider;
        this.visibilityState = visibilityStateManager;
        this.cacheManager = cacheManager;
        this.visualUpdateTimeout = null;
    }

    /**
     * Initialize wall event handlers
     */
    initialize() {
        Hooks.on('updateWall', this.handleWallUpdate.bind(this));
        Hooks.on('createWall', this.handleWallCreate.bind(this));
        Hooks.on('deleteWall', this.handleWallDelete.bind(this));
    }

    /**
     * Check if a wall change affects line of sight calculations
     * @param {Object} changeData - The change data from the update
     * @returns {boolean} Whether this change affects line of sight
     */
    #affectsLineOfSight(changeData) {
        if (!changeData) return true; // Safe default - assume it affects LOS

        // Check for geometry changes that affect line of sight
        const geometryFields = [
            'c',                             // Wall coordinates [x1, y1, x2, y2]
            'ds',                            // Door state (open/closed/locked)
            'door',                          // Door type (affects LOS when open)
            'sense',                         // Wall sense restrictions
            'dir',                           // Wall direction restrictions
            'sight',                         // Sight restriction
            'sound',                         // Sound restriction (affects some LOS calculations)
            'move'                           // Movement restriction (can affect visibility in some cases)
        ];

        return geometryFields.some(field => foundry.utils.hasProperty(changeData, field));
    }

    /**
     * Check if a wall change affects hidden wall visuals
     * @param {Object} changeData - The change data from the update
     * @returns {boolean} Whether this change affects hidden wall graphics
     */
    #affectsHiddenWallVisuals(changeData) {
        if (!changeData) return false;

        // Check for changes that affect hidden wall display
        const visualFields = [
            'c',                             // Wall coordinates (affects graphics position)
            'flags.pf2e-visioner.hiddenWall', // Hidden wall flag
            'flags.pf2e-visioner.stealthDC', // Stealth DC setting
            'door',                          // Door type (affects visual appearance)
            'ds'                             // Door state (affects visibility)
        ];

        return visualFields.some(field => foundry.utils.hasProperty(changeData, field));
    }

    /**
     * Trigger wall visual updates with debouncing to prevent rapid successive calls
     */
    #scheduleWallVisualUpdate() {
        // Clear any pending update
        if (this.visualUpdateTimeout) {
            clearTimeout(this.visualUpdateTimeout);
        }

        // Schedule new update with debouncing
        this.visualUpdateTimeout = setTimeout(async () => {
            try {
                // Import and call updateWallVisuals from visual-effects service
                const { updateWallVisuals } = await import('../../../services/visual-effects.js');
                await updateWallVisuals();
            } catch (error) {
                console.warn('[PF2E-Visioner] Failed to update wall visuals:', error);
            } finally {
                this.visualUpdateTimeout = null;
            }
        }, 100); // 100ms debounce to allow multiple rapid changes to settle
    }

    /**
     * Handle wall update - affects line of sight for all tokens
     */
    handleWallUpdate(document, changeData, options, userId) {
        if (!this.systemState.shouldProcessEvents()) return;

        const affectsLOS = this.#affectsLineOfSight(changeData);
        const affectsVisuals = this.#affectsHiddenWallVisuals(changeData);

        // Only clear caches if the change actually affects line of sight
        if (affectsLOS) {
            if (this.cacheManager?.clearAllCaches) {
                this.cacheManager.clearAllCaches();
            }
            this.visibilityState.markAllTokensChangedThrottled();
        }

        // Update wall visuals if visual properties changed
        if (affectsVisuals) {
            this.#scheduleWallVisualUpdate();
        }
    }

    /**
     * Handle wall creation - affects line of sight for all tokens
     */
    handleWallCreate(document, options, userId) {
        if (!this.systemState.shouldProcessEvents()) return;

        // New walls always affect LOS, so clear caches
        if (this.cacheManager?.clearAllCaches) {
            this.cacheManager.clearAllCaches();
        }
        this.visibilityState.markAllTokensChangedThrottled();

        // New walls might be hidden walls, so update visuals
        this.#scheduleWallVisualUpdate();
    }

    /**
     * Handle wall deletion - affects line of sight for all tokens
     */
    handleWallDelete(document, options, userId) {
        if (!this.systemState.shouldProcessEvents()) return;

        // Deleted walls always affect LOS, so clear caches
        if (this.cacheManager?.clearAllCaches) {
            this.cacheManager.clearAllCaches();
        }
        this.visibilityState.markAllTokensChangedThrottled();

        // Clean up any hidden wall graphics for the deleted wall
        this.#cleanupDeletedWallVisuals(document);
    }

    /**
     * Clean up visuals for a deleted wall
     * @param {Object} document - The deleted wall document
     */
    async #cleanupDeletedWallVisuals(document) {
        try {
            // Import and call cleanup function from visual-effects service
            const { cleanupDeletedWallVisuals } = await import('../../../services/visual-effects.js');
            await cleanupDeletedWallVisuals(document);
        } catch (error) {
            console.warn('[PF2E-Visioner] Failed to cleanup deleted wall visuals:', error);
        }
    }
}