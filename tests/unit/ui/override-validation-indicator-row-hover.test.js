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
    global.PIXI = {
      Graphics: jest.fn(() => {
        const graphics = {
          clear: jest.fn(),
          lineStyle: jest.fn(),
          drawRoundedRect: jest.fn(),
          destroy: jest.fn(),
          parent: null,
        };
        graphicsCreated.push(graphics);
        return graphics;
      }),
    };

    global.canvas.tokens.addChild = jest.fn((child) => {
      child.parent = global.canvas.tokens;
    });
    global.canvas.tokens.removeChild = jest.fn((child) => {
      child.parent = null;
    });

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

    row.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));

    expect(observer._pf2eVisionerObserverHoverBorder).toBeUndefined();
    expect(target._pf2eVisionerTargetHoverBorder).toBeUndefined();
    expect(graphicsCreated[0].destroy).toHaveBeenCalled();
    expect(graphicsCreated[1].destroy).toHaveBeenCalled();
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
});
