# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm start` (alias `npm run dev`) — runs the Electron app. `electron-reload` is active unless `NODE_ENV=production`, so edits under `src/` reload the window.
- `npm run dist` — builds the Windows NSIS installer into `dist/` (also emits `latest.yml` for the auto-updater).
- `npm run build-dir` — unpacked build only (`dist/win-unpacked`), faster for smoke-testing a packaged app.
- No test runner or linter is configured. `test*.js` is gitignored (used for throwaway scripts).

## Architecture

Electron desktop app (plain JS, no bundler/framework) that pulls two Salesforce reports, applies team-specific business rules, and shows a dashboard. UI text and domain terms are in Brazilian Portuguese.

- **Main process** — [src/main/main.js](src/main/main.js) holds everything stateful: `inMemoryState` (tasks, last sync, selected month), a 30-minute auto-sync interval, JSON caching, and all `ipcMain.handle` channels (`auth:*`, `sync:*`, `dashboard:*`, `tasks:*`, `db:*`, `admin:*`, `team:*`, `system:*`). The renderer never talks to Salesforce/Firebase directly.
- **Preload / Renderer** — [src/preload/preload.js](src/preload/preload.js) exposes the IPC API (contextIsolation on); [src/renderer/js/app.js](src/renderer/js/app.js) is the whole UI in one file.
- **Services** (`src/services/`):
  - `salesforceAuth.js` — OAuth2 PKCE using the `PlatformCLI` client id with a local HTTP callback on port 1717; tokens stored in `salesforce_token.json`.
  - `salesforceReports.js` — fetches the "fila" and "concluídas" Analytics reports (IDs in README).
  - `businessRules.js` — parsing of report rows, priority classification, hours/points calculation, and the team **roster** (`setRoster`/`getRoster`). Cached tasks are re-evaluated with the current rules on every startup, so rule changes apply retroactively.
  - `firebase.js` — Firestore: monthly dashboards, avatars, team roster (live `subscribeTeam`), admin config.
  - `updater.js` — `electron-updater` auto-update (only when `app.isPackaged`); checks on start and hourly, prompts the user, installs on confirm or on quit.

### Things that span multiple files

- **Roster is shared state**: edited via `team:*` IPC (admin-only), written to Firebase first (rolled back on failure), mirrored to `user_settings.json`, and pushed to every client through the Firestore subscription → `team:updated` event.
- **Admin model**: master email is hardcoded in `main.js` (`MASTER_ADMIN_EMAIL`) and seeded into Firestore; extra admins live in the Firestore admin config. Admin actions additionally require a scrypt-hashed password unlock (`adminUnlocked` flag, reset on logout/account switch).
- **Local persistence has two locations**: Electron `userData` is primary; the repo-level `data/` dir (gitignored) is a dev fallback/mirror, written only if it exists. Both `cached_dashboard.json` and `user_settings.json` follow this pattern.
- **`.env` holds Firebase config** and is loaded by searching several paths in `firebase.js`. In packaged builds it is shipped via `extraResources` and also inside the app files (`asar: false`, so it is readable on disk).

## Releasing

Version lives in `package.json`. Auto-update uses the `generic` provider: `build.publish.url` in `package.json` must point to the HTTP folder where `Setup-X.exe` and `latest.yml` from `dist/` are uploaded after each `npm run dist`. Machines must install one build containing the updater before they can self-update. Do not commit installers to git.
