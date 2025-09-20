/**
 * Enhanced Multi-Target Processor for Sneak Actions
 * Provides optimized batch processing for position-aware sneak results
 * with v13 performance optimizations, caching, and progress indicators.
 */

import { VISIBILITY_STATES, COVER_STATES } from '../../../constants.js';
import sneakPositionTracker from '../position/SneakPositionTracker.js';
import dualSystemIntegration from '../position/DualSystemIntegration.js';

/**
 * Cache entry for position calculations
 * @typedef {Object} PositionCacheEntry
 * @property {Map<string, PositionState>} positions - Position states by target ID
 * @property {number} timestamp - When this cache entry was created
 * @property {string} sneakingTokenId - ID of the sneaking token
 * @property {Array<string>} targetIds - IDs of target tokens
 * @property {string} cacheKey - Unique cache key for this entry
 */

/**
 * Progress tracking data for multi-target operations
 * @typedef {Object} ProgressTracker
 * @property {number} total - Total number of targets to process
 * @property {number} completed - Number of targets completed
 * @property {number} failed - Number of targets that failed processing
 * @property {string} currentPhase - Current processing phase
 * @property {Array<string>} phases - All processing phases
 * @property {number} startTime - When processing started
 * @property {Function} updateCallback - Callback for progress updates
 */

export class EnhancedMultiTargetProcessor {
  constructor() {
    this._positionCache = new Map();
    this._cacheTimeout = 30000; // 30 seconds cache timeout
    this._maxCacheSize = 100; // Maximum cache entries
    this._batchSize = 10; // Process targets in batches of 10
    this._progressCallbacks = new Map();
    
    // Performance optimization flags
    this._useParallelProcessing = true;
    this._enableCaching = true;
    this._enableProgressTracking = true;
    
    // Initialize cleanup timer
    this._setupCacheCleanup();
  }

  /**
   * Processes multiple targets with enhanced position tracking and performance optimizations
   * @param {Token} sneakingToken - The token performing the sneak
   * @param {Array<Token>} targets - Array of target observer tokens
   * @param {Object} actionData - Action data including roll information
   * @param {Object} options - Processing options
   * @returns {Promise<Array<Object>>} Array of enhanced outcomes with position data
   */
  async processMultipleTargets(sneakingToken, targets, actionData, options = {}) {
    if (!sneakingToken || !Array.isArray(targets) || targets.length === 0) {
      console.warn('PF2E Visioner | Invalid parameters for multi-target processing');
      return [];
    }

    const startTime = Date.now();
    const progressId = this._generateProgressId(sneakingToken.id, targets.length);
    
    // Initialize progress tracking
    const progressTracker = this._initializeProgressTracker(
      targets.length, 
      progressId, 
      options.progressCallback
    );

    try {
      // Phase 1: Batch position capture with caching
      progressTracker.currentPhase = 'position-capture';
      await this._updateProgress(progressTracker, 0, 'Capturing position states...');
      
      const positionStates = await this._batchCapturePositions(
        sneakingToken, 
        targets, 
        progressTracker
      );

      // Phase 2: Batch outcome analysis
      progressTracker.currentPhase = 'outcome-analysis';
      await this._updateProgress(progressTracker, 25, 'Analyzing outcomes...');
      
      const outcomes = await this._batchAnalyzeOutcomes(
        sneakingToken,
        targets,
        actionData,
        positionStates,
        progressTracker
      );

      // Phase 3: Enhanced processing with position integration
      progressTracker.currentPhase = 'position-integration';
      await this._updateProgress(progressTracker, 75, 'Integrating position data...');
      
      const enhancedOutcomes = await this._enhanceOutcomesWithPositions(
        outcomes,
        positionStates,
        progressTracker
      );

      // Phase 4: Final optimization and caching
      progressTracker.currentPhase = 'finalization';
      await this._updateProgress(progressTracker, 95, 'Finalizing results...');
      
      await this._cacheResults(sneakingToken, targets, enhancedOutcomes);
      
      await this._updateProgress(progressTracker, 100, 'Complete');
            
      return enhancedOutcomes;
      
    } catch (error) {
      console.error('PF2E Visioner | Multi-target processing failed:', error);
      await this._updateProgress(progressTracker, -1, `Error: ${error.message}`);
      
      // Return fallback results
      return await this._generateFallbackOutcomes(sneakingToken, targets, actionData);
    } finally {
      this._cleanupProgress(progressId);
    }
  }

  /**
   * Batch captures position states with v13 performance optimizations
   * @param {Token} sneakingToken - The sneaking token
   * @param {Array<Token>} targets - Array of target tokens
   * @param {ProgressTracker} progressTracker - Progress tracking object
   * @returns {Promise<Map<string, PositionState>>} Position states by target ID
   * @private
   */
  async _batchCapturePositions(sneakingToken, targets, progressTracker) {
    // Check cache first if enabled
    if (this._enableCaching) {
      const cacheKey = this._generateCacheKey(sneakingToken, targets);
      const cached = this._getFromCache(cacheKey);
      if (cached) {
        await this._updateProgress(progressTracker, 25, 'Using cached positions');
        return cached.positions;
      }
    }

    // Use optimized batch processing from position tracker
    const positionStates = new Map();
    
    if (this._useParallelProcessing && targets.length > this._batchSize) {
      // Process in parallel batches for large target counts
      const batches = this._createBatches(targets, this._batchSize);
      let completedTargets = 0;
      
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const batchPromises = batch.map(async (target) => {
          try {
            const positions = await sneakPositionTracker.captureBatchPositions(
              sneakingToken, 
              [target]
            );
            return { targetId: target.document.id, positions };
          } catch (error) {
            console.warn(`PF2E Visioner | Failed to capture position for ${target.document.id}:`, error);
            return { targetId: target.document.id, positions: new Map() };
          }
        });
        
        const batchResults = await Promise.all(batchPromises);
        
        // Merge batch results
        for (const result of batchResults) {
          if (result.positions.size > 0) {
            for (const [id, position] of result.positions) {
              positionStates.set(id, position);
            }
          }
          completedTargets++;
        }
        
        // Update progress
        const progress = Math.floor((completedTargets / targets.length) * 25);
        await this._updateProgress(
          progressTracker, 
          progress, 
          `Captured positions: ${completedTargets}/${targets.length}`
        );
      }
    } else {
      // Use single batch call for smaller target counts
      const batchPositions = await sneakPositionTracker.captureBatchPositions(
        sneakingToken, 
        targets
      );
      
      for (const [targetId, position] of batchPositions) {
        positionStates.set(targetId, position);
      }
      
      await this._updateProgress(progressTracker, 25, `Captured ${positionStates.size} positions`);
    }

    // Cache results if enabled
    if (this._enableCaching) {
      const cacheKey = this._generateCacheKey(sneakingToken, targets);
      this._addToCache(cacheKey, {
        positions: positionStates,
        timestamp: Date.now(),
        sneakingTokenId: sneakingToken.document.id,
        targetIds: targets.map(t => t.document.id),
        cacheKey
      });
    }

    return positionStates;
  }

  /**
   * Batch analyzes outcomes with v13 token collection APIs
   * @param {Token} sneakingToken - The sneaking token
   * @param {Array<Token>} targets - Array of target tokens
   * @param {Object} actionData - Action data
   * @param {Map<string, PositionState>} positionStates - Position states
   * @param {ProgressTracker} progressTracker - Progress tracking object
   * @returns {Promise<Array<Object>>} Array of outcome objects
   * @private
   */
  async _batchAnalyzeOutcomes(sneakingToken, targets, actionData, positionStates, progressTracker) {
    const outcomes = [];
    let completedTargets = 0;
    
    // Import the sneak action handler for outcome analysis
    const { SneakActionHandler } = await import('../actions/sneak-action.js');
    const handler = new SneakActionHandler();
    
    if (this._useParallelProcessing && targets.length > this._batchSize) {
      // Process in parallel batches
      const batches = this._createBatches(targets, this._batchSize);
      
      for (const batch of batches) {
        const batchPromises = batch.map(async (target) => {
          try {
            const outcome = await handler.analyzeOutcome(actionData, target);
            return outcome;
          } catch (error) {
            console.warn(`PF2E Visioner | Failed to analyze outcome for ${target.document.id}:`, error);
            return this._createFallbackOutcome(target, actionData);
          }
        });
        
        const batchResults = await Promise.all(batchPromises);
        outcomes.push(...batchResults);
        
        completedTargets += batch.length;
        const progress = 25 + Math.floor((completedTargets / targets.length) * 50);
        await this._updateProgress(
          progressTracker, 
          progress, 
          `Analyzed outcomes: ${completedTargets}/${targets.length}`
        );
      }
    } else {
      // Sequential processing for smaller counts
      for (const target of targets) {
        try {
          const outcome = await handler.analyzeOutcome(actionData, target);
          outcomes.push(outcome);
        } catch (error) {
          console.warn(`PF2E Visioner | Failed to analyze outcome for ${target.document.id}:`, error);
          outcomes.push(this._createFallbackOutcome(target, actionData));
        }
        
        completedTargets++;
        const progress = 25 + Math.floor((completedTargets / targets.length) * 50);
        await this._updateProgress(
          progressTracker, 
          progress, 
          `Analyzed outcomes: ${completedTargets}/${targets.length}`
        );
      }
    }
    
    return outcomes;
  }

  /**
   * Enhances outcomes with position data and advanced analysis
   * @param {Array<Object>} outcomes - Array of outcome objects
   * @param {Map<string, PositionState>} positionStates - Position states
   * @param {ProgressTracker} progressTracker - Progress tracking object
   * @returns {Promise<Array<Object>>} Enhanced outcomes
   * @private
   */
  async _enhanceOutcomesWithPositions(outcomes, positionStates, progressTracker) {
    const enhancedOutcomes = [];
    let completedOutcomes = 0;
    
    for (const outcome of outcomes) {
      try {
        const targetId = outcome.token?.document?.id || outcome.token?.id;
        const positionState = positionStates.get(targetId);
        
        if (positionState) {
          // Add position-aware enhancements
          const enhanced = {
            ...outcome,
            positionState,
            hasPositionData: true,
            positionQuality: this._assessPositionQuality(positionState),
            stealthPotential: this._assessStealthPotential(positionState),
            riskLevel: this._assessRiskLevel(positionState, outcome.outcome),
            tacticalAdvice: this._generateTacticalAdvice(positionState, outcome),
            // Enhanced DC calculations with position context
            enhancedDC: this._calculateEnhancedDC(outcome.dc, positionState),
            positionBonus: this._calculatePositionBonus(positionState),
            // System integration status
            systemStatus: {
              avsEnabled: positionState.avsEnabled,
              autoCoverEnabled: positionState.autoCoverEnabled,
              hasErrors: positionState.systemErrors.length > 0,
              errorCount: positionState.systemErrors.length
            }
          };
          
          enhancedOutcomes.push(enhanced);
        } else {
          // Add basic enhancement even without position data
          enhancedOutcomes.push({
            ...outcome,
            hasPositionData: false,
            positionQuality: 'unknown',
            stealthPotential: 'unknown',
            riskLevel: 'unknown',
            tacticalAdvice: 'Position data unavailable',
            systemStatus: {
              avsEnabled: false,
              autoCoverEnabled: false,
              hasErrors: true,
              errorCount: 1
            }
          });
        }
        
        completedOutcomes++;
        const progress = 75 + Math.floor((completedOutcomes / outcomes.length) * 20);
        await this._updateProgress(
          progressTracker, 
          progress, 
          `Enhanced outcomes: ${completedOutcomes}/${outcomes.length}`
        );
        
      } catch (error) {
        console.warn('PF2E Visioner | Failed to enhance outcome with position data:', error);
        enhancedOutcomes.push(outcome); // Use original outcome as fallback
        completedOutcomes++;
      }
    }
    
    return enhancedOutcomes;
  }

  /**
   * Generates cache key for position states
   * @param {Token} sneakingToken - The sneaking token
   * @param {Array<Token>} targets - Array of target tokens
   * @returns {string} Cache key
   * @private
   */
  _generateCacheKey(sneakingToken, targets) {
    const sneakingId = sneakingToken.document.id;
    const sneakingPos = `${sneakingToken.x},${sneakingToken.y}`;
    const targetData = targets
      .map(t => `${t.document.id}:${t.x},${t.y}`)
      .sort()
      .join('|');
    
    return `${sneakingId}@${sneakingPos}:${targetData}`;
  }

  /**
   * Gets cached position data if available and valid
   * @param {string} cacheKey - Cache key to look up
   * @returns {PositionCacheEntry|null} Cached data or null
   * @private
   */
  _getFromCache(cacheKey) {
    if (!this._enableCaching) return null;
    
    const cached = this._positionCache.get(cacheKey);
    if (!cached) return null;
    
    // Check if cache entry is still valid
    const age = Date.now() - cached.timestamp;
    if (age > this._cacheTimeout) {
      this._positionCache.delete(cacheKey);
      return null;
    }
    
    return cached;
  }

  /**
   * Adds position data to cache
   * @param {string} cacheKey - Cache key
   * @param {PositionCacheEntry} data - Data to cache
   * @private
   */
  _addToCache(cacheKey, data) {
    if (!this._enableCaching) return;
    
    // Enforce cache size limit
    if (this._positionCache.size >= this._maxCacheSize) {
      // Remove oldest entries
      const entries = Array.from(this._positionCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      const toRemove = Math.floor(this._maxCacheSize * 0.2); // Remove 20%
      for (let i = 0; i < toRemove; i++) {
        this._positionCache.delete(entries[i][0]);
      }
    }
    
    this._positionCache.set(cacheKey, data);
  }

  /**
   * Creates batches of targets for parallel processing
   * @param {Array<Token>} targets - Array of target tokens
   * @param {number} batchSize - Size of each batch
   * @returns {Array<Array<Token>>} Array of batches
   * @private
   */
  _createBatches(targets, batchSize) {
    const batches = [];
    for (let i = 0; i < targets.length; i += batchSize) {
      batches.push(targets.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Initializes progress tracking for multi-target processing
   * @param {number} totalTargets - Total number of targets
   * @param {string} progressId - Unique progress ID
   * @param {Function} callback - Progress callback function
   * @returns {ProgressTracker} Progress tracker object
   * @private
   */
  _initializeProgressTracker(totalTargets, progressId, callback) {
    const tracker = {
      total: totalTargets,
      completed: 0,
      failed: 0,
      currentPhase: 'initialization',
      phases: ['position-capture', 'outcome-analysis', 'position-integration', 'finalization'],
      startTime: Date.now(),
      updateCallback: callback,
      progressId
    };
    
    if (this._enableProgressTracking) {
      this._progressCallbacks.set(progressId, tracker);
    }
    
    return tracker;
  }

  /**
   * Updates progress and calls progress callback
   * @param {ProgressTracker} tracker - Progress tracker
   * @param {number} percentage - Progress percentage (0-100, -1 for error)
   * @param {string} message - Progress message
   * @private
   */
  async _updateProgress(tracker, percentage, message) {
    if (!this._enableProgressTracking || !tracker) return;
    
    tracker.completed = Math.floor((percentage / 100) * tracker.total);
    
    const progressData = {
      percentage,
      message,
      phase: tracker.currentPhase,
      completed: tracker.completed,
      total: tracker.total,
      failed: tracker.failed,
      elapsed: Date.now() - tracker.startTime,
      isError: percentage === -1
    };
    
    // Call progress callback if provided
    if (typeof tracker.updateCallback === 'function') {
      try {
        await tracker.updateCallback(progressData);
      } catch (error) {
        console.warn('PF2E Visioner | Progress callback failed:', error);
      }
    }
    
    // Show progress in UI if available
    this._showProgressInUI(tracker.progressId, progressData);
  }

  /**
   * Shows progress in UI using v13 UI progress components
   * @param {string} progressId - Progress ID
   * @param {Object} progressData - Progress data
   * @private
   */
  _showProgressInUI(progressId, progressData) {
    try {
      // Use FoundryVTT v13 progress notification system
      const notification = ui.notifications.active.find(n => n.data?.progressId === progressId);
      
      if (notification) {
        // Update existing notification
        notification.data.content = progressData.message;
        notification.data.percentage = progressData.percentage;
        notification.render();
      } else if (progressData.percentage < 100 && progressData.percentage >= 0) {
        // Create new progress notification
        ui.notifications.info(progressData.message, {
          permanent: true,
          progressId: progressId,
          percentage: progressData.percentage
        });
      }
      
      // Remove notification when complete or error
      if (progressData.percentage >= 100 || progressData.isError) {
        setTimeout(() => {
          const finalNotification = ui.notifications.active.find(n => n.data?.progressId === progressId);
          if (finalNotification) {
            finalNotification.remove();
          }
        }, 2000);
      }
    } catch (error) {
      // Fallback to console logging if UI progress fails
      console.error(`PF2E Visioner | Progress [${progressId}]: ${progressData.percentage}% - ${progressData.message}`);
    }
  }

  /**
   * Generates unique progress ID
   * @param {string} tokenId - Sneaking token ID
   * @param {number} targetCount - Number of targets
   * @returns {string} Unique progress ID
   * @private
   */
  _generateProgressId(tokenId, targetCount) {
    return `sneak-multi-${tokenId}-${targetCount}-${Date.now()}`;
  }

  /**
   * Cleans up progress tracking data
   * @param {string} progressId - Progress ID to clean up
   * @private
   */
  _cleanupProgress(progressId) {
    if (this._progressCallbacks.has(progressId)) {
      this._progressCallbacks.delete(progressId);
    }
  }

  /**
   * Sets up cache cleanup timer
   * @private
   */
  _setupCacheCleanup() {
    // Clean cache every 5 minutes
    setInterval(() => {
      this._cleanupCache();
    }, 300000);
  }

  /**
   * Cleans up expired cache entries
   * @private
   */
  _cleanupCache() {
    const now = Date.now();
    const toDelete = [];
    
    for (const [key, entry] of this._positionCache) {
      if (now - entry.timestamp > this._cacheTimeout) {
        toDelete.push(key);
      }
    }
    
    for (const key of toDelete) {
      this._positionCache.delete(key);
    }
  }

  /**
   * Caches processing results for future use
   * @param {Token} sneakingToken - The sneaking token
   * @param {Array<Token>} targets - Array of target tokens
   * @param {Array<Object>} outcomes - Processing results
   * @private
   */
  async _cacheResults(sneakingToken, targets, outcomes) {
    // Cache results for potential reuse
    // This could be expanded to cache full outcome data
    console.debug(`PF2E Visioner | Cached results for ${outcomes.length} targets`);
  }

  /**
   * Generates fallback outcomes when processing fails
   * @param {Token} sneakingToken - The sneaking token
   * @param {Array<Token>} targets - Array of target tokens
   * @param {Object} actionData - Action data
   * @returns {Promise<Array<Object>>} Fallback outcomes
   * @private
   */
  async _generateFallbackOutcomes(sneakingToken, targets, actionData) {
    console.warn('PF2E Visioner | Generating fallback outcomes for multi-target processing');
    
    return targets.map(target => this._createFallbackOutcome(target, actionData));
  }

  /**
   * Creates a fallback outcome for a single target
   * @param {Token} target - Target token
   * @param {Object} actionData - Action data
   * @returns {Object} Fallback outcome
   * @private
   */
  _createFallbackOutcome(target, actionData) {
    return {
      token: target,
      dc: 15, // Default DC
      rollTotal: actionData?.roll?.total || 0,
      outcome: 'failure',
      currentVisibility: 'observed',
      newVisibility: 'observed',
      changed: false,
      hasPositionData: false,
      positionQuality: 'unknown',
      stealthPotential: 'unknown',
      riskLevel: 'unknown',
      tacticalAdvice: 'Fallback result - position data unavailable',
      systemStatus: {
        avsEnabled: false,
        autoCoverEnabled: false,
        hasErrors: true,
        errorCount: 1
      }
    };
  }

  /**
   * Assesses position quality for stealth purposes
   * @param {PositionState} positionState - Position state to assess
   * @returns {string} Quality assessment
   * @private
   */
  _assessPositionQuality(positionState) {
    if (!positionState) return 'unknown';
    
    let score = 0;
    
    // Visibility contribution
    switch (positionState.avsVisibility) {
      case 'undetected': score += 4; break;
      case 'hidden': score += 3; break;
      case 'concealed': score += 2; break;
      case 'observed': score += 0; break;
    }
    
    // Cover contribution
    switch (positionState.coverState) {
      case 'greater': score += 3; break;
      case 'standard': score += 2; break;
      case 'lesser': score += 1; break;
      case 'none': score += 0; break;
    }
    
    // Lighting contribution
    switch (positionState.lightingConditions) {
      case 'darkness': score += 2; break;
      case 'dim': score += 1; break;
      case 'bright': score += 0; break;
    }
    
    // Distance contribution
    if (positionState.distance > 60) score += 2;
    else if (positionState.distance > 30) score += 1;
    
    if (score >= 8) return 'excellent';
    if (score >= 6) return 'good';
    if (score >= 4) return 'fair';
    if (score >= 2) return 'poor';
    return 'terrible';
  }

  /**
   * Assesses stealth potential based on position
   * @param {PositionState} positionState - Position state
   * @returns {string} Stealth potential assessment
   * @private
   */
  _assessStealthPotential(positionState) {
    if (!positionState) return 'unknown';
    
    const hasGoodCover = ['standard', 'greater'].includes(positionState.coverState);
    const hasGoodVisibility = ['hidden', 'undetected'].includes(positionState.avsVisibility);
    const hasGoodLighting = ['dim', 'darkness'].includes(positionState.lightingConditions);
    
    if (hasGoodCover && hasGoodVisibility && hasGoodLighting) return 'excellent';
    if ((hasGoodCover && hasGoodVisibility) || (hasGoodVisibility && hasGoodLighting)) return 'good';
    if (hasGoodCover || hasGoodVisibility || hasGoodLighting) return 'fair';
    return 'poor';
  }

  /**
   * Assesses risk level based on position and outcome
   * @param {PositionState} positionState - Position state
   * @param {string} outcome - Roll outcome
   * @returns {string} Risk level assessment
   * @private
   */
  _assessRiskLevel(positionState, outcome) {
    if (!positionState) return 'unknown';
    
    const isExposed = positionState.avsVisibility === 'observed' && positionState.coverState === 'none';
    const hasFailedRoll = ['failure', 'critical-failure'].includes(outcome);
    
    if (isExposed && hasFailedRoll) return 'high';
    if (isExposed || hasFailedRoll) return 'medium';
    return 'low';
  }

  /**
   * Generates tactical advice based on position and outcome
   * @param {PositionState} positionState - Position state
   * @param {Object} outcome - Outcome data
   * @returns {string} Tactical advice
   * @private
   */
  _generateTacticalAdvice(positionState, outcome) {
    if (!positionState) return 'Position data unavailable';
    
    const advice = [];
    
    if (positionState.coverState === 'none') {
      advice.push('Seek cover to improve stealth');
    }
    
    if (positionState.avsVisibility === 'observed') {
      advice.push('Move to concealment or break line of sight');
    }
    
    if (positionState.lightingConditions === 'bright') {
      advice.push('Use dim lighting or darkness for better stealth');
    }
    
    if (positionState.distance < 30) {
      advice.push('Increase distance from observers');
    }
    
    if (advice.length === 0) {
      if (['success', 'critical-success'].includes(outcome.outcome)) {
        advice.push('Excellent position - maintain current advantage');
      } else {
        advice.push('Consider repositioning for better stealth opportunities');
      }
    }
    
    return advice.slice(0, 2).join('; '); // Limit to top 2 pieces of advice
  }

  /**
   * Calculates enhanced DC with position context
   * @param {number} baseDC - Base DC
   * @param {PositionState} positionState - Position state
   * @returns {number} Enhanced DC
   * @private
   */
  _calculateEnhancedDC(baseDC, positionState) {
    if (!positionState) return baseDC;
    
    let adjustment = 0;
    
    // Distance adjustments
    if (positionState.distance > 60) adjustment -= 2;
    else if (positionState.distance > 30) adjustment -= 1;
    
    // Lighting adjustments
    switch (positionState.lightingConditions) {
      case 'darkness': adjustment -= 2; break;
      case 'dim': adjustment -= 1; break;
    }
    
    return Math.max(5, baseDC + adjustment); // Minimum DC of 5
  }

  /**
   * Calculates position-based bonus
   * @param {PositionState} positionState - Position state
   * @returns {number} Position bonus
   * @private
   */
  _calculatePositionBonus(positionState) {
    if (!positionState) return 0;
    
    return positionState.stealthBonus || 0;
  }

  /**
   * Gets current cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    return {
      size: this._positionCache.size,
      maxSize: this._maxCacheSize,
      timeout: this._cacheTimeout,
      enabled: this._enableCaching
    };
  }

  /**
   * Clears all cached data
   */
  clearCache() {
    this._positionCache.clear();
  }

  /**
   * Updates processor configuration
   * @param {Object} config - Configuration options
   */
  updateConfig(config = {}) {
    if (typeof config.useParallelProcessing === 'boolean') {
      this._useParallelProcessing = config.useParallelProcessing;
    }
    
    if (typeof config.enableCaching === 'boolean') {
      this._enableCaching = config.enableCaching;
    }
    
    if (typeof config.enableProgressTracking === 'boolean') {
      this._enableProgressTracking = config.enableProgressTracking;
    }
    
    if (typeof config.batchSize === 'number' && config.batchSize > 0) {
      this._batchSize = config.batchSize;
    }
    
    if (typeof config.cacheTimeout === 'number' && config.cacheTimeout > 0) {
      this._cacheTimeout = config.cacheTimeout;
    }
    
    if (typeof config.maxCacheSize === 'number' && config.maxCacheSize > 0) {
      this._maxCacheSize = config.maxCacheSize;
    }
  }
}

// Export singleton instance
export default new EnhancedMultiTargetProcessor();