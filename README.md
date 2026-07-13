# FC 26 Career Analyst

A private, offline Windows companion for FC 26 Manager Career. It watches Live Editor CSV exports, preserves one career locally, enriches played matches through reviewed screenshot OCR, and produces explainable role-fit and squad-depth recommendations.

## Run the app

```powershell
npm install
npm start
```

Use the gear button in the lower-left corner if your Live Editor exports are not on the Windows Desktop. Career data is saved atomically under `%APPDATA%\FC26 Career Analyst`; screenshots are copied into per-match folders there.

## Live Editor scripts

In FC 26, load the Career Mode save and open **F9 → Features → Lua Engine**.

1. Execute `live_editor/career_snapshot.lua` in the central Career hub. It overwrites `fc26_squad_snapshot.csv` and `fc26_tactics_snapshot.csv` on the Desktop. Run it whenever the squad or tactic changes.
2. Execute `live_editor/match_telemetry.lua` before entering the next match. Leave it loaded. It appends one row per appearance after played matches and quick simulations.
3. Return to the central hub after the match so FC can finish updating the statistics. The desktop app imports the changed CSV automatically.

You do **not** need to run both scripts for every match. Keep match telemetry armed for the game session; refresh the career snapshot only when you want updated squad or tactics data. Both scripts only read game data.

Starter/substitute status is labelled as inferred because FC exposes played minutes but not the substitution event. Morale, fitness, sharpness, tactical focus, and assigned-player fields remain blank when this Live Editor build does not expose a reliable getter; the app reflects those gaps in confidence.

## Played-match screenshots

Open a match in **Matches**, choose **Add screenshot batch**, and select English 2560×1440 captures. The V1 workflow expects 2–3 team summary pages plus one detail page for every participant. Images are checked, SHA-256 deduplicated, preprocessed, and OCRed locally. Correct the review table and confirm it before any extracted value enters analysis. Simulated matches need no screenshots.

## Verification and installer

```powershell
npm test
npm run build
npm run package
```

The NSIS Windows x64 installer is written to `release` by electron-builder. OCR uses the packaged English language data and needs no network connection.
