/**
 * ActorEventHandler - Handles actor-related events that affect visibility
 * Manages actor updates that might change conditions, vision capabilities, or other visibility factors
 *
 * Follows SOLID principles by depending on abstractions rather than concrete implementations.
 */
export class ActorEventHandler {
  constructor(systemStateProvider, visibilityStateManager, exclusionManager) {
    this.systemState = systemStateProvider;
    this.visibilityState = visibilityStateManager;
    this.exclusionManager = exclusionManager;
  }

  /**
   * Initialize actor event handlers
   */
  initialize() {
    Hooks.on('preUpdateActor', this.handlePreUpdateActor.bind(this));
    Hooks.on('updateActor', this.handleActorUpdate.bind(this));

    // PF2E specific hook for status effect (condition) changes
    Hooks.on('applyTokenStatusEffect', this.handleTokenStatusEffect.bind(this));
  }

  /**
   * Handle actor about to be updated - catch condition changes early
   */
  handlePreUpdateActor(actor, changes) {
    // ALWAYS log what we receive to debug sheet open/close issue
    this.systemState.debug(() => ({
      msg: 'ActorEventHandler:handlePreUpdateActor CALLED',
      actorId: actor.id,
      actorName: actor.name,
      hasChanges: !!changes,
      changesKeys: changes ? Object.keys(changes) : null,
      changesJson: changes ? JSON.stringify(changes) : null
    }));

    if (!this.systemState.shouldProcessEvents()) {
      this.systemState.debug(() => ({
        msg: 'ActorEventHandler:handlePreUpdateActor skipped - shouldProcessEvents=false',
        actorId: actor.id
      }));
      return;
    }

    // Ignore changes when we're updating effects to prevent feedback loops
    if (this.systemState.isUpdatingEffects()) {
      this.systemState.debug(() => ({
        msg: 'ActorEventHandler:handlePreUpdateActor skipped - isUpdatingEffects=true',
        actorId: actor.id
      }));
      return;
    }

    // Use the same filtering as handleActorUpdate to avoid processing non-relevant changes
    if (!this._hasVisibilityRelevantChanges(actor, changes)) {
      this.systemState.debug(() => ({
        msg: 'ActorEventHandler:handlePreUpdateActor skipped - no visibility-relevant changes',
        actorId: actor.id
      }));
      return;
    }

    this.systemState.debug(() => ({
      msg: 'ActorEventHandler:handlePreUpdateActor processing - has visibility-relevant changes',
      actorId: actor.id,
      actorName: actor.name
    }));

    // Check for condition-related changes
    const hasConditionChanges =
      changes.system?.conditions !== undefined ||
      changes.actorData?.effects !== undefined ||
      changes.items !== undefined;

    if (hasConditionChanges || this._hasVisibilityRelevantChanges(actor, changes)) {
      // Check specifically for invisibility condition changes to set proper flags
      if (hasConditionChanges) {
        this._handleInvisibilityConditionChange(actor, changes);
      }

      const tokens =
        canvas.tokens?.placeables.filter(
          (t) => t.actor?.id === actor.id && !this.exclusionManager.isExcludedToken(t),
        ) || [];

      this.systemState.debug(() => ({
        msg: 'ActorEventHandler:handlePreUpdateActor marking tokens',
        actorId: actor.id,
        tokenCount: tokens.length,
        tokenIds: tokens.map(t => t.document.id)
      }));

      if (tokens.length > 0) {
        tokens.forEach((token) =>
          this.visibilityState.markTokenChangedImmediate(token.document.id),
        );
      }
    }
  }

  /**
   * Handle actor updated - might affect vision capabilities or conditions
   */
  handleActorUpdate(actor, changes) {
    // ALWAYS log what we receive to debug sheet open/close issue
    this.systemState.debug(() => ({
      msg: 'ActorEventHandler:handleActorUpdate CALLED',
      actorId: actor.id,
      actorName: actor.name,
      hasChanges: !!changes,
      changesKeys: changes ? Object.keys(changes) : null,
      changesJson: changes ? JSON.stringify(changes) : null
    }));

    if (!this.systemState.shouldProcessEvents()) {
      this.systemState.debug(() => ({
        msg: 'ActorEventHandler:handleActorUpdate skipped - shouldProcessEvents=false',
        actorId: actor.id
      }));
      return;
    }

    // Ignore changes when we're updating effects to prevent feedback loops
    if (this.systemState.isUpdatingEffects()) {
      this.systemState.debug(() => ({
        msg: 'ActorEventHandler:handleActorUpdate skipped - isUpdatingEffects=true',
        actorId: actor.id
      }));
      return;
    }

    // OPTIMIZATION: Only process if there are visibility-relevant changes
    // Opening/closing sheets triggers updateActor with no meaningful changes
    if (changes && !this._hasVisibilityRelevantChanges(actor, changes)) {
      this.systemState.debug(() => ({
        msg: 'ActorEventHandler:handleActorUpdate skipped - no visibility-relevant changes',
        actorId: actor.id,
        actorName: actor.name,
        changes: Object.keys(changes)
      }));
      return;
    }

    this.systemState.debug(() => ({
      msg: 'ActorEventHandler:handleActorUpdate processing',
      actorId: actor.id,
      actorName: actor.name,
      changes: changes ? Object.keys(changes) : 'no changes object'
    }));

    // Handle invisibility condition changes in post-update
    this._handleInvisibilityConditionChange(actor);

    // Find tokens for this actor - skip hidden tokens
    const tokens =
      canvas.tokens?.placeables.filter(
        (t) => t.actor?.id === actor.id && !this.exclusionManager.isExcludedToken(t),
      ) || [];

    if (tokens.length > 0) {
      tokens.forEach((token) => this.visibilityState.markTokenChangedImmediate(token.document.id));
    }
  }

  /**
   * Check if actor changes are visibility-relevant
   * @param {Actor} actor - The actor being updated
   * @param {object} changes - The changes object from preUpdateActor/updateActor
   * @returns {boolean} True if changes are relevant to visibility AND different from current values
   * @private
   */
  _hasVisibilityRelevantChanges(actor, changes) {
    if (!changes || typeof changes !== 'object') return false;
    if (!actor) return false;

    // Check for visibility-relevant changes:
    // - Conditions (blinded, invisible, etc.)
    // - Traits (for lifesense detection)
    // - Vision capabilities (darkvision, etc.)
    // - Effects
    // - Items (that might grant senses or conditions)
    const relevantPaths = [
      'system.conditions',
      'system.traits',
      'system.perception',
      'system.attributes.perception',
      'actorData.effects',
      'effects',
      'items'
    ];

    const hasRelevantChange = relevantPaths.some(path => {
      const parts = path.split('.');
      let currentInChanges = changes;
      let currentInActor = actor;

      // Traverse both changes and actor in parallel
      for (const part of parts) {
        if (!currentInChanges || typeof currentInChanges !== 'object') return false;
        if (!(part in currentInChanges)) return false;

        currentInChanges = currentInChanges[part];
        currentInActor = currentInActor?.[part];
      }

      // If we got here, the path exists in changes. Now compare with actor's current value.
      // Sheet open/close sends the same data, so if values are equal, it's not a real change.
      const areEqual = this._deepEqual(currentInChanges, currentInActor);
      return !areEqual;
    });

    return hasRelevantChange;
  }

  /**
   * Deep equality check for comparing values.
   * For objects, checks if 'a' (the changes value) is a subset of 'b' (the actor value).
   * This handles cases where Foundry sends partial updates that don't include all properties.
   * @param {*} a - First value (changes value - may be partial)
   * @param {*} b - Second value (actor value - complete)
   * @returns {boolean} True if values are equal (or a is a subset of b for objects)
   * @private
   */
  _deepEqual(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (typeof a !== typeof b) return false;

    if (Array.isArray(a)) {
      if (!Array.isArray(b) || a.length !== b.length) return false;
      return a.every((item, index) => this._deepEqual(item, b[index]));
    }

    if (typeof a === 'object') {
      const keysA = Object.keys(a);
      return keysA.every(key => this._deepEqual(a[key], b[key]));
    }

    return false;
  }

  /**
   * Handle PF2E token status effect changes (conditions)
   * @param {TokenPF2e} token - The token receiving the status effect
   * @param {string} statusId - The status effect ID (e.g., 'invisible')
   * @param {boolean} active - Whether the status is being applied (true) or removed (false)
   */
  handleTokenStatusEffect(token, statusId, active) {
    // Check if this is the invisible condition
    if (statusId === 'invisible') {
      if (token.actor) {
        this._handleInvisibilityConditionChange(token.actor);
      }
    }
  }

  /**
   * Handle invisibility condition changes to set proper PF2e transition flags
   * @param {Actor} actor - The actor whose conditions may have changed
   * @param {Object} changes - Optional changes object from preUpdateActor
   * @private
   */
  async _handleInvisibilityConditionChange(actor, changes = null) {
    try {
      // Check if the system is ready to process condition changes
      if (!canvas?.tokens?.placeables) {
        return;
      }

      // Import ConditionManager dynamically to avoid circular dependencies
      const { ConditionManager } = await import('../ConditionManager.js');
      const conditionManager = ConditionManager.getInstance();

      // Call the condition manager to handle invisibility flags
      await conditionManager.handleInvisibilityChange(actor);
    } catch (error) {
      console.error('PF2E Visioner | Failed to handle invisibility condition change:', error);
    }
  }
}
