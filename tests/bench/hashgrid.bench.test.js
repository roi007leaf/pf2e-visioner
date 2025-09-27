// Jest wrapper to run the hash grid micro-benchmark on-demand.
// Default test runs will skip this to avoid impacting CI time.
import { runHashGridBench } from './hashgrid.bench.js';

test('hashgrid micro-benchmark (manual)', () => {
    // Only run when explicitly requested (e.g., via npm run bench:hashgrid)
    if (!process.env.RUN_BENCH) {
        // Keep a tiny footprint in normal test runs
        console.log('[bench] skipped; set RUN_BENCH=1 to run');
        return;
    }
    runHashGridBench();
});
