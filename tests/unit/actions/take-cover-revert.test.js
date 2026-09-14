import '../../setup.js';

jest.mock('../../../scripts/utils.js', () => ({ setCoverBetween: jest.fn() }));
jest.mock('../../../scripts/cover/batch.js', () => ({ removeTakeCoverProneRangedEffects: jest.fn() }));
jest.mock('../../../scripts/chat/services/infra/AvsOverrideManager.js', () => ({
  __esModule: true, default: { removeTakeCoverTracking: jest.fn() },
}));

import { TakeCoverActionHandler } from '../../../scripts/chat/services/actions/TakeCoverAction.js';
import { tokenHasActiveTakeCoverState } from '../../../scripts/chat/services/take-cover-expiration-service.js';
import Overrides from '../../../scripts/chat/services/infra/AvsOverrideManager.js';
import { setCoverBetween } from '../../../scripts/utils.js';
import { removeTakeCoverProneRangedEffects } from '../../../scripts/cover/batch.js';

describe('Take Cover undo lifecycle', () => {
  let handler, target, observers, covers;
  beforeEach(() => {
    handler = new TakeCoverActionHandler();
    handler.getCacheMap().clear();
    observers = ['first', 'second'].map(id => ({ id }));
    target = { id: 'actor', document: { flags: { 'pf2e-visioner': {} } }, actor: { itemTypes: { effect: [] } } };
    covers = new Map();
    for (const observer of observers) {
      target.document.flags['pf2e-visioner'][`avs-override-from-${observer.id}`] = {
        source: 'take_cover_action', coverOverrideSource: 'take_cover_action', coverOnly: true, expectedCover: 'greater',
      };
      covers.set(observer.id, 'greater');
    }
    handler.getTokenById = id => observers.find(o => o.id === id);
    Overrides.removeTakeCoverTracking.mockImplementation(async id => {
      delete target.document.flags['pf2e-visioner'][`avs-override-from-${id}`];
      covers.delete(id); // Removing tracking also removes its cover map entry.
    });
    setCoverBetween.mockImplementation(async (observer, _target, state) => covers.set(observer.id, state));
    removeTakeCoverProneRangedEffects.mockImplementation(async token => { token.actor.itemTypes.effect = []; });
    handler.getCacheMap().set('message', observers.map(o => ({ observerId: o.id, oldCover: 'standard' })));
  });

  test('undo to nonzero cover removes active tracking before restoring cover', async () => {
    expect(tokenHasActiveTakeCoverState(target)).toBe(true);
    await handler.revert({ messageId: 'message', actor: target });
    expect(tokenHasActiveTakeCoverState(target)).toBe(false);
    expect([...covers.values()]).toEqual(['standard', 'standard']);
    expect(handler.getCacheMap().has('message')).toBe(false);
  });

  test('row undo preserves the other observer and its undo cache', async () => {
    await handler.revert({ messageId: 'message', actor: target, targetTokenId: 'first' });
    expect(covers.get('first')).toBe('standard');
    expect(covers.get('second')).toBe('greater');
    expect(target.document.flags['pf2e-visioner']['avs-override-from-first']).toBeUndefined();
    expect(handler.getCacheMap().get('message')).toEqual([{ observerId: 'second', oldCover: 'standard' }]);
  });

  test('prone direct-apply without observers can still be undone', async () => {
    target.document.flags['pf2e-visioner'] = {};
    target.actor.itemTypes.effect = [{ flags: { 'pf2e-visioner': { takeCoverProneRangedOnly: true } } }];
    handler.cacheAfterApply({ messageId: 'prone' }, [{ target, takeCoverProneRangedOnly: true, oldCover: 'none' }]);
    await handler.revert({ messageId: 'prone', actor: target });
    expect(tokenHasActiveTakeCoverState(target)).toBe(false);
    expect(handler.getCacheMap().has('prone')).toBe(false);
  });
});
