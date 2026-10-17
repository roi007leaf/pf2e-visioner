import {
  findHoveredTooltipBadge,
  isTooltipBadgeElement,
  markTooltipBadgeElement,
  watchTooltipBadgeHoverExit,
} from '../../../scripts/services/HoverTooltip/hover-tooltip-badge-hover.js';
import {
  createSenseTooltipBadge,
  createVisibilityFactorBadge,
} from '../../../scripts/services/HoverTooltip/hover-tooltip-badge-elements.js';

function makeBadge() {
  const badge = markTooltipBadgeElement(document.createElement('div'));
  const icon = document.createElement('i');
  badge.appendChild(icon);
  document.body.appendChild(badge);
  return { badge, icon };
}

function firePointerOver(target) {
  target.dispatchEvent(new Event('pointerover', { bubbles: true }));
}

describe('hover tooltip badge hover', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('tooltip badge containers are marked as badge elements', () => {
    const sense = createSenseTooltipBadge({
      left: 0,
      top: 0,
      sense: 'darkvision',
      badgeWidth: 20,
      badgeHeight: 20,
      borderRadius: 4,
      iconPx: 12,
    });
    const factor = createVisibilityFactorBadge({ iconClass: 'fa-solid fa-eye', iconColor: '#fff' });

    expect(isTooltipBadgeElement(sense.querySelector('i'))).toBe(true);
    expect(isTooltipBadgeElement(factor.querySelector('i'))).toBe(true);
    expect(isTooltipBadgeElement(document.createElement('canvas'))).toBe(false);
  });

  test('findHoveredTooltipBadge returns badge under innermost hovered element', () => {
    const { badge, icon } = makeBadge();
    const doc = { querySelectorAll: () => [document.body, badge, icon] };

    expect(findHoveredTooltipBadge(doc)).toBe(badge);
    expect(findHoveredTooltipBadge({ querySelectorAll: () => [document.body] })).toBeNull();
  });

  test('moving within badges does not exit', () => {
    const { icon } = makeBadge();
    const onExit = jest.fn();
    watchTooltipBadgeHoverExit({ token: { hover: false }, onExit });

    firePointerOver(icon);
    jest.advanceTimersByTime(100);

    expect(onExit).not.toHaveBeenCalled();
  });

  test('leaving badge back onto the hovered token does not exit', () => {
    const token = { hover: false };
    const canvasEl = document.body.appendChild(document.createElement('canvas'));
    const onExit = jest.fn();
    watchTooltipBadgeHoverExit({ token, onExit });

    firePointerOver(canvasEl);
    token.hover = true;
    jest.advanceTimersByTime(100);

    expect(onExit).not.toHaveBeenCalled();
  });

  test('leaving badge away from the token exits once', () => {
    const canvasEl = document.body.appendChild(document.createElement('canvas'));
    const onExit = jest.fn();
    watchTooltipBadgeHoverExit({ token: { hover: false }, onExit });

    firePointerOver(canvasEl);
    firePointerOver(canvasEl);
    jest.advanceTimersByTime(100);

    expect(onExit).toHaveBeenCalledTimes(1);
  });

  test('cancel stops pending exit', () => {
    const canvasEl = document.body.appendChild(document.createElement('canvas'));
    const onExit = jest.fn();
    const cancel = watchTooltipBadgeHoverExit({ token: { hover: false }, onExit });

    firePointerOver(canvasEl);
    cancel();
    jest.advanceTimersByTime(100);

    expect(onExit).not.toHaveBeenCalled();
  });
});
