/**
 * Regression tests: Token Manager creates AVS overrides on manual changes
 */

import '../setup.js';

import { VisionerTokenManager } from '../../scripts/managers/token-manager/token-manager.js';

// We'll spy on AvsOverrideManager.applyOverrides via dynamic import resolution
jest.mock(
  '../../scripts/chat/services/infra/avs-override-manager.js',
  () => ({
    __esModule: true,
    default: {
      applyOverrides: jest.fn().mockResolvedValue(true),
    },
  }),
  { virtual: true },
);

// helper removed - not needed when mocking AvsOverrideManager

describe('Token Manager AVS override creation', () => {
  let observer, targetA, targetB;

  beforeEach(() => {
    observer = createMockToken({ id: 'observer-1', actor: createMockActor({ type: 'character' }), isOwner: true });
    targetA = createMockToken({ id: 'target-A', actor: createMockActor({ type: 'npc' }) });
    targetB = createMockToken({ id: 'target-B', actor: createMockActor({ type: 'npc' }) });

    // Seed canvas tokens
    global.canvas.tokens.placeables = [observer, targetA, targetB];
  });

  test('applyCurrent in observer mode creates overrides (manual_action)', async () => {
    const manager = new VisionerTokenManager(observer);
    manager.mode = 'observer';
    manager.activeTab = 'visibility';

    // Mock form inputs read by applyCurrent
    const visibilityInputs = [
      { name: `visibility.${targetA.id}`, value: 'hidden' },
      { name: `visibility.${targetB.id}`, value: 'concealed' },
    ];
    const coverInputs = [
      { name: `cover.${targetA.id}`, value: 'standard' },
      { name: `cover.${targetB.id}`, value: 'none' },
    ];

    manager.element = {
      querySelectorAll: jest.fn((selector) => {
        if (selector.includes('visibility.')) return visibilityInputs;
        if (selector.includes('cover.')) return coverInputs;
        if (selector.includes('walls.')) return [];
        return [];
      }),
    };

    manager.close = jest.fn();

  await VisionerTokenManager.applyCurrent.call(manager, {}, {});

  // Verify dynamic import spy was called with manual_action source and correct observer
  const avs = await import('../../scripts/chat/services/infra/avs-override-manager.js');
  expect(avs.default.applyOverrides).toHaveBeenCalledTimes(1);
  const [observerArg, mapArg, optionsArg] = avs.default.applyOverrides.mock.calls[0];
  expect(observerArg).toBe(observer);
  expect(optionsArg?.source).toBe('manual_action');
  // Map should include both targets with expected states
  const entries = Array.from(mapArg.entries());
  const byId = Object.fromEntries(entries.map(([id, v]) => [id, v.state]));
  expect(byId[targetA.id]).toBe('hidden');
  expect(byId[targetB.id]).toBe('concealed');
  });

  test('applyCurrent in target mode creates overrides (manual_action)', async () => {
    const manager = new VisionerTokenManager(observer);
    manager.mode = 'target';
    manager.activeTab = 'visibility';

    // In target mode, visibility map is keyed by observer token ids
    const visibilityInputs = [
      { name: `visibility.${targetA.id}`, value: 'hidden' },
      { name: `visibility.${targetB.id}`, value: 'observed' },
    ];

    manager.element = {
      querySelectorAll: jest.fn((selector) => {
        if (selector.includes('visibility.')) return visibilityInputs;
        if (selector.includes('cover.')) return [];
        if (selector.includes('walls.')) return [];
        return [];
      }),
    };

    manager.close = jest.fn();

  await VisionerTokenManager.applyCurrent.call(manager, {}, {});

  // Verify dynamic import spy was called at least once, with manual_action
  const avs = await import('../../scripts/chat/services/infra/avs-override-manager.js');
  expect(avs.default.applyOverrides).toHaveBeenCalled();
  const someCallHasManual = avs.default.applyOverrides.mock.calls.some(([, , opts]) => opts?.source === 'manual_action');
  expect(someCallHasManual).toBe(true);
  });
});
