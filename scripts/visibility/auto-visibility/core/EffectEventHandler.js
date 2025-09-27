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

    constructor(systemStateProvider, visibilityStateManager, exclusionManager) {
        this.#systemStateProvider = systemStateProvider;
        this.#visibilityStateManager = visibilityStateManager;
        this.#exclusionManager = exclusionManager;
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
    #onEffectCreate(effect) {
        if (!this.#systemStateProvider.shouldProcessEvents()) return;
        this.#handleEffectChange(effect, 'created');
    }

    /**
     * Handle active effect update events
     * @param {ActiveEffect} effect - The updated effect
     */
    #onEffectUpdate(effect) {
        if (!this.#systemStateProvider.shouldProcessEvents()) return;
        this.#handleEffectChange(effect, 'updated');
    }

    /**
     * Handle active effect deletion events
     * @param {ActiveEffect} effect - The deleted effect
     */
    #onEffectDelete(effect) {
        if (!this.#systemStateProvider.shouldProcessEvents()) return;
        this.#handleEffectChange(effect, 'deleted');
    }

    /**
     * Handle effect changes that might affect visibility
     * @param {ActiveEffect} effect - The effect that changed
     * @param {string} action - The action performed ('created', 'updated', 'deleted')
     */
    #handleEffectChange(effect, action) {
        // Check if this effect is related to invisibility, vision, or conditions that affect sight
        const effectName = effect.name?.toLowerCase() || effect.label?.toLowerCase() || '';
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
            effectName.includes('true seeing');

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
                    lightEmitter: lightEmitterHint
                });

                if (lightEmitterHint) {
                    // Emitting light changed: recalc ALL because others are affected by the emitter's aura
                    this.#visibilityStateManager.markAllTokensChangedImmediate();
                } else {
                    // Only recalculate visibility for tokens with this actor
                    tokens.forEach((token) =>
                        this.#visibilityStateManager.markTokenChangedImmediate(token.document.id)
                    );
                }
            }
        }
    }
}