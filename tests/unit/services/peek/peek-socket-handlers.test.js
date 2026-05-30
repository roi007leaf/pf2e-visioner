import '../../../setup.js';
import { peekUpdateHandler, peekEndHandler } from '../../../../scripts/services/socket.js';
import { peekRegistry } from '../../../../scripts/services/Peek/PeekRegistry.js';

describe('GM peek socket handlers', () => {
  let sceneId;
  beforeEach(() => {
    sceneId = global.canvas?.scene?.id;
    global.game.user.isGM = true;
  });
  afterEach(() => { peekRegistry.clearAll(); global.game.user.isGM = true; });

  test('peekUpdateHandler ignores non-GM', () => {
    global.game.user.isGM = false;
    peekUpdateHandler({ tokenId: 't', sceneId, origin: { x: 1, y: 2 }, direction: 0, fov: 90, ignoredWallIds: [] });
    expect(peekRegistry.has('t')).toBe(false);
  });

  test('peekUpdateHandler ignores other scenes', () => {
    peekUpdateHandler({ tokenId: 't', sceneId: 'OTHER', origin: { x: 1, y: 2 }, direction: 0, fov: 90, ignoredWallIds: [] });
    expect(peekRegistry.has('t')).toBe(false);
  });

  test('peekUpdateHandler stores on this scene as GM', () => {
    peekUpdateHandler({ tokenId: 't', sceneId, origin: { x: 1, y: 2 }, direction: 0, fov: 90, ignoredWallIds: ['w'] });
    expect(peekRegistry.get('t').ignoredWallIds).toEqual(['w']);
  });

  test('peekEndHandler clears', () => {
    peekRegistry.set('t', { origin: { x: 0, y: 0 }, direction: 0, fov: 90, ignoredWallIds: [] }, 1);
    peekEndHandler({ tokenId: 't', sceneId });
    expect(peekRegistry.has('t')).toBe(false);
  });

  test('peekEndHandler ignores non-GM', () => {
    global.game.user.isGM = false;
    peekRegistry.set('t', { origin: { x: 0, y: 0 }, direction: 0, fov: 90, ignoredWallIds: [] }, 1);
    peekEndHandler({ tokenId: 't', sceneId });
    expect(peekRegistry.has('t')).toBe(true);
  });

  test('peekEndHandler ignores other scenes', () => {
    peekRegistry.set('t', { origin: { x: 0, y: 0 }, direction: 0, fov: 90, ignoredWallIds: [] }, 1);
    peekEndHandler({ tokenId: 't', sceneId: 'OTHER' });
    expect(peekRegistry.has('t')).toBe(true);
  });
});
