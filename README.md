[![Latest Version](https://img.shields.io/github/v/release/roi007leaf/pf2e-visioner?display_name=tag&sort=semver&label=Latest%20Version)](https://github.com/roi007leaf/pf2e-visioner/releases/latest)

[![GitHub all releases](https://img.shields.io/github/downloads/roi007leaf/pf2e-visioner/total)](https://github.com/roi007leaf/pf2e-visioner/releases)

[![Forge Installs](https://img.shields.io/badge/dynamic/json?label=Forge%20Installs&query=package.installs&suffix=%25&url=https%3A%2F%2Fforge-vtt.com%2Fapi%2Fbazaar%2Fpackage%2Fpf2e-visioner)](https://forge-vtt.com/bazaar)

# PF2E Visioner – Advanced Visibility and Cover Toolkit

PF2E Visioner is a comprehensive visibility and cover toolkit for Foundry VTT's Pathfinder 2nd Edition system. It provides granular control over what each creature can see, automates PF2E perception mechanics, and offers an intuitive user experience for both GMs and players.

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/roileaf)

---

Documentation: https://github.com/roi007leaf/pf2e-visioner/wiki

## Local automated tests

From a source checkout, run `npm ci` and `npx playwright install chromium`, then
`npm run test:live:full`. First launch the disposable `visioner-qa` Foundry 14 / PF2e
world with Visioner and its test dependencies enabled. The runner prompts for GM
and player accounts, offers saved defaults, and restores test state during cleanup.
The full suite also requires a second GM account for handover testing.

Use `npm run test:live` for smoke tests and `npm run test:live:cleanup` after an
interrupted run. Reports and screenshots are saved under `artifacts/live/`.
See the [test setup and recovery guide](https://github.com/roi007leaf/pf2e-visioner/blob/main/tests/live/README.md)
for prerequisites and commands. Live tests run locally only; they are excluded
from GitHub workflows and release ZIPs.

## ✅ Requirements

- Foundry VTT v13.341+
- PF2e System v7.0.0+
- lib-wrapper
- Recommended: socketlib (for cross-client perception refresh)

---

## 🔌 Installation

1. Install the module in Foundry's Add-on Modules.
2. Enable it for your world.
3. Configure world settings (Game Settings → Module Settings → PF2E Visioner).


## 📜 License & Credits

- GPL-3.0 license. See `LICENSE`.
- PF2e system: community‑maintained; see their repository for credits.
- Special thanks to contributors and testers.
