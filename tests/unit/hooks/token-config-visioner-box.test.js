import { MODULE_ID } from '../../../scripts/constants.js';
import { registerUIHooks } from '../../../scripts/hooks/ui.js';

function getRenderTokenConfigHook() {
  registerUIHooks();
  const calls = Hooks.on.mock.calls.filter(([hookName]) => hookName === 'renderTokenConfig');
  return calls.at(-1)?.[1];
}

function makeVisionRoot({ tagName = 'div' } = {}) {
  const root = document.createElement('div');
  root.innerHTML = `
    <form>
      <${tagName} class="tab" data-group="sheet" data-tab="vision">
        <fieldset><legend>Detection</legend></fieldset>
      </${tagName}>
    </form>
  `;
  return root;
}

function makeTokenConfigApp(actorType) {
  const actor = createMockActor({
    type: actorType,
    getFlag: jest.fn(() => null),
  });
  return {
    document: {
      id: `${actorType}-token`,
      uuid: `Token.${actorType}`,
      actor,
      flags: { [MODULE_ID]: {} },
      getFlag: jest.fn(() => null),
    },
  };
}

function makePF2eTokenConfigAppWithActorGetter(actorType) {
  const actor = createMockActor({
    type: actorType,
    getFlag: jest.fn(() => null),
  });
  return {
    actor,
    token: {
      id: `${actorType}-token`,
      uuid: `Token.${actorType}`,
      flags: { [MODULE_ID]: {} },
      getFlag: jest.fn(() => null),
    },
    document: {
      id: `${actorType}-token`,
      uuid: `Token.${actorType}`,
      flags: { [MODULE_ID]: {} },
      getFlag: jest.fn(() => null),
    },
  };
}

describe('Token config PF2E Visioner box', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    game.user.isGM = true;
  });

  test('does not show master controls for hazard tokens', () => {
    const hook = getRenderTokenConfigHook();
    const root = makeVisionRoot();

    hook(makeTokenConfigApp('hazard'), root);

    expect(root.querySelector('.pf2e-visioner-box')).toBeTruthy();
    expect(root.querySelector('.pv-encounter-master-btn')).toBeNull();
    expect(root.querySelector('.pv-vision-master-btn')).toBeNull();
    expect(root.textContent).not.toContain('PF2E_VISIONER.UI.ENCOUNTER_MASTER_LABEL');
    expect(root.textContent).not.toContain('PF2E_VISIONER.UI.VISION_MASTER_LABEL');
  });

  test('keeps master controls for character tokens', () => {
    const hook = getRenderTokenConfigHook();
    const root = makeVisionRoot();

    hook(makeTokenConfigApp('character'), root);

    expect(root.querySelector('.pv-encounter-master-btn')).toBeTruthy();
    expect(root.querySelector('.pv-vision-master-btn')).toBeTruthy();
  });

  test('does not show master controls for loot tokens', () => {
    const hook = getRenderTokenConfigHook();
    const root = makeVisionRoot();

    hook(makeTokenConfigApp('loot'), root);

    expect(root.querySelector('.pf2e-visioner-box')).toBeTruthy();
    expect(root.querySelector('.pv-encounter-master-btn')).toBeNull();
    expect(root.querySelector('.pv-vision-master-btn')).toBeNull();
    expect(root.querySelector('input[name="flags.pf2e-visioner.stealthDC"]')).toBeTruthy();
  });

  test('shows Visioner controls for familiar or animal companion PF2e token configs', () => {
    const hook = getRenderTokenConfigHook();
    const root = makeVisionRoot({ tagName: 'section' });

    hook(makePF2eTokenConfigAppWithActorGetter('familiar'), root);

    expect(root.querySelector('.pf2e-visioner-box')).toBeTruthy();
    expect(root.querySelector('.pv-encounter-master-btn')).toBeTruthy();
    expect(root.querySelector('.pv-vision-master-btn')).toBeTruthy();
  });
});
