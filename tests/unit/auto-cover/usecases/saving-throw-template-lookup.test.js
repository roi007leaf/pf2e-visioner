import '../../../setup.js';

describe('SavingThrowUseCase template lookup', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('uses TemplateManager target index for dialog template state', async () => {
    const attacker = global.createMockToken({ id: 'attacker' });
    const target = global.createMockToken({ id: 'target' });
    const mockAutoCoverSystem = {
      normalizeTokenRef: jest.fn((ref) => ref),
      detectCoverBetweenTokens: jest.fn(() => 'none'),
      getCoverBonusByState: jest.fn(() => 0),
    };
    const mockCoverUIManager = {
      injectDialogCoverUI: jest.fn(),
      shouldShowCoverOverrideIndicator: jest.fn().mockResolvedValue(false),
      injectCoverOverrideIndicator: jest.fn(),
    };
    const mockTemplateManager = {
      getLatestTemplateForTarget: jest.fn(() => ({
        id: 'template-new',
        data: {
          targets: {
            target: { state: 'greater' },
          },
        },
      })),
      getTemplatesData: jest.fn(() => new Map()),
    };

    jest.doMock('../../../../scripts/cover/auto-cover/AutoCoverSystem.js', () => mockAutoCoverSystem);
    jest.doMock('../../../../scripts/cover/auto-cover/CoverUIManager.js', () => mockCoverUIManager);
    jest.doMock('../../../../scripts/cover/auto-cover/TemplateManager.js', () => mockTemplateManager);

    const { SavingThrowUseCase } = await import(
      '../../../../scripts/cover/auto-cover/usecases/SavingThrowUseCase.js'
    );
    const useCase = new SavingThrowUseCase();
    const dialog = {
      context: {
        token: { object: attacker },
        target: { token: { object: target } },
      },
      check: { modifiers: [], calculateTotal: jest.fn() },
      render: jest.fn(),
    };

    await useCase.handleCheckDialog(dialog, document.createElement('section'));

    expect(mockTemplateManager.getLatestTemplateForTarget).toHaveBeenCalledWith('target');
    expect(mockTemplateManager.getTemplatesData).not.toHaveBeenCalled();
    expect(mockCoverUIManager.injectDialogCoverUI).toHaveBeenCalledWith(
      dialog,
      expect.any(HTMLElement),
      'greater',
      target,
      'none',
      expect.any(Function),
    );
  });
});
