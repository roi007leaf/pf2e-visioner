import { PredicateHelper } from '../PredicateHelper.js';

export class DetectionModeModifier {
    static _clone(obj) {
        if (typeof structuredClone !== 'undefined') {
            return structuredClone(obj);
        }
        return JSON.parse(JSON.stringify(obj));
    }

    static sanitizeDetectionModes(detectionModes) {
        if (!Array.isArray(detectionModes)) return [];
        return detectionModes.map(mode => {
            const sanitized = this._clone(mode);
            if (sanitized.range !== null && !Number.isFinite(sanitized.range)) {
                sanitized.range = null;
            }
            return sanitized;
        });
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
        const modeIndex = detectionModes.findIndex(m =>
            m.id?.toLowerCase() === modeName.toLowerCase()
        );

        if (modeIndex === -1) {
            return;
        }

        const mode = detectionModes[modeIndex];
        this.modifyDetectionModeProperties(mode, modifications);
    }

    static modifyDetectionModeProperties(detectionMode, modifications) {
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
        detectionModes.forEach(mode => {
            if (modifications.maxRange !== undefined && mode.range !== null) {
                mode.range = Math.min(mode.range, modifications.maxRange);
            }
        });
    }

    static async restoreDetectionModes(token, ruleElementId) {
        if (!token?.document) return;

        const escapedRuleElementId = ruleElementId.replace(/\./g, '___');
        const originalPerception = token.document.getFlag('pf2e-visioner', 'originalPerception') || {};

        if (!originalPerception[escapedRuleElementId]?.detectionModes) {
            return;
        }

        const detectionModes = originalPerception[escapedRuleElementId].detectionModes;

        try {
            const sanitized = this.sanitizeDetectionModes(detectionModes);
            await token.document.update({ detectionModes: sanitized });
        } catch (error) {
            console.warn('PF2E Visioner | Failed to restore detection modes:', error);
        }

        const currentPerception = token.document.getFlag('pf2e-visioner', 'originalPerception') || {};

        if (currentPerception[escapedRuleElementId]?.senses === undefined) {
            await token.document.update({
                [`flags.pf2e-visioner.originalPerception.-=${escapedRuleElementId}`]: null
            });
        } else {
            delete currentPerception[escapedRuleElementId].detectionModes;
            await token.document.update({
                [`flags.pf2e-visioner.originalPerception.${escapedRuleElementId}`]: currentPerception[escapedRuleElementId]
            });
        }
    }

    static getDetectionModeCapabilities(token) {
        if (!token?.document) return {};

        const detectionModes = token.document.detectionModes || [];

        const capabilities = {};

        detectionModes.forEach(mode => {
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
