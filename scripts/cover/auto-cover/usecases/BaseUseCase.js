/**
 * BaseUseCase.js
 * Base abstract class for auto-cover use cases
 */
import autoCoverSystem from '../AutoCoverSystem.js';
import coverUIManager from '../CoverUIManager.js';
import templateManager from '../TemplateManager.js';
export class BaseAutoCoverUseCase {
  constructor() {
    // Ensure this class is not instantiated directly
    if (this.constructor === BaseAutoCoverUseCase) {
      throw new Error('BaseUseCase is an abstract class and cannot be instantiated directly');
    }

    this.coverUIManager = coverUIManager.default || coverUIManager;
    this.autoCoverSystem = autoCoverSystem.default || autoCoverSystem;
    this.templateManager = templateManager.default || templateManager;
    this.useCaseType = this.constructor.name;
  }

  /**
   * Log a message with the use case type and a structured format
   * @param {string} method - Method name
   * @param {string} message - Log message
   * @param {Object} data - Optional data to include in the log
   * @param {string} level - Log level (debug, info, warn, error)
   * @protected
   */
  _log(method, message, data = {}, level = 'debug') {
    const logData = {
      useCase: this.useCaseType,
      method,
      ...data,
    };

    if (level === 'error') {
      console.error(`PF2E Visioner | ${this.useCaseType}.${method}: ${message}`, logData);
    } else if (level === 'warn') {
      console.warn(`PF2E Visioner | ${this.useCaseType}.${method}: ${message}`, logData);
    } else if (level === 'info') {
      console.info(`PF2E Visioner | ${this.useCaseType}.${method}: ${message}`, logData);
    }
  }

  async handleRenderChatMessage(message, html, shouldShow = true) {
    try {
      // Always check for cover override indicators first, regardless of action data
      shouldShow = await this.coverUIManager.shouldShowCoverOverrideIndicator(message);

      if (shouldShow) {
        await this.coverUIManager.injectCoverOverrideIndicator(message, html, shouldShow);
      }
    } catch (error) {
      console.error('PF2E Visioner | Error in onRenderChatMessage:', error);
    }
  }

  /**
   * Handle a chat message context
   * @param {Object} data - Message data
   * @returns {Promise<Object>} Result with tokens and cover state
   */
  async handlePreCreateChatMessage(data) {
    throw new Error("Method 'handleChatMessage' must be implemented by subclasses");
  }

  /**
   * Handle a check modifiers dialog context
   * @param {Object} dialog - Dialog object
   * @param {Object} ctx - Check context
   * @returns {Promise<Object>} Result with tokens and cover state
   */
  async handleCheckDialog(dialog, ctx) {
    throw new Error("Method 'handleCheckDialog' must be implemented by subclasses");
  }

  /**
   * Handle check roll context
   * @param {Object} check - Check object
   * @param {Object} context - Check context
   * @returns {Promise<Object>} Result with tokens and cover state
   */
  async handleCheckRoll(check, context) {
    throw new Error("Method 'handleRoll' must be implemented by subclasses");
  }

  /**
   * Clean up any effects or state changes after a roll completes
   * @param {Object} attacker - Attacker token
   * @param {Object} target - Target token
   * @returns {Promise<void>}
   */
  async cleanupAfterRoll(attacker, target) {
    this._log('cleanupAfterRoll', 'Cleaning up after roll', {
      attacker: attacker?.name,
      attackerId: attacker?.id,
      target: target?.name,
      targetId: target?.id,
    });

    if (attacker && target) {
      // Clean up auto-cover state
      await this.autoCoverSystem.cleanupCover(attacker, target);

      // Also directly remove any ephemeral cover roll effects from the target
      if (target.actor && game.user.isGM) {
        try {
          const ephemeralEffects = target.actor.itemTypes?.effect?.filter(
            (e) => e.flags?.['pf2e-visioner']?.ephemeralCoverRoll === true,
          );

          if (ephemeralEffects && ephemeralEffects.length > 0) {
            this._log(
              'cleanupAfterRoll',
              `Removing ${ephemeralEffects.length} ephemeral cover effects`,
              {
                target: target.name,
              },
            );

            // Double-check that effects still exist to avoid "does not exist" errors
            const validEffectIds = [];
            for (const effect of ephemeralEffects) {
              const stillExists = target.actor.items.get(effect.id);
              if (stillExists) {
                validEffectIds.push(effect.id);
              } else {
                this._log('cleanupAfterRoll', 'Effect already removed, skipping', {
                  effectId: effect.id,
                  effectName: effect.name,
                });
              }
            }

            if (validEffectIds.length > 0) {
              await target.actor.deleteEmbeddedDocuments('Item', validEffectIds);
              this._log(
                'cleanupAfterRoll',
                `Successfully removed ${validEffectIds.length} effects`,
                {
                  target: target.name,
                },
              );
            } else {
              this._log('cleanupAfterRoll', 'All effects were already removed by another process', {
                target: target.name,
                originalCount: ephemeralEffects.length,
              });
            }
          }
        } catch (error) {
          // Check if it's a benign race: effect already gone
          const msg = String(error?.message || error);
          if (msg.includes('does not exist')) {
            // Downgrade to debug to avoid noisy console warnings for expected races
            this._log(
              'cleanupAfterRoll',
              'Race condition: effect already removed elsewhere',
              { error: msg },
              'debug',
            );
          } else {
            // Log other types of errors but don't re-throw to avoid breaking the cleanup flow
            this._log(
              'cleanupAfterRoll',
              'Error removing ephemeral cover effects',
              { error },
              'error',
            );
          }
        }
      }
    }
  }

  /**
   * Resolve tokens from message data
   * @param {Object} data - Message data
   * @returns {Promise<Object>} Result with attacker, target, and isMultiTarget flag
   * @protected
   */
  async _resolveTokensFromMessage(data) {
    throw new Error("Method '_resolveTokensFromMessage' must be implemented by subclasses");
  }

  /**
   * Detect cover state between tokens
   * @param {Object} attacker - Attacker token
   * @param {Object} target - Target token
   * @param {Object} context - Optional attack context for rule element checks
   * @returns {string} Cover state
   * @protected
   */
  _detectCover(attacker, target, context = null) {
    if (!attacker || !target) {
      this._log(
        '_detectCover',
        'Missing attacker or target',
        {
          attackerExists: !!attacker,
          targetExists: !!target,
        },
        'warn',
      );
      return 'none';
    }

    this._log('_detectCover', 'Detecting cover between tokens', {
      attacker: attacker.name,
      attackerId: attacker.id,
      target: target.name,
      targetId: target.id,
    });

    // Check template origin first
    const originRec = this.templateManager.getTemplateOrigin(attacker.id);
    const attackContext = context ? { item: context.item, options: context.options } : null;

    let coverState;
    if (originRec) {
      this._log('_detectCover', 'Using template origin for cover detection', {
        originPoint: originRec.point,
        templateTimestamp: originRec.ts,
      });
      coverState = this.autoCoverSystem.detectCoverFromPoint(originRec.point, target, { attackContext });
    } else {
      // Default: detect from attacker to target directly
      coverState = this.autoCoverSystem.detectCoverBetweenTokens(attacker, target, { attackContext });
    }

    this._log('_detectCover', 'Cover detection result', {
      state: coverState,
      attacker: attacker.name,
      target: target.name,
    });

    return coverState;
  }

  normalizeTokenRef(ref) {
    return this.autoCoverSystem.normalizeTokenRef(ref);
  }

  /**
   * Resolve target from context
   * @param {Object} ctx - Context object
   * @returns {Object|null}
   * @private
   */
  _resolveTargetFromCtx(ctx) {
    try {
      const tObj = ctx?.target?.token?.object || ctx?.target?.token;
      if (tObj?.id) return tObj;
      const targetIdRaw =
        typeof ctx?.target?.token === 'string'
          ? ctx.target.token
          : ctx?.target?.tokenId || ctx?.targetTokenId;
      const targetId = this.normalizeTokenRef(targetIdRaw);
      if (targetId) {
        const byCtx = canvas?.tokens?.get?.(targetId);
        if (byCtx) return byCtx;
      }
      const t =
        Array.from(game?.user?.targets ?? [])?.[0] ||
        Array.from(canvas?.tokens?.targets ?? [])?.[0];
      return t || null;
    } catch (_) {
      return null;
    }
  }

  /**
   * Resolve target token ID from message data
   * @param {Object} data - Message data
   * @returns {string|null}
   * @private
   */
  _resolveTargetTokenIdFromData(data) {
    try {
      const pf2eTarget =
        data?.flags?.pf2e?.context?.target?.token ?? data?.flags?.pf2e?.target?.token;
      if (pf2eTarget) {
        return this.normalizeTokenRef(pf2eTarget);
      }
    } catch (_) {}
    try {
      const context = data?.flags?.pf2e?.context;
      if (context?.target?.token) return this.normalizeTokenRef(context.target.token);
      if (context?.target?.actor) {
        const first = Array.from(canvas?.tokens?.placeables || []).find(
          (t) => t.actor?.id === context.target.actor,
        )?.id;
        if (typeof first === 'string') {
          return this.normalizeTokenRef(first);
        }
      }
    } catch (_) {}
    // Fallback: pf2e-toolbelt target helper may carry targets for area damage
    try {
      const tbTargets = data?.flags?.['pf2e-toolbelt']?.targetHelper?.targets;
      if (Array.isArray(tbTargets) && tbTargets.length === 1) {
        return this.normalizeTokenRef(tbTargets[0]);
      }
    } catch (_) {}
  }
}
