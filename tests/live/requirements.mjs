import { casePassed } from './coverage.mjs';
import { regionAuditCases } from './region-audit-workflows.mjs';
import { missingCases } from './missing-cases.mjs';
import { auditCases } from './audit-cases.mjs';
import { detectionGapCases } from './detection-gap-workflows.mjs';
import { fpsCases } from './fps-workflows.mjs';
import { performanceLifecycleCases } from './performance-lifecycle-workflows.mjs';
import { scenePerformanceCases } from './scene-performance-workflows.mjs';
import { deletionRaceCases } from './deletion-race-workflows.mjs';
// Required functional contracts. Missing implementations are explicit blockers,
// not omitted from the denominator or replaced with a passing placeholder.
export const requirements = [
  ['Region checkbox and mode matrix', regionAuditCases.map(c => c.name)],
  ['Deletion during AVS persistence waits', deletionRaceCases.map(c => c.name)],
  ['Dungeon walls, lights and lighting regions', scenePerformanceCases.map(c => c.name)],
  ['Client startup and retained memory', performanceLifecycleCases.map(c => c.name)],
  ['Rendered FPS on GM and player clients', fpsCases.map(c => c.name)],
  ['Detection boundaries and transitions', detectionGapCases.map(c => c.name)],
  ['Live performance budgets', ['performance-movement', 'performance-movement-lights', 'performance-observer-switch', 'performance-recalculate-12', 'performance-recalculate-30', 'detection-movement-soundwave-handoff']],
  ['Player Seek templates', ['player-seek-template-circle', 'player-seek-template-cone', 'player-seek-template-cancel-config', 'player-seek-template-cancel-placement']],
  ['Player-originated native actions', ['player-native-hide', 'player-native-sneak', 'player-native-seek', 'player-native-strike', 'player-native-create-a-diversion']],
  ['Player character actions', ['player-character-hide', 'player-character-sneak', 'player-character-seek', 'player-character-create-a-diversion']],
  ...[...new Set(auditCases.map(c => c.area))].map(area => [
    `Feature audit: ${area}`, auditCases.filter(c => c.area === area).map(c => c.name),
  ]),
  ['Visibility and API', ['api-observed-reset', 'api-concealed-reset', 'api-hidden-reset', 'api-undetected-reset', 'api-rejects-unsupported-state']],
  ['Core senses', ['darkvision-in-darkness', 'hearing-in-darkness', 'blind-deaf-tremorsense', 'precise-tremorsense-observed']],
  ['Sense changes and recovery', ['darkvision-add-remove', 'blind-deaf-no-sense-recovery', 'tremorsense-range-recovery', 'scent-range-recovery', 'lifesense-range-recovery', 'thoughtsense-range-recovery']],
  ['Remaining senses and target eligibility', missingCases.filter(c => c.area === 'senses').map(c => c.name)],
  ['Rendered indicators and tiles', ['hearing-tremorsense-rendered-transitions', 'scent-preserves-rendered-background-tile', 'detection-movement-soundwave-handoff']],
  ['Lighting', ['darkness-light-darkness', 'lighting-dim-magical-darkness-cones']],
  ['Cover states', ['api-cover-lesser-reset', 'api-cover-standard-reset', 'api-cover-greater-reset']],
  ['Cover geometry and blockers', ['wall-cover-controls', 'tile-cover-controls', 'cover-token-size-prone-dead-blockers']],
  ['Cover region modes', ['region-cover-lesser-exit', 'region-cover-standard-exit', 'region-cover-greater-exit', 'region-one-way-lesser', 'region-one-way-standard', 'region-one-way-greater', 'region-cover-line-of-sight']],
  ['Visibility and suppression regions', ['region-concealment-remove', 'region-sense-suppression-remove', 'region-visibility']],
  ['Player privacy and GM exceptions', ['player-undetected-privacy', 'player-unnoticed-privacy', 'gm-player-undetected-tooltip-permissions', 'gm-player-unnoticed-tooltip-permissions', 'privacy-targeting-nameplates']],
  ['Movement', ['door-close-open-close', 'drag-preview', 'movement-animation-performance', 'detection-movement-soundwave-handoff']],
  ['Levels', ['levels-pillar', 'levels-surfaces-floor-occlusion']],
  ['Observer and connection lifecycle', ['observer-switch', 'reload-hidden-reset', 'door-player-reload', 'socket-player-reconnect', 'socket-reconnect-gm-handover']],
  ['Hide', ['combat-hide-apply', 'hide-apply-revert-outcome', 'hide-apply-revert']],
  ['Sneak', ['combat-sneak-action', 'sneak-apply-revert']],
  ['Seek', ['combat-seek-action', 'seek-apply-revert']],
  ['Other encounter actions', ['attack-consequences', 'attack-consequences-hidden', 'attack-consequences-undetected', 'diversion-apply-revert', 'point-out-apply-revert', 'take-cover-expiry']],
  ['Initiative and exploration', ['search-exploration', 'search-exploration-unnoticed', 'stealth-initiative-eligibility']],
  ['Managers', ['manager-directions', 'hazard-manager-privacy', 'loot-manager-privacy']],
  ['Rule visibility and cover', ['rule-visibility-hidden-delete', 'rule-cover-lesser-delete', 'rule-cover-standard-delete', 'rule-cover-greater-delete', 'rule-visibility-source-stacking', 'rule-visibility-unmatched-predicate', 'rule-visibility-direction']],
  ['Remaining rule operations', ['rule-aura-visibility', 'rule-action-qualification', 'rule-cover-adjustment', 'rule-detection-mode', 'rule-distance-bands', 'rule-lighting-modification', 'rule-off-guard-suppression', 'rule-roll-context', 'rule-sense-modification', 'rule-shared-vision', 'rule-item-edit-refresh', 'rule-strike-consumption', 'rule-native-strike-off-guard']],
  ['Feats', ['feats-shared-vision', 'sniping-duo-creature-cover', 'feat-eligibility-matrix', ...['terrain-stalker', 'camouflage', 'vanish-into-the-land', 'distracting-shadows', 'keen-eyes', 'thats-odd', 'very-sneaky', 'sneaky', 'deny-advantage'].map(s => `feat-context-${s}`)]],
  ['Settings and macros', ['settings-macros', 'settings-save-reload-restore', 'selected-token-purge-isolation']],
  ['Supported environments', ['compatibility-foundry14-pf2e']],
].map(([name, scenarios]) => ({ name, scenarios }));

export function assessRequirements(catalog, results) {
  const implemented = new Set(catalog.map(c => c.name));
  const outcomes = new Map(results.map(r => [r.name, casePassed(r) ? 'passed' : 'failed']));
  const details = requirements.map(requirement => ({
    name: requirement.name,
    missing: requirement.scenarios.filter(name => !implemented.has(name)),
    unrun: requirement.scenarios.filter(name => implemented.has(name) && !outcomes.has(name)),
    failed: requirement.scenarios.filter(name => outcomes.has(name) && outcomes.get(name) !== 'passed'),
  }));
  return {
    complete: details.every(r => !r.missing.length && !r.unrun.length && !r.failed.length),
    details,
  };
}
