# Local automated Foundry tests

Player action cases (`player-native-*` and `player-character-*`) use the supplied
non-GM account. The runner temporarily enables that account's native manual-roll
permission in the QA world and enters dice values automatically. No human dice
entry is needed. Original permission and client dice settings are journaled and
restored, including through `npm run test:live:cleanup` after interruption.
Secret actions use the native roll dialog's public mode for deterministic dice;
these cases do not certify secret-roll privacy.

All scenarios are automated. No guided mode, review prompts, or human pass/fail
verdicts. The full catalog contains **244 scenarios**, including five additional performance workloads, nine player-originated action cases, four player Seek template cases, 48 audit cases, 23 gap cases, 20 action-gap cases and 41 workflows
replacing the former 24 bundled reviews. A workflow records each assertion and
screenshots; a failed or blocked prerequisite never counts as a pass.

This suite runs only locally against a running Foundry world with PF2e and the
source checkout of Visioner installed. It does not start Foundry, run in GitHub
Actions, publish releases, or enter the production ZIP. Migrations are excluded.

## First run

1. Use the repository source checkout, not the installed release ZIP. Open a terminal in its root directory. Install Node 20.17+ or 22.13+.
2. In Foundry Setup, launch a disposable Foundry 14 / PF2e world whose ID is `visioner-qa`. Enable this Visioner module, lib-wrapper, and socketlib. The runner does not create or switch worlds.
3. Create a GM account with a password, a separate player account, and a second GM account for the full suite's handover test. Assign the player a lobby character. Close other sessions logged in as these GMs before testing.
4. Run `npm ci`, then `npx playwright install chromium` once to install dependencies and the browser.
5. Run `npm run test:live:full`. Enter the Foundry URL and requested account credentials. Enter accepts saved defaults; blank player passwords require confirmation. The runner unpauses the QA world itself.
6. Check the terminal summary and `artifacts/live/report.json`. Require every selected case to pass and `cleanup: complete`. Read the per-run report and screenshots for failures; missing prerequisites count as blocked, not passed.

After changing the module version, restart the QA world so Foundry loads the new metadata before collecting release evidence. Keep module and test files unchanged during a run.

```sh
npm ci
npx playwright install chromium
npm run test:live                 # quick smoke suite
npm run test:live:full            # every automated scenario
npm run test:live:performance     # six local performance scenarios only
npm run test:live:list            # exact case names and prerequisites
npm run test:live:harness         # local runner/cleanup tests; no Foundry needed
npm run test:live:cleanup         # recover an interrupted run
npm run test:live:matrix -- report14.json
npm run test:shipping -- report14.json
```

Use Node 20.17+ or 22.13+. Browsers are visible by default for GPU rendering.
`--headless` is optional; `VISIONER_BROWSER_CHANNEL=chrome` selects installed Chrome.
The former `--guided` option is rejected with instructions to use `--full`.

## Accounts and environments

Optional local defaults live at `~/.config/pf2e-visioner/live.json` (on Windows,
`C:\Users\<user>\.config\pf2e-visioner\live.json`), outside the repository and
Foundry's served files. Fields: `url`, plus `gm`, `player`, and optional `gm2`
objects with `username` and `password`. Set `player.allowBlankPassword` to `true`
only for a confirmed blank password. Saved values are prompt defaults: Enter
accepts the saved URL, account name, or password. Passwords are never displayed;
their prompts identify whether Enter keeps a saved password or uses a blank one.
Blank player passwords still receive a confirmation prompt, defaulting to the
saved choice. Explicit environment variables skip their corresponding prompts
for unattended execution and override local defaults.
Changing an account name through the environment does not reuse its saved password.
Never copy this file into the repository, reports, or release archives.

The runner prompts for URL, GM username/password, and a separate player
username/password. GM passwords are required. Blank player passwords require
explicit confirmation. Roles are checked after real logins in independent browser
contexts; the suite never changes user roles or impersonates a player.

Launch **Visioner Automated QA** (`visioner-qa`) in Foundry Setup before running
the suite. Every run checks the exact world ID before submitting login credentials
and again after login. A different or unknown world stops the runner before test
changes, including cleanup. The runner never shuts down or switches worlds.
To use another disposable QA world, explicitly set `VISIONER_DISPOSABLE_WORLD`
to its exact ID. Never set this to a campaign.

For unattended execution, supply these environment variables through your local
secret manager or shell session, never committed files or command arguments:

- `VISIONER_FOUNDRY_URL`
- `VISIONER_GM_USER`, `VISIONER_GM_PASSWORD`
- `VISIONER_PLAYER_USER`, `VISIONER_PLAYER_PASSWORD`
- `VISIONER_PLAYER_ALLOW_BLANK=1` only for an intentionally passwordless player

The GM handover scenario additionally needs a saved `gm2` account or
`VISIONER_GM2_USER` and `VISIONER_GM2_PASSWORD` (password is prompted when omitted). This must be a second
existing GM account. Both QA GMs must be the only active GM accounts in that
world; persistent sessions using either account can prevent authority transfer.
Missing second-GM credentials block this case without creating users.

All scenarios require the expected **disposable QA world**, defaulting to
`visioner-qa`. Settings persistence and GM handover use this same world check.
Other prerequisites, including enabled settings, features in native compendiums,
Foundry version, are checked and reported as blocked when
unavailable. A full run cannot pass until its required prerequisites are present.
No migration testing is performed.

`VISIONER_LIVE_CASE=manager-directions,drag-preview` selects named cases when using
`--full`. Unknown names fail. Unselected cases remain unrun in coverage reports.

For example, in PowerShell:

```powershell
$env:VISIONER_LIVE_CASE = 'audit-gm-observer-foundry-hidden-npc'
npm run test:live:full
Remove-Item Env:VISIONER_LIVE_CASE
```

Remove the filter before running the full suite. For release validation, use the
actual report path, for example `npm run test:shipping -- artifacts/live/<run-UUID>/report.json`.
This checks evidence; it does not run the live suite or publish a release.

## What runs automatically

The catalog exercises visibility/AVS states, senses and conditions, lighting,
cover, movement, player privacy, regions, real encounters/actions, rule elements,
feats, managers, settings and compatibility. See [coverage.md](coverage.md).

Audit additions exercise real timers and validation decisions, peeking and door
approvals, AVS gates, native condition conversion, shared-vision modes, party
restoration, scene preparation, connected-wall Seek/Search, cover saves,
Sense the Unseen and GM keybindings. See the
[feature audit](../../docs/live-feature-audit.md) for remaining untested branches.
Passing every implemented case does not certify exhaustive feature coverage.

New workflows click actual Apply/Revert controls, cancel and commit native held
drags, create native levels/floor surfaces, edit wall/tile cover controls, operate
hazard/loot managers, exercise Point Out and Diversion, test Take Cover expiration,
perform Search, and disconnect/reconnect GM sessions. Encounter fixtures use the native local combat tracker and verify token membership without globally activating the QA combat. Terrain and feature cases
use native compendium items and production rule consumers with eligible,
ineligible and removal checks. Integration probes complement actual UI actions;
a consumer assertion is not claimed as a native Strike modifier assertion.

Action workflows generate native PF2e actions. They also use real evaluated Roll
documents with fixed totals through the production preview dispatcher to exercise
success/failure and individual/bulk Apply/Revert deterministically. Random-number
generation, action handlers and Foundry permissions are never replaced. Native
roll and cover prompts are driven automatically with scoped DOM selectors.

Stored state and rendered artwork are checked separately. Screenshots use a known
texture with distinct colored bars, including grayscale/dim variants. Separate pixel checks require actual wave linework, reject colored hearing after
tremorsense, and verify a background tile remains drawn during scent suppression.
An overlay
covering the sample area fails the visual precondition instead of passing as an
invisible token. The known delayed Settings Synced prompt is dismissed with Later
in the isolated browser; combat panels from PF2e Combater are closed before pixel
sampling. Other obstructions remain explicit failures. Tests do not modify CSS or
render functions to make screenshots pass.

Animation checks measure actual intermediate positions and frame durations.
Limits detect severe stalls, not a guaranteed frame rate on every machine.
Exceptions and console errors during cases fail the run, including errors in
other installed modules. Only the exact expected unsupported-state API error is
allowed in its negative test. Failures need diagnosis before being called module
bugs; setup, prerequisites and unrelated modules can also cause failures.

## Cleanup and recovery

The suite writes an atomic recovery journal before creating documents. Every
fixture actor, scene, combat and chat message carries the run UUID. Each scenario
gets fresh fixtures. Embedded items, walls, tiles, regions and levels follow their
owned parent documents. Scenes are viewed, never activated for other users. Encounter turn updates do not
advance the shared campaign clock.

After each case and on graceful cancellation, the runner restores the QA sessions'
previous scenes, levels, pan/zoom, selections, token targets, encounter view and client GM Observer View setting;
closes applications opened by tests; deletes its owned documents; and verifies no
leftovers. It does not edit existing actors, account roles or assigned characters.
Settings writes use a narrow allowlist and write-ahead backup of original values
and stored-document existence. Both success and failure restore and verify them.

The second GM is included in the recovery journal. A handover always reconnects
its offline browser in a finally block. Recovery requires the original accounts
and matching URL/world. If cleanup fails or the process/machine stops abruptly,
the journal stays for the next run or `test:live:cleanup`. Never manually delete a
pending journal or live runner lock. Native browser operations have timeouts;
Ctrl+C cleanup may wait for the current operation to settle. Cleanup cannot undo
arbitrary side effects of third-party hooks, so prefer a QA world.

Reports and screenshots remain under ignored `artifacts/live/<run UUID>/`.
`artifacts/live/report.json` points to the latest saved report. Credentials and
browser authentication state are not included. Tests do not remove evidence files.

## Coverage and shipping evidence

`node tests/live/run.mjs --coverage` lists required contracts and missing/unrun
scenarios. Every listed contract has an automated definition; that is not proof
that every test passed or that every possible feature combination is covered.
Line/branch coverage has not been established.

The runner automatically unpauses the verified QA world before testing so the
pause banner cannot obscure rendered samples. It saves the original pause state
in the recovery journal first and restores it after success, failure, or cleanup
recovery. Campaign worlds remain blocked. Assign the player a lobby character to avoid
Foundry's first-login character-selection dialog obstructing screenshots.

The local shipping command runs unit tests, lint and runner checks, then validates
explicit reports for Foundry 14. Foundry 13 and legacy Levels/Wall Height
testing are excluded by project scope. It starts no world and publishes nothing. Each profile needs
all applicable cases, matching source/test fingerprints, complete cleanup, and
no startup/version mismatch errors. Reports from changed code or expectations,
manual verdicts, incomplete workflows, blocked tests and unrun tests cannot
certify shipping. Foundry metadata must match the checkout; restart your QA server
when needed before collecting release evidence.

Release archives use an explicit module-file allowlist. `tests/`, `artifacts/`,
`node_modules/`, and development package manifests remain excluded. No live-suite
step is added to any GitHub workflow.
