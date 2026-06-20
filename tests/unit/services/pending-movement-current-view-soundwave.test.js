import '../../setup.js';

import { withPendingMovementEvaluationCache } from '../../../scripts/services/PendingMovement/pending-movement-evaluation-cache.js';
import { createPendingMovementCurrentViewSoundwaveController } from '../../../scripts/services/PendingMovement/pending-movement-current-view-soundwave.js';

describe('pending movement current-view soundwave controller', () => {
  test('reuses current-view observer collection inside one evaluation cache scope', () => {
    const draggedToken = { id: 'dragged' };
    const controlledToken = { id: 'controlled' };
    const getDraggedToken = jest.fn(() => draggedToken);
    const getControlledTokens = jest.fn(() => [draggedToken, controlledToken]);
    const controller = createPendingMovementCurrentViewSoundwaveController({
      getDraggedToken,
      getControlledTokens,
      tokenIdOf: (token) => token?.id ?? null,
    });

    withPendingMovementEvaluationCache(() => {
      expect(controller.getCurrentViewObservers()).toEqual([draggedToken, controlledToken]);
      expect(controller.getCurrentViewObservers()).toEqual([draggedToken, controlledToken]);
    });

    expect(getDraggedToken).toHaveBeenCalledTimes(1);
    expect(getControlledTokens).toHaveBeenCalledTimes(1);

    controller.getCurrentViewObservers();

    expect(getDraggedToken).toHaveBeenCalledTimes(2);
    expect(getControlledTokens).toHaveBeenCalledTimes(2);
  });
});
