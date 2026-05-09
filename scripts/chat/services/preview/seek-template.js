// Facade around seek template helpers to keep UI layer clean

import { MODULE_ID } from '../../../constants.js';

const SEEK_TEMPLATE_PLACEMENT_LIMIT_SETTING = 'seekTemplateMaxPlacementDistance';

function getRegionDocumentClass() {
  return (
    globalThis.CONFIG?.Region?.documentClass ||
    globalThis.foundry?.documents?.RegionDocument ||
    globalThis.getDocumentClass?.('Region') ||
    null
  );
}

function getBaseRegionClass() {
  return globalThis.foundry?.documents?.BaseRegion || null;
}

function collectionToArray(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection.contents)) return collection.contents;
  if (typeof collection.values === 'function') return Array.from(collection.values());
  try {
    return Array.from(collection);
  } catch (_) {
    return [];
  }
}

function getSceneRegionCollection() {
  return collectionToArray(canvas?.scene?.regions);
}

function getSceneTemplateCollection() {
  return collectionToArray(canvas?.scene?.templates);
}

function getCanvasTemplatePlaceables() {
  return collectionToArray(canvas?.templates?.placeables);
}

function getTemplateFlags(template, scope = MODULE_ID) {
  return template?.flags?.[scope] || template?.document?.flags?.[scope] || null;
}

function isSeekTemplateDocument(template) {
  const flags = getTemplateFlags(template);
  return !!(flags?.seekPreviewManual || flags?.seekTemplate);
}

function getTemplateDocumentName(template) {
  const explicitName =
    template?.documentName ||
    template?.document?.documentName ||
    template?.constructor?.documentName ||
    template?.document?.constructor?.documentName;
  if (explicitName) return explicitName;
  if (Array.isArray(template?.shapes) || template?.shapes?.size !== undefined) return 'Region';
  return 'MeasuredTemplate';
}

function getTemplateId(template) {
  return template?.document?.id || template?.id;
}

function getSeekTemplateDocuments({ actorId = null, messageId = null, userId = null } = {}) {
  const seen = new Set();
  return [
    ...getSceneRegionCollection(),
    ...getSceneTemplateCollection(),
    ...getCanvasTemplatePlaceables(),
  ].filter((template) => {
    const flags = getTemplateFlags(template);
    const id = getTemplateId(template);
    const key = `${getTemplateDocumentName(template)}:${id || Math.random()}`;
    if (id && seen.has(key)) return false;
    if (id) seen.add(key);
    if (!isSeekTemplateDocument(template)) return false;
    if (actorId && flags?.actorTokenId !== actorId) return false;
    if (messageId && flags?.messageId !== messageId) return false;
    if (userId && flags?.userId !== userId) return false;
    return true;
  });
}

export function findSeekTemplateDocument(filters = {}) {
  return getSeekTemplateDocuments(filters)[0] || null;
}

export function hasSeekTemplateDocument(filters = {}) {
  return !!findSeekTemplateDocument(filters);
}

function buildRegionDataFromTemplate(template) {
  const BaseRegion = getBaseRegionClass();
  const grid = canvas?.scene?.grid || canvas?.grid?.grid;
  const users = (game?.users?.contents || []).map((user) => ({ _id: user.id, name: user.name }));
  const regionData = BaseRegion._migrateMeasuredTemplateData(template, {
    grid,
    gridTemplates: false,
    coneTemplateType: 'round',
    users,
  });
  regionData.levels = Array.isArray(template.levels) ? template.levels : [];
  regionData.flags = foundry.utils.mergeObject(regionData.flags || {}, {
    core: { MeasuredTemplate: true },
    'pf2e-visioner': {
      ...(template.flags?.['pf2e-visioner'] || {}),
      userId: template.flags?.['pf2e-visioner']?.userId || game.userId,
    },
    'pf2e-toolbelt': template.flags?.['pf2e-toolbelt'] || {},
  });
  return regionData;
}

async function createTemplateRegions(data) {
  const cls = getRegionDocumentClass();
  const migrated = data.map((item) => buildRegionDataFromTemplate(item));
  const created = cls?.createDocuments
    ? await cls.createDocuments(migrated, { parent: canvas.scene })
    : await canvas.scene.createEmbeddedDocuments('Region', migrated);

  for (let i = 0; i < created.length; i += 1) {
    const region = created[i];
    const levels = migrated[i]?.levels || [];
    if (levels.length > 0 && (!region?.levels || region.levels.size === 0)) {
      await region.update({ levels });
    }
  }

  return created;
}

function normalizeTemplateType(type) {
  if (type === 'line') return 'ray';
  if (type === 'rectangle') return 'rect';
  return type || 'circle';
}

function normalizeTemplateLevels(levels) {
  return collectionToArray(levels).filter((level) => level !== undefined && level !== null);
}

export function getTemplateStateFromDocument(template) {
  const document = template?.document || template;
  const shapes = collectionToArray(template?.shapes || document?.shapes);
  const shape = shapes[0];
  const grid = canvas?.scene?.grid || canvas?.grid?.grid;
  const distancePixels = (grid?.size || 100) / (grid?.distance || 5);
  let templateType = 'circle';
  let center = { x: 0, y: 0 };
  let radiusFeet = 0;

  if (shape) {
    switch (shape.type) {
      case 'cone':
        templateType = 'cone';
        center = { x: shape.x, y: shape.y };
        radiusFeet = (shape.radius || 0) / distancePixels;
        break;
      case 'line':
        templateType = 'ray';
        center = { x: shape.x, y: shape.y };
        radiusFeet = (shape.length || 0) / distancePixels;
        break;
      case 'circle':
      default:
        templateType = normalizeTemplateType(shape.type);
        center = { x: shape?.x || 0, y: shape?.y || 0 };
        radiusFeet = ((shape?.radius ?? shape?.length) || 0) / distancePixels;
        break;
    }
  } else {
    templateType = normalizeTemplateType(document?.t ?? template?.t);
    center = {
      x: Number(document?.x ?? template?.x ?? 0),
      y: Number(document?.y ?? template?.y ?? 0),
    };
    radiusFeet = Number(document?.distance ?? template?.distance ?? 0);
  }

  return {
    center,
    radiusFeet,
    templateType,
    levels: normalizeTemplateLevels(document?.levels ?? template?.levels),
  };
}

function getTemplateStateFromRegion(region) {
  return getTemplateStateFromDocument(region);
}

function getGridDistanceScale() {
  const grid = canvas?.scene?.grid || canvas?.grid?.grid || canvas?.grid || {};
  const size = Number(grid.size ?? 100);
  const distance = Number(grid.distance ?? 5);
  return {
    size: Number.isFinite(size) && size > 0 ? size : 100,
    distance: Number.isFinite(distance) && distance > 0 ? distance : 5,
  };
}

function getTokenCenter(token) {
  const directCenter = token?.center || token?.object?.center;
  if (Number.isFinite(directCenter?.x) && Number.isFinite(directCenter?.y)) {
    return { x: Number(directCenter.x), y: Number(directCenter.y) };
  }

  const document = token?.document || token;
  const x = Number(document?.x);
  const y = Number(document?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  const { size } = getGridDistanceScale();
  const width = Number(document?.width ?? 1);
  const height = Number(document?.height ?? 1);
  return {
    x: x + ((Number.isFinite(width) && width > 0 ? width : 1) * size) / 2,
    y: y + ((Number.isFinite(height) && height > 0 ? height : 1) * size) / 2,
  };
}

function getSeekTemplateMaxPlacementDistance() {
  const value = Number(
    game?.settings?.get?.(MODULE_ID, SEEK_TEMPLATE_PLACEMENT_LIMIT_SETTING) ?? 0,
  );
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function getDistanceFeetBetweenPoints(from, to) {
  const { size, distance } = getGridDistanceScale();
  const pixelDistance = Math.hypot(Number(to.x) - from.x, Number(to.y) - from.y);
  return (pixelDistance / size) * distance;
}

function getAllowedTemplateCenterDistanceFeet() {
  return getSeekTemplateMaxPlacementDistance();
}

export function validateSeekTemplatePlacement(actionData, center) {
  const maxDistanceFeet = getSeekTemplateMaxPlacementDistance();
  const centerMaxDistanceFeet = getAllowedTemplateCenterDistanceFeet();
  if (maxDistanceFeet <= 0) {
    return { allowed: true, distanceFeet: 0, maxDistanceFeet, centerMaxDistanceFeet };
  }

  if (!Number.isFinite(center?.x) || !Number.isFinite(center?.y)) {
    return { allowed: true, distanceFeet: 0, maxDistanceFeet, centerMaxDistanceFeet };
  }

  const origin = getTokenCenter(actionData?.actor);
  if (!origin) {
    return { allowed: true, distanceFeet: 0, maxDistanceFeet, centerMaxDistanceFeet };
  }

  const distanceFeet = getDistanceFeetBetweenPoints(origin, center);

  return {
    allowed: distanceFeet <= centerMaxDistanceFeet + 0.000001,
    distanceFeet,
    maxDistanceFeet,
    centerMaxDistanceFeet,
  };
}

export function clampSeekTemplatePlacement(actionData, center) {
  const maxDistanceFeet = getSeekTemplateMaxPlacementDistance();
  const centerMaxDistanceFeet = getAllowedTemplateCenterDistanceFeet();
  if (maxDistanceFeet <= 0 || !Number.isFinite(center?.x) || !Number.isFinite(center?.y)) {
    return {
      center,
      clamped: false,
      distanceFeet: 0,
      pointerDistanceFeet: 0,
      maxDistanceFeet,
      centerMaxDistanceFeet,
    };
  }

  const origin = getTokenCenter(actionData?.actor);
  if (!origin) {
    return {
      center,
      clamped: false,
      distanceFeet: 0,
      pointerDistanceFeet: 0,
      maxDistanceFeet,
      centerMaxDistanceFeet,
    };
  }

  const pointerDistanceFeet = getDistanceFeetBetweenPoints(origin, center);
  if (pointerDistanceFeet <= centerMaxDistanceFeet + 0.000001) {
    return {
      center: { x: Number(center.x), y: Number(center.y) },
      clamped: false,
      distanceFeet: pointerDistanceFeet,
      pointerDistanceFeet,
      maxDistanceFeet,
      centerMaxDistanceFeet,
    };
  }

  const { size, distance } = getGridDistanceScale();
  const maxDistancePixels = (centerMaxDistanceFeet / distance) * size;
  const dx = Number(center.x) - origin.x;
  const dy = Number(center.y) - origin.y;
  const pixelDistance = Math.hypot(dx, dy);
  if (pixelDistance <= 0) {
    return {
      center: { x: origin.x, y: origin.y },
      clamped: false,
      distanceFeet: 0,
      pointerDistanceFeet,
      maxDistanceFeet,
      centerMaxDistanceFeet,
    };
  }

  const scale = maxDistancePixels / pixelDistance;
  return {
    center: {
      x: origin.x + dx * scale,
      y: origin.y + dy * scale,
    },
    clamped: true,
    distanceFeet: centerMaxDistanceFeet,
    pointerDistanceFeet,
    maxDistanceFeet,
    centerMaxDistanceFeet,
  };
}

export function normalizeSeekTemplatePlacement(actionData, templateState) {
  const placement = clampSeekTemplatePlacement(actionData, templateState?.center);
  if (!placement?.clamped) {
    return { templateState, clamped: false, placement };
  }

  return {
    templateState: {
      ...templateState,
      center: placement.center,
    },
    clamped: true,
    placement,
  };
}

async function warnSeekTemplateOutOfRange(validation) {
  const { notify } = await import('../infra/notifications.js');
  const distance = Number(validation.distanceFeet.toFixed(1));
  notify.warn(
    game.i18n.format('PF2E_VISIONER.SEEK_AUTOMATION.TEMPLATE_OUT_OF_RANGE', {
      distance,
      max: validation.maxDistanceFeet,
    }),
  );
}

async function validateOrWarnSeekTemplatePlacement(actionData, center) {
  const validation = validateSeekTemplatePlacement(actionData, center);
  if (!validation.allowed) {
    await warnSeekTemplateOutOfRange(validation);
    return false;
  }
  return true;
}

function getEmbeddedDocumentTypeForTemplate(template) {
  return getTemplateDocumentName(template) === 'Region' ? 'Region' : 'MeasuredTemplate';
}

async function deleteSeekTemplateDocument(template) {
  const id = getTemplateId(template);
  if (!id || !canvas?.scene?.deleteEmbeddedDocuments) return;
  try {
    await canvas.scene.deleteEmbeddedDocuments(getEmbeddedDocumentTypeForTemplate(template), [id]);
  } catch (_) {}
}

async function deleteSeekTemplateDocuments(templates) {
  if (!canvas?.scene?.deleteEmbeddedDocuments) return;
  const grouped = new Map();
  for (const template of templates) {
    const id = getTemplateId(template);
    if (!id) continue;
    const type = getEmbeddedDocumentTypeForTemplate(template);
    if (!grouped.has(type)) grouped.set(type, []);
    grouped.get(type).push(id);
  }
  for (const [type, ids] of grouped.entries()) {
    try {
      await canvas.scene.deleteEmbeddedDocuments(type, ids);
    } catch (_) {}
  }
}

async function deleteRejectedSeekTemplateDocument(template) {
  if (!template || !canvas?.scene) return;
  try {
    await deleteSeekTemplateDocument(template);
  } catch (_) {}
}

async function updateSeekTemplateDocumentCenter(template, center) {
  const shapes = Array.isArray(template?.shapes) ? template.shapes : [];
  const shape = shapes[0];
  if (!Number.isFinite(center?.x) || !Number.isFinite(center?.y)) return;

  try {
    if (shape) {
      await template.update?.({
        shapes: [{ ...shape, x: center.x, y: center.y }, ...shapes.slice(1)],
      });
    } else {
      await (template?.document || template)?.update?.({ x: center.x, y: center.y });
    }
  } catch (_) {}
}

function createPlacementLimitRangeIndicator(actionData) {
  const maxDistanceFeet = getSeekTemplateMaxPlacementDistance();
  const origin = getTokenCenter(actionData?.actor);
  if (maxDistanceFeet <= 0 || !origin || !globalThis.PIXI?.Graphics) return null;

  const { size, distance } = getGridDistanceScale();
  const radiusPixels = (maxDistanceFeet / distance) * size;
  const graphics = new PIXI.Graphics();
  try {
    graphics.lineStyle(2, 0x2196f3, 0.8);
    graphics.beginFill(0x2196f3, 0.05);
    graphics.drawCircle(origin.x, origin.y, radiusPixels);
    graphics.endFill();
    graphics.zIndex = 9999;
    const parent = canvas?.controls || canvas?.stage;
    parent?.addChild?.(graphics);
    return graphics;
  } catch (_) {
    graphics.destroy?.({ children: true });
    return null;
  }
}

async function launchSeekTemplatePreview(
  layer,
  tplData,
  { actionData = null, clampPlacement = null, validatePlacement = null } = {},
) {
  const shouldUseManualPreview = !!clampPlacement && typeof layer?._createPreview === 'function';
  if (!shouldUseManualPreview && typeof layer?.createPreview === 'function') {
    layer.createPreview(tplData);
    return true;
  }
  if (!shouldUseManualPreview && typeof MeasuredTemplate?.createPreview === 'function') {
    MeasuredTemplate.createPreview(tplData);
    return true;
  }
  if (typeof layer?._createPreview !== 'function') {
    return false;
  }

  const preview = await layer._createPreview(
    {
      ...tplData,
      x: tplData.x ?? 0,
      y: tplData.y ?? 0,
    },
    { renderSheet: false },
  );
  if (!preview) return false;
  const rangeIndicator = createPlacementLimitRangeIndicator(actionData);

  const getSnapped = (event) => {
    const local = event.data.getLocalPosition(canvas.stage);
    return (
      canvas.grid?.getSnappedPosition?.(local.x, local.y, 2) || {
        x: local.x,
        y: local.y,
      }
    );
  };

  const destroyPreview = () => {
    try {
      canvas.stage.off('pointermove', moveHandler);
      canvas.stage.off('pointerdown', downHandler);
      rangeIndicator?.destroy?.({ children: true });
      preview?.destroy?.({ children: true });
    } catch (_) {}
  };

  const moveHandler = (event) => {
    const pointer = getSnapped(event);
    const snapped = clampPlacement?.(pointer)?.center || pointer;
    preview.document.updateSource({ x: snapped.x, y: snapped.y });
    preview.renderFlags?.set?.({ refreshPosition: true, refreshShape: true });
  };

  const downHandler = async (event) => {
    const pointer = getSnapped(event);
    const clampedPlacement = clampPlacement?.(pointer);
    const snapped = clampedPlacement?.center || pointer;
    if (!clampedPlacement?.clamped && validatePlacement && !(await validatePlacement(snapped)))
      return;
    destroyPreview();
    await createTemplateRegions([{ ...tplData, x: snapped.x, y: snapped.y }]);
  };

  canvas.stage.on('pointermove', moveHandler);
  canvas.stage.on('pointerdown', downHandler);
  return true;
}

async function persistSeekTemplateFlag(actionData, data) {
  const msg = game.messages.get(actionData.messageId);
  if (!msg) return;

  await msg.update({
    ['flags.pf2e-visioner.seekTemplate']: data,
  });
  try {
    await msg.render(true);
  } catch (_) {}
}

async function clearSeekTemplateFlag(messageId) {
  const msg = game.messages.get(messageId);
  if (!msg) return;

  await msg.update({
    ['flags.pf2e-visioner.-=seekTemplate']: null,
  });
  try {
    await msg.render(true);
  } catch (_) {}
}

async function consumeSeekTemplateAfterDialog(actionData, template) {
  try {
    await deleteSeekTemplateDocument(template);
  } catch (_) {}

  try {
    await clearSeekTemplateFlag(actionData.messageId);
  } catch (_) {}

  try {
    updateSeekTemplateButton(actionData, false);
  } catch (_) {}
}

function isOwnSeekTemplateDocument(template) {
  const flags = getTemplateFlags(template);
  if (!isSeekTemplateDocument(template)) return false;
  return flags?.userId === game.userId;
}

function registerSeekTemplateCreateHooks(handler) {
  let createRegionHookId = null;
  let createMeasuredTemplateHookId = null;
  const release = () => {
    try {
      if (createRegionHookId) Hooks.off('createRegion', createRegionHookId);
      if (createMeasuredTemplateHookId) {
        Hooks.off('createMeasuredTemplate', createMeasuredTemplateHookId);
      }
    } catch (_) {}
  };
  const wrapped = async (doc) => {
    if (!isOwnSeekTemplateDocument(doc)) return;
    await handler(doc, release);
  };

  createRegionHookId = Hooks.on('createRegion', wrapped);
  createMeasuredTemplateHookId = Hooks.on('createMeasuredTemplate', wrapped);
  return release;
}

export async function setupSeekTemplate(actionData, skipDialog = false) {
  const { notify } = await import('../infra/notifications.js');

  let config = null;
  if (!skipDialog && !game.settings.get(MODULE_ID, 'seekTemplateSkipDialog')) {
    const { SeekTemplateConfigDialog } = await import('../../dialogs/SeekTemplateConfigDialog.js');
    config = await SeekTemplateConfigDialog.choose();
    if (!config) {
      return;
    }
  }

  const templateType = config?.templateType || 'circle';
  const radius = config?.radius || 15;
  const levels = Array.isArray(config?.levels) ? config.levels.filter(Boolean) : [];
  const distance = radius;

  notify.info(game.i18n.localize('PF2E_VISIONER.SEEK_AUTOMATION.SETUP_TEMPLATE_TOOLTIP'));

  await cleanupOrphanedSeekTemplates(actionData.actor?.id, game.userId);
  const validatePlacement = (center) => validateOrWarnSeekTemplatePlacement(actionData, center);
  const clampPlacement =
    getSeekTemplateMaxPlacementDistance() > 0
      ? (center) => clampSeekTemplatePlacement(actionData, center)
      : null;
  if (game.user.isGM) {
    const tplData = {
      t: templateType,
      author: game.userId,
      distance,
      fillColor: game.user?.color || '#ff9800',
      borderColor: game.user?.color || '#ff9800',
      texture: null,
      flags: {
        'pf2e-visioner': {
          seekPreviewManual: true,
          messageId: actionData.messageId,
          actorTokenId: actionData.actor.id,
          userId: game.userId,
        },
        'pf2e-toolbelt': { betterTemplate: { skip: true } },
      },
    };
    if (levels.length > 0) tplData.levels = levels;

    if (templateType === 'cone') {
      tplData.angle = 90;
      tplData.direction = 0;
    } else if (templateType === 'ray') {
      tplData.width = 5;
    }
    let dispatched = false;
    const layer = canvas?.templates;
    const launchedPreview = await launchSeekTemplatePreview(layer, tplData, {
      actionData,
      clampPlacement,
      validatePlacement,
    });
    await new Promise((resolve) => {
      registerSeekTemplateCreateHooks(async (doc, releaseCreateHooks) => {
        try {
          releaseCreateHooks();
          let templateState = getTemplateStateFromDocument(doc);
          const normalized = normalizeSeekTemplatePlacement(actionData, templateState);
          templateState = normalized.templateState;
          if (normalized.clamped) {
            await updateSeekTemplateDocumentCenter(doc, templateState.center);
          }
          if (!(await validatePlacement(templateState.center))) {
            await deleteRejectedSeekTemplateDocument(doc);
            return;
          }
          actionData.seekTemplateCenter = templateState.center;
          actionData.seekTemplateRadiusFeet = Number(templateState.radiusFeet) || distance;
          actionData.seekTemplateType = templateState.templateType || templateType;
          actionData.seekTemplateLevels = templateState.levels;
          let dialogOpened = false;
          // Determine presence of potential targets within template by proximity
          const tokens = canvas?.tokens?.placeables || [];
          const targets = tokens.filter((t) => t && t !== actionData.actor && t.actor);
          if (!dispatched && targets.length > 0) {
            dispatched = true;
            const { previewActionResults } = await import('../preview/preview-service.js');
            await previewActionResults({ ...actionData, actionType: 'seek' });
            const { SeekPreviewDialog } = await import('../../dialogs/SeekPreviewDialog.js');
            dialogOpened = !!SeekPreviewDialog.currentSeekDialog;
            if (dialogOpened) {
              await consumeSeekTemplateAfterDialog(actionData, doc);
            }
          }
          if (!dialogOpened) {
            await persistSeekTemplateFlag(actionData, {
              center: actionData.seekTemplateCenter,
              radiusFeet: actionData.seekTemplateRadiusFeet,
              templateType: actionData.seekTemplateType,
              levels: actionData.seekTemplateLevels,
              actorTokenId: actionData.actor.id,
              rollTotal: actionData.roll?.total ?? null,
              dieResult:
                actionData.roll?.dice?.[0]?.total ?? actionData.roll?.terms?.[0]?.total ?? null,
              fromUserId: game.userId,
              hasTargets: targets.length > 0,
            });
            updateSeekTemplateButton(actionData, true);
          }
        } finally {
          restoreTokenControlsAfterSeekTemplate();
          resolve();
        }
      });
      if (!launchedPreview) {
        const pointerHandler = async (event) => {
          let accepted = false;
          try {
            const local = event.data.getLocalPosition(canvas.stage);
            const snapped = canvas.grid?.getSnappedPosition?.(local.x, local.y, 2) || {
              x: local.x,
              y: local.y,
            };
            const clampedPlacement = clampPlacement?.(snapped);
            const center = clampedPlacement?.center || snapped;
            if (!clampedPlacement?.clamped && !(await validatePlacement(center))) return;
            accepted = true;
            canvas.stage.off('pointerdown', pointerHandler);
            const [created] = await createTemplateRegions([
              { ...tplData, x: center.x, y: center.y },
            ]);
            if (created) {
              const templateState = getTemplateStateFromRegion(created);
              actionData.seekTemplateCenter = templateState.center;
              actionData.seekTemplateRadiusFeet = Number(templateState.radiusFeet) || distance;
              actionData.seekTemplateType = templateState.templateType || templateType;
              actionData.seekTemplateLevels = templateState.levels;
              let dialogOpened = false;
              const tokens = canvas?.tokens?.placeables || [];
              const targets = tokens.filter((t) => t && t !== actionData.actor && t.actor);
              if (targets.length > 0) {
                const { previewActionResults } = await import('../preview/preview-service.js');
                await previewActionResults({ ...actionData, actionType: 'seek' });
                const { SeekPreviewDialog } = await import('../../dialogs/SeekPreviewDialog.js');
                dialogOpened = !!SeekPreviewDialog.currentSeekDialog;
                if (dialogOpened) {
                  await consumeSeekTemplateAfterDialog(actionData, created);
                }
              }
              if (!dialogOpened) {
                await persistSeekTemplateFlag(actionData, {
                  center: actionData.seekTemplateCenter,
                  radiusFeet: actionData.seekTemplateRadiusFeet,
                  templateType: actionData.seekTemplateType,
                  levels: actionData.seekTemplateLevels,
                  actorTokenId: actionData.actor.id,
                  rollTotal: actionData.roll?.total ?? null,
                  dieResult:
                    actionData.roll?.dice?.[0]?.total ?? actionData.roll?.terms?.[0]?.total ?? null,
                  fromUserId: game.userId,
                  hasTargets: targets.length > 0,
                });
                updateSeekTemplateButton(actionData, true);
              }
            }
          } finally {
            if (accepted) {
              restoreTokenControlsAfterSeekTemplate();
              resolve();
            }
          }
        };
        canvas.stage.on('pointerdown', pointerHandler);
      }
    });
    return;
  }
  const tplData = {
    t: templateType,
    author: game.userId,
    distance,
    fillColor: game.user?.color || '#ff9800',
    borderColor: game.user?.color || '#ff9800',
    texture: null,
    flags: {
      'pf2e-visioner': {
        seekPreviewManual: true,
        messageId: actionData.messageId,
        actorTokenId: actionData.actor.id,
        userId: game.userId,
      },
      'pf2e-toolbelt': { betterTemplate: { skip: true } },
    },
  };
  if (levels.length > 0) tplData.levels = levels;

  if (templateType === 'cone') {
    tplData.angle = 90;
    tplData.direction = 0;
  } else if (templateType === 'ray') {
    tplData.width = 5;
  }
  let usedPreview = false;
  const layer = canvas?.templates;
  const launchedPreview = await launchSeekTemplatePreview(layer, tplData, {
    actionData,
    clampPlacement,
    validatePlacement,
  });
  await new Promise((resolve) => {
    registerSeekTemplateCreateHooks(async (doc, releaseCreateHooks) => {
      try {
        releaseCreateHooks();
        usedPreview = true;
        let templateState = getTemplateStateFromDocument(doc);
        const normalized = normalizeSeekTemplatePlacement(actionData, templateState);
        templateState = normalized.templateState;
        if (normalized.clamped) {
          await updateSeekTemplateDocumentCenter(doc, templateState.center);
        }
        const center = templateState.center;
        if (!(await validatePlacement(center))) {
          await deleteRejectedSeekTemplateDocument(doc);
          return;
        }
        const radius = Number(templateState.radiusFeet) || distance;
        actionData.seekTemplateCenter = center;
        actionData.seekTemplateRadiusFeet = radius;
        actionData.seekTemplateType = templateState.templateType || templateType;
        actionData.seekTemplateLevels = templateState.levels;
        updateSeekTemplateButton(actionData, true);
        const { requestGMOpenSeekWithTemplate } = await import('../../../services/socket.js');
        try {
          // Best-effort: annotate the chat message flags immediately so GM panel can switch without relying solely on sockets
          const msg = game.messages.get(actionData.messageId);
          if (msg) {
            const all = canvas?.tokens?.placeables || [];
            const targets = all.filter((t) => t && t !== actionData.actor && t.actor);
            const { isTokenWithinTemplate } = await import('../infra/shared-utils.js');
            const hasTargets = targets.some((t) => isTokenWithinTemplate(center, radius, t));
            await persistSeekTemplateFlag(actionData, {
              center,
              radiusFeet: radius,
              templateType: actionData.seekTemplateType,
              levels: actionData.seekTemplateLevels,
              actorTokenId: actionData.actor.id,
              rollTotal: actionData.roll?.total ?? null,
              dieResult:
                actionData.roll?.dice?.[0]?.total ?? actionData.roll?.terms?.[0]?.total ?? null,
              fromUserId: game.userId,
              hasTargets,
            });
          }
        } catch (_) {}
        const roll = actionData.roll || game.messages.get(actionData.messageId)?.rolls?.[0] || null;
        const rollTotal = roll?.total ?? null;
        const dieResult = roll?.dice?.[0]?.total ?? roll?.terms?.[0]?.total ?? null;
        requestGMOpenSeekWithTemplate(
          actionData.actor.id,
          center,
          radius,
          actionData.messageId,
          rollTotal,
          dieResult,
          actionData.seekTemplateType,
          actionData.seekTemplateLevels,
        );
      } finally {
        restoreTokenControlsAfterSeekTemplate();
        resolve();
      }
    });
    if (!launchedPreview) {
      restoreTokenControlsAfterSeekTemplate();
      resolve();
    }
  });
  if (!usedPreview) {
    await new Promise((resolve) => {
      const pointerHandler = async (event) => {
        let accepted = false;
        try {
          const local = event.data.getLocalPosition(canvas.stage);
          const snapped = canvas.grid?.getSnappedPosition?.(local.x, local.y, 2) || {
            x: local.x,
            y: local.y,
          };
          const clampedPlacement = clampPlacement?.(snapped);
          const center = clampedPlacement?.center || snapped;
          if (!clampedPlacement?.clamped && !(await validatePlacement(center))) return;
          accepted = true;
          canvas.stage.off('pointerdown', pointerHandler);
          actionData.seekTemplateCenter = { x: center.x, y: center.y };
          actionData.seekTemplateRadiusFeet = distance;
          actionData.seekTemplateType = templateType;
          actionData.seekTemplateLevels = levels;
          const { requestGMOpenSeekWithTemplate } = await import('../../../services/socket.js');
          try {
            // Best-effort: annotate chat message flags immediately
            const msg = game.messages.get(actionData.messageId);
            if (msg) {
              const all = canvas?.tokens?.placeables || [];
              const targets = all.filter((t) => t && t !== actionData.actor && t.actor);
              const { isTokenWithinTemplate } = await import('../infra/shared-utils.js');
              const hasTargets = targets.some((t) =>
                isTokenWithinTemplate(actionData.seekTemplateCenter, distance, t),
              );
              await persistSeekTemplateFlag(actionData, {
                center: actionData.seekTemplateCenter,
                radiusFeet: distance,
                templateType,
                levels,
                actorTokenId: actionData.actor.id,
                rollTotal: actionData.roll?.total ?? null,
                dieResult:
                  actionData.roll?.dice?.[0]?.total ?? actionData.roll?.terms?.[0]?.total ?? null,
                fromUserId: game.userId,
                hasTargets,
              });
            }
          } catch (_) {}
          const roll =
            actionData.roll || game.messages.get(actionData.messageId)?.rolls?.[0] || null;
          const rollTotal = roll?.total ?? null;
          const dieResult = roll?.dice?.[0]?.total ?? roll?.terms?.[0]?.total ?? null;
          requestGMOpenSeekWithTemplate(
            actionData.actor.id,
            actionData.seekTemplateCenter,
            actionData.seekTemplateRadiusFeet,
            actionData.messageId,
            rollTotal,
            dieResult,
            templateType,
            levels,
          );
          const tokens = canvas?.tokens?.placeables || [];
          const targets = tokens.filter((t) => t && t !== actionData.actor && t.actor);
          if (targets.length === 0) {
            const { notify } = await import('../infra/notifications.js');
            notify.info('No valid targets within template');
          }
        } finally {
          if (accepted) {
            restoreTokenControlsAfterSeekTemplate();
            resolve();
          }
        }
      };
      canvas.stage.on('pointerdown', pointerHandler);
    });
  }
}

export function restoreTokenControlsAfterSeekTemplate() {
  try {
    canvas?.tokens?.activate?.();
  } catch (_) {}
}

export async function removeSeekTemplate(actionData) {
  if (!canvas?.scene) return;
  try {
    // First, clean up any orphaned seek templates for this actor/user
    await cleanupOrphanedSeekTemplates(actionData.actor?.id, game.userId);

    // First, try to remove templates by exact message ID match (most specific)
    let toRemove = getSeekTemplateDocuments({
      messageId: actionData.messageId,
      actorId: actionData.actor?.id,
      userId: game.userId,
    });

    // If no exact matches found, try to remove by actor ID (for reroll scenarios)
    if (toRemove.length === 0) {
      toRemove = getSeekTemplateDocuments({
        actorId: actionData.actor?.id,
        userId: game.userId,
      });
    }

    // If still no matches, try to remove any seek templates by the current user (fallback)
    if (toRemove.length === 0) {
      toRemove = getSeekTemplateDocuments({ userId: game.userId });
    }

    if (toRemove.length) {
      await deleteSeekTemplateDocuments(toRemove);
    }

    // Clear the action data
    delete actionData.seekTemplateCenter;
    delete actionData.seekTemplateRadiusFeet;
    delete actionData.seekTemplateLevels;

    try {
      await clearSeekTemplateFlag(actionData.messageId);
    } catch (_) {}

    const { notify } = await import('../infra/notifications.js');
    notify.info(game.i18n.localize('PF2E_VISIONER.SEEK_AUTOMATION.REMOVE_TEMPLATE'));

    // Button state update is now handled in the event binder after UI re-injection

    // Force a small delay to ensure UI updates are processed
    await new Promise((resolve) => setTimeout(resolve, 50));
  } catch (error) {
    const { log } = await import('../infra/notifications.js');
    log.error('Failed to remove Seek template:', error);
  }
}

/**
 * Clean up any orphaned seek templates for a specific actor/user combination
 * This helps with reroll scenarios where old templates might still exist
 */
async function cleanupOrphanedSeekTemplates(actorId, userId) {
  if (!canvas?.scene || !actorId || !userId) return;

  try {
    const orphanedTemplates = getSeekTemplateDocuments({ actorId, userId }).filter((t) => {
      const flags = getTemplateFlags(t);
      const messageExists = game.messages.has(flags?.messageId);
      return !messageExists;
    });

    if (orphanedTemplates.length > 0) {
      await deleteSeekTemplateDocuments(orphanedTemplates);
    }
  } catch (error) {
    console.warn('Failed to cleanup orphaned seek templates:', error);
  }
}

export function updateSeekTemplateButton(actionData, hasTemplate) {
  try {
    const panel = $(`.pf2e-visioner-automation-panel[data-message-id="${actionData.messageId}"]`);
    if (!panel?.length) {
      console.warn('No automation panel found for message:', actionData.messageId);
      return;
    }
    const btn = panel.find('button.setup-template');
    if (!btn?.length) {
      console.warn('No setup template button found in panel');
      return;
    }

    if (hasTemplate) {
      btn.attr('data-action', 'remove-seek-template');
      btn.attr('title', game.i18n.localize('PF2E_VISIONER.SEEK_AUTOMATION.SETUP_TEMPLATE_TOOLTIP'));
      btn.html(
        `<i class="fas fa-bullseye"></i> ${game.i18n.localize(
          'PF2E_VISIONER.SEEK_AUTOMATION.REMOVE_TEMPLATE',
        )}`,
      );
    } else {
      btn.attr('data-action', 'setup-seek-template');
      btn.attr('title', game.i18n.localize('PF2E_VISIONER.SEEK_AUTOMATION.SETUP_TEMPLATE_TOOLTIP'));
      btn.html(
        `<i class="fas fa-bullseye"></i> ${game.i18n.localize(
          'PF2E_VISIONER.SEEK_AUTOMATION.SETUP_TEMPLATE',
        )}`,
      );
    }
  } catch (error) {
    console.error('Error updating seek template button:', error);
  }
}
