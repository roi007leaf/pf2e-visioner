import { jest } from '@jest/globals';
import {
  getTooltipSuppressedSenses,
  resolveTooltipSenseUsed,
} from '../../../scripts/services/HoverTooltip/hover-tooltip-sense-state.js';

describe('hover tooltip sense state helpers', () => {
  const observerToken = { id: 'observer', center: { x: 1, y: 2 } };
  const targetToken = { id: 'target', center: { x: 3, y: 4 } };
  const detectionTarget = { id: 'actual', center: { x: 5, y: 6 } };

  test('uses precomputed sense without reading detection map', () => {
    const getDetectionBetween = jest.fn();

    expect(
      resolveTooltipSenseUsed({
        avsEnabled: true,
        precomputedSenseUsed: 'lifesense',
        visibilityState: 'hidden',
        observerToken,
        targetToken,
        getDetectionBetween,
      }),
    ).toBe('lifesense');
    expect(getDetectionBetween).not.toHaveBeenCalled();
  });

  test('blocks sense badge lookup for unknown-location visibility states', () => {
    const getDetectionBetween = jest.fn(() => ({ sense: 'vision' }));

    expect(
      resolveTooltipSenseUsed({
        avsEnabled: true,
        precomputedSenseUsed: undefined,
        visibilityState: 'undetected',
        observerToken,
        targetToken,
        getDetectionBetween,
        blockedVisibilityStates: new Set(['undetected']),
      }),
    ).toBeNull();
    expect(getDetectionBetween).not.toHaveBeenCalled();
  });

  test('reads detection sense against actual detection target when needed', () => {
    const getDetectionBetween = jest.fn(() => ({ sense: 'vision' }));

    expect(
      resolveTooltipSenseUsed({
        avsEnabled: true,
        precomputedSenseUsed: undefined,
        visibilityState: 'hidden',
        observerToken,
        targetToken,
        detectionTarget,
        getDetectionBetween,
      }),
    ).toBe('vision');
    expect(getDetectionBetween).toHaveBeenCalledWith(observerToken, detectionTarget);
  });

  test('combines observer and target suppressed senses', () => {
    const suppressionBehavior = {
      getSuppressedSensesForObserver: jest.fn(() => new Set(['vision'])),
      getSuppressedSensesForTarget: jest.fn(() => new Set(['lifesense', 'vision'])),
    };

    expect(
      getTooltipSuppressedSenses({
        observerToken,
        targetToken,
        detectionTarget,
        suppressionBehavior,
      }),
    ).toEqual(new Set(['vision', 'lifesense']));
    expect(suppressionBehavior.getSuppressedSensesForObserver).toHaveBeenCalledWith(
      observerToken.center,
    );
    expect(suppressionBehavior.getSuppressedSensesForTarget).toHaveBeenCalledWith(
      detectionTarget.center,
    );
  });
});
