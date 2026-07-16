# FC 26 Career Analyst

A private, offline Windows companion for FC 26 Manager Career. It watches read-only Live Editor CSV exports, preserves each career separately, and connects automatic match telemetry, squad planning, tactics and next-opponent preparation.

## Run the app

```powershell
npm install
npm start
```

Live Editor exports and career data are stored under `%APPDATA%\FC26 Career Analyst`; CSV exports live in its `Live Editor` subfolder.

## Multiple careers

Each loaded Manager Career is identified automatically from its Live Editor manager record and career start date. The app switches to that career when its snapshot arrives; players, matches, tactics and trends are stored in an isolated folder under `%APPDATA%\FC26 Career Analyst\careers`. Loading another save cannot merge its history into the active career.

Existing single-career data is migrated into the new profile layout without being deleted. Backups and restores operate on the active career only. A team change inside the same save remains part of that career because the identity is based on the career, not the club.

## Live Editor scripts

The packaged app includes `career_snapshot.lua` and `match_telemetry.lua`. On startup it refreshes them automatically in `C:\FC 26 Live Editor\lua\autorun` when that standard Live Editor folder exists. Launch FC through Live Editor and load any Manager Career save; no F9 or manual execution is needed. Return to the central hub after matches so FC can finish updating statistics. Both scripts only read game data.

The snapshot script exports the managed squad, fixtures, active tactic and the next opponent's public roster and recorded season totals. It deliberately does not export hidden opponent OVR, potential, attributes or wages. The telemetry script preserves the pre-match formation and planned FC role alongside the result and player deltas.

If Live Editor is installed elsewhere, copy those two files from this repository's `live_editor` folder into that installation's `lua\autorun` folder once.

Starter/substitute status is labelled as inferred because FC exposes played minutes but not the substitution event. Unknown minutes remain blank rather than being assumed to be 90. Morale, fitness, sharpness and other fields remain blank when this Live Editor build does not expose a reliable value.

## Manager workflow

The navigation is organised around **Overview**, **Performance**, **Squad**, **Tactics**, and **Opponent**. Matches and automatic telemetry trends share the Performance workspace; depth planning lives with the Squad.

Role estimates combine imported FC attributes for the exact role with the last five current-season ratings (70/30 when both exist). They are supporting analyst estimates, not FC hidden ratings. Selection advice requires at least five rated appearances and 300 minutes. Sale or replacement review requires ten rated appearances and 600 minutes plus safe natural-position depth. Missing data is excluded rather than scored as zero.

Primary and secondary positions are hard eligibility rules. Depth is measured by positional unit: unique starters, a distinct rotation player, a third goalkeeper and separately labelled emergency cover. One versatile reserve cannot silently satisfy several rotation requirements.

The app only displays data exported reliably by FC or Live Editor. xG, shot maps, pass networks, xT, VAEP, PPDA, pressure maps and off-ball tracking remain unavailable.

## Verification and installer

```powershell
npm test
npm run build
npm run package
```

The NSIS Windows x64 installer is written to `release` by electron-builder.
