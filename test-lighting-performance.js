// Performance test for LightingPrecomputer LOS filtering
// Run this in the browser console to test the improvements

console.log("Testing LightingPrecomputer performance improvements...");

async function testLightingPerformance() {
    try {
        // Get tokens for testing
        const tokens = canvas.tokens.placeables;
        if (tokens.length < 5) {
            console.log("Need at least 5 tokens on the scene for meaningful testing");
            return;
        }

        console.log(`Testing with ${tokens.length} tokens`);

        // Import the LightingPrecomputer
        const { LightingPrecomputer } = await import('./scripts/visibility/auto-visibility/core/LightingPrecomputer.js');

        // Test 1: Original behavior (no LOS filtering)
        console.log("\n--- Test 1: No LOS Filtering (Original) ---");
        const start1 = performance.now();
        const result1 = await LightingPrecomputer.precompute(tokens);
        const end1 = performance.now();

        console.log(`Time: ${(end1 - start1).toFixed(2)}ms`);
        console.log(`Tokens processed: ${result1.map?.size || 0}`);
        console.log("Stats:", result1.stats);

        // Test 2: With LOS filtering (simulate 2 changed tokens)
        console.log("\n--- Test 2: With LOS Filtering ---");
        const changedTokenIds = new Set([tokens[0].document.id, tokens[1]?.document?.id].filter(Boolean));

        // Get spatial analyzer for LOS filtering
        let spatialAnalyzer = null;
        try {
            const { SpatialAnalysisService } = await import('./scripts/visibility/auto-visibility/core/SpatialAnalysisService.js');
            spatialAnalyzer = new SpatialAnalysisService(20, null); // max distance 20
        } catch (e) {
            console.warn("Could not create SpatialAnalysisService:", e);
        }

        const losFilterOptions = spatialAnalyzer ? {
            changedTokenIds,
            spatialAnalyzer
        } : undefined;

        const start2 = performance.now();
        const result2 = await LightingPrecomputer.precompute(tokens, undefined, undefined, losFilterOptions);
        const end2 = performance.now();

        console.log(`Time: ${(end2 - start2).toFixed(2)}ms`);
        console.log(`Tokens processed: ${result2.map?.size || 0}`);
        console.log("Stats:", result2.stats);

        // Performance comparison
        const improvement = ((end1 - start1) - (end2 - start2)) / (end1 - start1) * 100;
        console.log(`\n--- Performance Improvement ---`);
        console.log(`Original: ${(end1 - start1).toFixed(2)}ms`);
        console.log(`With LOS filtering: ${(end2 - start2).toFixed(2)}ms`);
        console.log(`Improvement: ${improvement.toFixed(1)}% faster`);

        if (result2.stats.tokensFiltered) {
            console.log(`Tokens filtered out: ${result2.stats.tokensFiltered}`);
            console.log(`Processing efficiency: ${((tokens.length - result2.stats.tokensFiltered) / tokens.length * 100).toFixed(1)}% of tokens processed`);
        }

    } catch (error) {
        console.error("Error during performance testing:", error);
    }
}

// Run the test
testLightingPerformance();