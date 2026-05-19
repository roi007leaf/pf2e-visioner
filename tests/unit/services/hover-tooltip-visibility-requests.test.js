import {
  buildHoverTooltipVisibilityRequests,
  buildTooltipVisibilityIndicatorDecision,
  buildTooltipVisibilityRequests,
  normalizeTooltipVisibilityState,
} from '../../../scripts/services/HoverTooltip/hover-tooltip-visibility-requests.js';

function makeToken(id, { isOwner = true, isVisible = true } = {}) {
  return {
    id,
    isOwner,
    isVisible,
    document: { id },
  };
}

describe('hover tooltip visibility request planning', () => {
  test('normalizes avs control state to observed', () => {
    expect(normalizeTooltipVisibilityState('avs')).toBe('observed');
    expect(normalizeTooltipVisibilityState('hidden')).toBe('hidden');
    expect(normalizeTooltipVisibilityState(undefined)).toBe('observed');
  });

  test('blocks sense-only badge for unknown-presence states', () => {
    const observer = makeToken('observer');
    const target = makeToken('target');
    const getDetectionBetween = jest.fn(() => ({ sense: 'vision' }));

    expect(
      buildTooltipVisibilityIndicatorDecision({
        observerToken: observer,
        targetToken: target,
        visibilityMap: { target: 'unnoticed' },
        getDetectionBetween,
      }),
    ).toMatchObject({
      visibilityState: 'unnoticed',
      senseUsed: null,
      shouldShowIndicator: true,
    });
    expect(getDetectionBetween).not.toHaveBeenCalled();
  });

  test('builds observer-mode requests with one visibility map read', () => {
    const observer = makeToken('observer');
    const targetA = makeToken('target-a');
    const targetB = makeToken('target-b');
    const getVisibilityMap = jest.fn(() => ({
      'target-a': 'hidden',
      'target-b': 'observed',
    }));
    const getDetectionBetween = jest.fn((_, target) =>
      target.id === 'target-b' ? { sense: 'lifesense' } : null,
    );

    const requests = buildHoverTooltipVisibilityRequests({
      hoveredToken: observer,
      allTokens: [observer, targetA, targetB],
      tooltipMode: 'observer',
      isGM: true,
      getVisibilityMap,
      getDetectionBetween,
    });

    expect(getVisibilityMap).toHaveBeenCalledTimes(1);
    expect(requests).toEqual([
      {
        renderToken: targetA,
        observerToken: observer,
        visibilityState: 'hidden',
        mode: 'observer',
        detectionTarget: null,
        senseUsed: null,
      },
      {
        renderToken: targetB,
        observerToken: observer,
        visibilityState: 'observed',
        mode: 'observer',
        detectionTarget: null,
        senseUsed: 'lifesense',
      },
    ]);
  });

  test('builds target-mode requests from each visible observer perspective', () => {
    const subject = makeToken('subject');
    const observerA = makeToken('observer-a');
    const observerB = makeToken('observer-b', { isVisible: false });
    const observerC = makeToken('observer-c');
    const getVisibilityMap = jest.fn((observer) => ({
      subject: observer.id === 'observer-a' ? 'hidden' : 'observed',
    }));
    const getDetectionBetween = jest.fn(() => null);

    const requests = buildTooltipVisibilityRequests({
      subjectToken: subject,
      allTokens: [subject, observerA, observerB, observerC],
      mode: 'target',
      isGM: true,
      getVisibilityMap,
      getDetectionBetween,
    });

    expect(getVisibilityMap).toHaveBeenCalledTimes(2);
    expect(requests).toEqual([
      {
        renderToken: observerA,
        observerToken: observerA,
        visibilityState: 'hidden',
        mode: 'target',
        detectionTarget: subject,
        senseUsed: null,
      },
    ]);
  });

  test('returns no player requests for non-owned subject token', () => {
    const subject = makeToken('subject', { isOwner: false });
    const observer = makeToken('observer');

    expect(
      buildTooltipVisibilityRequests({
        subjectToken: subject,
        allTokens: [subject, observer],
        mode: 'target',
        isGM: false,
      }),
    ).toEqual([]);
  });
});
