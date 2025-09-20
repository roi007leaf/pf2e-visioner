/**
 * AutoCoverHooks.js
 * Registers and manages hooks for the auto-cover system
 */

import { MODULE_ID } from '../../constants.js';
import autoCoverSystem from './AutoCoverSystem.js';
import coverUIManager from './CoverUIManager.js';
import templateManager from './TemplateManager.js';
import attackRollUseCase from './usecases/AttackRollUseCase.js';
import savingThrowUseCase from './usecases/SavingThrowUseCase.js';
import stealthCheckUseCase from './usecases/StealthCheckUseCase.js';

export class AutoCoverHooks {
  /**
   * Static flag to track if wrappers have been registered
   * Prevents duplicate registration errors
   * @static
   * @type {boolean}
   * @private
   */
  static _wrappersRegistered = false;

  constructor() {
    this.autoCoverSystem = autoCoverSystem;

    // Initialize use cases - all singletons
    this.attackRollUseCase = attackRollUseCase;
    this.savingThrowUseCase = savingThrowUseCase;
    this.stealthCheckUseCase = stealthCheckUseCase;

    // Initialize UI manager
    this.coverUIManager = coverUIManager;
    this.templateManager = templateManager;
  }

  /**
   * Get the CoverUIManager instance
   * @returns {CoverUIManager}
   */
  getCoverUIManager() {
    return this.coverUIManager;
  }

  /**
   * Get the StealthCheckUseCase instance
   * @returns {StealthCheckUseCase}
   */
  getStealthCheckUseCase() {
    return this.stealthCheckUseCase;
  }

  /**
   * Track whether hooks have been registered
   * @private
   * @static
   */
  static _hooksRegistered = false;

  /**
   * Register all hooks for auto-cover functionality
   * @static
   */
  static registerHooks() {
    // Prevent duplicate registration
    if (AutoCoverHooks._hooksRegistered) {
      return;
    }

    AutoCoverHooks._hooksRegistered = true;

    initializeHooks(autoCoverSystem);

    // Helper function to set up hooks with an instance
    function initializeHooks(system) {
      if (!system) {
        console.error('PF2E Visioner | Failed to register hooks: Auto-cover system not found');
        return;
      }

      const instance = new AutoCoverHooks(system);

      // Core message hooks
      Hooks.on('preCreateChatMessage', instance.onPreCreateChatMessage.bind(instance));

      // Use v13+ hook for chat message rendering
      Hooks.on('renderChatMessageHTML', (message, html) => {
        return instance.onRenderChatMessage.bind(instance)(message, html);
      });

      // Also test createChatMessage to see if we should inject indicators there
      Hooks.on('createChatMessage', () => {
        // Hook for potential future use
      });

      // Dialog hooks
      Hooks.on('renderCheckModifiersDialog', instance.onRenderCheckModifiersDialog.bind(instance));

      // Debug hook to test if any dialog hooks are firing
      Hooks.on('renderApplication', (app) => {
        if (app.constructor.name.includes('Check') || app.constructor.name.includes('Dialog')) {
          // Hook for potential debugging - currently unused
        }
      });

      // Token hooks
      Hooks.on('updateToken', instance.onUpdateToken.bind(instance));

      // Template hooks
      Hooks.on('createMeasuredTemplate', instance.onCreateMeasuredTemplate.bind(instance));
      Hooks.on('updateDocument', instance.onUpdateDocument.bind(instance));
      Hooks.on('deleteDocument', instance.onDeleteDocument.bind(instance));

      // System hooks
      Hooks.on('pf2e.systemReady', instance.onSystemReady.bind(instance));

      return instance;
    }
  } /**
   * Handle preCreateChatMessage hook
   * @param {Object} doc - Chat message document
   * @param {Object} data - Chat message data
   * @returns {Promise}
   */
  async onPreCreateChatMessage(doc, data) {
    try {
      // Skip if auto-cover is disabled
      if (!this.autoCoverSystem.isEnabled()) return;

      // Get context info from message
      const ctx = data?.flags?.pf2e?.context || {};

      // Skip if no tokens canvas
      const tokens = canvas?.tokens;
      if (!tokens?.get) return;

      // Find the appropriate use case for this context
      const useCase = this._getUseCaseForContext(ctx);
      if (!useCase) return;

      // Handle the message with the appropriate use case
      await useCase.handlePreCreateChatMessage(data, doc);
    } catch (error) {
      console.error('PF2E Visioner | Error in onPreCreateChatMessage:', error);
    }
  }

  /**
   * Handle renderChatMessageHTML hook
   * @param {Object} message - Chat message
   * @returns {Promise}
   */
  async onRenderChatMessage(message, html) {
    try {
      // Skip if auto-cover is disabled
      if (!this.autoCoverSystem.isEnabled()) {
        return;
      }

      const data = message?.toObject?.() || {};

      // Find the appropriate use case for this context
      const ctx = data?.flags?.pf2e?.context || {};

      const useCase = this._getUseCaseForContext(ctx);

      if (!useCase) {
        return;
      }

      // Call the use case's render method
      await useCase.handleRenderChatMessage(message, html);
    } catch (error) {
      console.error('PF2E Visioner | Error in onRenderChatMessage:', error);
    }
  }

  /**
   * Handle renderCheckModifiersDialog hook
   * @param {Object} dialog - Check modifiers dialog
   * @param {Object} html - Dialog HTML
   * @returns {Promise}
   */
  async onRenderCheckModifiersDialog(dialog, html) {
    try {
      // Skip if auto-cover is disabled
      if (!this.autoCoverSystem.isEnabled()) {
        return;
      }

      const ctx = dialog?.context ?? {};

      // Find the appropriate use case for this context
      const useCase = this._getUseCaseForContext(ctx);

      if (!useCase) {
        return;
      }

      // Handle the dialog with the appropriate use case
      await useCase.handleCheckDialog(dialog, html);
    } catch (error) {
      console.error('PF2E Visioner | Error in onRenderCheckModifiersDialog:', error);
    }
  }

  /**
   * Handle updateToken hook
   * @param {Object} tokenDoc - Token document
   * @param {Object} changes - Changes made to the token
   * @returns {Promise}
   */
  async onUpdateToken(tokenDoc, changes) {
    try {
      // Skip if auto-cover is disabled
      if (!this.autoCoverSystem.isEnabled()) return;

      // Check if this is a position/size/rotation update
      if (!this._isPositionUpdate(changes)) return;

      const tokenId = tokenDoc?.id;
      if (!tokenId) return;

      // Clean up cover for token
      await this._cleanupCoverForMovedToken(tokenId);
    } catch (error) {
      console.error('PF2E Visioner | Error in onUpdateToken:', error);
    }
  }

  /**
   * Check if changes include position/size/rotation updates
   * @param {Object} changes - Changes object
   * @returns {boolean}
   * @private
   */
  _isPositionUpdate(changes) {
    return (
      'x' in changes ||
      'y' in changes ||
      'width' in changes ||
      'height' in changes ||
      'rotation' in changes
    );
  }

  /**
   * Clean up cover for a moved token
   * @param {string} tokenId - Token ID
   * @returns {Promise}
   * @private
   */
  async _cleanupCoverForMovedToken(tokenId) {
    // Get all active pairs involving this token
    const pairs = this.autoCoverSystem.getActivePairsInvolving(tokenId);
    if (pairs.length === 0) return;

    const tokens = canvas?.tokens;
    if (!tokens?.get) return;

    // Clear cover for all active pairs
    for (const pair of pairs) {
      const attacker = tokens.get(pair.attackerId);
      const target = tokens.get(pair.targetId);
      if (!attacker || !target) continue;

      // Movement should clear any pre-applied cover
      await this.autoCoverSystem.cleanupCover(attacker, target);
    }
  }

  /**
   * Handle createMeasuredTemplate hook
   * @param {Object} document - Template document
   * @param {Object} options - Creation options
   * @param {string} userId - User ID who created the template
   * @returns {Promise}
   */
  async onCreateMeasuredTemplate(document, options, userId) {
    try {
      this.templateManager.onCreateMeasuredTemplate(document, options, userId);
    } catch (error) {
      console.error('PF2E Visioner | Error in onCreateMeasuredTemplate:', error);
    }
  }

  /**
   * Handle updateDocument hook
   * @param {Object} document - Updated document
   * @param {Object} changes - Changes made
   */
  async onUpdateDocument(document, changes) {
    try {
      this.autoCoverSystem.onUpdateDocument(document, changes);
      this.templateManager.onUpdateDocument(document, changes);
    } catch (error) {
      console.error('PF2E Visioner | Error in onUpdateDocument:', error);
    }
  }

  /**
   * Handle deleteDocument hook
   * @param {Object} document - Deleted document
   */
  async onDeleteDocument(document) {
    try {
      this.autoCoverSystem.onDeleteDocument(document);
      this.templateManager.onDeleteDocument(document);
    } catch (error) {
      console.error('PF2E Visioner | Error in onDeleteDocument:', error);
    }
  }

  /**
   * Handle systemReady hook
   */
  async onSystemReady() {
    try {
      // Register libWrapper if available - this has been moved to avoid duplicate registrations
      // We're now using a static flag to track if wrappers have been registered already
      if (
        !AutoCoverHooks._wrappersRegistered &&
        game.modules.get('lib-wrapper')?.active &&
        typeof libWrapper?.register === 'function'
      ) {
        try {
          // Register wrapper for Check.roll
          libWrapper.register(
            MODULE_ID,
            'game.pf2e.Check.roll',
            this._wrapCheckRoll.bind(this),
            'WRAPPER',
          );

          // Mark wrappers as registered
          AutoCoverHooks._wrappersRegistered = true;
        } catch (error) {
          console.error('PF2E Visioner | Error registering Check.roll wrapper:', error);
        }

        /*
         * Removed template preview wrapper as it's no longer compatible with Foundry v13.
         * The MeasuredTemplate.createPreview method may have changed or been removed.
         *
         * This functionality would need to be updated for the new Foundry version.
         */
      }
    } catch (error) {
      console.error('PF2E Visioner | Error in onSystemReady:', error);
    }
  }

  /**
   * Wrapper for Check.roll
   * @param {Function} wrapped - Original function
   * @param {Object} check - Check object
   * @param {Object} context - Context object
   * @param {Event} event - Event object
   * @param {Function} callback - Callback function
   * @returns {Promise}
   * @private
   */
  async _wrapCheckRoll(wrapped, check, context = {}, event = null, callback) {
    try {
      // Skip if auto-cover is disabled
      if (!this.autoCoverSystem.isEnabled()) {
        return await wrapped(check, context, event, callback);
      }

      // Get the appropriate use case for this context
      const useCase = this._getUseCaseForContext(context);
      if (!useCase) {
        return await wrapped(check, context, event, callback);
      }
      // Handle the roll with the appropriate use case
      await useCase.handleCheckRoll(check, context);
    } catch (error) {
      console.error('PF2E Visioner | Error in Check.roll wrapper:', error);
    }

    // Call original function
    return await wrapped(check, context, event, callback);
  }

  /**
   * Get the appropriate use case for a given context
   * @param {Object} ctx - Context object
   * @returns {Object|null} - Use case object or null
   * @private
   */
  _getUseCaseForContext(ctx) {
    if (!ctx) {
      return null;
    }

    const options = Array.from(ctx.options || []);

    // Check for attack context
    if (this._isAttackContext(ctx)) {
      return this.attackRollUseCase;
    }

    // Check for saving throw context
    if (ctx.type === 'saving-throw') {
      return this.savingThrowUseCase;
    }

    // Check for stealth context (exclude sneak checks)
    if (
      ctx.type === 'skill-check' &&
      Array.isArray(ctx.domains) &&
      ctx.domains.includes('stealth') &&
      !options?.includes("action:sneak")
    ) {
      return this.stealthCheckUseCase;
    }
    return null;
  }

  /**
   * Check if context is an attack context
   * @param {Object} ctx - Context object
   * @returns {boolean}
   * @private
   */
  _isAttackContext(ctx) {
    if (!ctx) return false;

    // Direct attack roll
    if (ctx.type === 'attack-roll') return true;

    // Attack action
    if (ctx.type === 'action-check' && ctx.action === 'attack') return true;

    // Strike with attack trait
    if (ctx.type === 'strike-attack-roll') return true;

    // Check domains for attack
    if (
      Array.isArray(ctx.domains) &&
      (ctx.domains.includes('attack') || ctx.domains.includes('attack-roll'))
    ) {
      return true;
    }

    return false;
  }
}
