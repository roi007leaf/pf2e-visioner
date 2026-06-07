import {
  DURING_MOVE_RENDER_MODES,
  resolveDuringMoveDecision,
} from '../../../scripts/services/Detection/during-move-engine.js';

describe('during move engine', () => {
  test('uses committed AVS state when no movement is active', () => {
    expect(
      resolveDuringMoveDecision({
        storedState: 'hidden',
        finalState: 'observed',
        movementActive: false,
        currentLosSeesTarget: true,
      }),
    ).toMatchObject({
      visibilityState: 'hidden',
      renderMode: DURING_MOVE_RENDER_MODES.SOUNDWAVE,
      usesObserverLos: false,
    });
  });

  test('ignores drag preview final state before movement is committed', () => {
    expect(
      resolveDuringMoveDecision({
        storedState: 'observed',
        finalState: 'hidden',
        movementActive: true,
        movementCommitted: false,
        currentLosSeesTarget: false,
      }),
    ).toMatchObject({
      visibilityState: 'observed',
      renderMode: DURING_MOVE_RENDER_MODES.CORE,
    });
  });

  test('uses live LOS timing for final observed reveal', () => {
    const blocked = resolveDuringMoveDecision({
      storedState: 'undetected',
      initialState: 'undetected',
      finalState: 'observed',
      movementActive: true,
      movementCommitted: true,
      currentLosSeesTarget: false,
    });
    const reached = resolveDuringMoveDecision({
      storedState: 'undetected',
      initialState: 'undetected',
      finalState: 'observed',
      movementActive: true,
      movementCommitted: true,
      currentLosSeesTarget: true,
    });

    expect(blocked).toMatchObject({
      visibilityState: 'undetected',
      renderMode: DURING_MOVE_RENDER_MODES.HARD_HIDE,
    });
    expect(reached).toMatchObject({
      visibilityState: 'observed',
      renderMode: DURING_MOVE_RENDER_MODES.CORE,
      usesObserverLos: true,
    });
  });

  test('uses live LOS timing for final hidden soundwave', () => {
    const stillSeen = resolveDuringMoveDecision({
      storedState: 'observed',
      initialState: 'observed',
      finalState: 'hidden',
      movementActive: true,
      movementCommitted: true,
      currentLosSeesTarget: true,
    });
    const lostSight = resolveDuringMoveDecision({
      storedState: 'observed',
      initialState: 'observed',
      finalState: 'hidden',
      movementActive: true,
      movementCommitted: true,
      currentLosSeesTarget: false,
    });

    expect(stillSeen).toMatchObject({
      visibilityState: 'observed',
      renderMode: DURING_MOVE_RENDER_MODES.CORE,
    });
    expect(lostSight).toMatchObject({
      visibilityState: 'hidden',
      renderMode: DURING_MOVE_RENDER_MODES.SOUNDWAVE,
    });
  });

  test('uses live LOS timing for final undetected hard-hide', () => {
    const stillSeen = resolveDuringMoveDecision({
      storedState: 'observed',
      initialState: 'observed',
      finalState: 'undetected',
      movementActive: true,
      movementCommitted: true,
      currentLosSeesTarget: true,
    });
    const lostSight = resolveDuringMoveDecision({
      storedState: 'observed',
      initialState: 'observed',
      finalState: 'undetected',
      movementActive: true,
      movementCommitted: true,
      currentLosSeesTarget: false,
    });

    expect(stillSeen).toMatchObject({
      visibilityState: 'observed',
      renderMode: DURING_MOVE_RENDER_MODES.CORE,
    });
    expect(lostSight).toMatchObject({
      visibilityState: 'undetected',
      renderMode: DURING_MOVE_RENDER_MODES.HARD_HIDE,
    });
  });

  test('keeps invisible undetected hard-hidden even when final state is observed', () => {
    expect(
      resolveDuringMoveDecision({
        storedState: 'undetected',
        initialState: 'undetected',
        finalState: 'observed',
        movementActive: true,
        movementCommitted: true,
        currentLosSeesTarget: true,
        invisible: true,
      }),
    ).toMatchObject({
      visibilityState: 'undetected',
      renderMode: DURING_MOVE_RENDER_MODES.HARD_HIDE,
    });
  });

  test('bypasses observer LOS for select-all and no-observer GM views', () => {
    expect(
      resolveDuringMoveDecision({
        storedState: 'undetected',
        selectionBypass: true,
        movementActive: true,
        movementCommitted: true,
        finalState: 'undetected',
      }),
    ).toMatchObject({
      visibilityState: 'observed',
      renderMode: DURING_MOVE_RENDER_MODES.CORE,
      usesObserverLos: false,
    });
  });
});
