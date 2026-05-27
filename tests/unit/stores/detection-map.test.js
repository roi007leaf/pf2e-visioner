import {
  discardDetectionBatch,
  flushDetectionBatch,
  setDetectionBetween,
  setDetectionMap,
  startDetectionBatch,
} from '../../../scripts/stores/detection-map.js';

describe('Detection Map Store', () => {
  let observer;
  let target;

  beforeEach(() => {
    observer = global.createMockToken({ id: 'observer' });
    target = global.createMockToken({ id: 'target' });

    global.game.user.isGM = true;
    global.canvas.tokens.get = jest.fn((id) => {
      if (id === observer.document.id) return observer;
      if (id === target.document.id) return target;
      return null;
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('setDetectionMap persists without triggering render or animation', async () => {
    await setDetectionMap(observer, {
      target: { sense: 'hearing', isPrecise: false },
    });

    expect(observer.document.update).toHaveBeenCalledWith(
      {
        'flags.pf2e-visioner.detection': {
          target: { sense: 'hearing', isPrecise: false },
        },
      },
      { render: false, animate: false },
    );
  });

  test('flushDetectionBatch persists batched writes without triggering render or animation', async () => {
    startDetectionBatch();

    await setDetectionBetween(observer, target, {
      sense: 'darkvision',
      isPrecise: true,
    });

    await flushDetectionBatch();

    expect(observer.document.update).toHaveBeenCalledWith(
      {
        'flags.pf2e-visioner.detection': {
          target: { sense: 'darkvision', isPrecise: true },
        },
      },
      { render: false, animate: false },
    );
  });

  test('setDetectionBetween persists immediate writes without mutating current flag map first', async () => {
    observer.document.flags['pf2e-visioner'] = { detection: {} };

    await setDetectionBetween(observer, target, {
      sense: 'darkvision',
      isPrecise: true,
    });

    expect(observer.document.update).toHaveBeenCalledWith(
      {
        'flags.pf2e-visioner.detection': {
          target: { sense: 'darkvision', isPrecise: true },
        },
      },
      { render: false, animate: false },
    );
  });

  test('setDetectionBetween reuses a mutable map inside one detection batch', async () => {
    const firstTarget = global.createMockToken({ id: 'target-a' });
    const secondTarget = global.createMockToken({ id: 'target-b' });
    const currentMap = {
      existing: { sense: 'vision', isPrecise: true },
    };
    const getFlag = jest.fn(() => currentMap);
    observer.document.getFlag = getFlag;

    startDetectionBatch();

    await setDetectionBetween(observer, firstTarget, {
      sense: 'darkvision',
      isPrecise: true,
    });
    await setDetectionBetween(observer, secondTarget, {
      sense: 'hearing',
      isPrecise: false,
    });
    await flushDetectionBatch();

    expect(getFlag).toHaveBeenCalledTimes(2);
    expect(observer.document.update).toHaveBeenCalledWith(
      {
        'flags.pf2e-visioner.detection': {
          existing: { sense: 'vision', isPrecise: true },
          'target-a': { sense: 'darkvision', isPrecise: true },
          'target-b': { sense: 'hearing', isPrecise: false },
        },
      },
      { render: false, animate: false },
    );
  });

  test('discardDetectionBatch drops batched writes without persisting stale detection', async () => {
    startDetectionBatch();

    await setDetectionBetween(observer, target, {
      sense: 'darkvision',
      isPrecise: true,
    });

    discardDetectionBatch();
    await flushDetectionBatch();

    expect(observer.document.update).not.toHaveBeenCalled();
  });

  test('setDetectionMap defers writes until the observer token settles', async () => {
    jest.useFakeTimers();

    observer.x = 2000;
    observer.y = 3325.72;
    observer.document.x = 2000;
    observer.document.y = 2200;

    const updatePromise = setDetectionMap(observer, {
      target: { sense: 'hearing', isPrecise: false },
    });
    await Promise.resolve();

    expect(observer.document.update).not.toHaveBeenCalled();

    observer.y = 2200;
    await jest.advanceTimersByTimeAsync(50);
    await updatePromise;

    expect(observer.document.update).toHaveBeenCalledWith(
      {
        'flags.pf2e-visioner.detection': {
          target: { sense: 'hearing', isPrecise: false },
        },
      },
      { render: false, animate: false },
    );
  });
});
