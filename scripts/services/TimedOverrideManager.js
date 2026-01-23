import { MODULE_ID, TIMED_OVERRIDE_TYPES, REALTIME_CHECK_INTERVAL_MS } from '../constants.js';

export class TimedOverrideManager {
  static _realtimeIntervalId = null;
  static _pauseStartedAt = null;

  static registerHooks() {
    Hooks.on('updateCombat', (combat, updateData, options, userId) => {
      const turnChanged =
        Object.prototype.hasOwnProperty.call(updateData, 'turn') ||
        Object.prototype.hasOwnProperty.call(updateData, 'round');
      if (turnChanged) {
        this.processRoundExpirations(combat, updateData);
      }
    });

    Hooks.on('deleteCombat', (combat) => {
      this.handleCombatEnd(combat);
    });

    Hooks.on('pauseGame', (paused) => {
      this.handlePauseGame(paused);
    });

    this._startRealtimeChecker();
  }

  static _nowMs() {
    return game.paused && this._pauseStartedAt ? this._pauseStartedAt : Date.now();
  }

  static async handlePauseGame(paused) {
    if (!game.user?.isGM) return;
    if (paused) {
      if (!this._pauseStartedAt) this._pauseStartedAt = Date.now();
      return;
    }

    if (!this._pauseStartedAt) return;
    const deltaMs = Date.now() - this._pauseStartedAt;
    this._pauseStartedAt = null;
    if (deltaMs <= 0) return;
    await this._shiftRealtimeTimers(deltaMs);
  }

  static _getRealtimeShiftUpdates(token, deltaMs) {
    const flags = token?.document?.flags?.[MODULE_ID] || {};
    const updates = [];
    for (const [flagKey, flagData] of Object.entries(flags)) {
      if (!flagKey.startsWith('avs-override-from-')) continue;
      const timer = flagData?.timedOverride;
      if (!timer || timer.type !== TIMED_OVERRIDE_TYPES.REALTIME) continue;
      if (!Number.isFinite(timer.expiresAt)) continue;
      updates.push({
        flagKey,
        updatedData: {
          ...flagData,
          timedOverride: { ...timer, expiresAt: timer.expiresAt + deltaMs },
        },
      });
    }
    return updates;
  }

  static async _shiftRealtimeTimers(deltaMs) {
    if (!canvas.tokens?.placeables) return;
    for (const token of canvas.tokens.placeables) {
      try {
        const updates = this._getRealtimeShiftUpdates(token, deltaMs);
        for (const { flagKey, updatedData } of updates) {
          await token.document.setFlag(MODULE_ID, flagKey, updatedData);
        }
      } catch (e) {
        console.warn('PF2E Visioner | Error shifting realtime timers:', e);
      }
    }
  }

  static _startRealtimeChecker() {
    if (this._realtimeIntervalId) return;
    this._realtimeIntervalId = setInterval(() => {
      this.processRealtimeExpirations();
    }, REALTIME_CHECK_INTERVAL_MS);
  }

  static _stopRealtimeChecker() {
    if (this._realtimeIntervalId) {
      clearInterval(this._realtimeIntervalId);
      this._realtimeIntervalId = null;
    }
  }

  static async createTimedOverride(observer, target, state, timerConfig, options = {}) {
    if (!observer?.document?.id || !target?.document?.id) {
      console.warn('PF2E Visioner | Invalid observer or target for timed override');
      return false;
    }

    const timedOverride = this._buildTimedOverrideData(timerConfig);
    if (!timedOverride) {
      console.warn('PF2E Visioner | Invalid timer configuration');
      return false;
    }

    try {
      const { default: AvsOverrideManager } = await import(
        '../chat/services/infra/AvsOverrideManager.js'
      );

      const changeMap = new Map();
      changeMap.set(target.document.id, {
        target,
        state,
        hasCover: options.hasCover,
        hasConcealment: options.hasConcealment,
        expectedCover: options.expectedCover,
      });

      await AvsOverrideManager.applyOverrides(observer, changeMap, {
        source: options.source || 'manual_action',
        timedOverride,
      });

      return true;
    } catch (error) {
      console.error('PF2E Visioner | Error creating timed override:', error);
      return false;
    }
  }

  static _buildTimedOverrideData(config) {
    if (!config || !config.type) return null;

    const data = {
      type: config.type,
      roundsRemaining: null,
      expiresOnTurn: null,
      combatId: null,
      expiresAt: null,
    };

    switch (config.type) {
      case TIMED_OVERRIDE_TYPES.PERMANENT:
        break;

      case TIMED_OVERRIDE_TYPES.ROUNDS: {
        if (!config.rounds || config.rounds < 1) return null;
        data.roundsRemaining = config.rounds;
        if (config.expiresOnTurn) {
          data.expiresOnTurn = {
            actorId: config.expiresOnTurn.actorId,
            timing: config.expiresOnTurn.timing || 'start',
          };
        }
        const combat = game.combat;
        if (combat) {
          data.combatId = combat.id;
        }
        break;
      }

      case TIMED_OVERRIDE_TYPES.REALTIME:
        if (!config.minutes || config.minutes < 0) return null;
        data.expiresAt = Date.now() + config.minutes * 60 * 1000;
        break;

      default:
        return null;
    }

    return data;
  }

  static async processRoundExpirations(combat, updateData) {
    if (!game.user?.isGM) return;
    if (!combat || !canvas.tokens?.placeables) return;

    const currentCombatant = combat.combatant;
    const currentActorId = currentCombatant?.actorId;
    const previousCombatant = this._getPreviousCombatant(combat);
    const previousActorId = previousCombatant?.actorId;

    const allTokens = canvas.tokens.placeables;
    const expiredOverrides = [];

    for (const token of allTokens) {
      try {
        const flags = token.document.flags?.[MODULE_ID] || {};
        for (const [flagKey, flagData] of Object.entries(flags)) {
          if (!flagKey.startsWith('avs-override-from-')) continue;
          if (!flagData?.timedOverride) continue;

          const timer = flagData.timedOverride;
          if (timer.type !== TIMED_OVERRIDE_TYPES.ROUNDS) continue;
          if (timer.combatId && timer.combatId !== combat.id) continue;

          let shouldDecrement = false;
          let shouldExpire = false;

          if (timer.expiresOnTurn && timer.expiresOnTurn.actorId) {
            const targetActorId = timer.expiresOnTurn.actorId;
            const timing = timer.expiresOnTurn.timing || 'start';

            if (timing === 'start' && targetActorId === currentActorId) {
              shouldDecrement = true;
            } else if (timing === 'end' && targetActorId === previousActorId) {
              shouldDecrement = true;
            }
          } else {
            shouldDecrement = true;
          }

          if (shouldDecrement) {
            const newRounds = (timer.roundsRemaining || 1) - 1;
            if (newRounds <= 0) {
              shouldExpire = true;
            } else {
              await this._updateRoundsRemaining(token, flagKey, flagData, newRounds);
            }
          }

          if (shouldExpire) {
            expiredOverrides.push({
              token,
              flagKey,
              flagData,
              observerId: flagKey.replace('avs-override-from-', ''),
              targetId: token.document.id,
            });
          }
        }
      } catch (error) {
        console.warn('PF2E Visioner | Error processing round expiration for token:', error);
      }
    }

    for (const expired of expiredOverrides) {
      await this._expireOverride(expired);
    }
  }

  static _getPreviousCombatant(combat) {
    try {
      const turns = combat.turns || [];
      const currentIndex = combat.turn ?? 0;
      if (currentIndex <= 0) {
        return turns[turns.length - 1] || null;
      }
      return turns[currentIndex - 1] || null;
    } catch {
      return null;
    }
  }

  static async _updateRoundsRemaining(token, flagKey, flagData, newRounds) {
    try {
      const updatedData = {
        ...flagData,
        timedOverride: {
          ...flagData.timedOverride,
          roundsRemaining: newRounds,
        },
      };
      await token.document.setFlag(MODULE_ID, flagKey.replace(`${MODULE_ID}.`, ''), updatedData);
    } catch (error) {
      console.warn('PF2E Visioner | Error updating rounds remaining:', error);
    }
  }

  static async processRealtimeExpirations() {
    if (!game.user?.isGM) return;
    if (!canvas.tokens?.placeables) return;
    if (game.paused) return;

    const now = Date.now();
    const allTokens = canvas.tokens.placeables;
    const expiredOverrides = [];

    for (const token of allTokens) {
      try {
        const flags = token.document.flags?.[MODULE_ID] || {};
        for (const [flagKey, flagData] of Object.entries(flags)) {
          if (!flagKey.startsWith('avs-override-from-')) continue;
          if (!flagData?.timedOverride) continue;

          const timer = flagData.timedOverride;
          if (timer.type !== TIMED_OVERRIDE_TYPES.REALTIME) continue;
          if (!timer.expiresAt || timer.expiresAt > now) continue;

          expiredOverrides.push({
            token,
            flagKey,
            flagData,
            observerId: flagKey.replace('avs-override-from-', ''),
            targetId: token.document.id,
          });
        }
      } catch (error) {
        console.warn('PF2E Visioner | Error checking realtime expiration for token:', error);
      }
    }

    for (const expired of expiredOverrides) {
      await this._expireOverride(expired);
    }
  }

  static async _expireOverride(expired) {
    try {
      const { default: AvsOverrideManager } = await import(
        '../chat/services/infra/AvsOverrideManager.js'
      );

      await AvsOverrideManager.removeOverride(expired.observerId, expired.targetId);

      const observerToken = canvas.tokens?.get(expired.observerId);
      const targetToken = expired.token;

      if (observerToken && targetToken) {
        try {
          const { setVisibilityMap, getVisibilityMap } = await import(
            '../stores/visibility-map.js'
          );
          const currentMap = getVisibilityMap(observerToken) || {};
          delete currentMap[expired.targetId];
          await setVisibilityMap(observerToken, currentMap);
        } catch (e) {
          console.error(
            'PF2E Visioner | TimedOverrideManager: error removing from visibility map',
            e,
          );
        }

        try {
          const { cleanupEphemeralEffectsForTarget } = await import('../visibility/cleanup.js');
          await cleanupEphemeralEffectsForTarget(observerToken, targetToken);
        } catch (e) {
          console.error(
            'PF2E Visioner | TimedOverrideManager: error cleaning up ephemeral effects',
            e,
          );
        }

        try {
          const { refreshLocalPerception } = await import('./socket.js');
          refreshLocalPerception();
        } catch {}
      }

      try {
        const { updateTokenVisuals } = await import('./visual-effects.js');
        await updateTokenVisuals();
      } catch {}

      const targetName = expired.token?.name || 'Unknown';
      ui.notifications?.info(
        game.i18n.format('PF2E_VISIONER.TIMED_OVERRIDE.TIMER_EXPIRED_NOTIFICATION', {
          target: targetName,
        }),
      );
    } catch (error) {
      console.error('PF2E Visioner | Error expiring timed override:', error);
    }
  }

  static async handleCombatEnd(combat) {
    if (!game.user?.isGM) return;
    if (!canvas.tokens?.placeables) return;

    const allTokens = canvas.tokens.placeables;
    const roundBasedOverrides = [];

    for (const token of allTokens) {
      try {
        const flags = token.document.flags?.[MODULE_ID] || {};
        for (const [flagKey, flagData] of Object.entries(flags)) {
          if (!flagKey.startsWith('avs-override-from-')) continue;
          if (!flagData?.timedOverride) continue;

          const timer = flagData.timedOverride;
          if (timer.type !== TIMED_OVERRIDE_TYPES.ROUNDS) continue;
          if (timer.combatId && timer.combatId !== combat.id) continue;

          roundBasedOverrides.push({
            token,
            flagKey,
            flagData,
            observerId: flagKey.replace('avs-override-from-', ''),
            targetId: token.document.id,
          });
        }
      } catch (error) {
        console.warn('PF2E Visioner | Error checking combat end for token:', error);
      }
    }

    for (const override of roundBasedOverrides) {
      try {
        const updatedData = {
          ...override.flagData,
          timedOverride: {
            type: TIMED_OVERRIDE_TYPES.PERMANENT,
            roundsRemaining: null,
            expiresOnTurn: null,
            combatId: null,
            expiresAt: null,
          },
        };
        const cleanKey = override.flagKey.replace(`${MODULE_ID}.`, '');
        await override.token.document.setFlag(MODULE_ID, cleanKey, updatedData);
      } catch (error) {
        console.warn('PF2E Visioner | Error converting round-based override to permanent:', error);
      }
    }
  }

  static async cancelTimer(observerId, targetId) {
    try {
      const { default: AvsOverrideManager } = await import(
        '../chat/services/infra/AvsOverrideManager.js'
      );
      await AvsOverrideManager.removeOverride(observerId, targetId);

      const observerToken = canvas.tokens?.get(observerId);
      const targetToken = canvas.tokens?.get(targetId);

      if (observerToken && targetToken) {
        try {
          const { setVisibilityMap, getVisibilityMap } = await import(
            '../stores/visibility-map.js'
          );
          const currentMap = getVisibilityMap(observerToken) || {};
          delete currentMap[targetId];
          await setVisibilityMap(observerToken, currentMap);
        } catch {}

        try {
          const { cleanupEphemeralEffectsForTarget } = await import('../visibility/cleanup.js');
          await cleanupEphemeralEffectsForTarget(observerToken, targetToken);
        } catch {}

        try {
          const { refreshLocalPerception } = await import('./socket.js');
          refreshLocalPerception();
        } catch {}
      }

      try {
        const { updateTokenVisuals } = await import('./visual-effects.js');
        await updateTokenVisuals();
      } catch {}

      ui.notifications?.info(game.i18n.localize('PF2E_VISIONER.TIMED_OVERRIDE.TIMER_CANCELLED'));
      return true;
    } catch (error) {
      console.error('PF2E Visioner | Error cancelling timer:', error);
      return false;
    }
  }

  static getActiveTimersForToken(tokenId) {
    if (!canvas?.tokens?.placeables) return [];

    const timers = [];
    const allTokens = canvas.tokens.placeables;

    for (const token of allTokens) {
      try {
        const flags = token.document.flags?.[MODULE_ID] || {};
        for (const [flagKey, flagData] of Object.entries(flags)) {
          if (!flagKey.startsWith('avs-override-from-')) continue;
          if (!flagData?.timedOverride) continue;

          const observerId = flagKey.replace('avs-override-from-', '');
          const targetId = token.document.id;

          if (observerId !== tokenId && targetId !== tokenId) continue;

          timers.push({
            observerId,
            targetId,
            observerName: flagData.observerName || 'Unknown',
            targetName: flagData.targetName || token.name || 'Unknown',
            state: flagData.state,
            timedOverride: flagData.timedOverride,
            source: flagData.source,
          });
        }
      } catch (error) {
        console.warn('PF2E Visioner | Error getting timers for token:', error);
      }
    }

    return timers;
  }

  static hasActiveTimer(observerId, targetId) {
    const targetToken = canvas.tokens?.get(targetId);
    if (!targetToken) return false;

    try {
      const flagKey = `avs-override-from-${observerId}`;
      const flagData = targetToken.document.getFlag(MODULE_ID, flagKey);
      return !!flagData?.timedOverride;
    } catch {
      return false;
    }
  }

  static getTimerData(observerId, targetId) {
    const targetToken = canvas?.tokens?.get?.(targetId);
    if (!targetToken) return null;

    try {
      const flagKey = `avs-override-from-${observerId}`;
      const flagData = targetToken.document.getFlag(MODULE_ID, flagKey);
      if (!flagData?.timedOverride) return null;
      return flagData.timedOverride;
    } catch {
      return null;
    }
  }

  static getRemainingTimeDisplay(timedOverride) {
    if (!timedOverride) return '';

    switch (timedOverride.type) {
      case TIMED_OVERRIDE_TYPES.PERMANENT:
        return game.i18n.localize('PF2E_VISIONER.TIMED_OVERRIDE.PERMANENT');

      case TIMED_OVERRIDE_TYPES.ROUNDS:
        return game.i18n.format('PF2E_VISIONER.TIMED_OVERRIDE.ROUNDS_REMAINING', {
          count: timedOverride.roundsRemaining || 0,
        });

      case TIMED_OVERRIDE_TYPES.REALTIME: {
        if (!timedOverride.expiresAt) return '';
        const remaining = timedOverride.expiresAt - this._nowMs();
        if (remaining <= 0) return 'Expired';
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
        return game.i18n.format('PF2E_VISIONER.TIMED_OVERRIDE.TIME_REMAINING', {
          time: timeStr,
        });
      }

      default:
        return '';
    }
  }

  static isTimedOverrideActive(timedOverride) {
    if (!timedOverride) return false;

    switch (timedOverride.type) {
      case TIMED_OVERRIDE_TYPES.PERMANENT:
        return true;

      case TIMED_OVERRIDE_TYPES.ROUNDS:
        return (timedOverride.roundsRemaining || 0) > 0;

      case TIMED_OVERRIDE_TYPES.REALTIME:
        return timedOverride.expiresAt && timedOverride.expiresAt > this._nowMs();

      default:
        return false;
    }
  }
}

export default TimedOverrideManager;
