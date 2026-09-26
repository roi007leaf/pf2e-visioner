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
