import { OverrideValidationIndicator } from '../../../scripts/ui/OverrideValidationIndicator.js';

const LEGENDARY_SNEAK_RULES_TEXT =
  "You're always sneaking unless you choose to be seen, even when there's nowhere to hide. You can Hide and Sneak even without cover or being Concealed. When you employ an exploration tactic other than Avoiding Notice, you also gain the benefits of Avoiding Notice unless you choose not to.";

describe('OverrideValidationIndicator row hover highlighting', () => {
  let indicator;
  let graphicsCreated;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.querySelector('#pf2e-visioner-override-indicator-styles')?.remove();

    graphicsCreated = [];
    const makeContainer = () => ({
      children: [],
      addChild(...children) {
        this.children.push(...children);
        return children.at(-1);
      },
      destroy: jest.fn(function destroy() {
        for (const child of this.children) child.destroy?.();
      }),
      position: { set: jest.fn() },
      scale: { set: jest.fn() },
      parent: null,
    });
    global.PIXI = {
      Graphics: jest.fn(() => {
        const graphics = {
          clear: jest.fn(),
          lineStyle: jest.fn(),
          beginFill: jest.fn(),
          endFill: jest.fn(),
          drawRoundedRect: jest.fn(),
          destroy: jest.fn(),
          parent: null,
        };
        graphicsCreated.push(graphics);
        return graphics;
      }),
      Container: jest.fn(makeContainer),
      TextStyle: jest.fn((options) => options),
      Text: jest.fn((text, style) => ({
        text,
        style,
        width: text.length * 7,
        height: 16,
        anchor: { set: jest.fn() },
        destroy: jest.fn(),
      })),
    };

    global.canvas.tokens.addChild = jest.fn((child) => {
      child.parent = global.canvas.tokens;
    });
    global.canvas.tokens.removeChild = jest.fn((child) => {
      child.parent = null;
    });
    global.canvas.stage = { scale: { x: 1 } };
    global.canvas.app = {
      ticker: {
        add: jest.fn(),
        remove: jest.fn(),
      },
    };

    const observer = global.createMockToken({ id: 'observer-1', name: 'Observer' });
    const target = global.createMockToken({ id: 'target-1', name: 'Target' });
    global.canvas.tokens.placeables = [observer, target];
    global.canvas.tokens.get = jest.fn((id) =>
      global.canvas.tokens.placeables.find((token) => token.id === id) || null,
    );

    indicator = new OverrideValidationIndicator();
  });

  afterEach(() => {
    indicator?.hide(true);
    document.body.innerHTML = '';
    document.head.querySelector('#pf2e-visioner-override-indicator-styles')?.remove();
  });

  test('highlights observer blue and target yellow while hovering a tooltip row', () => {
    const observer = global.canvas.tokens.get('observer-1');
    const target = global.canvas.tokens.get('target-1');

    indicator.show(
      [
        {
          observerId: observer.id,
          targetId: target.id,
          observerName: observer.name,
          targetName: target.name,
          state: 'hidden',
          currentVisibility: 'observed',
        },
      ],
      'Observer',
    );

    document
      .querySelector('.pf2e-visioner-override-indicator')
      .dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    const row = document.querySelector('.pf2e-visioner-override-tooltip .tip-row');

    row.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

    expect(observer._pf2eVisionerObserverHoverBorder).toBeDefined();
    expect(target._pf2eVisionerTargetHoverBorder).toBeDefined();
    expect(observer._pf2eVisionerObserverHoverBorder.lineStyle).toHaveBeenCalledWith(
      3,
      0x2196f3,
      0.95,
    );
    expect(target._pf2eVisionerTargetHoverBorder.lineStyle).toHaveBeenCalledWith(
      3,
      0xffd54f,
      0.95,
    );
    expect(
      observer._pf2eVisionerObserverHoverLabel.children.find((child) => child.text)?.text,
    ).toBe('OBSERVER · SEES');
    expect(
      target._pf2eVisionerTargetHoverLabel.children.find((child) => child.text)?.text,
    ).toBe('TARGET · HIDDEN → OBSERVED');
    const observerLabel = observer._pf2eVisionerObserverHoverLabel;
    expect(observerLabel.scale.set).toHaveBeenLastCalledWith(1);
    const zoomUpdater = global.canvas.app.ticker.add.mock.calls[0][0];
    global.canvas.stage.scale.x = 0.5;
    zoomUpdater();
    expect(observerLabel.scale.set.mock.calls.at(-1)[0]).toBeGreaterThan(1);

    row.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));

    expect(observer._pf2eVisionerObserverHoverBorder).toBeUndefined();
    expect(target._pf2eVisionerTargetHoverBorder).toBeUndefined();
    expect(observer._pf2eVisionerObserverHoverLabel).toBeUndefined();
    expect(target._pf2eVisionerTargetHoverLabel).toBeUndefined();
    expect(graphicsCreated[0].destroy).toHaveBeenCalled();
    expect(graphicsCreated[1].destroy).toHaveBeenCalled();
    expect(global.canvas.app.ticker.remove).toHaveBeenCalledTimes(2);
  });

  test('explains grouped sections and hover border colors in tooltip', () => {
    const observer = global.canvas.tokens.get('observer-1');
    const target = global.canvas.tokens.get('target-1');

    indicator.show(
      [
        {
          observerId: observer.id,
          targetId: target.id,
          observerName: observer.name,
          targetName: target.name,
          state: 'hidden',
          currentVisibility: 'observed',
        },
      ],
      observer.name,
      observer.id,
    );

    document
      .querySelector('.pf2e-visioner-override-indicator')
      .dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

    const observerHeader = document.querySelector(
      '.pf2e-visioner-override-tooltip .tip-group[data-group="observer"] .tip-subheader',
    );
    expect(observerHeader?.dataset.tooltip).toContain('how this token sees other tokens');

    const legend = document.querySelector('.pf2e-visioner-override-tooltip .hover-border-legend');
    expect(legend?.textContent).toContain('Blue border');
    expect(legend?.textContent).toContain('observer');
    expect(legend?.textContent).toContain('Yellow border');
    expect(legend?.textContent).toContain('target');
  });

  test('explains target grouped section in tooltip', () => {
    const observer = global.canvas.tokens.get('observer-1');
    const target = global.canvas.tokens.get('target-1');

    indicator.show(
      [
        {
          observerId: observer.id,
          targetId: target.id,
          observerName: observer.name,
          targetName: target.name,
          state: 'hidden',
          currentVisibility: 'observed',
        },
      ],
      target.name,
      target.id,
    );

    document
      .querySelector('.pf2e-visioner-override-indicator')
      .dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

    const targetHeader = document.querySelector(
      '.pf2e-visioner-override-tooltip .tip-group[data-group="target"] .tip-subheader',
    );
    expect(targetHeader?.dataset.tooltip).toContain('how other tokens see this token');
  });

  test('cycles queued AVS items without resolving current item', () => {
    const observer = global.canvas.tokens.get('observer-1');
    const firstTarget = global.canvas.tokens.get('target-1');
    const secondTarget = global.createMockToken({ id: 'target-2', name: 'Second Target' });
    global.canvas.tokens.placeables.push(secondTarget);

    indicator.show(
      [{
        observerId: observer.id,
        targetId: firstTarget.id,
        observerName: observer.name,
        targetName: firstTarget.name,
        state: 'hidden',
        currentVisibility: 'observed',
      }],
      firstTarget.name,
      firstTarget.id,
    );
    indicator.show(
      [{
        observerId: observer.id,
        targetId: secondTarget.id,
        observerName: observer.name,
        targetName: secondTarget.name,
        state: 'undetected',
        currentVisibility: 'observed',
      }],
      secondTarget.name,
      secondTarget.id,
    );

    document
      .querySelector('.pf2e-visioner-override-indicator')
      .dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

    expect(document.querySelector('.tip-row .who')?.textContent).toContain('Second Target');
    const next = document.querySelector('[data-action="queue-next"]');
    const previous = document.querySelector('[data-action="queue-previous"]');
    expect(next).toBeTruthy();
    expect(previous).toBeTruthy();

    next.click();
    expect(document.querySelector('.tip-row .who')?.textContent).toContain(firstTarget.name);

    previous.click();
    expect(document.querySelector('.tip-row .who')?.textContent).toContain('Second Target');
    expect(indicator.hasQueuedTokens()).toBe(true);
  });

  test('clears active row highlights when tooltip hides', () => {
    const observer = global.canvas.tokens.get('observer-1');
    const target = global.canvas.tokens.get('target-1');

    indicator.show(
      [
        {
          observerId: observer.id,
          targetId: target.id,
          observerName: observer.name,
          targetName: target.name,
          state: 'hidden',
          currentVisibility: 'observed',
        },
      ],
      'Observer',
    );

    document
      .querySelector('.pf2e-visioner-override-indicator')
      .dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    document
      .querySelector('.pf2e-visioner-override-tooltip .tip-row')
      .dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

    indicator.hide(true);

    expect(observer._pf2eVisionerObserverHoverBorder).toBeUndefined();
    expect(target._pf2eVisionerTargetHoverBorder).toBeUndefined();
  });

  test('renders unnoticed state icons with an inline purple color', () => {
    const observer = global.canvas.tokens.get('observer-1');
    const target = global.canvas.tokens.get('target-1');

    indicator.show(
      [
        {
          observerId: observer.id,
          targetId: target.id,
          observerName: observer.name,
          targetName: target.name,
          state: 'unnoticed',
          currentVisibility: 'observed',
        },
      ],
      'Observer',
    );

    document
      .querySelector('.pf2e-visioner-override-indicator')
      .dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

    const unnoticedIcon = document.querySelector(
      '.pf2e-visioner-override-tooltip .state-indicator.visibility-unnoticed',
    );
    expect(unnoticedIcon).toBeTruthy();
    expect(unnoticedIcon.className).toContain('fa-user-secret');
    expect(unnoticedIcon.getAttribute('style')).toContain('156, 39, 176');
  });

  test('labels concealed override tooltip icons as observed plus concealed', () => {
    const observer = global.canvas.tokens.get('observer-1');
    const target = global.canvas.tokens.get('target-1');

    indicator.show(
      [
        {
          observerId: observer.id,
          targetId: target.id,
          observerName: observer.name,
          targetName: target.name,
          state: 'concealed',
          currentVisibility: 'observed',
        },
      ],
      'Observer',
    );

    document
      .querySelector('.pf2e-visioner-override-indicator')
      .dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

    const concealedIcon = document.querySelector(
      '.pf2e-visioner-override-tooltip .state-indicator.visibility-concealed',
    );
    expect(concealedIcon).toBeTruthy();
    expect(concealedIcon.dataset.tooltip).toBe(
      'PF2E_VISIONER.VISIBILITY_STATES.observed_concealed',
    );
  });

  test('renders Take Cover cover-only changes as standard to auto instead of current cover level', () => {
    const observer = global.canvas.tokens.get('observer-1');
    const target = global.canvas.tokens.get('target-1');

    indicator.show(
      [
        {
          observerId: observer.id,
          targetId: target.id,
          observerName: observer.name,
          targetName: target.name,
          state: 'avs',
          coverOnly: true,
          source: 'take_cover_action',
          expectedCover: 'standard',
          currentCover: 'lesser',
        },
      ],
      'Target',
      target.id,
    );

    document
      .querySelector('.pf2e-visioner-override-indicator')
      .dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

    expect(
      document.querySelector('.pf2e-visioner-override-tooltip .state-indicator.cover-standard'),
    ).toBeTruthy();
    expect(
      document.querySelector('.pf2e-visioner-override-tooltip .state-indicator.cover-auto'),
    ).toBeTruthy();
    expect(
      document.querySelector('.pf2e-visioner-override-tooltip .state-indicator.cover-auto')
        .className,
    ).toContain('fa-arrows-rotate');
    expect(
      document.querySelector('.pf2e-visioner-override-tooltip .state-indicator.cover-lesser'),
    ).toBeFalsy();
  });

  test('suppresses Take Cover cover icons on mixed visibility rows', () => {
    const observer = global.canvas.tokens.get('observer-1');
    const target = global.canvas.tokens.get('target-1');

    indicator.show(
      [
        {
          observerId: observer.id,
          targetId: target.id,
          observerName: observer.name,
          targetName: target.name,
          state: 'undetected',
          currentVisibility: 'observed',
          coverOnly: false,
          source: 'sneak_action',
          coverOverrideSource: 'take_cover_action',
          expectedCover: 'standard',
          currentCover: 'none',
          suppressCoverChange: true,
        },
      ],
      'Target',
      target.id,
    );

    document
      .querySelector('.pf2e-visioner-override-indicator')
      .dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

    expect(
      document.querySelector('.pf2e-visioner-override-tooltip .state-indicator.visibility-undetected'),
    ).toBeTruthy();
    expect(
      document.querySelector('.pf2e-visioner-override-tooltip .state-indicator.visibility-observed'),
    ).toBeTruthy();
    expect(
      document.querySelector('.pf2e-visioner-override-tooltip .state-indicator.cover-standard'),
    ).toBeFalsy();
    expect(
      document.querySelector('.pf2e-visioner-override-tooltip .state-indicator.cover-auto'),
    ).toBeFalsy();
    expect(
      document.querySelector('.pf2e-visioner-override-tooltip .state-indicator.cover-none'),
    ).toBeFalsy();
  });

  test('renders auto-calculated cover level with auto marker and actual cover level', () => {
    const observer = global.canvas.tokens.get('observer-1');
    const target = global.canvas.tokens.get('target-1');

    indicator.show(
      [
        {
          observerId: observer.id,
          targetId: target.id,
          observerName: observer.name,
          targetName: target.name,
          state: 'hidden',
          currentVisibility: 'hidden',
          expectedCover: 'none',
          currentCover: 'lesser',
        },
      ],
      'Target',
      target.id,
    );

    document
      .querySelector('.pf2e-visioner-override-indicator')
      .dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

    const autoIcon = document.querySelector(
      '.pf2e-visioner-override-tooltip .state-indicator.cover-auto',
    );
    const lesserIcon = document.querySelector(
      '.pf2e-visioner-override-tooltip .state-indicator.cover-lesser',
    );

    expect(autoIcon).toBeTruthy();
    expect(autoIcon.className).toContain('fa-arrows-rotate');
    expect(autoIcon.dataset.tooltip).toContain('Auto cover calculation');
    expect(lesserIcon).toBeTruthy();
    expect(lesserIcon.dataset.tooltip).toContain('auto calculated');
  });

  test('renders Legendary Sneak context next to the moved target name', () => {
    const observer = global.canvas.tokens.get('observer-1');
    const target = global.canvas.tokens.get('target-1');
    const secondObserver = global.createMockToken({ id: 'observer-2', name: 'Second Observer' });
    global.canvas.tokens.placeables.push(secondObserver);

    indicator.show(
      [
        {
          observerId: observer.id,
          targetId: target.id,
          observerName: observer.name,
          targetName: target.name,
          state: 'undetected',
          currentVisibility: 'observed',
          stealthPositionBypassFeat: 'legendary-sneak',
          stealthPositionBypassLabel: 'Legendary Sneak',
          stealthPositionBypassIcon: 'fas fa-user-ninja',
          stealthPositionBypassTooltip: LEGENDARY_SNEAK_RULES_TEXT,
        },
        {
          observerId: secondObserver.id,
          targetId: target.id,
          observerName: secondObserver.name,
          targetName: target.name,
          state: 'undetected',
          currentVisibility: 'observed',
          stealthPositionBypassFeat: 'legendary-sneak',
          stealthPositionBypassLabel: 'Legendary Sneak',
          stealthPositionBypassIcon: 'fas fa-user-ninja',
          stealthPositionBypassTooltip: LEGENDARY_SNEAK_RULES_TEXT,
        },
      ],
      target.name,
      target.id,
    );

    document
      .querySelector('.pf2e-visioner-override-indicator')
      .dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

    const headerBadge = document.querySelector(
      '.pf2e-visioner-override-tooltip .tip-group[data-group="target"] .moving-token-indicator .stealth-position-bypass-badge',
    );
    expect(headerBadge).toBeTruthy();
    expect(headerBadge.textContent).toContain('Legendary Sneak');
    expect(headerBadge.getAttribute('data-tooltip')).toContain("there's nowhere to hide");
    expect(headerBadge.getAttribute('data-tooltip')).toContain('Avoiding Notice');
    expect(
      document.querySelector(
        '.pf2e-visioner-override-tooltip .tip-row .stealth-position-bypass-badge',
      ),
    ).toBeFalsy();
  });

  test('renders stable visibility overrides as release-to-AVS rows', () => {
    const observer = global.canvas.tokens.get('observer-1');
    const target = global.canvas.tokens.get('target-1');

    indicator.show(
      [
        {
          observerId: observer.id,
          targetId: target.id,
          observerName: observer.name,
          targetName: target.name,
          state: 'hidden',
          currentVisibility: 'hidden',
          controlReleaseOnly: true,
          reason: 'Return to AVS control',
        },
      ],
      target.name,
      target.id,
    );

    document
      .querySelector('.pf2e-visioner-override-indicator')
      .dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

    const row = document.querySelector('.pf2e-visioner-override-tooltip .tip-row');
    expect(row).toBeTruthy();
    expect(
      document.querySelector('.pf2e-visioner-override-tooltip .state-indicator.visibility-avs'),
    ).toBeTruthy();
    expect(
      document.querySelector('.pf2e-visioner-override-tooltip .state-indicator.visibility-avs')
        .dataset.tooltip,
    ).toContain('AVS');
  });
});
