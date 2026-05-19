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

  test('keeps moved-token highlight refresh active while pending movement render work exists', async () => {
    const refreshSystemHiddenHighlightsForMovedToken = jest.fn().mockResolvedValue(undefined);

    const result = await handleTokenUpdated(
      { id: 'token-1' },
      { x: 100 },
      {
        schedulePendingTokenMovementCompletion: jest.fn(),
        hasPendingMovementRenderWork: () => true,
        refreshSystemHiddenHighlightsForMovedToken,
      },
    );

    expect(result).toEqual({ handled: true });
    expect(refreshSystemHiddenHighlightsForMovedToken).toHaveBeenCalledWith(
      { id: 'token-1' },
      { x: 100 },
    );
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

  test('refreshes rendered-token highlights when refreshToken processing is not suppressed', async () => {
    const token = { id: 'token-1' };
    const refreshSystemHiddenHighlightsForRenderedToken = jest.fn().mockResolvedValue(undefined);

    const result = await handleTokenRefreshed(token, {
      isRefreshTokenProcessingSuppressed: () => false,
      refreshSystemHiddenHighlightsForRenderedToken,
    });

    expect(result).toEqual({ handled: true });
    expect(refreshSystemHiddenHighlightsForRenderedToken).toHaveBeenCalledWith(token);
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
        refreshPendingMovementTokenVisibility,
        refreshSystemHiddenHighlightsForControlledTokens,
      }),
    ).resolves.toEqual({ handled: true });
    expect(refreshPendingMovementTokenVisibility).toHaveBeenCalledWith([], {
      ignoreObservedGrace: true,
    });
    expect(refreshSystemHiddenHighlightsForControlledTokens).toHaveBeenCalledTimes(1);
  });
});
