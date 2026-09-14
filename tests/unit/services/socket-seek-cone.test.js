import { registerSocket } from '../../../scripts/services/socket.js';

describe('player Seek cone socket handoff', () => {
  let originals;
  beforeEach(() => {
    originals = { game: global.game, canvas: global.canvas, socketlib: global.socketlib };
    jest.useFakeTimers();
  });
  afterEach(() => {
    Object.assign(global, originals);
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test.each([[0, true], [180, false]])('cone direction %s determines GM target availability', async (direction, expected) => {
    const handlers = {};
    global.socketlib = { registerModule: () => ({ register: (name, handler) => { handlers[name] = handler; } }) };
    const seeker = { id: 'seeker', actor: {}, center: { x: 450, y: 550 } };
    const target = { id: 'target', actor: {}, center: { x: 850, y: 550 } };
    const message = { update: jest.fn(async () => {}), render: jest.fn() };
    global.game = { user: { isGM: true }, messages: { get: () => message }, users: { get: () => null } };
    global.canvas = { scene: { grid: { size: 100, distance: 5 }, templates: [] },
      grid: { size: 100, distance: 5 }, walls: { placeables: [] },
      tokens: { get: () => seeker, placeables: [seeker, target] }, templates: { placeables: [] } };
    registerSocket();
    await handlers.SeekTemplate({ actorTokenId: 'seeker', center: { x: 650, y: 550 }, radiusFeet: 30,
      messageId: 'roll', rollTotal: 25, dieResult: 20, templateType: 'cone', geometry: { direction, angle: 90 }, userId: 'player' });
    expect(message.update).toHaveBeenCalledWith({ 'flags.pf2e-visioner.seekTemplate': expect.objectContaining({
      hasTargets: expected, geometry: { direction, angle: 90 }, fromUserId: 'player',
    }) });
  });
});
