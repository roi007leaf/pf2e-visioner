import {
  lineThroughTarget,
  pointsOnOppositeSides,
  segmentLiesOnEdge,
} from '../services/flanking/flanking-size-rule.js';

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

const RULE_POINTS = {
  raw: 'center',
  anySquare: 'squares',
  anyCorner: 'corners',
  lineThrough: 'center',
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

function boundsOf(rect) {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.w,
    height: rect.h,
    left: rect.x,
    top: rect.y,
    right: rect.x + rect.w,
    bottom: rect.y + rect.h,
  };
}

function pairPasses(rule, from, to) {
  const target = boundsOf(SCENE.target);
  if (rule === 'lineThrough') return lineThroughTarget(boundsOf(SCENE.flanker), boundsOf(SCENE.ally), target);
  if (rule === 'anyCorner' && segmentLiesOnEdge(from, to, target)) return false;
  return pointsOnOppositeSides(from, to, target);
}

function candidateLines(rule) {
  const mode = RULE_POINTS[rule];
  const lines = [];
  for (const from of candidatePoints(SCENE.flanker, mode)) {
    for (const to of candidatePoints(SCENE.ally, mode)) {
      lines.push({ from, to, pass: pairPasses(rule, from, to) });
    }
  }
  return lines;
}

function lineSvg({ from, to, pass }) {
  const cls = pass ? 'pv-dg-line pv-dg-pass' : 'pv-dg-line pv-dg-fail';
  return `<line class="${cls}" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}"/>`;
}

function linesSvg(lines) {
  const failing = lines.filter((l) => !l.pass).map(lineSvg);
  const passing = lines.filter((l) => l.pass).map(lineSvg);
  const dots = new Set();
  for (const { from, to } of lines) dots.add(dot(from)).add(dot(to));
  return [...failing, ...passing, ...dots].join('');
}

function badge(flanked) {
  const text = localize(`${DIAGRAM_KEY}.${flanked ? 'flanked' : 'notFlanked'}`);
  const cls = flanked ? 'pv-dg-badge pv-dg-pass' : 'pv-dg-badge pv-dg-fail';
  return `<text class="${cls}" x="${COLS * CELL - 10}" y="${ROWS * CELL - 14}" text-anchor="end">${text}</text>`;
}

function sceneSvg(rule, lines) {
  return [
    `<svg class="pv-dg" viewBox="0 0 ${COLS * CELL} ${ROWS * CELL}" xmlns="http://www.w3.org/2000/svg" role="img">`,
    gridLines(),
    box(SCENE.ally, 'pv-dg-ally'),
    box(SCENE.flanker, 'pv-dg-ally'),
    box(SCENE.target, 'pv-dg-target'),
    linesSvg(lines),
    badge(lines.some((l) => l.pass)),
    '</svg>',
  ].join('');
}

export function buildFlankingIllustrations() {
  return Object.keys(RULE_POINTS).map((value) => {
    const lines = candidateLines(value);
    return {
      value,
      label: `${CHOICE_KEY}.${value}`,
      flanked: lines.some((l) => l.pass),
      svg: sceneSvg(value, lines),
    };
  });
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
