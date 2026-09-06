import '../../setup.js';
import autoCoverSystem from '../../../scripts/cover/auto-cover/AutoCoverSystem.js';
import { combatStartCoverService } from '../../../scripts/services/CombatStartCoverService.js';
import { AttackRollUseCase } from '../../../scripts/cover/auto-cover/usecases/AttackRollUseCase.js';
import { AutoCoverHooks } from '../../../scripts/cover/auto-cover/AutoCoverHooks.js';

function makeToken(id, alliance) {
  const flags = {};
  const effects = [];
  const actor = {
    id: `${id}-actor`,
    signature: `${id}-signature`,
    alliance,
    itemTypes: { effect: effects },
    createEmbeddedDocuments: jest.fn(async (_type, items) => {
      effects.push(...items.map((item) => ({ ...item, id: `${id}-${effects.length}` })));
    }),
    deleteEmbeddedDocuments: jest.fn(async (_type, ids) => {
      for (let i = effects.length - 1; i >= 0; i--) {
        if (ids.includes(effects[i].id)) effects.splice(i, 1);
      }
    }),
  };
  const document = {
    id,
    documentName: 'Token',
    getFlag: (_scope, key) => flags[key],
    setFlag: async (_scope, key, value) => {
      // Foundry merges object flags; omitted keys are not deletions.
      flags[key] = { ...flags[key], ...value };
      for (const entry of Object.keys(flags[key])) {
        if (entry.startsWith('-=')) {
          delete flags[key][entry.slice(2)];
          delete flags[key][entry];
        }
      }
    },
    unsetFlag: async (_scope, key) => {
      delete flags[key];
    },
  };
  const token = { id, name: id, actor, document, isOwner: true };
  document.object = token;
  return token;
}

describe('combat-start cover effect lifecycle', () => {
  let attacker, target, useCase;

  beforeEach(async () => {
    game.user.isGM = true;
    await game.settings.set('pf2e-visioner', 'computeCoverAtCombatStart', true);
    await game.settings.set('pf2e-visioner', 'autoCover', true);
    attacker = makeToken('attacker', 'party');
    target = makeToken('target', 'opposition');
    canvas.tokens.placeables = [attacker, target];
    canvas.tokens.get = (id) => canvas.tokens.placeables.find((token) => token.id === id);
    autoCoverSystem._activePairsByAttacker.clear();
    jest.spyOn(autoCoverSystem, 'detectCoverBetweenTokens').mockReturnValue('greater');
    useCase = new AttackRollUseCase();
    useCase.coverUIManager = {
      shouldShowCoverOverrideIndicator: jest.fn().mockResolvedValue(false),
    };
    await combatStartCoverService.applyCombatStartAutoCover({
      combatants: [attacker, target].map((token) => ({ token: token.document })),
    });
    expect(target.actor.itemTypes.effect).toHaveLength(1);
  });

  afterEach(() => jest.restoreAllMocks());

  test('first movement removes combat-start effects in both directions', async () => {
    await autoCoverSystem.onUpdateDocument(attacker.document, { x: 100 });
    expect(target.actor.itemTypes.effect).toHaveLength(0);
    expect(attacker.actor.itemTypes.effect).toHaveLength(0);
  });

  test.each([{ x: 100 }, { elevation: 10 }])(
    'movement hook removes existing cover with auto-cover disabled: %j',
    async (changes) => {
      await game.settings.set('pf2e-visioner', 'autoCover', false);
      await new AutoCoverHooks().onUpdateToken(attacker.document, changes);
      expect(target.actor.itemTypes.effect).toHaveLength(0);
      expect(attacker.actor.itemTypes.effect).toHaveLength(0);
    },
  );

  test('movement removes every duplicate cover effect for the pair', async () => {
    const effects = target.actor.itemTypes.effect;
    effects.push({ ...effects[0], id: 'duplicate-cover' });
    await autoCoverSystem.onUpdateDocument(attacker.document, { x: 100 });
    expect(effects).toHaveLength(0);
  });

  test('cleanup recognizes the same observer token after its actor signature changes', async () => {
    attacker.actor.signature = 'changed-signature';
    await autoCoverSystem.onUpdateDocument(attacker.document, { x: 100 });
    expect(target.actor.itemTypes.effect).toHaveLength(0);
  });

  test('cleanup deletes one stored pair while preserving another target', async () => {
    const other = makeToken('other-target', 'opposition');
    await autoCoverSystem.setCoverBetween(attacker, other, 'standard');
    await autoCoverSystem.cleanupCover(attacker, target);
    expect(autoCoverSystem.getCoverBetween(attacker, target)).toBe('none');
    expect(autoCoverSystem.getCoverBetween(attacker, other)).toBe('standard');
    expect(target.actor.itemTypes.effect).toHaveLength(0);
    expect(other.actor.itemTypes.effect).toHaveLength(1);
  });

  test('GM handles player movement without player-side document writes', async () => {
    const hooks = new AutoCoverHooks();
    game.user.isGM = false;
    await hooks.onUpdateToken(attacker.document, { x: 100 });
    expect(target.actor.itemTypes.effect).toHaveLength(1);
    expect(autoCoverSystem.getCoverBetween(attacker, target)).toBe('greater');
    game.user.isGM = true;
    await hooks.onUpdateToken(attacker.document, { x: 100 });
    expect(target.actor.itemTypes.effect).toHaveLength(0);
  });

  test('attack completion preserves combat-start cover until either token moves', async () => {
    await useCase.handleRenderChatMessage(
      {
        toObject: () => ({
          speaker: { token: attacker.id },
          flags: { pf2e: { context: { target: { token: target.id } } } },
        }),
      },
      {},
    );
    expect(target.actor.itemTypes.effect).toHaveLength(1);
    expect(autoCoverSystem.getCoverBetween(attacker, target)).toBe('greater');
    expect(attacker.actor.itemTypes.effect).toHaveLength(1);
    expect(autoCoverSystem.getCoverBetween(target, attacker)).toBe('greater');
    await new AutoCoverHooks().onUpdateToken(target.document, { x: 100 });
    expect(target.actor.itemTypes.effect).toHaveLength(0);
    expect(autoCoverSystem.getCoverBetween(attacker, target)).toBe('none');
  });

  test('cleanup removes lingering effect even after its map was cleared', async () => {
    await autoCoverSystem.setCoverBetween(attacker, target, 'none', { skipEphemeralUpdate: true });
    await autoCoverSystem.cleanupCover(attacker, target);
    expect(target.actor.itemTypes.effect).toHaveLength(0);
  });

  test.each(['lesser', 'none'])(
    'combat-start greater cover governs attack despite %s detection',
    async (detected) => {
      useCase._resolveAttackerFromCtx = () => attacker;
      useCase._resolveTargetFromCtx = () => target;
      useCase._refreshDefenderVisibilityEffectsForAttack = async () => {};
      useCase._detectCover = () => detected;
      useCase._isPf2eCheckDialogEnabled = () => false;
      useCase.coverUIManager.showPopupAndApply = jest.fn().mockResolvedValue({ chosen: detected });
      const apply = jest.spyOn(useCase, '_applyCoverEphemeralEffect').mockResolvedValue();
      const context = {};
      await useCase.handleCheckRoll({}, context);
      expect(apply).toHaveBeenCalledWith(target, attacker, 'greater', context, 'greater');
      expect(useCase.coverUIManager.showPopupAndApply).toHaveBeenCalledWith(detected, 'greater');
      await new AutoCoverHooks().onUpdateToken(attacker.document, { x: 100 });
      await useCase.handleCheckRoll({}, context);
      expect(apply).toHaveBeenLastCalledWith(target, attacker, detected, context, 'none');
    },
  );

  test('combat-start cover is presented as fixed cover in attack dialog', async () => {
    useCase._resolveAttackerFromCtx = () => attacker;
    useCase._resolveTargetFromCtx = () => target;
    useCase._refreshDefenderVisibilityEffectsForAttack = async () => {};
    useCase._detectCover = () => 'lesser';
    useCase.coverUIManager.injectDialogCoverUI = jest.fn();
    await useCase.handleCheckDialog({ context: {} }, {});
    expect(useCase.coverUIManager.injectDialogCoverUI).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      target,
      'greater',
      null,
      expect.any(Function),
    );
  });

  test('roll clone retains combat-start cover before movement', async () => {
    const state = 'greater';
    const actor = target.actor;
    actor._source = { items: [...actor.itemTypes.effect] };
    actor.clone = jest.fn(({ items }) => ({
      _source: { items },
      getStatistic: () => {
        const cover = Math.max(
          0,
          ...items
            .flatMap((item) => item.system.rules)
            .filter((rule) => rule.key === 'FlatModifier' && rule.selector === 'ac')
            .map((rule) => rule.value),
        );
        return {
          dc: { value: 20 + cover },
          clone: ({ modifiers }) => ({
            dc: { value: 20 + Math.max(cover, ...modifiers.map((m) => m.modifier)) },
          }),
        };
      },
    }));
    actor.getStatistic = () => ({ clone: () => ({ dc: { value: 24 } }) });
    useCase._getUnsuppressedOffGuardAdjustment = () => null;
    const context = { dc: { slug: 'ac', value: 24 } };
    await useCase._applyCoverEphemeralEffect(target, attacker, state, context, 'greater');
    expect(context.dc.value).toBe(24);
    expect(actor.clone).toHaveBeenCalled();
    const items = actor.clone.mock.calls[0][0].items;
    expect(items.some((item) => item.flags?.['pf2e-visioner']?.isEphemeralCover)).toBe(true);
    const coverBonuses = items
      .flatMap((item) => item.system.rules)
      .filter((rule) => rule.key === 'FlatModifier' && rule.selector === 'ac')
      .map((rule) => rule.value);
    expect(coverBonuses.every((bonus) => bonus === 4)).toBe(true);
    expect(actor.itemTypes.effect).toHaveLength(1);
  });

  test.each(['attacker', 'target'])(
    'movement of %s recovers orphaned effects after reload',
    async (moverId) => {
      await autoCoverSystem.setCoverBetween(attacker, target, 'none', {
        skipEphemeralUpdate: true,
      });
      await autoCoverSystem.setCoverBetween(target, attacker, 'none', {
        skipEphemeralUpdate: true,
      });
      autoCoverSystem._activePairsByAttacker.clear();
      await autoCoverSystem.onUpdateDocument(canvas.tokens.get(moverId).document, { x: 100 });
      expect(target.actor.itemTypes.effect).toHaveLength(0);
      expect(attacker.actor.itemTypes.effect).toHaveLength(0);
    },
  );
});
