import '../../setup.js';

import {
  setPanningState,
  scheduleRAF,
  clearCentralizedRAF,
} from '../../../scripts/utils/scheduler.js';

describe('Centralized RAF Scheduler', () => {
  beforeEach(() => {
    clearCentralizedRAF();
    setPanningState(false);
    jest.clearAllMocks();
  });

  afterEach(() => {
    clearCentralizedRAF();
    setPanningState(false);
  });

  describe('scheduleRAF', () => {
    test('schedules callback for next frame', (done) => {
      const callback = jest.fn(() => {
        expect(callback).toHaveBeenCalledTimes(1);
        done();
      });

      scheduleRAF(callback, false);
    });

    test('collapses multiple callbacks into one frame', (done) => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      const callback3 = jest.fn();

      let callCount = 0;
      const checkDone = () => {
        callCount++;
        if (callCount === 3) {
          expect(callback1).toHaveBeenCalledTimes(1);
          expect(callback2).toHaveBeenCalledTimes(1);
          expect(callback3).toHaveBeenCalledTimes(1);
          done();
        }
      };

      scheduleRAF(() => {
        callback1();
        checkDone();
      }, false);
      scheduleRAF(() => {
        callback2();
        checkDone();
      }, false);
      scheduleRAF(() => {
        callback3();
        checkDone();
      }, false);
    });

    test('queues callback during pan when skipDuringPan=true', () => {
      setPanningState(true);

      const callback = jest.fn();
      const cancelFn = scheduleRAF(callback, true);

      expect(typeof cancelFn).toBe('function');
      expect(callback).not.toHaveBeenCalled();
    });

    test('executes callback during pan when skipDuringPan=false', (done) => {
      setPanningState(true);

      const callback = jest.fn(() => {
        expect(callback).toHaveBeenCalledTimes(1);
        done();
      });

      scheduleRAF(callback, false);
    });

    test('returns cancel function', () => {
      const callback = jest.fn();
      const cancelFn = scheduleRAF(callback, false);

      expect(typeof cancelFn).toBe('function');
      cancelFn();
    });

    test('cancel function prevents callback execution', (done) => {
      const callback = jest.fn();
      const cancelFn = scheduleRAF(callback, false);

      cancelFn();

      setTimeout(() => {
        expect(callback).not.toHaveBeenCalled();
        done();
      }, 50);
    });
  });

  describe('setPanningState', () => {
    test('resumes callbacks when pan stops', (done) => {
      setPanningState(true);

      const callback = jest.fn(() => {
        expect(callback).toHaveBeenCalledTimes(1);
        done();
      });

      scheduleRAF(callback, true);
      expect(callback).not.toHaveBeenCalled();

      setPanningState(false);
    });

    test('throttles updates during pan', (done) => {
      setPanningState(true);

      let callCount = 0;
      const startTime = performance.now();
      const callback = jest.fn(() => {
        callCount++;
        if (callCount >= 2) {
          const elapsed = performance.now() - startTime;
          expect(elapsed).toBeGreaterThanOrEqual(30);
          setPanningState(false);
          done();
        } else {
          scheduleRAF(callback, false);
        }
      });

      scheduleRAF(callback, false);
    });
  });

  describe('clearCentralizedRAF', () => {
    test('clears all pending callbacks', (done) => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      scheduleRAF(callback1, false);
      scheduleRAF(callback2, false);

      clearCentralizedRAF();

      setTimeout(() => {
        expect(callback1).not.toHaveBeenCalled();
        expect(callback2).not.toHaveBeenCalled();
        done();
      }, 50);
    });
  });

  describe('pan state integration', () => {
    test('multiple systems can check pan state', () => {
      setPanningState(true);

      const callback1 = jest.fn();
      const callback2 = jest.fn();

      const cancel1 = scheduleRAF(callback1, true);
      const cancel2 = scheduleRAF(callback2, true);

      expect(typeof cancel1).toBe('function');
      expect(typeof cancel2).toBe('function');
      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
    });

    test('callbacks execute after pan stops', (done) => {
      setPanningState(true);

      const callbacks = [];
      for (let i = 0; i < 5; i++) {
        const cb = jest.fn();
        callbacks.push(cb);
        scheduleRAF(cb, true);
      }

      expect(callbacks.every((cb) => !cb.mock.calls.length)).toBe(true);

      setPanningState(false);

      setTimeout(() => {
        expect(callbacks.every((cb) => cb.mock.calls.length === 1)).toBe(true);
        done();
      }, 100);
    });
  });
});

