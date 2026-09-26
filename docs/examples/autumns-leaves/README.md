# Autumn's Leaves

Import `in-area.json` as a world effect item. Import `caster.json`, then replace
`Item.REPLACE_WITH_IN_AREA_EFFECT_ID` in its Aura rule with the imported In Area
item's UUID. Apply the Caster effect to the caster; PF2e applies and removes the
In Area effect through its native Aura.

Both In Area visibility operations replace only Observed with Concealed. A
direct `state: "concealed"` override would also force invisible creatures to
Concealed. The caster ignores only sources tagged `autumns-embrace`, preserving
invisibility and concealment from other sources.

Visibility replacements now coexist by source and direction. Removing an effect
removes its own replacements without discarding other effects' replacements.

Live regression: `regression-autumn-leaves-aura` exercises the native Aura,
both directions, source immunity, invisibility, exit, reentry, and dismissal.

Generic live regression: `regression-generic-visibility-replacements` uses
independent effects with unrelated source IDs. It checks priority against
creation order, editing direction, removing one item while preserving another,
range exclusions, invisibility, and final cleanup on GM and player clients.

## Custom factor labels

Set the optional `label` on a `PF2eVisionerEffect` rule to customize the
visibility factor text returned by `getVisibilityFactors` (used by integrations
such as chat cards):

```json
{
  "key": "PF2eVisionerEffect",
  "label": "Autumn's Leaves",
  "operations": [{
    "type": "overrideVisibility",
    "direction": "from",
    "fromStates": ["observed"],
    "toState": "concealed",
    "source": "autumn-leaves-within",
    "sourceTags": ["autumns-embrace"]
  }]
}
```

An operation's own `label` takes precedence over the RE label. Unlabeled
overrides retain the localized ?Rule-element override? fallback. Labels are
display text; source IDs, tags, and the `rule-element-override` slug stay unchanged.
Only the applicable winning override is reported for an observer/target pair.

When PF2e Utility Buttons is enabled with libWrapper, Visioner also displays the
custom label in its visible flat-check source description. The label is saved
with the roll, so older cards retain it after effects are edited or removed.

Enable those modules in the disposable QA world, then run
`regression-generic-visibility-replacements` to test real Utility Buttons cards,
stacked priority, both directions, and retained labels. Without Utility Buttons,
the same regression tests Visioner's factor API only.
