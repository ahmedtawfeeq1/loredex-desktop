# Story 15.1: Native-module correctness in dev and packaged builds

## Status

In Progress

## Story

**As a** developer (and release engineer) of Loredex Desktop,
**I want** `npm run dev` to launch without a manual `npx electron-rebuild` while vitest keeps its plain-node ABI, and the packaged app's native modules proven to boot,
**so that** the ABI seesaw (fix dev → break tests, run dist → break tests) stops eating QA passes and the shipped artifact is known-good where it matters most: app.db and the vault watcher.

## Acceptance Criteria

1. `npm run dev` boots the core host (app.db opens) without any manual native-module step; the mechanism must NOT change `node_modules/better-sqlite3/build/Release` away from the plain-node ABI that vitest uses.
2. `npm run dist` leaves the working tree test-green afterwards (today it silently rebuilds `build/Release` to the Electron ABI and breaks the suite).
3. The packaged app (`CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist`) launches from `dist/mac-arm64/Loredex.app` and its core host boots: app.db opens and the vault watcher arms (stdout evidence), no crash/respawn loop for 30 s.
4. Both test suites stay green: app vitest + lib vitest; typecheck + production build clean.
5. The dual-ABI mechanism is documented (this story, Dev Notes) so the next ABI bump (Electron upgrade) is a version-stamp refresh, not a re-investigation.

## Tasks / Subtasks

- [x] Diagnose (AC: 1)
  - [x] Repro: `build/Release/better_sqlite3.node` is plain-node ABI 115; Electron 43.1.0 is ABI 148 → `ERR_DLOPEN_FAILED` at `new Database` → core host crash-loop under `electron-vite dev`
  - [x] Confirm `@parcel/watcher` is N-API (`prebuildify --napi`) — ABI-stable, loads under both runtimes, needs nothing
  - [x] Confirm `electron-builder install-app-deps` rebuilds `build/Release` IN PLACE (breaks node) — the QA-flagged tension is real in both directions
- [x] Staging script (AC: 1, 2)
  - [x] `scripts/prepare-electron-natives.mjs`: rebuild for Electron → MOVE the binary to `node_modules/.loredex-natives/electron/better_sqlite3.node` → restore the plain-node prebuild via `npm rebuild better-sqlite3`; version-stamped, idempotent (fresh no-op ≈ 0.1 s)
  - [x] Wire as `predev` AND `postdist` (postdist un-breaks the tree after electron-builder's in-place dist rebuild)
- [x] Runtime shim (AC: 1)
  - [x] `src/core/db/native-binding.ts`: under Electron with a staged binary present, pass it as better-sqlite3's `nativeBinding`; plain node and the packaged app (staging dir never shipped) fall through to default resolution
  - [x] Unit tests: inert under node / staged path under Electron / default under Electron without staging (packaged)
- [x] Boot evidence (AC: 3)
  - [x] Core host logs `app.db open — <path>` and `vault watcher armed — <path>` (the two native-module canaries)
- [x] Dev-launch smoke (AC: 1)
- [x] Packaged build + 30 s smoke of `dist/mac-arm64/Loredex.app` (AC: 3)
- [x] Suites green: app vitest scoped to non-WIP files + lib 143 (AC: 4)

## Dev Notes

### The mechanism (AC5 — read this on the next Electron bump)

- **Why two binaries:** better-sqlite3 is a V8-native addon (not N-API). One `.node` file serves exactly one `NODE_MODULE_VERSION` — plain node 20 = ABI 115, Electron 43 = ABI 148. vitest runs under plain node; `electron-vite dev` runs the core host under Electron. Any "rebuild in place" fix for one runtime breaks the other.
- **Staging:** `scripts/prepare-electron-natives.mjs` runs `electron-builder install-app-deps` (which rebuilds `build/Release` for Electron), then MOVES that binary out to `node_modules/.loredex-natives/electron/better_sqlite3.node` and restores the plain-node prebuild with `npm rebuild better-sqlite3` (prebuild-install, cached in `~/.npm/_prebuilds` — offline-safe after first fetch). A `stamp.json` (module + electron versions) makes re-runs a no-op; the plain-node restore check runs every time, which is what makes `postdist` heal the tree.
- **Selection:** `src/core/db/native-binding.ts` — the ONLY `new Database` call site (`src/core/db/index.ts#openAndMigrate`) passes `nativeBinding` = staged path iff `process.versions.electron` is set AND the staged file exists. Everywhere else better-sqlite3's default `bindings` lookup runs: vitest gets `build/Release` (plain-node), the packaged app gets whatever electron-builder rebuilt into the bundle (the staging dir under `node_modules/.loredex-natives/` is never packaged — it is not a dependency).
- **Why not prebuilds:** WiseLibs publishes no Electron prebuilds for better-sqlite3 v12.11.1 (`…-electron-v148-darwin-arm64.tar.gz` → 404), so a compile is unavoidable; `install-app-deps` was chosen because electron-builder is already a devDependency and its rebuild cache makes repeats cheap.
- **@parcel/watcher needs nothing:** built with `prebuildify --napi` → N-API, ABI-stable across node and Electron (verified by loading + subscribing under Electron ABI 148).
- **Electron bump procedure:** nothing manual — the stamp goes stale, the next `npm run dev` restages. If the rebuild ever fails, the script fails loudly (it also verifies the staged binary actually loads under Electron via `ELECTRON_RUN_AS_NODE`).

### Packaged-build findings

- The pre-existing `dist/` artifact (built before this story) shipped ZERO native modules — no `better-sqlite3`, no `@parcel/watcher` in app.asar, no `app.asar.unpacked` — its core host could never have booted. Root cause not archaeologized; a fresh dist with the current tree is part of this story's evidence.
- electron-builder 26 stages per-ABI rebuilds under `node_modules/<pkg>/bin/darwin-arm64-148/` during dist and ALSO rewrites `build/Release` in place — hence `postdist`.

### Testing

- `src/core/db/native-binding.test.ts` — the shim is inert under plain node (a wrong path here would point vitest at the Electron binary and kill the whole suite), returns the staged path under Electron, and falls through when nothing is staged (packaged app).
- `tests/native-smoke/sqlite.test.ts` (existing) remains the plain-node ABI canary.
- Dev + packaged launches are process-level smokes (time-boxed, stdout-asserted), not vitest — Electron cannot run inside the unit suite.

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-10 | 0.1 | Drafted + implemented (M3 hardening cycle) | Dev Agent |

## Dev Agent Record

### Agent Model Used

Claude Fable 5 (claude-fable-5)

### Debug Log References

- Repro: `node -e "new Database(':memory:')"` OK (ABI 115) vs `ELECTRON_RUN_AS_NODE=1 electron …` → `ERR_DLOPEN_FAILED … NODE_MODULE_VERSION 115 vs 148`
- `node scripts/prepare-electron-natives.mjs` first run: stages + restores; second run: no-op in 0.09 s; plain-node open OK after both
- Suites + smokes: see Completion Notes (recorded with exact counts at completion)

### Completion Notes List

- (filled at completion)

### File List

- scripts/prepare-electron-natives.mjs — NEW: dual-ABI staging (predev/postdist)
- src/core/db/native-binding.ts — NEW: Electron-side binding selection
- src/core/db/native-binding.test.ts — NEW: shim unit tests
- src/core/db/index.ts — pass `nativeBinding` at the single `new Database` call site
- src/core/index.ts — boot-evidence logs (app.db open, watcher armed)
- package.json — `predev` + `postdist` scripts
- docs/stories/sprint-status.yaml — epic-15 board entry

## QA Results

(pending)
