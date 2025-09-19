/**
 * EventDrivenVisibilitySystem - Zero-delay event-driven visibility management
 * Uses zero-delay components with no artificial throttling
 * Relies purely on event batching and requestAnimationFrame for performance
 */

import { MODULE_ID } from '../../constants.js';

// Exported helper for unit tests and potential external reuse
export function isDefeatedOrUnconscious(token) {
  try {
    const actor = token?.actor;
    if (!actor) return false;
    const hpValue = actor.hitPoints?.value ?? actor.system?.attributes?.hp?.value;
    if (typeof hpValue === 'number' && hpValue <= 0) return true;
    const conditionSlugs = new Set();
    if (Array.isArray(actor.itemTypes?.condition)) {
      for (const c of actor.itemTypes.condition) {
        if (c?.slug) conditionSlugs.add(c.slug);
        else if (typeof c?.name === 'string') conditionSlugs.add(c.name.toLowerCase());
      }
    }
    if (Array.isArray(actor.conditions)) {
      for (const c of actor.conditions) {
        if (c?.slug) conditionSlugs.add(c.slug);
        else if (typeof c?.name === 'string') conditionSlugs.add(c.name.toLowerCase());
      }
    }
    for (const slug of ['unconscious', 'dead', 'dying']) {
      if (conditionSlugs.has(slug)) return true;
    }
  } catch { /* ignore */ }
  return false;
}

export class EventDrivenVisibilitySystem {
  /** @type {EventDrivenVisibilitySystem} */
  static #instance = null;

  /** @type {boolean} */
  #enabled = false;

  /** @type {Set<string>} - Tokens that have changed and affect others */
  #changedTokens = new Set();

  /** @type {Map<string, Object>} - Store updated token documents for position calculations */
  #updatedTokenDocs = new Map();

  /** @type {boolean} - Batch processing flag */
  #processingBatch = false;

  /** @type {number} - Count of processed updates for debugging */
  #updateCount = 0;

  /** @type {boolean} - Flag to prevent reacting to our own effect changes */
  #isUpdatingEffects = false;

  /** @type {import('./LightingCalculator.js').LightingCalculator} */
  #lightingCalculator = null;

  /** @type {any} - Lazily loaded AVS Override Manager */
  #avsOverrideManager = null;

  /** @type {any} - Optimized visibility calculator facade */
  #optimizedVisibilityCalculator = null;

  /** @type {(observer: Token, target: Token) => any} */
  #getVisibilityMap = null;

  /** @type {(observer: Token, target: Token, state: string, options?: any) => void} */
  #setVisibilityBetween = null;

  /** @type {() => void} */
  #refreshPerception = null;

  // AVS Override Management
  /** @type {Map<string, Object>} - Active overrides by "observerId-targetId" key */
  #activeOverrides = new Map();

  // Override Validation for Token Movement
  /** @type {Set<string>} - Tokens queued for override validation */
  #tokensQueuedForValidation = new Set();

  /** @type {number} - Timeout ID for batched override validation */
  #validationTimeoutId = null;

  constructor() {
    if (EventDrivenVisibilitySystem.#instance) {
      return EventDrivenVisibilitySystem.#instance;
    }
    EventDrivenVisibilitySystem.#instance = this;
  }

  static getInstance() {
    if (!EventDrivenVisibilitySystem.#instance) {
      EventDrivenVisibilitySystem.#instance = new EventDrivenVisibilitySystem();
    }
    return EventDrivenVisibilitySystem.#instance;
  }

  /**
   * Initialize the system - self-contained with optimized components (ZERO DELAYS)
   */
  async initialize() {
    // Removed debug log

    // Create core components
    const { LightingCalculator } = await import('./LightingCalculator.js');
    const { VisionAnalyzer } = await import('./VisionAnalyzer.js');
    const { ConditionManager } = await import('./ConditionManager.js');
    const { optimizedVisibilityCalculator } = await import('./VisibilityCalculator.js');
    const { refreshEveryonesPerceptionOptimized } = await import('../../services/optimized-socket.js');
    const { getVisibilityMap, setVisibilityBetween } = await import('../../stores/visibility-map.js');

    const lightingCalculator = LightingCalculator.getInstance();
    this.#lightingCalculator = lightingCalculator;
    const visionAnalyzer = VisionAnalyzer.getInstance();
    const invisibilityManager = ConditionManager.getInstance();

    // Initialize the optimized visibility calculator with the core components
    optimizedVisibilityCalculator.initialize(lightingCalculator, visionAnalyzer, invisibilityManager);
    // Store facades/utilities for later method use
    this.#optimizedVisibilityCalculator = optimizedVisibilityCalculator;
    this.#refreshPerception = refreshEveryonesPerceptionOptimized;
    this.#getVisibilityMap = getVisibilityMap;
    this.#setVisibilityBetween = setVisibilityBetween;

    this.#enabled = game.settings.get(MODULE_ID, 'autoVisibilityEnabled');

    if (this.#enabled) {
      this.#registerEventListeners();
    }
  }

  /**
   * Register only the essential Foundry event listeners
   */
  #registerEventListeners() {
    // Removed debug log

    // Token events that affect visibility
    Hooks.on('updateToken', this.#onTokenUpdate.bind(this));
    Hooks.on('createToken', this.#onTokenCreate.bind(this));
    Hooks.on('deleteToken', this.#onTokenDelete.bind(this));

    // AVS Override Management Hook is centralized in AvsOverrideManager
    // Use promise-based dynamic import here because `await` is not allowed in this non-async method.
    import('../../chat/services/infra/avs-override-manager.js')
      .then(({ default: AvsOverrideManager }) => {
        try {
          AvsOverrideManager.registerHooks?.();
          this.#avsOverrideManager = AvsOverrideManager;
        } catch { /* best-effort */ }
      })
      .catch(() => { /* ignore if module can't be loaded */ });

    // Lighting events
    Hooks.on('updateAmbientLight', this.#onLightUpdate.bind(this));
    Hooks.on('createAmbientLight', this.#onLightCreate.bind(this));
    Hooks.on('deleteAmbientLight', this.#onLightDelete.bind(this));

    // Wall events (affect line of sight)
    Hooks.on('updateWall', this.#onWallUpdate.bind(this));
    Hooks.on('createWall', this.#onWallCreate.bind(this));
    Hooks.on('deleteWall', this.#onWallDelete.bind(this));

    // Actor events (conditions, vision, etc.)
    Hooks.on('updateActor', this.#onActorUpdate.bind(this));
    Hooks.on('preUpdateActor', this.#onPreUpdateActor.bind(this));

    // Effect events (conditions are often implemented as effects)
    Hooks.on('createActiveEffect', this.#onEffectCreate.bind(this));
    Hooks.on('updateActiveEffect', this.#onEffectUpdate.bind(this));
    Hooks.on('deleteActiveEffect', this.#onEffectDelete.bind(this));

    // PF2e specific condition hooks if they exist
    Hooks.on('createItem', this.#onItemCreate.bind(this));
    Hooks.on('updateItem', this.#onItemUpdate.bind(this));
    Hooks.on('deleteItem', this.#onItemDelete.bind(this));

    // Additional equipment/feature changes that might affect vision
    Hooks.on('updateItem', this.#onEquipmentChange.bind(this));

    // Scene darkness changes
    Hooks.on('updateScene', this.#onSceneUpdate.bind(this));

    // Template changes (can affect lighting and vision)
    Hooks.on('createMeasuredTemplate', this.#onTemplateCreate.bind(this));
    Hooks.on('updateMeasuredTemplate', this.#onTemplateUpdate.bind(this));
    Hooks.on('deleteMeasuredTemplate', this.#onTemplateDelete.bind(this));
  }

  /**
   * Token position or properties changed
   */
  #onTokenUpdate(tokenDoc, changes) {
    if (!this.#enabled || !game.user.isGM) return;
    // Simplified hidden handling: if hidden flag toggled, recalc everyone and exit.
    if (Object.prototype.hasOwnProperty.call(changes, 'hidden')) {
      try {
        const ids = canvas.tokens?.placeables?.map(t => t.document.id) || [];
        this.recalculateForTokens(ids);
      } catch { /* ignore */ }
      return;
    }

    const isHidden = tokenDoc.hidden === true;
    if (isHidden) {
      // Carve-out: if this token is currently sneaking and moved, still queue override validation
      try {
        const tokHidden = canvas.tokens?.get?.(tokenDoc.id);
        const positionChangedHidden = changes.x !== undefined || changes.y !== undefined;
        const isSneakingHidden = tokHidden?.document?.getFlag?.(MODULE_ID, 'sneak-active');
        if (isSneakingHidden && positionChangedHidden) {
          try { globalThis.game = globalThis.game || {}; game.pf2eVisioner = game.pf2eVisioner || {}; game.pf2eVisioner.lastMovedTokenId = tokenDoc.id; } catch { }
          this.#queueOverrideValidation(tokenDoc.id);
        }
      } catch { /* best-effort */ }
      return;
    }
    try {
      const tok = canvas.tokens?.get?.(tokenDoc.id);
      if (tok && this.#isExcludedToken(tok)) {
        // Carve-out: if token is excluded due to sneaking, still queue override validation on movement
        const positionChangedExcluded = changes.x !== undefined || changes.y !== undefined;
        const isSneakingExcluded = tok?.document?.getFlag?.(MODULE_ID, 'sneak-active');
        if (isSneakingExcluded && positionChangedExcluded) {
          try { globalThis.game = globalThis.game || {}; game.pf2eVisioner = game.pf2eVisioner || {}; game.pf2eVisioner.lastMovedTokenId = tokenDoc.id; } catch { }
          this.#queueOverrideValidation(tokenDoc.id);
        }
        return;
      }
    } catch { /* ignore */ }

    // Check what actually changed
    const positionChanged = changes.x !== undefined || changes.y !== undefined;
    const lightChanged = changes.light !== undefined;
    const visionChanged = changes.vision !== undefined;
    const effectsChanged =
      changes.actorData?.effects !== undefined || changes.actorData !== undefined;


    // Removed threshold-gated batching; we process immediately for all relevant changes

    // Invalidate lighting cache immediately when position or light changed (even for tiny moves)
    try {
      if (this.#lightingCalculator && (positionChanged || lightChanged)) {
        this.#lightingCalculator.invalidateLightCache();
      }
    } catch { /* best-effort only */ }

    // For any relevant change, store updated coordinates and trigger immediate processing
    if (positionChanged || lightChanged || visionChanged || effectsChanged) {
      // Store the updated document for position calculations
      this.#updatedTokenDocs.set(tokenDoc.id, {
        id: tokenDoc.id,
        x: changes.x !== undefined ? changes.x : tokenDoc.x,
        y: changes.y !== undefined ? changes.y : tokenDoc.y,
        width: tokenDoc.width,
        height: tokenDoc.height,
        name: tokenDoc.name,
      });
      this.#markTokenChangedImmediate(tokenDoc.id);

      // Queue override validation for the moved token and all tokens with overrides involving it
      if (positionChanged) {
        // Persist the actual mover for downstream UI (indicator/dialog) headers
        try { globalThis.game = globalThis.game || {}; game.pf2eVisioner = game.pf2eVisioner || {}; game.pf2eVisioner.lastMovedTokenId = tokenDoc.id; } catch { }
        this.#queueOverrideValidation(tokenDoc.id);
        try {
          const allTokens = canvas.tokens?.placeables || [];
          for (const t of allTokens) {
            if (!t?.id || t.id === tokenDoc.id) continue;
            // Check if t has an override where the mover is the observer (avs-override-from-<moverId> on t)
            const tFlags = t.document.flags['pf2e-visioner'] || {};
            if (tFlags[`avs-override-from-${tokenDoc.id}`]) {
              this.#queueOverrideValidation(t.id);
            }
            // Check if the mover has an override where t is the observer (avs-override-from-<t.id> on mover)
            const moverFlags = tokenDoc.flags?.['pf2e-visioner'] || {};
            if (moverFlags[`avs-override-from-${t.id}`]) {
              this.#queueOverrideValidation(t.id);
            }
          }
        } catch { }
      }
    }
  }

  /**
   * New token created - affects visibility with all other tokens
   */
  #onTokenCreate(tokenDoc) {
    if (!this.#enabled || !game.user.isGM) return;
    try {
      const tok = canvas.tokens?.get?.(tokenDoc.id);
      if (tok && this.#isExcludedToken(tok)) return;
    } catch { /* ignore */ }
    // Removed debug log
    this.#markTokenChangedImmediate(tokenDoc.id);
  }

  /**
   * Token deleted - clean up its visibility relationships
   */
  #onTokenDelete(tokenDoc) {
    if (!this.#enabled || !game.user.isGM) return;

    // Clean up any pending changes for this token
    this.#changedTokens.delete(tokenDoc.id);
  }

  /**
   * Light source updated - affects visibility for all tokens
   */
  #onLightUpdate() {
    if (!this.#enabled || !game.user.isGM) return;
    this.#markAllTokensChangedImmediate();
  }

  /**
   * Light source created
   */
  #onLightCreate() {
    if (!this.#enabled || !game.user.isGM) return;
    this.#markAllTokensChangedImmediate();
  }

  /**
   * Light source deleted
   */
  #onLightDelete() {
    if (!this.#enabled || !game.user.isGM) return;
    this.#markAllTokensChangedImmediate();
  }

  /**
   * Wall changed - affects line of sight for all tokens
   */
  #onWallUpdate() {
    if (!this.#enabled || !game.user.isGM) return;

    // Removed debug log

    this.#markAllTokensChangedImmediate();
  }

  #onWallCreate() {
    if (!this.#enabled || !game.user.isGM) return;

    // Removed debug log

    this.#markAllTokensChangedImmediate();
  }

  #onWallDelete() {
    if (!this.#enabled || !game.user.isGM) return;

    // Removed debug log

    this.#markAllTokensChangedImmediate();
  }

  /**
   * Actor about to be updated - catch condition changes early
   */
  #onPreUpdateActor(actor, changes) {
    if (!this.#enabled || !game.user.isGM) return;

    // Ignore changes when we're updating effects to prevent feedback loops
    if (this.#isUpdatingEffects) {
      return;
    }

    // Check for condition-related changes
    const hasConditionChanges =
      changes.system?.conditions !== undefined ||
      changes.actorData?.effects !== undefined ||
      changes.items !== undefined;

    if (hasConditionChanges) {
      const tokens = canvas.tokens?.placeables.filter((t) => t.actor?.id === actor.id && !this.#isExcludedToken(t)) || [];

      if (tokens.length > 0) {
        // Removed debug log

        tokens.forEach((token) => this.#markTokenChangedImmediate(token.document.id));
      }
    }
  }

  /**
   * Actor updated - might affect vision capabilities or conditions
   */
  #onActorUpdate(actor) {
    if (!this.#enabled || !game.user.isGM) return;

    // Ignore changes when we're updating effects to prevent feedback loops
    if (this.#isUpdatingEffects) {
      return;
    }

    // Find tokens for this actor - skip hidden tokens
    const tokens = canvas.tokens?.placeables.filter((t) => t.actor?.id === actor.id && !this.#isExcludedToken(t)) || [];

    if (tokens.length > 0) {
      // Removed debug log

      tokens.forEach((token) => this.#markTokenChangedImmediate(token.document.id));
    }
  }

  /**
   * Scene updated - might affect darkness level
   */
  #onSceneUpdate(scene, changes) {
    if (!this.#enabled || !game.user.isGM) return;

    // Check if darkness level or other lighting changed (FoundryVTT v13+ compatibility)
    const darknessChanged = changes.environment?.darknessLevel !== undefined || changes.darkness !== undefined;
    if (darknessChanged || changes.environment !== undefined) {
      // Removed debug log

      this.#markAllTokensChangedImmediate();
    }
  }

  /**
   * Active Effect created - might be invisibility condition
   */
  #onEffectCreate(effect) {
    if (!this.#enabled || !game.user.isGM) return;
    this.#handleEffectChange(effect, 'created');
  }

  /**
   * Active Effect updated - might be invisibility condition
   */
  #onEffectUpdate(effect) {
    if (!this.#enabled || !game.user.isGM) return;
    this.#handleEffectChange(effect, 'updated');
  }

  /**
   * Active Effect deleted - might be invisibility condition
   */
  #onEffectDelete(effect) {
    if (!this.#enabled || !game.user.isGM) return;

    // Removed debug log

    this.#handleEffectChange(effect, 'deleted');
  }

  /**
   * Item created - might be condition in PF2e
   */
  #onItemCreate(item) {
    if (!this.#enabled || !game.user.isGM) return;
    this.#handleItemChange(item, 'created');
  }

  /**
   * Item updated - might be condition in PF2e
   */
  #onItemUpdate(item) {
    if (!this.#enabled || !game.user.isGM) return;
    this.#handleItemChange(item, 'updated');
  }

  /**
   * Item deleted - might be condition in PF2e
   */
  #onItemDelete(item) {
    if (!this.#enabled || !game.user.isGM) return;

    // Removed debug log

    this.#handleItemChange(item, 'deleted');
  }

  /**
   * Handle effect changes that might affect visibility
   */
  #handleEffectChange(effect) {
    // Removed debug log

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
      effectName.includes('light') ||
      effectName.includes('darkness') ||
      effectName.includes('continual flame') ||
      effectName.includes('dancing lights') ||
      effectName.includes('true seeing');

    if (isVisibilityRelated && effect.parent?.documentName === 'Actor') {
      const actor = effect.parent;
      const tokens = canvas.tokens?.placeables.filter((t) => t.actor?.id === actor.id && !this.#isExcludedToken(t)) || [];

      if (tokens.length > 0) {
        // Removed debug log

        tokens.forEach((token) => this.#markTokenChangedImmediate(token.document.id));
      }
    }
  }

  /**
   * Handle item changes that might affect visibility (PF2e conditions)
   */
  #handleItemChange(item) {
    // Removed debug log

    // In PF2e, conditions might be items, but also spells and effects
    const itemName = item.name?.toLowerCase() || '';
    const itemType = item.type?.toLowerCase() || '';

    // Expand the types that might affect visibility
    const isRelevantType =
      itemType === 'condition' ||
      itemType === 'effect' ||
      itemType === 'spell' ||
      itemType === 'feat' ||
      itemType === 'action';

    const isVisibilityRelated =
      itemName.includes('invisible') ||
      itemName.includes('hidden') ||
      itemName.includes('concealed') ||
      itemName.includes('blinded') ||
      itemName.includes('dazzled') ||
      itemName.includes('vision') ||
      itemName.includes('darkvision') ||
      itemName.includes('low-light') ||
      itemName.includes('light') ||
      itemName.includes('darkness') ||
      itemName.includes('see invisibility') ||
      itemName.includes('true seeing') ||
      itemName.includes('dancing lights') ||
      itemName.includes('continual flame');

    if (isRelevantType && isVisibilityRelated && item.parent?.documentName === 'Actor') {
      const actor = item.parent;
      const tokens = canvas.tokens?.placeables.filter((t) => t.actor?.id === actor.id && !this.#isExcludedToken(t)) || [];

      if (tokens.length > 0) {
        // Removed debug log

        tokens.forEach((token) => this.#markTokenChangedImmediate(token.document.id));
      }
    }
  }

  /**
   * Mark a token as changed - triggers IMMEDIATE processing with fresh coordinates
   */
  #markTokenChangedImmediate(tokenId) {
    this.#changedTokens.add(tokenId);

    // Use requestAnimationFrame for immediate processing with fresh coordinates from #updatedTokenDocs
    if (!this.#processingBatch) {
      requestAnimationFrame(() => this.#processBatch());
    }
  }

  /**
   * Mark all tokens as needing recalculation - triggers IMMEDIATE processing
   */
  #markAllTokensChangedImmediate() {
    const tokens = canvas.tokens?.placeables || [];
    tokens.forEach((token) => {
      if (token.actor && !this.#isExcludedToken(token)) {
        this.#changedTokens.add(token.document.id);
      }
    });

    if (!this.#processingBatch) {
      requestAnimationFrame(() => this.#processBatch());
    }
  }

  /**
   * Process all accumulated changes in a single batch - IMMEDIATE processing
   */
  async #processBatch() {
    if (this.#processingBatch || this.#changedTokens.size === 0) return;

    this.#processingBatch = true;

    try {
      // Add a small delay only if there are sneaking tokens active to allow override flags to be set
      // This prevents race conditions where dual-system sets flags but AVS processes before they take effect
      const hasSneakingTokens = Array.from(this.#changedTokens).some(tokenId => {
        const token = canvas.tokens?.get(tokenId);
        return token?.document?.getFlag('pf2e-visioner', 'sneak-active');
      });

      if (hasSneakingTokens) {
        await new Promise(resolve => setTimeout(resolve, 25)); // Reduced delay, only when needed
      }

      // Ensure canvas perception and token geometry are up-to-date before we sample LoS/lighting.
      // This avoids the "one extra step" lag at borders when Foundry hasn't fully settled yet.
      try {
        this.#refreshPerception?.();
      } catch { /* best-effort */ }
      // Wait two RAFs to allow rendering and perception to settle
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      // Removed debug log
      // const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
      // const startTime = performance.now();

      // Only include tokens that are not excluded per policy
      const allTokens = canvas.tokens?.placeables?.filter((t) => t.actor && !this.#isExcludedToken(t)) || [];
      const updates = [];

      // Debug logging removed

      // For each changed token, recalculate visibility with all other tokens
      for (const changedTokenId of this.#changedTokens) {
        const changedToken = allTokens.find((t) => t.document.id === changedTokenId);
        if (!changedToken) {
          continue;
        }

        // Process visibility with all other tokens
        for (const otherToken of allTokens) {
          if (otherToken.document.id === changedTokenId) continue;



          let effectiveVisibility1, effectiveVisibility2;

          // Check for visibility overrides before calculating
          let hasOverride1 = false;
          let hasOverride2 = false;

          try {
            // Check for active AVS overrides first (new system)
            const avsOverride1 = this.#getActiveOverride(changedToken.document.id, otherToken.document.id);
            const avsOverride2 = this.#getActiveOverride(otherToken.document.id, changedToken.document.id);

            if (avsOverride1) {
              effectiveVisibility1 = avsOverride1.state;
              hasOverride1 = true;
            } else {
              // Fallback to old flag-based system for compatibility
              const override1FlagKey = `avs-override-from-${changedToken.document.id}`;
              const override1Flag = otherToken.document.getFlag('pf2e-visioner', override1FlagKey);

              hasOverride1 = !!override1Flag;

              if (hasOverride1) {
                effectiveVisibility1 = override1Flag.state;
              }
            }

            if (avsOverride2) {
              effectiveVisibility2 = avsOverride2.state;
              hasOverride2 = true;
            } else {
              // Fallback to old flag-based system for compatibility
              const override2FlagKey = `avs-override-from-${otherToken.document.id}`;
              const override2Flag = changedToken.document.getFlag('pf2e-visioner', override2FlagKey);

              hasOverride2 = !!override2Flag;

              if (hasOverride2) {
                effectiveVisibility2 = override2Flag.state;
              }
            }

          } catch (overrideError) {
            console.warn('PF2E Visioner | Failed to check visibility overrides:', overrideError);
          }

          // Read current map values early for potential suppression logic later
          const currentVisibility1 =
            this.#getVisibilityMap?.(changedToken)?.[otherToken.document.id] || 'observed';
          const currentVisibility2 =
            this.#getVisibilityMap?.(otherToken)?.[changedToken.document.id] || 'observed';

          // Only calculate visibility if we don't have overrides
          if (!hasOverride1 || !hasOverride2) {
            const changedTokenPosition = this.#getTokenPosition(changedToken);
            const otherTokenPosition = this.#getTokenPosition(otherToken);

            // Debug logging removed

            // Calculate visibility in both directions using optimized calculator
            // Pass position overrides to ensure we use the latest coordinates
            if (!hasOverride1) {
              const visibility1 = await this.#optimizedVisibilityCalculator.calculateVisibilityWithPosition(
                changedToken,
                otherToken,
                changedTokenPosition,
                otherTokenPosition,
              );
              effectiveVisibility1 = visibility1;
            }

            if (!hasOverride2) {
              const visibility2 = await this.#optimizedVisibilityCalculator.calculateVisibilityWithPosition(
                otherToken,
                changedToken,
                otherTokenPosition,
                changedTokenPosition,
              );
              effectiveVisibility2 = visibility2;
            }

            // Debug logging removed
          }


          // Note: Suppression of downgrades (e.g., keeping 'concealed' when new calc says 'hidden')
          // has been removed to avoid border-step lag and ensure immediate state transitions.


          // Only update if visibility changed

          // Removed debug log

          // Always generate updates when the effective visibility (including overrides)
          // differs from the current map value. This ensures that when AVS override flags
          // exist on the mover or its observers, the persisted visibility map is kept in
          // sync in both directions (observer->target and target->observer).
          if (effectiveVisibility1 !== currentVisibility1) {
            updates.push({
              observer: changedToken,
              target: otherToken,
              visibility: effectiveVisibility1,
            });
          }

          if (effectiveVisibility2 !== currentVisibility2) {
            updates.push({
              observer: otherToken,
              target: changedToken,
              visibility: effectiveVisibility2,
            });
          }
        }
      }

      // Apply all updates immediately
      if (updates.length > 0) {
        for (const update of updates) {
          this.#setVisibilityBetween?.(update.observer, update.target, update.visibility, {
            isAutomatic: true,
          });

          // Trigger hook for Token Manager refresh
          Hooks.call('pf2e-visioner.visibilityChanged',
            update.observer.document.id,
            update.target.document.id,
            update.visibility
          );
        }

        // Allow the visibility-map writes and hooks to settle visually before global refresh
        try {
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        } catch { /* noop */ }

        // Refresh perception once for all updates - IMMEDIATELY
        this.#refreshPerception?.();

        this.#updateCount += updates.length;
      }

      // Clear processed changes
      this.#changedTokens.clear();
      this.#updatedTokenDocs.clear();

      // Removed debug log
    } finally {
      this.#processingBatch = false;
    }
  }

  // Removed unused #getMovementDistance

  /**
   * Get the actual position for a token, using live canvas coordinates first
   */
  #getTokenPosition(token) {
    // During an update cycle, prioritize stored updated coordinates if available
    // This ensures we use the NEW position from the update, not the stale canvas position
    const updatedDoc = this.#updatedTokenDocs.get(token.document.id);
    if (updatedDoc) {
      const position = {
        x: updatedDoc.x + (updatedDoc.width * canvas.grid.size) / 2,
        y: updatedDoc.y + (updatedDoc.height * canvas.grid.size) / 2,
        elevation: updatedDoc.elevation || 0,
      };

      return position;
    }

    // Fallback to live token position from canvas if available
    const canvasToken = canvas.tokens.get(token.document.id);
    if (canvasToken && canvasToken.document) {
      const position = {
        x: canvasToken.document.x + (canvasToken.document.width * canvas.grid.size) / 2,
        y: canvasToken.document.y + (canvasToken.document.height * canvas.grid.size) / 2,
        elevation: canvasToken.document.elevation || 0,
      };

      return position;
    }

    // Final fallback to document coordinates
    const position = {
      x: token.document.x + (token.document.width * canvas.grid.size) / 2,
      y: token.document.y + (token.document.height * canvas.grid.size) / 2,
      elevation: token.document.elevation || 0,
    };

    return position;
  }

  // Removed unused #passesFoundryVisibility

  /**
   * Central predicate: tokens excluded from AVS calculations
   * Keep exclusion minimal to avoid delaying state updates at visibility borders.
   * - Foundry hidden
   * - Defeated/unconscious/dead (cannot observe others)
   */
  #isExcludedToken(token) {
    try {
      if (!token?.document) return true;
      if (token.document.hidden) return true;
      // Do not exclude based on sneak-active or viewport visibility; AVS must still process them
      // Skip defeated / unconscious / dead tokens: they can't currently observe others
      try {
        const actor = token.actor;
        if (actor) {
          // HP based check (covers 0 or negative)
          const hpValue = actor.hitPoints?.value ?? actor.system?.attributes?.hp?.value;
          if (typeof hpValue === 'number' && hpValue <= 0) return true;

          // Condition-based check (PF2e conditions use itemTypes.condition or conditions array)
          const conditionSlugs = new Set();
          if (Array.isArray(actor.itemTypes?.condition)) {
            for (const c of actor.itemTypes.condition) {
              if (c?.slug) conditionSlugs.add(c.slug);
              else if (typeof c?.name === 'string') conditionSlugs.add(c.name.toLowerCase());
            }
          }
          if (Array.isArray(actor.conditions)) {
            for (const c of actor.conditions) {
              if (c?.slug) conditionSlugs.add(c.slug);
              else if (typeof c?.name === 'string') conditionSlugs.add(c.name.toLowerCase());
            }
          }

          const defeatedSlugs = ['unconscious', 'dead', 'dying'];
          for (const ds of defeatedSlugs) {
            if (conditionSlugs.has(ds)) return true;
          }
        }
      } catch {
        // Non-fatal; ignore and proceed
      }
    } catch {
      // If in doubt, do not exclude
    }
    return false;
  }

  /**
   * Enable the system
   */
  enable() {
    if (this.#enabled) return;

    // Removed debug log

    this.#enabled = true;
    this.#registerEventListeners();

    // Initial full calculation - immediate
    this.#markAllTokensChangedImmediate();
  }

  /**
   * Disable the system
   */
  disable() {
    // Removed debug log

    this.#enabled = false;

    // Clear all pending changes
    this.#changedTokens.clear();
  }

  /**
   * Force recalculation of all visibility (for manual triggers) - IMMEDIATE
   */
  recalculateAll() {
    if (!this.#enabled) return;

    // Removed debug log

    this.#markAllTokensChangedImmediate();
  }

  /**
   * Get system status
   */
  getStatus() {
    return {
      enabled: this.#enabled,
      changedTokens: this.#changedTokens.size,
      processingBatch: this.#processingBatch,
      totalUpdates: this.#updateCount,
      optimized: true,
      description: 'Zero-delay event-driven visibility system',
    };
  }

  /**
   * Set the updating effects flag to prevent feedback loops
   * @param {boolean} isUpdating - Whether effects are being updated
   */
  _setUpdatingEffects(isUpdating) {
    this.#isUpdatingEffects = isUpdating;
  }

  /**
   * Force recalculation of all token visibility
   * @param {boolean} force - Force recalculation even if recently done
   */
  async recalculateAllVisibility(force = false) {
    if (!this.#enabled && !force) return;

    const tokens = (canvas.tokens?.placeables || []).filter((t) => !this.#isExcludedToken(t));
    // Removed debug log

    // Process all tokens in a single batch
    for (const token of tokens) this.#changedTokens.add(token.id);

    await this.#processBatch();
  }

  /**
   * Force recalculation specifically for sneaking tokens
   * This ensures AVS processes sneaking tokens even when they're hidden by Foundry
   */
  async recalculateSneakingTokens() {
    if (!this.#enabled) return;

    const sneakingTokens = canvas.tokens?.placeables?.filter((t) =>
      t.actor && !this.#isExcludedToken(t) && t.document.getFlag('pf2e-visioner', 'sneak-active')
    ) || [];

    // Mark all sneaking tokens as changed
    for (const token of sneakingTokens) {
      this.#changedTokens.add(token.document.id);
    }

    // Process immediately
    if (this.#changedTokens.size > 0) {
      await this.#processBatch();
    }
  }

  /**
   * Recalculate visibility for a specific set of tokens (by id).
   * Useful when overrides are cleared and we need precise, immediate updates.
   * @param {string[]|Set<string>} tokenIds
   */
  async recalculateForTokens(tokenIds) {
    if (!this.#enabled) return;
    const ids = Array.from(new Set((tokenIds || []).filter(Boolean)));
    if (ids.length === 0) return;
    for (const id of ids) {
      const tok = canvas.tokens?.get(id);
      if (tok && !this.#isExcludedToken(tok)) this.#changedTokens.add(id);
    }
    await this.#processBatch();
  }

  /**
   * Calculate visibility between two tokens using optimized calculator
   * @param {Token} observer - The observing token
   * @param {Token} target - The target token
   * @returns {Promise<string>} Visibility state
   */
  async calculateVisibility(observer, target) {
    try {
      // Short-circuit: AVS does not calculate for excluded participants (hidden, fails testVisibility, sneak-active)
      if (observer && this.#isExcludedToken(observer)) {
        const map = this.#getVisibilityMap?.(observer || {});
        return map?.[target?.document?.id] || 'observed';
      }
      if (target && this.#isExcludedToken(target)) {
        const map = this.#getVisibilityMap?.(observer || {});
        return map?.[target?.document?.id] || 'observed';
      }
      // Ensure we don't use stale cached vision capabilities when movement just happened
      const { VisionAnalyzer } = await import('./VisionAnalyzer.js');
      const visionAnalyzer = VisionAnalyzer.getInstance();
      visionAnalyzer.invalidateVisionCache?.(observer?.document?.id);
    } catch {
      // Best effort only
    }
    return await this.#optimizedVisibilityCalculator.calculateVisibility(observer, target);
  }

  /**
   * Calculate effective visibility including manual overrides and the persisted visibility map.
   * Precedence:
   * 1) Active override flag on target (avs-override-from-<observerId>)
   * 2) Current visibility map entry (observer -> target)
   * 3) Fresh AVS calculation (no overrides)
   * @param {Token} observer
   * @param {Token} target
   * @returns {Promise<string>} Visibility state
   */
  async calculateVisibilityWithOverrides(observer, target) {
    try {
      if (!observer?.document?.id || !target?.document?.id) return 'observed';

      // 1) Check for active override (persisted flag)
      try {
        const overrideFlagKey = `avs-override-from-${observer.document.id}`;
        const overrideData = target.document.getFlag('pf2e-visioner', overrideFlagKey);
        if (overrideData && overrideData.state) {
          return overrideData.state;
        }
      } catch { /* ignore */ }

      // 2) Check current visibility map (observer -> target)
      try {
        const current = this.#getVisibilityMap?.(observer)?.[target.document.id];
        if (current) return current;
      } catch { /* ignore */ }

      // 3) Fallback to regular AVS calculation (no overrides)
      return await this.calculateVisibility(observer, target);
    } catch {
      return 'observed';
    }
  }

  /**
   * Handle equipment changes that might affect vision capabilities
   */
  #onEquipmentChange(item, changes) {
    if (!this.#enabled || !game.user.isGM) return;

    // Check if this is equipment that might affect vision
    const itemName = item.name?.toLowerCase() || '';
    const itemType = item.type?.toLowerCase() || '';

    const isVisionEquipment =
      itemType === 'equipment' &&
      (itemName.includes('goggles') ||
        itemName.includes('glasses') ||
        itemName.includes('lens') ||
        itemName.includes('vision') ||
        itemName.includes('sight') ||
        itemName.includes('eye') ||
        changes.system?.equipped !== undefined); // Equipment state changed

    if (isVisionEquipment && item.parent?.documentName === 'Actor') {
      const actor = item.parent;
      const tokens = canvas.tokens?.placeables.filter((t) => t.actor?.id === actor.id && !this.#isExcludedToken(t)) || [];

      if (tokens.length > 0) {
        // Removed debug log

        tokens.forEach((token) => this.#markTokenChangedImmediate(token.document.id));
      }
    }
  }

  // ==========================================
  // AVS OVERRIDE MANAGEMENT SYSTEM
  // ==========================================

  /**
   * Handle AVS override requests from actions like sneak
   * @param {Object} overrideData - Override data structure
   */
  // AVS override handling is centralized in AvsOverrideManager

  /**
   * Store override as persistent token flag
   * @param {Token} observer - Observer token
   * @param {Token} target - Target token  
   * @param {string} state - Visibility state
   * @param {string} source - Override source
   * @param {boolean} hasCover - Whether target has cover
  * @param {boolean} hasConcealment - Whether target has concealment
  * @param {('none'|'lesser'|'standard'|'greater')} [expectedCover] - Explicit expected cover level at apply-time
   */
  // Removed: #storeOverrideAsFlag (moved to AvsOverrideManager)

  /**
   * Apply override from persistent flag
   * @param {Token} observer - Observer token
   * @param {Token} target - Target token
   * @param {string} state - Visibility state
   */
  // Removed: #applyOverrideFromFlag (moved to AvsOverrideManager)

  /**
   * Check if there's an active override for a token pair
   * @param {string} observerId - Observer token ID
   * @param {string} targetId - Target token ID
   * @returns {Object|null} Override data or null
   */
  #getActiveOverride(observerId, targetId) {
    const overrideKey = `${observerId}-${targetId}`;
    return this.#activeOverrides.get(overrideKey) || null;
  }

  /**
   * Remove a specific override (both memory and persistent flag types)
   * @param {string} observerId - Observer token ID
   * @param {string} targetId - Target token ID
   * @param {Object} options - Options including type and token reference
   */
  async removeOverride(observerId, targetId) {
    // Delegate to AvsOverrideManager; keep memory map cleanup for legacy if desired
    const overrideKey = `${observerId}-${targetId}`;
    this.#activeOverrides.delete(overrideKey);
    return this.#avsOverrideManager?.removeOverride?.(observerId, targetId);
  }

  /**
   * Clear all overrides (memory and persistent flags)
   */
  async clearAllOverrides() {
    // Clear memory and delegate persistent flags cleanup to manager
    this.#activeOverrides.clear();
    await this.#avsOverrideManager?.clearAllOverrides?.();
  }

  // ==========================================
  // TEMPLATE EVENTS
  // ==========================================

  /**
   * Handle template creation (might affect lighting)
   */
  #onTemplateCreate(template) {
    if (!this.#enabled || !game.user.isGM) return;

    // Check if this template might affect visibility (light spells, darkness, etc.)
    const templateName = template.flags?.pf2e?.item?.name?.toLowerCase() || '';
    const isLightTemplate =
      templateName.includes('light') ||
      templateName.includes('darkness') ||
      templateName.includes('shadow');

    if (isLightTemplate) {
      // Removed debug log
      this.#markAllTokensChangedImmediate();
    }
  }

  /**
   * Handle template updates (might affect lighting)
   */
  #onTemplateUpdate(template, changes) {
    if (!this.#enabled || !game.user.isGM) return;

    // Check if position or configuration changed
    const significantChange =
      changes.x !== undefined ||
      changes.y !== undefined ||
      changes.config !== undefined ||
      changes.hidden !== undefined;

    if (significantChange) {
      const templateName = template.flags?.pf2e?.item?.name?.toLowerCase() || '';
      const isLightTemplate =
        templateName.includes('light') ||
        templateName.includes('darkness') ||
        templateName.includes('shadow');

      if (isLightTemplate) {
        // Removed debug log
        this.#markAllTokensChangedImmediate();
      }
    }
  }

  /**
   * Handle template deletion (might affect lighting)
   */
  #onTemplateDelete(template) {
    if (!this.#enabled || !game.user.isGM) return;

    const templateName = template.flags?.pf2e?.item?.name?.toLowerCase() || '';
    const isLightTemplate =
      templateName.includes('light') ||
      templateName.includes('darkness') ||
      templateName.includes('shadow');

    if (isLightTemplate) {
      // Removed debug log
      this.#markAllTokensChangedImmediate();
    }
  }

  // ==========================================
  // OVERRIDE VALIDATION SYSTEM
  // ==========================================

  /**
   * Queue a token for override validation after movement
   * @param {string} tokenId - ID of the token that moved
   */
  #queueOverrideValidation(tokenId) {
    if (!this.#enabled || !game.user.isGM) {
      return;
    }

    this.#tokensQueuedForValidation.add(tokenId);

    // Clear existing timeout and set new one to batch validations
    if (this.#validationTimeoutId) {
      clearTimeout(this.#validationTimeoutId);
    }

    // Validate after a short delay to handle waypoints and complete movements
    this.#validationTimeoutId = setTimeout(() => {
      this.#processQueuedValidations();
    }, 500); // 500ms delay to ensure movement is complete
  }

  /**
   * Process all queued override validations
   */
  async #processQueuedValidations() {
    if (!this.#enabled || !game.user.isGM) return;

    // Ensure perception/vision are up-to-date before running validations
    try {
      this.#refreshPerception?.();
      // Wait for rendering/perception to settle (2 RAFs)
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    } catch (e) {
      // Non-fatal: proceed even if refresh fails
      console.warn('PF2E Visioner | Perception refresh before validation failed (continuing):', e);
    }

    const tokensToValidate = Array.from(this.#tokensQueuedForValidation);
    this.#tokensQueuedForValidation.clear();
    this.#validationTimeoutId = null;

    for (const tokenId of tokensToValidate) {
      const result = await this.#validateOverridesForToken(tokenId);
      // If there are no invalid overrides, but awareness overrides exist, filter to only show changed details
      if (result && result.__showAwareness && Array.isArray(result.overrides)) {
        // Only surface the awareness indicator for the actual mover to keep the dataset mover-centric.
        // Other tokens are validated (so maps stay correct) but won't overwrite the indicator UI.
        try {
          const lastMovedId = (globalThis?.game?.pf2eVisioner?.lastMovedTokenId) || null;
          if (lastMovedId && tokenId !== lastMovedId) {
            // Skip displaying indicator for non-mover validations
            continue;
          }
        } catch { /* best effort guard */ }
        // Filter to only items where there is an actual change (visibility or cover)
        const filtered = result.overrides.filter((o) => {
          const prevVis = o.state || (o.hasConcealment ? 'concealed' : 'observed');
          const prevCover = (o.expectedCover ?? (o.hasCover ? 'standard' : 'none'));
          const curVis = o.currentVisibility || 'observed';
          const curCover = o.currentCover || 'none';
          return prevVis !== curVis || prevCover !== curCover;
        });
        if (filtered.length > 0) {
          try {
            const { default: indicator } = await import('../../ui/override-validation-indicator.js');
            const movedId = (globalThis?.game?.pf2eVisioner?.lastMovedTokenId) || tokenId;
            const moverName = canvas.tokens?.get(movedId)?.document?.name || 'Token';
            // Awareness is informational; don't pulse. Pass actual mover id for grouping and header.
            indicator.show(filtered, moverName, movedId, { pulse: false });
          } catch (e) {
            console.warn('PF2E Visioner | Failed to show awareness indicator:', e);
          }
        }
      }
    }
  }

  /**
   * Validate all overrides involving a specific token that just moved
   * @param {string} movedTokenId - ID of the token that moved
   */

  async #validateOverridesForToken(movedTokenId) {
    const movedToken = canvas.tokens?.get(movedTokenId);
    if (!movedToken) {
      return;
    }
    // Skip validation for excluded tokens (hidden, fails testVisibility, sneak-active)
    // Special handling: if the token is sneak-active, we still want to surface awareness for
    // observer-side AVS overrides (i.e., where the sneaking token is the observer), but we do not
    // show any target-side overrides for the sneaking token.
    if (this.#isExcludedToken(movedToken)) {
      let isSneaking = false;
      try {
        isSneaking = !!movedToken.document.getFlag(MODULE_ID, 'sneak-active');
      } catch { /* noop */ }

      if (!isSneaking) {
        return { overrides: [], __showAwareness: false };
      }

      // Build awareness from flags on other tokens where mover is OBSERVER -> "as Observer" only
      const awareness = [];
      try {
        const allTokens = canvas.tokens?.placeables || [];
        for (const t of allTokens) {
          if (!t?.document || t.id === movedTokenId) continue;
          // Exclude Foundry-hidden tokens for awareness, but do not require full inclusion tests here
          if (t.document.hidden) continue;
          const fk = `avs-override-from-${movedTokenId}`;
          const fd = t.document.flags['pf2e-visioner']?.[fk];
          if (!fd) continue;

          // Best-effort compute current states ignoring overrides; if unavailable, let defaults apply
          let currentVisibility = undefined;
          let currentCover = undefined;
          try {
            let visibility;
            try {
              const { optimizedVisibilityCalculator } = await import('./VisibilityCalculator.js');
              if (typeof optimizedVisibilityCalculator.calculateVisibilityWithoutOverrides === 'function') {
                visibility = await optimizedVisibilityCalculator.calculateVisibilityWithoutOverrides(movedToken, t);
              } else {
                visibility = await this.calculateVisibility(movedToken, t);
              }
            } catch {
              visibility = await this.calculateVisibility(movedToken, t);
            }
            currentVisibility = visibility;
            const { CoverDetector } = await import('../../cover/auto-cover/CoverDetector.js');
            const coverDetector = new CoverDetector();
            const observerPos = this.#getTokenPosition(movedToken);
            currentCover = coverDetector.detectFromPoint(observerPos, t);
          } catch { /* best effort only */ }

          awareness.push({
            observerId: movedTokenId,
            targetId: t.id,
            observerName: movedToken.name,
            targetName: t.name,
            state: fd.state,
            hasCover: fd.hasCover,
            hasConcealment: fd.hasConcealment,
            expectedCover: fd.expectedCover,
            currentVisibility,
            currentCover,
          });
        }
      } catch { /* noop */ }

      return { overrides: awareness, __showAwareness: awareness.length > 0 };
    }

    const overridesToCheck = [];


    // Persistent flag-based overrides scan
    // 1) Flags on the mover (mover is TARGET) -> should appear under "as Target"
    try {
      const moverFlags = movedToken.document.flags['pf2e-visioner'] || {};
      for (const [flagKey, flagData] of Object.entries(moverFlags)) {
        if (!flagKey.startsWith('avs-override-from-')) continue;
        const observerId = flagKey.replace('avs-override-from-', '');
        const targetId = movedToken.document.id;
        // Always check overrides where the mover is the target, even if observer is missing
        const observerTok = canvas.tokens?.get(observerId) || null;
        // If observer token is present and not excluded, use it; otherwise, use a minimal stub
        const observer = (!observerTok || this.#isExcludedToken(observerTok))
          ? { id: observerId, name: flagData.observerName || 'Unknown Observer' }
          : observerTok;
        overridesToCheck.push({
          key: `${observerId}-${targetId}`,
          override: {
            observer,
            target: movedToken,
            state: flagData.state,
            source: flagData.source,
            hasCover: flagData.hasCover,
            hasConcealment: flagData.hasConcealment,
            expectedCover: flagData.expectedCover,
            observerId,
            targetId,
            observerName: flagData.observerName || observer?.name,
            targetName: flagData.targetName || movedToken.name
          },
          observerId,
          targetId,
          type: 'flag',
          flagKey,
          token: movedToken
        });
        // DEBUG: Print each flag key and data found on the mover
      }
    } catch (errTarget) { console.warn('[PF2E Visioner] OVERRIDE SCAN (as target) error', errTarget); }

    // 2) Flags on other tokens where mover is OBSERVER -> should appear under "as Observer"
    try {
      const allTokens = canvas.tokens?.placeables || [];
      for (const token of allTokens) {
        if (!token?.document || token.id === movedTokenId) continue;
        const flags = token.document.flags['pf2e-visioner'] || {};
        const flagKey = `avs-override-from-${movedTokenId}`;
        const flagData = flags[flagKey];

        if (!flagData) continue;
        const observerId = movedTokenId;
        const targetId = token.document.id;
        overridesToCheck.push({
          key: `${observerId}-${targetId}`,
          override: {
            observer: movedToken,
            target: token,
            state: flagData.state,
            source: flagData.source,
            hasCover: flagData.hasCover,
            hasConcealment: flagData.hasConcealment,
            expectedCover: flagData.expectedCover,
            observerId,
            targetId,
            observerName: flagData.observerName || movedToken.name,
            targetName: flagData.targetName || token.name
          },
          observerId,
          targetId,
          type: 'flag',
          flagKey,
          token
        });
      }
    } catch (errObserver) { console.warn('[PF2E Visioner] OVERRIDE SCAN (as observer) error', errObserver); }

    // Check each override for validity and collect invalid ones
    const invalidOverrides = [];
    for (const checkData of overridesToCheck) {
      const { override, observerId, targetId, type, flagKey, token } = checkData;
      const checkResult = await this.#checkOverrideValidity(observerId, targetId, override);

      if (checkResult) {
        invalidOverrides.push({
          observerId,
          targetId,
          override,
          reason: checkResult.reason,
          reasonIcons: checkResult.reasonIcons || [],
          currentVisibility: checkResult.currentVisibility,
          currentCover: checkResult.currentCover,
          type,
          flagKey,
          token
        });
      }
    }

    // If we found invalid overrides, show the validation dialog
    if (invalidOverrides.length > 0) {
      await this.#showOverrideValidationDialog(invalidOverrides, movedTokenId);
      return { overrides: invalidOverrides, __showAwareness: false };
    }

    // No invalid overrides; check if there are overrides at all for awareness indicator
    const awareness = [];
    try {
      // Collect mover-as-target flags
      const moverFlags = movedToken.document.flags['pf2e-visioner'] || {};
      for (const [flagKey, flagData] of Object.entries(moverFlags)) {
        if (!flagKey.startsWith('avs-override-from-')) continue;
        const observerId = flagKey.replace('avs-override-from-', '');
        const obs = canvas.tokens?.get(observerId);
        if (!obs || obs.document?.hidden) continue;
        // Calculate current visibility/cover for awareness (ignore manual overrides for comparison)
        let currentVisibility = undefined;
        let currentCover = undefined;
        try {
          let visibility;
          try {
            const { optimizedVisibilityCalculator } = await import('./VisibilityCalculator.js');
            if (typeof optimizedVisibilityCalculator.calculateVisibilityWithoutOverrides === 'function') {
              visibility = await optimizedVisibilityCalculator.calculateVisibilityWithoutOverrides(obs, movedToken);
            } else {
              visibility = await this.calculateVisibility(obs, movedToken);
            }
          } catch {
            visibility = await this.calculateVisibility(obs, movedToken);
          }
          currentVisibility = visibility;
          const { CoverDetector } = await import('../../cover/auto-cover/CoverDetector.js');
          const coverDetector = new CoverDetector();
          const observerPos = this.#getTokenPosition(obs);
          currentCover = coverDetector.detectFromPoint(observerPos, movedToken);
        } catch { /* best effort */ }
        awareness.push({
          observerId,
          targetId: movedTokenId,
          observerName: obs?.name || flagData.observerName || 'Observer',
          targetName: movedToken.name,
          state: flagData.state,
          hasCover: flagData.hasCover,
          hasConcealment: flagData.hasConcealment,
          expectedCover: flagData.expectedCover,
          currentVisibility,
          currentCover
        });
      }
      // Collect mover-as-observer flags on others
      const allTokens = canvas.tokens?.placeables || [];
      for (const t of allTokens) {
        if (!t?.document || t.id === movedTokenId) continue;
        if (t.document.hidden) continue;
        const fk = `avs-override-from-${movedTokenId}`;
        const fd = t.document.flags['pf2e-visioner']?.[fk];
        if (!fd) continue;
        // Calculate current visibility/cover for awareness (ignore manual overrides for comparison)
        let currentVisibility = undefined;
        let currentCover = undefined;
        try {
          let visibility;
          try {
            const { optimizedVisibilityCalculator } = await import('./VisibilityCalculator.js');
            if (typeof optimizedVisibilityCalculator.calculateVisibilityWithoutOverrides === 'function') {
              visibility = await optimizedVisibilityCalculator.calculateVisibilityWithoutOverrides(movedToken, t);
            } else {
              visibility = await this.calculateVisibility(movedToken, t);
            }
          } catch {
            visibility = await this.calculateVisibility(movedToken, t);
          }
          currentVisibility = visibility;
          const { CoverDetector } = await import('../../cover/auto-cover/CoverDetector.js');
          const coverDetector = new CoverDetector();
          const observerPos = this.#getTokenPosition(movedToken);
          currentCover = coverDetector.detectFromPoint(observerPos, t);
        } catch { }
        awareness.push({
          observerId: movedTokenId,
          targetId: t.id,
          observerName: movedToken.name,
          targetName: t.name,
          state: fd.state,
          hasCover: fd.hasCover,
          hasConcealment: fd.hasConcealment,
          expectedCover: fd.expectedCover,
          currentVisibility,
          currentCover
        });
      }
    } catch { }

    return { overrides: awareness, __showAwareness: awareness.length > 0 };
  }

  /**
   * Check if an override is still valid based on current visibility/cover state
   * @param {string} observerId - Observer token ID
   * @param {string} targetId - Target token ID  
   * @param {Object} override - Override object with hasCover/hasConcealment flags
   * @returns {Promise<{shouldRemove: boolean, reason: string}|null>}
   */
  async #checkOverrideValidity(observerId, targetId, override) {
    const observer = canvas.tokens?.get(observerId);
    const target = canvas.tokens?.get(targetId);

    if (!observer || !target) return null;

    try {

      // Calculate current visibility and get detailed information
      // For override validation, always use the true AVS-calculated state (ignore manual overrides)
      let visibility;
      try {
        const { optimizedVisibilityCalculator } = await import('./VisibilityCalculator.js');
        // Use a special option or bypass to ignore overrides if supported
        if (typeof optimizedVisibilityCalculator.calculateVisibilityWithoutOverrides === 'function') {
          visibility = await optimizedVisibilityCalculator.calculateVisibilityWithoutOverrides(observer, target);
        } else {
          // Fallback: temporarily remove override, calculate, then restore
          const targetFlags = target?.document?.flags?.['pf2e-visioner'] || {};
          const observerFlagKey = `avs-override-from-${observer?.document?.id}`;
          let removedOverride = null;
          if (targetFlags[observerFlagKey]) {
            removedOverride = targetFlags[observerFlagKey];
            // Remove override
            delete target.document.flags['pf2e-visioner'][observerFlagKey];
          }
          visibility = await optimizedVisibilityCalculator.calculateVisibility(observer, target);
          // Restore override
          if (removedOverride) {
            target.document.flags['pf2e-visioner'][observerFlagKey] = removedOverride;
          }
        }
      } catch {
        // Fallback to normal calculation if anything fails
        visibility = await this.calculateVisibility(observer, target);
      }

      // Get cover information using CoverDetector - checking if target has cover from observer
      // Only consider 'standard' and 'greater' cover as significant for override validation
      let targetHasCoverFromObserver = false;
      let coverResult = 'none';
      try {
        const { CoverDetector } = await import('../../cover/auto-cover/CoverDetector.js');
        const coverDetector = new CoverDetector();
        // Use freshest known positions to avoid stale center readings during/after movement
        const observerPos = this.#getTokenPosition(observer);
        // DEBUG: log positions used for cover validation
        // Use point-based detection to force the updated observer position
        coverResult = coverDetector.detectFromPoint(observerPos, target);

        // Only standard and greater cover count as "having cover" for override purposes
        targetHasCoverFromObserver = coverResult === 'standard' || coverResult === 'greater';
      } catch (coverError) {
        console.warn('PF2E Visioner | Could not calculate cover:', coverError);
        // Fallback - assume no cover if we can't calculate it
        targetHasCoverFromObserver = false;
        coverResult = 'none';
      }

      // Check if target has concealment from observer (based on visibility result)
      const targetHasConcealmentFromObserver = visibility === 'concealed' || visibility === 'hidden';
      const targetIsVisibleToObserver = visibility === 'observed' || visibility === 'concealed';

      if (!visibility) return null;

      const reasons = [];
      // Check if cover conditions have changed from what the override expected
      if (override.hasCover && !targetHasCoverFromObserver) {
        if (coverResult === 'none') {
          reasons.push({
            icon: 'fas fa-shield-alt',
            text: 'no cover',
            type: 'cover-none',
            crossed: true
          });
        }
      }
      if (!override.hasCover && targetHasCoverFromObserver) {
        reasons.push({
          icon: 'fas fa-shield-alt',
          text: `has ${coverResult} cover`,
          type: `cover-${coverResult}`
        });
      }

      // Check if concealment conditions have changed from what the override expected
      if (override.hasConcealment && targetIsVisibleToObserver && !targetHasConcealmentFromObserver) {
        reasons.push({
          icon: 'fas fa-eye-slash',
          text: 'no concealment',
          type: 'concealment-none',
          crossed: true
        });
      }
      if (!override.hasConcealment && targetHasConcealmentFromObserver) {
        reasons.push({
          icon: 'fas fa-eye-slash',
          text: 'has concealment',
          type: 'concealment-has'
        });
      }

      // Additional check for concealment: if override expected concealment but token is now clearly observed
      if (override.hasConcealment && visibility === 'observed') {
        reasons.push({
          icon: 'fas fa-eye',
          text: 'clearly visible',
          type: 'visibility-clear'
        });
      }

      // Check for "undetected" overrides that may become invalid when visibility improves significantly
      // Check overrides from manual actions, sneak actions, etc.
      if ((override.source === 'manual_action' || override.source === 'sneak_action')) {
        // If target is now clearly observed (in bright light with no concealment), 
        // "undetected" may be too strong
        if (visibility === 'observed' && !targetHasCoverFromObserver && !targetHasConcealmentFromObserver) {
          // Only flag if the observer has normal vision capabilities
          const observerToken = canvas.tokens?.get(observerId);
          if (observerToken?.actor) {
            try {
              const { VisionAnalyzer } = await import('./VisionAnalyzer.js');
              const visionAnalyzer = VisionAnalyzer.getInstance();
              const visionCapabilities = visionAnalyzer.getVisionCapabilities(observerToken.actor);

              // If observer has normal vision and target is in bright light with no obstructions,
              // "undetected" might be questionable for stealth
              // Note: We can't easily get lighting level without the debug info, so we'll be more conservative
              if (!visionCapabilities.hasDarkvision) {
                if (override.source !== 'sneak_action') {
                  reasons.push({
                    icon: 'fas fa-eye',
                    text: 'clearly visible',
                    type: 'visibility-clear'
                  });
                }
              }
            } catch (error) {
              console.warn('PF2E Visioner | Error checking vision capabilities:', error);
            }
          }
        }

        // Removed additional ninja reason icons; a single ninja tag will be added for UI separately
      }

      // Build reason icons for UI: add a compact source tag icon for each action type
      // Hide eye/eye-slash/shield reason icons in the UI; keep them internal for logic
      const reasonIconsForUi = [];
      const sourceIconMap = {
        sneak_action: { icon: 'fas fa-user-ninja', text: 'sneak', type: 'sneak-source' },
        seek_action: { icon: 'fas fa-search', text: 'seek', type: 'seek-source' },
        point_out_action: { icon: 'fas fa-hand-point-right', text: 'point out', type: 'pointout-source' },
        hide_action: { icon: 'fas fa-mask', text: 'hide', type: 'hide-source' },
        diversion_action: { icon: 'fas fa-theater-masks', text: 'diversion', type: 'diversion-source' },
        manual_action: { icon: 'fas fa-tools', text: 'manual', type: 'manual-source' },
      };
      const srcKey = override.source || 'manual_action';
      if (sourceIconMap[srcKey]) reasonIconsForUi.push(sourceIconMap[srcKey]);

      if (reasons.length > 0) {
        return {
          shouldRemove: true,
          reason: reasons.map(r => r.text).join(' and '), // Keep text for logging
          reasonIcons: reasonIconsForUi, // Pass icon data for UI (with single ninja tag if applicable)
          currentVisibility: visibility,
          currentCover: coverResult
        };
      }

      return null;
    } catch (error) {
      console.warn('PF2E Visioner | Error validating override:', error);
      return null;
    }
  }

  /**
   * Show the override validation dialog for multiple invalid overrides
   * @param {Array} invalidOverrides - Array of invalid override objects
   */
  async #showOverrideValidationDialog(invalidOverrides, movedTokenId = null) {
    if (invalidOverrides.length === 0) return;

    // Only surface the indicator for the actual mover to keep the dataset consistent.
    try {
      const lastMoved = (globalThis?.game?.pf2eVisioner?.lastMovedTokenId) || null;
      if (lastMoved && movedTokenId && movedTokenId !== lastMoved) {
        return; // skip non-mover validations for indicator; dialog can still be opened explicitly elsewhere
      }
    } catch { /* best-effort guard */ }

    // Prepare the override data for the dialog
    const overrideData = invalidOverrides.map(({ observerId, targetId, override, reason, reasonIcons, currentVisibility, currentCover }) => {
      const observer = canvas.tokens?.get(observerId);
      const target = canvas.tokens?.get(targetId);

      return {
        id: `${observerId}-${targetId}`,
        observerId,
        targetId,
        observerName: observer?.document?.name || 'Unknown',
        targetName: target?.document?.name || 'Unknown',
        state: override.state || 'undetected',
        source: override.source || 'unknown',
        reason,
        reasonIcons: reasonIcons || [],
        hasCover: override.hasCover || false,
        hasConcealment: override.hasConcealment || false,
        expectedCover: override.expectedCover,
        // Pass through the actual computed current states for UI icons
        currentVisibility: currentVisibility,
        currentCover: currentCover,
        isManual: override.source === 'manual_action'
      };
    });

    // Get the name of the token that moved (for context in dialog title)
    let movedTokenName = 'Unknown Token';
    const lastMoved = (globalThis?.game?.pf2eVisioner?.lastMovedTokenId) || movedTokenId || null;
    if (lastMoved) {
      movedTokenName = canvas.tokens?.get(lastMoved)?.document?.name || movedTokenName;
    } else if (invalidOverrides.length > 0) {
      // Fallback: infer from first invalid override participants
      const first = invalidOverrides[0];
      movedTokenName =
        canvas.tokens?.get(first?.observerId)?.document?.name ||
        canvas.tokens?.get(first?.targetId)?.document?.name ||
        movedTokenName;
    }

    // Non-obtrusive indicator instead of auto-opening dialog
    try {
      const { default: indicator } = await import('../../ui/override-validation-indicator.js');
      const headerId = lastMoved || movedTokenId || null;
      indicator.show(overrideData, movedTokenName, headerId);
    } catch (err) {
      console.warn('PF2E Visioner | Failed to show indicator, falling back to dialog:', err);
      try {
        const { OverrideValidationDialog } = await import('../../ui/override-validation-dialog.js');
        await OverrideValidationDialog.show(overrideData, movedTokenName, lastMoved || movedTokenId || null);
      } catch (error) {
        console.error('PF2E Visioner | Error showing override validation dialog:', error);
      }
    }
  }
}

// Export singleton instance
export const eventDrivenVisibilitySystem = EventDrivenVisibilitySystem.getInstance();

