import { MODULE_ID } from '../constants.js';
import { setDebugState } from './logger.js';

/**
 * Debug Logger System
 * Provides separate logging for AVS (Auto-Visibility System) and general module debugging
 */
class DebugLogger {
  static #instance = null;
  #avsDebugEnabled = false;
  #generalDebugEnabled = false;
  #avsLogs = [];
  #generalLogs = [];
  #maxLogEntries = 1000;

  constructor() {
    if (DebugLogger.#instance) {
      return DebugLogger.#instance;
    }
    DebugLogger.#instance = this;
  }

  static getInstance() {
    if (!DebugLogger.#instance) {
      DebugLogger.#instance = new DebugLogger();
    }
    return DebugLogger.#instance;
  }

  /**
   * Initialize debug logger with current settings
   * This should be called when the module loads
   */
  initialize() {
    try {
      // Read current settings
      const avsEnabled = !!game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
      const generalEnabled = !!game.settings.get(MODULE_ID, 'debug');
      
      this.#avsDebugEnabled = avsEnabled;
      this.#generalDebugEnabled = generalEnabled;
      
      // Update the logger state
      setDebugState(avsEnabled, generalEnabled);
      
      if (avsEnabled || generalEnabled) {
        console.log(`${MODULE_ID} | Debug Logger initialized - AVS: ${avsEnabled}, General: ${generalEnabled}`);
      }
    } catch (error) {
      console.warn(`${MODULE_ID} | Failed to initialize debug logger:`, error);
    }
  }
  setAVSDebugEnabled(enabled) {
    this.#avsDebugEnabled = enabled;
    setDebugState(enabled, this.#generalDebugEnabled);
    if (enabled) {
      console.log(`${MODULE_ID} | AVS Debug Mode ENABLED`);
    } else {
      console.log(`${MODULE_ID} | AVS Debug Mode DISABLED`);
    }
  }

  /**
   * Enable/disable general module debugging
   * @param {boolean} enabled - Whether to enable general debugging
   */
  setGeneralDebugEnabled(enabled) {
    this.#generalDebugEnabled = enabled;
    setDebugState(this.#avsDebugEnabled, enabled);
    if (enabled) {
      console.log(`${MODULE_ID} | General Debug Mode ENABLED`);
    } else {
      console.log(`${MODULE_ID} | General Debug Mode DISABLED`);
    }
  }

  /**
   * Log AVS-specific debug information
   * @param {string} message - Debug message
   * @param {...any} args - Additional arguments
   */
  avsLog(message, ...args) {
    if (!this.#avsDebugEnabled) return;
    
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      type: 'avs',
      message,
      args: args.length > 0 ? args : undefined
    };
    
    this.#avsLogs.push(logEntry);
    if (this.#avsLogs.length > this.#maxLogEntries) {
      this.#avsLogs.shift();
    }
    
    console.log(`${MODULE_ID} | AVS | ${message}`, ...args);
  }

  /**
   * Log general module debug information
   * @param {string} message - Debug message
   * @param {...any} args - Additional arguments
   */
  generalLog(message, ...args) {
    if (!this.#generalDebugEnabled) return;
    
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      type: 'general',
      message,
      args: args.length > 0 ? args : undefined
    };
    
    this.#generalLogs.push(logEntry);
    if (this.#generalLogs.length > this.#maxLogEntries) {
      this.#generalLogs.shift();
    }
    
    console.log(`${MODULE_ID} | GENERAL | ${message}`, ...args);
  }

  /**
   * Log AVS-specific warnings
   * @param {string} message - Warning message
   * @param {...any} args - Additional arguments
   */
  avsWarn(message, ...args) {
    if (!this.#avsDebugEnabled) return;
    
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      type: 'avs-warning',
      message,
      args: args.length > 0 ? args : undefined
    };
    
    this.#avsLogs.push(logEntry);
    if (this.#avsLogs.length > this.#maxLogEntries) {
      this.#avsLogs.shift();
    }
    
    console.warn(`${MODULE_ID} | AVS WARNING | ${message}`, ...args);
  }

  /**
   * Log general module warnings
   * @param {string} message - Warning message
   * @param {...any} args - Additional arguments
   */
  generalWarn(message, ...args) {
    if (!this.#generalDebugEnabled) return;
    
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      type: 'general-warning',
      message,
      args: args.length > 0 ? args : undefined
    };
    
    this.#generalLogs.push(logEntry);
    if (this.#generalLogs.length > this.#maxLogEntries) {
      this.#generalLogs.shift();
    }
    
    console.warn(`${MODULE_ID} | GENERAL WARNING | ${message}`, ...args);
  }

  /**
   * Get AVS debug logs
   * @returns {Array} Array of AVS log entries
   */
  getAVSLogs() {
    return [...this.#avsLogs];
  }

  /**
   * Get general debug logs
   * @returns {Array} Array of general log entries
   */
  getGeneralLogs() {
    return [...this.#generalLogs];
  }

  /**
   * Get all debug logs
   * @returns {Object} Object containing both AVS and general logs
   */
  getAllLogs() {
    return {
      avs: this.getAVSLogs(),
      general: this.getGeneralLogs(),
      avsEnabled: this.#avsDebugEnabled,
      generalEnabled: this.#generalDebugEnabled
    };
  }

  /**
   * Clear AVS debug logs
   */
  clearAVSLogs() {
    this.#avsLogs = [];
    console.log(`${MODULE_ID} | AVS debug logs cleared`);
  }

  /**
   * Clear general debug logs
   */
  clearGeneralLogs() {
    this.#generalLogs = [];
    console.log(`${MODULE_ID} | General debug logs cleared`);
  }

  /**
   * Clear all debug logs
   */
  clearAllLogs() {
    this.#avsLogs = [];
    this.#generalLogs = [];
    console.log(`${MODULE_ID} | All debug logs cleared`);
  }

  /**
   * Check if AVS debugging is enabled
   * @returns {boolean} Whether AVS debugging is enabled
   */
  isAVSDebugEnabled() {
    return this.#avsDebugEnabled;
  }

  /**
   * Check if general debugging is enabled
   * @returns {boolean} Whether general debugging is enabled
   */
  isGeneralDebugEnabled() {
    return this.#generalDebugEnabled;
  }
}

export const debugLogger = DebugLogger.getInstance();
