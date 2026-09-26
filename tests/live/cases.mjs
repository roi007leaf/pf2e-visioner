import { autumnLeavesCases } from './autumn-leaves-workflows.mjs';
import { extendedCases } from './extended-cases.mjs';
import { regionAuditCases } from './region-audit-workflows.mjs';
import { itemRoleCases } from './item-role-cases.mjs';
import { requiredCases } from './required-cases.mjs';
import { automatedCases } from './automated-cases.mjs';
import { missingCases } from './missing-cases.mjs';
import { auditCases } from './audit-cases.mjs';
import { gapCases } from './gap-cases.mjs';
import { actionGapCases } from './action-gap-cases.mjs';
import { playerActionCases } from './player-action-workflows.mjs';
import { performanceCases } from './performance-workflows.mjs';
import { detectionGapCases } from './detection-gap-workflows.mjs';
import { fpsCases } from './fps-workflows.mjs';
import { performanceLifecycleCases } from './performance-lifecycle-workflows.mjs';
import { scenePerformanceCases } from './scene-performance-workflows.mjs';
import { deletionRaceCases } from './deletion-race-workflows.mjs';
import { visibilityRegressionCases } from './visibility-regression-workflows.mjs';
// Every case gets fresh documents. These are live contracts, not mocked calculators.
export const smokeCases = [
  { name: 'darkvision-in-darkness', darkness: true, steps: [{ expect: { state: 'observed', visible: true, filter: null }, art: true }] },
  { name: 'hearing-in-darkness', senses: [], darkness: true, steps: [{ expect: { state: 'hidden', filter: 'hearing' }, art: false }] },
  { name: 'blinded-hearing-over-tremor', senses: ['darkvision', 'tremorsense'], steps: [
    { operation: 'condition', value: 'blinded', expect: { state: 'hidden', sense: 'hearing', filter: 'hearing' }, art: false },
    { operation: 'condition', value: 'blinded', expect: { state: 'observed', filter: null }, art: true },
  ] },
  { name: 'deafened-darkvision', darkness: true, steps: [{ operation: 'condition', value: 'deafened', expect: { state: 'observed', filter: null }, art: true }] },
  { name: 'blind-deaf-tremorsense', senses: ['darkvision', 'tremorsense'], steps: [
    { operation: 'condition', value: 'blinded' },
    { operation: 'condition', value: 'deafened', expect: { state: 'hidden', filter: 'tremorsense' }, art: false },
    { operation: 'move', value: 1200, expect: { visible: false }, art: false },
    { operation: 'move', value: 800, expect: { state: 'hidden', filter: 'tremorsense' }, art: false },
  ] },
  { name: 'door-close-open-close', steps: [
    { operation: 'door', value: 0, expect: { visible: false }, art: false },
    { operation: 'door', value: 1, expect: { state: 'observed', visible: true }, art: true },
    { operation: 'door', value: 0, expect: { visible: false }, art: false },
  ] },
  { name: 'manual-hidden-to-observed', steps: [
    { operation: 'state', value: 'hidden', expect: { state: 'hidden' }, art: false },
    { operation: 'state', value: 'observed', expect: { state: 'observed', filter: null }, art: true },
  ] },
  ...['undetected', 'unnoticed'].map(state => ({ name: `player-${state}-privacy`, steps: [
    { operation: 'state', value: state, expect: { state }, art: false },
    { operation: 'cover', value: 'standard' },
    { key: 'o', expect: { visibilityBadge: false } },
    { key: 'g', expect: { coverBadge: false } },
  ] })),
  { name: 'player-hidden-hearing-tooltip', darkness: true, senses: [], steps: [
    { expect: { state: 'hidden', sense: 'hearing' }, art: false },
    { key: 'o', expect: { visibilityBadge: true } },
    { operation: 'cover', value: 'standard' },
    { key: 'g', expect: { coverBadge: true } },
  ] },
  { name: 'manual-cover-removal', steps: [
    { operation: 'cover', value: 'standard' }, { key: 'g', expect: { coverBadge: true } },
    { operation: 'cover', value: 'none' }, { key: 'g', expect: { coverBadge: false } },
  ] },
  { name: 'observer-switch', secondObserver: true, steps: [
    { operation: 'condition', value: 'blinded', expect: { state: 'hidden' }, art: false },
    { switchObserver: 'second', expect: { state: 'observed', filter: null }, art: true },
    { switchObserver: 'first', expect: { state: 'hidden', filter: 'hearing' }, art: false },
  ] },
];

export const fullCases = [
  ...autumnLeavesCases,
  ...visibilityRegressionCases,
  ...regionAuditCases,
  ...fpsCases,
  ...performanceLifecycleCases,
  ...scenePerformanceCases,
  ...deletionRaceCases,
  ...detectionGapCases,
  ...actionGapCases,
  ...playerActionCases,
  ...performanceCases,
  ...gapCases,
  ...auditCases,
  ...smokeCases,
  ...extendedCases,
  ...itemRoleCases,
  ...requiredCases,
  ...missingCases,
  ...automatedCases,
  ...['scent', 'lifesense', 'thoughtsense'].map(sense => ({ name: `${sense}-presence`, senses: [sense], darkness: true, steps: [
    { operation: 'condition', value: 'blinded' }, { operation: 'condition', value: 'deafened' },
    { expect: { state: 'hidden', sense }, art: false },
    { operation: 'tile', expect: { tilesVisible: true }, art: false },
  ] })),
  { name: 'tremorsense-elevation', senses: ['tremorsense'], steps: [
    { operation: 'condition', value: 'blinded' }, { operation: 'condition', value: 'deafened' },
    { expect: { state: 'hidden', filter: 'tremorsense' }, art: false },
    { operation: 'elevation', value: 50, expect: { visible: false }, art: false },
    { operation: 'elevation', value: 0, expect: { state: 'hidden', filter: 'tremorsense' }, art: false },
  ] },
  ...['hide', 'sneak', 'seek'].map(action => ({ name: `combat-${action}-action`, steps: [
    { operation: 'combat' }, { operation: action, actionMessage: true },
  ] })),
  { name: 'combat-hide-apply', steps: [
    { operation: 'combat' }, { operation: 'cover', value: 'standard' },
    { operation: 'hide', actionMessage: true, applyAction: 'hide', expect: { state: 'hidden' }, art: false },
  ] },
  { name: 'concealed-to-observed', steps: [
    { operation: 'state', value: 'concealed', expect: { state: 'concealed' } },
    { operation: 'state', value: 'observed', expect: { state: 'observed', filter: null }, art: true },
  ] },
];

export const ruleRegionCases = fullCases.filter(c =>
  ['rule-elements', 'regions'].includes(c.area) || /^(regression-|region-|rule-)/.test(c.name) ||
  /upper-level-suppression$/.test(c.name) || c.name === 'detection-overlapping-suppression');
