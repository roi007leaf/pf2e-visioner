import '../../setup.js';

import { GlobalLosCache } from '../../../scripts/visibility/auto-visibility/utils/GlobalLosCache.js';
import { GlobalVisibilityCache } from '../../../scripts/visibility/auto-visibility/utils/GlobalVisibilityCache.js';
import { OverrideValidityCache } from '../../../scripts/visibility/auto-visibility/utils/OverrideValidityCache.js';

describe('OverrideValidityCache', () => {
    test('makeKey, set/get, size, pruneIfDue passthroughs', () => {
        const cache = new OverrideValidityCache(100);
        const key = cache.makeKey('obs', 'tgt');
        expect(cache.get(key)).toBeUndefined();

        const payload = { state: 'observed' };
        cache.set(key, payload, { x: 1, y: 2, elevation: 0 }, { x: 3, y: 4, elevation: 0 });
        const val = cache.get(key);
        expect(val).toEqual({ result: payload, obsPos: { x: 1, y: 2, elevation: 0 }, tgtPos: { x: 3, y: 4, elevation: 0 } });
        expect(cache.size).toBe(1);

        // pruneIfDue respects min interval and returns a number
        const p0 = cache.pruneIfDue(1000);
        expect(typeof p0).toBe('number');
    });
});

describe('Global caches', () => {
    test('GlobalVisibilityCache getWithMeta and clear', () => {
        const gvc = new GlobalVisibilityCache(100);
        const miss = gvc.getWithMeta('k');
        expect(miss.state).toBe('miss');
        gvc.set('k', 'hidden');
        const hit = gvc.getWithMeta('k');
        expect(hit.state).toBe('hit');
        expect(hit.value).toBe('hidden');
        expect(gvc.size).toBe(1);
        gvc.clear();
        expect(gvc.size).toBe(0);
    });

    test('GlobalLosCache boolean coercion and pruneIfDue', () => {
        const glc = new GlobalLosCache(100);
        expect(glc.getWithMeta('pair').state).toBe('miss');
        glc.set('pair', 123); // coerced to boolean true
        expect(glc.get('pair')).toBe(true);
        const pruned = glc.pruneIfDue(0); // immediate prune call allowed
        expect(typeof pruned).toBe('number');
    });
});
