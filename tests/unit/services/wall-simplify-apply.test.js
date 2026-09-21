import { jest } from '@jest/globals';
import {
  applyWallSimplification,
  getWallSimplifyBackup,
  undoWallSimplification,
  WALL_SIMPLIFY_BACKUP_FLAG,
} from '../../../scripts/services/Walls/wall-simplify-apply.js';

function mockScene(initialWalls) {
  let nextId = 100;
  const flags = {};
  const walls = new Map();
  const add = (source) => {
    const id = source._id ?? `n${nextId++}`;
    const doc = { id, ...source, _id: id, toObject: () => ({ ...source, _id: id }) };
    walls.set(id, doc);
    return doc;
  };
  initialWalls.forEach(add);
  return {
    get walls() {
      return walls.values();
    },
    createEmbeddedDocuments: jest.fn(async (_type, sources, options = {}) =>
      sources.map((source) => add(options.keepId ? source : { ...source, _id: undefined })),
    ),
    deleteEmbeddedDocuments: jest.fn(async (_type, ids) => ids.forEach((id) => walls.delete(id))),
    setFlag: jest.fn(async (_mod, key, value) => {
      flags[key] = value;
    }),
    unsetFlag: jest.fn(async (_mod, key) => {
      delete flags[key];
    }),
    getFlag: (_mod, key) => flags[key] ?? null,
    wallIds: () => [...walls.keys()].sort(),
  };
}

const base = { sight: 20, light: 20, sound: 20, move: 20, door: 0, ds: 0, dir: 0, flags: {} };
const chain = [
  { _id: 'a', c: [0, 0, 10, 1], ...base },
  { _id: 'b', c: [10, 1, 20, 0], ...base },
  { _id: 'c', c: [20, 0, 30, 1], ...base },
  { _id: 'd', c: [30, 1, 40, 0], ...base },
];
const door = { _id: 'door', c: [100, 100, 120, 100], ...base, door: 1 };

describe('wall simplification apply/undo', () => {
  test('apply replaces the chain, keeps the door and stores a backup on the scene', async () => {
    const scene = mockScene([...chain, door]);
    const { applied, plan } = await applyWallSimplification(scene, 2);
    expect(applied).toBe(true);
    expect(plan.after).toBe(2);
    expect(scene.wallIds()).toEqual(['door', 'n100']);
    expect(scene.deleteEmbeddedDocuments).toHaveBeenCalledWith('Wall', ['a', 'b', 'c', 'd']);
    const backup = getWallSimplifyBackup(scene);
    expect(backup.createdIds).toEqual(['n100']);
    expect(backup.deleted.map((w) => w._id)).toEqual(['a', 'b', 'c', 'd']);
    expect(scene.setFlag.mock.calls[0][1]).toBe(WALL_SIMPLIFY_BACKUP_FLAG);
  });

  test('apply is a no-op when nothing can be simplified', async () => {
    const scene = mockScene([door]);
    const { applied } = await applyWallSimplification(scene, 2);
    expect(applied).toBe(false);
    expect(scene.createEmbeddedDocuments).not.toHaveBeenCalled();
    expect(scene.setFlag).not.toHaveBeenCalled();
  });

  test('undo removes created walls, restores originals with their ids and clears the backup', async () => {
    const scene = mockScene([...chain, door]);
    await applyWallSimplification(scene, 2);
    expect(await undoWallSimplification(scene)).toBe(true);
    expect(scene.wallIds()).toEqual(['a', 'b', 'c', 'd', 'door']);
    expect(scene.createEmbeddedDocuments).toHaveBeenLastCalledWith(
      'Wall',
      expect.arrayContaining([expect.objectContaining({ _id: 'a' })]),
      { keepId: true },
    );
    expect(getWallSimplifyBackup(scene)).toBeNull();
  });

  test('undo without a backup does nothing', async () => {
    const scene = mockScene([...chain]);
    expect(await undoWallSimplification(scene)).toBe(false);
    expect(scene.deleteEmbeddedDocuments).not.toHaveBeenCalled();
  });
});
