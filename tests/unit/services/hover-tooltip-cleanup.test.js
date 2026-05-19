import {
  destroyCoverTooltipIndicator,
  destroyVisibilityBadge,
  destroyVisibilityTooltipIndicator,
  removeTooltipDomElement,
} from '../../../scripts/services/HoverTooltip/hover-tooltip-cleanup.js';

function makeElement() {
  return { remove: jest.fn() };
}

function makeIndicator(fields = {}) {
  return {
    ...fields,
    parent: { removeChild: jest.fn() },
    destroy: jest.fn(),
    _suppressionBadgeEl: makeElement(),
  };
}

describe('hover tooltip cleanup', () => {
  test('removes DOM element defensively', () => {
    const element = makeElement();

    removeTooltipDomElement(element);
    removeTooltipDomElement({
      remove: () => {
        throw new Error('boom');
      },
    });

    expect(element.remove).toHaveBeenCalledTimes(1);
  });

  test('destroys visibility tooltip indicator and clears DOM fields', () => {
    const indicator = makeIndicator({
      _senseBadgeEl: makeElement(),
      _visBadgeEl: makeElement(),
      _coverBadgeEl: makeElement(),
      _tooltipAnchor: makeElement(),
    });

    destroyVisibilityTooltipIndicator(indicator);

    expect(indicator._senseBadgeEl).toBeUndefined();
    expect(indicator._visBadgeEl).toBeUndefined();
    expect(indicator._coverBadgeEl).toBeUndefined();
    expect(indicator._tooltipAnchor).toBeUndefined();
    expect(indicator._suppressionBadgeEl).toBeUndefined();
    expect(indicator.parent.removeChild).toHaveBeenCalledWith(indicator);
    expect(indicator.destroy).toHaveBeenCalledWith({
      children: true,
      texture: true,
      baseTexture: true,
    });
  });

  test('destroys cover tooltip indicator fields only', () => {
    const indicator = makeIndicator({
      _coverBadgeEl: makeElement(),
      _tooltipAnchor: makeElement(),
      _visBadgeEl: makeElement(),
    });

    destroyCoverTooltipIndicator(indicator);

    expect(indicator._coverBadgeEl).toBeUndefined();
    expect(indicator._tooltipAnchor).toBeUndefined();
    expect(indicator._visBadgeEl).toBeTruthy();
  });

  test('destroys visibility badge DOM and container', () => {
    const badge = {
      badgeEl: makeElement(),
      tooltipEl: makeElement(),
      container: {
        parent: { removeChild: jest.fn() },
        destroy: jest.fn(),
      },
    };

    destroyVisibilityBadge(badge);

    expect(badge.badgeEl.remove).toHaveBeenCalled();
    expect(badge.tooltipEl.remove).toHaveBeenCalled();
    expect(badge.container.parent.removeChild).toHaveBeenCalledWith(badge.container);
    expect(badge.container.destroy).toHaveBeenCalledWith({
      children: true,
      texture: true,
      baseTexture: true,
    });
  });
});
