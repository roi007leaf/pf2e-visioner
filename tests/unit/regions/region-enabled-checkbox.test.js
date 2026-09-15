import '../../setup.js';
import { ConcealmentRegionBehavior } from '../../../scripts/regions/ConcealmentRegionBehavior.js';
import { CoverRegionBehavior } from '../../../scripts/regions/CoverRegionBehavior.js';
import { SenseSuppressionRegionBehavior } from '../../../scripts/regions/SenseSuppressionRegionBehavior.js';

test.each([
  ['Concealment', () => ConcealmentRegionBehavior.getAllConcealmentRegions()],
  ['Cover', () => CoverRegionBehavior.getAllCoverRegions()],
  ['SenseSuppression', () => SenseSuppressionRegionBehavior.getAllSenseSuppressionRegions()],
])('%s honors the native system.enabled checkbox independently of disabled', (type, getRegions) => {
  const original = canvas.scene;
  const behavior = { type: `pf2e-visioner.Pf2eVisioner${type}`, disabled: false,
    system: { enabled: true, senses: new Set(['scent']) } };
  canvas.scene = { regions: [{ behaviors: [behavior] }] };
  try {
    for (const enabled of [false, true]) for (const disabled of [false, true]) {
      behavior.system.enabled = enabled; behavior.disabled = disabled;
      expect(getRegions()).toHaveLength(enabled && !disabled ? 1 : 0);
    }
  } finally { canvas.scene = original; }
});
