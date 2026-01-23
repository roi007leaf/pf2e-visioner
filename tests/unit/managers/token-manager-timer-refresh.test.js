import '../../setup.js';

import { VisionerTokenManager } from '../../../scripts/managers/token-manager/TokenManager.js';

describe('VisionerTokenManager timer refresh', () => {
  test('updates active timer row + badge tooltip without rerender', async () => {
    const realNow = 1_000_000;
    let now = realNow;
    jest.spyOn(Date, 'now').mockImplementation(() => now);

    global.game.i18n.format.mockImplementation((key, data = {}) => {
      if (data.time !== undefined) return `${key}:${data.time}`;
      if (data.count !== undefined) return `${key}:${data.count}`;
      return key;
    });

    const observer = createMockToken({
      id: 'observer-1',
      actor: createMockActor({ type: 'character', hasPlayerOwner: true }),
      isOwner: true,
    });

    const expiresAt = now + 65_000;
    const target = createMockToken({
      id: 'target-1',
      actor: createMockActor({ type: 'npc' }),
      flags: {
        'pf2e-visioner': {
          'avs-override-from-observer-1': {
            observerName: 'Observer',
            targetName: 'Target',
            state: 'hidden',
            timedOverride: { type: 'realtime', expiresAt },
            source: 'manual_action',
          },
        },
      },
    });

    global.canvas.tokens.placeables = [observer, target];

    const manager = new VisionerTokenManager(observer);
    manager.rendered = true;
    manager.element = document.createElement('div');

    const row = document.createElement('div');
    row.className = 'timer-row';
    row.dataset.observerId = observer.document.id;
    row.dataset.targetId = target.document.id;
    const display = document.createElement('span');
    display.className = 'timer-display';
    display.textContent = 'init';
    row.appendChild(display);

    const badge = document.createElement('span');
    badge.className = 'timer-badge';
    badge.dataset.observerId = observer.document.id;
    badge.dataset.targetId = target.document.id;
    badge.dataset.tooltip = 'init';

    manager.element.appendChild(row);
    manager.element.appendChild(badge);

    await manager._updateTimerDisplays();
    expect(display.textContent).toContain('1m 5s');
    expect(badge.dataset.tooltip).toContain('1m 5s');

    now += 1_000;
    await manager._updateTimerDisplays();
    expect(display.textContent).toContain('1m 4s');
    expect(badge.dataset.tooltip).toContain('1m 4s');
  });

  test('updates when element null but window.element exists', async () => {
    const realNow = 2_000_000;
    let now = realNow;
    jest.spyOn(Date, 'now').mockImplementation(() => now);

    global.game.i18n.format.mockImplementation((key, data = {}) => {
      if (data.time !== undefined) return `${key}:${data.time}`;
      return key;
    });

    const observer = createMockToken({
      id: 'observer-1',
      actor: createMockActor({ type: 'character', hasPlayerOwner: true }),
      isOwner: true,
    });

    const expiresAt = now + 30_000;
    const target = createMockToken({
      id: 'target-1',
      actor: createMockActor({ type: 'npc' }),
      flags: {
        'pf2e-visioner': {
          'avs-override-from-observer-1': {
            observerName: 'Observer',
            targetName: 'Target',
            state: 'hidden',
            timedOverride: { type: 'realtime', expiresAt },
            source: 'manual_action',
          },
        },
      },
    });

    global.canvas.tokens.placeables = [observer, target];

    const manager = new VisionerTokenManager(observer);
    manager.rendered = true;
    manager.element = null;
    manager.window = { element: document.createElement('div') };

    const row = document.createElement('div');
    row.className = 'timer-row';
    row.dataset.observerId = observer.document.id;
    row.dataset.targetId = target.document.id;
    const display = document.createElement('span');
    display.className = 'timer-display';
    display.textContent = 'init';
    row.appendChild(display);
    manager.window.element.appendChild(row);

    await manager._updateTimerDisplays();
    expect(display.textContent).toContain('30s');

    now += 1_000;
    await manager._updateTimerDisplays();
    expect(display.textContent).toContain('29s');
  });

  test('does not update while game paused', async () => {
    const realNow = 3_000_000;
    let now = realNow;
    jest.spyOn(Date, 'now').mockImplementation(() => now);

    global.game.paused = true;
    global.game.i18n.format.mockImplementation((key, data = {}) => {
      if (data.time !== undefined) return `${key}:${data.time}`;
      return key;
    });

    const observer = createMockToken({
      id: 'observer-1',
      actor: createMockActor({ type: 'character', hasPlayerOwner: true }),
      isOwner: true,
    });

    const expiresAt = now + 5_000;
    const target = createMockToken({
      id: 'target-1',
      actor: createMockActor({ type: 'npc' }),
      flags: {
        'pf2e-visioner': {
          'avs-override-from-observer-1': {
            observerName: 'Observer',
            targetName: 'Target',
            state: 'hidden',
            timedOverride: { type: 'realtime', expiresAt },
            source: 'manual_action',
          },
        },
      },
    });

    global.canvas.tokens.placeables = [observer, target];

    const manager = new VisionerTokenManager(observer);
    manager.rendered = true;
    manager.element = document.createElement('div');

    const row = document.createElement('div');
    row.className = 'timer-row';
    row.dataset.observerId = observer.document.id;
    row.dataset.targetId = target.document.id;
    const display = document.createElement('span');
    display.className = 'timer-display';
    row.appendChild(display);
    manager.element.appendChild(row);

    await manager._updateTimerDisplays();
    expect(display.textContent).toBe('');

    now += 1_000;
    await manager._updateTimerDisplays();
    expect(display.textContent).toBe('');
  });
});
