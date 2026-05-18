import { registerMovementCostHooks } from '../../../scripts/hooks/movement-cost.js';
import { resetRegistrationsForTests } from '../../../scripts/utils/register-once.js';

describe('Movement Cost Hooks', () => {
    let mockGetMovementCostFunction;
    let TerrainDataClass;

    beforeEach(() => {
        resetRegistrationsForTests();

        // Mock CONFIG and TerrainData
        mockGetMovementCostFunction = jest.fn();

        TerrainDataClass = {
            getMovementCostFunction: mockGetMovementCostFunction
        };

        global.CONFIG = {
            Token: {
                movement: {
                    TerrainData: TerrainDataClass
                }
            }
        };

        global.game = { ready: true };

        // Ensure Hooks exists and mock methods required by setup.js cleanup
        if (!global.Hooks) global.Hooks = {};
        global.Hooks.once = jest.fn((hook, cb) => cb());
        global.Hooks.on = jest.fn();
        global.Hooks.off = jest.fn();
        global.Hooks.call = jest.fn();
        global.Hooks.callAll = jest.fn();

        // Mock console.warn to avoid clutter
        jest.spyOn(console, 'warn').mockImplementation(() => { });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('registers hook successfully', () => {
        registerMovementCostHooks();
        expect(TerrainDataClass.getMovementCostFunction).not.toBe(mockGetMovementCostFunction);
    });

    test('registering twice does not wrap movement cost twice', () => {
        const mockCostCalculator = jest.fn().mockReturnValue(10);
        mockGetMovementCostFunction.mockReturnValue(mockCostCalculator);

        registerMovementCostHooks();
        const wrappedFactory = TerrainDataClass.getMovementCostFunction;

        registerMovementCostHooks();

        expect(TerrainDataClass.getMovementCostFunction).toBe(wrappedFactory);

        const mockActor = {
            hasCondition: jest.fn().mockReturnValue(true),
            itemTypes: { effect: [] }
        };
        const mockToken = { actor: mockActor };
        const costFn = wrappedFactory.call(TerrainDataClass, mockToken, {});
        costFn({}, {}, 10, { terrain: { difficulty: 1 } });

        expect(mockGetMovementCostFunction).toHaveBeenCalledTimes(1);
        expect(mockCostCalculator).toHaveBeenCalledTimes(1);
    });

    test('registering twice before ready binds one ready hook', () => {
        global.game.ready = false;
        global.Hooks.once = jest.fn();

        registerMovementCostHooks();
        registerMovementCostHooks();

        expect(global.Hooks.once).toHaveBeenCalledTimes(1);
        expect(global.Hooks.once).toHaveBeenCalledWith('ready', expect.any(Function));
    });

    test('applies difficult terrain when blinded', () => {
        const mockCostCalculator = jest.fn().mockReturnValue(10);
        mockGetMovementCostFunction.mockReturnValue(mockCostCalculator);

        registerMovementCostHooks();
        const wrappedFactory = TerrainDataClass.getMovementCostFunction;

        const mockActor = {
            hasCondition: jest.fn().mockReturnValue(true), // Blinded
            itemTypes: { effect: [] }
        };
        const mockToken = { actor: mockActor };

        // Get the cost function for this token
        const costFn = wrappedFactory.call(TerrainDataClass, mockToken, {});

        // Execute cost function
        const segment = { terrain: { difficulty: 1 } };
        costFn({}, {}, 10, segment);

        expect(mockCostCalculator).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            expect.anything(),
            expect.objectContaining({ terrain: { difficulty: 2 } })
        );
    });

    test('does not apply difficult terrain when has darkness effect (handled by region now)', () => {
        const mockCostCalculator = jest.fn().mockReturnValue(10);
        mockGetMovementCostFunction.mockReturnValue(mockCostCalculator);

        registerMovementCostHooks();
        const wrappedFactory = TerrainDataClass.getMovementCostFunction;

        const mockActor = {
            hasCondition: jest.fn().mockReturnValue(false),
            itemTypes: {
                effect: [{ slug: 'darkness', name: 'Darkness' }]
            }
        };
        const mockToken = { actor: mockActor };

        const costFn = wrappedFactory.call(TerrainDataClass, mockToken, {});

        // Should return original calculator directly
        expect(costFn).toBe(mockCostCalculator);
    });

    test('does not apply difficult terrain when normal', () => {
        const mockCostCalculator = jest.fn().mockReturnValue(10);
        mockGetMovementCostFunction.mockReturnValue(mockCostCalculator);

        registerMovementCostHooks();
        const wrappedFactory = TerrainDataClass.getMovementCostFunction;

        const mockActor = {
            hasCondition: jest.fn().mockReturnValue(false),
            itemTypes: { effect: [] }
        };
        const mockToken = { actor: mockActor };

        // In this case, the wrapper returns the original cost calculator directly
        const costFn = wrappedFactory.call(TerrainDataClass, mockToken, {});

        expect(costFn).toBe(mockCostCalculator);
    });

    test('preserves greater difficult terrain', () => {
        const mockCostCalculator = jest.fn().mockReturnValue(15);
        mockGetMovementCostFunction.mockReturnValue(mockCostCalculator);

        registerMovementCostHooks();
        const wrappedFactory = TerrainDataClass.getMovementCostFunction;

        const mockActor = {
            hasCondition: jest.fn().mockReturnValue(true),
            itemTypes: { effect: [] }
        };
        const mockToken = { actor: mockActor };

        const costFn = wrappedFactory.call(TerrainDataClass, mockToken, {});
        const segment = { terrain: { difficulty: 3 } }; // Already greater difficult
        costFn({}, {}, 10, segment);

        expect(mockCostCalculator).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            expect.anything(),
            expect.objectContaining({ terrain: { difficulty: 3 } })
        );
    });
});
