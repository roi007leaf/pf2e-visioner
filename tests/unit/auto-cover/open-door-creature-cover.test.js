import '../../setup.js';
import { CoverDetector } from '../../../scripts/cover/auto-cover/CoverDetector.js';

describe('Open doorway with an intervening creature', () => {
  let detector;
  let attacker;
  let target;
  let door;

  beforeEach(() => {
    detector = new CoverDetector();
    attacker = createMockToken({ id: 'attacker', x: 75, y: 0, center: { x: 100, y: 25 } });
    target = createMockToken({
      id: 'cyclops',
      x: 50,
      y: 200,
      width: 2,
      height: 2,
      center: { x: 100, y: 250 },
      actorSystem: { traits: { size: { value: 'lg' } } },
    });
    const creature = createMockToken({ id: 'creature', x: 75, y: 75, center: { x: 100, y: 100 } });
    door = {
      document: {
        id: 'door',
        c: [50, 150, 150, 150],
        sight: 20,
        door: 1,
        ds: 1,
        dir: 0,
        getFlag: jest.fn(() => null),
      },
    };
    canvas.tokens = { placeables: [attacker, target, creature], controlled: [] };
    canvas.walls = { placeables: [door], objects: { children: [door] } };
    game.settings.get = jest.fn(
      (module, key) =>
        ({
          autoCoverTokenIntersectionMode: 'any',
          autoCoverAllowProneBlockers: true,
          wallCoverStandardThreshold: 50,
          wallCoverGreaterThreshold: 70,
          wallCoverAllowGreater: false,
        })[key] ?? false,
    );
  });

  test.each(['any', 'length10', 'tactical', 'coverage'])(
    '%s: opening a door matches the result with that door removed',
    (mode) => {
      const settings = game.settings.get;
      game.settings.get = jest.fn((module, key) =>
        key === 'autoCoverTokenIntersectionMode' ? mode : settings(module, key),
      );
      door.document.ds = 0;
      expect(detector.detectBetweenTokens(attacker, target)).toBe('standard');
      door.document.ds = 1;
      const openCover = detector.detectBetweenTokens(attacker, target);
      canvas.walls.placeables = [];
      canvas.walls.objects.children = [];
      expect(detector.detectBetweenTokens(attacker, target)).toBe(openCover);
      if (mode === 'any' || mode === 'length10') expect(openCover).toBe('lesser');
      canvas.walls.placeables = [door];
      canvas.walls.objects.children = [door];
      canvas.tokens.placeables = [attacker, target];
      expect(detector.detectBetweenTokens(attacker, target)).toBe('none');
    },
  );

  test('an open door ignores its Standard Cover override', () => {
    door.document.getFlag.mockReturnValue('standard');
    expect(detector.detectBetweenTokens(attacker, target)).toBe('lesser');
  });

  test.each(['any', 'length10', 'tactical', 'coverage'])(
    '%s: room walls crossing the large target footprint do not add wall cover',
    (mode) => {
      const settings = game.settings.get;
      game.settings.get = jest.fn((module, key) =>
        key === 'autoCoverTokenIntersectionMode' ? mode : settings(module, key),
      );
      const creatureCover = detector.detectBetweenTokens(attacker, target);
      // Narrow room walls cut through the outer parts of the Large token's square.
      const walls = [
        door,
        ...[
          [70, 150, 70, 310],
          [130, 150, 130, 310],
          [70, 270, 130, 270],
        ].map((c, i) => ({
          document: {
            id: `room-wall-${i}`,
            c,
            sight: 20,
            door: 0,
            dir: 0,
            getFlag: () => null,
          },
        })),
      ];
      canvas.walls.placeables = walls;
      canvas.walls.objects.children = walls;
      expect(detector.detectBetweenTokens(attacker, target)).toBe(creatureCover);
      canvas.tokens.placeables = [attacker, target];
      expect(detector.detectBetweenTokens(attacker, target)).toBe('none');
      canvas.walls.placeables = walls.slice(1);
      canvas.walls.objects.children = walls.slice(1);
      expect(detector.detectBetweenTokens(attacker, target)).toBe('none');
      door.document.ds = 0;
      canvas.walls.placeables = walls;
      canvas.walls.objects.children = walls;
      expect(detector.detectBetweenTokens(attacker, target)).toBe('standard');
    },
  );
});
