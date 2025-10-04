/**
 * Unit tests for MinimumVisibilityService
 * Tests minimum visibility floor enforcement logic
 */

import { MinimumVisibilityService } from '../../../scripts/services/minimum-visibility-service.js';

describe('MinimumVisibilityService', () => {
    let service;

    beforeEach(() => {
        service = new MinimumVisibilityService();
    });

    describe('enforceVisibilityLimit', () => {
        it('should return calculated state when no minimum is set', () => {
            expect(service.enforceVisibilityLimit('observed', null)).toBe('observed');
            expect(service.enforceVisibilityLimit('concealed', null)).toBe('concealed');
            expect(service.enforceVisibilityLimit('hidden', null)).toBe('hidden');
            expect(service.enforceVisibilityLimit('undetected', null)).toBe('undetected');
        });

        it('should return calculated state when it is worse than minimum', () => {
            // Calculated is undetected (worst), minimum is concealed
            expect(service.enforceVisibilityLimit('undetected', 'concealed')).toBe('undetected');

            // Calculated is hidden, minimum is concealed
            expect(service.enforceVisibilityLimit('hidden', 'concealed')).toBe('hidden');

            // Calculated is undetected, minimum is hidden
            expect(service.enforceVisibilityLimit('undetected', 'hidden')).toBe('undetected');
        });

        it('should return minimum state when calculated is better than minimum', () => {
            // Calculated is observed (best), minimum is concealed
            expect(service.enforceVisibilityLimit('observed', 'concealed')).toBe('concealed');

            // Calculated is concealed, minimum is hidden
            expect(service.enforceVisibilityLimit('concealed', 'hidden')).toBe('hidden');

            // Calculated is hidden, minimum is undetected
            expect(service.enforceVisibilityLimit('hidden', 'undetected')).toBe('undetected');

            // Calculated is observed, minimum is undetected (worst case)
            expect(service.enforceVisibilityLimit('observed', 'undetected')).toBe('undetected');
        });

        it('should return calculated state when it equals minimum', () => {
            expect(service.enforceVisibilityLimit('concealed', 'concealed')).toBe('concealed');
            expect(service.enforceVisibilityLimit('hidden', 'hidden')).toBe('hidden');
            expect(service.enforceVisibilityLimit('undetected', 'undetected')).toBe('undetected');
        });

        it('should handle invalid states gracefully', () => {
            // Invalid calculated state defaults to observed (rank 0)
            expect(service.enforceVisibilityLimit('invalid', 'concealed')).toBe('concealed');

            // Invalid minimum state defaults to observed (rank 0)
            expect(service.enforceVisibilityLimit('concealed', 'invalid')).toBe('concealed');

            // Both invalid defaults to calculated
            expect(service.enforceVisibilityLimit('invalid', 'also-invalid')).toBe('invalid');
        });

        it('should handle undefined/null inputs', () => {
            expect(service.enforceVisibilityLimit(undefined, 'concealed')).toBe('concealed');
            expect(service.enforceVisibilityLimit('concealed', undefined)).toBe('concealed');
            expect(service.enforceVisibilityLimit(null, 'hidden')).toBe('hidden');
        });
    });

    describe('getMinimumVisibilityAsTarget', () => {
        it('should return null when token has no actor', () => {
            const token = { actor: null };
            expect(service.getMinimumVisibilityAsTarget(token)).toBe(null);
        });

        it('should return null when token is null/undefined', () => {
            expect(service.getMinimumVisibilityAsTarget(null)).toBe(null);
            expect(service.getMinimumVisibilityAsTarget(undefined)).toBe(null);
        });

        it('should return null when no minimum visibility effect exists', () => {
            const token = {
                actor: {
                    itemTypes: {
                        effect: []
                    }
                }
            };
            expect(service.getMinimumVisibilityAsTarget(token)).toBe(null);
        });

        it('should return null when effect has no RollOption rule', () => {
            const token = {
                actor: {
                    itemTypes: {
                        effect: [
                            {
                                system: {
                                    rules: [
                                        { key: 'SomeOtherRule' }
                                    ]
                                }
                            }
                        ]
                    }
                }
            };
            expect(service.getMinimumVisibilityAsTarget(token)).toBe(null);
        });

        it('should return concealed when effect has minimum-visibility-target:concealed', () => {
            const token = {
                actor: {
                    getRollOptions: () => ['minimum-visibility-target:concealed']
                }
            };
            expect(service.getMinimumVisibilityAsTarget(token)).toBe('concealed');
        });

        it('should return hidden when effect has minimum-visibility-target:hidden', () => {
            const token = {
                actor: {
                    getRollOptions: () => ['minimum-visibility-target:hidden']
                }
            };
            expect(service.getMinimumVisibilityAsTarget(token)).toBe('hidden');
        });

        it('should return undetected when effect has minimum-visibility-target:undetected', () => {
            const token = {
                actor: {
                    getRollOptions: () => ['minimum-visibility-target:undetected']
                }
            };
            expect(service.getMinimumVisibilityAsTarget(token)).toBe('undetected');
        });

        it('should return first matching effect when multiple exist', () => {
            const token = {
                actor: {
                    getRollOptions: () => [
                        'minimum-visibility-target:concealed',
                        'minimum-visibility-target:hidden'
                    ]
                }
            };
            // Should return first match
            expect(service.getMinimumVisibilityAsTarget(token)).toBe('concealed');
        });
    });

    describe('getMaximumVisibilityAsObserver', () => {
        it('should return null when token has no actor', () => {
            const token = { actor: null };
            expect(service.getMaximumVisibilityAsObserver(token)).toBe(null);
        });

        it('should return null when token is null/undefined', () => {
            expect(service.getMaximumVisibilityAsObserver(null)).toBe(null);
            expect(service.getMaximumVisibilityAsObserver(undefined)).toBe(null);
        });

        it('should return null when no maximum visibility effect exists', () => {
            const token = {
                actor: {
                    getRollOptions: () => []
                }
            };
            expect(service.getMaximumVisibilityAsObserver(token)).toBe(null);
        });

        it('should return observed when effect has maximum-visibility-observer:observed', () => {
            const token = {
                actor: {
                    getRollOptions: () => ['maximum-visibility-observer:observed']
                }
            };
            expect(service.getMaximumVisibilityAsObserver(token)).toBe('observed');
        });

        it('should return concealed when effect has maximum-visibility-observer:concealed', () => {
            const token = {
                actor: {
                    getRollOptions: () => ['maximum-visibility-observer:concealed']
                }
            };
            expect(service.getMaximumVisibilityAsObserver(token)).toBe('concealed');
        });

        it('should return hidden when effect has maximum-visibility-observer:hidden', () => {
            const token = {
                actor: {
                    getRollOptions: () => ['maximum-visibility-observer:hidden']
                }
            };
            expect(service.getMaximumVisibilityAsObserver(token)).toBe('hidden');
        });

        it('should return undetected when effect has maximum-visibility-observer:undetected', () => {
            const token = {
                actor: {
                    getRollOptions: () => ['maximum-visibility-observer:undetected']
                }
            };
            expect(service.getMaximumVisibilityAsObserver(token)).toBe('undetected');
        });

        it('should ignore wrong prefix and return null', () => {
            const token = {
                actor: {
                    getRollOptions: () => ['minimum-visibility-target:concealed']
                }
            };
            expect(service.getMaximumVisibilityAsObserver(token)).toBe(null);
        });
    });

    describe('applyMinimumVisibilityForPair', () => {
        it('should apply both target and observer limits correctly', () => {
            const observer = {
                actor: {
                    getRollOptions: () => ['maximum-visibility-observer:concealed']
                }
            };

            const target = {
                actor: {
                    getRollOptions: () => ['minimum-visibility-target:hidden']
                }
            };

            // Calculated is observed, target minimum is hidden, observer maximum is concealed
            // Should take the worst: hidden (from target minimum)
            const result = service.applyMinimumVisibilityForPair(observer, target, 'observed');
            expect(result).toBe('hidden');
        });

        it('should return calculated when no minimums are set', () => {
            const observer = {
                actor: {
                    getRollOptions: () => []
                }
            };

            const target = {
                actor: {
                    getRollOptions: () => []
                }
            };

            expect(service.applyMinimumVisibilityForPair(observer, target, 'observed')).toBe('observed');
            expect(service.applyMinimumVisibilityForPair(observer, target, 'concealed')).toBe('concealed');
        });

        it('should apply only target minimum when observer has none', () => {
            const observer = {
                actor: {
                    getRollOptions: () => []
                }
            };

            const target = {
                actor: {
                    getRollOptions: () => ['minimum-visibility-target:hidden']
                }
            };

            expect(service.applyMinimumVisibilityForPair(observer, target, 'observed')).toBe('hidden');
            expect(service.applyMinimumVisibilityForPair(observer, target, 'undetected')).toBe('undetected');
        });

        it('should apply only observer minimum when target has none', () => {
            const observer = {
                actor: {
                    getRollOptions: () => ['maximum-visibility-observer:concealed']
                }
            };

            const target = {
                actor: {
                    getRollOptions: () => []
                }
            };

            expect(service.applyMinimumVisibilityForPair(observer, target, 'observed')).toBe('concealed');
            expect(service.applyMinimumVisibilityForPair(observer, target, 'hidden')).toBe('hidden');
        });

        it('should handle errors gracefully and continue processing', () => {
            const observer = {
                actor: {
                    getRollOptions: () => ['maximum-visibility-observer:concealed']
                }
            };

            // Target with malformed data that might cause errors
            const target = null;

            // Should not throw and should still apply observer minimum
            expect(() => service.applyMinimumVisibilityForPair(observer, target, 'observed')).not.toThrow();
            const result = service.applyMinimumVisibilityForPair(observer, target, 'observed');
            expect(result).toBe('concealed');
        });

        it('should take the worse of two minimums', () => {
            const observer = {
                actor: {
                    getRollOptions: () => ['maximum-visibility-observer:undetected']
                }
            };

            const target = {
                actor: {
                    getRollOptions: () => ['minimum-visibility-target:concealed']
                }
            };

            // Observer minimum is undetected (worst), target minimum is concealed
            // Should apply both in order: concealed -> undetected
            const result = service.applyMinimumVisibilityForPair(observer, target, 'observed');
            expect(result).toBe('undetected');
        });
    });

    describe('edge cases and integration scenarios', () => {
        it('should handle tokens with missing itemTypes', () => {
            const token = {
                actor: {}
            };

            expect(service.getMinimumVisibilityAsTarget(token)).toBe(null);
            expect(service.getMaximumVisibilityAsObserver(token)).toBe(null);
        });

        it('should handle effects with missing system property', () => {
            const token = {
                actor: {
                    itemTypes: {
                        effect: [
                            { name: 'Some Effect' }
                        ]
                    }
                }
            };

            expect(service.getMinimumVisibilityAsTarget(token)).toBe(null);
        });

        it('should handle effects with missing rules array', () => {
            const token = {
                actor: {
                    itemTypes: {
                        effect: [
                            {
                                system: {}
                            }
                        ]
                    }
                }
            };

            expect(service.getMinimumVisibilityAsTarget(token)).toBe(null);
        });

        it('should handle precedence: minimum cannot improve calculated state', () => {
            // This is the key behavior: minimum is a FLOOR, not a ceiling
            expect(service.enforceVisibilityLimit('undetected', 'concealed')).toBe('undetected');
            expect(service.enforceVisibilityLimit('hidden', 'concealed')).toBe('hidden');

            // But it can make things worse
            expect(service.enforceVisibilityLimit('observed', 'hidden')).toBe('hidden');
            expect(service.enforceVisibilityLimit('concealed', 'undetected')).toBe('undetected');
        });
    });
});
