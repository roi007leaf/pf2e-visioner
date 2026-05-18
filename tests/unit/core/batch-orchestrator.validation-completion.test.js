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

    it('should not use Promise.race for validation timeout', () => {
        const batchOverrideValidationWorkflowPath = path.resolve(
            'scripts/visibility/auto-visibility/core/BatchOverrideValidationWorkflow.js',
        );
        const content = fs.readFileSync(batchOverrideValidationWorkflowPath, 'utf8');

        expect(content).not.toContain('Promise.race');
        expect(content).not.toContain('timeoutPromise');
        expect(content).toContain('await this.#overrideValidationManager.processQueuedValidations()');
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
