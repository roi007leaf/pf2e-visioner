import { CoverStateManager } from '../../../scripts/cover/auto-cover/CoverStateManager.js';
import { ruleElementService } from '../../../scripts/services/RuleElementService.js';

jest.mock('../../../scripts/services/RuleElementService.js', () => ({
    ruleElementService: {
        applyCoverModifiers: jest.fn((observer, target, baseCover) => baseCover),
        clearCache: jest.fn(),
    },
}));

describe('CoverStateManager - Rule Element Integration', () => {
    let coverStateManager;

    beforeEach(() => {
        jest.clearAllMocks();
        ruleElementService.applyCoverModifiers.mockImplementation((observer, target, baseCover) => baseCover);
        coverStateManager = new CoverStateManager();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('calls ruleElementService when setting cover', () => {
        test('calls applyCoverModifiers with correct parameters', async () => {
            const source = {
                id: 'source1',
                document: {
                    id: 'source1',
                    getFlag: jest.fn(() => ({})),
                    setFlag: jest.fn().mockResolvedValue(undefined),
                },
                actor: { uuid: 'Actor.source', items: { contents: [] } },
            };

            const target = {
                id: 'target1',
                document: { id: 'target1' },
                actor: { uuid: 'Actor.target', items: { contents: [] } },
            };

            await coverStateManager.setCoverBetween(source, target, 'standard', {
                skipEphemeralUpdate: true,
            });

            expect(ruleElementService.applyCoverModifiers).toHaveBeenCalledWith(source, target, 'standard');
        });

        test('uses modified cover from rule elements', async () => {
            ruleElementService.applyCoverModifiers.mockReturnValue('greater');

            const source = {
                id: 'source1',
                document: {
                    id: 'source1',
                    getFlag: jest.fn(() => ({})),
                    setFlag: jest.fn().mockResolvedValue(undefined),
                },
                actor: { uuid: 'Actor.source', items: { contents: [] } },
            };

            const target = {
                id: 'target1',
                document: { id: 'target1' },
                actor: { uuid: 'Actor.target', items: { contents: [] } },
            };

            await coverStateManager.setCoverBetween(source, target, 'standard', {
                skipEphemeralUpdate: true,
            });

            expect(source.document.setFlag).toHaveBeenCalledWith(
                expect.any(String),
                expect.any(String),
                expect.objectContaining({ target1: 'greater' })
            );
        });

        test('applies rule elements for all cover levels', async () => {
            const source = {
                id: 'source1',
                document: {
                    id: 'source1',
                    getFlag: jest.fn(() => ({})),
                    setFlag: jest.fn().mockResolvedValue(undefined),
                    unsetFlag: jest.fn().mockResolvedValue(undefined),
                },
                actor: { uuid: 'Actor.source', items: { contents: [] } },
            };

            const target = {
                id: 'target1',
                document: { id: 'target1' },
                actor: { uuid: 'Actor.target', items: { contents: [] } },
            };

            const coverLevels = ['none', 'lesser', 'standard', 'greater'];

            for (const level of coverLevels) {
                ruleElementService.applyCoverModifiers.mockClear();
                await coverStateManager.setCoverBetween(source, target, level, {
                    skipEphemeralUpdate: true,
                });

                expect(ruleElementService.applyCoverModifiers).toHaveBeenCalledWith(
                    source,
                    target,
                    level
                );
            }
        });

        test('handles cover increase via rule elements', async () => {
            ruleElementService.applyCoverModifiers.mockImplementation((observer, target, baseCover) => {
                if (baseCover === 'lesser') return 'standard';
                if (baseCover === 'standard') return 'greater';
                return baseCover;
            });

            const source = {
                id: 'source1',
                document: {
                    id: 'source1',
                    getFlag: jest.fn(() => ({})),
                    setFlag: jest.fn().mockResolvedValue(undefined),
                },
                actor: { uuid: 'Actor.source', items: { contents: [] } },
            };

            const target = {
                id: 'target1',
                document: { id: 'target1' },
                actor: { uuid: 'Actor.target', items: { contents: [] } },
            };

            await coverStateManager.setCoverBetween(source, target, 'lesser', {
                skipEphemeralUpdate: true,
            });

            expect(source.document.setFlag).toHaveBeenCalledWith(
                expect.any(String),
                expect.any(String),
                expect.objectContaining({ target1: 'standard' })
            );
        });

        test('handles cover removal via rule elements', async () => {
            ruleElementService.applyCoverModifiers.mockReturnValue('none');

            const source = {
                id: 'source1',
                document: {
                    id: 'source1',
                    getFlag: jest.fn(() => ({ target1: 'standard' })),
                    unsetFlag: jest.fn().mockResolvedValue(undefined),
                },
                actor: { uuid: 'Actor.source', items: { contents: [] } },
            };

            const target = {
                id: 'target1',
                document: { id: 'target1' },
                actor: { uuid: 'Actor.target', items: { contents: [] } },
            };

            await coverStateManager.setCoverBetween(source, target, 'standard', {
                skipEphemeralUpdate: true,
            });

            expect(source.document.unsetFlag).toHaveBeenCalled();
        });
    });

    describe('integration with existing cover', () => {
        test('applies rule elements to existing cover state', async () => {
            ruleElementService.applyCoverModifiers.mockReturnValue('greater');

            const source = {
                id: 'source1',
                document: {
                    id: 'source1',
                    getFlag: jest.fn(() => ({ target1: 'lesser' })),
                    setFlag: jest.fn().mockResolvedValue(undefined),
                },
                actor: { uuid: 'Actor.source', items: { contents: [] } },
            };

            const target = {
                id: 'target1',
                document: { id: 'target1' },
                actor: { uuid: 'Actor.target', items: { contents: [] } },
            };

            await coverStateManager.setCoverBetween(source, target, 'standard', {
                skipEphemeralUpdate: true,
            });

            expect(ruleElementService.applyCoverModifiers).toHaveBeenCalledWith(source, target, 'standard');
            expect(source.document.setFlag).toHaveBeenCalledWith(
                expect.any(String),
                expect.any(String),
                expect.objectContaining({ target1: 'greater' })
            );
        });

        test('does not update if rule element results in same cover', async () => {
            ruleElementService.applyCoverModifiers.mockReturnValue('standard');

            const source = {
                id: 'source1',
                document: {
                    id: 'source1',
                    getFlag: jest.fn(() => ({ target1: 'standard' })),
                    setFlag: jest.fn().mockResolvedValue(undefined),
                },
                actor: { uuid: 'Actor.source', items: { contents: [] } },
            };

            const target = {
                id: 'target1',
                document: { id: 'target1' },
                actor: { uuid: 'Actor.target', items: { contents: [] } },
            };

            await coverStateManager.setCoverBetween(source, target, 'standard', {
                skipEphemeralUpdate: true,
            });

            expect(source.document.setFlag).not.toHaveBeenCalled();
        });
    });

    describe('error handling', () => {
        test('handles rule element service errors gracefully', async () => {
            ruleElementService.applyCoverModifiers.mockImplementation(() => {
                throw new Error('Rule element error');
            });

            const source = {
                id: 'source1',
                document: {
                    id: 'source1',
                    getFlag: jest.fn(() => ({})),
                },
                actor: { uuid: 'Actor.source', items: { contents: [] } },
            };

            const target = {
                id: 'target1',
                document: { id: 'target1' },
                actor: { uuid: 'Actor.target', items: { contents: [] } },
            };

            await expect(
                coverStateManager.setCoverBetween(source, target, 'standard', {
                    skipEphemeralUpdate: true,
                })
            ).rejects.toThrow();
        });

        test('handles null/undefined tokens', async () => {
            await coverStateManager.setCoverBetween(null, null, 'standard', {
                skipEphemeralUpdate: true,
            });

            expect(ruleElementService.applyCoverModifiers).not.toHaveBeenCalled();
        });

        test('handles tokens without documents', async () => {
            const source = {
                id: 'source1',
                actor: { uuid: 'Actor.source', items: { contents: [] } },
            };

            const target = {
                id: 'target1',
                actor: { uuid: 'Actor.target', items: { contents: [] } },
            };

            await coverStateManager.setCoverBetween(source, target, 'standard', {
                skipEphemeralUpdate: true,
            });

            expect(ruleElementService.applyCoverModifiers).not.toHaveBeenCalled();
        });
    });

    describe('use cases', () => {
        test('feat grants permanent standard cover', async () => {
            ruleElementService.applyCoverModifiers.mockImplementation((observer, target, baseCover) => {
                return baseCover === 'none' ? 'standard' : baseCover;
            });

            const source = {
                id: 'source1',
                document: {
                    id: 'source1',
                    getFlag: jest.fn(() => ({})),
                    setFlag: jest.fn().mockResolvedValue(undefined),
                },
                actor: { uuid: 'Actor.source', items: { contents: [] } },
            };

            const target = {
                id: 'target1',
                document: { id: 'target1' },
                actor: { uuid: 'Actor.target', items: { contents: [] } },
            };

            await coverStateManager.setCoverBetween(source, target, 'none', {
                skipEphemeralUpdate: true,
            });

            expect(source.document.setFlag).toHaveBeenCalledWith(
                expect.any(String),
                expect.any(String),
                expect.objectContaining({ target1: 'standard' })
            );
        });

        test('ability negates all cover', async () => {
            ruleElementService.applyCoverModifiers.mockReturnValue('none');

            const source = {
                id: 'source1',
                document: {
                    id: 'source1',
                    getFlag: jest.fn(() => ({ target1: 'greater' })),
                    unsetFlag: jest.fn().mockResolvedValue(undefined),
                },
                actor: { uuid: 'Actor.source', items: { contents: [] } },
            };

            const target = {
                id: 'target1',
                document: { id: 'target1' },
                actor: { uuid: 'Actor.target', items: { contents: [] } },
            };

            await coverStateManager.setCoverBetween(source, target, 'greater', {
                skipEphemeralUpdate: true,
            });

            expect(source.document.unsetFlag).toHaveBeenCalled();
        });

        test('condition increases cover by one step', async () => {
            ruleElementService.applyCoverModifiers.mockImplementation((observer, target, baseCover) => {
                const levels = ['none', 'lesser', 'standard', 'greater'];
                const index = levels.indexOf(baseCover);
                return levels[Math.min(index + 1, levels.length - 1)];
            });

            const source = {
                id: 'source1',
                document: {
                    id: 'source1',
                    getFlag: jest.fn(() => ({})),
                    setFlag: jest.fn().mockResolvedValue(undefined),
                },
                actor: { uuid: 'Actor.source', items: { contents: [] } },
            };

            const target = {
                id: 'target1',
                document: { id: 'target1' },
                actor: { uuid: 'Actor.target', items: { contents: [] } },
            };

            await coverStateManager.setCoverBetween(source, target, 'lesser', {
                skipEphemeralUpdate: true,
            });

            expect(source.document.setFlag).toHaveBeenCalledWith(
                expect.any(String),
                expect.any(String),
                expect.objectContaining({ target1: 'standard' })
            );
        });
    });

    describe('performance', () => {
        test('rule element integration does not significantly impact cover setting', async () => {
            const source = {
                id: 'source1',
                document: {
                    id: 'source1',
                    getFlag: jest.fn(() => ({})),
                    setFlag: jest.fn().mockResolvedValue(undefined),
                },
                actor: { uuid: 'Actor.source', items: { contents: [] } },
            };

            const target = {
                id: 'target1',
                document: { id: 'target1' },
                actor: { uuid: 'Actor.target', items: { contents: [] } },
            };

            const start = Date.now();
            for (let i = 0; i < 100; i++) {
                await coverStateManager.setCoverBetween(source, target, 'standard', {
                    skipEphemeralUpdate: true,
                });
            }
            const duration = Date.now() - start;

            expect(duration).toBeLessThan(1000);
            expect(ruleElementService.applyCoverModifiers).toHaveBeenCalledTimes(100);
        });
    });
});
