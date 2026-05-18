import {
  VISIBILITY_V2_MIGRATION_VERSION,
  runVisibilityV2MigrationIfNeeded,
} from '../../../scripts/migrations/visibility-v2-migration.js';

function createTokenDocument(id, flags = {}) {
  const tokenFlags = { 'pf2e-visioner': { ...flags } };
  return {
    id,
    flags: tokenFlags,
    getFlag: jest.fn((moduleId, key) => tokenFlags[moduleId]?.[key] ?? null),
    setFlag: jest.fn(async (moduleId, key, value) => {
      tokenFlags[moduleId] ??= {};
      tokenFlags[moduleId][key] = value;
      return true;
    }),
    unsetFlag: jest.fn(async (moduleId, key) => {
      delete tokenFlags[moduleId]?.[key];
      return true;
    }),
  };
}

describe('visibilityV2 migration', () => {
  let scene;

  beforeEach(() => {
    global.game.user.isGM = true;
    global.game.settings.get.mockImplementation((moduleId, settingId) => {
      if (moduleId === 'pf2e-visioner' && settingId === 'visibilityV2MigrationVersion') {
        return 0;
      }
      return false;
    });
    global.game.settings.set.mockClear();

    scene = {
      tokens: {
        contents: [],
      },
    };
    global.game.scenes = {
      contents: [scene],
    };
  });

  test('copies legacy visibility maps into normalized visibilityV2 profiles', async () => {
    const observerDoc = createTokenDocument('observer', {
      visibility: {
        targetA: 'concealed',
        targetB: 'hidden',
      },
    });
    scene.tokens.contents = [observerDoc];

    const result = await runVisibilityV2MigrationIfNeeded();

    expect(observerDoc.setFlag).toHaveBeenCalledWith('pf2e-visioner', 'visibilityV2', {
      targetA: expect.objectContaining({
        detectionState: 'observed',
        hasConcealment: true,
      }),
      targetB: expect.objectContaining({
        detectionState: 'hidden',
        hasConcealment: false,
      }),
    });
    expect(observerDoc.unsetFlag).toHaveBeenCalledWith('pf2e-visioner', 'visibility');
    expect(global.game.settings.set).toHaveBeenCalledWith(
      'pf2e-visioner',
      'visibilityV2MigrationVersion',
      VISIBILITY_V2_MIGRATION_VERSION,
    );
    expect(result.updatedTokens).toBe(1);
  });

  test('preserves existing visibilityV2 entries over legacy values', async () => {
    const observerDoc = createTokenDocument('observer', {
      visibility: {
        targetA: 'concealed',
        targetB: 'hidden',
      },
      visibilityV2: {
        targetA: {
          detectionState: 'undetected',
          hasConcealment: false,
        },
      },
    });
    scene.tokens.contents = [observerDoc];

    await runVisibilityV2MigrationIfNeeded();

    expect(observerDoc.setFlag).toHaveBeenCalledWith('pf2e-visioner', 'visibilityV2', {
      targetA: expect.objectContaining({
        detectionState: 'undetected',
        hasConcealment: false,
      }),
      targetB: expect.objectContaining({
        detectionState: 'hidden',
        hasConcealment: false,
      }),
    });
  });

  test('replaces legacy AVS override state with canonical profile metadata', async () => {
    const targetDoc = createTokenDocument('target', {
      'avs-override-from-observer': {
        state: 'concealed',
        source: 'manual_action',
        observerId: 'observer',
        targetId: 'target',
      },
    });
    scene.tokens.contents = [targetDoc];

    await runVisibilityV2MigrationIfNeeded();

    expect(targetDoc.setFlag).toHaveBeenCalledWith(
      'pf2e-visioner',
        'avs-override-from-observer',
        expect.objectContaining({
        detectionState: 'observed',
        hasConcealment: true,
        awarenessState: null,
        coverState: 'none',
        detectionSense: null,
      }),
    );
    expect(targetDoc.setFlag.mock.calls.at(-1)[2]).not.toHaveProperty('state');
  });

  test('reruns for worlds that completed the earlier partial v2 migration', async () => {
    global.game.settings.get.mockImplementation((moduleId, settingId) => {
      if (moduleId === 'pf2e-visioner' && settingId === 'visibilityV2MigrationVersion') {
        return 2;
      }
      return false;
    });
    const targetDoc = createTokenDocument('target', {
      'avs-override-from-observer': {
        state: 'hidden',
        source: 'manual_action',
        observerId: 'observer',
        targetId: 'target',
      },
    });
    scene.tokens.contents = [targetDoc];

    const result = await runVisibilityV2MigrationIfNeeded();

    expect(result.skipped).toBe(false);
    expect(targetDoc.setFlag).toHaveBeenCalledWith(
      'pf2e-visioner',
      'avs-override-from-observer',
      expect.objectContaining({
        detectionState: 'hidden',
        hasConcealment: false,
      }),
    );
    expect(targetDoc.setFlag.mock.calls.at(-1)[2]).not.toHaveProperty('state');
    expect(global.game.settings.set).toHaveBeenCalledWith(
      'pf2e-visioner',
      'visibilityV2MigrationVersion',
      VISIBILITY_V2_MIGRATION_VERSION,
    );
  });

  test('skips migration when the stored migration version is current', async () => {
    global.game.settings.get.mockImplementation((moduleId, settingId) => {
      if (moduleId === 'pf2e-visioner' && settingId === 'visibilityV2MigrationVersion') {
        return VISIBILITY_V2_MIGRATION_VERSION;
      }
      return false;
    });
    const observerDoc = createTokenDocument('observer', {
      visibility: { target: 'concealed' },
    });
    scene.tokens.contents = [observerDoc];

    const result = await runVisibilityV2MigrationIfNeeded();

    expect(observerDoc.setFlag).not.toHaveBeenCalled();
    expect(result.skipped).toBe(true);
  });
});
