import { actorVisibilityUpdated, itemVisibilityUpdated, itemVisionEquipmentUpdated } from '../../../scripts/visibility/auto-visibility/core/InvalidationIntents.js';
import { SensePrecomputer } from '../../../scripts/services/SensePrecomputer.js';
import { CacheManagementService } from '../../../scripts/visibility/auto-visibility/core/CacheManagementService.js';
import { AvsInvalidationCoordinator } from '../../../scripts/visibility/auto-visibility/core/AvsInvalidationCoordinator.js';

describe('sense changes before the precompute cache expires', () => {
  afterEach(() => { SensePrecomputer.clear(); jest.restoreAllMocks(); });
  test.each(['item-visibility-updated', 'item-vision-equipment-updated', 'actor-visibility-updated'])(
    '%s recalculates with fresh senses synchronously', reason => {
      jest.spyOn(Date, 'now').mockReturnValue(10000);
      const token = { id: 'observer', document: { id: 'observer' } };
      let blinded = true, cached;
      const analyzer = { getVisionCapabilities: () => cached ??= { isBlinded: blinded }, clearCache: () => { cached = undefined; }, invalidateVisionCache: () => { cached = undefined; } };
      const cacheManager = new CacheManagementService();
      cacheManager.initialize({ globalLosCache: new Map(), globalVisibilityCache: new Map() });
      const sample = () => SensePrecomputer.precompute([token], analyzer).get(token.id).isBlinded;
      expect(sample()).toBe(true);
      blinded = false;
      let duringBatch;
      const recalculate = () => { duringBatch = sample(); };
      const coordinator = new AvsInvalidationCoordinator({
        systemStateProvider: { shouldProcessEvents: () => true }, cacheManager, visionAnalyzer: analyzer,
        visibilityStateManager: { markTokenChangedImmediate: recalculate, markAllTokensChangedImmediate: recalculate },
      });
      const intent = reason === 'actor-visibility-updated'
        ? actorVisibilityUpdated({}, { system: { perception: { senses: [] } } }, { phase: 'update', tokens: [token] })
        : (reason === 'item-visibility-updated' ? itemVisibilityUpdated : itemVisionEquipmentUpdated)({}, { actor: { id: 'actor' }, tokens: [token] });
      coordinator.invalidate(intent);
      expect(duringBatch).toBe(false);
    });
});
