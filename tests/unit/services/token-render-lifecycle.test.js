import '../../setup.js';

import {
  handleAvsBatchCompleteRefresh,
  handleTokenPreUpdate,
  handleTokenRefreshed,
  handleTokenUpdated,
} from '../../../scripts/services/token-render-lifecycle.js';

describe('token render lifecycle service', () => {
  test('delegates pre-update movement and preserves synchronous cancellation', () => {
    const handlePreUpdateTokenMovement = jest.fn(() => false);

    const result = handleTokenPreUpdate(
      { id: 'token-1' },
      { x: 100 },
      { animate: true },
      'user-1',
      { handlePreUpdateTokenMovement },
    );

    expect(result).toBe(false);
    expect(handlePreUpdateTokenMovement).toHaveBeenCalledWith(
      { id: 'token-1' },
      { x: 100 },
      { animate: true },
      'user-1',
    );
  });

  test('warns and allows updates when pre-update movement handling fails', () => {
    const failure = new Error('movement failed');
    const warn = jest.fn();

    const result = handleTokenPreUpdate(
      { id: 'token-1' },
      { x: 100 },
      {},
      'user-1',
      {
        handlePreUpdateTokenMovement: jest.fn(() => {
          throw failure;
        }),
        warn,
      },
    );

    expect(result).toBeUndefined();
    expect(warn).toHaveBeenCalledWith('PF2E Visioner | preUpdateToken hook failed:', failure);
  });

  test('skips non-positional token updates without scheduling or refreshing', async () => {
    const schedulePendingTokenMovementCompletion = jest.fn();
    const refreshSystemHiddenHighlightsForMovedToken = jest.fn();

    const result = await handleTokenUpdated(
      { id: 'token-1' },
      { name: 'New Name' },
      {
        schedulePendingTokenMovementCompletion,
        refreshSystemHiddenHighlightsForMovedToken,
      },
    );

    expect(result).toEqual({ handled: false, reason: 'not-position' });
    expect(schedulePendingTokenMovementCompletion).not.toHaveBeenCalled();
    expect(refreshSystemHiddenHighlightsForMovedToken).not.toHaveBeenCalled();
  });

  test('schedules movement completion before refreshing moved-token highlights', async () => {
    const calls = [];
    const tokenDoc = { id: 'token-1' };
    const changes = { y: 250 };
    const schedulePendingTokenMovementCompletion = jest.fn(() => calls.push('schedule'));
    const refreshSystemHiddenHighlightsForMovedToken = jest.fn(async () => calls.push('refresh'));

    const result = await handleTokenUpdated(tokenDoc, changes, {
      schedulePendingTokenMovementCompletion,
      refreshSystemHiddenHighlightsForMovedToken,
    });

    expect(result).toEqual({ handled: true });
    expect(schedulePendingTokenMovementCompletion).toHaveBeenCalledWith(tokenDoc);
    expect(refreshSystemHiddenHighlightsForMovedToken).toHaveBeenCalledWith(tokenDoc, changes);
    expect(calls).toEqual(['schedule', 'refresh']);
  });

  test('still refreshes moved-token highlights when movement completion scheduling fails', async () => {
    const refreshSystemHiddenHighlightsForMovedToken = jest.fn().mockResolvedValue(undefined);

    const result = await handleTokenUpdated(
      { id: 'token-1' },
      { x: 100 },
      {
        schedulePendingTokenMovementCompletion: jest.fn(() => {
          throw new Error('schedule failed');
        }),
        refreshSystemHiddenHighlightsForMovedToken,
      },
    );

    expect(result).toEqual({ handled: true });
    expect(refreshSystemHiddenHighlightsForMovedToken).toHaveBeenCalledTimes(1);
  });

  test('skips moved-token highlight refresh while pending movement is still active', async () => {
    const refreshSystemHiddenHighlightsForMovedToken = jest.fn().mockResolvedValue(undefined);

    const result = await handleTokenUpdated(
      { id: 'token-1' },
      { x: 100 },
      {
        schedulePendingTokenMovementCompletion: jest.fn(),
        hasActivePendingTokenMovement: () => true,
        refreshSystemHiddenHighlightsForMovedToken,
      },
    );

    expect(result).toEqual({ handled: true });
    expect(refreshSystemHiddenHighlightsForMovedToken).not.toHaveBeenCalled();
  });

  test('warns when moved-token highlight refresh fails', async () => {
    const failure = new Error('refresh failed');
    const warn = jest.fn();

    const result = await handleTokenUpdated(
      { id: 'token-1' },
      { x: 100 },
      {
        schedulePendingTokenMovementCompletion: jest.fn(),
        refreshSystemHiddenHighlightsForMovedToken: jest.fn().mockRejectedValue(failure),
        warn,
      },
    );

    expect(result).toEqual({ handled: false, reason: 'error' });
    expect(warn).toHaveBeenCalledWith('PF2E Visioner | updateToken hook failed:', failure);
  });

  test('skips refreshToken processing while suppressed', async () => {
    const refreshSystemHiddenHighlightsForRenderedToken = jest.fn();

    const result = await handleTokenRefreshed(
      { id: 'token-1' },
      {
        isRefreshTokenProcessingSuppressed: () => true,
        refreshSystemHiddenHighlightsForRenderedToken,
      },
    );

    expect(result).toEqual({ handled: false, reason: 'suppressed' });
    expect(refreshSystemHiddenHighlightsForRenderedToken).not.toHaveBeenCalled();
  });

  test('returns synchronously for skipped refreshToken processing', () => {
    const result = handleTokenRefreshed(
      { document: { id: 'token-1' } },
      {
        isRefreshTokenProcessingSuppressed: () => false,
        shouldRefreshRenderedTokenHighlights: () => false,
      },
    );

    expect(result).toEqual({ handled: false, reason: 'not-controlled' });
    expect(result?.then).toBeUndefined();
  });

  test('re-hides pending render-locked token surfaces after core refresh', async () => {
    const token = {
      document: { id: 'target' },
      visible: true,
      renderable: true,
      mesh: { visible: true, renderable: true, alpha: 1 },
      targetPips: { visible: true },
      levelIndicator: { visible: true },
    };
    const forceTokenRenderStateInvisible = jest.fn((refreshedToken) => {
      refreshedToken.visible = false;
      refreshedToken.renderable = false;
      refreshedToken.targetPips.visible = false;
      refreshedToken.levelIndicator.visible = false;
    });
    const refreshSystemHiddenHighlightsForRenderedToken = jest.fn();

    const result = await handleTokenRefreshed(token, {
      isRefreshTokenProcessingSuppressed: () => false,
      hasPendingRenderState: () => true,
      forceTokenRenderStateInvisible,
      shouldRefreshRenderedTokenHighlights: () => false,
      refreshSystemHiddenHighlightsForRenderedToken,
    });

    expect(result).toEqual({ handled: false, reason: 'pending-render-lock' });
    expect(forceTokenRenderStateInvisible).toHaveBeenCalledWith(token);
    expect(token.targetPips.visible).toBe(false);
    expect(token.levelIndicator.visible).toBe(false);
    expect(refreshSystemHiddenHighlightsForRenderedToken).not.toHaveBeenCalled();
  });

  test('refreshes rendered-token highlights when refreshToken processing is not suppressed', async () => {
    const token = { id: 'token-1' };
    const refreshSystemHiddenHighlightsForRenderedToken = jest.fn().mockResolvedValue(undefined);

    const result = await handleTokenRefreshed(token, {
      isRefreshTokenProcessingSuppressed: () => false,
      shouldRefreshRenderedTokenHighlights: () => true,
      refreshSystemHiddenHighlightsForRenderedToken,
    });

    expect(result).toEqual({ handled: true });
    expect(refreshSystemHiddenHighlightsForRenderedToken).toHaveBeenCalledWith(token);
  });

  test('throttles repeated rendered-token highlight refreshes for same token', async () => {
    const token = { document: { id: 'token-1' } };
    const refreshSystemHiddenHighlightsForRenderedToken = jest.fn().mockResolvedValue(undefined);
    const shouldThrottleRenderedTokenHighlightRefresh = jest
      .fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    await expect(
      handleTokenRefreshed(token, {
        isRefreshTokenProcessingSuppressed: () => false,
        shouldRefreshRenderedTokenHighlights: () => true,
        shouldThrottleRenderedTokenHighlightRefresh,
        refreshSystemHiddenHighlightsForRenderedToken,
      }),
    ).resolves.toEqual({ handled: true });

    expect(
      handleTokenRefreshed(token, {
        isRefreshTokenProcessingSuppressed: () => false,
        shouldRefreshRenderedTokenHighlights: () => true,
        shouldThrottleRenderedTokenHighlightRefresh,
        refreshSystemHiddenHighlightsForRenderedToken,
      }),
    ).toEqual({ handled: false, reason: 'throttled' });

    expect(refreshSystemHiddenHighlightsForRenderedToken).toHaveBeenCalledTimes(1);
  });

  test('skips rendered-token highlight refresh for tokens that are not controlled', async () => {
    const token = { document: { id: 'target' } };
    const refreshSystemHiddenHighlightsForRenderedToken = jest.fn().mockResolvedValue(undefined);

    const result = await handleTokenRefreshed(token, {
      isRefreshTokenProcessingSuppressed: () => false,
      shouldRefreshRenderedTokenHighlights: () => false,
      refreshSystemHiddenHighlightsForRenderedToken,
    });

    expect(result).toEqual({ handled: false, reason: 'not-controlled' });
    expect(refreshSystemHiddenHighlightsForRenderedToken).not.toHaveBeenCalled();
  });

  test('refreshes pending movement visibility and highlights after AVS batch completion only when work is pending', async () => {
    const refreshPendingMovementTokenVisibility = jest.fn();
    const refreshSystemHiddenHighlightsForControlledTokens = jest.fn();

    await expect(
      handleAvsBatchCompleteRefresh({
        hasPendingMovementRenderWork: () => false,
        refreshPendingMovementTokenVisibility,
        refreshSystemHiddenHighlightsForControlledTokens,
      }),
    ).resolves.toEqual({ handled: false, reason: 'no-pending-work' });
    expect(refreshPendingMovementTokenVisibility).not.toHaveBeenCalled();
    expect(refreshSystemHiddenHighlightsForControlledTokens).not.toHaveBeenCalled();

    await expect(
      handleAvsBatchCompleteRefresh({
        hasPendingMovementRenderWork: () => true,
        getPendingMovementRefreshTargetIds: () => [],
        refreshPendingMovementTokenVisibility,
        refreshSystemHiddenHighlightsForControlledTokens,
      }),
    ).resolves.toEqual({ handled: true });
    expect(refreshPendingMovementTokenVisibility).not.toHaveBeenCalled();
    expect(refreshSystemHiddenHighlightsForControlledTokens).toHaveBeenCalledTimes(1);
  });

  test('targets pending movement visibility refresh after AVS batch completion when targets are known', async () => {
    const refreshPendingMovementTokenVisibility = jest.fn();

    await expect(
      handleAvsBatchCompleteRefresh({
        hasPendingMovementRenderWork: () => true,
        getPendingMovementRefreshTargetIds: () => ['target'],
        refreshPendingMovementTokenVisibility,
        refreshSystemHiddenHighlightsForControlledTokens: jest.fn(),
      }),
    ).resolves.toEqual({ handled: true });

    expect(refreshPendingMovementTokenVisibility).toHaveBeenCalledWith([], {
      ignoreObservedGrace: true,
      source: 'avs-batch-complete',
      targetTokenIds: ['target'],
    });
  });

  test('refreshes pending movement synchronously before system-hidden highlights after AVS batch completion', async () => {
    const calls = [];
    const refreshPendingMovementTokenVisibility = jest.fn(() => {
      calls.push('pending');
    });
    const refreshSystemHiddenHighlightsForControlledTokens = jest.fn(() => {
      calls.push('highlights');
    });

    await expect(
      handleAvsBatchCompleteRefresh({
        hasPendingMovementRenderWork: () => true,
        getPendingMovementRefreshTargetIds: () => ['target'],
        refreshPendingMovementTokenVisibility,
        refreshSystemHiddenHighlightsForControlledTokens,
      }),
    ).resolves.toEqual({ handled: true });

    expect(refreshPendingMovementTokenVisibility).toHaveBeenCalledWith([], {
      ignoreObservedGrace: true,
      source: 'avs-batch-complete',
      targetTokenIds: ['target'],
    });
    expect(calls).toEqual(['pending', 'highlights']);
  });
});
