/**
 * PerformanceMetricsCollector manages performance tracking and metrics collection.
 * Separates performance concerns from the main EventDrivenVisibilitySystem.
 */
export class PerformanceMetricsCollector {
    #metrics;

    constructor() {
        this.#metrics = {
            totalCalculations: 0,
            skippedByDistance: 0,
            skippedByLOS: 0,
            spatialOptimizations: 0,
            lastReset: Date.now(),
            movementOptimizations: {
                totalMovements: 0,
                midpointSkipped: 0,
                totalTime: 0,
                averageTime: 0,
                totalTokensChecked: 0,
                totalDistanceChecks: 0,
                totalLOSChecks: 0,
                totalWallChecks: 0,
                totalRaysCreated: 0,
                averageOptimizationSavings: 0,
            },
        };
    }

    /**
     * Update movement optimization metrics.
     * @param {Object} movementMetrics - Movement metrics to add
     */
    updateMovementMetrics(movementMetrics) {
        const mo = this.#metrics.movementOptimizations;

        mo.totalMovements += movementMetrics.totalMovements || 0;
        mo.midpointSkipped += movementMetrics.midpointSkipped || 0;
        mo.totalTime += movementMetrics.totalTime || 0;
        mo.totalTokensChecked += movementMetrics.totalTokensChecked || 0;
        mo.totalDistanceChecks += movementMetrics.totalDistanceChecks || 0;
        mo.totalLOSChecks += movementMetrics.totalLOSChecks || 0;
        mo.totalWallChecks += movementMetrics.totalWallChecks || 0;
        mo.totalRaysCreated += movementMetrics.totalRaysCreated || 0;

        // Recalculate averages
        if (mo.totalMovements > 0) {
            mo.averageTime = mo.totalTime / mo.totalMovements;
            mo.averageOptimizationSavings = mo.midpointSkipped / mo.totalMovements;
        }
    }

    /**
     * Increment spatial optimizations counter.
     */
    incrementSpatialOptimizations() {
        this.#metrics.spatialOptimizations++;
    }

    /**
     * Increment calculations counter.
     */
    incrementTotalCalculations() {
        this.#metrics.totalCalculations++;
    }

    /**
     * Increment distance skips counter.
     */
    incrementSkippedByDistance() {
        this.#metrics.skippedByDistance++;
    }

    /**
     * Increment LOS skips counter.
     */
    incrementSkippedByLOS() {
        this.#metrics.skippedByLOS++;
    }

    /**
     * Get current metrics snapshot.
     * @returns {Object} Current metrics
     */
    getMetrics() {
        return { ...this.#metrics };
    }

    /**
     * Reset all metrics.
     */
    reset() {
        this.#metrics.totalCalculations = 0;
        this.#metrics.skippedByDistance = 0;
        this.#metrics.skippedByLOS = 0;
        this.#metrics.spatialOptimizations = 0;
        this.#metrics.lastReset = Date.now();

        const mo = this.#metrics.movementOptimizations;
        mo.totalMovements = 0;
        mo.midpointSkipped = 0;
        mo.totalTime = 0;
        mo.averageTime = 0;
        mo.totalTokensChecked = 0;
        mo.totalDistanceChecks = 0;
        mo.totalLOSChecks = 0;
        mo.totalWallChecks = 0;
        mo.totalRaysCreated = 0;
        mo.averageOptimizationSavings = 0;
    }

    /**
     * Get a formatted summary of the metrics.
     * @returns {string} Formatted metrics summary
     */
    getSummary() {
        const m = this.#metrics;
        const mo = m.movementOptimizations;

        return `Performance Metrics:
  Total Calculations: ${m.totalCalculations}
  Spatial Optimizations: ${m.spatialOptimizations}
  Skipped by Distance: ${m.skippedByDistance}
  Skipped by LOS: ${m.skippedByLOS}
  Movement Optimizations:
    Total Movements: ${mo.totalMovements}
    Midpoint Skipped: ${mo.midpointSkipped}
    Average Time: ${mo.averageTime.toFixed(2)}ms
    Average Savings: ${(mo.averageOptimizationSavings * 100).toFixed(1)}%`;
    }
}