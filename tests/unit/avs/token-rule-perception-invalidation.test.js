import { TokenEventHandler } from '../../../scripts/visibility/auto-visibility/core/TokenEventHandler.js';

test.each([
  { rotation: 90 },
  { flags: { 'pf2e-visioner': { invisibility: { observer: { previousState: 'observed' } } } } },
  { 'flags.pf2e-visioner.invisibility.observer': { previousState: 'observed' } },
  { flags: { 'pf2e-visioner': { '-=invisibility': null } } },
  { flags: { 'pf2e-visioner': { lightingModification: { rule: { lightingLevel: 'darkness' } } } } },
  { 'flags.pf2e-visioner.lightingModification.rule': null },
  { flags: { 'pf2e-visioner': { '-=lightingModification': null } } },
  { flags: { 'pf2e-visioner': { originalPerception: { rule: { detectionModeModifications: { hearing: { range: 10 } } } } } } },
  { detectionModes: { hearing: { enabled: true, range: 10 } } },
])('token perception change clears stale visibility before recomputation: %j', async changes => {
  const events = [];
  const handler = new TokenEventHandler(
    { shouldProcessEvents: () => true, debug: () => {} },
    { markTokenChangedImmediate: id => events.push('recalculate:' + id) },
    {}, { isExcludedToken: () => false }, {}, { storeUpdatedTokenDoc: () => {} },
    { clearVisibilityCache: () => events.push('clear'), clearLosCache: () => {} },
  );
  await handler.handleTokenUpdate({ id: 'observer', x: 0, y: 0 }, changes, {}, 'gm');
  expect(events).toContain('clear');
  expect(events).toContain('recalculate:observer');
  expect(events.indexOf('clear')).toBeLessThan(events.indexOf('recalculate:observer'));
});
