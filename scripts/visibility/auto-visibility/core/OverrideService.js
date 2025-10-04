/**
 * OverrideService
 * Facade for interacting with overrides (active manual overrides between tokens).
 */
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
}
