/**
 * Movement Cost Hooks
 * Handles modification of movement costs for specific conditions like Blinded or Darkness.
 */

import { registerOnce } from '../utils/register-once.js';

const MOVEMENT_COST_WRAPPED = Symbol.for('pf2e-visioner.movement-cost-wrapped');
const MOVEMENT_RULER_LABEL_WRAPPED = Symbol.for('pf2e-visioner.movement-ruler-label-wrapped');
export const MOVEMENT_COST_REGISTRATION_KEY = 'hooks:movement-cost';

function collectionHasCondition(collection, slug) {
    try {
        if (!collection) return false;
        if (typeof collection.has === 'function' && collection.has(slug)) return true;
        if (typeof collection.some === 'function') {
            return collection.some((condition) => condition?.slug === slug || condition?.key === slug);
        }
    } catch {
        return false;
    }
    return false;
}

function actorHasCondition(actor, slug) {
    return !!(
        actor?.hasCondition?.(slug) ||
        actor?.system?.conditions?.[slug]?.active ||
        collectionHasCondition(actor?.conditions, slug) ||
        actor?.itemTypes?.condition?.some?.(
            (condition) => condition?.slug === slug && !condition?.isExpired,
        )
    );
}

function finiteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function formatRulerNumber(value) {
    const rounded = Math.round(value * 100) / 100;
    return rounded;
}

function positiveAdditionalCost(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0;
}

function applyMeasuredCostToRulerLabel(context, waypoint) {
    if (!context || !waypoint?.measurement) return context;

    const measuredDistance = finiteNumber(waypoint.measurement.distance);
    const measuredCost = finiteNumber(waypoint.measurement.cost);
    if (measuredDistance === null || measuredCost === null) return context;

    const additionalTotal = measuredCost - measuredDistance;
    if (additionalTotal <= 0) return context;

    context.cost ??= {};
    context.cost.additional ??= {};
    if (!positiveAdditionalCost(context.cost.additional.total)) {
        context.cost.additional.total = formatRulerNumber(additionalTotal);
    }

    const deltaDistance = finiteNumber(waypoint.measurement.backward?.distance);
    const deltaCost = finiteNumber(waypoint.cost);
    if (deltaDistance !== null && deltaCost !== null) {
        const additionalDelta = deltaCost - deltaDistance;
        if (additionalDelta > 0 && !positiveAdditionalCost(context.cost.additional.delta)) {
            context.cost.additional.delta = formatRulerNumber(additionalDelta);
        }
    }

    return context;
}

/**
 * Register movement cost wrappers
 */
export function registerMovementCostHooks() {
    return registerOnce(MOVEMENT_COST_REGISTRATION_KEY, () => {
        if (game.ready) {
            return _registerMovementCostHooks();
        }
        Hooks.once('ready', _registerMovementCostHooks);
    });
}

function _registerMovementCostHooks() {
    // We need to wrap the static method on the class configured in CONFIG
    const TerrainDataClass = CONFIG.Token?.movement?.TerrainData;

    if (!TerrainDataClass) {
        console.warn('PF2E Visioner | CONFIG.Token.movement.TerrainData not found. Movement cost features disabled.');
        return false;
    }

    if (TerrainDataClass[MOVEMENT_COST_WRAPPED]) {
        return true;
    }


    // Store original method
    const originalGetMovementCostFunction = TerrainDataClass.getMovementCostFunction;
    TerrainDataClass[MOVEMENT_COST_WRAPPED] = true;

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
        const isBlinded = actorHasCondition(actor, 'blinded');

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

    _registerMovementRulerLabelHooks();

    return true;
}

function _registerMovementRulerLabelHooks() {
    const prototype = CONFIG.Token?.rulerClass?.prototype;
    if (!prototype || prototype[MOVEMENT_RULER_LABEL_WRAPPED]) return false;
    if (typeof prototype._getWaypointLabelContext !== 'function') return false;

    const originalGetWaypointLabelContext = prototype._getWaypointLabelContext;
    prototype[MOVEMENT_RULER_LABEL_WRAPPED] = true;
    prototype._getWaypointLabelContext = function (waypoint, state, ...args) {
        const context = originalGetWaypointLabelContext.call(this, waypoint, state, ...args);
        return applyMeasuredCostToRulerLabel(context, waypoint);
    };

    return true;
}
