# Encounter Stealth Initiative Vision Design

## Goal

When an encounter starts, PF2E Visioner should optionally initialize visibility for combatants who rolled initiative with Stealth. A stealth-initiative combatant should be hidden from creatures they beat in initiative, while creatures that tied or beat them should rely on regular AVS visibility. Combat tracker visibility should follow the same rule from each player user's owned-token perspective.

The feature is controlled by a world setting so tables that prefer PF2e Avoid Notice or another encounter-stealth module can keep that workflow without PF2E Visioner changing encounter-start visibility or tracker rows.

## Setting

Add a world setting named `enableStealthInitiativeVisibility` with a user-facing label such as `Encounter stealth initiative visibility`.

- Default: `false`, to preserve existing behavior and avoid conflicts with PF2e Avoid Notice users.
- When disabled, PF2E Visioner does not apply any of this feature's encounter-start visibility writes and does not hide combat tracker rows because of stealth initiative.
- When enabled, all rules in this design apply.
- The setting should be documented as a compatibility choice: enable it if PF2E Visioner should manage Stealth-initiative encounter setup; leave it disabled if PF2e Avoid Notice or another module should manage it.

## Rules

- A stealther is only a combatant whose initiative statistic is exactly `stealth`, read from `combatant.flags.pf2e.initiativeStatistic`.
- Combatants that rolled initiative with Perception or any other skill are not stealther targets for this feature.
- If an observer combatant has initiative lower than the stealther, the observer cannot see the stealther at encounter start. PF2E Visioner will set observer -> stealther visibility to `undetected`.
- If an observer combatant has initiative equal to or higher than the stealther, the observer is treated as beating the stealther. PF2E Visioner will leave that pair to regular AVS calculations.
- Tracker hiding only applies to the initial encounter-start undetected/unnoticed state created by this feature.
- Once a stealther becomes no longer `undetected` or `unnoticed` to a given observer, that observer no longer hides the stealther from the tracker for this encounter. If the stealther later becomes `undetected` again through Sneak or another action, PF2E Visioner does not hide the tracker row again because of this encounter-start feature.
- If either side is missing a numeric initiative, the pair is skipped.
- GM users always see all combat tracker rows.

## Encounter-Start Flow

The GM client handles the setup from the existing combat-start hook after the encounter has combatants.

1. Read `enableStealthInitiativeVisibility`; return immediately if it is disabled.
2. Wait for the started combat to be available, using the same retry pattern as the existing AVS combat-start recalculation.
3. Collect combatants in the active encounter and resolve their scene tokens.
4. Identify stealth-initiative combatants.
5. For each observer/stealther pair:
   - Skip self-pairs.
   - Skip missing tokens or missing numeric initiative values.
   - If `observer.initiative < stealther.initiative`, write observer -> stealther as `undetected`.
   - Record that observer/stealther pair as eligible for initial tracker hiding.
   - If `observer.initiative >= stealther.initiative`, do not write a manual state for this feature; AVS remains authoritative.
6. Refresh tracker row visibility after the writes complete.

This feature should not delete combatants, change ownership, or alter PF2e combatant hidden flags. It only writes PF2E Visioner visibility state and changes client-side tracker row display.

## Tracker Visibility

For non-GM users, a stealth-initiative combatant's tracker row is hidden only if `enableStealthInitiativeVisibility` is enabled and none of the user's available observer tokens should see that stealther through the active initial-hide records.

Available observer tokens are the user's controlled/owned token perspective, following the module's existing permissive camera-vision style: if any owned observer qualifies, the row is shown.

A user should see a stealther row if any available observer token meets either condition:

- Its combatant has initiative equal to or higher than the stealther.
- The current PF2E Visioner visibility from that observer to that stealther is not `undetected` or `unnoticed`.
- The observer/stealther pair no longer has an active initial-hide record because the stealther was already revealed to that observer during this encounter.

If no available observer qualifies, hide the row.

Initial-hide records are encounter-local state. They are created only during the encounter-start setup for lower-initiative observer/stealther pairs. On each tracker refresh or visibility-map update, PF2E Visioner checks each active record; if current visibility is no longer `undetected` or `unnoticed`, it deletes that record. Deleted records are not recreated until a future encounter start.

## PF2e HUD Integration

The PF2e HUD tracker source at `reonZ/pf2e-hud` repo head `9099f17d4f47a2aca9e89c9e8fce778569c4014c` renders rows as:

- Container: `#pf2e-hud-tracker`
- Combatant row: `li.combatant[data-combatant-id="..."]`

PF2E Visioner will hide rows in both:

- Foundry core combat tracker rows matched by `data-combatant-id`.
- PF2e HUD rows matched by `#pf2e-hud-tracker li.combatant[data-combatant-id]`.

Because PF2e HUD re-renders itself from `renderCombatTracker`, PF2E Visioner should apply tracker hiding on `renderCombatTracker`, relevant combat updates, visibility-map updates, and a short deferred pass after the core render hook.

## Components

- `EncounterStealthInitiativeService`: pure-ish encounter analysis and setup helpers.
- Combat hook integration: calls encounter-start setup from the existing combat-start path.
- Tracker visibility helper: computes whether a combatant row should be hidden for the current user and applies DOM hiding to core and PF2e HUD rows.
- Encounter-local initial-hide tracker: remembers which observer/stealther pairs are still in the first hidden state and expires pair records after reveal.
- Settings registration: adds the compatibility setting that gates the feature.

## Testing

Use TDD with focused unit tests before production changes.

Required coverage:

- Only `flags.pf2e.initiativeStatistic === "stealth"` creates stealther behavior.
- Disabled setting performs no encounter-start writes and no tracker row hiding.
- Enabled setting activates the encounter-start writes and tracker hiding.
- Lower initiative observers get observer -> stealther set to `undetected`.
- Equal initiative observers are treated as beating the stealther and are not forced to `undetected`.
- Higher initiative observers are left to AVS.
- Tracker visibility is permissive across multiple owned observer tokens: if one can see, the stealther row stays visible.
- Tracker hiding expires for an observer/stealther pair when visibility becomes something other than `undetected` or `unnoticed`.
- A later Sneak or other action that makes the stealther `undetected` again does not recreate tracker hiding for that pair in the same encounter.
- PF2e HUD selector support hides/shows `#pf2e-hud-tracker li.combatant[data-combatant-id]`.

## Out Of Scope

- Changing PF2e initiative rolling.
- Changing combatant hidden flags or deleting combatants.
- Replacing PF2e HUD rendering.
