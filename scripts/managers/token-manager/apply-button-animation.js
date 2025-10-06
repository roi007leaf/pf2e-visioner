/**
 * Apply Button Animation Manager
 * Handles highlighting apply buttons when changes are made but not yet applied
 */

import { getCoverMap, getVisibilityMap } from '../../utils.js';

/**
 * Check if the form has any pending changes compared to original state
 * @param {VisionerTokenManager} app - Token manager instance
 * @returns {boolean} Whether there are pending changes
 */
function hasFormChanges(app) {
    if (!app?.element) return false;

    try {
        // Get all form inputs
        const visibilityInputs = app.element.querySelectorAll('input[name^="visibility."]');
        const coverInputs = app.element.querySelectorAll('input[name^="cover."]');
        const wallInputs = app.element.querySelectorAll('input[name^="walls."]');

        // Check visibility changes
        for (const input of visibilityInputs) {
            const tokenId = input.name.replace('visibility.', '');
            const currentValue = input.value;

            // Get original value from visibility data
            let originalValue;
            if (app.mode === 'observer') {
                originalValue = app.visibilityData?.[tokenId] || 'observed';
            } else {
                // Target mode - check visibility map of other tokens to this observer
                const observerTokens = canvas.tokens?.placeables || [];
                for (const token of observerTokens) {
                    if (token.id === tokenId) {
                        const tokenVisMap = getVisibilityMap(token) || {};
                        originalValue = tokenVisMap[app.observer.id] || 'observed';
                        break;
                    }
                }
                if (originalValue === undefined) originalValue = 'observed';
            }

            if (currentValue !== originalValue) {
                return true;
            }
        }

        // Check cover changes
        for (const input of coverInputs) {
            const tokenId = input.name.replace('cover.', '');
            const currentValue = input.value;

            // Get original value from cover data
            let originalValue;
            if (app.mode === 'observer') {
                originalValue = app.coverData?.[tokenId] || 'none';
            } else {
                // Target mode - check cover map of other tokens to this observer
                const observerTokens = canvas.tokens?.placeables || [];
                for (const token of observerTokens) {
                    if (token.id === tokenId) {
                        const tokenCoverMap = getCoverMap(token) || {};
                        originalValue = tokenCoverMap[app.observer.id] || 'none';
                        break;
                    }
                }
                if (originalValue === undefined) originalValue = 'none';
            }

            if (currentValue !== originalValue) {
                return true;
            }
        }

        // Check wall changes
        for (const input of wallInputs) {
            const wallId = input.name.replace('walls.', '');
            const currentValue = input.value;

            // Get original value from wall data
            const wallFlags = app.observer.document.getFlag('pf2e-visioner', 'walls') || {};
            const originalValue = wallFlags[wallId] || 'observed';

            if (currentValue !== originalValue) {
                return true;
            }
        }

    } catch (error) {
        console.warn('Token Manager: Error checking form changes:', error);
    }

    return false;
}

/**
 * Update apply button animation state based on form changes
 * @param {VisionerTokenManager} app - Token manager instance
 */
export function updateApplyButtonAnimation(app) {
    if (!app?.element) return;

    try {
        const applyButtons = app.element.querySelectorAll('.vm-action-button.apply');
        const hasChanges = hasFormChanges(app);

        for (const button of applyButtons) {
            if (hasChanges) {
                button.classList.add('has-changes');
            } else {
                button.classList.remove('has-changes');
            }
        }
    } catch (error) {
        console.warn('Token Manager: Error updating apply button animation:', error);
    }
}

/**
 * Attach change listeners to form inputs to trigger apply button animation
 * @param {VisionerTokenManager} app - Token manager instance
 */
export function attachApplyButtonAnimation(app) {
    if (!app?.element) return;

    try {
        // Find all interactive elements that update form state
        const stateButtons = app.element.querySelectorAll('button[data-state][data-target], button[data-action^="bulk"]');

        for (const button of stateButtons) {
            // Add click event listener
            button.addEventListener('click', () => {
                // Small delay to ensure hidden inputs are updated
                setTimeout(() => updateApplyButtonAnimation(app), 50);
            });
        }

        // Also listen for other buttons that might change state
        const actionButtons = app.element.querySelectorAll('button[data-action]');
        for (const button of actionButtons) {
            button.addEventListener('click', () => {
                setTimeout(() => updateApplyButtonAnimation(app), 50);
            });
        }

        // Initial check
        updateApplyButtonAnimation(app);

    } catch (error) {
        console.warn('Token Manager: Error attaching apply button animation:', error);
    }
}

/**
 * Remove apply button animation (when form is submitted/reset)
 * @param {VisionerTokenManager} app - Token manager instance
 */
export function clearApplyButtonAnimation(app) {
    if (!app?.element) return;

    try {
        const applyButtons = app.element.querySelectorAll('.vm-action-button.apply');
        for (const button of applyButtons) {
            button.classList.remove('has-changes');
        }
    } catch (error) {
        console.warn('Token Manager: Error clearing apply button animation:', error);
    }
}