// Former hands-on scenarios, now executed by registered workflows. Every
// workflow records assertions; prerequisites block rather than asking a verdict.
const scenario = (name, workflow, options = {}) => ({ name, area: options.area ?? 'workflow',
  camera: { x: 900, y: 550, scale: 0.7 }, ...options, steps: [{ workflow }] });
export const automatedCases = [
  scenario('manager-directions', 'manager-directions', { area: 'manager', secondObserver: true }),
  scenario('drag-preview', 'drag-preview', { area: 'movement' }),
  scenario('combat-wall-turn-movement', 'combat-wall-turn-movement', { area: 'movement', camera: { x: 650, y: 750, scale: 0.6 } }),
  scenario('hearing-tremorsense-rendered-transitions', 'indicator-transitions', { area: 'senses', senses: [] }),
  scenario('gm-observer-hidden-concealed-rendering', 'gm-observer-hidden-concealed-rendering', {
    area: 'rendering', senses: [], darkness: true,
  }),
  scenario('scent-preserves-rendered-background-tile', 'tile-presence-pixels', { area: 'rendering', senses: ['scent'] }),
  scenario('levels-pillar', 'levels-pillar', { area: 'levels', environment: { core: 14 } }),
  scenario('levels-surfaces-floor-occlusion', 'floor-occlusion', { area: 'levels', environment: { core: 14 } }),
  ...['hide', 'sneak', 'seek'].map(action => scenario(`${action}-apply-revert`, `action-${action}`, { area: 'actions' })),
  scenario('attack-consequences', 'attack-consequences', { area: 'actions' }),
  ...['hidden', 'undetected'].map(state => scenario(`attack-consequences-${state}`, `attack-consequences-${state}`, { area: 'actions' })),
  scenario('diversion-apply-revert', 'diversion', { area: 'actions' }),
  scenario('point-out-apply-revert', 'point-out', { area: 'actions', secondObserver: true }),
  scenario('take-cover-expiry', 'take-cover', { area: 'cover' }),
  ...['wall', 'tile'].map(type => scenario(`${type}-cover-controls`, `${type}-cover`, { area: 'cover', requireSettings: { autoCover: true } })),
  ...['hazard', 'loot'].map(targetType => scenario(`${targetType}-manager-privacy`, 'hazard-loot', { area: 'hazards-loot', targetType, observerType: 'character' })),
  scenario('region-visibility', 'region-visibility', { area: 'regions', camera: { x: 1150, y: 900, scale: 0.6 } }),
  scenario('rule-elements-lifecycle', 'rule-elements', { area: 'rule-elements' }),
  scenario('rule-strike-consumption', 'rule-strike', { area: 'rule-elements' }),
  scenario('rule-native-strike-off-guard', 'strike-off-guard', { area: 'rule-elements', requireSettings: { autoCover: true } }),
  scenario('feats-shared-vision', 'shared-vision', { area: 'feats', secondObserver: true }),
  scenario('sniping-duo-creature-cover', 'sniping-duo-cover', { area: 'feats', secondObserver: true, observerType: 'character', observerLevel: 8, requireSettings: { autoCover: true } }),
  scenario('search-exploration', 'search-exploration', { area: 'exploration', observerType: 'character' }),
  scenario('search-exploration-unnoticed', 'search-unnoticed', { area: 'exploration', observerType: 'character' }),
  scenario('settings-macros', 'settings-macros', { area: 'configuration' }),
  scenario('stealth-initiative-eligibility', 'stealth-initiative', {
    area: 'initiative', secondObserver: true, targetType: 'character', targetLevel: 15,
  }),
  scenario('stealth-initiative-manual-states', 'stealth-initiative-manual-states', {
    area: 'initiative', targetType: 'npc',
  }),
  ...['terrain-stalker', 'camouflage', 'vanish-into-the-land', 'distracting-shadows', 'keen-eyes', 'thats-odd', 'very-sneaky', 'sneaky', 'deny-advantage'].map(slug =>
    scenario(`feat-context-${slug}`, `feat-${slug}`, { area: 'feats', secondObserver: true, observerType: 'character', observerLevel: 8 })),
  ...[14].map(core => scenario(`compatibility-foundry${core}-pf2e`, 'compatibility', { area: 'compatibility', environment: { core } })),
  scenario('socket-reconnect-gm-handover', 'gm-handover', { area: 'lifecycle', disposableWorld: true, secondGm: true }),
];
