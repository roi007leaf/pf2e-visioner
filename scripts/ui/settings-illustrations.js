const CHOICE_KEY = 'PF2E_VISIONER.SETTINGS.FLANKING_SIZE_RULE.CHOICES';
const DIAGRAM_KEY = 'PF2E_VISIONER.SETTINGS.FLANKING_SIZE_RULE.DIAGRAM';

const CELL = 100;
const COLS = 4;
const ROWS = 4;

const SCENE = {
  ally: { x: 0, y: 0, w: 200, h: 200 },
  target: { x: 100, y: 200, w: 100, h: 100 },
  flanker: { x: 200, y: 300, w: 100, h: 100 },
};

const RULE_LINES = {
  raw: { from: { x: 100, y: 100 }, to: { x: 250, y: 350 }, flanked: false, dots: 'center' },
  anySquare: { from: { x: 50, y: 150 }, to: { x: 250, y: 350 }, flanked: true, dots: 'squares' },
  anyCorner: { from: { x: 0, y: 200 }, to: { x: 300, y: 300 }, flanked: true, dots: 'corners' },
  lineThrough: { from: { x: 100, y: 100 }, to: { x: 250, y: 350 }, flanked: true, dots: 'center' },
};

function localize(key) {
  return globalThis.game?.i18n?.localize?.(key) ?? key;
}

function gridLines() {
  const lines = [];
  for (let i = 0; i <= COLS; i++) {
    lines.push(`<line class="pv-dg-grid" x1="${i * CELL}" y1="0" x2="${i * CELL}" y2="${ROWS * CELL}"/>`);
  }
  for (let i = 0; i <= ROWS; i++) {
    lines.push(`<line class="pv-dg-grid" x1="0" y1="${i * CELL}" x2="${COLS * CELL}" y2="${i * CELL}"/>`);
  }
  return lines.join('');
}

function box(rect, cls) {
  return `<rect class="${cls}" x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" rx="8"/>`;
}

function dot(p, cls = 'pv-dg-dot') {
  return `<circle class="${cls}" cx="${p.x}" cy="${p.y}" r="7"/>`;
}

function centerOf(rect) {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

function squareCenters(rect) {
  const points = [];
  for (let y = rect.y + CELL / 2; y < rect.y + rect.h; y += CELL) {
    for (let x = rect.x + CELL / 2; x < rect.x + rect.w; x += CELL) points.push({ x, y });
  }
  return points;
}

function corners(rect) {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.w, y: rect.y },
    { x: rect.x, y: rect.y + rect.h },
    { x: rect.x + rect.w, y: rect.y + rect.h },
  ];
}

function candidatePoints(rect, mode) {
  if (mode === 'squares') return squareCenters(rect);
  if (mode === 'corners') return corners(rect);
  return [centerOf(rect)];
}

function candidateDots(mode) {
  return [...candidatePoints(SCENE.ally, mode), ...candidatePoints(SCENE.flanker, mode)]
    .map((p) => dot(p, 'pv-dg-candidate'))
    .join('');
}

function flankLine({ from, to, flanked }) {
  const cls = flanked ? 'pv-dg-line pv-dg-pass' : 'pv-dg-line pv-dg-fail';
  return `<line class="${cls}" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}"/>${dot(from)}${dot(to)}`;
}

function badge(flanked) {
  const text = localize(`${DIAGRAM_KEY}.${flanked ? 'flanked' : 'notFlanked'}`);
  const cls = flanked ? 'pv-dg-badge pv-dg-pass' : 'pv-dg-badge pv-dg-fail';
  return `<text class="${cls}" x="${COLS * CELL - 10}" y="${ROWS * CELL - 14}" text-anchor="end">${text}</text>`;
}

function sceneSvg(rule) {
  const spec = RULE_LINES[rule];
  return [
    `<svg class="pv-dg" viewBox="0 0 ${COLS * CELL} ${ROWS * CELL}" xmlns="http://www.w3.org/2000/svg" role="img">`,
    gridLines(),
    box(SCENE.ally, 'pv-dg-ally'),
    box(SCENE.flanker, 'pv-dg-ally'),
    box(SCENE.target, 'pv-dg-target'),
    candidateDots(spec.dots),
    flankLine(spec),
    badge(spec.flanked),
    '</svg>',
  ].join('');
}

export function buildFlankingIllustrations() {
  return Object.keys(RULE_LINES).map((value) => ({
    value,
    label: `${CHOICE_KEY}.${value}`,
    flanked: RULE_LINES[value].flanked,
    svg: sceneSvg(value),
  }));
}

const BUILDERS = {
  flankingSizeRule: buildFlankingIllustrations,
};

export function buildSettingIllustrations(config, currentValue) {
  const builder = BUILDERS[config?.illustration];
  if (!builder) return null;
  return builder().map((card) => ({
    ...card,
    selected: String(card.value) === String(currentValue),
  }));
}
