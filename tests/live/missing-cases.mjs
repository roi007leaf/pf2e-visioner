const observed = { expect: { state: 'observed', visible: true, filter: null }, art: true };
const absent = { expect: { visible: false }, art: false };
const hidden = sense => ({ expect: { state: 'hidden', ...(sense ? { sense } : {}) }, art: false });
const senses = (type, acuity = 'imprecise') => ({ operation: 'senses', value: [{ type, acuity, range: 30 }] });
const add = (id, operations, subject = 'target') => ({ operation: 'effect-add', value: { id, operations, subject } });
const remove = (id, subject = 'target') => ({ operation: 'effect-delete', value: { id, subject } });
const rules = expect => ({ probe: 'rules', expect });
const trait = (...value) => ({ operation: 'target-data', value: { 'system.traits.value': value } });

export const missingCases = [
  { name: 'sense-eligibility-matrix', area: 'senses', senses: ['lifesense'], steps: [
    { operation: 'condition', value: 'blinded' }, { operation: 'condition', value: 'deafened', ...hidden('lifesense') },
    { ...trait('construct'), ...absent }, { ...trait('undead'), ...hidden('lifesense') },
    { ...trait(), ...hidden('lifesense') },
    { ...senses('thoughtsense'), ...hidden('thoughtsense') },
    ...['mindless', 'construct', 'ooze'].flatMap(t => [{ ...trait(t), ...absent }, { ...trait(), ...hidden('thoughtsense') }]),
    { ...senses('thoughtsense', 'precise'), ...observed, art: 'dim' },
    { operation: 'target-condition', value: 'invisible', ...observed, art: 'dim' },
    { operation: 'senses', value: [], ...absent },
    { operation: 'target-condition', value: 'invisible' },
    { operation: 'condition', value: 'blinded', ...observed },
  ] },
  ...['scent', 'tremorsense', 'bloodsense', 'magicsense', 'electromagnetic-sense', 'motion-sense', 'spiritsense', 'wavesense'].map(sense => ({
    name: `sense-acuity-${sense}`, area: 'senses', senses: [{ type: sense, acuity: 'imprecise', range: 30 }], steps: [
      { operation: 'condition', value: 'blinded' }, { operation: 'condition', value: 'deafened', ...hidden(sense) },
      { ...senses(sense, 'precise'), ...observed, art: 'dim' },
      { operation: 'move', value: 1400, ...absent },
      { operation: 'move', value: 800, ...observed, art: 'dim' },
      { ...senses(sense), ...hidden(sense) },
      { operation: 'senses', value: [], ...absent },
    ],
  })),
  { name: 'sense-echolocation-deafness', area: 'senses', senses: [{ type: 'echolocation', acuity: 'precise', range: 30 }], steps: [
    { operation: 'condition', value: 'blinded', ...observed, art: 'dim' },
    { operation: 'condition', value: 'deafened', ...absent },
    { operation: 'condition', value: 'deafened', ...observed, art: 'dim' },
    { operation: 'door', value: 0, ...absent }, { operation: 'door', value: 1, ...observed, art: 'dim' },
  ] },
  { name: 'lighting-dim-magical-darkness-cones', area: 'lighting', darkness: true, senses: [], steps: [
    hidden('hearing'),
    { operation: 'ambient-light', value: { dim: 30 }, expect: { state: 'concealed', visible: true, filter: null }, art: 'dim' },
    { ...senses('low-light-vision', 'precise'), ...observed, art: 'dim' },
    { operation: 'ambient-light', value: null, ...hidden('hearing') },
    { ...senses('darkvision', 'precise'), ...observed },
    // Darkness heightened to rank 4 conceals targets from ordinary darkvision.
    // https://roll20.net/compendium/pf2/Spells%3ADarkness?expansion=0
    { ...add('magic-dark', [{ type: 'modifyLighting', lightingLevel: 'greaterMagicalDarkness', source: 'qa-dark' }]), expect: { state: 'concealed', sense: 'darkvision', visible: true, filter: null }, art: true },
    { ...senses('greater-darkvision', 'precise'), ...observed },
    { ...remove('magic-dark'), ...observed },
    { operation: 'observer-token', value: { 'sight.angle': 90, rotation: 270 }, ...observed },
    { operation: 'observer-token', value: { rotation: 90 }, ...hidden('hearing') },
    { operation: 'observer-token', value: { 'sight.angle': 360 }, ...observed },
  ] },
  { name: 'cover-token-size-prone-dead-blockers', area: 'cover', secondObserver: true,
    requireSettings: { autoCover: true, autoCoverIgnoreDead: true, autoCoverAllowProneBlockers: false }, steps: [
      { operation: 'second-token', value: { x: 600, y: 500 }, expect: { autoCover: 'lesser' } },
      { operation: 'second-data', value: { 'system.traits.size.value': 'huge' }, expect: { autoCover: 'standard' } },
      { operation: 'second-condition', value: 'prone', expect: { autoCover: 'none' } },
      { operation: 'second-condition', value: 'prone', expect: { autoCover: 'standard' } },
      { operation: 'second-data', value: { 'system.attributes.hp.value': 0 }, expect: { autoCover: 'none' } },
      { operation: 'second-data', value: { 'system.attributes.hp.value': 20 }, expect: { autoCover: 'standard' } },
      { operation: 'second-token', value: { x: 600, y: 900 }, expect: { autoCover: 'none' } },
  ] },
  { name: 'privacy-targeting-nameplates', area: 'privacy', steps: [
    { operation: 'target-token', value: { displayName: 50 }, hover: true, probe: 'privacy', expect: { nameplateRendered: true }, art: true },
    ...['undetected', 'unnoticed'].flatMap(state => [
      { operation: 'state', value: state, ...absent },
      { hover: true, targetGesture: true, probe: 'privacy', expect: { targeted: false, nameplateRendered: false, tooltipContainsName: false }, art: false },
      { operation: 'reset-override', ...observed },
    ]),
    { hover: true, targetGesture: true, probe: 'privacy', expect: { targeted: true, nameplateRendered: true } },
    { hover: true, targetGesture: true, probe: 'privacy', expect: { targeted: false } },
  ] },
  { name: 'movement-animation-performance', area: 'movement', steps: [
    observed,
    { animate: { x: 1200, duration: 1000, maxP95FrameMs: 100, maxFrameMs: 500 }, ...observed },
    { animate: { x: 800, duration: 1000, maxP95FrameMs: 100, maxFrameMs: 500 }, ...observed },
    { operation: 'door', value: 0, ...absent },
    { operation: 'door', value: 1, ...observed },
    { animate: { x: 1200, duration: 1000, maxP95FrameMs: 100, maxFrameMs: 500 }, ...observed },
  ] },
  { name: 'socket-player-reconnect', area: 'lifecycle', steps: [
    observed,
    { reconnect: { state: 'undetected' }, expect: { state: 'undetected', visible: false }, art: false },
    { operation: 'reset-override', ...observed },
    { reconnect: { state: 'hidden' }, ...hidden() },
    { operation: 'reset-override', ...observed },
  ] },
  { name: 'rule-aura-visibility', area: 'rule-elements', steps: [
    observed,
    { ...add('aura', [{ type: 'auraVisibility', auraRadius: 10, insideOutsideState: 'concealed', outsideInsideState: 'concealed', sourceExempt: false, includeSourceAsTarget: true, source: 'qa-aura' }]), expect: { state: 'concealed' } },
    { operation: 'observer-move', value: { x: 700 }, ...observed },
    { operation: 'observer-move', value: { x: 400 }, expect: { state: 'concealed' } },
    { ...remove('aura'), ...observed },
  ] },
  { name: 'rule-action-qualification', area: 'rule-elements', steps: [
    rules({ concealmentAllowsHide: true }),
    { ...add('qualification', [{ type: 'modifyActionQualification', qualifications: { hide: { qualifiesOnConcealment: false } }, source: 'qa-qualification' }]), ...rules({ concealmentAllowsHide: false }) },
    { operation: 'effect-edit', value: { id: 'qualification', operations: [{ type: 'modifyActionQualification', qualifications: { hide: { qualifiesOnConcealment: true } }, source: 'qa-qualification' }] }, ...rules({ concealmentAllowsHide: true }) },
    { ...remove('qualification'), ...rules({ concealmentAllowsHide: true }), art: true },
  ] },
  { name: 'rule-cover-adjustment', area: 'rule-elements', steps: [
    { operation: 'cover', value: 'standard', ...rules({ adjustedCover: 'standard', coverAdjustmentCount: 0 }) },
    { ...add('adjust', [{ type: 'adjustCover', mode: 'step', steps: -1, direction: 'from', observers: 'all', source: 'qa-adjust' }]), ...rules({ adjustedCover: 'lesser', coverAdjustmentCount: 1 }) },
    { operation: 'cover', value: 'greater', ...rules({ adjustedCover: 'standard' }) },
    { ...remove('adjust'), ...rules({ adjustedCover: 'greater', coverAdjustmentCount: 0 }) },
    { operation: 'cover', value: 'none', ...rules({ adjustedCover: 'none' }) },
  ] },
  { name: 'rule-off-guard-suppression', area: 'rule-elements', steps: [
    rules({ hiddenOffGuardSuppressed: false, undetectedOffGuardSuppressed: false }),
    { ...add('offguard', [{ type: 'offGuardSuppression', suppressedStates: ['hidden'], source: 'qa-offguard' }]), ...rules({ hiddenOffGuardSuppressed: true, undetectedOffGuardSuppressed: false }) },
    { ...remove('offguard'), ...rules({ hiddenOffGuardSuppressed: false, undetectedOffGuardSuppressed: false }) },
  ] },
  { name: 'rule-roll-context', area: 'rule-elements', steps: [
    { probe: 'roll-context', expect: { qualifiedRollHidden: false, unqualifiedRollHidden: false } },
    { ...add('roll', [{ type: 'overrideVisibility', state: 'hidden', direction: 'from', observers: 'all', selectors: ['attack-roll'], predicate: ['item:trait:agile'] }]), probe: 'roll-context', expect: { qualifiedRollHidden: true, unqualifiedRollHidden: false, state: 'observed' }, art: true },
    { ...remove('roll'), probe: 'roll-context', expect: { qualifiedRollHidden: false, unqualifiedRollHidden: false, state: 'observed' }, art: true },
  ] },
  { name: 'rule-shared-vision', area: 'rule-elements', secondObserver: true, senses: [], steps: [
    { operation: 'condition', value: 'blinded' }, { operation: 'condition', value: 'deafened', ...absent },
    { ...add('share', [{ type: 'shareVision', mode: 'one-way', masterActorUuid: '$secondObserver', source: 'qa-share' }], 'observer'), probe: 'rules', expect: { sharedMaster: true, visible: true }, art: true },
    { ...remove('share', 'observer'), probe: 'rules', expect: { sharedMaster: false, visible: false }, art: false },
    { operation: 'condition', value: 'blinded', ...observed },
  ] },
  { name: 'feat-eligibility-matrix', area: 'feats', observerType: 'character', observerLevel: 8, targetLevel: 8, steps: [
    { probe: 'feat', expect: { blindFightReplacement: null, sneakSpeed: 0.5, creatureCover: 'lesser', skipHideEnd: false } },
    { operation: 'feat-add', value: { slug: 'blind-fight' }, probe: 'feat', expect: { blindFightReplacement: null } },
    { operation: 'move', value: 500, probe: 'feat', expect: { blindFightReplacement: 'hidden' } },
    { operation: 'target-data', value: { 'system.details.level.value': 9 }, probe: 'feat', expect: { blindFightReplacement: null } },
    { operation: 'target-data', value: { 'system.details.level.value': 8 }, probe: 'feat', expect: { blindFightReplacement: 'hidden' } },
    { operation: 'feat-delete', value: { slug: 'blind-fight' }, probe: 'feat', expect: { blindFightReplacement: null } },
    ...['swift-sneak', 'legendary-sneak', 'very-very-sneaky'].flatMap(slug => [
      { operation: 'feat-add', value: { slug }, probe: 'feat', expect: { sneakSpeed: 1 } },
      { operation: 'feat-delete', value: { slug }, probe: 'feat', expect: { sneakSpeed: 0.5 } },
    ]),
    { operation: 'feat-add', value: { slug: 'ceaseless-shadows' }, probe: 'feat', expect: { creatureCover: 'standard', skipHideEnd: true } },
    { operation: 'feat-delete', value: { slug: 'ceaseless-shadows' }, probe: 'feat', expect: { creatureCover: 'lesser', skipHideEnd: false } },
  ] },
  { name: 'selected-token-purge-isolation', area: 'api', secondObserver: true, steps: [
    { operation: 'purge-seed', probe: 'purge', expect: { state: 'hidden', cover: 'greater', unrelatedState: 'concealed', unrelatedCover: 'lesser', foreignFlagPreserved: true } },
    { operation: 'purge-selected', probe: 'purge', expect: { state: 'observed', cover: 'none', unrelatedState: 'concealed', unrelatedCover: 'lesser', foreignFlagPreserved: true }, art: true },
  ] },
  { name: 'settings-save-reload-restore', area: 'configuration', disposableWorld: true, steps: [
    { setting: { key: 'enableHoverTooltips', value: false }, reload: true, expectSetting: { key: 'enableHoverTooltips', value: false } },
    { setting: { key: 'enableHoverTooltips', value: true }, reload: true, expectSetting: { key: 'enableHoverTooltips', value: true }, art: true },
    { restoreSettings: true, expectSetting: { key: 'enableHoverTooltips', original: true } },
  ] },
].map(testCase => ({ ...testCase, camera: { x: 900, y: 550, scale: 0.7 } }));
