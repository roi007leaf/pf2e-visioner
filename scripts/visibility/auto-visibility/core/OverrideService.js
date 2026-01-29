/**
 * OverrideService
 * Facade for interacting with overrides (active manual overrides between tokens).
 */
import { getLogger } from '../../../utils/logger.js';

export class OverrideService {
    constructor() { }

    /**
     * Get active override for observer->target if any.
     * Prefer token-based API when possible as the underlying manager works with tokens.
     * @param {string} observerId
     * @param {string} targetId
     * @returns {{ state?: string } | null}
     */
    getActiveOverride(observerId, targetId) {
        try {
            // Fallback wrapper: resolve tokens from canvas and delegate to token-based method
            const obs = canvas?.tokens?.get(observerId);
            const tgt = canvas?.tokens?.get(targetId);
            if (obs && tgt) return this.getActiveOverrideForTokens(obs, tgt);
        } catch { /* ignore */ }
        return null;
    }

    /**
     * Get active override given tokens (sync best-effort; underlying manager is async so we avoid awaiting here).
     * @param {Token} observer
     * @param {Token} target
     * @returns {{ state?: string } | null}
     */
    getActiveOverrideForTokens(observer, target) {
        try {
            // Check for rule element overrides first
            const ruleElementOverride = this._checkRuleElementOverride(observer, target);
            if (ruleElementOverride) {
                return ruleElementOverride;
            }

            // Use dynamic require to avoid ESM async import in hot paths; tests can mock this module.
            const mod = (0, eval)('require')('../../chat/services/infra/AvsOverrideManager.js');
            const AvsOverrideManager = mod?.default;
            // Manager API is async (getOverride), but we cannot await here in hot path.
            // Try using a sync helper if present; otherwise return null and let legacy flags handle it.
            const byIds = AvsOverrideManager?.getOverrideByIds?.(
                observer?.document?.id,
                target?.document?.id
            );
            if (byIds?.state) return byIds;
            // As a last resort, attempt to peek at a cached last result if exposed
            const peek = AvsOverrideManager?.peekOverrideCache?.(
                observer?.document?.id,
                target?.document?.id
            );
            if (peek?.state) return peek;
        } catch { /* ignore */ }
        return null;
    }

    /**
     * Check if there's an active rule element override that should be respected.
     * Only handles direct visibility overrides (ruleElementOverride flag).
     * Visibility replacements (visibilityReplacement flag) are handled by RuleElementChecker.
     * @param {Token} observer
     * @param {Token} target
     * @returns {{ state?: string } | null}
     */
    _checkRuleElementOverride(observer, target) {
        const log = getLogger('AVS/OverrideService');
        try {


            // Check if target has a direct rule element override
            const targetOverride = target?.document?.getFlag('pf2e-visioner', 'ruleElementOverride');
            log.debug?.(() => ({
                msg: 'checkRuleElementOverride:target',
                targetId: target?.document?.id,
                has: !!targetOverride,
                active: !!targetOverride?.active,
                dir: targetOverride?.direction,
                state: targetOverride?.state
            }));


            if (targetOverride?.active && targetOverride?.state) {
                // This is a "from" direction override - target is seen as the override state by all observers
                if (targetOverride.direction === 'from') {

                    return { state: targetOverride.state };
                }
            }

            // Check if observer has a rule element override
            const observerOverride = observer?.document?.getFlag('pf2e-visioner', 'ruleElementOverride');
            log.debug?.(() => ({
                msg: 'checkRuleElementOverride:observer',
                observerId: observer?.document?.id,
                has: !!observerOverride,
                active: !!observerOverride?.active,
                dir: observerOverride?.direction,
                state: observerOverride?.state
            }));


            if (observerOverride?.active && observerOverride?.state) {
                // This is a "to" direction override - observer sees all targets as the override state
                if (observerOverride.direction === 'to') {

                    return { state: observerOverride.state };
                }
            }


        } catch (error) {
            // Fail silently to avoid breaking hot path

        }
        return null;
    }
}
