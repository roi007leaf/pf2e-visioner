/**
 * Movement Cost Hooks
 * Handles modification of movement costs for specific conditions like Blinded or Darkness.
 */

/**
 * Register movement cost wrappers
 */
export function registerMovementCostHooks() {
    if (game.ready) {
        _registerMovementCostHooks();
    } else {
        Hooks.once('ready', _registerMovementCostHooks);
    }
}

function _registerMovementCostHooks() {
    console.log('PF2E Visioner | Registering movement cost hooks');
    // We need to wrap the static method on the class configured in CONFIG
    const TerrainDataClass = CONFIG.Token.movement.TerrainData;

    if (!TerrainDataClass) {
        console.warn('PF2E Visioner | CONFIG.Token.movement.TerrainData not found. Movement cost features disabled.');
        return;
    }

    // Store original method
    const originalGetMovementCostFunction = TerrainDataClass.getMovementCostFunction;

    // Override the method
    TerrainDataClass.getMovementCostFunction = function (token, options) {
        // Get the original cost function
        const originalCostFunction = originalGetMovementCostFunction.call(this, token, options);

        // If no cost function returned (e.g. gridless or error), return undefined/void as per original
        if (!originalCostFunction) return originalCostFunction;

        // Check if we need to apply difficult terrain
        const actor = token.actor;
        if (!actor) return originalCostFunction;

        // 1. Blinded condition
        const isBlinded = actor.hasCondition?.('blinded');

        // If not blinded, return original
        if (!isBlinded) {
            return originalCostFunction;
        }        // Return a wrapped cost function
        return (from, to, distance, segment) => {
            // Clone segment to avoid mutating original if it's shared
            // We only need to modify terrain difficulty
            const modifiedSegment = { ...segment };

            // Ensure terrain object exists
            if (!modifiedSegment.terrain) {
                modifiedSegment.terrain = { difficulty: 1 };
            } else {
                modifiedSegment.terrain = { ...modifiedSegment.terrain };
            }

            // Upgrade difficulty to at least 2 (Difficult)
            // If it's already 3 (Greater Difficult), keep it
            if ((modifiedSegment.terrain.difficulty || 1) < 2) {
                modifiedSegment.terrain.difficulty = 2;
            }

            return originalCostFunction(from, to, distance, modifiedSegment);
        };
    };
}
