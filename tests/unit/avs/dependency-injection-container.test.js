import '../../setup.js';

describe('DependencyInjectionContainer movement sight-line resolver', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('../../../scripts/services/PendingMovement/pending-movement-sight-line.js');
  });

  test('uses completed destination LOS over stale current movement LOS', async () => {
    await jest.isolateModulesAsync(async () => {
      const currentPendingMovementSightLineSeesTarget = jest.fn(() => true);
      const hasPendingMovementEntryForPair = jest.fn(() => true);
      const hasRecentCompletedMovementRefreshTargetForObserver = jest.fn(() => true);
      const recentCompletedMovementFinalSightLineSeesTarget = jest.fn(() => false);
      jest.doMock('../../../scripts/services/PendingMovement/pending-movement-sight-line.js', () => ({
        currentPendingMovementSightLineSeesTarget,
        hasPendingMovementEntryForPair,
        hasRecentCompletedMovementRefreshTargetForObserver,
        recentCompletedMovementFinalSightLineSeesTarget,
      }));

      const { DependencyInjectionContainer } = await import(
        '../../../scripts/visibility/auto-visibility/core/DependencyInjectionContainer.js'
      );
      const observer = { id: 'observer' };
      const target = { id: 'target' };
      const resolver = await new DependencyInjectionContainer().get('movementSightLineResolver');

      expect(resolver(observer, target)).toBe(false);
      expect(recentCompletedMovementFinalSightLineSeesTarget).toHaveBeenCalledWith(
        observer,
        target,
      );
      expect(currentPendingMovementSightLineSeesTarget).not.toHaveBeenCalled();
    });
  });

  test('falls back to current movement LOS while movement has not completed', async () => {
    await jest.isolateModulesAsync(async () => {
      const currentPendingMovementSightLineSeesTarget = jest.fn(() => true);
      const hasPendingMovementEntryForPair = jest.fn(() => true);
      const hasRecentCompletedMovementRefreshTargetForObserver = jest.fn(() => false);
      const recentCompletedMovementFinalSightLineSeesTarget = jest.fn(() => null);
      jest.doMock('../../../scripts/services/PendingMovement/pending-movement-sight-line.js', () => ({
        currentPendingMovementSightLineSeesTarget,
        hasPendingMovementEntryForPair,
        hasRecentCompletedMovementRefreshTargetForObserver,
        recentCompletedMovementFinalSightLineSeesTarget,
      }));

      const { DependencyInjectionContainer } = await import(
        '../../../scripts/visibility/auto-visibility/core/DependencyInjectionContainer.js'
      );
      const observer = { id: 'observer' };
      const target = { id: 'target' };
      const resolver = await new DependencyInjectionContainer().get('movementSightLineResolver');

      expect(resolver(observer, target)).toBe(true);
      expect(currentPendingMovementSightLineSeesTarget).toHaveBeenCalledWith(observer, target);
    });
  });

  test('does not override normal LOS when no movement context owns the pair', async () => {
    await jest.isolateModulesAsync(async () => {
      const currentPendingMovementSightLineSeesTarget = jest.fn(() => false);
      const hasPendingMovementEntryForPair = jest.fn(() => false);
      const hasRecentCompletedMovementRefreshTargetForObserver = jest.fn(() => false);
      const recentCompletedMovementFinalSightLineSeesTarget = jest.fn(() => null);
      jest.doMock('../../../scripts/services/PendingMovement/pending-movement-sight-line.js', () => ({
        currentPendingMovementSightLineSeesTarget,
        hasPendingMovementEntryForPair,
        hasRecentCompletedMovementRefreshTargetForObserver,
        recentCompletedMovementFinalSightLineSeesTarget,
      }));

      const { DependencyInjectionContainer } = await import(
        '../../../scripts/visibility/auto-visibility/core/DependencyInjectionContainer.js'
      );
      const resolver = await new DependencyInjectionContainer().get('movementSightLineResolver');

      expect(resolver({ id: 'observer' }, { id: 'target' })).toBeNull();
      expect(currentPendingMovementSightLineSeesTarget).not.toHaveBeenCalled();
    });
  });
});
