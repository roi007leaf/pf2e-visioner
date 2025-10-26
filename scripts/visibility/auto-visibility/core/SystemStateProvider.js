
import { MODULE_ID } from "../../../constants.js";
import { getLogger } from "../../../utils/logger.js";
/**
 * SystemStateProvider - Provides access to system state information
 * 
 * This class encapsulates system state queries that event handlers need,
 * following the Dependency Inversion Principle by providing an abstract
 * interface rather than requiring direct dependencies on the main system.
 * 
 * Handles:
 * - System enabled/disabled state
 * - Effect update flags (to prevent feedback loops)
 * - User permissions (GM checks)
 * - Debug mode state
 */
export class SystemStateProvider {

    /** @type {boolean} - Cached enabled state */
    #enabled = false;

    /** @type {boolean} - Cached updating effects state */
    #isUpdatingEffects = false;

    /** @type {boolean} - Whether Scene Config UI is currently open */
    #isSceneConfigOpen = false;

    /** @type {boolean} - Whether we have deferred lighting changes while Scene Config was open */
    #hasPendingLightingChange = false;


    // Helper methods for TokenEventHandler
    isEnabled() {
        return this.#enabled;
    }

    /**
     * Check if effects are currently being updated to prevent recursion
     * @returns {boolean} True if effects are being updated
     */
    isUpdatingEffects() {
        return this.#isUpdatingEffects;
    }

    /**
     * Set whether the system is currently updating effects to prevent recursion
     * @param {boolean} isUpdating - Whether effects are being updated
     */
    _setUpdatingEffects(isUpdating) {
        this.#isUpdatingEffects = isUpdating;
    }

    /**
     * Set the system enabled state
     * @param {boolean} enabled - Whether the system should be enabled
     */
    setEnabled(enabled) {
        this.#enabled = enabled;
    }

    setDisabled(disabled) {
        this.#enabled = !disabled;
    }

    /**
     * Scene Config open/close tracking for deferring lighting updates during live preview.
     */
    setSceneConfigOpen(isOpen) {
        this.#isSceneConfigOpen = !!isOpen;
        if (!isOpen) {
            // Do not auto-flush here; SceneEventHandler decides when to flush
        }
    }

    isSceneConfigOpen() {
        return this.#isSceneConfigOpen;
    }

    markPendingLightingChange() {
        this.#hasPendingLightingChange = true;
    }

    consumePendingLightingChange() {
        const had = this.#hasPendingLightingChange;
        this.#hasPendingLightingChange = false;
        return had;
    }

    /**
     * Check if the current user is a GM
     * @returns {boolean} True if the current user is a GM
     */
    isGM() {
        return game.user?.isGM ?? false;
    }

    /**
     * Check if the system should process events (enabled + GM + combat check if applicable)
     * @returns {boolean} True if events should be processed
     */
    shouldProcessEvents() {
        if (!this.isEnabled() || !this.isGM()) {
            return false;
        }

        const avsOnlyInCombat = this.getSetting('avsOnlyInCombat', false);
        if (!avsOnlyInCombat) {
            return true;
        }

        try {
            return !!(game.combat?.started && game.combat?.combatants?.size > 0);
        } catch {
            return false;
        }
    }


    /**
     * Set the effects updating flag
     * @param {boolean} isUpdating - Whether effects are currently being updated
     */
    setUpdatingEffects(isUpdating) {
        this._setUpdatingEffects(isUpdating);
    }

    /**
     * Check if debug mode is enabled
     * @returns {boolean} True if debug mode is enabled
     */
    isDebugMode() {
        try {
            return !!game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
        } catch {
            return false;
        }
    }

    debug(...args) {
        try {
            if (!this.isDebugMode()) return;
            const log = getLogger('AVS');
            log.debug(...args);
        } catch { }
    }

    /**
     * Check if a specific setting is enabled
     * @param {string} settingName - Name of the setting to check
     * @param {boolean} defaultValue - Default value if setting cannot be read
     * @returns {boolean} Setting value or default
     */
    getSetting(settingName, defaultValue = false) {
        try {
            return game.settings.get(MODULE_ID, settingName);
        } catch {
            return defaultValue;
        }
    }

    /**
     * Get system status information
     * @returns {Object} Status object with various system flags
     */
    getStatus() {
        return {
            enabled: this.isEnabled(),
            isGM: this.isGM(),
            isUpdatingEffects: this.isUpdatingEffects(),
            debugMode: this.isDebugMode(),
            shouldProcessEvents: this.shouldProcessEvents(),
        };
    }

    /**
     * Reset all state flags (useful for testing or system reset)
     */
    reset() {
        // This method is deprecated since we use callbacks now
        // State is managed by the main system
        console.warn('SystemStateProvider.reset() is deprecated - use main system reset methods');
    }
}