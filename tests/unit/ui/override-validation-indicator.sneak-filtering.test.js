/**
 * @file override-validation-indicator.sneak-filtering.test.js
 * @description Test suite for sneak-aware filtering in override validation indicator
 * Tests the filtering through the public show() method behavior
 */

import { OverrideValidationIndicator } from '../../../scripts/ui/override-validation-indicator.js';

// Mock canvas and tokens
global.canvas = {
    tokens: {
        get: jest.fn()
    }
};

// Mock DOM elements and methods
global.document = {
    createElement: jest.fn(() => ({
        style: {},
        classList: {
            add: jest.fn(),
            remove: jest.fn(),
            contains: jest.fn()
        },
        appendChild: jest.fn(),
        addEventListener: jest.fn(),
        innerHTML: '',
        textContent: ''
    })),
    body: {
        appendChild: jest.fn(),
        removeChild: jest.fn()
    }
};

describe('OverrideValidationIndicator - Sneak Filtering', () => {
    let indicator;

    beforeEach(() => {
        // Clear all mocks
        jest.clearAllMocks();

        // Create indicator instance
        indicator = new OverrideValidationIndicator();

        // Mock the badge element
        const mockBadge = {
            textContent: '0',
            classList: {
                add: jest.fn(),
                remove: jest.fn(),
                contains: jest.fn()
            }
        };

        // Mock the main element with badge
        const mockElement = {
            style: {},
            classList: {
                add: jest.fn(),
                remove: jest.fn(),
                contains: jest.fn(),
                toggle: jest.fn()
            },
            querySelector: jest.fn().mockImplementation((selector) => {
                if (selector === '.indicator-badge') {
                    return mockBadge;
                }
                return null;
            }),
            addEventListener: jest.fn(),
            textContent: '',
            title: ''
        };

        // Set the mock element
        indicator._el = mockElement;
        indicator._badge = mockBadge; // Add reference for easier testing
    });

    describe('Sneak-aware filtering behavior', () => {
        it('should show overrides when no sneaking is involved', () => {
            // Mock tokens without sneak flags
            global.canvas.tokens.get.mockImplementation((tokenId) => {
                if (tokenId === 'observer1' || tokenId === 'target1') {
                    return {
                        document: {
                            getFlag: jest.fn().mockReturnValue(false)
                        }
                    };
                }
                return null;
            });

            const overrides = [
                { observerId: 'observer1', targetId: 'target1', state: 'hidden' }
            ];

            // This should not throw and should process the override
            expect(() => {
                indicator.show(overrides);
            }).not.toThrow();

            // The badge should show "1" since there's one valid override
            expect(indicator._badge.textContent).toBe('1');
        });

        it('should filter overrides with no meaningful state', () => {
            global.canvas.tokens.get.mockImplementation(() => ({
                document: {
                    getFlag: jest.fn().mockReturnValue(false)
                }
            }));

            const overrides = [
                { observerId: 'observer1', targetId: 'target1' }, // no state
                { observerId: 'observer1', targetId: 'target2', state: 'avs' }, // avs state
                { observerId: 'observer1', targetId: 'target3', state: 'hidden' } // valid state
            ];

            indicator.show(overrides);

            // Should only show 1 override (the one with meaningful state)
            expect(indicator._badge.textContent).toBe('1');
        });

        it('should filter out target changes when target is sneaking', () => {
            // Mock target as sneaking, observer not sneaking
            global.canvas.tokens.get.mockImplementation((tokenId) => {
                if (tokenId === 'observer1') {
                    return {
                        document: {
                            getFlag: jest.fn().mockReturnValue(false) // observer not sneaking
                        }
                    };
                } else if (tokenId === 'target1') {
                    return {
                        document: {
                            getFlag: jest.fn().mockReturnValue(true) // target is sneaking
                        }
                    };
                }
                return null;
            });

            const overrides = [
                { observerId: 'observer1', targetId: 'target1', state: 'hidden' }
            ];

            indicator.show(overrides);

            // Should not be visible because target is sneaking (filtered out)
            // The show method should return early and hide the indicator
            expect(indicator._el.classList.remove).toHaveBeenCalledWith('pf2e-visioner-override-indicator--visible');
        });

        it('should show observer changes when observer is sneaking', () => {
            // Mock observer as sneaking, target not sneaking
            global.canvas.tokens.get.mockImplementation((tokenId) => {
                if (tokenId === 'observer1') {
                    return {
                        document: {
                            getFlag: jest.fn().mockReturnValue(true) // observer is sneaking
                        }
                    };
                } else if (tokenId === 'target1') {
                    return {
                        document: {
                            getFlag: jest.fn().mockReturnValue(false) // target not sneaking
                        }
                    };
                }
                return null;
            });

            const overrides = [
                { observerId: 'observer1', targetId: 'target1', state: 'hidden' }
            ];

            indicator.show(overrides);

            // Should show 1 override because observer changes are allowed when observer is sneaking
            expect(indicator._badge.textContent).toBe('1');
        });

        it('should handle missing tokens gracefully', () => {
            // Mock missing tokens
            global.canvas.tokens.get.mockReturnValue(null);

            const overrides = [
                { observerId: 'missing1', targetId: 'missing2', state: 'hidden' }
            ];

            // Should not throw
            expect(() => {
                indicator.show(overrides);
            }).not.toThrow();

            // Should show the override since missing tokens default to allowing the override
            expect(indicator._badge.textContent).toBe('1');
        });
    });
});