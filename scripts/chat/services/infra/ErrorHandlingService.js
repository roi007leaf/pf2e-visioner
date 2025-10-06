/**
 * Enhanced Error Handling Service for Sneak AVS Integration
 * Provides comprehensive error handling, fallback mechanisms, and user notifications
 * for system failures in the enhanced sneak workflow.
 */

import { MODULE_ID } from '../../../constants.js';
import { log, notify } from './notifications.js';

/**
 * Error severity levels
 */
export const ERROR_SEVERITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
};

/**
 * System types for error tracking
 */
export const SYSTEM_TYPES = {
  AVS: 'avs',
  AUTO_COVER: 'auto-cover',
  POSITION_TRACKER: 'position-tracker',
  SNEAK_ACTION: 'sneak-action',
  DIALOG: 'dialog',
};

/**
 * Fallback strategies
 */
export const FALLBACK_STRATEGIES = {
  GRACEFUL_DEGRADATION: 'graceful-degradation',
  MANUAL_OVERRIDE: 'manual-override',
  BASIC_CALCULATION: 'basic-calculation',
  SKIP_FEATURE: 'skip-feature',
};

export class ErrorHandlingService {
  constructor() {
    this._errorHistory = new Map();
    this._systemStatus = new Map();
    this._fallbackStrategies = new Map();
    this._recoveryAttempts = new Map();
    this._userNotificationSettings = {
      showFallbackNotifications: true,
      showRecoveryNotifications: true,
      maxNotificationsPerSession: 5,
    };
    this._notificationCount = 0;

    this._initializeFallbackStrategies();
  }

  /**
   * Handles system errors with appropriate fallback mechanisms
   * @param {string} systemType - Type of system that failed
   * @param {Error} error - The error that occurred
   * @param {Object} context - Additional context for error handling
   * @returns {Object} Error handling result with fallback data
   */
  async handleSystemError(systemType, error, context = {}) {
    const errorId = this._generateErrorId(systemType, error);
    const severity = this._determineSeverity(systemType, error, context);

    // Log the error
    this._logError(systemType, error, severity, context);

    // Update system status
    this._updateSystemStatus(systemType, false, error);

    // Track error history
    this._trackError(errorId, systemType, error, severity, context);

    // Determine and apply fallback strategy
    const fallbackResult = await this._applyFallbackStrategy(systemType, error, context);

    // Notify user if appropriate
    this._notifyUserOfError(systemType, error, severity, fallbackResult);

    // Attempt recovery if possible
    this._scheduleRecoveryAttempt(systemType, error, context);

    return {
      errorId,
      severity,
      fallbackApplied: fallbackResult.success,
      fallbackData: fallbackResult.data,
      fallbackStrategy: fallbackResult.strategy,
      canRecover: fallbackResult.canRecover,
      userNotified: fallbackResult.userNotified,
    };
  }

  /**
   * Implements graceful degradation when AVS system is unavailable
   * @param {Object} context - Context including observer and target tokens
   * @returns {Object} Fallback visibility data
   */
  async handleAVSSystemFailure(context) {
    const { observer, target, options = {} } = context;

    log.warn('AVS system unavailable, applying graceful degradation');

    try {
      // Fallback 1: Use basic line of sight calculation
      if (observer && target && canvas?.walls) {
        const ray = new foundry.canvas.geometry.Ray(observer.center, target.center);

        // FoundryVTT v13+ API: Use testCollision or similar method
        let hasLineOfSight = true;
        try {
          if (typeof canvas.walls.testCollision === 'function') {
            hasLineOfSight = !canvas.walls.testCollision(ray.A, ray.B, { type: 'sight' });
          } else if (typeof canvas.walls.checkCollision === 'function') {
            // Fallback for older versions
            hasLineOfSight = !canvas.walls.checkCollision(ray, { type: 'sight' });
          }
        } catch (collisionError) {
          console.warn('PF2E Visioner | Wall collision detection failed, defaulting to visible', collisionError);
          hasLineOfSight = true;
        }

        const fallbackVisibility = hasLineOfSight ? 'observed' : 'concealed';

        return {
          success: true,
          data: fallbackVisibility,
          strategy: FALLBACK_STRATEGIES.BASIC_CALCULATION,
          source: 'line-of-sight-fallback',
          canRecover: true,
          explanation: 'Using basic line of sight calculation due to AVS system failure',
        };
      }

      // Fallback 2: Use lighting-based estimation with LightingCalculator
      if (observer && target) {
        let fallbackVisibility = 'observed'; // Default fallback

        try {
          const { LightingCalculator } = await import(
            '../../../visibility/auto-visibility/LightingCalculator.js'
          );
          const lightingCalculator = LightingCalculator.getInstance();

          const targetPosition = {
            x: target.center.x,
            y: target.center.y,
            elevation: target.document.elevation || 0,
          };

          const lightLevelInfo = lightingCalculator.getLightLevelAt(targetPosition, target);
          fallbackVisibility = lightLevelInfo.level === 'darkness' ? 'concealed' : 'observed';
        } catch (importError) {
          // Use conservative fallback if LightingCalculator is not available
          fallbackVisibility = 'observed';
        }

        return {
          success: true,
          data: fallbackVisibility,
          strategy: FALLBACK_STRATEGIES.BASIC_CALCULATION,
          source: 'lighting-fallback',
          canRecover: true,
          explanation: 'Using lighting-based visibility estimation due to AVS system failure',
        };
      }

      // Ultimate fallback: Conservative assumption
      return {
        success: true,
        data: 'observed',
        strategy: FALLBACK_STRATEGIES.GRACEFUL_DEGRADATION,
        source: 'conservative-fallback',
        canRecover: true,
        explanation: 'Using conservative visibility assumption due to complete AVS system failure',
      };
    } catch (fallbackError) {
      log.error('AVS fallback mechanisms also failed:', fallbackError);

      return {
        success: false,
        data: 'observed',
        strategy: FALLBACK_STRATEGIES.GRACEFUL_DEGRADATION,
        source: 'ultimate-fallback',
        canRecover: false,
        explanation: 'All AVS fallback mechanisms failed, using ultimate conservative fallback',
      };
    }
  }

  /**
   * Implements fallback processing when Auto-Cover system fails
   * @param {Object} context - Context including observer and target tokens
   * @returns {Object} Fallback cover data
   */
  async handleAutoCoverSystemFailure(context) {
    const { observer, target, options = {} } = context;

    log.warn('Auto-Cover system unavailable, applying fallback processing');

    try {
      // Fallback 1: Use basic wall collision detection
      if (observer && target && canvas?.walls) {
        const ray = new foundry.canvas.geometry.Ray(observer.center, target.center);

        // FoundryVTT v13+ API: Use testCollision or similar method
        let hasWallCollision = false;
        try {
          if (typeof canvas.walls.testCollision === 'function') {
            hasWallCollision = canvas.walls.testCollision(ray.A, ray.B, { type: 'move' });
          } else if (typeof canvas.walls.checkCollision === 'function') {
            // Fallback for older versions
            hasWallCollision = canvas.walls.checkCollision(ray, { type: 'move' });
          }
        } catch (collisionError) {
          console.warn('PF2E Visioner | Wall collision detection failed, defaulting to no collision', collisionError);
          hasWallCollision = false;
        }

        const fallbackCover = hasWallCollision ? 'standard' : 'none';
        const fallbackBonus = hasWallCollision ? 2 : 0;

        return {
          success: true,
          data: { state: fallbackCover, bonus: fallbackBonus },
          strategy: FALLBACK_STRATEGIES.BASIC_CALCULATION,
          source: 'wall-collision-fallback',
          canRecover: true,
          explanation: 'Using basic wall collision detection due to Auto-Cover system failure',
        };
      }

      // Fallback 2: Check for manual cover overrides
      const manualCover = await this._getManualCoverOverride(observer, target);
      if (manualCover && manualCover !== 'none') {
        const bonus = this._calculateBasicCoverBonus(manualCover);

        return {
          success: true,
          data: { state: manualCover, bonus },
          strategy: FALLBACK_STRATEGIES.MANUAL_OVERRIDE,
          source: 'manual-override-fallback',
          canRecover: true,
          explanation: 'Using manual cover override due to Auto-Cover system failure',
        };
      }

      // Ultimate fallback: No cover
      return {
        success: true,
        data: { state: 'none', bonus: 0 },
        strategy: FALLBACK_STRATEGIES.GRACEFUL_DEGRADATION,
        source: 'no-cover-fallback',
        canRecover: true,
        explanation: 'Assuming no cover due to Auto-Cover system failure',
      };
    } catch (fallbackError) {
      log.error('Auto-Cover fallback mechanisms also failed:', fallbackError);

      return {
        success: false,
        data: { state: 'none', bonus: 0 },
        strategy: FALLBACK_STRATEGIES.GRACEFUL_DEGRADATION,
        source: 'ultimate-fallback',
        canRecover: false,
        explanation: 'All Auto-Cover fallback mechanisms failed, assuming no cover',
      };
    }
  }

  /**
   * Implements recovery mechanisms for partial system failures
   * @param {string} systemType - Type of system to recover
   * @param {Object} context - Recovery context
   * @returns {Promise<boolean>} Whether recovery was successful
   */
  async attemptSystemRecovery(systemType, context = {}) {
    try {
      log.warn(`Attempting recovery for ${systemType} system`);

      let recoveryResult = false;

      switch (systemType) {
        case SYSTEM_TYPES.AVS:
          recoveryResult = await this._recoverAVSSystem(context);
          break;

        case SYSTEM_TYPES.AUTO_COVER:
          recoveryResult = await this._recoverAutoCoverSystem(context);
          break;

        case SYSTEM_TYPES.POSITION_TRACKER:
          recoveryResult = await this._recoverPositionTracker(context);
          break;

        case SYSTEM_TYPES.SNEAK_ACTION:
          recoveryResult = await this._recoverSneakAction(context);
          break;

        case SYSTEM_TYPES.DIALOG:
          recoveryResult = await this._recoverDialog(context);
          break;

        default:
          log.warn(`Unknown system type for recovery: ${systemType}`);
          return false;
      }

      if (recoveryResult) {
        this._updateSystemStatus(systemType, true);
        log.warn(`Successfully recovered ${systemType} system`);
      } else {
        log.warn(`Failed to recover ${systemType} system`);
      }

      return recoveryResult;
    } catch (error) {
      log.error(`Recovery attempt failed for ${systemType}:`, error);
      return false;
    }
  }

  /**
   * Gets current system status for all tracked systems
   * @returns {Object} System status information
   */
  getSystemStatus() {
    const status = {};

    for (const [systemType, systemInfo] of this._systemStatus) {
      status[systemType] = {
        available: systemInfo.available,
        lastError: systemInfo.lastError,
        lastCheck: systemInfo.lastCheck,
        recoveryAttempts: this._recoveryAttempts.get(systemType) || 0,
        fallbackActive: systemInfo.fallbackActive || false,
      };
    }

    return status;
  }

  /**
   * Gets error history for debugging and analysis
   * @param {string} systemType - Optional system type filter
   * @returns {Array} Error history entries
   */
  getErrorHistory(systemType = null) {
    const history = [];

    for (const [errorId, errorInfo] of this._errorHistory) {
      if (!systemType || errorInfo.systemType === systemType) {
        history.push({
          errorId,
          ...errorInfo,
          timestamp: new Date(errorInfo.timestamp).toISOString(),
        });
      }
    }

    return history.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Configures user notification settings
   * @param {Object} settings - Notification settings
   */
  configureNotifications(settings) {
    this._userNotificationSettings = {
      ...this._userNotificationSettings,
      ...settings,
    };
  }

  // Private methods for internal error handling logic

  /**
   * Initializes fallback strategies for different system types
   * @private
   */
  _initializeFallbackStrategies() {
    this._fallbackStrategies.set(SYSTEM_TYPES.AVS, [
      FALLBACK_STRATEGIES.BASIC_CALCULATION,
      FALLBACK_STRATEGIES.GRACEFUL_DEGRADATION,
    ]);

    this._fallbackStrategies.set(SYSTEM_TYPES.AUTO_COVER, [
      FALLBACK_STRATEGIES.BASIC_CALCULATION,
      FALLBACK_STRATEGIES.MANUAL_OVERRIDE,
      FALLBACK_STRATEGIES.GRACEFUL_DEGRADATION,
    ]);

    this._fallbackStrategies.set(SYSTEM_TYPES.POSITION_TRACKER, [
      FALLBACK_STRATEGIES.BASIC_CALCULATION,
      FALLBACK_STRATEGIES.SKIP_FEATURE,
    ]);

    this._fallbackStrategies.set(SYSTEM_TYPES.SNEAK_ACTION, [
      FALLBACK_STRATEGIES.GRACEFUL_DEGRADATION,
      FALLBACK_STRATEGIES.MANUAL_OVERRIDE,
    ]);

    this._fallbackStrategies.set(SYSTEM_TYPES.DIALOG, [
      FALLBACK_STRATEGIES.GRACEFUL_DEGRADATION,
      FALLBACK_STRATEGIES.SKIP_FEATURE,
    ]);
  }

  /**
   * Generates unique error ID
   * @param {string} systemType - System type
   * @param {Error} error - Error object
   * @returns {string} Unique error ID
   * @private
   */
  _generateErrorId(systemType, error) {
    const timestamp = Date.now();
    const errorHash = this._hashString(error.message + error.stack);
    return `${systemType}-${timestamp}-${errorHash}`;
  }

  /**
   * Determines error severity based on system type and error
   * @param {string} systemType - System type
   * @param {Error} error - Error object
   * @param {Object} context - Additional context
   * @returns {string} Error severity level
   * @private
   */
  _determineSeverity(systemType, error, context) {
    // Critical errors that break core functionality
    if (systemType === SYSTEM_TYPES.SNEAK_ACTION && error.message.includes('core')) {
      return ERROR_SEVERITY.CRITICAL;
    }

    // High severity for system unavailability
    if (error.message.includes('unavailable') || error.message.includes('not found')) {
      return ERROR_SEVERITY.HIGH;
    }

    // Medium severity for calculation failures
    if (error.message.includes('calculation') || error.message.includes('detection')) {
      return ERROR_SEVERITY.MEDIUM;
    }

    // Low severity for minor issues
    return ERROR_SEVERITY.LOW;
  }

  /**
   * Logs error with appropriate level
   * @param {string} systemType - System type
   * @param {Error} error - Error object
   * @param {string} severity - Error severity
   * @param {Object} context - Additional context
   * @private
   */
  _logError(systemType, error, severity, context) {
    const logMessage = `${systemType} system error (${severity}): ${error.message}`;

    switch (severity) {
      case ERROR_SEVERITY.CRITICAL:
        log.error(logMessage, error, context);
        break;
      case ERROR_SEVERITY.HIGH:
        log.error(logMessage, error);
        break;
      case ERROR_SEVERITY.MEDIUM:
        log.warn(logMessage, error);
        break;
      default:
        log.warn(logMessage);
    }
  }

  /**
   * Updates system status tracking
   * @param {string} systemType - System type
   * @param {boolean} available - Whether system is available
   * @param {Error} error - Optional error object
   * @private
   */
  _updateSystemStatus(systemType, available, error = null) {
    this._systemStatus.set(systemType, {
      available,
      lastError: error?.message || null,
      lastCheck: Date.now(),
      fallbackActive: !available,
    });
  }

  /**
   * Tracks error in history
   * @param {string} errorId - Error ID
   * @param {string} systemType - System type
   * @param {Error} error - Error object
   * @param {string} severity - Error severity
   * @param {Object} context - Additional context
   * @private
   */
  _trackError(errorId, systemType, error, severity, context) {
    this._errorHistory.set(errorId, {
      systemType,
      message: error.message,
      stack: error.stack,
      severity,
      context,
      timestamp: Date.now(),
    });

    // Limit history size to prevent memory issues
    if (this._errorHistory.size > 100) {
      const oldestKey = this._errorHistory.keys().next().value;
      this._errorHistory.delete(oldestKey);
    }
  }

  /**
   * Applies appropriate fallback strategy
   * @param {string} systemType - System type
   * @param {Error} error - Error object
   * @param {Object} context - Additional context
   * @returns {Promise<Object>} Fallback result
   * @private
   */
  async _applyFallbackStrategy(systemType, error, context) {
    try {
      switch (systemType) {
        case SYSTEM_TYPES.AVS:
          return await this.handleAVSSystemFailure(context);

        case SYSTEM_TYPES.AUTO_COVER:
          return await this.handleAutoCoverSystemFailure(context);

        default:
          return {
            success: false,
            data: null,
            strategy: FALLBACK_STRATEGIES.SKIP_FEATURE,
            canRecover: true,
            explanation: `No specific fallback strategy for ${systemType}`,
          };
      }
    } catch (fallbackError) {
      log.error(`Fallback strategy failed for ${systemType}:`, fallbackError);
      return {
        success: false,
        data: null,
        strategy: FALLBACK_STRATEGIES.SKIP_FEATURE,
        canRecover: false,
        explanation: 'Fallback strategy execution failed',
      };
    }
  }

  /**
   * Notifies user of error and fallback if appropriate
   * @param {string} systemType - System type
   * @param {Error} error - Error object
   * @param {string} severity - Error severity
   * @param {Object} fallbackResult - Fallback result
   * @private
   */
  _notifyUserOfError(systemType, error, severity, fallbackResult) {
    // Check if we should show notifications
    if (!this._userNotificationSettings.showFallbackNotifications) return;
    if (this._notificationCount >= this._userNotificationSettings.maxNotificationsPerSession)
      return;

    // Only notify for medium+ severity errors
    if (severity === ERROR_SEVERITY.LOW) return;

    let message = '';
    let notificationType = 'warn';

    if (fallbackResult.success) {
      message = `${systemType} system temporarily unavailable. Using fallback: ${fallbackResult.explanation}`;
      notificationType = 'info';
    } else {
      message = `${systemType} system failed and fallback unsuccessful. Some features may not work correctly.`;
      notificationType = 'error';
    }

    // Show notification
    notify[notificationType](message);
    this._notificationCount++;

    fallbackResult.userNotified = true;
  }

  /**
   * Schedules recovery attempt for failed system
   * @param {string} systemType - System type
   * @param {Error} error - Error object
   * @param {Object} context - Additional context
   * @private
   */
  _scheduleRecoveryAttempt(systemType, error, context) {
    const currentAttempts = this._recoveryAttempts.get(systemType) || 0;

    // Limit recovery attempts to prevent infinite loops
    if (currentAttempts >= 3) {
      log.warn(`Maximum recovery attempts reached for ${systemType}`);
      return;
    }

    // Schedule recovery with exponential backoff
    const delay = Math.pow(2, currentAttempts) * 1000; // 1s, 2s, 4s

    setTimeout(async () => {
      this._recoveryAttempts.set(systemType, currentAttempts + 1);
      await this.attemptSystemRecovery(systemType, context);
    }, delay);
  }

  // Recovery methods for specific systems

  /**
   * Attempts to recover AVS system
   * @param {Object} context - Recovery context
   * @returns {Promise<boolean>} Whether recovery was successful
   * @private
   */
  async _recoverAVSSystem(context) {
    try {
      // Check if AVS is enabled in settings
      const avsEnabled = game.settings.get(MODULE_ID, 'autoVisibilityEnabled');
      if (!avsEnabled) return false;

      // Try to access canvas and basic AVS functionality
      if (!canvas?.tokens) return false;

      // Test basic visibility calculation
      const testTokens = canvas.tokens.placeables.slice(0, 2);
      if (testTokens.length >= 2) {
        const { getVisibilityBetween } = await import('../../../utils.js');
        await getVisibilityBetween(testTokens[0], testTokens[1]);
      }

      return true;
    } catch (error) {
      log.warn('AVS system recovery failed:', error);
      return false;
    }
  }

  /**
   * Attempts to recover Auto-Cover system
   * @param {Object} context - Recovery context
   * @returns {Promise<boolean>} Whether recovery was successful
   * @private
   */
  async _recoverAutoCoverSystem(context) {
    try {
      // Check if Auto-Cover is enabled in settings
      const autoCoverEnabled = game.settings.get(MODULE_ID, 'autoCover');
      if (!autoCoverEnabled) return false;

      // Try to import and initialize Auto-Cover system
      const autoCoverModule = await import('../../../cover/auto-cover/AutoCoverSystem.js');
      const autoCoverSystem = autoCoverModule.default;

      if (!autoCoverSystem?.isEnabled()) return false;

      // Test basic cover detection
      const testTokens = canvas.tokens.placeables.slice(0, 2);
      if (testTokens.length >= 2) {
        await autoCoverSystem.detectCoverBetweenTokens(testTokens[0], testTokens[1]);
      }

      return true;
    } catch (error) {
      log.warn('Auto-Cover system recovery failed:', error);
      return false;
    }
  }

  /**
   * Attempts to recover Position Tracker
   * @param {Object} context - Recovery context
   * @returns {Promise<boolean>} Whether recovery was successful
   * @private
   */
  async _recoverPositionTracker(context) {
    try {
      // Try to re-initialize position tracker
      const positionTrackerModule = await import('../position/PositionTracker.js');
      const positionTracker = positionTrackerModule.default;

      // Test basic functionality
      const testTokens = canvas.tokens.placeables.slice(0, 2);
      if (testTokens.length >= 2) {
        await positionTracker.captureStartPositions(testTokens[0], [testTokens[1]]);
      }

      return true;
    } catch (error) {
      log.warn('Position Tracker recovery failed:', error);
      return false;
    }
  }

  /**
   * Attempts to recover Sneak Action system
   * @param {Object} context - Recovery context
   * @returns {Promise<boolean>} Whether recovery was successful
   * @private
   */
  async _recoverSneakAction(context) {
    try {
      // Basic recovery - check if core sneak functionality is available
      return typeof canvas !== 'undefined' && canvas.tokens?.placeables?.length > 0;
    } catch (error) {
      log.warn('Sneak Action recovery failed:', error);
      return false;
    }
  }

  /**
   * Attempts to recover Dialog system
   * @param {Object} context - Recovery context
   * @returns {Promise<boolean>} Whether recovery was successful
   * @private
   */
  async _recoverDialog(context) {
    try {
      // Basic recovery - check if dialog system is available
      return typeof Dialog !== 'undefined' && typeof ui !== 'undefined';
    } catch (error) {
      log.warn('Dialog system recovery failed:', error);
      return false;
    }
  }

  /**
   * Gets manual cover override from token flags
   * @param {Token} observer - Observer token
   * @param {Token} target - Target token
   * @returns {Promise<string>} Manual cover state
   * @private
   */
  async _getManualCoverOverride(observer, target) {
    try {
      const { getCoverBetween } = await import('../../../utils.js');
      return getCoverBetween(observer, target) || 'none';
    } catch (error) {
      return 'none';
    }
  }

  /**
   * Calculates basic cover bonus for fallback
   * @param {string} coverState - Cover state
   * @returns {number} Cover bonus
   * @private
   */
  _calculateBasicCoverBonus(coverState) {
    const bonusMap = {
      none: 0,
      lesser: 1,
      standard: 2,
      greater: 4,
    };
    return bonusMap[coverState] || 0;
  }

  /**
   * Simple string hashing for error IDs
   * @param {string} str - String to hash
   * @returns {string} Hash string
   * @private
   */
  _hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }
}

// Export singleton instance
export default new ErrorHandlingService();
