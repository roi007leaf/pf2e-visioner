import { VisibilityCalculator } from '../../scripts/visibility/auto-visibility/VisibilityCalculator.js';

describe('VisibilityCalculator null guards', () => {
    test('should not throw when exclusion manager is null', async () => {
        const vc = new VisibilityCalculator();
        // initialize with only minimal dependencies; pass null for spatial/exclusion managers
        vc.initialize(
            { getLightLevelAt: jest.fn(() => ({})) },
            {
                getVisionCapabilities: jest.fn(() => ({ hasVision: true })),
                hasPreciseNonVisualInRange: jest.fn(() => false),
                canSenseImprecisely: jest.fn(() => false),
                hasLineOfSight: jest.fn(() => true),
                isSoundBlocked: jest.fn(() => false),
                determineVisibilityFromLighting: jest.fn(() => 'observed'),
                clearVisionCache: jest.fn(),
            },
            { isBlinded: jest.fn(() => false), isInvisibleTo: jest.fn(() => false), isDazzled: jest.fn(() => false) },
            null,
            null,
        );

        const token = {
            name: 't',
            document: { id: '1', x: 0, y: 0, width: 1, height: 1, elevation: 0 },
            actor: {},
        };

        await expect(vc.calculateVisibility(token, token)).resolves.toBeDefined();
    });
});
