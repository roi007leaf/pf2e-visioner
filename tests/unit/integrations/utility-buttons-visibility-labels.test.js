jest.mock('../../../scripts/rule-elements/visibility-override-factor.js', () => ({
  getVisibilityOverrideFactor: jest.fn(() => ({ label: 'Leaves' })),
}));
jest.mock('../../../scripts/stores/visibility-map.js', () => ({
  getVisibilityBetween: jest.fn(() => 'concealed'),
  getPerceptionProfileBetween: jest.fn(() => ({})),
}));

const {
  snapshotUtilityButtonsVisibilityLabel,
  renderUtilityButtonsVisibilityLabel,
} = require('../../../scripts/integrations/utility-buttons-visibility-labels.js');

const message = (checks) => ({
  getFlag: () => checks,
  token: { object: {} },
  target: { token: { object: {} } },
  updateSource: jest.fn(),
});

test('snapshots only the actual rule override used in the roll', () => {
  const m = message({
    target: {
      type: 'concealed',
      origin: {
        slug: 'rule-element-override',
        reasons: ['Leaves'],
      },
    },
  });
  snapshotUtilityButtonsVisibilityLabel(m);
  expect(m.updateSource).toHaveBeenCalledWith({
    'flags.pf2e-flatcheck-helper.flatchecks.target.origin.label': 'Leaves',
  });
  const ignored = message({ target: { origin: { slug: 'invisible', reasons: ['Leaves'] } } });
  snapshotUtilityButtonsVisibilityLabel(ignored);
  expect(ignored.updateSource).not.toHaveBeenCalled();
  const unrelated = message({
    target: {
      origin: {
        slug: 'rule-element-override',
        reasons: ['Mist'],
      },
    },
  });
  snapshotUtilityButtonsVisibilityLabel(unrelated);
  expect(unrelated.updateSource).not.toHaveBeenCalled();
});

test('renders saved label as text on target row, preserving other checks', () => {
  const element = document.createElement('div');
  element.innerHTML =
    '<section class="fc-flatcheck-buttons"><div class="fc-check"><span class="fc-description">Grabbed</span></div><div class="fc-check"><span class="fc-description">Rule-element-override</span></div></section>';
  const m = message({
    grabbed: { type: 'grabbed' },
    target: {
      type: 'concealed',
      origin: {
        slug: 'rule-element-override',
        label: '<img src=x onerror=bad()>',
      },
    },
  });
  renderUtilityButtonsVisibilityLabel(m, element);
  const descriptions = element.querySelectorAll('.fc-description');
  expect(descriptions[0].textContent).toBe('Grabbed');
  expect(descriptions[1].textContent).toBe('<img src=x onerror=bad()>');
  expect(element.querySelector('img')).toBeNull();
});

test('unlabeled cards keep Utility Buttons fallback', () => {
  const element = document.createElement('div');
  element.innerHTML = '<span class="fc-description">Rule-element-override</span>';
  renderUtilityButtonsVisibilityLabel(
    message({
      target: {
        type: 'hidden',
        origin: {
          slug: 'rule-element-override',
        },
      },
    }),
    element,
  );
  expect(element.textContent).toBe('Rule-element-override');
});
