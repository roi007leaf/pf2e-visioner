import { MODULE_ID } from '../../constants.js';
import { planWallSimplification } from './wall-simplifier.js';

export const WALL_SIMPLIFY_BACKUP_FLAG = 'wallSimplifyBackup';

function sceneWallDocs(scene) {
  return Array.from(scene?.walls ?? []);
}

export function planSceneWallSimplification(scene, tolerance) {
  return planWallSimplification(sceneWallDocs(scene), { tolerance });
}

export function getWallSimplifyBackup(scene) {
  return scene?.getFlag?.(MODULE_ID, WALL_SIMPLIFY_BACKUP_FLAG) ?? null;
}

export async function applyWallSimplification(scene, tolerance) {
  const plan = planSceneWallSimplification(scene, tolerance);
  if (!plan.deleteIds.length) return { plan, applied: false };
  const deletedSources = sceneWallDocs(scene)
    .filter((doc) => plan.deleteIds.includes(doc.id))
    .map((doc) => doc.toObject());
  const created = await scene.createEmbeddedDocuments('Wall', plan.creates);
  await scene.deleteEmbeddedDocuments('Wall', plan.deleteIds);
  await scene.setFlag(MODULE_ID, WALL_SIMPLIFY_BACKUP_FLAG, {
    tolerance,
    createdIds: created.map((doc) => doc.id),
    deleted: deletedSources,
    at: Date.now(),
  });
  return { plan, applied: true };
}

export async function undoWallSimplification(scene) {
  const backup = getWallSimplifyBackup(scene);
  if (!backup) return false;
  const existing = new Set(sceneWallDocs(scene).map((doc) => doc.id));
  const createdIds = (backup.createdIds ?? []).filter((id) => existing.has(id));
  if (createdIds.length) await scene.deleteEmbeddedDocuments('Wall', createdIds);
  const restore = (backup.deleted ?? []).filter((source) => !existing.has(source._id));
  if (restore.length) await scene.createEmbeddedDocuments('Wall', restore, { keepId: true });
  await scene.unsetFlag(MODULE_ID, WALL_SIMPLIFY_BACKUP_FLAG);
  return true;
}
