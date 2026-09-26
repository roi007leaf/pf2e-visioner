import { ignoresVisibilitySource, normalizeVisibilitySourceTags, setIgnoredVisibilitySources, removeIgnoredVisibilitySources } from '../../../scripts/rule-elements/visibility-source-tags.js';
import { RuleElementChecker } from '../../../scripts/rule-elements/RuleElementChecker.js';

describe('visibility source immunity', () => {
  const observer = () => ({ id: 'observer', document: { getFlag: (_scope, key) => key === 'ignoredVisibilitySources' ? { immunity: { sourceTags: ['smoke'], fromStates: ['concealed', 'hidden'] } } : null } });

  test('conditional overrides evaluate current actor conditions, not the creation snapshot', () => {
    const config = { active: true, state: 'concealed', condition: 'invisible', thenState: 'concealed', elseState: 'observed', direction: 'from' };
    const target = { actor: { itemTypes: { condition: [{ slug: 'invisible' }] } }, document: { getFlag: () => config } };
    expect(RuleElementChecker.checkRuleElementOverride(observer(), target)?.state).toBe('concealed');
    target.actor.itemTypes.condition = [];
    expect(RuleElementChecker.checkRuleElementOverride(observer(), target)?.state).toBe('observed');
  });

  test('normalizes tags and only ignores tagged matching states', () => {
    expect(normalizeVisibilitySourceTags(' Smoke, smoke, mist ')).toEqual(['smoke', 'mist']);
    expect(ignoresVisibilitySource(observer(), ['Smoke'], 'hidden')).toBe(true);
    expect(ignoresVisibilitySource(observer(), [], 'concealed')).toBe(false);
    expect(ignoresVisibilitySource(observer(), ['blur'], 'concealed')).toBe(false);
    expect(ignoresVisibilitySource(observer(), ['smoke'], 'undetected')).toBe(false);
  });

  test('ignoring smoke preserves an independent Blur source', () => {
    const smoke = { active: true, id: 'smoke', state: 'concealed', sourceTags: ['smoke'], direction: 'from', priority: 200 };
    const blur = { id: 'blur', state: 'concealed', sourceTags: ['blur'], direction: 'from', priority: 100 };
    const target = { id: 'target', document: { getFlag: (_scope, key) => key === 'ruleElementOverride' ? smoke : key === 'stateSource' ? { visibilityByObserver: { observer: { sources: [smoke, blur] } } } : null } };
    expect(RuleElementChecker.checkRuleElementOverride(observer(), target)?.source).toBe('blur');
    target.document.getFlag = (_scope, key) => key === 'ruleElementOverride' ? smoke : null;
    expect(RuleElementChecker.checkRuleElementOverride(observer(), target)).toBeNull();
  });

  test('adding and removing one immunity preserves other effects', async () => {
    const entries = { other: { sourceTags: ['mist'] } };
    const token = { document: { getFlag: () => entries, setFlag: jest.fn(), unsetFlag: jest.fn() } };
    await setIgnoredVisibilitySources(token, 'new', { sourceTags: ['Smoke'] });
    expect(token.document.setFlag).toHaveBeenCalledWith('pf2e-visioner', 'ignoredVisibilitySources', expect.objectContaining({ other: entries.other, new: { sourceTags: ['smoke'], fromStates: ['concealed', 'hidden'] } }));
    await removeIgnoredVisibilitySources(token, 'other');
    expect(token.document.unsetFlag).toHaveBeenCalledWith('pf2e-visioner', 'ignoredVisibilitySources');
    entries.new = { sourceTags: ['smoke'] };
    await removeIgnoredVisibilitySources(token, 'other');
    expect(token.document.setFlag).toHaveBeenLastCalledWith('pf2e-visioner', 'ignoredVisibilitySources', { '-=other': null });
  });
});
