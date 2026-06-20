import '../../setup.js';

import {
  ambientLightCreated,
  ambientLightDeleted,
  ambientLightUpdated,
  lightingRefresh,
  regionSurfaceUpdated,
  sceneConfigLightingFlushed,
  sceneLightingUpdated,
  templateLightUpdated,
  wallCreated,
  wallDeleted,
  wallUpdated,
} from '../../../scripts/visibility/auto-visibility/core/EnvironmentInvalidationIntents.js';

describe('EnvironmentInvalidationIntents', () => {
  const document = { id: 'doc-1' };
  const changes = { value: true };
  const context = { options: { diff: true }, userId: 'user-1' };

  test('builds ambient lighting intents', () => {
    expect(ambientLightUpdated(document, changes, context)).toEqual({
      reason: 'ambient-light-updated',
      document,
      changeData: changes,
      options: { diff: true },
      userId: 'user-1',
    });
    expect(ambientLightCreated(document, context)).toEqual({
      reason: 'ambient-light-created',
      document,
      options: { diff: true },
      userId: 'user-1',
    });
    expect(ambientLightDeleted(document, context)).toEqual({
      reason: 'ambient-light-deleted',
      document,
      options: { diff: true },
      userId: 'user-1',
    });
    expect(lightingRefresh()).toEqual({ reason: 'lighting-refresh' });
  });

  test('builds wall intents', () => {
    expect(wallUpdated(document, changes, context)).toEqual({
      reason: 'wall-updated',
      document,
      changeData: changes,
      options: { diff: true },
      userId: 'user-1',
    });
    expect(wallCreated(document, context)).toEqual({
      reason: 'wall-created',
      document,
      options: { diff: true },
      userId: 'user-1',
    });
    expect(wallDeleted(document, context)).toEqual({
      reason: 'wall-deleted',
      document,
      options: { diff: true },
      userId: 'user-1',
    });
  });

  test('builds scene lighting and scene config flush intents', () => {
    expect(sceneLightingUpdated(document, changes, context)).toEqual({
      reason: 'scene-lighting-updated',
      document,
      changeData: changes,
      options: { diff: true },
      userId: 'user-1',
    });
    expect(sceneConfigLightingFlushed()).toEqual({
      reason: 'scene-config-lighting-flushed',
    });
  });

  test('builds region surface intent metadata from detail', () => {
    expect(
      regionSurfaceUpdated('region-update', {
        document,
        changes,
        options: { diff: true },
        userId: 'user-1',
        sceneId: 'scene-1',
        sceneName: 'Scene',
        regionId: 'region-1',
        regionName: 'Region',
        behaviorId: 'behavior-1',
        placementLevelsChanged: true,
        hasDefineSurface: true,
      }),
    ).toEqual({
      reason: 'region-surface-updated',
      document,
      changeData: changes,
      options: { diff: true },
      userId: 'user-1',
      metadata: {
        triggerReason: 'region-update',
        sceneId: 'scene-1',
        sceneName: 'Scene',
        regionId: 'region-1',
        regionName: 'Region',
        behaviorId: 'behavior-1',
        placementLevelsChanged: true,
        hasDefineSurface: true,
      },
    });
  });

  test('builds template light intents with optional change data', () => {
    expect(templateLightUpdated(document, { action: 'created' })).toEqual({
      reason: 'template-light-updated',
      document,
      metadata: { action: 'created' },
    });
    expect(templateLightUpdated(document, { action: 'updated', changes })).toEqual({
      reason: 'template-light-updated',
      document,
      changeData: changes,
      metadata: { action: 'updated' },
    });
  });
});
