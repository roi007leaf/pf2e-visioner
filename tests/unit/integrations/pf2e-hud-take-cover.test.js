import {
  handlePf2eHudTakeCoverClick,
  isPf2eHudTakeCoverElement,
  resolvePf2eHudActorToken,
} from '../../../scripts/integrations/pf2e-hud-take-cover.js';

describe('PF2E HUD Take Cover integration', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    game.modules.get = jest.fn((id) => ({ active: id === 'pf2e-hud' }));
    game.settings.get = jest.fn((moduleId, settingId) => {
      if (moduleId === 'pf2e-visioner' && settingId === 'autoVisibilityEnabled') return true;
      if (moduleId === 'pf2e-visioner' && settingId === 'ignoreAllies') return false;
      return false;
    });
    canvas.tokens.controlled = [];
    canvas.tokens.placeables = [];
  });

  it('identifies PF2E HUD Take Cover buttons only inside PF2E HUD UI', () => {
    document.body.innerHTML = `
      <section id="pf2e-hud-token"><a id="hud-cover" data-action="take-cover"></a></section>
      <section id="other"><a id="other-cover" data-action="take-cover"></a></section>
      <section id="pf2e-hud-persistent"><a id="other-action" data-action="raise-shield"></a></section>
    `;

    expect(isPf2eHudTakeCoverElement(document.getElementById('hud-cover'))).toBe(true);
    expect(isPf2eHudTakeCoverElement(document.getElementById('other-cover'))).toBe(false);
    expect(isPf2eHudTakeCoverElement(document.getElementById('other-action'))).toBe(false);
  });

  it('resolves the clicked HUD actor from its owning application before controlled tokens', () => {
    document.body.innerHTML = `
      <section id="pf2e-hud-persistent"><a id="hud-cover" data-action="take-cover"></a></section>
    `;
    const hud = document.getElementById('pf2e-hud-persistent');
    const appToken = { id: 'app-token', actor: { id: 'actor-app' } };
    const controlledToken = { id: 'controlled-token', actor: { id: 'actor-controlled' } };

    global.ui = {
      windows: {
        hud: {
          element: hud,
          actor: {
            id: 'actor-app',
            getActiveTokens: jest.fn(() => [appToken]),
          },
        },
      },
      notifications: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    };
    canvas.tokens.controlled = [controlledToken];

    expect(resolvePf2eHudActorToken(document.getElementById('hud-cover'))).toBe(appToken);
  });

  it('captures active PF2E HUD Take Cover clicks and opens Visioner preview', async () => {
    document.body.innerHTML = `
      <section id="pf2e-hud-token"><a id="hud-cover" data-action="take-cover"></a></section>
    `;
    const token = { id: 'actor-token', actor: { id: 'actor' } };
    canvas.tokens.controlled = [token];
    const preview = jest.fn();
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    const stopImmediatePropagation = jest.spyOn(event, 'stopImmediatePropagation');

    const handled = await handlePf2eHudTakeCoverClick(event, {
      preview,
      target: document.getElementById('hud-cover'),
    });

    expect(handled).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(stopImmediatePropagation).toHaveBeenCalled();
    expect(preview).toHaveBeenCalledWith(token);
  });

  it('leaves PF2E HUD Take Cover alone when Visioner automation is disabled', async () => {
    document.body.innerHTML = `
      <section id="pf2e-hud-token"><a id="hud-cover" data-action="take-cover"></a></section>
    `;
    game.settings.get = jest.fn(() => false);
    canvas.tokens.controlled = [{ id: 'actor-token', actor: { id: 'actor' } }];
    const preview = jest.fn();
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });

    const handled = await handlePf2eHudTakeCoverClick(event, {
      preview,
      target: document.getElementById('hud-cover'),
    });

    expect(handled).toBe(false);
    expect(event.defaultPrevented).toBe(false);
    expect(preview).not.toHaveBeenCalled();
  });
});
