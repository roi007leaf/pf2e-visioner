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
    }

    /**
     * Handle actor about to be updated - catch condition changes early
     */
    handlePreUpdateActor(actor, changes) {
        if (!this.systemState.shouldProcessEvents()) return;

        // Ignore changes when we're updating effects to prevent feedback loops
        if (this.systemState.isUpdatingEffects()) {
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
                    (t) => t.actor?.id === actor.id && !this.exclusionManager.isExcludedToken(t),
                ) || [];

            if (tokens.length > 0) {
                tokens.forEach((token) => this.visibilityState.markTokenChangedImmediate(token.document.id));
            }
        }
    }

    /**
     * Handle actor updated - might affect vision capabilities or conditions
     */
    handleActorUpdate(actor) {
        if (!this.systemState.shouldProcessEvents()) return;

        // Ignore changes when we're updating effects to prevent feedback loops
        if (this.systemState.isUpdatingEffects()) {
            return;
        }

        // Find tokens for this actor - skip hidden tokens
        const tokens =
            canvas.tokens?.placeables.filter(
                (t) => t.actor?.id === actor.id && !this.exclusionManager.isExcludedToken(t),
            ) || [];

        if (tokens.length > 0) {
            tokens.forEach((token) => this.visibilityState.markTokenChangedImmediate(token.document.id));
        }
    }
}