import {
  MODULE_ID,
  getVisibilityStateLabelKey,
} from '../../../constants.js';
import autoCoverSystem from '../../../cover/auto-cover/AutoCoverSystem.js';
import stealthCheckUseCase from '../../../cover/auto-cover/usecases/StealthCheckUseCase.js';
import { overrideToDisplayVisibility } from '../../../visibility/perception-profile.js';
import { appliedSneakChangesByMessage } from '../data/message-cache.js';
import errorHandlingService, { SYSTEM_TYPES } from '../infra/ErrorHandlingService.js';
import { notify } from '../infra/notifications.js';
import sneakCore from '../SneakCore.js';
import turnSneakTracker from '../TurnSneakTracker.js';
import { ActionHandlerBase } from './BaseAction.js';
import { clearSneakFlag } from './Sneak/sneak-cleanup.js';
import { buildSneakAutoCoverData } from './Sneak/sneak-cover-analysis.js';
import { checkSneakPositionQualification } from './Sneak/sneak-position-qualification.js';
import { resolveSneakRollOutcome } from './Sneak/sneak-roll-outcome.js';
import { captureSneakStartPosition } from './Sneak/sneak-start-position.js';
import { enrichSneakOutcomesWithStartStates } from './Sneak/sneak-start-state-enrichment.js';
import { discoverSneakSubjects } from './Sneak/sneak-subject-discovery.js';
import { resolveSneakingToken } from './Sneak/sneak-token-resolution.js';
import { initializeSneakVisibility } from './Sneak/sneak-visibility-initialization.js';
import { resolveSneakVisibilityOutcome } from './Sneak/sneak-visibility-outcome.js';

export class SneakActionHandler extends ActionHandlerBase {
  constructor() {
    super('sneak');
    // Use singletons to share state with auto-cover pipeline
    this.autoCoverSystem = autoCoverSystem;
    this.stealthCheckUseCase = stealthCheckUseCase;
    this.sneakCore = sneakCore;
    this._currentSessionId = null;
  }
  getCacheMap() {
    return appliedSneakChangesByMessage;
  }
  getOutcomeTokenId(outcome) {
    return outcome?.token?.id ?? outcome?.target?.id ?? null;
  }
  isOldStateAvsControlled(outcome, actionData) {
    try {
      const avsEnabled = game.settings.get(MODULE_ID, 'autoVisibilityEnabled');
      if (!avsEnabled) return false;

      const observer = outcome.token || outcome.target;
      const actor = actionData?.actor;

      if (!observer || !actor) return false;

      const hasOverride = !!actor.document?.getFlag(
        MODULE_ID,
        `avs-override-from-${observer.document?.id || observer.id}`,
      );

      return !hasOverride;
    } catch {
      return false;
    }
  }

  /**
   * Get cached outcomes for the given actionData, or compute them if not cached
   * @param {Object} actionData - The action data
   * @returns {Promise<Array>} Array of outcome objects
   */
  async getCachedOutcomes(actionData) {
    try {
      // For now, just compute the outcomes fresh
      // TODO: implement actual caching if needed for performance
      const subjects = await this.discoverSubjects(actionData);
      const outcomes = [];
      for (const subject of subjects) {
        outcomes.push(await this.analyzeOutcome(actionData, subject));
      }
      const result = outcomes.filter(Boolean);

      // Apply start-state qualifications from stored sneakStartStates flags.
      // Without this, analyzeOutcome falls back to standard logic using the current
      // (post-movement) visibility, ignoring whether the token started hidden/undetected
      // or ended in cover — producing incorrect results for the direct "Apply Changes" path.
      await enrichSneakOutcomesWithStartStates(actionData, result, {
        getSneakingToken: (data) => this._getSneakingToken(data),
        autoCoverSystem: this.autoCoverSystem,
        stealthCheckUseCase: this.stealthCheckUseCase,
      });

      return result;
    } catch (error) {
      console.error('PF2E Visioner | Error getting cached outcomes:', error);
      return [];
    }
  }

  async ensurePrerequisites(actionData) {
    try {
      const { ensureActionRoll } = await import('../infra/roll-utils.js');
      ensureActionRoll(actionData);

      // Capture start positions when prerequisites are validated
      await this._captureStartPositions(actionData);

      // Initialize sneak visibility states immediately when sneaking starts
      await this._initializeSneakVisibility(actionData);

      // Check for Sneaky/Very Sneaky feat and start turn tracking if present
      const sneakingToken = this._getSneakingToken(actionData);
      if (sneakingToken && turnSneakTracker.hasSneakyFeat(sneakingToken)) {
        const trackingStarted = turnSneakTracker.startTurnSneak(sneakingToken, actionData);
      }

      // Basic validation without recursion - just check if we have observers
      const observers = await this.discoverSubjects(actionData);
      if (observers.length === 0) {
        const { notify } = await import('../infra/notifications.js');
        notify.warn('No potential observers detected - sneak may not be necessary');
      }
    } catch (error) {
      // Handle prerequisite failures with comprehensive error handling
      const errorResult = await errorHandlingService.handleSystemError(
        SYSTEM_TYPES.SNEAK_ACTION,
        error,
        { actionData, phase: 'prerequisites' },
      );

      if (errorResult.fallbackApplied) {
        console.warn(
          'PF2E Visioner | Using fallback for sneak prerequisites:',
          errorResult.fallbackData,
        );
        // Continue with basic prerequisite validation if fallback is available
        const { ensureActionRoll } = await import('../infra/roll-utils.js');
        ensureActionRoll(actionData);
      } else {
        // Re-throw if no fallback is possible
        throw error;
      }
    }
  }

  /**
   * Initialize sneak visibility states immediately when sneaking starts
   * This ensures AVS has proper baseline states to compare against when the token moves
   * @param {Object} actionData - Action data including actor and context
   * @private
   */
  async _initializeSneakVisibility(actionData) {
    await initializeSneakVisibility(actionData, {
      getSneakingToken: (data) => this._getSneakingToken(data),
    });
  }

  /**
   * Captures position state at the start of the sneak action
   * Hybrid approach: Capture start positions at dialog render, calculate end positions in real-time
   * @param {Object} actionData - Action data including actor and context
   * @param {Object} storedStartPosition - Optional stored coordinates from StealthCheckUseCase
   * @private
   */
  async _captureStartPositions(actionData, storedStartPosition = null) {
    if (this._currentSessionId) return;
    captureSneakStartPosition(actionData, {
      storedStartPosition,
      getSneakingToken: (data) => this._getSneakingToken(data),
    });
  }

  /**
   * Gets the sneaking token using v13-compatible token and document APIs
   * @param {Object} actionData - Action data
   * @returns {Token|null} The sneaking token
   * @private
   */
  _getSneakingToken(actionData) {
    return resolveSneakingToken(actionData);
  }

  async discoverSubjects(actionData) {
    return discoverSneakSubjects(actionData, {
      getSneakingToken: (data) => this._getSneakingToken(data),
    });
  }

  async analyzeOutcome(actionData, subject) {
    // Guard against null subject (observer)
    if (!subject) {
      console.warn('PF2E Visioner | SneakAction.analyzeOutcome called with null subject');
      return null;
    }

    try {
      // Initialize sneak session if not already started
      if (!this._currentSessionId) {
        const observers = [subject]; // Single observer for this outcome
        this._currentSessionId = await this.sneakCore.startSneakSession(
          actionData.actor,
          observers,
          actionData,
        );
      }
    } catch (error) {
      await errorHandlingService.handleSystemError(SYSTEM_TYPES.SNEAK_ACTION, error, {
        actionData,
        subject,
        phase: 'outcome_analysis_setup',
      });
    }

    const { getVisibilityBetween } = await import('../../../utils.js');
    const { extractPerceptionDC } = await import('../infra/shared-utils.js');

    // Use fresh visibility calculation that accounts for darkvision instead of stored state
    let current;
    try {
      const { optimizedVisibilityCalculator } = await import(
        '../../../visibility/auto-visibility/index.js'
      );
      current = await optimizedVisibilityCalculator.calculateVisibility(subject, actionData.actor);
    } catch (error) {
      console.warn(
        'PF2E Visioner | Failed to calculate fresh visibility, using stored state:',
        error,
      );
      current = getVisibilityBetween(subject, actionData.actor);
    }

    // Terrain Stalker free Sneak: if criteria met, skip Stealth check and keep visibility
    try {
      const free = await this._checkTerrainStalkerFreeSneak(actionData, subject, current);
      if (free?.applies) {
        return {
          token: subject,
          dc: extractPerceptionDC(subject),
          originalDC: extractPerceptionDC(subject),
          rollTotal: Number(actionData?.roll?.total ?? 0),
          dieResult: Number(actionData?.roll?.dice?.[0]?.results?.[0]?.result ?? 0),
          margin: 0,
          adjustedMargin: 0,
          originalMargin: 0,
          baseMargin: 0,
          outcome: 'success',
          originalOutcome: 'success',
          originalOutcomeLabel: 'Success',
          originalNewVisibility: current,
          shouldShowOverride: false,
          currentVisibility: current,
          oldVisibility: current,
          oldVisibilityLabel: current,
          newVisibility: current,
          changed: false,
          autoCover: null,
          originalRollTotal: Number(actionData?.roll?.total ?? 0),
          baseRollTotal: Number(actionData?.roll?.total ?? 0),
          positionTransition: free.positionTransition || null,
          startPosition: free.positionTransition?.startPosition || null,
          endPosition: free.positionTransition?.endPosition || null,
          // Force qualifications for preview/UI when TS free-sneak applies
          positionQualifies: {
            startQualifies: true,
            endQualifies: true,
            bothQualify: true,
            reason: 'Terrain Stalker: free Sneak',
          },
          _featPositionOverride: {
            startQualifies: true,
            endQualifies: true,
            bothQualify: true,
            reason: 'Terrain Stalker: free Sneak',
          },
          dcAdjustment: 0,
          outcomeChanged: false,
          enhancedAnalysis: { hasPositionData: !!free.positionTransition },
          enhancedOutcomeData: {
            explanation:
              'Terrain Stalker: move <= 5 ft, stay 10 ft from enemies, undetected by all',
          },
          featNotes: ['Terrain Stalker: no Stealth check required'],
          _tsFreeSneak: true,
        };
      }
    } catch {
      /* ignore and continue normal flow */
    }

    // Calculate roll information (stealth vs observer's perception DC)
    let adjustedDC = extractPerceptionDC(subject);

    const result = {
      autoCover: await buildSneakAutoCoverData({
        actionData,
        subject,
        autoCoverSystem: this.autoCoverSystem,
        stealthCheckUseCase: this.stealthCheckUseCase,
      }),
    };

    const dc = adjustedDC;
    const {
      baseTotal,
      total,
      originalTotal,
      baseRollTotal,
      die,
      margin,
      originalMargin,
      baseMargin,
      outcome,
      adjustedOutcome,
      originalOutcome,
      originalOutcomeLabel,
      featNotes,
      sneakAdeptApplied,
    } = await resolveSneakRollOutcome({ actionData, dc });

    const {
      newVisibility,
      originalNewVisibility,
      enhancedOutcome,
      positionTransition,
    } = await resolveSneakVisibilityOutcome({
      actionData,
      subject,
      current,
      adjustedOutcome,
      originalOutcome,
      originalTotal,
      total,
      dc,
      die,
      getPositionTransitionForSubject: (target) => this._getPositionTransitionForSubject(target),
      getSneakingToken: (data) => this._getSneakingToken(data),
      turnSneakTracker,
    });

    // Check if we should show override displays (only if there's a meaningful difference)
    const shouldShowOverride =
      result.autoCover?.isOverride &&
      (total !== originalTotal ||
        margin !== originalMargin ||
        outcome !== originalOutcome ||
        newVisibility !== originalNewVisibility);

    // positionTransition already computed above

    // Use the original DC and outcome without position-based adjustments
    const finalDC = dc;
    const finalOutcome = adjustedOutcome;
    const finalMargin = margin;

    // Simple position qualification check
    const positionQualifies = await checkSneakPositionQualification({
      positionTransition,
      actionData,
      observerToken: subject,
      getSneakingToken: (data) => this._getSneakingToken(data),
      turnSneakTracker,
    });

    const outcomeData = {
      token: subject,
      dc: finalDC, // Use adjusted DC
      originalDC: dc, // Keep original for reference
      rollTotal: baseTotal, // Show the base roll total (cover will be added when user presses buttons)
      dieResult: die,
      margin: total - finalDC, // Margin using adjusted total
      adjustedMargin: finalMargin, // Internal adjusted margin for calculations
      originalMargin,
      baseMargin,
      outcome: finalOutcome, // Use adjusted outcome (after feats)
      originalOutcome,
      originalOutcomeLabel,
      originalNewVisibility,
      shouldShowOverride,
      currentVisibility: current,
      // Precedence: AVS override > manual state > AVS calculation
      oldVisibility: (() => {
        // 1. AVS override (observer -> sneaker)
        const observerId = subject.document?.id;
        const sneakerDoc = actionData.actor?.document || actionData.actor;
        let avsOverride = null;
        if (sneakerDoc?.getFlag) {
          const overrideFlag = sneakerDoc.getFlag(
            'pf2e-visioner',
            `avs-override-from-${observerId}`,
          );
          if (overrideFlag) {
            avsOverride = overrideToDisplayVisibility(overrideFlag);
          }
        }
        if (avsOverride) return avsOverride;
        // 2. Manual state (getVisibilityBetween)
        let manualState = null;
        try {
          manualState = getVisibilityBetween(subject, actionData.actor);
        } catch { }
        if (manualState) return manualState;
        // 3. AVS calculation (position tracker)
        return positionTransition?.startPosition?.avsVisibility || current;
      })(),
      oldVisibilityLabel:
        getVisibilityStateLabelKey(positionTransition?.startPosition?.avsVisibility || current, {
          manual: true,
        }) ||
        positionTransition?.startPosition?.avsVisibility ||
        current,
      newVisibility,
      changed: newVisibility !== current,
      autoCover: result.autoCover, // Add auto-cover information
      // Add adjusted total for override display (what's used for calculations)
      originalRollTotal: total,
      // Add base roll total for triple-bracket display
      baseRollTotal: baseRollTotal,
      // Enhanced position tracking data
      positionTransition,
      startPosition: positionTransition?.startPosition,
      endPosition: positionTransition?.endPosition,
      positionQualifies,
      // Enhanced outcome analysis
      dcAdjustment: finalDC !== dc ? finalDC - dc : 0,
      outcomeChanged: finalOutcome !== outcome,
      enhancedAnalysis: {
        hasPositionData: !!positionTransition,
      },
      // Enhanced outcome determination data
      enhancedOutcomeData: enhancedOutcome
        ? {
          outcomeReason: enhancedOutcome.outcomeReason,
          avsDecisionUsed: enhancedOutcome.avsDecisionUsed,
          positionQualifications: enhancedOutcome.positionQualifications,
          rollData: enhancedOutcome.rollData,
          rollEnhanced: enhancedOutcome.rollEnhanced,
          explanation: enhancedOutcome.explanation || null,
        }
        : null,
      // Feats adjustment notes
      featNotes,
      // Sneak Adept feat application flag
      sneakAdeptApplied,
    };

    return outcomeData;
  }

  /**
   * Terrain Stalker free Sneak check
   * Criteria: actor has TS selected terrain active, is Undetected by all non-allies,
   * movement <= 5 ft, and path stays >= 10 ft from enemies.
   */
  async _checkTerrainStalkerFreeSneak(actionData, subject) {
    try {
      const { TerrainStalkerService } = await import('../feats/TerrainStalker.js');
      return await TerrainStalkerService.checkFreeSneak(actionData, subject, {
        discoverSubjects: (ad) => this.discoverSubjects(ad),
        sneakCore: this.sneakCore,
        sessionId: this._currentSessionId,
        getSneakingToken: (ad) => this._getSneakingToken(ad),
      });
    } catch (e) {
      return {
        applies: false,
        reason: `Error during free-sneak check: ${e?.message || 'unknown'}`,
      };
    }
  }
  outcomeToChange(actionData, outcome) {
    const observer = outcome.token || outcome.target;
    const change = {
      observer,
      target: actionData.actorToken || actionData.actor,
      newVisibility: outcome.newVisibility,
      oldVisibility: outcome.oldVisibility,
      timedOverride: outcome.timedOverride,
    };

    return change;
  }

  /**
   * Indicates that SneakActionHandler supports dual system application
   * @returns {boolean} True - sneak actions support dual system
   */
  supportsDualSystemApplication() {
    return true;
  }

  /**
   * Converts sneak outcomes to sneak results format for dual system application
   * @param {Array<Object>} outcomes - Sneak outcomes
   * @param {Object} actionData - Action data
   * @returns {Array<Object>} Sneak results in dual system format
   */
  convertOutcomesToSneakResults(outcomes, actionData) {
    return outcomes.map((outcome) => ({
      token: outcome.token,
      actor: actionData.actor,
      newVisibility: outcome.newVisibility,
      oldVisibility: outcome.oldVisibility || outcome.currentVisibility,
      positionTransition: outcome.positionTransition,
      autoCover: outcome.autoCover,
      overrideState: outcome.overrideState,
      // Enhanced sneak-specific data
      startPosition: outcome.startPosition,
      endPosition: outcome.endPosition,
      dcAdjustment: outcome.dcAdjustment,
      outcomeChanged: outcome.outcomeChanged,
      enhancedAnalysis: outcome.enhancedAnalysis,
    }));
  }

  /**
   * Apply sneak results using SneakCore
   * @param {Object} actionData - Action data
   * @param {jQuery} button - Apply button
   * @returns {Promise<number>} Number of changes applied
   */
  async apply(actionData, button) {
    try {
      if (!this._currentSessionId) {
        console.warn('PF2E Visioner | No active sneak session for apply');
        return 0;
      }

      // Get processed outcomes from cache or process them
      const outcomes = (await this.getCachedOutcomes(actionData)) || [];

      // Apply using SneakCore
      const result = await this.sneakCore.applyResults(this._currentSessionId, outcomes);

      if (result.success) {
        this.updateButtonToRevert(button);
        // Clear sneak-active flag after successful application
        await this._clearSneakFlag(actionData);
        notify.info('Sneak changes applied successfully');
        return outcomes.length;
      } else {
        notify.error(`Failed to apply sneak changes: ${result.errors.join('; ')}`);
        return 0;
      }
    } catch (error) {
      console.error('PF2E Visioner | Error applying sneak results:', error);
      notify.error('Failed to apply sneak changes');
      return 0;
    }
  }

  /**
   * Revert sneak results using SneakCore
   * @param {Object} actionData - Action data
   * @param {jQuery} button - Revert button
   */
  async revert(actionData, button) {
    try {
      if (this._currentSessionId) {
        const success = await this.sneakCore.revertResults(this._currentSessionId);
        if (success) {
          this.clearCache(actionData);
          this.updateButtonToApply(button);
          notify.info('Sneak changes reverted successfully');
          return;
        }
      }
      await super.revert(actionData, button);
    } catch (error) {
      console.error('PF2E Visioner | Enhanced revert failed:', error);
      await super.revert(actionData, button);
    }
  }

  buildCacheEntryFromChange(change) {
    return {
      observerId: change?.observer?.id ?? null,
      oldVisibility: change?.oldVisibility ?? null,
    };
  }
  entriesToRevertChanges(entries, actionData) {
    return entries
      .map((e) => ({
        observer: this.getTokenById(e.observerId),
        target: actionData.actorToken || actionData.actor,
        newVisibility: e.oldVisibility,
      }))
      .filter((c) => c.observer && c.target && c.newVisibility);
  }

  async fallbackRevertChanges(actionData) {
    const subjects = await this.discoverSubjects(actionData);
    const outcomes = [];
    for (const subject of subjects) outcomes.push(await this.analyzeOutcome(actionData, subject));
    const filtered = outcomes.filter(Boolean).filter((o) => o.changed);
    return filtered.map((o) => ({
      observer: o.token || o.target,
      target: actionData.actorToken || actionData.actor,
      newVisibility: o.oldVisibility || o.currentVisibility,
    }));
  }

  /**
   * Gets position transition data for a specific subject token
   * @param {Token} subject - The observer token
   * @returns {PositionTransition|null} Position transition data or null if not available
   * @private
   */
  async _getPositionTransitionForSubject(subject) {
    if (!this._currentSessionId || !subject?.document?.id) {
      return null;
    }

    // Get position transition from SneakCore
    const sneakState = this.sneakCore.getSneakState(this._currentSessionId);
    const targetId = subject.document.id;
    return sneakState?.transitions?.get(targetId) || null;
  }

  /**
   * Clear the sneak-active flag from the sneaking token
   * @param {Object} actionData - The action data containing the sneaking token
   */
  async _clearSneakFlag(actionData) {
    await clearSneakFlag(actionData);
  }

  // Removed incorrect Sneaky feat effect application
  // The correct feat mechanics are now handled by TurnSneakTracker.js

  // Removed incorrect Sneaky feat effect methods
  // The correct feat mechanics (turn-based consecutive sneaks) are handled by TurnSneakTracker.js

  // All Sneaky feat helper methods removed - they implemented incorrect mechanics
  // The correct feat mechanics (turn-based consecutive sneaks with deferred end-position checks)
  // are handled by the TurnSneakTracker.js service

}
