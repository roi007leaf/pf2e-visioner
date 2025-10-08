/**
 * ItemEventHandler - Handles item-related events that may affect visibility
 * 
 * This includes:
 * - Condition items (PF2e conditions as items)
 * - Equipment that affects vision
 * - Spells and effects that modify visibility
 * - Light-emitting items
 * 
 * Follows SOLID principles by focusing solely on item event processing
 * and delegating state management to injected dependencies.
 */

import { VisionAnalyzer } from '../VisionAnalyzer.js';

export class ItemEventHandler {
    /** @type {SystemStateProvider} */
    #systemStateProvider = null;

    /** @type {VisibilityStateManager} */
    #visibilityStateManager = null;

    /** @type {ExclusionManager} */
    #exclusionManager = null;

    /** @type {CacheManagementService} */
    #cacheManager = null;

    constructor(systemStateProvider, visibilityStateManager, exclusionManager, cacheManager) {
        this.#systemStateProvider = systemStateProvider;
        this.#visibilityStateManager = visibilityStateManager;
        this.#exclusionManager = exclusionManager;
        this.#cacheManager = cacheManager;
    }

    /**
     * Initialize the item event handler by registering hooks
     */
    initialize() {
        // Item events (conditions, equipment, spells)
        Hooks.on('createItem', this.#onItemCreate.bind(this));
        Hooks.on('updateItem', this.#onItemUpdate.bind(this));
        Hooks.on('deleteItem', this.#onItemDelete.bind(this));
    }

    /**
     * Handle item creation events
     * @param {Item} item - The created item
     */
    #onItemCreate(item) {
        if (!this.#systemStateProvider.shouldProcessEvents()) return;
        this.#handleItemChange(item, 'created');
    }

    /**
     * Handle item update events
     * @param {Item} item - The updated item
     * @param {Object} changes - The changes made to the item
     */
    #onItemUpdate(item, changes) {
        if (!this.#systemStateProvider.shouldProcessEvents()) return;

        // Handle both general item changes and equipment-specific changes
        this.#handleItemChange(item, 'updated');
        this.#handleEquipmentChange(item, changes);
    }

    /**
     * Handle item deletion events
     * @param {Item} item - The deleted item
     */
    #onItemDelete(item) {
        if (!this.#systemStateProvider.shouldProcessEvents()) return;
        this.#handleItemChange(item, 'deleted');
    }

    /**
     * Handle item changes that might affect visibility (PF2e conditions, spells, etc.)
     * @param {Item} item - The item that changed
     * @param {string} action - The action performed ('created', 'updated', 'deleted')
     */
    #handleItemChange(item, action) {
        // In PF2e, conditions might be items, but also spells and effects
        const itemName = item.name?.toLowerCase() || '';
        const itemType = item.type?.toLowerCase() || '';
        const itemSlug = item.slug?.toLowerCase() || '';

        // Expand the types that might affect visibility
        const isRelevantType =
            itemType === 'condition' ||
            itemType === 'effect' ||
            itemType === 'spell' ||
            itemType === 'feat' ||
            itemType === 'action';

        // Feats that affect visibility/detection
        const visibilityAffectingFeatSlugs = [
            'petal-step',          // Immune to tremorsense
            'ceaseless-shadows',   // Cover upgrade, removes Sneak/Hide end position prerequisites
            'legendary-sneak',     // removes Sneak end position prerequisites
            'terrain-stalker',     // removes Sneak end position prerequisites in specific terrain
            'swift-sneak',         // Full speed Sneak
            'very-very-sneaky',    // removes Sneak/Hide end position prerequisites + distance bonus
            'camouflage',          // removes Sneak/Hide end position prerequisites in natural terrain
            'vanish-into-the-land', // removes Sneak/Hide end position prerequisites in difficult terrain
            'distracting-shadows', // Use large creatures as cover
            'very-sneaky',         // Distance bonus + defer end position
            'sneaky',              // Distance bonus + defer end position
            'keen-eyes',           // Detection bonus
            'thats-odd'            // Detection bonus for anomalies
        ];

        const isVisibilityFeat = itemType === 'feat' && visibilityAffectingFeatSlugs.some(slug => 
            itemSlug === slug || itemName === slug.replace(/-/g, ' '));

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
            itemName.includes('see the unseen') ||
            itemName.includes('true seeing') ||
            itemName.includes('dancing lights') ||
            itemName.includes('continual flame') ||
            itemName.includes('echolocation') ||
            itemName.includes('tremorsense') ||
            itemName.includes('blindsight') ||
            itemName.includes('blindsense') ||
            itemName.includes('scent') ||
            itemName.includes('thoughtsense') ||
            itemName.includes('lifesense') ||
            itemName.includes('deaf');

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
            (isVisibilityRelated || lightEmitterHint || ) &&
            item.parent?.documentName === 'Actor'
        ) {
            const actor = item.parent;
            const tokens =
                canvas.tokens?.placeables.filter(
                    (t) => t.actor?.id === actor.id && !this.#exclusionManager.isExcludedToken(t),
                ) || [];

            if (tokens.length > 0) {
                this.#systemStateProvider.debug('ItemEventHandler: visibility-affecting item change', {
                    itemName: item.name,
                    itemType: item.type,
                    action,
                    actorId: actor.id,
                    tokensAffected: tokens.length,
                    lightEmitter: lightEmitterHint
                });

                // Clear VisionAnalyzer cache for affected tokens
                // This ensures vision/sensing capabilities are recalculated with new conditions
                const visionAnalyzer = VisionAnalyzer.getInstance();
                tokens.forEach((token) => {
                    visionAnalyzer.clearCache(token);
                });

                if (lightEmitterHint) {
                    // Emitting light changed: recalc ALL because others are affected by the emitter's aura
                    this.#visibilityStateManager.markAllTokensChangedImmediate();
                } else if (isVisibilityRelated || isVisibilityFeat) {
                    // Visibility-affecting condition changed - delay batch and clear cache
                    // Wait for PF2e to update flags and conditions asynchronously (~250-300ms)
                    setTimeout(() => {
                        this.#cacheManager?.getGlobalVisibilityCache()?.clear();
                        tokens.forEach((token) =>
                            this.#visibilityStateManager.markTokenChangedImmediate(token.document.id)
                        );
                    }, 300);
                } else {
                    // Non-visibility items - process immediately
                    tokens.forEach((token) =>
                        this.#visibilityStateManager.markTokenChangedImmediate(token.document.id)
                    );
                }
            }
        }
    }

    /**
     * Handle equipment changes that might affect vision capabilities
     * @param {Item} item - The equipment item
     * @param {Object} changes - The changes made to the item
     */
    #handleEquipmentChange(item, changes) {
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
                    (t) => t.actor?.id === actor.id && !this.#exclusionManager.isExcludedToken(t),
                ) || [];

            if (tokens.length > 0) {
                this.#systemStateProvider.debug('ItemEventHandler: vision equipment change', {
                    itemName: item.name,
                    itemType: item.type,
                    actorId: actor.id,
                    tokensAffected: tokens.length,
                    equipped: changes.system?.equipped
                });

                // Clear VisionAnalyzer cache for affected tokens
                const visionAnalyzer = VisionAnalyzer.getInstance();
                tokens.forEach((token) => {
                    visionAnalyzer.clearCache(token);
                });

                tokens.forEach((token) =>
                    this.#visibilityStateManager.markTokenChangedImmediate(token.document.id)
                );
            }
        }
    }
}