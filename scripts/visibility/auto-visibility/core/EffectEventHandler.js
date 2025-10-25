/**
 * EffectEventHandler - Handles active effect events that may affect visibility
 *
 * This includes:
 * - Invisibility conditions
 * - Vision-affecting conditions (blinded, dazzled, etc.)
 * - Light-emitting effects
 * - Detection and concealment effects
 *
 * Follows SOLID principles by focusing solely on active effect event processing
 * and delegating state management to injected dependencies.
 */
export class EffectEventHandler {
  /** @type {SystemStateProvider} */
  #systemStateProvider = null;

  /** @type {VisibilityStateManager} */
  #visibilityStateManager = null;

  /** @type {ExclusionManager} */
  #exclusionManager = null;

  /** @type {CacheManager|null} */
  #cacheManager = null;

  constructor(systemStateProvider, visibilityStateManager, exclusionManager, cacheManager = null) {
    this.#systemStateProvider = systemStateProvider;
    this.#visibilityStateManager = visibilityStateManager;
    this.#exclusionManager = exclusionManager;
    this.#cacheManager = cacheManager;
  }

  /**
   * Initialize the effect event handler by registering hooks
   */
  initialize() {
    // Effect events (conditions are often implemented as effects)
    Hooks.on('createActiveEffect', this.#onEffectCreate.bind(this));
    Hooks.on('updateActiveEffect', this.#onEffectUpdate.bind(this));
    Hooks.on('deleteActiveEffect', this.#onEffectDelete.bind(this));
  }

  /**
   * Handle active effect creation events
   * @param {ActiveEffect} effect - The created effect
   */
  async #onEffectCreate(effect) {
    if (!this.#systemStateProvider.shouldProcessEvents()) return;
    await this.#handleEffectChange(effect, 'created');
  }

  /**
   * Handle active effect update events
   * @param {ActiveEffect} effect - The updated effect
   */
  async #onEffectUpdate(effect) {
    if (!this.#systemStateProvider.shouldProcessEvents()) return;
    await this.#handleEffectChange(effect, 'updated');
  }

  /**
   * Handle active effect deletion events
   * @param {ActiveEffect} effect - The deleted effect
   */
  async #onEffectDelete(effect) {
    if (!this.#systemStateProvider.shouldProcessEvents()) return;
    await this.#handleEffectChange(effect, 'deleted');
  }

  /**
   * Handle effect changes that might affect visibility
   * @param {ActiveEffect} effect - The effect that changed
   * @param {string} action - The action performed ('created', 'updated', 'deleted')
   */
  async #handleEffectChange(effect, action) {
    // Check if this effect is related to invisibility, vision, or conditions that affect sight
    const effectName = effect.name?.toLowerCase() || effect.label?.toLowerCase() || '';
    const effectSlug = effect.system?.slug?.toLowerCase() || '';

    const isVisibilityRelated =
      effectName.includes('invisible') ||
      effectName.includes('hidden') ||
      effectName.includes('concealed') ||
      effectName.includes('blinded') ||
      effectName.includes('dazzled') ||
      effectName.includes('vision') ||
      effectName.includes('darkvision') ||
      effectName.includes('low-light') ||
      effectName.includes('see') ||
      effectName.includes('sight') ||
      effectName.includes('detect') ||
      effectName.includes('blind') ||
      effectName.includes('deaf') ||
      effectName.includes('true seeing') ||
      effectSlug.includes('invisible');

    // Handle invisibility condition changes specifically - check both name and slug
    const isInvisibilityEffect =
      effectName.includes('invisible') || effectSlug.includes('invisible');
    if (isInvisibilityEffect && effect.parent?.documentName === 'Actor') {
      this._handleInvisibilityEffectChange(effect.parent, action);
    }

    // Strong hint that this effect toggles a LIGHT/DARKNESS emitter on the token
    const lightEmitterHint =
      effectName.includes('light') ||
      effectName.includes('torch') ||
      effectName.includes('lantern') ||
      effectName.includes('sunrod') ||
      effectName.includes('everburning') ||
      effectName.includes('glow') ||
      effectName.includes('luminous') ||
      effectName.includes('darkness') ||
      effectName.includes('continual flame') ||
      effectName.includes('dancing lights');

    if ((isVisibilityRelated || lightEmitterHint) && effect.parent?.documentName === 'Actor') {
      const actor = effect.parent;
      const tokens =
        canvas.tokens?.placeables.filter(
          (t) => t.actor?.id === actor.id && !this.#exclusionManager.isExcludedToken(t),
        ) || [];

      if (tokens.length > 0) {
        this.#systemStateProvider.debug('EffectEventHandler: visibility-affecting effect change', {
          effectName: effect.name || effect.label,
          action,
          actorId: actor.id,
          tokensAffected: tokens.length,
          lightEmitter: lightEmitterHint,
        });

        // Clear position-dependent caches when visibility-affecting effects change
        // This ensures visibility recalculation uses fresh position data, not stale cached positions
        this.#clearPositionCaches();

        if (lightEmitterHint) {
          // Emitting light changed: recalc ALL because others are affected by the emitter's aura
          this.#visibilityStateManager.markAllTokensChangedImmediate();
        } else {
          // Only recalculate visibility for tokens with this actor
          tokens.forEach((token) =>
            this.#visibilityStateManager.markTokenChangedImmediate(token.document.id),
          );
        }

        // Ensure immediate perception refresh after marking tokens as changed
        // This guarantees that condition changes are reflected immediately in the UI
        await this.#refreshPerceptionAfterEffectChange();
      }
    }
  }

  /**
   * Clear position-dependent caches to ensure fresh visibility calculations
   * This is critical when effects change that affect visibility calculations,
   * to avoid stale position cache being reused
   * @private
   */
  #clearPositionCaches() {
    try {
      if (this.#cacheManager) {
        this.#cacheManager.clearVisibilityCache?.();
        this.#cacheManager.clearLosCache?.();
      }
    } catch (error) {
      // Fail gracefully if cache manager not available
      console.warn('PF2E Visioner | Failed to clear position caches:', error);
    }
  }

  /**
   * Refresh perception immediately after effect changes to ensure visibility updates are applied
   * @private
   */
  async #refreshPerceptionAfterEffectChange() {
    try {
      // Use the optimized perception manager for consistent refresh behavior
      const { optimizedPerceptionManager } = await import('../PerceptionManager.js');
      if (optimizedPerceptionManager?.refreshPerception) {
        optimizedPerceptionManager.refreshPerception();
      } else {
        // Fallback to direct canvas perception update
        if (canvas?.perception?.update) {
          canvas.perception.update({
            refreshVision: true,
            refreshOcclusion: true,
            refreshLighting: false,
          });
        }
      }
    } catch (error) {
      // Fail silently to avoid disrupting effect processing
      console.warn('PF2E Visioner | Failed to refresh perception after effect change:', error);
    }
  }

  /**
   * Handle invisibility active effect changes to set proper PF2e transition flags
   * @param {Actor} actor - The actor whose invisibility effect changed
   * @param {string} action - The action performed ('created', 'updated', 'deleted')
   * @private
   */
  async _handleInvisibilityEffectChange(actor, action) {
    try {
      // Import ConditionManager dynamically to avoid circular dependencies
      const { ConditionManager } = await import('../ConditionManager.js');
      const conditionManager = ConditionManager.getInstance();

      // Call the condition manager to handle invisibility flags
      await conditionManager.handleInvisibilityChange(actor);
    } catch (error) {
      console.error('PF2E Visioner | Failed to handle invisibility effect change:', error);
    }
  }
}
