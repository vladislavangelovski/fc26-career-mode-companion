# FC 26 Career Analyst

A private, offline Windows companion for FC 26 Manager Career. It watches Live Editor CSV exports, preserves each career separately, enriches played matches through reviewed screenshot OCR, and produces explainable role-fit and squad-depth recommendations for whichever save is currently loaded.

## Run the app

```powershell
npm install
npm start
```

Live Editor exports, career data, and screenshots are stored under `%APPDATA%\FC26 Career Analyst`; CSV exports live in its `Live Editor` subfolder.

## Multiple careers

Each loaded Manager Career is identified automatically from its Live Editor manager record and career start date. The app switches to that career when its snapshot arrives; players, matches, tactics, screenshots, OCR confirmations, and trends are stored in an isolated folder under `%APPDATA%\FC26 Career Analyst\careers`. Loading another save cannot merge its history into the active career.

Existing single-career data is migrated into the new profile layout without being deleted. Backups and restores operate on the active career only. A team change inside the same save remains part of that career because the identity is based on the career, not the club.

## Live Editor scripts

`career_snapshot.lua` and `match_telemetry.lua` are installed in Live Editor's `lua\autorun` folder. Launch FC through Live Editor and load any Manager Career save; no F9 or manual execution is needed. Return to the central hub after matches so FC can finish updating statistics. Both scripts only read game data.

Starter/substitute status is labelled as inferred because FC exposes played minutes but not the substitution event. Morale, fitness, sharpness, tactical focus, and assigned-player fields remain blank when this Live Editor build does not expose a reliable getter; the app reflects those gaps in confidence.

## Played-match screenshots

Open a match in **Matches**, choose **Add screenshot batch**, and select English 2560×1440 captures. The workflow expects 2–3 team summary pages plus one detail page for every participant. Images are checked, SHA-256 deduplicated, preprocessed, and OCRed locally. Correct the review table and confirm it before any extracted value enters analysis. Simulated matches need no screenshots.

## Verification and installer

```powershell
npm test
npm run build
npm run package
```

The NSIS Windows x64 installer is written to `release` by electron-builder. OCR uses the packaged English language data and needs no network connection.
