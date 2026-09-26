import { MODULE_ID } from '../constants.js';

export function normalizeVisibilitySourceTags(tags) {
  const values = Array.isArray(tags) ? tags : String(tags ?? '').split(',');
  return [...new Set(values.map(tag => String(tag).trim().toLowerCase()).filter(Boolean))];
}

export function ignoresVisibilitySource(observer, sourceTags, state = 'concealed') {
  const tags = normalizeVisibilitySourceTags(sourceTags);
  if (!tags.length) return false;
  const entries = observer?.document?.getFlag?.(MODULE_ID, 'ignoredVisibilitySources') || {};
  return Object.values(entries).some(entry =>
    (entry.fromStates || ['concealed', 'hidden']).includes(state) &&
    normalizeVisibilitySourceTags(entry.sourceTags).some(tag => tags.includes(tag)),
  );
}

export async function setIgnoredVisibilitySources(token, sourceId, operation) {
  if (!token?.document || !sourceId) return;
  const entries = token.document.getFlag(MODULE_ID, 'ignoredVisibilitySources') || {};
  await token.document.setFlag(MODULE_ID, 'ignoredVisibilitySources', {
    ...entries,
    [sourceId]: {
      sourceTags: normalizeVisibilitySourceTags(operation.sourceTags),
      fromStates: operation.fromStates?.length ? operation.fromStates : ['concealed', 'hidden'],
    },
  });
}

export async function removeIgnoredVisibilitySources(token, sourceId) {
  const entries = token?.document?.getFlag?.(MODULE_ID, 'ignoredVisibilitySources') || {};
  if (!(sourceId in entries)) return;
  if (Object.keys(entries).length === 1) await token.document.unsetFlag(MODULE_ID, 'ignoredVisibilitySources');
  else await token.document.setFlag(MODULE_ID, 'ignoredVisibilitySources', { [`-=${sourceId}`]: null });
}
