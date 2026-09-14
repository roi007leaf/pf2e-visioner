import { PredicateHelper } from '../PredicateHelper.js';

export class DetectionModeModifier {
    static _clone(obj) {
        if (typeof structuredClone !== 'undefined') {
            return structuredClone(obj);
        }
        return JSON.parse(JSON.stringify(obj));
    }

    static sanitizeDetectionModes(detectionModes) {
        const modes = this._clone(detectionModes || []);
        for (const mode of Object.values(modes)) {
            if (mode.range !== null && !Number.isFinite(mode.range)) mode.range = null;
        }
        return modes;
    }

    static async applyDetectionModeModifications(token, modeModifications, ruleElementId, predicate = null) {
        if (!token?.document || !modeModifications) return;

        if (predicate && predicate.length > 0) {
            const rollOptions = PredicateHelper.getTokenRollOptions(token);
            if (!PredicateHelper.evaluate(predicate, rollOptions)) {
                return;
            }
        }

        const escapedRuleElementId = ruleElementId.replace(/\./g, '___');
        const originalPerception = token.document.getFlag('pf2e-visioner', 'originalPerception') || {};

        if (!originalPerception[escapedRuleElementId]) {
            originalPerception[escapedRuleElementId] = {};
        }

        if (!originalPerception[escapedRuleElementId].detectionModes) {
            originalPerception[escapedRuleElementId].detectionModes = this.sanitizeDetectionModes(token.document.detectionModes);
        }

        originalPerception[escapedRuleElementId].detectionModeModifications = this._clone(modeModifications);
        const detectionModes = this.sanitizeDetectionModes(token.document.detectionModes);

        Object.entries(modeModifications).forEach(([modeName, modifications]) => {
            if (modeName === 'all') {
                this.modifyAllDetectionModes(detectionModes, modifications);
            } else {
                this.modifyDetectionMode(detectionModes, modeName, modifications);
            }
        });


        await token.document.update({
            [`flags.pf2e-visioner.originalPerception.${escapedRuleElementId}`]: originalPerception[escapedRuleElementId]
        });

        try {
            await token.document.update({ detectionModes });
        } catch (error) {
            console.warn('PF2E Visioner | Failed to update detection modes:', error);
        }
    }

    static modifyDetectionMode(detectionModes, modeName, modifications) {
        const mode = Array.isArray(detectionModes)
            ? detectionModes.find(m => m.id?.toLowerCase() === modeName.toLowerCase())
            : Object.entries(detectionModes).find(([id]) => id.toLowerCase() === modeName.toLowerCase())?.[1];
        if (!mode) return;
        this.modifyDetectionModeProperties(mode, modifications);
    }

    static modifyDetectionModeProperties(detectionMode, modifications) {
        if (modifications.enabled !== undefined) detectionMode.enabled = modifications.enabled;
        if (modifications.range !== undefined) {
            detectionMode.range = modifications.range;
        }

        if (modifications.precision !== undefined) {
            detectionMode.acuity = modifications.precision;
        }

        if (modifications.maxRange !== undefined) {
            const currentRange = detectionMode.range ?? 9999;
            detectionMode.range = Math.min(currentRange, modifications.maxRange);
        }
    }

    static modifyAllDetectionModes(detectionModes, modifications) {
        Object.values(detectionModes).forEach(mode => this.modifyDetectionModeProperties(mode, modifications));
    }

    // PF2e reconstructs these derived modes on every preparation. Apply active rule
    // limits afterwards without persisting or recreating modes disabled by conditions.
    static wrapPrepareDetectionModes(wrapped, ...args) {
        const result = wrapped(...args);
        const sources = this.getFlag?.('pf2e-visioner', 'originalPerception') || {};
        for (const source of Object.values(sources)) {
            for (const [mode, modifications] of Object.entries(source?.detectionModeModifications || {})) {
                if (mode === 'all') DetectionModeModifier.modifyAllDetectionModes(this.detectionModes, modifications);
                else DetectionModeModifier.modifyDetectionMode(this.detectionModes, mode, modifications);
            }
        }
        return result;
    }

    static async restoreDetectionModes(token, ruleElementId) {
        if (!token?.document) return;

        const escapedRuleElementId = ruleElementId.replace(/\./g, '___');
        const originalPerception = token.document.getFlag('pf2e-visioner', 'originalPerception') || {};

        if (!originalPerception[escapedRuleElementId]?.detectionModes) {
            return;
        }

        const detectionModes = originalPerception[escapedRuleElementId].detectionModes;


        const currentPerception = token.document.getFlag('pf2e-visioner', 'originalPerception') || {};

        if (currentPerception[escapedRuleElementId]?.senses === undefined) {
            await token.document.update({
                [`flags.pf2e-visioner.originalPerception.-=${escapedRuleElementId}`]: null
            });
        } else {
            await token.document.update({
                [`flags.pf2e-visioner.originalPerception.${escapedRuleElementId}.-=detectionModes`]: null,
                [`flags.pf2e-visioner.originalPerception.${escapedRuleElementId}.-=detectionModeModifications`]: null,
            });
        }
        try {
            const sanitized = this.sanitizeDetectionModes(detectionModes);
            await token.document.update({ detectionModes: sanitized });
        } catch (error) {
            console.warn('PF2E Visioner | Failed to restore detection modes:', error);
        }

    }

    static getDetectionModeCapabilities(token) {
        if (!token?.document) return {};

        const detectionModes = token.document.detectionModes || [];

        const capabilities = {};

        const entries = Array.isArray(detectionModes) ? detectionModes : Object.entries(detectionModes).map(([id, mode]) => ({ ...mode, id }));
        entries.forEach(mode => {
            if (mode.enabled && mode.range !== null) {
                capabilities[mode.id] = {
                    range: mode.range,
                    enabled: mode.enabled
                };
            }
        });

        return capabilities;
    }
}
