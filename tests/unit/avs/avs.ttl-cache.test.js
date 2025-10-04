import '../../setup.js';

import { TTLCache } from '../../../scripts/visibility/auto-visibility/utils/TTLCache.js';

describe('TTLCache', () => {
    test('miss, hit, expired lifecycle with manual time', () => {
        const cache = new TTLCache(100);
        const t0 = 1000;
        expect(cache.getWithMeta('k', t0)).toEqual({ state: 'miss', value: undefined });

        cache.set('k', 42, 50, t0); // expire at 1050
        expect(cache.size).toBe(1);
        expect(cache.getWithMeta('k', 1049)).toEqual({ state: 'hit', value: 42 });

        // Expired at or after 1050
        const m = cache.getWithMeta('k', 1050);
        expect(m.state).toBe('expired');
        expect(cache.size).toBe(0); // expired entry deleted
    });

    test('prune and pruneIfDue gating', () => {
        const cache = new TTLCache(10);
        const t0 = 2000;
        cache.set('a', 'A', 5, t0); // expire 2005
        cache.set('b', 'B', 50, t0); // expire 2050

        // Nothing to prune before expiry
        expect(cache.prune(t0 + 1)).toBe(0);
        // After expiry of `a`
        expect(cache.prune(t0 + 6)).toBe(1);
        expect(cache.size).toBe(1);

        // pruneIfDue min interval respected
        const pruned0 = cache.pruneIfDue(100, t0 + 7); // lastPruneAt set to t0+6, so 1ms later not due
        expect(pruned0).toBe(0);
        const pruned1 = cache.pruneIfDue(1, t0 + 8); // now due
        expect(pruned1).toBe(0); // nothing expired now
    });
});
