jest.mock('../../../scripts/cover/auto-cover/AutoCoverSystem.js', () => ({
  default: { normalizeTokenRef: (v) => v },
}));

function getManager() {
  jest.unmock('../../../scripts/cover/auto-cover/CoverUIManager.js');
  const mod = jest.requireActual('../../../scripts/cover/auto-cover/CoverUIManager.js');
  if (mod.default?.shouldShowCoverOverrideIndicator) return mod.default;
  if (mod.default?.default?.shouldShowCoverOverrideIndicator) return mod.default.default;
  const ManagerClass =
    mod.CoverUIManager || mod.default?.CoverUIManager || mod.default?.default?.CoverUIManager;
  if (ManagerClass) return new ManagerClass();
  return mod.default || mod;
}

function makeMessage(flags) {
  return { flags, toObject: () => ({ flags }) };
}

function coverAdjustmentFlag() {
  return {
    'pf2e-visioner': {
      coverAdjustment: { originalState: 'standard', finalState: 'none', sources: ['phase-bolt'] },
    },
  };
}

describe('Cover adjustment chat indicator', () => {
  let prevIsGM;

  beforeEach(() => {
    prevIsGM = global.game?.user?.isGM;
    if (!global.game) global.game = { user: { isGM: true } };
    else global.game.user.isGM = true;
  });

  afterEach(() => {
    if (prevIsGM !== undefined) global.game.user.isGM = prevIsGM;
  });

  test('shouldShowCoverOverrideIndicator true with coverAdjustment flag', async () => {
    const mgr = getManager();
    const res = await mgr.shouldShowCoverOverrideIndicator(makeMessage(coverAdjustmentFlag()));
    expect(res).toBe(true);
  });

  test('injectCoverOverrideIndicator adds the cover-adjustment element with original→final', async () => {
    let inserted = '';
    const emptyResult = {
      length: 0,
      first: () => emptyResult,
      after: () => {},
      append: () => {},
      html: () => '',
      is: () => false,
      prepend: () => {},
      find: () => emptyResult,
      filter: () => emptyResult,
      last: () => emptyResult,
      text: () => '',
    };
    const acSpan = { length: 1, first: () => acSpan, after: (html) => (inserted = html) };
    const html = {
      find: (selector) => (selector === '.target-dc .adjusted' ? acSpan : emptyResult),
    };

    const mgr = getManager();
    await mgr.injectCoverOverrideIndicator(makeMessage(coverAdjustmentFlag()), html, true);

    expect(inserted).toContain('pf2e-visioner-cover-adjustment-indicator');
    expect(inserted).toContain('fa-arrow-right');
  });

  test('not shown to non-GM', async () => {
    global.game.user.isGM = false;
    const mgr = getManager();
    const res = await mgr.shouldShowCoverOverrideIndicator(makeMessage(coverAdjustmentFlag()));
    expect(res).toBe(false);
  });
});
