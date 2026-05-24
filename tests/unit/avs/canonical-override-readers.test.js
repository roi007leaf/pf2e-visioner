import '../../setup.js';

describe('Canonical AVS override readers', () => {
  test('attack consequences detection reads canonical hidden override flags', async () => {
    const { extractActionData } = await import('../../../scripts/chat/services/action-extractor.js');

    const attacker = {
      id: 'attacker',
      actor: { itemTypes: { condition: [] } },
      document: {
        flags: {
          'pf2e-visioner': {
            'avs-override-from-observer': {
              observerId: 'observer',
              targetId: 'attacker',
              detectionState: 'hidden',
              hasConcealment: false,
            },
          },
        },
      },
    };

    const result = await extractActionData({
      id: 'msg-canonical-hidden-attack',
      flags: { pf2e: { context: { type: 'attack-roll' } } },
      token: { object: attacker },
    });

    expect(result).toMatchObject({
      actionType: 'consequences',
      actor: attacker,
    });
  });

  test('batch override cache reads canonical concealed fallback flags', async () => {
    const { OverrideBatchCache } = await import(
      '../../../scripts/visibility/auto-visibility/core/OverrideBatchCache.js'
    );

    const observer = { document: { id: 'observer' } };
    const target = {
      document: {
        id: 'target',
        getFlag: jest.fn(() => ({
          observerId: 'observer',
          targetId: 'target',
          detectionState: 'observed',
          hasConcealment: true,
        })),
      },
    };

    const cache = new OverrideBatchCache(null);

    expect(cache.getOverrideState('observer', 'target', observer, target)).toBe('concealed');
  });

  test('batch override cache applies invisible transition to hidden override flags', async () => {
    const { OverrideBatchCache } = await import(
      '../../../scripts/visibility/auto-visibility/core/OverrideBatchCache.js'
    );

    const observer = { document: { id: 'observer' } };
    const target = {
      actor: {
        itemTypes: {
          condition: [{ id: 'invisible-item', slug: 'invisible', isExpired: false }],
        },
      },
      document: {
        id: 'target',
        getFlag: jest.fn((moduleId, key) => {
          if (moduleId !== 'pf2e-visioner') return null;
          if (key === 'avs-override-from-observer') {
            return {
              observerId: 'observer',
              targetId: 'target',
              detectionState: 'hidden',
              hasConcealment: false,
            };
          }
          if (key === 'invisibility') {
            return {
              observer: {
                previousState: 'hidden',
                conditionItemId: 'invisible-item',
              },
            };
          }
          return null;
        }),
      },
    };

    const cache = new OverrideBatchCache(null);

    expect(cache.getOverrideState('observer', 'target', observer, target)).toBe('undetected');
  });

  test('batch override cache can read raw hidden override while snapshotting invisibility', async () => {
    const { OverrideBatchCache } = await import(
      '../../../scripts/visibility/auto-visibility/core/OverrideBatchCache.js'
    );

    const observer = { document: { id: 'observer' } };
    const target = {
      actor: {
        itemTypes: {
          condition: [{ id: 'invisible-item', slug: 'invisible', isExpired: false }],
        },
      },
      document: {
        id: 'target',
        getFlag: jest.fn((moduleId, key) => {
          if (moduleId !== 'pf2e-visioner') return null;
          if (key === 'avs-override-from-observer') {
            return {
              observerId: 'observer',
              targetId: 'target',
              detectionState: 'hidden',
              hasConcealment: false,
            };
          }
          if (key === 'invisibility') {
            return {
              observer: {
                previousState: 'hidden',
                conditionItemId: 'invisible-item',
              },
            };
          }
          return null;
        }),
      },
    };

    const cache = new OverrideBatchCache(null, { applyInvisibilityTransition: false });

    expect(cache.getOverrideState('observer', 'target', observer, target)).toBe('hidden');
  });

  test('sneak start and end prerequisite checks read canonical override flags', async () => {
    const { SneakPreviewDialog } = await import(
      '../../../scripts/chat/dialogs/SneakPreviewDialog.js'
    );

    const observer = { id: 'observer', document: { id: 'observer' } };
    const dialog = Object.create(SneakPreviewDialog.prototype);
    dialog.startStates = {};
    dialog.isEndOfTurnDialog = false;
    dialog._getPositionTransitionForToken = jest.fn(() => null);

    dialog.sneakingToken = {
      id: 'sneaker',
      document: {
        id: 'sneaker',
        getFlag: jest.fn(() => ({
          observerId: 'observer',
          targetId: 'sneaker',
          detectionState: 'hidden',
          hasConcealment: false,
        })),
      },
    };
    expect(dialog._startPositionQualifiesForSneak(observer, {})).toBe(true);

    dialog.sneakingToken.document.getFlag = jest.fn(() => ({
      observerId: 'observer',
      targetId: 'sneaker',
      detectionState: 'observed',
      hasConcealment: true,
      expectedCover: 'none',
    }));
    expect(dialog._endPositionQualifiesForSneak(observer, {})).toBe(true);
  });

  test('hide preview context reads canonical concealed override flags', async () => {
    const { HidePreviewDialog } = await import('../../../scripts/chat/dialogs/HidePreviewDialog.js');

    game.settings.set('pf2e-visioner', 'autoVisibilityEnabled', true);

    const observer = {
      id: 'observer',
      name: 'Observer',
      actor: { alliance: 'opposition' },
      document: { id: 'observer', hidden: false },
    };
    const canonicalConcealed = {
      observerId: 'observer',
      targetId: 'hider',
      detectionState: 'observed',
      hasConcealment: true,
    };
    const hider = {
      id: 'hider',
      name: 'Hider',
      actor: { id: 'hider-actor', alliance: 'opposition' },
      document: {
        id: 'hider',
        getFlag: jest.fn(() => canonicalConcealed),
        flags: {
          'pf2e-visioner': {
            'avs-override-from-observer': canonicalConcealed,
          },
        },
      },
    };

    canvas.tokens.placeables = [hider, observer];
    canvas.tokens.get = jest.fn((id) => (id === 'hider' ? hider : id === 'observer' ? observer : null));

    const dialog = new HidePreviewDialog(
      hider,
      [
        {
          target: observer,
          oldVisibility: 'observed',
          currentVisibility: 'observed',
          newVisibility: 'hidden',
          outcome: 'success',
        },
      ],
      [],
      { actor: hider },
    );

    await dialog._prepareContext({});

    expect(dialog.outcomes[0].oldVisibility).toBe('concealed');
  });
});
