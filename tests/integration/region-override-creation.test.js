/**
 * Integration test for VisibilityRegionBehavior override creation
 * Verifies that region behaviors properly create AVS overrides
 */

import { jest } from '@jest/globals';
import AvsOverrideManager from '../../scripts/chat/services/infra/avs-override-manager.js';
import { VisibilityRegionBehavior } from '../../scripts/regions/VisibilityRegionBehavior.js';
import * as visibilityMap from '../../scripts/stores/visibility-map.js';

global.foundry = global.foundry || {};
global.foundry.data = global.foundry.data || {};
global.foundry.data.regionBehaviors = global.foundry.data.regionBehaviors || {};
global.foundry.data.regionBehaviors.RegionBehaviorType = class RegionBehaviorType {
    constructor() {
        this.region = null;
    }

    static defineSchema() {
        return {};
    }

    static _createEventsField(events) {
        return {
            events: new Set(events.events || events),
        };
    }

    static LOCALIZATION_PREFIXES = [];
};

global.foundry.data.fields = {
    StringField: class StringField {
        constructor(options = {}) {
            this.options = options;
        }
    },
    BooleanField: class BooleanField {
        constructor(options = {}) {
            this.options = options;
        }
    },
};

global.CONST = {
    REGION_EVENTS: {
        TOKEN_ENTER: 'tokenEnter',
        TOKEN_EXIT: 'tokenExit',
    },
};

describe('Region Behavior Override Creation Integration', () => {
    let regionBehavior;
    let mockToken1, mockToken2;
    let applyOverridesSpy, removeOverrideSpy, getVisibilitySpy;

    beforeEach(() => {
        mockToken1 = {
            id: 'token1',
            document: { id: 'token1' },
            center: { x: 100, y: 100 },
            actor: { type: 'character' },
        };

        mockToken2 = {
            id: 'token2',
            document: { id: 'token2' },
            center: { x: 200, y: 200 },
            actor: { type: 'npc' },
        };

        global.canvas = {
            tokens: {
                placeables: [mockToken1, mockToken2],
                get: jest.fn((id) => [mockToken1, mockToken2].find((t) => t.id === id)),
            },
            perception: {
                update: jest.fn(),
            },
        };

        applyOverridesSpy = jest.spyOn(AvsOverrideManager, 'applyOverrides').mockResolvedValue(true);
        removeOverrideSpy = jest.spyOn(AvsOverrideManager, 'removeOverride').mockResolvedValue(true);
        getVisibilitySpy = jest.spyOn(visibilityMap, 'getVisibility').mockReturnValue('observed');

        regionBehavior = new VisibilityRegionBehavior();
        regionBehavior.visibilityState = 'hidden';
        regionBehavior.applyToInsideTokens = false;
        regionBehavior.twoWayRegion = false;
    });

    afterEach(() => {
        applyOverridesSpy.mockRestore();
        removeOverrideSpy.mockRestore();
        getVisibilitySpy.mockRestore();
    });

    test('should call applyOverrides with correct structure', async () => {
        const updates = [
            { source: mockToken1.id, target: mockToken2.id, state: 'hidden' },
        ];

        await regionBehavior._applyVisibilityUpdates(updates);

        expect(applyOverridesSpy).toHaveBeenCalled();
        const [observer, changes, options] = applyOverridesSpy.mock.calls[0];
        expect(observer).toBe(mockToken1);
        expect(Array.isArray(changes)).toBe(true);
        expect(changes.length).toBe(1);
        expect(changes[0].target).toBe(mockToken2);
        expect(changes[0].state).toBe('hidden');
        expect(options.source).toBe('region_override');
    });

    test('should batch multiple updates by observer', async () => {
        const mockToken3 = {
            id: 'token3',
            document: { id: 'token3' },
            center: { x: 300, y: 300 },
            actor: { type: 'character' },
        };
        global.canvas.tokens.placeables.push(mockToken3);
        global.canvas.tokens.get = jest.fn((id) =>
            [mockToken1, mockToken2, mockToken3].find((t) => t.id === id),
        );

        const updates = [
            { source: mockToken1.id, target: mockToken2.id, state: 'hidden' },
            { source: mockToken1.id, target: mockToken3.id, state: 'concealed' },
        ];

        await regionBehavior._applyVisibilityUpdates(updates);

        expect(applyOverridesSpy).toHaveBeenCalledTimes(1);
        const [observer, changes] = applyOverridesSpy.mock.calls[0];
        expect(observer).toBe(mockToken1);
        expect(changes.length).toBe(2);
    });

    test('should skip redundant updates', async () => {
        getVisibilitySpy.mockReturnValue('hidden');

        const updates = [
            { source: mockToken1.id, target: mockToken2.id, state: 'hidden' },
        ];

        await regionBehavior._applyVisibilityUpdates(updates);

        expect(applyOverridesSpy).not.toHaveBeenCalled();
    });
});
