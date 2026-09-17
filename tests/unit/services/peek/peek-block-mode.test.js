import {
  inferPeekKind,
  isPeekKindBlocked,
  nextPeekBlockMode,
  normalizePeekBlockMode,
  peekBlockModePresentation,
  syncPeekBlockSceneToolElement,
} from '../../../../scripts/services/Peek/peek-block-mode.js';

describe('peek block modes', () => {
  test('cycles through none, corner, door, both, then none', () => {
    expect(nextPeekBlockMode('none')).toBe('corner');
    expect(nextPeekBlockMode('corner')).toBe('door');
    expect(nextPeekBlockMode('door')).toBe('both');
    expect(nextPeekBlockMode('both')).toBe('none');
  });

  test('normalizes unknown values to none', () => {
    expect(normalizePeekBlockMode(true)).toBe('none');
    expect(normalizePeekBlockMode('unknown')).toBe('none');
  });

  test('returns distinct toolbar presentation for every state', () => {
    expect(new Set(['none', 'corner', 'door', 'both'].map((mode) => peekBlockModePresentation(mode).icon))).toHaveProperty('size', 4);
    expect(peekBlockModePresentation('none').title).toBe('PF2E_VISIONER.PEEK.BLOCK_MODE_NONE');
    expect(peekBlockModePresentation('both').title).toBe('PF2E_VISIONER.PEEK.BLOCK_MODE_BOTH');
    expect(peekBlockModePresentation('none').active).toBe(false);
    expect(peekBlockModePresentation('corner').active).toBe(true);
    expect(peekBlockModePresentation('door').active).toBe(true);
    expect(peekBlockModePresentation('both').active).toBe(true);
  });

  test('colors the rendered toolbar button only while a peek mode is blocked', () => {
    document.body.innerHTML = `
      <nav id="scene-controls">
        <button data-tool="pf2e-visioner-block-player-peek"></button>
      </nav>`;
    const button = document.querySelector('[data-tool="pf2e-visioner-block-player-peek"]');

    for (const mode of ['corner', 'door', 'both']) {
      syncPeekBlockSceneToolElement(mode);
      expect(button.classList.contains('pf2e-visioner-peek-locked')).toBe(true);
    }

    syncPeekBlockSceneToolElement('none');
    expect(button.classList.contains('pf2e-visioner-peek-locked')).toBe(false);
  });

  test.each([
    ['none', false, false],
    ['corner', true, false],
    ['door', false, true],
    ['both', true, true],
  ])('%s blocks expected peek kinds', (mode, corner, door) => {
    expect(isPeekKindBlocked(mode, 'corner')).toBe(corner);
    expect(isPeekKindBlocked(mode, 'door')).toBe(door);
  });

  test('infers door peeks from ignored wall IDs', () => {
    expect(inferPeekKind({ ignoredWallIds: [] })).toBe('corner');
    expect(inferPeekKind({ ignoredWallIds: ['door1'] })).toBe('door');
  });
});
