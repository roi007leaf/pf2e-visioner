# Visibility source tags

Tag a concealment region using its **Source Tags** field, for example `smoke`.
An observer can ignore that source without ignoring walls, dim light, or other spells:

```json
{
  "key": "PF2eVisionerEffect",
  "operations": [{
    "type": "ignoreVisibilitySources",
    "sourceTags": ["smoke"],
    "fromStates": ["concealed", "hidden"]
  }]
}
```

Visibility overrides and conditional visibility operations also accept `sourceTags`.
For example, add `"sourceTags": ["blur"]` to a Blur visibility operation.
Tags match without regard to capitalization. Untagged sources are unaffected.
Removing the immunity effect restores normal source evaluation.

Spell visibility overrides are evaluated after line of sight. Blur and Faerie Fire
cannot make a creature observed or concealed through a sight-blocking wall.
Explicit manual GM overrides retain their existing behavior.

**AVS Concealment** regions model concealment along a sight ray.
**Visioner Visibility** regions apply configured visibility states on selected
region events. Both invalidate automatic visibility when their configuration changes.
