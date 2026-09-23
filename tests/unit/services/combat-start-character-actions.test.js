import '../../setup.js';
import { DEFAULT_SETTINGS } from '../../../scripts/constants.js';
import { applyCombatStartCharacterActions } from '../../../scripts/services/CombatStartCharacterActions.js';

const SHIELD_EFFECT = 'Compendium.pf2e.equipment-effects.Item.2YgXoHvJfrDHucMr';

function character(id, { defend = false, shield = true, quickTempered = false, rage = false } = {}) {
  const defendItem = { id: `${id}-defend`, slug: 'defend' };
  const items = new Map([[defendItem.id, defendItem]]);
  const effects = [];
  const actor = {
    id, uuid: `Actor.${id}`, name: id, type: 'character',
    items, system: { exploration: defend ? [defendItem.id] : [] },
    heldShield: shield ? { isBroken: false, isDestroyed: false } : null,
    itemTypes: {
      feat: quickTempered ? [{ slug: 'quick-tempered' }] : [],
      action: rage ? [{ slug: 'rage', uuid: `Actor.${id}.Item.rage`,
        system: { selfEffect: { uuid: 'Compendium.test.Item.rage-effect' } },
        getOriginData: () => ({ rollOptions: ['origin:rage'] }) }] : [],
      effect: effects,
    },
    createEmbeddedDocuments: jest.fn(async (_type, documents) => {
      effects.push(...documents.map((data) => ({
        slug: 'effect-rage', sourceId: 'Compendium.test.Item.rage-effect', ...data,
      })));
    }),
  };
  const token = { id, document: { uuid: `Scene.test.Token.${id}` }, actor };
  return { actor, token, combatant: { actor, tokenId: id, token: { object: token } } };
}

describe('combat-start character actions', () => {
  let originalFromUuid;

  beforeEach(() => {
    originalFromUuid = global.fromUuid;
    game.user.isActiveGM = true;
    game.pf2e = { actions: { raiseAShield: jest.fn(async ({ actors }) => {
      actors[0].itemTypes.effect.push({
        slug: 'raise-a-shield', sourceId: SHIELD_EFFECT,
        system: { duration: { value: 1 } }, update: jest.fn(async function (changes) {
          this.system.duration.value = changes['system.duration.value'];
        }),
      });
    }) } };
    global.fromUuid = jest.fn(async () => ({
      uuid: 'Compendium.test.Item.rage-effect', slug: 'effect-rage',
      isOfType: (type) => type === 'effect',
      toObject: () => ({ system: { context: {} } }),
    }));
    game.settings.set('pf2e-visioner', 'raisePcShieldsWhenDefending', false);
    game.settings.set('pf2e-visioner', 'enrageBarbariansAtCombatStart', false);
  });

  afterEach(() => {
    global.fromUuid = originalFromUuid;
    delete game.pf2e;
    game.user.isActiveGM = false;
  });

  test('both settings are off by default', () => {
    expect(DEFAULT_SETTINGS.raisePcShieldsWhenDefending.default).toBe(false);
    expect(DEFAULT_SETTINGS.enrageBarbariansAtCombatStart.default).toBe(false);
  });

  test('Defend raises only a usable held PC shield through PF2e and expires at first turn', async () => {
    await game.settings.set('pf2e-visioner', 'raisePcShieldsWhenDefending', true);
    const defender = character('defender', { defend: true });
    const noActivity = character('no-activity');
    const noShield = character('no-shield', { defend: true, shield: false });
    const combat = { combatants: [defender, noActivity, noShield].map((entry) => entry.combatant) };

    await applyCombatStartCharacterActions(combat);
    await applyCombatStartCharacterActions(combat);

    expect(game.pf2e.actions.raiseAShield).toHaveBeenCalledTimes(1);
    expect(game.pf2e.actions.raiseAShield).toHaveBeenCalledWith({ actors: [defender.actor] });
    expect(defender.actor.itemTypes.effect[0].system.duration.value).toBe(0);
  });

  test('Quick-Tempered Rage applies configured self effect once to PC', async () => {
    await game.settings.set('pf2e-visioner', 'enrageBarbariansAtCombatStart', true);
    const barbarian = character('barbarian', { quickTempered: true, rage: true });
    const noFeat = character('no-feat', { rage: true });
    const noAction = character('no-action', { quickTempered: true });
    const combat = { combatants: [barbarian, noFeat, noAction].map((entry) => entry.combatant) };

    await applyCombatStartCharacterActions(combat);
    await applyCombatStartCharacterActions(combat);

    expect(barbarian.actor.createEmbeddedDocuments).toHaveBeenCalledTimes(1);
    expect(barbarian.actor.createEmbeddedDocuments).toHaveBeenCalledWith('Item', [expect.objectContaining({
      _id: null,
      system: { context: expect.objectContaining({ origin: expect.objectContaining({
        actor: barbarian.actor.uuid, item: barbarian.actor.itemTypes.action[0].uuid,
      }) }) },
    })]);
    expect(noFeat.actor.createEmbeddedDocuments).not.toHaveBeenCalled();
    expect(noAction.actor.createEmbeddedDocuments).not.toHaveBeenCalled();
    expect(game.pf2e.actions.raiseAShield).not.toHaveBeenCalled();
  });

  test('inactive GM does not execute either automation', async () => {
    await game.settings.set('pf2e-visioner', 'raisePcShieldsWhenDefending', true);
    await game.settings.set('pf2e-visioner', 'enrageBarbariansAtCombatStart', true);
    const entry = character('barbarian', { defend: true, quickTempered: true, rage: true });
    game.user.isActiveGM = false;

    await applyCombatStartCharacterActions({ combatants: [entry.combatant] });

    expect(game.pf2e.actions.raiseAShield).not.toHaveBeenCalled();
    expect(global.fromUuid).not.toHaveBeenCalled();
  });

  test('does not duplicate matching Avoid Notice automation', async () => {
    await game.settings.set('pf2e-visioner', 'raisePcShieldsWhenDefending', true);
    await game.settings.set('pf2e-visioner', 'enrageBarbariansAtCombatStart', true);
    const entry = character('barbarian', { defend: true, quickTempered: true, rage: true });
    const moduleLookup = game.modules.get;
    game.modules.get = jest.fn((id) => id === 'pf2e-avoid-notice' ? { active: true } : moduleLookup(id));
    await game.settings.set('pf2e-avoid-notice', 'raiseShields', true);
    await game.settings.set('pf2e-avoid-notice', 'rage', true);

    try {
      await applyCombatStartCharacterActions({ combatants: [entry.combatant] });
      expect(game.pf2e.actions.raiseAShield).not.toHaveBeenCalled();
      expect(global.fromUuid).not.toHaveBeenCalled();
    } finally {
      game.modules.get = moduleLookup;
      await game.settings.set('pf2e-avoid-notice', 'raiseShields', false);
      await game.settings.set('pf2e-avoid-notice', 'rage', false);
    }
  });
});
