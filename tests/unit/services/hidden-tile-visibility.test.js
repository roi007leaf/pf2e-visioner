import { hiddenTileVisibleToUser, refreshHiddenTileVisual, shouldHighlightHiddenTile, syncHiddenTileTokenFlags, tileVisibilityForObserver } from '../../../scripts/services/Tiles/hidden-tile-visibility.js';

const tile = { id: 'tile-1', document: { id: 'tile-1', hidden: false, getFlag: (_module, key) => key === 'hiddenTile' } };
const token = (id, state, owned = true) => ({
  id, document: {
    id,
    testUserPermission: () => owned,
    getFlag: (_module, key) => key === 'tiles' ? { 'tile-1': state } : undefined,
  },
});

test('hidden tiles stay concealed until an owned observer discovers them', () => {
  expect(tileVisibilityForObserver(tile, token('a', 'hidden'))).toBe(false);
  expect(tileVisibilityForObserver(tile, token('a', 'observed'))).toBe(true);
  expect(hiddenTileVisibleToUser(tile, { user: { isGM: false }, tokens: [token('a', 'hidden'), token('b', 'observed', false)], enabled: true })).toBe(false);
  expect(hiddenTileVisibleToUser(tile, { user: { isGM: false }, tokens: [token('a', 'hidden'), token('b', 'observed')], enabled: true })).toBe(true);
  expect(hiddenTileVisibleToUser(tile, { user: { isGM: true }, tokens: [], enabled: true })).toBe(true);
});

test('GM selected observer previews Hidden artwork without losing unselected GM access', () => {
  const gm = { isGM: true };
  const hidden = token('a', 'hidden');
  const observed = token('a', 'observed');
  expect(hiddenTileVisibleToUser(tile, { user: gm, controlled: [], enabled: true })).toBe(true);
  expect(hiddenTileVisibleToUser(tile, { user: gm, controlled: [hidden], enabled: true })).toBe(false);
  expect(hiddenTileVisibleToUser(tile, { user: gm, controlled: [observed], enabled: true })).toBe(true);

  const renderedTile = { ...tile, mesh: { visible: true, renderable: true } };
  expect(refreshHiddenTileVisual(renderedTile, { user: gm, controlled: [hidden], enabled: true })).toBe(true);
  expect(renderedTile.mesh).toMatchObject({ visible: false, renderable: false });
  expect(refreshHiddenTileVisual(renderedTile, { user: gm, controlled: [], enabled: true })).toBe(false);
  expect(renderedTile.mesh).toMatchObject({ visible: true, renderable: true });
});

test('ordinary and Foundry-hidden tiles keep native visibility', () => {
  expect(hiddenTileVisibleToUser({ ...tile, document: { ...tile.document, getFlag: () => false } }, { user: { isGM: false }, tokens: [] })).toBe(true);
  expect(hiddenTileVisibleToUser({ ...tile, document: { ...tile.document, hidden: true } }, { user: { isGM: false }, tokens: [token('a', 'observed')] })).toBe(false);
});

test('rendered artwork disappears then returns when the observer discovers the tile', () => {
  const renderedTile = { ...tile, mesh: { visible: true, renderable: true } };
  const user = { isGM: false };
  expect(refreshHiddenTileVisual(renderedTile, { user, tokens: [token('a', 'hidden')], enabled: true })).toBe(true);
  expect(renderedTile.mesh).toMatchObject({ visible: false, renderable: false });
  expect(refreshHiddenTileVisual(renderedTile, { user, tokens: [token('a', 'observed')], enabled: true })).toBe(false);
  expect(renderedTile.mesh).toMatchObject({ visible: true, renderable: true });
});

test('PIXI highlight follows discovered observer, not GM omniscience', () => {
  const player = { isGM: false };
  const gm = { isGM: true };
  const hidden = token('a', 'hidden');
  const observed = token('b', 'observed');
  expect(shouldHighlightHiddenTile(tile, { user: player, tokens: [hidden], enabled: true })).toBe(false);
  expect(shouldHighlightHiddenTile(tile, { user: player, tokens: [observed], enabled: true })).toBe(true);
  expect(shouldHighlightHiddenTile(tile, { user: gm, controlled: [hidden], enabled: true })).toBe(false);
  expect(shouldHighlightHiddenTile(tile, { user: gm, controlled: [observed], enabled: true })).toBe(true);
  expect(shouldHighlightHiddenTile(tile, { user: player, tokens: [observed], enabled: false })).toBe(false);
});

test('resaving a hidden tile preserves discoveries; unmarking clears observer states', async () => {
  const observed = { id: 'seen', getFlag: () => ({ 'tile-1': 'observed' }) };
  const unseen = { id: 'new', getFlag: () => ({}) };
  const scene = { tokens: [observed, unseen], updateEmbeddedDocuments: jest.fn().mockResolvedValue([]) };
  await syncHiddenTileTokenFlags(tile.document, true, { scene, isGM: true });
  expect(scene.updateEmbeddedDocuments).toHaveBeenCalledWith('Token', [
    { _id: 'new', 'flags.pf2e-visioner.tiles': { 'tile-1': 'hidden' } },
  ], { diff: false });
  scene.updateEmbeddedDocuments.mockClear();
  await syncHiddenTileTokenFlags(tile.document, false, { scene, isGM: true });
  expect(scene.updateEmbeddedDocuments).toHaveBeenCalledWith('Token', [
    { _id: 'seen', 'flags.pf2e-visioner.tiles': {} },
  ], { diff: false });
});
