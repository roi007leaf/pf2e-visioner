const observed = { expect: { state: 'observed', filter: null, fixtureEffects: 0 }, art: true };
const visibility = state => ({ type: 'overrideVisibility', state, direction: 'from', observers: 'all' });

export const itemRoleCases = [
  ...['undetected', 'unnoticed'].map(state => ({
    name: `gm-player-${state}-tooltip-permissions`, area: 'privacy', steps: [
      { operation: 'gm-observer-view', value: true },
      { operation: 'state', value: state, expect: { state } },
      { operation: 'cover', value: 'standard' },
      { session: 'gm', key: 'o', expect: { visible: true, visibilityBadge: true } },
      { session: 'gm', key: 'g', expect: { coverBadge: true } },
      { key: 'o', expect: { visibilityBadge: false }, art: false },
      { key: 'g', expect: { coverBadge: false }, art: false },
    ],
  })),
  ...['concealed', 'hidden', 'undetected'].map(state => ({
    name: `rule-visibility-${state}-delete`, area: 'rule-elements', steps: [
      observed,
      { operation: 'effect-add', value: { id: 'visibility', operations: [visibility(state)] }, expect: { state, fixtureEffects: 1 } },
      { operation: 'effect-delete', value: 'visibility', ...observed },
    ],
  })),
  ...['lesser', 'standard', 'greater'].map(cover => ({
    name: `rule-cover-${cover}-delete`, area: 'rule-elements', steps: [
      { operation: 'effect-add', value: { id: 'cover', operations: [{ type: 'overrideCover', state: cover, direction: 'from', targets: 'all' }] }, expect: { cover, fixtureEffects: 1 } },
      { operation: 'effect-delete', value: 'cover', expect: { cover: 'none', fixtureEffects: 0 } },
    ],
  })),
  { name: 'rule-visibility-source-stacking', area: 'rule-elements', steps: [
    { operation: 'effect-add', value: { id: 'low', priority: 100, operations: [visibility('concealed')] }, expect: { state: 'concealed', fixtureEffects: 1 } },
    { operation: 'effect-add', value: { id: 'high', priority: 200, operations: [visibility('hidden')] }, expect: { state: 'hidden', fixtureEffects: 2 } },
    { operation: 'effect-delete', value: 'high', expect: { state: 'concealed', fixtureEffects: 1 } },
    { operation: 'effect-delete', value: 'low', ...observed },
  ] },
  { name: 'rule-visibility-unmatched-predicate', area: 'rule-elements', steps: [
    { operation: 'effect-add', value: { id: 'predicate', operations: [{ ...visibility('hidden'), predicate: ['self:trait:dragon'] }] }, expect: { state: 'observed', fixtureEffects: 1 }, art: true },
    { operation: 'effect-delete', value: 'predicate', ...observed },
  ] },
  { name: 'rule-visibility-direction', area: 'rule-elements', steps: [
    { operation: 'effect-add', value: { id: 'direction', operations: [visibility('hidden')] }, expect: { state: 'hidden', reverseState: 'observed' } },
    { operation: 'effect-delete', value: 'direction', ...observed },
  ] },
  ...['lesser', 'standard', 'greater'].map(cover => ({
    name: `region-one-way-${cover}`, area: 'regions', requireSettings: { autoCover: true }, steps: [
      { operation: 'region', value: { type: 'Cover', system: { coverLevel: cover, mode: 'oneWay' } } },
      { operation: 'move', value: 801, expect: { autoCover: cover } },
      { operation: 'observer-move', value: { x: 700 }, expect: { autoCover: 'none' } },
      { operation: 'observer-move', value: { x: 400 }, expect: { autoCover: cover } },
      { operation: 'remove-regions', expect: { autoCover: 'none' } },
    ],
  })),
];
