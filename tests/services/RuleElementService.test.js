import { RuleElementService } from '../../scripts/services/RuleElementService.js';

describe('RuleElementService', () => {
    let service;

    beforeEach(() => {
        service = new RuleElementService();
        service.clearCache();
    });

    afterEach(() => {
        service.clearCache();
    });

    describe('getRuleElementsForToken', () => {
        test('returns empty array for token without actor', () => {
            const token = { id: 'token1' };
            const result = service.getRuleElementsForToken(token);
            expect(result).toEqual([]);
        });

        test('returns empty array for actor without items', () => {
            const token = {
                id: 'token1',
                actor: { uuid: 'Actor.abc123', items: { contents: [] } },
            };
            const result = service.getRuleElementsForToken(token);
            expect(result).toEqual([]);
        });

        test('extracts Visioner visibility rule elements', () => {
            const item = {
                name: 'Test Effect',
                system: {
                    rules: [
                        {
                            key: 'PF2eVisionerVisibility',
                            mode: 'increase',
                            steps: 1,
                        },
                    ],
                },
            };

            const token = {
                id: 'token1',
                actor: {
                    uuid: 'Actor.abc123',
                    items: { contents: [item] },
                },
            };

            const result = service.getRuleElementsForToken(token);
            expect(result).toHaveLength(1);
            expect(result[0].type).toBe('visibility');
            expect(result[0].rule.key).toBe('PF2eVisionerVisibility');
            expect(result[0].item).toBe(item);
        });

        test('extracts Visioner cover rule elements', () => {
            const item = {
                name: 'Test Effect',
                system: {
                    rules: [
                        {
                            key: 'PF2eVisionerCover',
                            mode: 'set',
                            coverLevel: 'standard',
                        },
                    ],
                },
            };

            const token = {
                id: 'token1',
                actor: {
                    uuid: 'Actor.abc123',
                    items: { contents: [item] },
                },
            };

            const result = service.getRuleElementsForToken(token);
            expect(result).toHaveLength(1);
            expect(result[0].type).toBe('cover');
        });

        test('extracts Visioner detection rule elements', () => {
            const item = {
                name: 'Test Effect',
                system: {
                    rules: [
                        {
                            key: 'PF2eVisionerDetection',
                            sense: 'darkvision',
                            senseRange: 60,
                        },
                    ],
                },
            };

            const token = {
                id: 'token1',
                actor: {
                    uuid: 'Actor.abc123',
                    items: { contents: [item] },
                },
            };

            const result = service.getRuleElementsForToken(token);
            expect(result).toHaveLength(1);
            expect(result[0].type).toBe('detection');
        });

        test('ignores non-Visioner rule elements', () => {
            const item = {
                name: 'Test Effect',
                system: {
                    rules: [
                        {
                            key: 'FlatModifier',
                            selector: 'ac',
                            value: 2,
                        },
                        {
                            key: 'PF2eVisionerVisibility',
                            mode: 'increase',
                        },
                    ],
                },
            };

            const token = {
                id: 'token1',
                actor: {
                    uuid: 'Actor.abc123',
                    items: { contents: [item] },
                },
            };

            const result = service.getRuleElementsForToken(token);
            expect(result).toHaveLength(1);
            expect(result[0].rule.key).toBe('PF2eVisionerVisibility');
        });

        test('extracts multiple rule elements from multiple items', () => {
            const item1 = {
                name: 'Effect 1',
                system: {
                    rules: [
                        {
                            key: 'PF2eVisionerVisibility',
                            mode: 'increase',
                        },
                    ],
                },
            };

            const item2 = {
                name: 'Effect 2',
                system: {
                    rules: [
                        {
                            key: 'PF2eVisionerCover',
                            mode: 'set',
                            coverLevel: 'standard',
                        },
                    ],
                },
            };

            const token = {
                id: 'token1',
                actor: {
                    uuid: 'Actor.abc123',
                    items: { contents: [item1, item2] },
                },
            };

            const result = service.getRuleElementsForToken(token);
            expect(result).toHaveLength(2);
        });

        test('caches rule elements for subsequent calls', () => {
            const token = {
                id: 'token1',
                actor: {
                    uuid: 'Actor.abc123',
                    items: { contents: [] },
                },
            };

            const result1 = service.getRuleElementsForToken(token);
            const result2 = service.getRuleElementsForToken(token);

            expect(result1).toBe(result2);
        });

        test('cache expires after TTL', () => {
            jest.useFakeTimers();

            const token = {
                id: 'token1',
                actor: {
                    uuid: 'Actor.abc123',
                    items: { contents: [] },
                },
            };

            const result1 = service.getRuleElementsForToken(token);

            jest.advanceTimersByTime(1100);

            const result2 = service.getRuleElementsForToken(token);

            expect(result1).not.toBe(result2);

            jest.useRealTimers();
        });
    });

    describe('getVisibilityRuleElements', () => {
        test('filters to only visibility rule elements', () => {
            const visibilityItem = {
                system: {
                    rules: [{ key: 'PF2eVisionerVisibility', mode: 'increase' }],
                },
            };
            const coverItem = {
                system: {
                    rules: [{ key: 'PF2eVisionerCover', mode: 'set' }],
                },
            };

            const token = {
                id: 'token1',
                actor: {
                    uuid: 'Actor.abc123',
                    items: { contents: [visibilityItem, coverItem] },
                },
            };

            const result = service.getVisibilityRuleElements(token);
            expect(result).toHaveLength(1);
            expect(result[0].type).toBe('visibility');
        });
    });

    describe('getCoverRuleElements', () => {
        test('filters to only cover rule elements', () => {
            const visibilityItem = {
                system: {
                    rules: [{ key: 'PF2eVisionerVisibility', mode: 'increase' }],
                },
            };
            const coverItem = {
                system: {
                    rules: [{ key: 'PF2eVisionerCover', mode: 'set' }],
                },
            };

            const token = {
                id: 'token1',
                actor: {
                    uuid: 'Actor.abc123',
                    items: { contents: [visibilityItem, coverItem] },
                },
            };

            const result = service.getCoverRuleElements(token);
            expect(result).toHaveLength(1);
            expect(result[0].type).toBe('cover');
        });
    });

    describe('getDetectionRuleElements', () => {
        test('filters to only detection rule elements', () => {
            const visibilityItem = {
                system: {
                    rules: [{ key: 'PF2eVisionerVisibility', mode: 'increase' }],
                },
            };
            const detectionItem = {
                system: {
                    rules: [{ key: 'PF2eVisionerDetection', sense: 'darkvision' }],
                },
            };

            const token = {
                id: 'token1',
                actor: {
                    uuid: 'Actor.abc123',
                    items: { contents: [visibilityItem, detectionItem] },
                },
            };

            const result = service.getDetectionRuleElements(token);
            expect(result).toHaveLength(1);
            expect(result[0].type).toBe('detection');
        });
    });

    describe('shouldApplyRuleElement', () => {
        test('returns true for rule element without predicate', () => {
            const ruleElement = {
                rule: { key: 'PF2eVisionerVisibility', mode: 'increase' },
                type: 'visibility',
            };

            const result = service.shouldApplyRuleElement(ruleElement);
            expect(result).toBe(true);
        });

        test('returns true for rule element with empty predicate', () => {
            const ruleElement = {
                rule: { key: 'PF2eVisionerVisibility', mode: 'increase', predicate: [] },
                type: 'visibility',
            };

            const result = service.shouldApplyRuleElement(ruleElement);
            expect(result).toBe(true);
        });

        test('returns true when predicate passes', () => {
            const ruleElement = {
                rule: {
                    key: 'PF2eVisionerVisibility',
                    mode: 'increase',
                    predicate: ['self:token'],
                },
                type: 'visibility',
            };

            const context = {
                token: { id: 'token1', actor: { type: 'character' } },
            };

            const result = service.shouldApplyRuleElement(ruleElement, context);
            expect(result).toBe(true);
        });

        test('returns false when predicate fails', () => {
            const ruleElement = {
                rule: {
                    key: 'PF2eVisionerVisibility',
                    mode: 'increase',
                    predicate: ['non-existent-option'],
                },
                type: 'visibility',
            };

            const context = {
                token: { id: 'token1', actor: { type: 'character' } },
            };

            const result = service.shouldApplyRuleElement(ruleElement, context);
            expect(result).toBe(false);
        });

        test('handles "not:" prefix in predicates', () => {
            const ruleElement = {
                rule: {
                    key: 'PF2eVisionerVisibility',
                    predicate: ['not:self:token'],
                },
                type: 'visibility',
            };

            const context = {
                token: { id: 'token1', actor: { type: 'character' } },
            };

            const result = service.shouldApplyRuleElement(ruleElement, context);
            expect(result).toBe(false);
        });

        test('handles OR logic in predicates', () => {
            const ruleElement = {
                rule: {
                    predicate: [{ or: ['option-a', 'option-b'] }],
                },
                type: 'visibility',
            };

            const context = {
                customOptions: ['option-b'],
            };

            const result = service.shouldApplyRuleElement(ruleElement, context);
            expect(result).toBe(true);
        });

        test('handles AND logic in predicates', () => {
            const ruleElement = {
                rule: {
                    predicate: [{ and: ['option-a', 'option-b'] }],
                },
                type: 'visibility',
            };

            const context = {
                customOptions: ['option-a', 'option-b'],
            };

            const result = service.shouldApplyRuleElement(ruleElement, context);
            expect(result).toBe(true);
        });
    });

    describe('applyVisibilityModifiers', () => {
        test('returns base visibility when no rule elements', () => {
            const observer = {
                id: 'obs1',
                actor: { uuid: 'Actor.abc', items: { contents: [] } },
            };
            const target = {
                id: 'tgt1',
                actor: { uuid: 'Actor.def', items: { contents: [] } },
            };

            const result = service.applyVisibilityModifiers('observed', observer, target);
            expect(result).toBe('observed');
        });

        test('applies "set" mode modifier', () => {
            const item = {
                system: {
                    rules: [
                        {
                            key: 'PF2eVisionerVisibility',
                            mode: 'set',
                            status: 'hidden',
                        },
                    ],
                },
            };

            const observer = {
                id: 'obs1',
                actor: { uuid: 'Actor.abc', items: { contents: [item] } },
            };
            const target = {
                id: 'tgt1',
                actor: { uuid: 'Actor.def', items: { contents: [] } },
            };

            const result = service.applyVisibilityModifiers('observed', observer, target);
            expect(result).toBe('hidden');
        });

        test('applies "increase" mode modifier', () => {
            const item = {
                system: {
                    rules: [
                        {
                            key: 'PF2eVisionerVisibility',
                            mode: 'increase',
                            steps: 1,
                        },
                    ],
                },
            };

            const observer = {
                id: 'obs1',
                actor: { uuid: 'Actor.abc', items: { contents: [item] } },
            };
            const target = {
                id: 'tgt1',
                actor: { uuid: 'Actor.def', items: { contents: [] } },
            };

            const result = service.applyVisibilityModifiers('observed', observer, target);
            expect(result).toBe('concealed');
        });

        test('applies "decrease" mode modifier', () => {
            const item = {
                system: {
                    rules: [
                        {
                            key: 'PF2eVisionerVisibility',
                            mode: 'decrease',
                            steps: 1,
                        },
                    ],
                },
            };

            const observer = {
                id: 'obs1',
                actor: { uuid: 'Actor.abc', items: { contents: [item] } },
            };
            const target = {
                id: 'tgt1',
                actor: { uuid: 'Actor.def', items: { contents: [] } },
            };

            const result = service.applyVisibilityModifiers('concealed', observer, target);
            expect(result).toBe('observed');
        });

        test('clamps increase at undetected', () => {
            const item = {
                system: {
                    rules: [
                        {
                            key: 'PF2eVisionerVisibility',
                            mode: 'increase',
                            steps: 10,
                        },
                    ],
                },
            };

            const observer = {
                id: 'obs1',
                actor: { uuid: 'Actor.abc', items: { contents: [item] } },
            };
            const target = {
                id: 'tgt1',
                actor: { uuid: 'Actor.def', items: { contents: [] } },
            };

            const result = service.applyVisibilityModifiers('observed', observer, target);
            expect(result).toBe('undetected');
        });

        test('clamps decrease at observed', () => {
            const item = {
                system: {
                    rules: [
                        {
                            key: 'PF2eVisionerVisibility',
                            mode: 'decrease',
                            steps: 10,
                        },
                    ],
                },
            };

            const observer = {
                id: 'obs1',
                actor: { uuid: 'Actor.abc', items: { contents: [item] } },
            };
            const target = {
                id: 'tgt1',
                actor: { uuid: 'Actor.def', items: { contents: [] } },
            };

            const result = service.applyVisibilityModifiers('hidden', observer, target);
            expect(result).toBe('observed');
        });

        test('respects predicate conditions', () => {
            const item = {
                system: {
                    rules: [
                        {
                            key: 'PF2eVisionerVisibility',
                            mode: 'increase',
                            steps: 1,
                            predicate: ['impossible-condition'],
                        },
                    ],
                },
            };

            const observer = {
                id: 'obs1',
                actor: { uuid: 'Actor.abc', items: { contents: [item] } },
            };
            const target = {
                id: 'tgt1',
                actor: { uuid: 'Actor.def', items: { contents: [] } },
            };

            const result = service.applyVisibilityModifiers('observed', observer, target);
            expect(result).toBe('observed');
        });
    });

    describe('applyCoverModifiers', () => {
        test('returns base cover when no rule elements', () => {
            const observer = {
                id: 'obs1',
                actor: { uuid: 'Actor.abc', items: { contents: [] } },
            };
            const target = {
                id: 'tgt1',
                actor: { uuid: 'Actor.def', items: { contents: [] } },
            };

            const result = service.applyCoverModifiers('none', observer, target);
            expect(result).toBe('none');
        });

        test('applies "set" mode modifier', () => {
            const item = {
                system: {
                    rules: [
                        {
                            key: 'PF2eVisionerCover',
                            mode: 'set',
                            coverLevel: 'standard',
                        },
                    ],
                },
            };

            const observer = {
                id: 'obs1',
                actor: { uuid: 'Actor.abc', items: { contents: [item] } },
            };
            const target = {
                id: 'tgt1',
                actor: { uuid: 'Actor.def', items: { contents: [] } },
            };

            const result = service.applyCoverModifiers('none', observer, target);
            expect(result).toBe('standard');
        });

        test('applies "remove" mode modifier', () => {
            const item = {
                system: {
                    rules: [
                        {
                            key: 'PF2eVisionerCover',
                            mode: 'remove',
                        },
                    ],
                },
            };

            const observer = {
                id: 'obs1',
                actor: { uuid: 'Actor.abc', items: { contents: [item] } },
            };
            const target = {
                id: 'tgt1',
                actor: { uuid: 'Actor.def', items: { contents: [] } },
            };

            const result = service.applyCoverModifiers('standard', observer, target);
            expect(result).toBe('none');
        });

        test('applies "increase" mode modifier', () => {
            const item = {
                system: {
                    rules: [
                        {
                            key: 'PF2eVisionerCover',
                            mode: 'increase',
                            steps: 1,
                        },
                    ],
                },
            };

            const observer = {
                id: 'obs1',
                actor: { uuid: 'Actor.abc', items: { contents: [item] } },
            };
            const target = {
                id: 'tgt1',
                actor: { uuid: 'Actor.def', items: { contents: [] } },
            };

            const result = service.applyCoverModifiers('lesser', observer, target);
            expect(result).toBe('standard');
        });

        test('applies "decrease" mode modifier', () => {
            const item = {
                system: {
                    rules: [
                        {
                            key: 'PF2eVisionerCover',
                            mode: 'decrease',
                            steps: 1,
                        },
                    ],
                },
            };

            const observer = {
                id: 'obs1',
                actor: { uuid: 'Actor.abc', items: { contents: [item] } },
            };
            const target = {
                id: 'tgt1',
                actor: { uuid: 'Actor.def', items: { contents: [] } },
            };

            const result = service.applyCoverModifiers('standard', observer, target);
            expect(result).toBe('lesser');
        });

        test('clamps increase at greater', () => {
            const item = {
                system: {
                    rules: [
                        {
                            key: 'PF2eVisionerCover',
                            mode: 'increase',
                            steps: 10,
                        },
                    ],
                },
            };

            const observer = {
                id: 'obs1',
                actor: { uuid: 'Actor.abc', items: { contents: [item] } },
            };
            const target = {
                id: 'tgt1',
                actor: { uuid: 'Actor.def', items: { contents: [] } },
            };

            const result = service.applyCoverModifiers('none', observer, target);
            expect(result).toBe('greater');
        });

        test('clamps decrease at none', () => {
            const item = {
                system: {
                    rules: [
                        {
                            key: 'PF2eVisionerCover',
                            mode: 'decrease',
                            steps: 10,
                        },
                    ],
                },
            };

            const observer = {
                id: 'obs1',
                actor: { uuid: 'Actor.abc', items: { contents: [item] } },
            };
            const target = {
                id: 'tgt1',
                actor: { uuid: 'Actor.def', items: { contents: [] } },
            };

            const result = service.applyCoverModifiers('standard', observer, target);
            expect(result).toBe('none');
        });
    });

    describe('getModifiedSenses', () => {
        test('returns empty map when no detection rule elements', () => {
            const token = {
                id: 'token1',
                actor: { uuid: 'Actor.abc', items: { contents: [] } },
            };

            const result = service.getModifiedSenses(token);
            expect(result.size).toBe(0);
        });

        test('returns modified senses from detection rule elements', () => {
            const item = {
                system: {
                    rules: [
                        {
                            key: 'PF2eVisionerDetection',
                            sense: 'darkvision',
                            senseRange: 60,
                            acuity: 'precise',
                        },
                    ],
                },
            };

            const token = {
                id: 'token1',
                actor: { uuid: 'Actor.abc', items: { contents: [item] } },
            };

            const result = service.getModifiedSenses(token);
            expect(result.size).toBe(1);
            expect(result.get('darkvision')).toEqual({
                type: 'darkvision',
                range: 60,
                acuity: 'precise',
            });
        });

        test('handles multiple sense modifications', () => {
            const item = {
                system: {
                    rules: [
                        {
                            key: 'PF2eVisionerDetection',
                            sense: 'darkvision',
                            senseRange: 60,
                        },
                        {
                            key: 'PF2eVisionerDetection',
                            sense: 'tremorsense',
                            senseRange: 30,
                        },
                    ],
                },
            };

            const token = {
                id: 'token1',
                actor: { uuid: 'Actor.abc', items: { contents: [item] } },
            };

            const result = service.getModifiedSenses(token);
            expect(result.size).toBe(2);
            expect(result.has('darkvision')).toBe(true);
            expect(result.has('tremorsense')).toBe(true);
        });
    });

    describe('clearCache', () => {
        test('clears all cache when no tokenId provided', () => {
            const token = {
                id: 'token1',
                actor: { uuid: 'Actor.abc', items: { contents: [] } },
            };

            service.getRuleElementsForToken(token);
            expect(service.ruleElementCache.size).toBeGreaterThan(0);

            service.clearCache();
            expect(service.ruleElementCache.size).toBe(0);
        });

        test('clears only specified token cache', () => {
            const token1 = {
                id: 'token1',
                actor: { uuid: 'Actor.abc', items: { contents: [] } },
            };
            const token2 = {
                id: 'token2',
                actor: { uuid: 'Actor.def', items: { contents: [] } },
            };

            service.getRuleElementsForToken(token1);
            service.getRuleElementsForToken(token2);

            const initialSize = service.ruleElementCache.size;
            service.clearCache('token1');

            expect(service.ruleElementCache.size).toBeLessThan(initialSize);
        });
    });

    describe('invalidateCacheForActor', () => {
        test('invalidates cache entries for specified actor', () => {
            const actorUuid = 'Actor.abc123';
            const token = {
                id: 'token1',
                actor: { uuid: actorUuid, items: { contents: [] } },
            };

            service.getRuleElementsForToken(token);
            expect(service.ruleElementCache.size).toBeGreaterThan(0);

            service.invalidateCacheForActor(actorUuid);

            const cacheEntries = Array.from(service.ruleElementCache.keys());
            const hasActorEntries = cacheEntries.some((key) => key.includes(actorUuid));
            expect(hasActorEntries).toBe(false);
        });
    });
});
