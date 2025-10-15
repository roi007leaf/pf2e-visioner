export function getVisibilityBetweenWithRuleElements(observer, target) {
  try {
    const { getVisibilityBetween } = require('../../scripts/utils.js');
    return getVisibilityBetween(observer, target);
  } catch {
    return 'observed';
  }
}

export function getCoverBetweenWithRuleElements(observer, target) {
  try {
    const { getCoverBetween } = require('../../scripts/utils.js');
    return getCoverBetween(observer, target);
  } catch {
    return 'none';
  }
}
