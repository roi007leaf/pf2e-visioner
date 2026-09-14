const observed = { expect: { state: 'observed', filter: null }, art: true };
const hidden = { expect: { state: 'hidden' }, art: false };
const op = state => ({ type: 'overrideVisibility', state, direction: 'from', observers: 'all' });

export const requiredCases = [
  { name: 'rule-item-edit-refresh', area: 'rule-elements', steps: [
    { operation: 'effect-add', value: { id: 'edit', operations: [op('concealed')] }, expect: { state: 'concealed' } },
    { operation: 'effect-edit', value: { id: 'edit', operations: [op('hidden')] }, ...hidden },
    { operation: 'effect-edit', value: { id: 'edit', operations: [op('concealed')] }, expect: { state: 'concealed' } },
    { operation: 'effect-delete', value: 'edit', ...observed },
  ] },
  { name: 'rule-distance-bands', area: 'rule-elements', steps: [
    { operation: 'effect-add', value: { id: 'distance', operations: [{ type: 'distanceBasedVisibility', direction: 'from', observers: 'all', source: 'qa-distance', distanceBands: [
      { minDistance: 0, maxDistance: 10, state: 'observed' },
      { minDistance: 10, maxDistance: 20, state: 'concealed' },
      { minDistance: 20, maxDistance: null, state: 'hidden' },
    ] }] }, ...hidden },
    { operation: 'move', value: 700, expect: { state: 'concealed' } },
    { operation: 'move', value: 500, ...observed },
    { operation: 'move', value: 800, ...hidden },
    { operation: 'effect-delete', value: 'distance', ...observed },
  ] },
  { name: 'rule-lighting-modification', area: 'rule-elements', senses: [], steps: [
    observed,
    { operation: 'effect-add', value: { id: 'lighting', operations: [{ type: 'modifyLighting', lightingLevel: 'darkness', source: 'qa-lighting' }] }, ...hidden },
    { operation: 'effect-delete', value: 'lighting', ...observed },
  ] },
  { name: 'rule-sense-modification', area: 'rule-elements', senses: ['tremorsense'], steps: [
    { operation: 'condition', value: 'blinded' }, { operation: 'condition', value: 'deafened', ...hidden },
    { operation: 'effect-add', value: { id: 'sense', subject: 'observer', operations: [{ type: 'modifySenses', senseModifications: { tremorsense: { range: 10 } }, source: 'qa-sense' }] }, expect: { visible: false }, art: false },
    { operation: 'effect-delete', value: { id: 'sense', subject: 'observer' }, ...hidden },
  ] },
  { name: 'rule-detection-mode', area: 'rule-elements', senses: [], darkness: true, steps: [
    { expect: { state: 'hidden', filter: 'hearing' }, art: false },
    { operation: 'effect-add', value: { id: 'mode', subject: 'observer', operations: [{ type: 'modifyDetectionModes', modeModifications: { hearing: { range: 10 } }, source: 'qa-mode' }] }, expect: { visible: false }, art: false },
    { operation: 'effect-delete', value: { id: 'mode', subject: 'observer' }, expect: { state: 'hidden', filter: 'hearing' }, art: false },
  ] },
  { name: 'region-cover-line-of-sight', area: 'regions', requireSettings: { autoCover: true }, steps: [
    { operation: 'region', value: { type: 'Cover', x: 600, width: 100, system: { mode: 'lineOfSight', coverLevel: 'standard' } }, expect: { autoCover: 'standard' } },
    { operation: 'observer-move', value: { x: 900 }, expect: { autoCover: 'none' } },
    { operation: 'observer-move', value: { x: 400 }, expect: { autoCover: 'standard' } },
    { operation: 'remove-regions', expect: { autoCover: 'none' } },
  ] },
  { name: 'hide-apply-revert-outcome', area: 'actions', steps: [
    { operation: 'combat' }, { operation: 'cover', value: 'standard' },
    { operation: 'hide', actionMessage: true, applyAction: 'hide', ...hidden },
    { revertAction: 'hide', ...observed },
  ] },
];
