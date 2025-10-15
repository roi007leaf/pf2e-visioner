import { MODULE_ID } from '../constants.js';

export class RuleElementService {
    static #instance = null;

    static getInstance() {
        if (!RuleElementService.#instance) {
            RuleElementService.#instance = new RuleElementService();
        }
        return RuleElementService.#instance;
    }

    constructor() {
        this.ruleElementCache = new Map();
        this.lastCacheUpdate = 0;
        this.cacheTTL = 1000;
    }

    getRuleElementsForToken(token) {
        if (!token?.actor) return [];

        const cacheKey = `${token.id}-${token.actor.uuid}`;
        const now = Date.now();

        if (this.ruleElementCache.has(cacheKey)) {
            const cached = this.ruleElementCache.get(cacheKey);
            if (now - cached.timestamp < this.cacheTTL) {
                return cached.ruleElements;
            }
        }

        const ruleElements = this.#extractRuleElements(token.actor);
        this.ruleElementCache.set(cacheKey, {
            ruleElements,
            timestamp: now,
        });

        return ruleElements;
    }

    #extractRuleElements(actor) {
        const ruleElements = [];

        try {
            const items = actor.items?.contents || [];

            for (const item of items) {
                if (!item.system?.rules) continue;

                for (const rule of item.system.rules) {
                    if (this.#isVisionerRuleElement(rule)) {
                        ruleElements.push({
                            item,
                            rule,
                            type: this.#getRuleElementType(rule.key),
                        });
                    }
                }
            }
        } catch (error) {
            console.error(`${MODULE_ID} | Error extracting rule elements:`, error);
        }

        return ruleElements;
    }

    #isVisionerRuleElement(rule) {
        if (!rule?.key) return false;
        return (
            rule.key === 'PF2eVisionerVisibility' ||
            rule.key === 'PF2eVisionerCover' ||
            rule.key === 'PF2eVisionerDetection'
        );
    }

    #getRuleElementType(key) {
        switch (key) {
            case 'PF2eVisionerVisibility':
                return 'visibility';
            case 'PF2eVisionerCover':
                return 'cover';
            case 'PF2eVisionerDetection':
                return 'detection';
            default:
                return 'unknown';
        }
    }

    getVisibilityRuleElements(token) {
        return this.getRuleElementsForToken(token).filter((re) => re.type === 'visibility');
    }

    getCoverRuleElements(token) {
        return this.getRuleElementsForToken(token).filter((re) => re.type === 'cover');
    }

    getDetectionRuleElements(token) {
        return this.getRuleElementsForToken(token).filter((re) => re.type === 'detection');
    }

    shouldApplyRuleElement(ruleElement, context = {}) {
        const { rule } = ruleElement;

        if (!rule.predicate || rule.predicate.length === 0) {
            return true;
        }

        try {
            const rollOptions = this.#buildRollOptions(context);
            return this.#testPredicate(rule.predicate, rollOptions);
        } catch (error) {
            console.warn(`${MODULE_ID} | Error testing rule element predicate:`, error);
            return false;
        }
    }

    #buildRollOptions(context) {
        const options = new Set();

        if (context.token) {
            options.add('self:token');
            if (context.token.actor) {
                options.add(`self:actor:${context.token.actor.type}`);
                // Get roll options from the actor
                if (typeof context.token.actor.getRollOptions === 'function') {
                    const actorOptions = context.token.actor.getRollOptions(['all']);
                    actorOptions.forEach(opt => options.add(opt));
                }
            }
        }

        if (context.target) {
            options.add('target:token');
            if (context.target.actor) {
                options.add(`target:actor:${context.target.actor.type}`);
                // Get roll options from the target actor
                if (typeof context.target.actor.getRollOptions === 'function') {
                    const targetOptions = context.target.actor.getRollOptions(['all']);
                    targetOptions.forEach(opt => options.add(opt));
                }
            }
        }

        if (context.visibility) {
            options.add(`visioner:visibility:as-target:${context.visibility}`);
        }

        if (context.cover) {
            options.add(`visioner:cover:as-target:${context.cover}`);
        }

        if (context.lighting) {
            options.add(`visioner:lighting:darkness:${context.lighting}`);
        }

        if (context.avs !== undefined) {
            options.add(context.avs ? 'visioner:avs:enabled' : 'visioner:avs:disabled');
        }

        if (context.customOptions) {
            context.customOptions.forEach((opt) => options.add(opt));
        }

        return options;
    }

    #testPredicate(predicate, rollOptions) {
        if (!predicate || predicate.length === 0) return true;

        if (typeof game?.pf2e?.Predicate?.test === 'function') {
            return game.pf2e.Predicate.test(predicate, rollOptions);
        }

        return this.#testPredicateFallback(predicate, rollOptions);
    }

    #testPredicateFallback(predicate, rollOptions) {
        for (const condition of predicate) {
            if (typeof condition === 'string') {
                if (condition.startsWith('not:')) {
                    const option = condition.slice(4);
                    if (rollOptions.has(option)) return false;
                } else {
                    if (!rollOptions.has(condition)) return false;
                }
            } else if (condition && typeof condition === 'object') {
                if (condition.or) {
                    const orPassed = condition.or.some((opt) => rollOptions.has(opt));
                    if (!orPassed) return false;
                } else if (condition.and) {
                    const andPassed = condition.and.every((opt) => rollOptions.has(opt));
                    if (!andPassed) return false;
                } else if (condition.not) {
                    const notOption = Array.isArray(condition.not) ? condition.not[0] : condition.not;
                    if (rollOptions.has(notOption)) return false;
                }
            }
        }
        return true;
    }

    applyVisibilityModifiers(baseVisibility, observer, target) {
        const observerRules = this.getVisibilityRuleElements(observer);
        const targetRules = this.getVisibilityRuleElements(target);

        let modifiedVisibility = baseVisibility;

        for (const ruleElement of [...observerRules, ...targetRules]) {
            const context = {
                token: observer,
                target,
                visibility: modifiedVisibility,
            };

            if (this.shouldApplyRuleElement(ruleElement, context)) {
                modifiedVisibility = this.#applyVisibilityModifier(
                    modifiedVisibility,
                    ruleElement.rule,
                    observer,
                    target
                );
            }
        }

        return modifiedVisibility;
    }

    #applyVisibilityModifier(currentState, rule, observer, target) {
        const { mode, status, steps = 1, direction = 'both' } = rule;

        const shouldApplyToThis = direction === 'both' || direction === 'from' || direction === 'to';
        if (!shouldApplyToThis) return currentState;

        if (mode === 'set') {
            return status;
        }

        const states = ['observed', 'concealed', 'hidden', 'undetected'];
        const currentIndex = states.indexOf(currentState);

        if (currentIndex === -1) return currentState;

        if (mode === 'increase') {
            const newIndex = Math.min(states.length - 1, currentIndex + steps);
            return states[newIndex];
        }

        if (mode === 'decrease') {
            const newIndex = Math.max(0, currentIndex - steps);
            return states[newIndex];
        }

        return currentState;
    }

    applyCoverModifiers(baseCover, observer, target) {
        const observerRules = this.getCoverRuleElements(observer);
        const targetRules = this.getCoverRuleElements(target);

        console.log('PF2E Visioner | RuleElementService.applyCoverModifiers:', {
            observer: observer?.name,
            target: target?.name,
            baseCover,
            observerRules: observerRules.map(r => ({
                item: r.item?.name,
                mode: r.rule?.mode,
                coverLevel: r.rule?.coverLevel,
                steps: r.rule?.steps,
                predicate: r.rule?.predicate,
            })),
            targetRules: targetRules.map(r => ({
                item: r.item?.name,
                mode: r.rule?.mode,
                coverLevel: r.rule?.coverLevel,
                steps: r.rule?.steps,
                predicate: r.rule?.predicate,
            })),
        });

        let modifiedCover = baseCover;

        for (const ruleElement of [...observerRules, ...targetRules]) {
            const context = {
                token: observer,
                target,
                cover: modifiedCover,
            };

            const shouldApply = this.shouldApplyRuleElement(ruleElement, context);
            console.log('PF2E Visioner | Checking rule element:', {
                item: ruleElement.item?.name,
                rule: ruleElement.rule,
                shouldApply,
                context,
            });

            if (shouldApply) {
                const beforeModification = modifiedCover;
                modifiedCover = this.#applyCoverModifier(modifiedCover, ruleElement.rule, observer, target);
                console.log('PF2E Visioner | Applied rule element:', {
                    item: ruleElement.item?.name,
                    before: beforeModification,
                    after: modifiedCover,
                });
            }
        }

        console.log('PF2E Visioner | Final modified cover:', {
            baseCover,
            modifiedCover,
            changed: baseCover !== modifiedCover,
        });

        return modifiedCover;
    }

    #applyCoverModifier(currentCover, rule, observer, target) {
        const { mode, coverLevel, steps = 1, direction = 'both' } = rule;

        const shouldApplyToThis = direction === 'both' || direction === 'from' || direction === 'to';
        if (!shouldApplyToThis) return currentCover;

        if (mode === 'set') {
            return coverLevel;
        }

        if (mode === 'remove') {
            return 'none';
        }

        const levels = ['none', 'lesser', 'standard', 'greater'];
        const currentIndex = levels.indexOf(currentCover);

        if (currentIndex === -1) return currentCover;

        if (mode === 'increase') {
            const newIndex = Math.min(levels.length - 1, currentIndex + steps);
            return levels[newIndex];
        }

        if (mode === 'decrease') {
            const newIndex = Math.max(0, currentIndex - steps);
            return levels[newIndex];
        }

        return currentCover;
    }

    getModifiedSenses(token) {
        const detectionRules = this.getDetectionRuleElements(token);
        const modifiedSenses = new Map();

        for (const ruleElement of detectionRules) {
            const context = { token };

            if (this.shouldApplyRuleElement(ruleElement, context)) {
                const { rule } = ruleElement;
                const { sense, senseRange, acuity, modifyExisting = true } = rule;

                if (sense) {
                    const existing = modifiedSenses.get(sense);

                    if (!existing || modifyExisting) {
                        modifiedSenses.set(sense, {
                            type: sense,
                            range: senseRange,
                            acuity,
                        });
                    }
                }
            }
        }

        return modifiedSenses;
    }

    clearCache(tokenId = null) {
        if (tokenId) {
            for (const key of this.ruleElementCache.keys()) {
                if (key.startsWith(tokenId)) {
                    this.ruleElementCache.delete(key);
                }
            }
        } else {
            this.ruleElementCache.clear();
        }
    }

    invalidateCacheForActor(actorUuid) {
        for (const [key, value] of this.ruleElementCache.entries()) {
            if (key.includes(actorUuid)) {
                this.ruleElementCache.delete(key);
            }
        }
    }
}

export const ruleElementService = RuleElementService.getInstance();
