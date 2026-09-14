const observed = { expect: { state: 'observed', visible: true, filter: null }, art: true };
const hearing = { expect: { state: 'hidden', filter: 'hearing' }, art: false };

// Assert both entry and recovery. A correct first frame alone cannot catch stale state.
export const extendedCases = [
  ...['observed', 'concealed', 'hidden', 'undetected'].map(state => ({
    name: `api-${state}-reset`, area: 'api', steps: [
      { operation: 'api-state', value: state, expect: { state }, ...(state === 'observed' ? { art: true } : {}) },
      { operation: 'reset-override', ...observed },
    ],
  })),
  { name: 'api-rejects-unsupported-state', area: 'api', steps: [
    { operation: 'api-invalid-state', value: 'unnoticed', ...observed },
  ] },
  ...['lesser', 'standard', 'greater'].map(cover => ({
    name: `api-cover-${cover}-reset`, area: 'cover', steps: [
      { operation: 'api-cover', value: cover, expect: { cover } },
      { operation: 'api-cover', value: 'none', expect: { cover: 'none' } },
    ],
  })),
  ...['hidden', 'undetected', 'unnoticed'].map(state => ({
    name: `reload-${state}-reset`, area: 'lifecycle', steps: [
      { operation: 'state', value: state, expect: { state } },
      { reload: true, expect: { state }, art: false },
      { operation: 'reset-override', ...observed },
    ],
  })),
  { name: 'darkness-light-darkness', area: 'lighting', senses: [], darkness: true, steps: [
    hearing, { operation: 'lighting', value: false, ...observed },
    { operation: 'lighting', value: true, ...hearing },
  ] },
  { name: 'darkvision-add-remove', area: 'senses', senses: [], darkness: true, steps: [
    hearing, { operation: 'senses', value: [{ type: 'darkvision', acuity: 'precise', range: 30 }], ...observed },
    { operation: 'senses', value: [], ...hearing },
  ] },
  { name: 'hearing-range-exit-return', area: 'senses', senses: [], darkness: true, steps: [
    { operation: 'hearing-range', value: 30, ...hearing },
    { operation: 'move', value: 1200, expect: { visible: false }, art: false },
    { operation: 'move', value: 800, ...hearing },
  ] },
  { name: 'blind-deaf-no-sense-recovery', area: 'conditions', senses: [], steps: [
    { operation: 'condition', value: 'blinded', ...hearing },
    { operation: 'condition', value: 'deafened', expect: { visible: false }, art: false },
    { operation: 'condition', value: 'deafened', ...hearing },
    { operation: 'condition', value: 'blinded', ...observed },
  ] },
  { name: 'invisible-target-recovery', area: 'conditions', steps: [
    // Establish actual detection before testing the remembered location of a
    // visible creature becoming invisible; new fixtures may still be settling.
    { ...observed, expect: { ...observed.expect, sense: 'darkvision' } },
    { operation: 'target-condition', value: 'invisible', ...hearing },
    { operation: 'target-condition', value: 'invisible', ...observed },
  ] },
  { name: 'foundry-hidden-player-privacy', area: 'privacy', steps: [
    { operation: 'foundry-hidden', value: true, expect: { visible: false }, art: false },
    { key: 'o', expect: { visibilityBadge: false } },
    { operation: 'foundry-hidden', value: false, ...observed },
  ] },
  ...['tremorsense', 'scent', 'lifesense', 'thoughtsense'].map(sense => ({
    name: `${sense}-range-recovery`, area: 'senses', senses: [sense], darkness: true, steps: [
      { operation: 'condition', value: 'blinded' }, { operation: 'condition', value: 'deafened' },
      { expect: { state: 'hidden', sense }, art: false },
      { operation: 'move', value: 1200, expect: { visible: false }, art: false },
      { operation: 'move', value: 800, expect: { state: 'hidden', sense }, art: false },
    ],
  })),
  { name: 'precise-tremorsense-observed', area: 'senses', senses: [{ type: 'tremorsense', acuity: 'precise', range: 30 }], steps: [
    { operation: 'condition', value: 'blinded' }, { operation: 'condition', value: 'deafened', ...observed, art: 'dim' },
  ] },
  { name: 'region-concealment-remove', area: 'regions', steps: [
    { operation: 'region', value: { type: 'Concealment' } },
    { operation: 'move', value: 801, expect: { state: 'concealed' } },
    { operation: 'remove-regions' }, { operation: 'move', value: 800, ...observed },
  ] },
  ...['lesser', 'standard', 'greater'].map(cover => ({
    name: `region-cover-${cover}-exit`, area: 'regions', requireSettings: { autoCover: true }, steps: [
      { operation: 'region', value: { type: 'Cover', system: { coverLevel: cover, mode: 'override' } } },
      { operation: 'move', value: 801, expect: { autoCover: cover } },
      { operation: 'move', value: 1100, expect: { autoCover: 'none' } },
      { operation: 'move', value: 800, expect: { autoCover: cover } },
    ],
  })),
  { name: 'region-sense-suppression-remove', area: 'regions', darkness: true, senses: ['darkvision'], steps: [
    observed,
    { operation: 'region', value: { type: 'SenseSuppression', x: 350, system: { senses: ['darkvision'], affectsObserver: true } } },
    { operation: 'observer-move', value: { x: 401 }, ...hearing },
    { operation: 'remove-regions' }, { operation: 'observer-move', value: { x: 400 }, ...observed },
  ] },
  { name: 'door-player-reload', area: 'lifecycle', steps: [
    { operation: 'door', value: 0, expect: { visible: false }, art: false },
    { reload: true, expect: { visible: false }, art: false },
    { operation: 'door', value: 1, ...observed },
  ] },
  { name: 'hover-release-clears-badges', area: 'tooltips', darkness: true, steps: [
    // Establish real darkvision detection before opening the sense badge.
    // Bright-light Observed alone does not require a special-sense badge.
    { expect: { state: 'observed', sense: 'darkvision', visible: true }, art: true },
    { key: 'o', expect: { visibilityBadge: true } },
    { expect: { visibilityBadge: false } },
    { operation: 'cover', value: 'standard' },
    { key: 'g', expect: { coverBadge: true } },
    { expect: { coverBadge: false } },
  ] },
];
