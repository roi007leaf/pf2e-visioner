jest.unmock('../../../scripts/cover/auto-cover/CoverUIManager.js');
import manager from '../../../scripts/cover/auto-cover/CoverUIManager.js';
import attackUseCase from '../../../scripts/cover/auto-cover/usecases/AttackRollUseCase.js';
import detector from '../../../scripts/cover/auto-cover/CoverDetector.js';

describe('Starlit Span chat indicator', () => {
  afterEach(() => jest.restoreAllMocks());

  test('renders a distinct indicator beside AC and respects GM visibility', async () => {
    const message = {
      flags: { 'pf2e-visioner': { starlitSpanCoverIgnore: { feat: 'starlit-span' } } },
    };
    const oldGM = game.user.isGM;
    game.user.isGM = true;
    let inserted = '';
    const empty = {
      length: 0,
      first() {
        return this;
      },
    };
    const ac = {
      length: 1,
      first() {
        return this;
      },
      after(html) {
        inserted += html;
      },
    };
    const html = { find: (selector) => (selector === '.target-dc .adjusted' ? ac : empty) };
    try {
      expect(await manager.shouldShowCoverOverrideIndicator(message)).toBe(true);
      await manager.injectCoverOverrideIndicator(message, html, true);
      const container = document.createElement('div');
      container.innerHTML = inserted;
      expect(container.querySelector('.pf2e-visioner-cover-starlit-span-indicator')).not.toBeNull();
      expect(container.querySelector('.pf2e-visioner-cover-sniping-duo-indicator')).toBeNull();
      game.user.isGM = false;
      expect(await manager.shouldShowCoverOverrideIndicator(message)).toBe(false);
      inserted = '';
      await manager.injectCoverOverrideIndicator(message, html, true);
      expect(inserted).toBe('');
    } finally {
      game.user.isGM = oldGM;
    }
  });

  test.each(['none', 'lesser'])(
    'persists benefit only when actual roll used no cover: %s',
    async (cover) => {
      const attacker = { id: 'attacker' },
        target = { id: 'target' };
      jest
        .spyOn(canvas.tokens, 'get')
        .mockImplementation((id) => (id === 'attacker' ? attacker : target));
      jest.spyOn(attackUseCase, '_resolveTargetTokenIdFromData').mockReturnValue('target');
      jest.spyOn(attackUseCase, '_getFixedCover').mockReturnValue('none');
      jest.spyOn(attackUseCase, '_detectCover').mockReturnValue('none');
      jest
        .spyOn(detector, 'consumeStarlitSpanCoverIgnore')
        .mockReturnValue({ feat: 'starlit-span' });
      const data = {
        speaker: { token: 'attacker' },
        flags: { pf2e: { context: { options: [`target:cover-level:${cover}`] } } },
      };
      const doc = { updateSource: jest.fn() };
      await attackUseCase.handlePreCreateChatMessage(data, doc);
      expect(!!data.flags['pf2e-visioner']?.starlitSpanCoverIgnore).toBe(cover === 'none');
      if (cover === 'none')
        expect(doc.updateSource).toHaveBeenCalledWith({
          'flags.pf2e-visioner.starlitSpanCoverIgnore': { feat: 'starlit-span' },
        });
    },
  );
});
