import {
  buildHoverTooltipVisibilityRequests,
  buildTooltipVisibilityIndicatorDecision,
  buildTooltipVisibilityRequests,
  getCoverOverlayTargets,
  normalizeTooltipVisibilityState,
} from '../../../scripts/services/HoverTooltip/hover-tooltip-visibility-requests.js';
import { clearPendingTokenMovementPosition } from '../../../scripts/services/movement-tracking.js';

function makeToken(id, { isOwner = true, isVisible = true } = {}) {
  return {
    id,
    isOwner,
    isVisible,
    visible: isVisible,
    renderable: isVisible,
    mesh: { visible: isVisible, renderable: isVisible, alpha: isVisible ? 1 : 0 },
    document: { id },
  };
}

describe('hover tooltip visibility request planning', () => {
  afterEach(() => {
    clearPendingTokenMovementPosition('observer');
  });

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

  test('non-GM observer mode hides ALL undetected/unnoticed targets (no location leak)', () => {
    const observer = makeToken('observer');
    const undetected = makeToken('undetected');
    const unnoticed = makeToken('unnoticed');
    const hidden = makeToken('hidden');
    const getVisibilityMap = jest.fn(() => ({
      undetected: 'undetected',
      unnoticed: 'unnoticed',
      hidden: 'hidden',
    }));

    const requests = buildTooltipVisibilityRequests({
      subjectToken: observer,
      allTokens: [observer, undetected, unnoticed, hidden],
      mode: 'observer',
      isGM: false,
      getVisibilityMap,
      getDetectionBetween: () => null,
    });

    expect(requests.map((r) => r.renderToken.id)).toEqual(['hidden']);
  });

  test('cover overlay hides undetected/unnoticed targets from non-GM users (no location leak)', () => {
    const source = makeToken('source');
    const undetected = makeToken('undetected');
    const unnoticed = makeToken('unnoticed');
    const hidden = makeToken('hidden');
    const getVisibilityState = jest.fn((_, target) => target.id);

    const targets = getCoverOverlayTargets({
      sourceToken: source,
      allTokens: [source, undetected, unnoticed, hidden],
      isGM: false,
      getVisibilityState,
    });

    expect(targets.map((t) => t.id)).toEqual(['hidden']);
  });

  test('cover overlay still shows undetected targets for GM users (omniscience preserved)', () => {
    const source = makeToken('source');
    const undetected = makeToken('undetected');
    const getVisibilityState = jest.fn(() => 'undetected');

    const targets = getCoverOverlayTargets({
      sourceToken: source,
      allTokens: [source, undetected],
      isGM: true,
      getVisibilityState,
    });

    expect(targets.map((t) => t.id)).toEqual(['undetected']);
    expect(getVisibilityState).not.toHaveBeenCalled();
  });

  test('cover overlay still respects Foundry render state (core-hidden tokens excluded)', () => {
    const source = makeToken('source');
    const coreHidden = makeToken('core-hidden', { isVisible: false });

    const targets = getCoverOverlayTargets({
      sourceToken: source,
      allTokens: [source, coreHidden],
      isGM: false,
      getVisibilityState: () => 'observed',
    });

    expect(targets).toEqual([]);
  });

  test('GM observer mode still shows undetected targets (omniscience preserved)', () => {
    const observer = makeToken('observer');
    const undetected = makeToken('undetected');
    const getVisibilityMap = jest.fn(() => ({ undetected: 'undetected' }));

    const requests = buildTooltipVisibilityRequests({
      subjectToken: observer,
      allTokens: [observer, undetected],
      mode: 'observer',
      isGM: true,
      getVisibilityMap,
      getDetectionBetween: () => null,
    });

    expect(requests.map((r) => r.renderToken.id)).toEqual(['undetected']);
  });

  test('keeps observer-mode lifesense targets when core visibility hides them', () => {
    const observer = makeToken('observer');
    const target = makeToken('target', { isVisible: false });
    const getVisibilityMap = jest.fn(() => ({ target: 'observed' }));
    const getDetectionBetween = jest.fn(() => ({ sense: 'lifesense' }));

    const requests = buildTooltipVisibilityRequests({
      subjectToken: observer,
      allTokens: [observer, target],
      mode: 'observer',
      isGM: true,
      getVisibilityMap,
      getDetectionBetween,
    });

    expect(getVisibilityMap).toHaveBeenCalledTimes(1);
    expect(getDetectionBetween).toHaveBeenCalledTimes(1);
    expect(requests).toEqual([
      {
        renderToken: target,
        observerToken: observer,
        visibilityState: 'observed',
        mode: 'observer',
        detectionTarget: null,
        senseUsed: 'lifesense',
      },
    ]);
  });

  test('does not show core-hidden observer-mode observed targets without a sense badge', () => {
    const observer = makeToken('observer');
    const target = makeToken('target', { isVisible: false });
    const getVisibilityMap = jest.fn(() => ({ target: 'observed' }));
    const getDetectionBetween = jest.fn(() => null);

    const requests = buildTooltipVisibilityRequests({
      subjectToken: observer,
      allTokens: [observer, target],
      mode: 'observer',
      isGM: true,
      getVisibilityMap,
      getDetectionBetween,
    });

    expect(requests).toEqual([]);
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

  test('builds target-mode requests with pair visibility reads instead of full map reads', () => {
    const subject = makeToken('subject');
    const observers = Array.from({ length: 20 }, (_, index) =>
      makeToken(`observer-${index}`),
    );
    const getVisibilityMap = jest.fn(() => {
      throw new Error('full map read should not be needed');
    });
    const getVisibilityState = jest.fn((observer) =>
      observer.id === 'observer-3' ? 'hidden' : 'observed',
    );

    const requests = buildTooltipVisibilityRequests({
      subjectToken: subject,
      allTokens: [subject, ...observers],
      mode: 'target',
      isGM: true,
      getVisibilityMap,
      getVisibilityState,
    });

    expect(getVisibilityMap).not.toHaveBeenCalled();
    expect(getVisibilityState).toHaveBeenCalledTimes(observers.length);
    expect(requests).toEqual([
      {
        renderToken: observers[3],
        observerToken: observers[3],
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

  test('uses render state without querying isVisible for hidden soundwave tokens during controlled drag preview', () => {
    const originalCanvas = global.canvas;
    const observer = createMockToken({
      id: 'observer',
      controlled: true,
      flags: {
        'pf2e-visioner': {
          visibility: {
            target: 'hidden',
          },
        },
      },
    });
    observer.controlled = true;
    const target = createMockToken({ id: 'target', visible: true });
    target.detectionFilter = { id: 'soundwave-filter' };
    const isVisibleGetter = jest.fn(() => true);
    Object.defineProperty(target, 'isVisible', {
      configurable: true,
      get: isVisibleGetter,
    });
    global.canvas = {
      ...global.canvas,
      effects: {
        visionSources: new Map([['observer', { active: true, object: observer }]]),
        lightSources: new Map(),
      },
      tokens: {
        _draggedToken: observer,
        get: jest.fn((id) => (id === 'observer' ? observer : id === 'target' ? target : null)),
        placeables: [observer, target],
      },
    };

    try {
      const requests = buildTooltipVisibilityRequests({
        subjectToken: observer,
        allTokens: [observer, target],
        mode: 'observer',
        isGM: true,
        getVisibilityMap: () => ({ target: 'hidden' }),
      });

      expect(requests).toHaveLength(1);
      expect(requests[0]).toMatchObject({
        renderToken: target,
        observerToken: observer,
        visibilityState: 'hidden',
      });
      expect(isVisibleGetter).not.toHaveBeenCalled();
    } finally {
      global.canvas = originalCanvas;
    }
  });
});
