describe('BatchOrchestrator - validation completion', () => {
    let BatchOrchestrator;
    let fs;
    let path;

    beforeEach(async () => {
        const batchOrchestratorModule = await import('../../../scripts/visibility/auto-visibility/core/BatchOrchestrator.js');
        BatchOrchestrator = batchOrchestratorModule.BatchOrchestrator;

        fs = require('fs');
        path = require('path');
    });

    it('should not use Promise.race for validation timeout', async () => {
        const batchOrchestratorPath = path.resolve(
            'scripts/visibility/auto-visibility/core/BatchOrchestrator.js',
        );
        const content = fs.readFileSync(batchOrchestratorPath, 'utf8');

        const overrideValidationSection = content.match(
            /\/\/\s*Queue and process override validation[\s\S]*?catch\s*\([^)]*\)\s*\{[\s\S]*?\}/
        );

        expect(overrideValidationSection).toBeTruthy();

        const sectionText = overrideValidationSection[0];

        expect(sectionText).not.toContain('Promise.race');
        expect(sectionText).not.toContain('timeoutPromise');

        expect(sectionText).toContain('await this.overrideValidationManager.processQueuedValidations()');
    });

    it('should directly await processQueuedValidations without racing', () => {
        const mockOverrideValidationManager = {
            queueOverrideValidation: jest.fn(),
            processQueuedValidations: jest.fn(async () => { })
        };

        const orchestrator = new BatchOrchestrator({
            batchProcessor: { processBatch: jest.fn() },
            telemetryReporter: { startBatch: jest.fn(), stopBatch: jest.fn() },
            exclusionManager: { isExcluded: jest.fn() },
            visibilityMapService: { setVisibilityBetween: jest.fn() },
            overrideValidationManager: mockOverrideValidationManager,
            moduleId: 'pf2e-visioner'
        });

        expect(orchestrator.overrideValidationManager).toBe(mockOverrideValidationManager);
    });
});
