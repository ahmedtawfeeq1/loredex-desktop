# Story 23.1: Vault switcher menu + multi-window

## Status

Done

## Story

**As a** person who works across more than one loredex vault,
**I want** the bottom-left vault identity chip to become a menu — recently-opened vaults, "Open vault…" (switch in place), "Open in new window", "Create or join…" — and each window bound to its OWN vault,
**so that** I can jump between vaults or keep two open side-by-side without quitting and re-picking, per DESIGN.md "D1 amendment 7 §D".

## Acceptance Criteria

1. **Vault menu.** The identity chip (bottom of the sidebar) gains a click / ▾ affordance that opens a popover menu. The chip still shows THIS window's current vault (name, path, engine version, sync dot).
2. **Recently-opened vaults.** The menu lists recent vaults, persisted app-wide, newest-first, deduped, capped at 8. The current vault is marked and non-switchable; each recent has a "open in new window" affordance.
3. **Open vault… (switch in place).** A folder picker; on pick the CURRENT window switches vaults — reuses the existing `applyVault` path (persist choice + restart this window's core host + `vault-changed` → re-init).
4. **Open in new window.** Opens a new Electron `BrowserWindow` bound to a chosen (recent) or picked vault, running its OWN core host on that vault.
5. **Create or join…** Opens the existing create/join wizards.
6. **Multi-window main process.** The main process supports N windows, each with its own core-host process + vault, via a window→{core, vaultPath} registry replacing the single-`core` global. A single window still boots exactly as before; per-window respawn, focus/blur cadence, brokering, and notification routing all scoped to the owning window.
7. **Persistence.** Recent vaults live in main-owned JSON (`recent-vaults.json`, same bootstrap-config category as `vault.json`); pure list logic is a shared, node-testable module.
8. **DoD.** Gate green (typecheck, full sequential vitest, build); a recent-vaults persistence test; a menu-wiring test; a real time-boxed dev launch proving open-in-new-window spawns a second window on a DIFFERENT vault.

## Tasks / Subtasks

- [x] Pure recents model (AC 2, 7): `src/shared/recent-vaults.ts` — `RecentVault`, `pushRecent(list, entry, cap=8)` (front-insert, dedup by path, cap), `vaultNameFromPath`. No electron import. `src/shared/recent-vaults.test.ts`.
- [x] Main persistence (AC 7): `loadRecentVaults` / `recordRecentVault` in `src/main/dialogs.ts` (reads/writes `<userData>/recent-vaults.json`, wraps `pushRecent`, derives name from basename).
- [x] Multi-window main (AC 3, 4, 6): `src/main/index.ts` — `winCores: Map<window.id, {core, vaultPath}>` replaces the single `core`; `forkCoreHostFor(win)` / `brokerPorts(win)` / `bootWindowCore(win, vaultPath)` / `openWindow(vaultPath)`; `applyVault(win, path)` switches ONE window in place (sets `wc.vaultPath` before killing so the standing exit handler respawns on the NEW vault); focus/blur post to the focused window's core; `closed` removes + kills that window's core. New IPC: `loredex:pick-vault-folder` (pick only, no side effect), `loredex:list-recent-vaults`, `loredex:open-in-new-window`. `set-vault` + `pick-vault` now window-scoped. File menu gains "Open in New Window" (⌘⇧N).
- [x] Notification routing (AC 6): `handleCoreMessage(msg, win)` in `src/main/notifications.ts` — a core host's notification click focuses/deep-navigates ITS window, not an arbitrary first window.
- [x] Preload + api (AC 1–4): `pickVaultFolder` / `listRecentVaults` / `openInNewWindow` on the one bridge global; typed wrappers + `Window` type in `src/renderer/src/api.ts`.
- [x] Menu store (AC 3, 4, wiring test): `src/renderer/src/stores/vaultMenu.ts` — `open`/`recents`/`busy`, `toggle`/`refresh`/`switchTo`/`openHere`/`openNewWindow`; the node-testable wiring seam. `vaultMenu.test.ts` mocks `../api`.
- [x] Menu component (AC 1, 2, 5): `src/renderer/src/components/VaultMenu.tsx` — chip-as-trigger (▾ caret) + popover (recents with current-vault marking + per-recent new-window button, Open vault…, Open in new window…, Create/Join via wizard store); Escape / outside-click dismiss. Replaces `IdentityBadge` in `App.tsx`.
- [x] CSS (AC 1, 2): `.vault-switcher` / `.vault-menu` / `.vault-menu-*` in `styles.css` — DESIGN v2 popover card (`--bg-card`, hairline, radius 10, shadow-sm), gold reserved for the current-vault dot only.

## Dev Notes

- DESIGN.md "D1 amendment 7 §D", read verbatim, is the binding spec. [Source: DESIGN.md#d1-amendment-7]
- **Per-window core host is architecturally clean.** Each `utilityProcess.fork` is its own `import 'loredex'` site — config resolves once per process, so F6 holds per window. `app.db` is `vault_id`-scoped (better-sqlite3 WAL), so two cores on different vaults never collide. The single-`core` global becomes a `window.id`→`{core, vaultPath}` map; the single-window boot path is byte-identical in behavior.
- **Switch-in-place reuses the proven seam.** `applyVault` still persists the choice + restarts the core on the new vault + emits `vault-changed`; the only change is it targets ONE window (and now also records recents). The kill/respawn dance is unchanged except `wc.vaultPath` is set to the new path BEFORE the kill so the standing exit handler re-forks on it.
- **Recents owned by main, read by renderer.** Main records on every `applyVault` and `openWindow` regardless of which renderer triggered it, so main-owned JSON (not renderer localStorage) is the app-wide source of truth; the menu fetches via `listRecentVaults` on open. Pure list logic is separated out for node testing.
- **No jsdom in this repo** (vitest env=node), so the "menu wiring test" is the `vaultMenu` store with `../api` mocked — matching the codebase's store-test convention — plus the pure recents test. Component render is verified by the dev launch, not a DOM test.

## Deviations

- **In-app MCP server stays single-owner (documented limitation).** The MCP server binds one fixed port (`PREFERRED_MCP_PORT`, 52017) and, by design, EADDRINUSE degrades to a `port-conflict` status + git.warning rather than throwing (`mcp-server.ts`). So the FIRST window's core owns the agent-facing MCP port; a SECOND window's core boots fine (0 respawns, vault UI unaffected) but its Sync panel shows the port-conflict — agents reach the first vault only. Per-window MCP ports are out of scope for v1; the multi-window vault UX (switch, recents, side-by-side windows) is fully delivered. This is the intended "N windows each on its own vault" with one graceful edge, not the SAME-core fallback the DoD allowed.
- **`IdentityBadge.tsx` left in place** (no longer imported) rather than deleted — zero working-seam churn; the chip markup now lives in `VaultMenu`.
- **"Open in new window…" top-level uses a folder picker; per-recent uses the row's path.** The spec says "a chosen/last vault" — recents give the quick path (direct), the top-level item lets you pick any folder. The File-menu ⌘⇧N opens the last vault in a new window.

## Dev Agent Record

- 2026-07-11: implemented as specced. Gate: typecheck (node+web) clean, full vitest **933/933** sequential (`--no-file-parallelism`; +14 over the 919 baseline), production build clean (pre-existing dynamic-import warnings only). **Dev-launch DoD PROVEN:** a time-boxed `npm run dev` with a temporary env-gated second `openWindow` (reverted before commit) booted TWO core hosts on TWO different vaults — window 1 `[loredex-core] core host started — config: /Users/tawfeeq/Loredex` + `vault watcher armed`, window 2 `… config: …/nimbus-vault` + its own `vault watcher armed`, both `app.db open`, **0 respawns / 0 crashes**. New files: `src/shared/recent-vaults.ts` (+test), `src/renderer/src/stores/vaultMenu.ts` (+test), `src/renderer/src/components/VaultMenu.tsx`. Touched: `src/main/index.ts` (per-window core registry), `src/main/dialogs.ts` (recents persistence), `src/main/notifications.ts` (per-window routing), `src/preload/index.ts`, `src/renderer/src/api.ts`, `src/renderer/src/App.tsx`, `src/renderer/src/styles.css`. No new deps.

## QA Results

- 2026-07-11 fresh-eyes (commit `0f6725f`): **PASS.** Vault menu (`VaultMenu.tsx` + `stores/vaultMenu.ts`): recents, "Open vault…" (switch in place), "Open in new window", "Create or join…". Multi-window is genuinely per-window — `main/index.ts` `winCores = new Map<number, WinCore>()`, each window its own core host + vault path (`openWindow`/`forkCoreHostFor`/`bootWindowCore`/`applyVault`). Recents persisted app-wide (`shared/recent-vaults.ts`). Launch smoke booted a window clean (`app.db open` → `core host started` → `vault watcher armed`, 0 errors). Tests `vaultMenu.test.ts` / `recent-vaults.test.ts` green in 933/933.
