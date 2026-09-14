import { SystemStateProvider } from '../../../scripts/visibility/auto-visibility/core/SystemStateProvider.js';
import { getTokenRenderDocumentDelta, waitForTokenDocumentUpdateSafe } from '../../../scripts/stores/document-update-guard.js';

jest.mock('../../../scripts/services/scene-token-vision.js', () => ({ isSceneTokenVisionDisabled: () => false }));

test('automatic event authority follows the active GM across handover', () => {
  const saved = global.game;
  global.game = { user: { id: 'second', isGM: true }, users: { activeGM: { id: 'first' } } };
  try {
    const state = new SystemStateProvider(); state.setEnabled(true); state.getSetting = () => false;
    expect(state.shouldProcessEvents()).toBe(false);
    game.users.activeGM = { id: 'second' };
    expect(state.shouldProcessEvents()).toBe(true);
    game.user.isGM = false;
    expect(state.shouldProcessEvents()).toBe(false);
  } finally { global.game = saved; }
});

test('movement waits never read destroyed PIXI transforms', async () => {
  const token = { destroyed: true, get x() { throw Error('destroyed transform'); }, document: { x: 0, y: 0 } };
  expect(getTokenRenderDocumentDelta(token)).toBeNull();
  await expect(waitForTokenDocumentUpdateSafe(token)).resolves.toBeUndefined();
});

test('movement wait exits when deletion removes a token during animation', async () => {
  const token = { x: 100, y: 0, document: { id: 'gone', x: 0, y: 0, parent: { tokens: new Map() } } };
  token.document.parent.tokens.set('gone', token.document);
  const wait = waitForTokenDocumentUpdateSafe(token, { intervalMs: 1 });
  token.document.parent.tokens.delete('gone');
  token.destroyed = true;
  await expect(wait).resolves.toBeUndefined();
});
