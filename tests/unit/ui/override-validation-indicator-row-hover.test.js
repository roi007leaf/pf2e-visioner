import { OverrideValidationIndicator } from '../../../scripts/ui/OverrideValidationIndicator.js';

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

  test('renders unnoticed state icons with the purple tooltip color rule', () => {
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

    const styleText = document.querySelector('#pf2e-visioner-override-indicator-styles')?.textContent;
    expect(styleText).toContain('.state-indicator.visibility-unnoticed');
    expect(styleText).toContain('--visibility-unnoticed');
  });
});
