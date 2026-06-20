import '../../setup.js';
import { SeekActionHandler } from '../../../scripts/chat/services/actions/SeekAction.js';

describe('SeekActionHandler apply', () => {
  function makeObserver() {
    return global.createMockToken({
      id: 'observer',
      name: 'Observer',
      actor: global.createMockActor({
        id: 'observer-actor',
        type: 'character',
        alliance: 'party',
      }),
    });
  }

  function makeLootWithoutConfiguredStealthDc() {
    return global.createMockToken({
      id: 'loot',
      name: 'Hidden Loot',
      actor: global.createMockActor({
        id: 'loot-actor',
        type: 'loot',
      }),
    });
  }

  test('applies hidden loot reveal when the row used the default loot DC', async () => {
    const observer = makeObserver();
    const loot = makeLootWithoutConfiguredStealthDc();
    const handler = new SeekActionHandler();
    const button = { html: jest.fn().mockReturnThis(), attr: jest.fn().mockReturnThis() };

    handler.ensurePrerequisites = jest.fn(async () => undefined);
    handler.discoverSubjects = jest.fn(async () => [loot]);
    handler.analyzeOutcome = jest.fn(async () => ({
      target: loot,
      oldVisibility: 'hidden',
      currentVisibility: 'hidden',
      newVisibility: 'observed',
      outcome: 'critical-success',
      dc: 15,
      changed: true,
    }));
    handler.applyChangesInternal = jest.fn(async () => undefined);
    handler.cacheAfterApply = jest.fn();

    const applied = await handler.apply(
      {
        actionType: 'seek',
        actor: observer,
        actorToken: observer,
        roll: { total: 44 },
        overrides: { loot: 'observed' },
      },
      button,
    );

    expect(applied).toBe(1);
    expect(handler.applyChangesInternal).toHaveBeenCalledWith([
      expect.objectContaining({
        observer,
        target: loot,
        oldVisibility: 'hidden',
        newVisibility: 'observed',
      }),
    ]);
  });

  test('uses precomputed dialog outcomes for row apply without rediscovering every seek subject', async () => {
    const observer = makeObserver();
    const loot = makeLootWithoutConfiguredStealthDc();
    const handler = new SeekActionHandler();

    handler.ensurePrerequisites = jest.fn(async () => undefined);
    handler.discoverSubjects = jest.fn(async () => {
      throw new Error('row apply should not rediscover subjects');
    });
    handler.analyzeOutcome = jest.fn();
    handler.applyChangesInternal = jest.fn(async () => undefined);
    handler.cacheAfterApply = jest.fn();

    const applied = await handler.apply(
      {
        actionType: 'seek',
        actor: observer,
        actorToken: observer,
        roll: { total: 44 },
        overrides: { loot: 'observed' },
        seekPrecomputedOutcomes: [
          {
            target: loot,
            oldVisibility: 'hidden',
            currentVisibility: 'hidden',
            newVisibility: 'observed',
            outcome: 'critical-success',
            dc: 15,
            changed: true,
            hasActionableChange: true,
          },
        ],
      },
      { html: jest.fn().mockReturnThis(), attr: jest.fn().mockReturnThis() },
    );

    expect(applied).toBe(1);
    expect(handler.discoverSubjects).not.toHaveBeenCalled();
    expect(handler.analyzeOutcome).not.toHaveBeenCalled();
  });
});
