import { MODULE_ID } from '../../../constants.js';

/**
 * TemplateEventHandler handles template-related events and their effects on visibility.
 * Manages template creation, updates, deletion, and special handling for darkness spells.
 * 
 * Follows SOLID principles by depending on abstractions rather than concrete implementations.
 */
export class TemplateEventHandler {
    /** @type {SystemStateProvider} */
    #systemState;
    /** @type {VisibilityStateManager} */
    #visibilityState;

    constructor(systemStateProvider, visibilityStateManager) {
        this.#systemState = systemStateProvider;
        this.#visibilityState = visibilityStateManager;
    }

    /**
     * Initialize template event handlers
     */
    initialize() {
        // Template changes (can affect lighting and vision)
        Hooks.on('createMeasuredTemplate', this.handleTemplateCreate.bind(this));
        Hooks.on('updateMeasuredTemplate', this.handleTemplateUpdate.bind(this));
        Hooks.on('deleteMeasuredTemplate', this.handleTemplateDelete.bind(this));
    }

    /**
     * Handle template creation (might affect lighting)
     */
    handleTemplateCreate(template) {
        if (!this.#systemState.shouldProcessEvents()) return;

        // Check if this template might affect visibility (light spells, darkness, etc.)
        const { looksLikeLight } = this.#getTemplateNameAndLightHint(template);

        // Special handling: Darkness spell -> create a magical darkness light source matching the template radius
        try {
            if (this.#isDarknessTemplate(template)) {
                this.#ensureDarknessLightForTemplate(template);
                this.#ensureDarknessRegionForTemplate(template);
            }
        } catch {
            /* best-effort */
        }

        if (looksLikeLight) {
            this.#visibilityState.markAllTokensChangedImmediate();
        }
    }

    /**
     * Handle template updates (might affect lighting)
     */
    handleTemplateUpdate(template, changes) {
        if (!this.#systemState.shouldProcessEvents()) return;

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
                    this.#syncDarknessRegionForTemplate(template);
                }
            } catch {
                /* best-effort */
            }

            if (looksLikeLight) {
                this.#visibilityState.markAllTokensChangedImmediate();
            }
        }
    }

    /**
     * Handle template deletion (might affect lighting)
     */
    handleTemplateDelete(template) {
        if (!this.#systemState.shouldProcessEvents()) return;

        const { looksLikeLight } = this.#getTemplateNameAndLightHint(template);

        // Cleanup linked Darkness light source if present
        try {
            if (this.#isDarknessTemplate(template)) {
                this.#removeDarknessLightForTemplate(template);
                this.#removeDarknessRegionForTemplate(template);
            }
        } catch {
            /* best-effort */
        }

        if (looksLikeLight) {
            this.#visibilityState.markAllTokensChangedImmediate();
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

    /**
     * Ensure a difficult terrain region exists for a Darkness template and link it via flags.
     */
    async #ensureDarknessRegionForTemplate(template) {
        try {
            const existingId = template.getFlag?.(MODULE_ID, 'darknessRegionId');
            if (existingId && canvas.scene?.regions?.get?.(existingId)) {
                await this.#syncDarknessRegionForTemplate(template);
                return;
            }

            const radiusPixels = (template.distance / canvas.dimensions.distance) * canvas.grid.size;
            const shape = {
                type: 'ellipse',
                x: template.x,
                y: template.y,
                radiusX: radiusPixels,
                radiusY: radiusPixels,
                rotation: 0
            };

            const regionData = {
                name: `Darkness Terrain (${template.id})`,
                color: '#000000',
                shapes: [shape],
                behaviors: [{
                    type: 'modifyMovementCost',
                    system: {
                        difficulties: {
                            "walk": 2,
                            "fly": 2,
                            "swim": 2,
                            "burrow": 2,
                            "deploy": 2,
                            "travel": 2,
                            "drive": 2,
                            "jump": 2,
                            "crawl": 2,
                            "climb": 2,
                            "blink": 2,
                            "displace": 2
                        }
                    }
                }],
                flags: {
                    [MODULE_ID]: {
                        darknessTemplateId: template.id
                    }
                }
            };

            const created = await canvas.scene?.createEmbeddedDocuments?.('Region', [regionData]);
            const createdDoc = Array.isArray(created) ? created[0] : null;
            const regionId = createdDoc?.id || createdDoc?._id || null;

            if (regionId) {
                try {
                    await template.setFlag?.(MODULE_ID, 'darknessRegionId', regionId);
                } catch {
                    /* ignore */
                }
            }
        } catch (e) {
            console.warn('PF2E Visioner | Failed to create Darkness region for template:', e);
        }
    }

    /**
     * Sync the linked Darkness region to the template's position and radius.
     */
    async #syncDarknessRegionForTemplate(template) {
        try {
            const regionId = template.getFlag?.(MODULE_ID, 'darknessRegionId');
            if (!regionId) return;

            const region = canvas.scene?.regions?.get?.(regionId);
            if (!region) return;

            const radiusPixels = (template.distance / canvas.dimensions.distance) * canvas.grid.size;
            const newShape = {
                type: 'ellipse',
                x: template.x,
                y: template.y,
                radiusX: radiusPixels,
                radiusY: radiusPixels,
                rotation: 0
            };

            await region.update({ shapes: [newShape] });
        } catch (e) {
            console.warn('PF2E Visioner | Failed to sync Darkness region for template:', e);
        }
    }

    /**
     * Remove the linked Darkness region when the template is deleted.
     */
    async #removeDarknessRegionForTemplate(template) {
        try {
            const regionId = template.getFlag?.(MODULE_ID, 'darknessRegionId');
            if (!regionId) return;

            try {
                await canvas.scene?.deleteEmbeddedDocuments?.('Region', [regionId]);
            } catch {
                /* ignore delete errors */
            }
            try {
                await template.unsetFlag?.(MODULE_ID, 'darknessRegionId');
            } catch {
                /* ignore flag errors */
            }
        } catch (e) {
            console.warn('PF2E Visioner | Failed to remove Darkness region for template:', e);
        }
    }
}