export const PEEK_BLOCK_MODES = Object.freeze(['none', 'corner', 'door', 'both']);

const PEEK_BLOCK_MODE_PRESENTATIONS = Object.freeze({
  none: { icon: 'fa-solid fa-eye', title: 'PF2E_VISIONER.PEEK.BLOCK_MODE_NONE' },
  corner: { icon: 'fa-solid fa-turn-down', title: 'PF2E_VISIONER.PEEK.BLOCK_MODE_CORNER' },
  door: { icon: 'fa-solid fa-door-closed', title: 'PF2E_VISIONER.PEEK.BLOCK_MODE_DOOR' },
  both: { icon: 'fa-solid fa-lock', title: 'PF2E_VISIONER.PEEK.BLOCK_MODE_BOTH' },
});

export function normalizePeekBlockMode(value) {
  return PEEK_BLOCK_MODES.includes(value) ? value : 'none';
}

export function nextPeekBlockMode(value) {
  const current = normalizePeekBlockMode(value);
  return PEEK_BLOCK_MODES[(PEEK_BLOCK_MODES.indexOf(current) + 1) % PEEK_BLOCK_MODES.length];
}

export function peekBlockModePresentation(value) {
  const mode = normalizePeekBlockMode(value);
  return { ...PEEK_BLOCK_MODE_PRESENTATIONS[mode], active: mode !== 'none' };
}

export function syncPeekBlockSceneToolElement(mode, { root = globalThis.document } = {}) {
  const locked = normalizePeekBlockMode(mode) !== 'none';
  const selector =
    '#scene-controls [data-tool="pf2e-visioner-block-player-peek"], ' +
    '#scene-controls [data-action="pf2e-visioner-block-player-peek"]';
  const elements = root?.querySelectorAll?.(selector) ?? [];
  for (const element of elements) {
    element.classList?.toggle?.('pf2e-visioner-peek-locked', locked);
  }
  return elements.length;
}

export function refreshPeekBlockSceneTool(
  mode,
  { controls = globalThis.ui?.controls, localize = globalThis.game?.i18n?.localize } = {},
) {
  const tools = controls?.controls?.tokens?.tools ?? controls?.controls?.token?.tools;
  const tool = Array.isArray(tools)
    ? tools.find((candidate) => candidate?.name === 'pf2e-visioner-block-player-peek')
    : tools?.['pf2e-visioner-block-player-peek'];
  if (!tool) return false;

  const presentation = peekBlockModePresentation(mode);
  tool.title = localize?.(presentation.title) ?? presentation.title;
  tool.icon = presentation.icon;
  tool.active = presentation.active;
  syncPeekBlockSceneToolElement(mode);
  controls.render?.(true);
  return true;
}

export function isPeekKindBlocked(mode, kind) {
  const normalized = normalizePeekBlockMode(mode);
  return normalized === 'both' || normalized === kind;
}

export function inferPeekKind(peek) {
  return Array.isArray(peek?.ignoredWallIds) && peek.ignoredWallIds.length > 0 ? 'door' : 'corner';
}
