import '../../setup.js';

jest.mock('../../../scripts/chat/services/position/PositionTracker.js', () => ({
  __esModule: true,
  default: {
    _capturePositionState: jest.fn(async () => ({ avsVisibility: 'observed', coverState: 'none' })),
  },
}));

function createHider(effects = [], feats = []) {
  const actor = {
    items: feats.map((slug) => ({ type: 'feat', system: { slug } })),
    itemTypes: { effect: effects, feat: [], action: [] },
    system: { attributes: {} },
  };
  const token = { id: 'hider', actor, document: { id: 'hider', getFlag: () => undefined } };
  actor.getActiveTokens = () => [token];
  return token;
}

const hideBypassEffect = {
  id: 'eff',
  type: 'effect',
  system: { slug: 'effect-visioner-chameleon-suit' },
  flags: { 'pf2e-visioner': { stealthPrerequisiteBypass: ['hide'] } },
};

async function qualify(hider) {
  const { resolveHidePositionQualification } = await import(
    '../../../scripts/chat/services/actions/Hide/hide-position-qualification.js'
  );
  return resolveHidePositionQualification({
    actionData: { actor: hider, actorToken: hider },
    subject: { id: 'observer' },
    current: 'observed',
  });
}

describe('Hide prerequisite bypass survives rule element check', () => {
  test('item bypass effect keeps end qualification without cover/concealment', async () => {
    const result = await qualify(createHider([hideBypassEffect]));
    expect(result.endQualifies).toBe(true);
  });

  test('legendary sneak keeps end qualification without cover/concealment', async () => {
    const result = await qualify(createHider([], ['legendary-sneak']));
    expect(result.endQualifies).toBe(true);
  });

  test('no bypass still fails end qualification', async () => {
    const result = await qualify(createHider());
    expect(result.endQualifies).toBe(false);
  });
});
