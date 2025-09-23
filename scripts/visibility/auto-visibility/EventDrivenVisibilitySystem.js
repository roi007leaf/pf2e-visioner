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
  } catch {
    /* ignore */
  }
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

  /** @type {number} - Maximum distance to consider for visibility calculations (in grid units) */
  #maxVisibilityDistance = 20;

  /** @type {number} - Performance metrics for debugging */
  #performanceMetrics = {
    totalCalculations: 0,
    skippedByDistance: 0,
    skippedByLOS: 0,
    spatialOptimizations: 0,
    lastReset: Date.now(),
    movementOptimizations: {
      totalMovements: 0,
      midpointSkipped: 0,
      totalTime: 0,
      averageTime: 0,
      totalTokensChecked: 0,
      totalDistanceChecks: 0,
      totalLOSChecks: 0,
      totalWallChecks: 0,
      totalRaysCreated: 0,
      averageOptimizationSavings: 0,
    },
  };
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

  /** @type {number} - Debounce timer for visual updates */
  #visualUpdateTimeout = null;

  /** @type {number} - Debounce timer for full recalculations */
  #fullRecalcTimeout = null;

  /** @type {boolean} - Whether a full recalculation is pending */
  #pendingFullRecalc = false;

  // AVS Override Management
  /** @type {Map<string, Object>} - Active overrides by "observerId-targetId" key */
  #activeOverrides = new Map();

  // Override Validation for Token Movement
  /** @type {Set<string>} - Tokens queued for override validation */
  #tokensQueuedForValidation = new Set();

  /** @type {number} - Timeout ID for batched override validation */
  #validationTimeoutId = null;

  // Deduping and caching for override validation
  /** @type {Map<string, {pos:string, time:number}>} - Last queued validation per token (anti-spam) */
  #lastValidationRequest = new Map();
  /** @type {Map<string, {result:any, expire:number, obsPos:string, tgtPos:string}>} - Short-lived pairwise validation cache */
  #overrideValidityCache = new Map();
  /** @type {number} - Minimum spacing between queue requests for same token (ms) */
  #validationRequestDebounceMs = 250;
  /** @type {number} - TTL for cached pairwise validity results (ms) */
  #overrideValidityTtlMs = 750;
  /** @type {number} - Last time cache was pruned */
  #lastCachePruneAt = 0;

  // Position pinning to avoid flip-backs while Foundry animates to the new location
  /** @type {Map<string, {x:number,y:number,elevation:number,until:number}>} */
  #pinnedPositions = new Map();
  /** @type {number} - How long to keep a pinned destination (ms) */
  #pinDurationMs = 450;
  /** @type {number} - Distance (px) where we consider canvas synced to the pinned destination */
  #pinEpsilon = 3;

  /** Debug logger (guarded by setting autoVisibilityDebugMode) */
  #debug(...args) {
    try {
      const on = !!game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
      if (on) console.debug('PF2E Visioner | AVS', ...args);
    } catch {
      // If settings not available, do nothing
    }
  }

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
    const { refreshEveryonesPerceptionOptimized } = await import(
      '../../services/optimized-socket.js'
    );
    const { getVisibilityMap, setVisibilityBetween } = await import(
      '../../stores/visibility-map.js'
    );

    const lightingCalculator = LightingCalculator.getInstance();
    const visionAnalyzer = VisionAnalyzer.getInstance();
    const invisibilityManager = ConditionManager.getInstance();

    // Initialize the optimized visibility calculator with the core components
    optimizedVisibilityCalculator.initialize(
      lightingCalculator,
      visionAnalyzer,
      invisibilityManager,
      this, // Pass the EventDrivenVisibilitySystem instance for optimizations
    );
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
        } catch {
          /* best-effort */
        }
      })
      .catch(() => {
        /* ignore if module can't be loaded */
      });

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
    try {
      this.#debug('onTokenUpdate', tokenDoc.id, tokenDoc.name, Object.keys(changes));
    } catch { }

    // If a token's emitted light changed, that can affect how EVERYONE sees EVERYONE.
    // Escalate to a global recalculation even if the emitter is hidden.
    const lightChangedEarly = Object.prototype.hasOwnProperty.call(changes, 'light');
    if (lightChangedEarly) {
      this.#markAllTokensChangedImmediate();
      // Continue to process other changes (e.g., movement) so we can pin positions if present.
      // Do NOT early return here; just note that we'll also do a global pass.
    }

    // Simplified hidden handling: if hidden flag toggled, recalc everyone and exit.
    if (Object.prototype.hasOwnProperty.call(changes, 'hidden')) {
      try {
        const ids = canvas.tokens?.placeables?.map((t) => t.document.id) || [];
        this.recalculateForTokens(ids);
      } catch {
        /* ignore */
      }
      return;
    }

    const isHidden = tokenDoc.hidden === true;
    const positionChanged = changes.x !== undefined || changes.y !== undefined;
    const lightChanged = changes.light !== undefined;
    const visionChanged = changes.vision !== undefined;
    const effectsChanged =
      changes.actorData?.effects !== undefined || changes.actorData !== undefined;

    // If a hidden token moves while emitting light, treat it like a light move and recalc globally
    const emitterMoved = positionChanged && this.#tokenEmitsLight(tokenDoc, changes);
    if (emitterMoved) {
      this.#debug('emitter-moved: global recalculation for token light move', tokenDoc.id);
      this.#markTokenChangedWithSpatialOptimization();
      // Continue processing to pin positions for freshest geometry where applicable
    }

    if (isHidden && !lightChangedEarly && !emitterMoved) {
      // Carve-out: if this token is currently sneaking and moved, still queue override validation
      try {
        const tokHidden = canvas.tokens?.get?.(tokenDoc.id);
        const positionChangedHidden = changes.x !== undefined || changes.y !== undefined;
        const isSneakingHidden = tokHidden?.document?.getFlag?.(MODULE_ID, 'sneak-active');
        if (isSneakingHidden && positionChangedHidden) {
          try {
            globalThis.game = globalThis.game || {};
            game.pf2eVisioner = game.pf2eVisioner || {};
            game.pf2eVisioner.lastMovedTokenId = tokenDoc.id;
          } catch { }
          this.#queueOverrideValidation(tokenDoc.id);
        }
      } catch {
        /* best-effort */
      }
      return;
    }

    try {
      const tok = canvas.tokens?.get?.(tokenDoc.id);
      if (tok && this.#isExcludedToken(tok)) {
        // Carve-out: if token is excluded due to sneaking, still queue override validation on movement
        const positionChangedExcluded = changes.x !== undefined || changes.y !== undefined;
        const isSneakingExcluded = tok?.document?.getFlag?.(MODULE_ID, 'sneak-active');
        if (isSneakingExcluded && positionChangedExcluded) {
          try {
            globalThis.game = globalThis.game || {};
            game.pf2eVisioner = game.pf2eVisioner || {};
            game.pf2eVisioner.lastMovedTokenId = tokenDoc.id;
          } catch { }
          this.#queueOverrideValidation(tokenDoc.id);
        }
        return;
      }
    } catch {
      /* ignore */
    }

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
      this.#debug('store-updatedDoc', tokenDoc.id, {
        x: changes.x ?? tokenDoc.x,
        y: changes.y ?? tokenDoc.y,
        w: tokenDoc.width,
        h: tokenDoc.height,
      });

      // Pin final destination center briefly so subsequent batches (e.g., flag updates) use it
      // while the token animates toward the new location.
      try {
        if (positionChanged && canvas?.grid?.size) {
          const cx =
            (changes.x !== undefined ? changes.x : tokenDoc.x) +
            (tokenDoc.width * canvas.grid.size) / 2;
          const cy =
            (changes.y !== undefined ? changes.y : tokenDoc.y) +
            (tokenDoc.height * canvas.grid.size) / 2;
          this.#pinnedPositions.set(tokenDoc.id, {
            x: cx,
            y: cy,
            elevation: tokenDoc.elevation || 0,
            until: Date.now() + this.#pinDurationMs,
          });
          this.#debug('pin-position', tokenDoc.id, { x: cx, y: cy, untilMs: this.#pinDurationMs });
        }
      } catch {
        /* ignore */
      }

      // If light changed, we've already scheduled a global recalculation; still mark this token so
      // its updated position/flags participate with freshest data if it also moved.
      if (lightChanged) {
        this.#markAllTokensChangedImmediate();
      } else {
        // For position changes, use spatial optimization to only check relevant tokens
        if (positionChanged) {
          this.#markTokenChangedWithSpatialOptimization(tokenDoc, changes);
        } else {
          this.#markTokenChangedImmediate(tokenDoc.id);
        }
      }

      // Queue override validation for the moved token and all tokens with overrides involving it
      if (positionChanged) {
        // Persist the actual mover for downstream UI (indicator/dialog) headers
        try {
          globalThis.game = globalThis.game || {};
          game.pf2eVisioner = game.pf2eVisioner || {};
          game.pf2eVisioner.lastMovedTokenId = tokenDoc.id;
          this.#debug('set lastMovedTokenId', tokenDoc.id);
        } catch { }
        // Only queue the mover. #validateOverridesForToken scans both directions:
        // - mover as TARGET: reads flags on mover (avs-override-from-<observer>)
        // - mover as OBSERVER: scans other tokens for flags (avs-override-from-<mover>)
        // So enqueuing other tokens here is redundant and causes excess validations.
        this.#queueOverrideValidation(tokenDoc.id);
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
    } catch {
      /* ignore */
    }
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
    this.#markAllTokensChangedThrottled();
  }

  /**
   * Light source created
   */
  #onLightCreate() {
    if (!this.#enabled || !game.user.isGM) return;
    this.#markAllTokensChangedThrottled();
  }

  /**
   * Light source deleted
   */
  #onLightDelete() {
    if (!this.#enabled || !game.user.isGM) return;
    this.#markAllTokensChangedThrottled();
  }

  /**
   * Wall changed - affects line of sight for all tokens
   */
  #onWallUpdate() {
    if (!this.#enabled || !game.user.isGM) return;

    // Removed debug log

    this.#markAllTokensChangedThrottled();
  }

  #onWallCreate() {
    if (!this.#enabled || !game.user.isGM) return;

    // Removed debug log

    this.#markAllTokensChangedThrottled();
  }

  #onWallDelete() {
    if (!this.#enabled || !game.user.isGM) return;

    // Removed debug log

    this.#markAllTokensChangedThrottled();
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
      const tokens =
        canvas.tokens?.placeables.filter(
          (t) => t.actor?.id === actor.id && !this.#isExcludedToken(t),
        ) || [];

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
    const tokens =
      canvas.tokens?.placeables.filter(
        (t) => t.actor?.id === actor.id && !this.#isExcludedToken(t),
      ) || [];

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
    const darknessChanged =
      changes.environment?.darknessLevel !== undefined || changes.darkness !== undefined;
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
          (t) => t.actor?.id === actor.id && !this.#isExcludedToken(t),
        ) || [];

      if (tokens.length > 0) {
        // Removed debug log

        if (lightEmitterHint) {
          // Emitting light changed: recalc ALL because others are affected by the emitter's aura
          this.#markAllTokensChangedImmediate();
        } else {
          tokens.forEach((token) => this.#markTokenChangedImmediate(token.document.id));
        }
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
      itemName.includes('see invisibility') ||
      itemName.includes('true seeing') ||
      itemName.includes('dancing lights') ||
      itemName.includes('continual flame');

    // Strong hint that this item toggles an emitting LIGHT/DARKNESS on the token
    const lightEmitterHint =
      itemName.includes('light') ||
      itemName.includes('darkness') ||
      itemName.includes('torch') ||
      itemName.includes('lantern') ||
      itemName.includes('sunrod') ||
      itemName.includes('everburning') ||
      itemName.includes('glow') ||
      itemName.includes('luminous');

    if (
      isRelevantType &&
      (isVisibilityRelated || lightEmitterHint) &&
      item.parent?.documentName === 'Actor'
    ) {
      const actor = item.parent;
      const tokens =
        canvas.tokens?.placeables.filter(
          (t) => t.actor?.id === actor.id && !this.#isExcludedToken(t),
        ) || [];

      if (tokens.length > 0) {
        // Removed debug log

        if (lightEmitterHint) {
          // Emitting light changed: recalc ALL because others are affected by the emitter's aura
          this.#markAllTokensChangedImmediate();
        } else {
          tokens.forEach((token) => this.#markTokenChangedImmediate(token.document.id));
        }
      }
    }
  }

  /**
   * Mark a token as changed with spatial optimization for movement
   * Only checks tokens that could be affected by the movement
   */
  #markTokenChangedWithSpatialOptimization(tokenDoc, changes) {
    const tokenId = tokenDoc.id;
    this.#changedTokens.add(tokenId);

    // Calculate old and new positions for spatial optimization
    const oldPos = {
      x: tokenDoc.x + (tokenDoc.width * canvas.grid.size) / 2,
      y: tokenDoc.y + (tokenDoc.height * canvas.grid.size) / 2,
    };
    const newPos = {
      x:
        (changes.x !== undefined ? changes.x : tokenDoc.x) +
        (tokenDoc.width * canvas.grid.size) / 2,
      y:
        (changes.y !== undefined ? changes.y : tokenDoc.y) +
        (tokenDoc.height * canvas.grid.size) / 2,
    };

    // Get tokens that could be affected by this movement
    const affectedTokens = this.#getAffectedTokensByMovement(oldPos, newPos, tokenId);

    // Add affected tokens to the changed set
    affectedTokens.forEach((token) => {
      this.#changedTokens.add(token.document.id);
    });

    this.#debug('markTokenChangedWithSpatialOptimization', {
      tokenId,
      affectedCount: affectedTokens.length,
      totalChanged: this.#changedTokens.size,
      oldPos,
      newPos,
    });

    // Use requestAnimationFrame for immediate processing with fresh coordinates from #updatedTokenDocs
    if (!this.#processingBatch) {
      requestAnimationFrame(() => this.#processBatch());
    }
  }

  /**
   * Mark a token as changed - triggers IMMEDIATE processing with fresh coordinates
   */
  #markTokenChangedImmediate(tokenId) {
    this.#changedTokens.add(tokenId);
    this.#debug('markTokenChangedImmediate', tokenId, { changedSize: this.#changedTokens.size });

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
   * Throttled full recalculation to prevent excessive processing
   * Debounces rapid-fire events that would cause constant full recalculations
   */
  #markAllTokensChangedThrottled() {
    // If already pending, just extend the timeout
    if (this.#pendingFullRecalc) {
      if (this.#fullRecalcTimeout) {
        clearTimeout(this.#fullRecalcTimeout);
      }
    } else {
      this.#pendingFullRecalc = true;
    }

    this.#fullRecalcTimeout = setTimeout(() => {
      this.#pendingFullRecalc = false;
      this.#fullRecalcTimeout = null;
      this.#markAllTokensChangedImmediate();
    }, 100); // 100ms debounce for full recalculations
  }

  /**
   * Process all accumulated changes in a single batch - IMMEDIATE processing
   */
  async #processBatch() {
    if (this.#processingBatch || this.#changedTokens.size === 0) return;

    const batchStartTime = performance.now();
    this.#processingBatch = true;
    this.#debug('processBatch:start', { changed: Array.from(this.#changedTokens) });

    try {
      // Add a small delay only if there are sneaking tokens active to allow override flags to be set
      // This prevents race conditions where dual-system sets flags but AVS processes before they take effect
      const hasSneakingTokens = Array.from(this.#changedTokens).some((tokenId) => {
        const token = canvas.tokens?.get(tokenId);
        return token?.document?.getFlag('pf2e-visioner', 'sneak-active');
      });

      if (hasSneakingTokens) {
        await new Promise((resolve) => setTimeout(resolve, 25)); // Reduced delay, only when needed
      }

      // Ensure canvas perception and token geometry are up-to-date before we sample LoS/lighting.
      // Defer perception refresh to prevent RAF violations
      if (this.#updateCount > 0) {
        this.#deferHeavyOperation(() => {
          this.#scheduleVisualUpdate();
        });
        // Reduced RAF delay - only wait one frame instead of two
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      this.#debug('post-RAF settle');

      const perceptionTime = performance.now();
      this.#debug('perception timing', {
        perceptionMs: (perceptionTime - batchStartTime).toFixed(2),
      });

      // Removed debug log
      // const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
      // const startTime = performance.now();

      // Only include tokens that are not excluded per policy
      const allTokens =
        canvas.tokens?.placeables?.filter((t) => t.actor && !this.#isExcludedToken(t)) || [];
      // this.#debug(
      //   'eligible tokens',
      //   allTokens.map((t) => t.document.id),
      // );
      const updates = [];

      // Debug logging removed

      // For each changed token, recalculate visibility with spatially relevant tokens
      // Batch-local caches to avoid duplicate heavy calculations when both tokens are in the changed set
      const batchVisibilityCache = new Map(); // key: obsId|obsPos|tgtId|tgtPos -> state
      const batchLosCache = new Map(); // key: sortedPairIds|pos1|pos2 -> boolean
      const processingStartTime = performance.now();
      let processedTokens = 0;

      for (const changedTokenId of this.#changedTokens) {
        const changedToken = allTokens.find((t) => t.document.id === changedTokenId);
        if (!changedToken) {
          this.#debug('skip changedToken not found or excluded', changedTokenId);
          continue;
        }

        processedTokens++;

        // Get spatially relevant tokens for this changed token
        const changedTokenPos = this.#getTokenPosition(changedToken);
        const relevantTokens = this.#getTokensInRange(
          changedTokenPos,
          this.#maxVisibilityDistance,
          changedTokenId,
        );

        this.#debug('spatial optimization', {
          changedToken: changedTokenId,
          totalTokens: allTokens.length,
          relevantTokens: relevantTokens.length,
          reduction: `${Math.round((1 - relevantTokens.length / allTokens.length) * 100)}%`,
        });

        // Process visibility with spatially relevant tokens only
        const tokenStartTime = performance.now();
        let tokenCalculations = 0;
        let tokensFilteredByLOS = 0;

        for (const otherToken of relevantTokens) {
          if (otherToken.document.id === changedTokenId) continue;
          // Compute positions once; reuse for LOS and visibility calculations
          const changedTokenPosition = this.#getTokenPosition(changedToken);
          const otherTokenPosition = this.#getTokenPosition(otherToken);

          // Strict LOS check - only process if tokens can actually see each other
          // Cache by sorted pair id and both positions to avoid duplicate checks in the same batch
          const aId = changedToken.document.id;
          const bId = otherToken.document.id;
          const posKeyA = `${Math.round(changedTokenPosition.x)}:${Math.round(changedTokenPosition.y)}:${changedTokenPosition.elevation ?? 0}`;
          const posKeyB = `${Math.round(otherTokenPosition.x)}:${Math.round(otherTokenPosition.y)}:${otherTokenPosition.elevation ?? 0}`;
          const pairKey = aId < bId ? `${aId}|${posKeyA}::${bId}|${posKeyB}` : `${bId}|${posKeyB}::${aId}|${posKeyA}`;
          let los = batchLosCache.get(pairKey);
          if (los === undefined) {
            los = this.#canTokensSeeEachOther(changedToken, otherToken);
            batchLosCache.set(pairKey, los);
          }
          if (!los) {
            this.#performanceMetrics.skippedByLOS++;
            tokensFilteredByLOS++;
            continue;
          }

          tokenCalculations++;

          let effectiveVisibility1, effectiveVisibility2;

          // Check for visibility overrides before calculating
          let hasOverride1 = false;
          let hasOverride2 = false;

          try {
            // Check for active AVS overrides first (new system)
            const avsOverride1 = this.#getActiveOverride(
              changedToken.document.id,
              otherToken.document.id,
            );
            const avsOverride2 = this.#getActiveOverride(
              otherToken.document.id,
              changedToken.document.id,
            );

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
              const override2Flag = changedToken.document.getFlag(
                'pf2e-visioner',
                override2FlagKey,
              );

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
          this.#debug('current map', {
            changed: changedTokenId,
            other: otherToken.document.id,
            v1: currentVisibility1,
            v2: currentVisibility2,
          });

          // Calculate visibility in both directions - visibility can be asymmetric
          // due to different lighting conditions, vision capabilities, etc.
          if (!hasOverride1 || !hasOverride2) {
            this.#performanceMetrics.totalCalculations++;

            this.#debug('positions', {
              changed: changedTokenId,
              other: otherToken.document.id,
              posChanged: changedTokenPosition,
              posOther: otherTokenPosition,
            });

            // Calculate visibility in both directions using optimized calculator
            // Pass position overrides to ensure we use the latest coordinates
            if (!hasOverride1) {
              const vKey1 = `${aId}|${posKeyA}>>${bId}|${posKeyB}`;
              let visibility1 = batchVisibilityCache.get(vKey1);
              if (visibility1 === undefined) {
                visibility1 =
                  await this.#optimizedVisibilityCalculator.calculateVisibilityWithPosition(
                    changedToken,
                    otherToken,
                    changedTokenPosition,
                    otherTokenPosition,
                  );
                batchVisibilityCache.set(vKey1, visibility1);
              }
              // this.#debug('calc', {
              //   dir: 'changed->other',
              //   changed: changedTokenId,
              //   other: otherToken.document.id,
              //   result: visibility1,
              // });
              effectiveVisibility1 = visibility1;
            }

            if (!hasOverride2) {
              const vKey2 = `${bId}|${posKeyB}>>${aId}|${posKeyA}`;
              let visibility2 = batchVisibilityCache.get(vKey2);
              if (visibility2 === undefined) {
                visibility2 =
                  await this.#optimizedVisibilityCalculator.calculateVisibilityWithPosition(
                    otherToken,
                    changedToken,
                    otherTokenPosition,
                    changedTokenPosition,
                  );
                batchVisibilityCache.set(vKey2, visibility2);
              }
              // this.#debug('calc', {
              //   dir: 'other->changed',
              //   changed: changedTokenId,
              //   other: otherToken.document.id,
              //   result: visibility2,
              // });
              effectiveVisibility2 = visibility2;
            }
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
            // this.#debug('queue update', {
            //   observer: changedTokenId,
            //   target: otherToken.document.id,
            //   from: currentVisibility1,
            //   to: effectiveVisibility1,
            // });
            updates.push({
              observer: changedToken,
              target: otherToken,
              visibility: effectiveVisibility1,
            });
          }

          if (effectiveVisibility2 !== currentVisibility2) {
            // this.#debug('queue update', {
            //   observer: otherToken.document.id,
            //   target: changedTokenId,
            //   from: currentVisibility2,
            //   to: effectiveVisibility2,
            // });
            updates.push({
              observer: otherToken,
              target: changedToken,
              visibility: effectiveVisibility2,
            });
          }
        }
      }

      // Deduplicate updates before applying them
      // This prevents duplicate updates when both tokens in a pair are in the changed set
      const uniqueUpdates = [];
      const updateKeys = new Set();

      for (const update of updates) {
        const key = `${update.observer?.document?.id}-${update.target?.document?.id}`;
        if (!updateKeys.has(key)) {
          updateKeys.add(key);
          uniqueUpdates.push(update);
        }
      }

      // Apply all unique updates immediately
      if (uniqueUpdates.length > 0) {
        this.#debug(
          'apply updates',
          uniqueUpdates.map((u) => ({
            o: u.observer?.document?.id,
            t: u.target?.document?.id,
            to: u.visibility,
          })),
        );
        for (const update of uniqueUpdates) {
          this.#setVisibilityBetween?.(update.observer, update.target, update.visibility, {
            isAutomatic: true,
          });

          // Trigger hook for Token Manager refresh
          Hooks.call(
            'pf2e-visioner.visibilityChanged',
            update.observer.document.id,
            update.target.document.id,
            update.visibility,
          );
        }

        // Allow the visibility-map writes and hooks to settle visually before global refresh
        try {
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          );
        } catch {
          /* noop */
        }

        // Defer visual updates to prevent RAF violations
        if (uniqueUpdates.length > 0) {
          this.#deferHeavyOperation(() => {
            this.#scheduleVisualUpdate();
          });
        }

        this.#updateCount += uniqueUpdates.length;
      }

      const processingEndTime = performance.now();
      this.#debug('processing timing', {
        processedTokens,
        processingMs: (processingEndTime - processingStartTime).toFixed(2),
      });

      // Clear processed changes
      this.#debug('processBatch:clear', {
        totalUpdates: updates.length,
        uniqueUpdates: uniqueUpdates.length,
        duplicatesRemoved: updates.length - uniqueUpdates.length,
      });
      this.#changedTokens.clear();
      this.#updatedTokenDocs.clear();

      // Removed debug log
    } finally {
      this.#processingBatch = false;
      const batchEndTime = performance.now();
      this.#debug('processBatch:done', {
        totalMs: (batchEndTime - batchStartTime).toFixed(2),
      });
    }
  }

  // Removed unused #getMovementDistance

  /**
   * Get tokens within a certain distance of a position for spatial optimization
   * @param {Object} position - {x, y} position to search around
   * @param {number} maxDistance - Maximum distance in grid units
   * @param {string} excludeTokenId - Token ID to exclude from results
   * @returns {Token[]} Array of tokens within range
   */
  #getTokensInRange(position, maxDistance = this.#maxVisibilityDistance, excludeTokenId = null) {
    const tokens =
      canvas.tokens?.placeables?.filter((t) => {
        if (!t.actor || this.#isExcludedToken(t)) return false;
        if (excludeTokenId && t.document.id === excludeTokenId) return false;

        const tokenPos = this.#getTokenPosition(t);
        const distance = Math.hypot(tokenPos.x - position.x, tokenPos.y - position.y);

        // Convert distance to grid units (assuming 1 grid unit = canvas.grid.size pixels)
        const gridDistance = distance / (canvas.grid?.size || 1);
        return gridDistance <= maxDistance;
      }) || [];

    this.#performanceMetrics.spatialOptimizations++;
    return tokens;
  }

  /**
   * Get tokens that could be affected by a token's movement from oldPos to newPos
   * Only includes tokens that can actually see the moving token (not blocked by walls)
   * @param {Object} oldPos - Previous position {x, y}
   * @param {Object} newPos - New position {x, y}
   * @param {string} movingTokenId - ID of the moving token
   * @returns {Token[]} Array of potentially affected tokens
   */
  #getAffectedTokensByMovement(oldPos, newPos, movingTokenId) {
    const startTime = performance.now();
    const metrics = {
      movementDistance: 0,
      midpointSkipped: false,
      tokensChecked: 0,
      distanceChecks: 0,
      losChecks: 0,
      wallChecks: 0,
      raysCreated: 0,
      totalTime: 0,
      optimizationSavings: 0,
    };

    const affectedTokens = new Set();
    const allNearbyTokens = new Set();

    // Calculate movement distance to optimize midpoint checking
    const movementDistance = Math.hypot(newPos.x - oldPos.x, newPos.y - oldPos.y);
    const gridMovementDistance = movementDistance / (canvas.grid?.size || 1);
    metrics.movementDistance = gridMovementDistance;

    // Get tokens near the starting position
    const startTokens = this.#getTokensInRange(oldPos, this.#maxVisibilityDistance, movingTokenId);
    startTokens.forEach((t) => allNearbyTokens.add(t));

    // Get tokens near the ending position
    const endTokens = this.#getTokensInRange(newPos, this.#maxVisibilityDistance, movingTokenId);
    endTokens.forEach((t) => allNearbyTokens.add(t));

    // Only check midpoint for longer movements (optimization)
    if (gridMovementDistance > 2) {
      const midPos = {
        x: (oldPos.x + newPos.x) / 2,
        y: (oldPos.y + newPos.y) / 2,
      };
      const midTokens = this.#getTokensInRange(midPos, this.#maxVisibilityDistance, movingTokenId);
      midTokens.forEach((t) => allNearbyTokens.add(t));
    } else {
      metrics.midpointSkipped = true;
    }

    // Now filter by actual line of sight with optimized checks
    for (const token of allNearbyTokens) {
      metrics.tokensChecked++;
      const tokenPos = this.#getTokenPosition(token);

      // Quick distance check (avoid duplicate work from #getTokensInRange)
      const oldDistance = Math.hypot(tokenPos.x - oldPos.x, tokenPos.y - oldPos.y);
      const newDistance = Math.hypot(tokenPos.x - newPos.x, tokenPos.y - newPos.y);
      metrics.distanceChecks += 2;
      const maxGridDistance = this.#maxVisibilityDistance * (canvas.grid?.size || 1);

      const canSeeOld =
        oldDistance <= maxGridDistance &&
        this.#canTokenSeePositionOptimized(token, oldPos, metrics);
      const canSeeNew =
        newDistance <= maxGridDistance &&
        this.#canTokenSeePositionOptimized(token, newPos, metrics);
      metrics.losChecks += 2;

      // If the token can see either position, it's affected
      if (canSeeOld || canSeeNew) {
        affectedTokens.add(token);
      }
    }

    const endTime = performance.now();
    metrics.totalTime = endTime - startTime;

    // Calculate optimization savings
    const theoreticalChecks = allNearbyTokens.size * 2; // Old + New position checks
    const actualChecks = metrics.losChecks;
    metrics.optimizationSavings = (
      ((theoreticalChecks - actualChecks) / theoreticalChecks) *
      100
    ).toFixed(1);

    // Update cumulative metrics
    this.#updateMovementMetrics(metrics);

    this.#debug('movement filtering', {
      movingToken: movingTokenId,
      totalNearby: allNearbyTokens.size,
      canSee: affectedTokens.size,
      filtered: allNearbyTokens.size - affectedTokens.size,
      movementDistance: gridMovementDistance.toFixed(1),
      metrics: {
        ...metrics,
        totalTime: `${metrics.totalTime.toFixed(2)}ms`,
        optimizationSavings: `${metrics.optimizationSavings}%`,
      },
    });

    return Array.from(affectedTokens);
  }

  /**
   * Debounced visual update to prevent excessive refresh calls
   */
  #scheduleVisualUpdate() {
    if (this.#visualUpdateTimeout) {
      clearTimeout(this.#visualUpdateTimeout);
    }

    this.#visualUpdateTimeout = setTimeout(() => {
      try {
        this.#debug('debounced visual update');
        this.#refreshPerception?.();
      } catch {
        /* best-effort */
      }
      this.#visualUpdateTimeout = null;
    }, 16); // ~60fps debounce
  }

  /**
   * Defer heavy operations to prevent RAF violations
   */
  #deferHeavyOperation(operation) {
    // Use setTimeout to move heavy operations off the main thread
    setTimeout(() => {
      try {
        operation();
      } catch (error) {
        console.warn('PF2E Visioner | Deferred operation failed:', error);
      }
    }, 0);
  }

  /**
   * Prune expired entries from the override validation cache occasionally
   */
  #pruneOverrideCache() {
    const now = Date.now();
    // Limit pruning to ~once per 5s to keep overhead negligible
    if (now - this.#lastCachePruneAt < 5000) return;
    for (const [key, entry] of this.#overrideValidityCache) {
      if (!entry || entry.expire <= now) this.#overrideValidityCache.delete(key);
    }
    this.#lastCachePruneAt = now;
  }

  /**
   * Update cumulative movement optimization metrics
   * @param {Object} metrics - Current movement metrics
   */
  #updateMovementMetrics(metrics) {
    const mov = this.#performanceMetrics.movementOptimizations;

    mov.totalMovements++;
    if (metrics.midpointSkipped) mov.midpointSkipped++;

    mov.totalTime += metrics.totalTime;
    mov.averageTime = mov.totalTime / mov.totalMovements;

    mov.totalTokensChecked += metrics.tokensChecked;
    mov.totalDistanceChecks += metrics.distanceChecks;
    mov.totalLOSChecks += metrics.losChecks;
    mov.totalWallChecks += metrics.wallChecks;
    mov.totalRaysCreated += metrics.raysCreated;

    // Calculate running average of optimization savings
    const currentSavings = parseFloat(metrics.optimizationSavings);
    mov.averageOptimizationSavings =
      (mov.averageOptimizationSavings * (mov.totalMovements - 1) + currentSavings) /
      mov.totalMovements;
  }

  /**
   * Optimized version of canTokenSeePosition with better performance tracking
   * @param {Token} token - The observing token
   * @param {Object} position - {x, y} position to check
   * @param {Object} metrics - Metrics object to track performance
   * @returns {boolean} True if the token can see the position
   */
  #canTokenSeePositionOptimized(token, position, metrics) {
    try {
      const tokenPos = this.#getTokenPosition(token);

      // Create ray from token to position
      const ray = new foundry.canvas.geometry.Ray(tokenPos, position);
      metrics.raysCreated++;

      // Check for walls blocking line of sight
      if (canvas.walls?.length > 0) {
        try {
          const wallsInBounds = canvas.walls.quadtree.getObjects(ray.bounds);
          metrics.wallChecks += wallsInBounds.length;

          // Check if any walls actually block the line
          for (const wall of wallsInBounds) {
            // A wall is solid if it blocks movement (move > 0) and is not a door (door === 0 or door === null)
            const isSolidWall =
              wall.document.move > 0 && (wall.document.door === 0 || wall.document.door === null);

            if (isSolidWall) {
              // This is a solid wall, check if it intersects our ray
              if (ray.intersectSegment(wall.coords)) {
                return false; // Wall blocks line of sight
              }
            }
          }
        } catch {
          // If we can't check walls properly, assume they can see (conservative approach)
          return true;
        }
      }

      return true;
    } catch {
      // If we can't determine, assume they can see (conservative approach)
      return true;
    }
  }

  /**
   * Check if two tokens can see each other (bidirectional line of sight)
   * @param {Token} token1 - First token
   * @param {Token} token2 - Second token
   * @returns {boolean} True if both tokens can see each other
   */
  #canTokensSeeEachOther(token1, token2) {
    try {
      const pos1 = this.#getTokenPosition(token1);
      const pos2 = this.#getTokenPosition(token2);

      // Quick distance check first
      const distance = Math.hypot(pos1.x - pos2.x, pos1.y - pos2.y);
      const gridDistance = distance / (canvas.grid?.size || 1);

      if (gridDistance > this.#maxVisibilityDistance) {
        return false;
      }

      // Check for walls blocking line of sight in both directions
      const walls = canvas.walls?.objects?.children || [];

      if (walls.length > 0) {
        try {
          // Create Ray using the correct FoundryVTT API
          const ray = new foundry.canvas.geometry.Ray(pos1, pos2);

          const wallsInBounds = canvas.walls.quadtree.getObjects(ray.bounds);

          // Check if any walls actually block the line
          for (const wall of wallsInBounds) {
            // A wall is solid if it blocks movement (move > 0) and is not a door (door === 0 or door === null)
            const isSolidWall =
              wall.document.move > 0 && (wall.document.door === 0 || wall.document.door === null);

            if (isSolidWall) {
              // This is a solid wall, check if it intersects our ray
              if (ray.intersectSegment(wall.coords)) {
                return false; // Wall blocks line of sight
              }
            }
          }
        } catch {
          // If we can't check walls properly, assume they can see (conservative approach)
          return true;
        }
      }

      return true;
    } catch {
      // If we can't determine, assume they can see (conservative approach)
      return true;
    }
  }

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
      // this.#debug('getTokenPosition:updated', token.document.id, position);
      return position;
    }

    // Fallback to live token position from canvas if available
    const canvasToken = canvas.tokens.get(token.document.id);
    // If we have a pinned destination for a recent move, keep using it until canvas catches up
    try {
      const pin = this.#pinnedPositions.get(token.document.id);
      if (pin) {
        const now = Date.now();
        const cx = canvasToken?.document
          ? canvasToken.document.x + (canvasToken.document.width * canvas.grid.size) / 2
          : null;
        const cy = canvasToken?.document
          ? canvasToken.document.y + (canvasToken.document.height * canvas.grid.size) / 2
          : null;
        const close =
          cx !== null && cy !== null
            ? Math.hypot(cx - pin.x, cy - pin.y) <= this.#pinEpsilon
            : false;
        if (now <= pin.until && !close) {
          const position = { x: pin.x, y: pin.y, elevation: pin.elevation };
          // this.#debug('getTokenPosition:pinned', token.document.id, position);
          return position;
        }
        // Clear expired or matched pins
        if (now > pin.until || close) {
          this.#pinnedPositions.delete(token.document.id);
          this.#debug('clear-pin', token.document.id, {
            reason: now > pin.until ? 'expired' : 'synced',
          });
        }
      }
    } catch {
      /* ignore */
    }
    if (canvasToken && canvasToken.document) {
      const position = {
        x: canvasToken.document.x + (canvasToken.document.width * canvas.grid.size) / 2,
        y: canvasToken.document.y + (canvasToken.document.height * canvas.grid.size) / 2,
        elevation: canvasToken.document.elevation || 0,
      };
      // this.#debug('getTokenPosition:canvas', token.document.id, position);
      return position;
    }

    // Final fallback to document coordinates
    const position = {
      x: token.document.x + (token.document.width * canvas.grid.size) / 2,
      y: token.document.y + (token.document.height * canvas.grid.size) / 2,
      elevation: token.document.elevation || 0,
    };
    // this.#debug('getTokenPosition:doc', token.document.id, position);
    return position;
  }

  // Helper: where did we source the last position from? (removed - only used in debug logs)
  // #getPositionSource(token) {
  //   if (this.#updatedTokenDocs.has(token.document.id)) return 'updated';
  //   if (this.#pinnedPositions.has(token.document.id)) return 'pinned';
  //   const canvasToken = canvas.tokens.get(token.document.id);
  //   if (canvasToken && canvasToken.document) return 'canvas';
  //   return 'doc';
  // }

  // Determine if a token is currently emitting light or darkness based on its document light config
  // and common PF2e effect/item flags/names. Best-effort heuristic; returns true if likely emitting.
  #tokenEmitsLight(tokenDoc, changes) {
    try {
      // If token light config exists and any radius is non-zero, it's emitting
      const light = changes?.light !== undefined ? changes.light : tokenDoc.light;
      if (light && (Number(light.bright) > 0 || Number(light.dim) > 0)) return true;

      // Heuristic: check flags/items/effects for common light/darkness keywords
      const names = [];
      try {
        if (Array.isArray(tokenDoc.actor?.effects))
          names.push(
            ...tokenDoc.actor.effects.map((e) => String(e.name || e.label || '').toLowerCase()),
          );
      } catch { }
      try {
        if (Array.isArray(tokenDoc.actor?.items))
          names.push(...tokenDoc.actor.items.map((i) => String(i.name || '').toLowerCase()));
      } catch { }
      const hay = names.join(' ');
      if (
        /\b(light|torch|lantern|sunrod|everburning|glow|luminous|continual flame|dancing lights|darkness)\b/i.test(
          hay,
        )
      ) {
        // We can’t be certain radii are configured on the token doc, but the presence suggests it may emit
        return true;
      }
    } catch {
      /* noop */
    }
    return false;
  }

  // Removed unused #passesFoundryVisibility

  /**
   * Central predicate: tokens excluded from AVS calculations
   * Keep exclusion minimal to avoid delaying state updates at visibility borders.
   * - Foundry hidden
   * - Defeated/unconscious/dead (cannot observe others)
   * - Loot tokens (no vision capabilities)
   * - Hazards (no vision capabilities)
   */
  #isExcludedToken(token) {
    try {
      if (!token?.document) return true;
      if (token.document.hidden) return true;

      // Skip loot tokens and hazards - they don't have vision capabilities
      try {
        const actor = token.actor;
        if (actor) {
          const actorType = actor.type?.toLowerCase();
          const actorName = actor.name?.toLowerCase() || '';

          // Skip loot tokens
          if (actorType === 'loot') {
            // this.#debug('exclude loot token', token.document.id, actorName);
            return true;
          }

          // Skip hazards
          if (actorType === 'hazard') {
            // this.#debug('exclude hazard token', token.document.id, actorName);
            return true;
          }

          // Skip tokens with "loot" or "hazard" in their name (fallback detection)
          if (
            actorName.includes('loot') ||
            actorName.includes('hazard') ||
            actorName.includes('treasure') ||
            actorName.includes('chest')
          ) {
            // this.#debug('exclude token by name pattern', token.document.id, actorName);
            return true;
          }
        }
      } catch {
        // Non-fatal; ignore and proceed
      }

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

    // Clear any pending visual updates
    if (this.#visualUpdateTimeout) {
      clearTimeout(this.#visualUpdateTimeout);
      this.#visualUpdateTimeout = null;
    }

    // Clear any pending full recalculations
    if (this.#fullRecalcTimeout) {
      clearTimeout(this.#fullRecalcTimeout);
      this.#fullRecalcTimeout = null;
    }
    this.#pendingFullRecalc = false;
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
      description: 'Zero-delay event-driven visibility system with spatial optimization',
      performanceMetrics: this.#performanceMetrics,
      maxVisibilityDistance: this.#maxVisibilityDistance,
    };
  }

  /**
   * Get performance metrics for debugging
   */
  getPerformanceMetrics() {
    const now = Date.now();
    const timeSinceReset = now - this.#performanceMetrics.lastReset;
    const calculationsPerSecond =
      this.#performanceMetrics.totalCalculations / (timeSinceReset / 1000);

    return {
      ...this.#performanceMetrics,
      calculationsPerSecond: Math.round(calculationsPerSecond * 100) / 100,
      timeSinceReset: Math.round(timeSinceReset / 1000),
      efficiency: {
        spatialOptimizations: this.#performanceMetrics.spatialOptimizations,
        skippedByDistance: this.#performanceMetrics.skippedByDistance,
        skippedByLOS: this.#performanceMetrics.skippedByLOS,
        totalSkipped:
          this.#performanceMetrics.skippedByDistance + this.#performanceMetrics.skippedByLOS,
        skipRate:
          this.#performanceMetrics.totalCalculations > 0
            ? Math.round(
              ((this.#performanceMetrics.skippedByDistance +
                this.#performanceMetrics.skippedByLOS) /
                this.#performanceMetrics.totalCalculations) *
              100,
            )
            : 0,
      },
      movementOptimizations: {
        ...this.#performanceMetrics.movementOptimizations,
        averageTime:
          Math.round(this.#performanceMetrics.movementOptimizations.averageTime * 100) / 100,
        averageOptimizationSavings:
          Math.round(
            this.#performanceMetrics.movementOptimizations.averageOptimizationSavings * 100,
          ) / 100,
        midpointSkipRate:
          this.#performanceMetrics.movementOptimizations.totalMovements > 0
            ? Math.round(
              (this.#performanceMetrics.movementOptimizations.midpointSkipped /
                this.#performanceMetrics.movementOptimizations.totalMovements) *
              100,
            )
            : 0,
      },
    };
  }

  /**
   * Get detailed movement optimization metrics
   */
  getMovementMetrics() {
    const mov = this.#performanceMetrics.movementOptimizations;
    return {
      totalMovements: mov.totalMovements,
      midpointSkipped: mov.midpointSkipped,
      midpointSkipRate:
        mov.totalMovements > 0
          ? Math.round((mov.midpointSkipped / mov.totalMovements) * 100) + '%'
          : '0%',
      totalTime: Math.round(mov.totalTime * 100) / 100 + 'ms',
      averageTime: Math.round(mov.averageTime * 100) / 100 + 'ms',
      totalTokensChecked: mov.totalTokensChecked,
      totalDistanceChecks: mov.totalDistanceChecks,
      totalLOSChecks: mov.totalLOSChecks,
      totalWallChecks: mov.totalWallChecks,
      totalRaysCreated: mov.totalRaysCreated,
      averageOptimizationSavings: Math.round(mov.averageOptimizationSavings * 100) / 100 + '%',
      efficiency: {
        tokensPerMovement:
          mov.totalMovements > 0 ? Math.round(mov.totalTokensChecked / mov.totalMovements) : 0,
        checksPerToken:
          mov.totalTokensChecked > 0 ? Math.round(mov.totalLOSChecks / mov.totalTokensChecked) : 0,
        wallsPerCheck:
          mov.totalLOSChecks > 0 ? Math.round(mov.totalWallChecks / mov.totalLOSChecks) : 0,
      },
    };
  }

  /**
   * Reset performance metrics
   */
  resetPerformanceMetrics() {
    this.#performanceMetrics = {
      totalCalculations: 0,
      skippedByDistance: 0,
      skippedByLOS: 0,
      spatialOptimizations: 0,
      lastReset: Date.now(),
      movementOptimizations: {
        totalMovements: 0,
        midpointSkipped: 0,
        totalTime: 0,
        averageTime: 0,
        totalTokensChecked: 0,
        totalDistanceChecks: 0,
        totalLOSChecks: 0,
        totalWallChecks: 0,
        totalRaysCreated: 0,
        averageOptimizationSavings: 0,
      },
    };
  }

  /**
   * Set maximum visibility distance for spatial optimization
   * @param {number} distance - Distance in grid units
   */
  setMaxVisibilityDistance(distance) {
    this.#maxVisibilityDistance = Math.max(1, Math.min(50, distance));
    this.#debug('maxVisibilityDistance set to', this.#maxVisibilityDistance);
  }

  /**
   * Debug method to visualize which tokens are being checked for a moving token
   * @param {string} movingTokenId - ID of the moving token
   * @param {Object} oldPos - Old position {x, y}
   * @param {Object} newPos - New position {x, y}
   */
  debugMovementAffectedTokens(movingTokenId, oldPos, newPos) {
    const affectedTokens = this.#getAffectedTokensByMovement(oldPos, newPos, movingTokenId);

    return affectedTokens;
  }

  /**
   * Check if a token is excluded from AVS calculations (public method)
   * @param {Token} token - Token to check
   * @returns {boolean} Whether the token is excluded
   */
  isExcludedToken(token) {
    return this.#isExcludedToken(token);
  }

  /**
   * Get the maximum visibility distance (public method)
   * @returns {number} Maximum visibility distance in grid units
   */
  getMaxVisibilityDistance() {
    return this.#maxVisibilityDistance;
  }

  /**
   * Check if two tokens can see each other (public method)
   * @param {Token} token1 - First token
   * @param {Token} token2 - Second token
   * @returns {boolean} Whether the tokens can see each other
   */
  canTokensSeeEachOther(token1, token2) {
    return this.#canTokensSeeEachOther(token1, token2);
  }

  /**
   * Get token position (public method for debugging)
   * @param {Token} token - Token to get position for
   * @returns {Object} Position object with x, y coordinates
   */
  getTokenPosition(token) {
    return this.#getTokenPosition(token);
  }

  /**
   * Get visibility map for a token (public method for debugging)
   * @param {Token} token - Token to get visibility map for
   * @returns {Object} Visibility map object
   */
  getVisibilityMap(token) {
    return this.#getVisibilityMap?.(token);
  }

  /**
   * Get the optimized visibility calculator (public method for debugging)
   * @returns {Object} The visibility calculator instance
   */
  getVisibilityCalculator() {
    return this.#optimizedVisibilityCalculator;
  }

  /**
   * Mark a token as changed (public method for debugging)
   * @param {TokenDocument} tokenDoc - Token document
   * @param {Object} changes - Changes made to the token
   */
  markTokenChanged(tokenDoc, changes) {
    this.#markTokenChangedWithSpatialOptimization(tokenDoc, changes);
  }

  /**
   * Get statistics about token exclusions for debugging
   * @returns {Object} Statistics about excluded tokens
   */
  getExclusionStats() {
    const allTokens = canvas.tokens?.placeables || [];
    const stats = {
      total: allTokens.length,
      excluded: 0,
      included: 0,
      byType: {
        hidden: 0,
        loot: 0,
        hazard: 0,
        defeated: 0,
        namePattern: 0,
        other: 0,
      },
      excludedTokens: [],
    };

    for (const token of allTokens) {
      if (this.#isExcludedToken(token)) {
        stats.excluded++;
        const actor = token.actor;
        const actorType = actor?.type?.toLowerCase() || 'unknown';
        const actorName = actor?.name?.toLowerCase() || '';

        let exclusionReason = 'other';
        if (token.document.hidden) {
          exclusionReason = 'hidden';
          stats.byType.hidden++;
        } else if (actorType === 'loot') {
          exclusionReason = 'loot';
          stats.byType.loot++;
        } else if (actorType === 'hazard') {
          exclusionReason = 'hazard';
          stats.byType.hazard++;
        } else if (
          actorName.includes('loot') ||
          actorName.includes('hazard') ||
          actorName.includes('treasure') ||
          actorName.includes('chest')
        ) {
          exclusionReason = 'namePattern';
          stats.byType.namePattern++;
        } else {
          exclusionReason = 'defeated';
          stats.byType.defeated++;
        }

        stats.excludedTokens.push({
          id: token.document.id,
          name: token.name,
          type: actorType,
          reason: exclusionReason,
        });
      } else {
        stats.included++;
      }
    }

    return stats;
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

    const sneakingTokens =
      canvas.tokens?.placeables?.filter(
        (t) =>
          t.actor &&
          !this.#isExcludedToken(t) &&
          t.document.getFlag('pf2e-visioner', 'sneak-active'),
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
      } catch {
        /* ignore */
      }

      // 2) Check current visibility map (observer -> target)
      try {
        const current = this.#getVisibilityMap?.(observer)?.[target.document.id];
        if (current) return current;
      } catch {
        /* ignore */
      }

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
      const tokens =
        canvas.tokens?.placeables.filter(
          (t) => t.actor?.id === actor.id && !this.#isExcludedToken(t),
        ) || [];

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
    const { looksLikeLight } = this.#getTemplateNameAndLightHint(template);

    // Special handling: Darkness spell -> create a magical darkness light source matching the template radius
    try {
      if (this.#isDarknessTemplate(template)) {
        this.#ensureDarknessLightForTemplate(template);
      }
    } catch {
      /* best-effort */
    }

    if (looksLikeLight) {
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
      const { looksLikeLight } = this.#getTemplateNameAndLightHint(template);

      // Keep linked Darkness light in sync
      try {
        if (this.#isDarknessTemplate(template)) {
          this.#syncDarknessLightForTemplate(template);
        }
      } catch {
        /* best-effort */
      }

      if (looksLikeLight) {
        this.#markAllTokensChangedImmediate();
      }
    }
  }

  /**
   * Handle template deletion (might affect lighting)
   */
  #onTemplateDelete(template) {
    if (!this.#enabled || !game.user.isGM) return;

    const { looksLikeLight } = this.#getTemplateNameAndLightHint(template);

    // Cleanup linked Darkness light source if present
    try {
      if (this.#isDarknessTemplate(template)) {
        this.#removeDarknessLightForTemplate(template);
      }
    } catch {
      /* best-effort */
    }

    if (looksLikeLight) {
      this.#markAllTokensChangedImmediate();
    }
  }

  /**
   * Heuristics to extract name and identify light-like templates from PF2e flags.
   */
  #getTemplateNameAndLightHint(template) {
    try {
      const item = template.flags?.pf2e?.item || {};
      const origin = template.flags?.pf2e?.origin || {};
      const name = (item.name || origin.name || '').toString();
      const nameLower = name.toLowerCase();
      const looksLikeLight =
        nameLower.includes('light') ||
        nameLower.includes('darkness') ||
        nameLower.includes('shadow');
      return { nameLower, looksLikeLight };
    } catch {
      return { nameLower: '', looksLikeLight: false };
    }
  }

  /**
   * Robust check if a measured template represents the Darkness spell
   */
  #isDarknessTemplate(template) {
    try {
      const normalize = (v = '') =>
        String(v)
          .toLowerCase()
          .replace(/\u2019/g, "'")
          .replace(/'+/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
      const pf2e = template.flags?.pf2e || {};
      const item = pf2e.item || {};
      const origin = pf2e.origin || {};
      const slug = normalize(origin.slug || item.slug || origin.name || item.name || '');
      if (slug === 'darkness') return true;
      const name = (origin.name || item.name || '').toString().toLowerCase();
      if (name.includes('darkness')) return true;
      const rawList = [
        ...(origin.traits || []),
        ...(item.traits || []),
        ...(origin.rollOptions || []),
        ...(item.rollOptions || []),
      ].map((t) => String(t).toLowerCase());
      const rawSet = new Set(rawList);
      if (
        rawSet.has('darkness') ||
        rawSet.has('origin:item:darkness') ||
        rawSet.has('origin:item:slug:darkness') ||
        rawList.some((t) => t.includes('darkness'))
      ) {
        return true;
      }
      const normSet = new Set(rawList.map((t) => normalize(t)));
      if (
        normSet.has('darkness') ||
        normSet.has('origin-item-darkness') ||
        normSet.has('origin-item-slug-darkness')
      ) {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Ensure a magical darkness light exists for a Darkness template and link it via flags.
   * Creates the light if missing.
   */
  async #ensureDarknessLightForTemplate(template) {
    try {
      const existingId = template.getFlag?.(MODULE_ID, 'darknessLightId');
      if (existingId && canvas.scene?.lights?.get?.(existingId)) {
        // Already linked; sync to ensure correct radius/position
        await this.#syncDarknessLightForTemplate(template);
        return;
      }

      const dist = Number(template.distance) || 20;
      // Determine cast rank from PF2e flags (origin preferred)
      let darknessRank = 0;
      try {
        const pf2e = template.flags?.pf2e || {};
        const origin = pf2e.origin || {};
        const item = pf2e.item || {};
        darknessRank = Number(origin.castRank || item.castRank || 0) || 0;
        if (!darknessRank) {
          const rolls = [...(origin.rollOptions || []), ...(item.rollOptions || [])];
          const rankOpt = rolls.find((r) => /(^|:)rank:(\d+)/i.test(String(r)));
          if (rankOpt) {
            const m = String(rankOpt).match(/(^|:)rank:(\d+)/i);
            if (m) darknessRank = Number(m[2]) || 0;
          }
        }
      } catch {
        /* ignore */
      }
      const data = {
        x: template.x,
        y: template.y,
        hidden: false,
        flags: {
          [MODULE_ID]: {
            heightenedDarkness: darknessRank >= 4,
            linkedTemplateId: template.id,
            source: 'pf2e-darkness',
            darknessRank,
          },
        },
        config: { bright: dist, dim: dist, negative: true },
        rotation: 0,
        walls: true,
        vision: true,
      };
      const created = await canvas.scene?.createEmbeddedDocuments?.('AmbientLight', [data]);
      const createdDoc = Array.isArray(created) ? created[0] : null;
      const lightId = createdDoc?.id || createdDoc?._id || null;
      if (lightId) {
        try {
          await template.setFlag?.(MODULE_ID, 'darknessLightId', lightId);
        } catch {
          /* ignore */
        }
      }
    } catch (e) {
      console.warn('PF2E Visioner | Failed to create Darkness light for template:', e);
    }
  }

  /**
   * Sync the linked Darkness light to the template's position and radius.
   */
  async #syncDarknessLightForTemplate(template) {
    try {
      const lightId = template.getFlag?.(MODULE_ID, 'darknessLightId');
      if (!lightId) return;
      const dist = Number(template.distance) || 20;
      // Try to update the darkness rank flag as well
      let darknessRank = null;
      try {
        const pf2e = template.flags?.pf2e || {};
        const origin = pf2e.origin || {};
        const item = pf2e.item || {};
        darknessRank = Number(origin.castRank || item.castRank || 0) || null;
        if (!darknessRank) {
          const rolls = [...(origin.rollOptions || []), ...(item.rollOptions || [])];
          const rankOpt = rolls.find((r) => /(^|:)rank:(\d+)/i.test(String(r)));
          if (rankOpt) {
            const m = String(rankOpt).match(/(^|:)rank:(\d+)/i);
            if (m) darknessRank = Number(m[2]) || null;
          }
        }
      } catch {
        /* ignore */
      }
      const update = {
        _id: lightId,
        x: template.x,
        y: template.y,
        'config.bright': dist,
        'config.dim': dist,
        'config.negative': true,
        hidden: false,
        ...(darknessRank ? { [`flags.${MODULE_ID}.darknessRank`]: darknessRank } : {}),
      };
      // Only mark heightenedDarkness when heightened to rank >= 4
      if (typeof darknessRank === 'number') {
        const on = darknessRank >= 4;
        update[`flags.${MODULE_ID}.heightenedDarkness`] = on;
      }
      await canvas.scene?.updateEmbeddedDocuments?.('AmbientLight', [update]);
    } catch (e) {
      console.warn('PF2E Visioner | Failed to sync Darkness light for template:', e);
    }
  }

  /**
   * Remove the linked Darkness light when the template is deleted or effect ends.
   */
  async #removeDarknessLightForTemplate(template) {
    try {
      const lightId = template.getFlag?.(MODULE_ID, 'darknessLightId');
      if (!lightId) return;
      try {
        await canvas.scene?.deleteEmbeddedDocuments?.('AmbientLight', [lightId]);
      } catch {
        /* ignore delete errors */
      }
      try {
        await template.unsetFlag?.(MODULE_ID, 'darknessLightId');
      } catch {
        /* ignore flag errors */
      }
    } catch (e) {
      console.warn('PF2E Visioner | Failed to remove Darkness light for template:', e);
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
    if (!this.#enabled || !game.user.isGM) return;

    // Deduplicate rapid-fire requests for the same token at the same spot
    try {
      const tok = canvas.tokens?.get?.(tokenId);
      const doc = tok?.document;
      const cx = doc ? doc.x + (doc.width * (canvas.grid?.size || 1)) / 2 : 0;
      const cy = doc ? doc.y + (doc.height * (canvas.grid?.size || 1)) / 2 : 0;
      const posKey = `${Math.round(cx)}:${Math.round(cy)}:${doc?.elevation ?? 0}`;
      const now = Date.now();
      const last = this.#lastValidationRequest.get(tokenId);
      if (last && last.pos === posKey && now - last.time < this.#validationRequestDebounceMs) {
        // Ignore duplicate queue within debounce window at same position
        return;
      }
      this.#lastValidationRequest.set(tokenId, { pos: posKey, time: now });
    } catch {
      /* best-effort guard */
    }

    this.#tokensQueuedForValidation.add(tokenId);

    // Clear existing timeout and set new one to batch validations
    if (this.#validationTimeoutId) {
      clearTimeout(this.#validationTimeoutId);
    }

    // Validate after a short delay to handle waypoints and complete movements
    this.#validationTimeoutId = setTimeout(() => {
      this.#pruneOverrideCache();
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
          const lastMovedId = globalThis?.game?.pf2eVisioner?.lastMovedTokenId || null;
          if (lastMovedId && tokenId !== lastMovedId) {
            // Skip displaying indicator for non-mover validations
            continue;
          }
        } catch {
          /* best effort guard */
        }
        // Filter to only items where there is an actual change (visibility or cover)
        const filtered = result.overrides.filter((o) => {
          const prevVis = o.state || (o.hasConcealment ? 'concealed' : 'observed');
          const prevCover = o.expectedCover ?? (o.hasCover ? 'standard' : 'none');
          const curVis = o.currentVisibility || 'observed';
          const curCover = o.currentCover || 'none';
          return prevVis !== curVis || prevCover !== curCover;
        });
        if (filtered.length > 0) {
          try {
            const { default: indicator } = await import(
              '../../ui/override-validation-indicator.js'
            );
            const movedId = globalThis?.game?.pf2eVisioner?.lastMovedTokenId || tokenId;
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
      } catch {
        /* noop */
      }

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
              if (
                typeof optimizedVisibilityCalculator.calculateVisibilityWithoutOverrides ===
                'function'
              ) {
                visibility =
                  await optimizedVisibilityCalculator.calculateVisibilityWithoutOverrides(
                    movedToken,
                    t,
                  );
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
          } catch {
            /* best effort only */
          }

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
      } catch {
        /* noop */
      }

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
        const observer =
          !observerTok || this.#isExcludedToken(observerTok)
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
            targetName: flagData.targetName || movedToken.name,
          },
          observerId,
          targetId,
          type: 'flag',
          flagKey,
          token: movedToken,
        });
        // DEBUG: Print each flag key and data found on the mover
      }
    } catch (errTarget) {
      console.warn('[PF2E Visioner] OVERRIDE SCAN (as target) error', errTarget);
    }

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
            targetName: flagData.targetName || token.name,
          },
          observerId,
          targetId,
          type: 'flag',
          flagKey,
          token,
        });
      }
    } catch (errObserver) {
      console.warn('[PF2E Visioner] OVERRIDE SCAN (as observer) error', errObserver);
    }

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
          token,
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
            if (
              typeof optimizedVisibilityCalculator.calculateVisibilityWithoutOverrides ===
              'function'
            ) {
              visibility = await optimizedVisibilityCalculator.calculateVisibilityWithoutOverrides(
                obs,
                movedToken,
              );
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
        } catch {
          /* best effort */
        }
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
          currentCover,
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
            if (
              typeof optimizedVisibilityCalculator.calculateVisibilityWithoutOverrides ===
              'function'
            ) {
              visibility = await optimizedVisibilityCalculator.calculateVisibilityWithoutOverrides(
                movedToken,
                t,
              );
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
          currentCover,
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

    // Short-lived cache: if same pair at same positions was just validated, reuse the result
    let __obsPosKey;
    let __tgtPosKey;
    let __cacheKey;
    let __now;
    try {
      const obsPos = this.#getTokenPosition(observer);
      const tgtPos = this.#getTokenPosition(target);
      const obsPosKey = `${Math.round(obsPos.x)}:${Math.round(obsPos.y)}:${obsPos.elevation ?? 0}`;
      const tgtPosKey = `${Math.round(tgtPos.x)}:${Math.round(tgtPos.y)}:${tgtPos.elevation ?? 0}`;
      const cacheKey = `${observerId}-${targetId}`;
      const now = Date.now();
      const cached = this.#overrideValidityCache.get(cacheKey);
      if (
        cached &&
        cached.obsPos === obsPosKey &&
        cached.tgtPos === tgtPosKey &&
        cached.expire > now
      ) {
        return cached.result;
      }
      // Defer heavy work; after computation we'll populate cache
      __obsPosKey = obsPosKey;
      __tgtPosKey = tgtPosKey;
      __cacheKey = cacheKey;
      __now = now;
      // Wrap the rest of the method in a try/finally-like behavior by storing keys in closure
      // and setting cache before returning.
      // The actual computation continues below.
    } catch {
      // If anything fails, just compute without cache
    }

    try {
      // Calculate current visibility and get detailed information
      // For override validation, always use the true AVS-calculated state (ignore manual overrides)
      let visibility;
      try {
        const { optimizedVisibilityCalculator } = await import('./VisibilityCalculator.js');
        // Use a special option or bypass to ignore overrides if supported
        if (
          typeof optimizedVisibilityCalculator.calculateVisibilityWithoutOverrides === 'function'
        ) {
          visibility = await optimizedVisibilityCalculator.calculateVisibilityWithoutOverrides(
            observer,
            target,
          );
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
      const targetHasConcealmentFromObserver =
        visibility === 'concealed' || visibility === 'hidden';
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
            crossed: true,
          });
        }
      }
      if (!override.hasCover && targetHasCoverFromObserver) {
        reasons.push({
          icon: 'fas fa-shield-alt',
          text: `has ${coverResult} cover`,
          type: `cover-${coverResult}`,
        });
      }

      // Check if concealment conditions have changed from what the override expected
      if (
        override.hasConcealment &&
        targetIsVisibleToObserver &&
        !targetHasConcealmentFromObserver
      ) {
        reasons.push({
          icon: 'fas fa-eye-slash',
          text: 'no concealment',
          type: 'concealment-none',
          crossed: true,
        });
      }
      if (!override.hasConcealment && targetHasConcealmentFromObserver) {
        reasons.push({
          icon: 'fas fa-eye-slash',
          text: 'has concealment',
          type: 'concealment-has',
        });
      }

      // Additional check for concealment: if override expected concealment but token is now clearly observed
      if (override.hasConcealment && visibility === 'observed') {
        reasons.push({
          icon: 'fas fa-eye',
          text: 'clearly visible',
          type: 'visibility-clear',
        });
      }

      // Check for "undetected" overrides that may become invalid when visibility improves significantly
      // Check overrides from manual actions, sneak actions, etc.
      if (override.source === 'manual_action' || override.source === 'sneak_action') {
        // If target is now clearly observed (in bright light with no concealment),
        // "undetected" may be too strong
        if (
          visibility === 'observed' &&
          !targetHasCoverFromObserver &&
          !targetHasConcealmentFromObserver
        ) {
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
                    type: 'visibility-clear',
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
        point_out_action: {
          icon: 'fas fa-hand-point-right',
          text: 'point out',
          type: 'pointout-source',
        },
        hide_action: { icon: 'fas fa-mask', text: 'hide', type: 'hide-source' },
        diversion_action: {
          icon: 'fas fa-theater-masks',
          text: 'diversion',
          type: 'diversion-source',
        },
        manual_action: { icon: 'fas fa-tools', text: 'manual', type: 'manual-source' },
      };
      const srcKey = override.source || 'manual_action';
      if (sourceIconMap[srcKey]) reasonIconsForUi.push(sourceIconMap[srcKey]);

      let result = null;
      if (reasons.length > 0) {
        result = {
          shouldRemove: true,
          reason: reasons.map((r) => r.text).join(' and '), // Keep text for logging
          reasonIcons: reasonIconsForUi, // Pass icon data for UI (with single ninja tag if applicable)
          currentVisibility: visibility,
          currentCover: coverResult,
        };
      }

      // Populate cache for this pair/position snapshot
      try {
        const expire = (__now || Date.now()) + this.#overrideValidityTtlMs;
        this.#overrideValidityCache.set(__cacheKey || `${observerId}-${targetId}`, {
          result,
          expire,
          obsPos: __obsPosKey,
          tgtPos: __tgtPosKey,
        });
      } catch {
        /* noop */
      }

      return result;
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
      const lastMoved = globalThis?.game?.pf2eVisioner?.lastMovedTokenId || null;
      if (lastMoved && movedTokenId && movedTokenId !== lastMoved) {
        return; // skip non-mover validations for indicator; dialog can still be opened explicitly elsewhere
      }
    } catch {
      /* best-effort guard */
    }

    // Prepare the override data for the dialog
    const overrideData = invalidOverrides.map(
      ({
        observerId,
        targetId,
        override,
        reason,
        reasonIcons,
        currentVisibility,
        currentCover,
      }) => {
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
          isManual: override.source === 'manual_action',
        };
      },
    );

    // Get the name of the token that moved (for context in dialog title)
    let movedTokenName = 'Unknown Token';
    const lastMoved = globalThis?.game?.pf2eVisioner?.lastMovedTokenId || movedTokenId || null;
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
        await OverrideValidationDialog.show(
          overrideData,
          movedTokenName,
          lastMoved || movedTokenId || null,
        );
      } catch (error) {
        console.error('PF2E Visioner | Error showing override validation dialog:', error);
      }
    }
  }
}

// Export singleton instance
export const eventDrivenVisibilitySystem = EventDrivenVisibilitySystem.getInstance();

// Make it available globally for other components to access
if (typeof window !== 'undefined') {
  window.Pf2eVisionerEventDrivenSystem = eventDrivenVisibilitySystem;
}
