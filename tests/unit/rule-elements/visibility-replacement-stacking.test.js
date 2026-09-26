import { VisibilityOverride } from '../../../scripts/rule-elements/operations/VisibilityOverride.js';
import { RuleElementChecker } from '../../../scripts/rule-elements/RuleElementChecker.js';

const token = (id) => {
  const flags = {};
  return {
    id,
    actor: {},
    distanceTo: () => 5,
    document: {
      getFlag: (_scope, key) => flags[key],
      setFlag: async (_scope, key, value) => {
        flags[key] = value;
      },
      unsetFlag: async (_scope, key) => {
        delete flags[key];
      },
    },
  };
};
const leaves = (direction) => ({
  type: 'overrideVisibility',
  observers: 'all',
  direction,
  fromStates: ['observed'],
  toState: 'concealed',
  source: `leaves-${direction}`,
  sourceTags: ['leaves'],
});

test('concurrent native rule writes preserve both visibility directions', async () => {
  const subject = token('subject'),
    other = token('other');
  canvas.tokens.placeables = [subject, other];
  const write = subject.document.setFlag;
  subject.document.setFlag = async (...args) => {
    await Promise.resolve();
    await write(...args);
  };
  await Promise.all(
    ['to', 'from'].map((direction) =>
      VisibilityOverride.applyVisibilityOverride(leaves(direction), subject, {
        ruleElementId: 'shared-item',
      }),
    ),
  );
  expect(subject.document.getFlag('pf2e-visioner', 'visibilityReplacements')).toHaveLength(2);
  expect(RuleElementChecker.checkVisibilityReplacement(subject, other, 'observed')?.state).toBe(
    'concealed',
  );
  expect(RuleElementChecker.checkVisibilityReplacement(other, subject, 'observed')?.state).toBe(
    'concealed',
  );
});

test('ranged replacements use native token distance without removed grid APIs', async () => {
  const subject = token('subject'),
    other = token('other');
  canvas.tokens.placeables = [subject, other];
  const original = canvas.grid.measureDistance;
  canvas.grid.measureDistance = () => {
    throw Error('Removed API');
  };
  try {
    await VisibilityOverride.applyVisibilityOverride({ ...leaves('from'), range: 1 }, subject);
    expect(RuleElementChecker.checkVisibilityReplacement(other, subject, 'observed')).toBeNull();
    await VisibilityOverride.applyVisibilityOverride({ ...leaves('from'), range: 10 }, subject);
    expect(RuleElementChecker.checkVisibilityReplacement(other, subject, 'observed')?.state).toBe(
      'concealed',
    );
  } finally {
    canvas.grid.measureDistance = original;
  }
});

test('independent to/from replacements survive and do not downgrade worse visibility', async () => {
  const inside = token('inside'),
    outside = token('outside');
  canvas.tokens.placeables = [inside, outside];
  await VisibilityOverride.applyVisibilityOverride(leaves('to'), inside, {
    ruleElementId: 'area-to',
  });
  await VisibilityOverride.applyVisibilityOverride(leaves('from'), inside, {
    ruleElementId: 'area-from',
  });
  expect(RuleElementChecker.checkVisibilityReplacement(inside, outside, 'observed')?.state).toBe(
    'concealed',
  );
  expect(RuleElementChecker.checkVisibilityReplacement(outside, inside, 'observed')?.state).toBe(
    'concealed',
  );
  for (const state of ['hidden', 'undetected', 'concealed'])
    expect(RuleElementChecker.checkVisibilityReplacement(outside, inside, state)).toBeNull();
  await VisibilityOverride.removeVisibilityOverride(leaves('from'), inside, 'area-from');
  expect(RuleElementChecker.checkVisibilityReplacement(inside, outside, 'observed')?.state).toBe(
    'concealed',
  );
  expect(RuleElementChecker.checkVisibilityReplacement(outside, inside, 'observed')).toBeNull();
});

test('one immune or unmatched replacement does not block another eligible source', async () => {
  const inside = token('inside'),
    outside = token('outside');
  canvas.tokens.placeables = [inside, outside];
  await outside.document.setFlag('pf2e-visioner', 'ignoredVisibilitySources', {
    caster: { sourceTags: ['leaves'], fromStates: ['concealed'] },
  });
  await VisibilityOverride.applyVisibilityOverride(
    { ...leaves('from'), source: 'mist', sourceTags: ['mist'] },
    inside,
    { ruleElementId: 'mist' },
  );
  await VisibilityOverride.applyVisibilityOverride(leaves('from'), inside, {
    ruleElementId: 'leaves',
  });
  expect(RuleElementChecker.checkVisibilityReplacement(outside, inside, 'observed')?.source).toBe(
    'mist',
  );
});

test('queued removal preserves concurrent independent additions', async () => {
  const subject = token('subject'),
    other = token('other');
  canvas.tokens.placeables = [subject, other];
  await VisibilityOverride.applyVisibilityOverride(leaves('to'), subject, {
    ruleElementId: 'first',
  });
  const write = subject.document.setFlag;
  subject.document.setFlag = async (...args) => {
    await Promise.resolve();
    await write(...args);
  };
  await Promise.all([
    VisibilityOverride.applyVisibilityOverride(leaves('from'), subject, {
      ruleElementId: 'second',
    }),
    VisibilityOverride.removeVisibilityOverride(leaves('to'), subject, 'first'),
  ]);
  expect(
    subject.document.getFlag('pf2e-visioner', 'visibilityReplacements').map((s) => s.ownerId),
  ).toEqual(['second']);
});
