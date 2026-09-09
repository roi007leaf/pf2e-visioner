import detector from '../../../scripts/cover/auto-cover/CoverDetector.js';
import '../../setup.js';

describe('Starlit Span Arcane Cascade cover', () => {
  let attacker, target, ally, enemy, context;

  function token(id, x, alliance) {
    return global.createMockToken({
      id,
      x,
      y: 0,
      center: { x: x + 25, y: 25 },
      actor: {
        type: 'character',
        alliance,
        items: [],
        system: { traits: { size: { value: 'med' } } },
        getRollOptions: () => [],
      },
    });
  }

  beforeEach(() => {
    attacker = token('attacker', 0, 'party');
    target = token('target', 300, 'opposition');
    ally = token('ally', 150, 'party');
    enemy = token('enemy', 200, 'opposition');
    attacker.actor.items = [{ type: 'feat', system: { slug: 'starlit-span' } }];
    attacker.actor.getRollOptions = jest.fn(() => ['self:effect:arcane-cascade']);
    attacker.actor.isAllyOf = (actor) => actor.alliance === 'party';
    context = { type: 'strike-attack-roll', options: new Set(['action:strike', 'item:ranged']) };
    canvas.tokens.placeables = [attacker, target, ally];
    canvas.tokens.controlled = [];
    canvas.walls.placeables = [];
    for (const setting of [
      'IgnoreUndetected',
      'IgnoreDead',
      'IgnoreAllies',
      'IgnoreSmallerTokens',
      'IgnoreSameSizeTokens',
      'IgnoreLargerTokens',
    ]) {
      game.settings.set('pf2e-visioner', `autoCover${setting}`, false);
    }
    game.settings.set('pf2e-visioner', 'autoCoverAllowProneBlockers', true);
    game.settings.set('pf2e-visioner', 'autoCoverTokenIntersectionMode', 'size');
    game.settings.set('pf2e-visioner', 'wallCoverAllowGreater', true);
  });

  afterEach(() => jest.restoreAllMocks());
  const detect = () => detector.detectBetweenTokens(attacker, target, { attackContext: context });

  test('records the benefit for chat once, clears it when stance ends', () => {
    expect(detect()).toBe('none');
    expect(detector.consumeStarlitSpanCoverIgnore(attacker.id, target.id)).toMatchObject({
      feat: 'starlit-span',
      from: 'lesser',
      to: 'none',
    });
    expect(detector.consumeStarlitSpanCoverIgnore(attacker.id, target.id)).toBeNull();
    detect();
    attacker.actor.getRollOptions.mockReturnValue([]);
    detect();
    expect(detector.consumeStarlitSpanCoverIgnore(attacker.id, target.id)).toBeNull();
  });

  test('does not record a chat benefit when terrain still grants cover', () => {
    jest.spyOn(detector, '_checkTileCoverOverrides').mockReturnValue('lesser');
    expect(detect()).toBe('lesser');
    expect(detector.consumeStarlitSpanCoverIgnore(attacker.id, target.id)).toBeNull();
  });

  test('ignores lesser cover from allies, restores it immediately when stance ends', () => {
    expect(detect()).toBe('none');
    attacker.actor.getRollOptions.mockReturnValue([]);
    expect(detect()).toBe('lesser');
  });

  test.each(['melee', 'missing context', 'missing feature', 'enemy', 'neutral', 'mixed blockers'])(
    'preserves cover: %s',
    (scenario) => {
      if (scenario === 'melee') context.options = ['item:melee', 'action:strike'];
      if (scenario === 'missing context') context = null;
      if (scenario === 'missing feature') attacker.actor.items = [];
      if (scenario === 'enemy') ally.actor.alliance = 'opposition';
      if (scenario === 'neutral') ally.actor.alliance = null;
      if (scenario === 'mixed blockers') canvas.tokens.placeables.push(enemy);
      expect(detect()).toBe('lesser');
    },
  );

  test('supports ranged spell attacks and Set actor roll options', () => {
    context = { type: 'spell-attack-roll', options: ['item:ranged'] };
    attacker.actor.getRollOptions.mockReturnValue(new Set(['self:effect:arcane-cascade']));
    expect(detect()).toBe('none');
  });

  test('respects native alliance result despite matching token dispositions', () => {
    attacker.document.disposition = ally.document.disposition = 1;
    attacker.actor.isAllyOf = () => false;
    expect(detect()).toBe('lesser');
  });

  test('preserves size-based standard cover from an ally', () => {
    ally.actor.system.traits.size.value = 'huge';
    expect(detect()).toBe('standard');
  });

  test.each(['standard', 'greater'])('preserves allied token override: %s', (state) => {
    ally.document.getFlag = (module, key) => (key === 'coverOverride' ? state : undefined);
    expect(detect()).toBe(state);
  });

  test.each(['lesser', 'standard', 'greater'])('preserves tile cover: %s', (state) => {
    jest.spyOn(detector, '_checkTileCoverOverrides').mockReturnValue(state);
    expect(detect()).toBe(state);
  });

  test('preserves wall cover', () => {
    jest.spyOn(detector, '_checkWallCoverOverrides').mockReturnValue('standard');
    expect(detect()).toBe('standard');
  });

  test.each(['coverage', 'tactical'])(
    'rechecks all blockers in %s mode, including enemies behind allies',
    (mode) => {
      game.settings.set('pf2e-visioner', 'autoCoverTokenIntersectionMode', mode);
      const method =
        mode === 'coverage'
          ? '_evaluateCoverByCoverageDetailed'
          : '_evaluateCoverByTacticalDetailed';
      jest.spyOn(detector, method).mockImplementation((a, t, blockers) => ({
        state: blockers.length ? 'lesser' : 'none',
        blockers: blockers.slice(0, 1),
      }));
      expect(detect()).toBe('none');
      canvas.tokens.placeables.push(enemy);
      expect(detect()).toBe('lesser');
    },
  );

  test.each(['coverage', 'tactical'])('preserves stronger cover in %s mode', (mode) => {
    game.settings.set('pf2e-visioner', 'autoCoverTokenIntersectionMode', mode);
    const method =
      mode === 'coverage' ? '_evaluateCoverByCoverageDetailed' : '_evaluateCoverByTacticalDetailed';
    for (const state of ['standard', 'greater']) {
      jest.spyOn(detector, method).mockReturnValue({ state, blockers: [ally] });
      expect(detect()).toBe(state);
    }
  });
});
