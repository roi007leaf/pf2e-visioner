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

    constructor(systemStateProvider, visibilityStateManager, exclusionManager) {
        this.#systemStateProvider = systemStateProvider;
        this.#visibilityStateManager = visibilityStateManager;
        this.#exclusionManager = exclusionManager;
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

        // Check for roll option toggle changes (PF2e stores toggleable rule states in flags)
        const rollOptionToggled = this.#detectRollOptionToggle(item, changes);

        if (rollOptionToggled) {
            this.#systemStateProvider.debug('ItemEventHandler: roll option toggled', {
                itemName: item.name,
                changes: changes,
                hasMinimumVisibility: this.#hasMinimumVisibilityRollOption(item)
            });
        }

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
     * Detect if a roll option toggle state changed
     * @param {Item} item - The item being updated
     * @param {Object} changes - The changes object
     * @returns {boolean} True if a roll option toggle changed
     */
    #detectRollOptionToggle(item, changes) {
        // PF2e stores toggleable rule states in various places:
        // 1. flags.pf2e.rulesSelections - for ChoiceSet selections
        // 2. system.rules[].toggleable - for the rule definition
        // 3. Item active state changes

        const hasRuleChanges = changes.system?.rules !== undefined;
        const hasFlagChanges = changes.flags?.pf2e !== undefined;
        const hasActiveChange = changes.system?.active !== undefined;

        // If any of these changed and the item has visibility roll options, it's a toggle
        if ((hasRuleChanges || hasFlagChanges || hasActiveChange) && this.#hasMinimumVisibilityRollOption(item)) {
            return true;
        }

        return false;
    }

    /**
     * Check if an item has minimum visibility roll options
     * @param {Item} item - The item to check
     * @returns {boolean} True if item has minimum visibility roll options
     */
    #hasMinimumVisibilityRollOption(item) {
        return item.system?.rules?.some?.(rule =>
            rule.key === 'RollOption' &&
            (rule.option?.includes('minimum-visibility-target:') ||
                rule.option?.includes('maximum-visibility-observer:') ||
                rule.option?.includes('minimum-visibility-observer:'))
        ) ?? false;
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

        // Expand the types that might affect visibility
        const isRelevantType =
            itemType === 'condition' ||
            itemType === 'effect' ||
            itemType === 'spell' ||
            itemType === 'feat' ||
            itemType === 'action';

        const hasMinimumVisibilityRollOption = this.#hasMinimumVisibilityRollOption(item);

        const isVisibilityRelated =
            hasMinimumVisibilityRollOption ||
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
            itemName.includes('continual flame') ||
            itemName.includes('minimum visibility');

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
                    (t) => t.actor?.id === actor.id && !this.#exclusionManager.isExcludedToken(t),
                ) || [];

            if (tokens.length > 0) {
                this.#systemStateProvider.debug('ItemEventHandler: visibility-affecting item change', {
                    itemName: item.name,
                    itemType: item.type,
                    action,
                    actorId: actor.id,
                    tokensAffected: tokens.length,
                    lightEmitter: lightEmitterHint,
                    minimumVisibility: hasMinimumVisibilityRollOption
                });

                // Clear VisionAnalyzer cache for affected tokens
                // This ensures vision/sensing capabilities are recalculated with new conditions
                const visionAnalyzer = VisionAnalyzer.getInstance();
                tokens.forEach((token) => {
                    visionAnalyzer.clearCache(token);
                    this.#systemStateProvider.debug('ItemEventHandler: cleared VisionAnalyzer cache', {
                        tokenName: token.name,
                        itemName: item.name,
                        action
                    });
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