import { jest } from '@jest/globals';

// Minimal actor factory
function actorWithSpeedAndFeats(speed, slugs = []) {
  const items = slugs.map((slug) => ({ type: 'feat', system: { slug } }));
  return {
    system: {
      // New movement path used by the system under test
      movement: { speeds: { land: { value: speed } } },
      // Keep legacy attributes.speed for backward compatibility with other code
      attributes: { speed: { value: speed } },
    },
    items,
    getFlag: () => undefined,
    setFlag: () => Promise.resolve(),
    unsetFlag: () => Promise.resolve(),
    update: jest.fn().mockResolvedValue(true),
  };
}

async function importService() {
  return await import('../../../scripts/chat/services/sneak-speed-service.js');
}


describe('SneakSpeedService feat interactions', () => {
  test('getSneakSpeedMultiplier: default 0.5, full speed with legendary-sneak/swift-sneak', async () => {
    const { FeatsHandler } = await import('../../../scripts/chat/services/feats-handler.js');
    const a1 = actorWithSpeedAndFeats(30, []);
    const a2 = actorWithSpeedAndFeats(30, ['legendary-sneak']);
    const a3 = actorWithSpeedAndFeats(30, ['swift-sneak']);

    expect(FeatsHandler.getSneakSpeedMultiplier(a1)).toBe(0.5);
    expect(FeatsHandler.getSneakSpeedMultiplier(a2)).toBe(1.0);
    expect(FeatsHandler.getSneakSpeedMultiplier(a3)).toBe(1.0);
  });

  test('getSneakDistanceBonusFeet: +5 with very-sneaky', async () => {
    const { FeatsHandler } = await import('../../../scripts/chat/services/feats-handler.js');
    const a1 = actorWithSpeedAndFeats(25, []);
    const a2 = actorWithSpeedAndFeats(25, ['very-sneaky']);

    expect(FeatsHandler.getSneakDistanceBonusFeet(a1)).toBe(0);
    expect(FeatsHandler.getSneakDistanceBonusFeet(a2)).toBe(5);
  });

  test('getSneakMaxDistanceFeet: halved rounding + bonus, capped and rounded down to 5 ft', async () => {
    const service = await importService();

    // Base: 30 ft speed, no feats -> 15
    const a1 = actorWithSpeedAndFeats(30, []);
    expect(await service.SneakSpeedService.getSneakMaxDistanceFeet(a1)).toBe(15);

    // Very sneaky: +5 ft bonus -> 20
    const a2 = actorWithSpeedAndFeats(30, ['very-sneaky']);
    expect(await service.SneakSpeedService.getSneakMaxDistanceFeet(a2)).toBe(20);

    // Full speed feats: multiplier 1.0, bonus 0 -> 30
    const a3 = actorWithSpeedAndFeats(30, ['legendary-sneak']);
    expect(await service.SneakSpeedService.getSneakMaxDistanceFeet(a3)).toBe(30);

    // Full speed + very-sneaky should cap at base speed -> 30
    const a4 = actorWithSpeedAndFeats(30, ['swift-sneak', 'very-sneaky']);
    expect(await service.SneakSpeedService.getSneakMaxDistanceFeet(a4)).toBe(30);

    // Non-integer: 25 speed -> floor(12.5)=12 +5 =17; cap 25; then round down to nearest 5 -> 15
    const a5 = actorWithSpeedAndFeats(25, ['very-sneaky']);
    expect(await service.SneakSpeedService.getSneakMaxDistanceFeet(a5)).toBe(15);
  });

  test('applySneakWalkSpeed skips effect/flags when multiplier is 1.0', async () => {
    const service = await importService();

    const actor = actorWithSpeedAndFeats(30, ['legendary-sneak']);
    const token = { actor };

    await service.SneakSpeedService.applySneakWalkSpeed(token);
    // With multiplier 1.0, method should return before storing original speed or updating
    expect(actor.update).not.toHaveBeenCalled();
  });
});
