# Story 5.2: Sync health panel

## Status

Done

## Story

**As a** DevOps admin,
**I want** a panel that surfaces every git truth and warning,
**so that** failures like the gitattributes bug are caught on day one (F8, FR13).

## Acceptance Criteria

1. The panel shows remote reachable, branch match, ahead/behind, last push/pull, and merge-driver status via `sync.status`.
2. Every git stderr warning from any engine operation is surfaced as `git.warning` events and listed in the panel — nothing swallowed.
3. A sync-now button runs `sync.run`; the structured `SyncReport` renders per-operation results.
4. Engine/schema handshake mismatches (app vs CLI vs vault) warn loudly here (NFR8).
5. The MCP port-conflict error (Story 1.6) appears here with a settings override.

## Tasks / Subtasks

- [x] Core handlers (AC: 1, 3)
  - [x] Register `sync.status` → `syncStatus()` (PR-4); `sync.run` → async `gitPullPush` under the write lock, returning `SyncReport` (PR-5)
  - [ ] Poller (Story 3.5) refreshes `SyncHealth` after each fetch/integrate and pushes `sync.changed` — N/A in v0.1 (poller scope-cut); sync.run pushes `sync.changed` instead
- [x] Warning firehose (AC: 2)
  - [x] Audit every engine-facade git call site: stderr/warnings from `SyncReport`s, drift queries, poller ops all emit `git.warning` events; panel keeps a scrolling warning log (in-memory ring buffer — app.db is story 3.6, scope-cut)
- [x] Panel UI (AC: 1, 3)
  - [x] `views/sync/SyncPanel.tsx`: status grid (reachable / branch / ahead-behind / last push-pull / merge driver) in GitHub-Desktop-widget style; Sync Now button + `SyncReport` result list ("integrating…" state N/A without the poller)
- [x] Handshake warnings (AC: 4)
  - [x] Compare app engine/schema (discovery values) vs vault `.loredex/engine.json` vs last-seen CLI writes (schema stamps observed in frontmatter); material mismatch → prominent panel banner + `git.warning` event
- [x] Port conflict (AC: 5)
  - [x] Render the `PORT_CONFLICT` state with the settings override link (Story 1.6's setting)

## Dev Notes

- F8's lesson is the design rule: NOTHING that git says on stderr may be swallowed — the gitattributes warning printed on every op for a full day, unseen. The audit task is real work: grep every `execFile` path in the engine facade/git helpers and prove each has a warning path. [Source: architecture.md#git-strategy] [Source: architecture.md#coding-standards]
- `sync.status`/`sync.run`/`sync.changed`/`git.warning` are all existing contract members — this story implements their full loop. [Source: architecture.md#ipc-contract]
- Handshake sources: discovery file values written by `src/core/discovery.ts` (engineVersion/schemaVersion), vault `.loredex/engine.json` (PR-2), and observed `loredex_schema:` stamps. The version-skew split-brain (pinned app vs floating CLI) must produce a banner, not a log line. [Source: architecture.md#state-placement] [Source: architecture.md#mcp-hosting--discovery]
- `sync.run` is a write op → write lock; the panel disables Sync Now while locked (`LOCK_BUSY` envelope → spinner state). [Source: architecture.md#remote-event-poller--write-lock]
- Files: `src/core/ipc.ts` (register), `src/core/poller.ts` (health refresh), `src/renderer/src/views/sync/SyncPanel.tsx`, `src/renderer/src/stores/sync.ts`. [Source: architecture.md#source-tree]

### Testing

- Unit: handshake mismatch matrix (app/vault/CLI combos), warning-log ring buffer, LOCK_BUSY rendering. Integration: break the fixture vault's gitattributes → panel shows merge-driver FAIL + warning (the executable F8 regression). [Source: architecture.md#testing-strategy]

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-09 | 0.1 | Drafted from PRD Epic 5 | Bob (SM) |
| 2026-07-09 | 1.0 | Approved | Sarah (PO) |

## Dev Agent Record

### Agent Model Used

claude-fable-5 (BMAD dev agent)

### Debug Log References

- `npx vitest run src/core/sync.test.ts src/renderer/src/stores/sync.test.ts` → 11 passed, incl. the executable F8 regression (broken gitattributes → INVALID + warning) and the handshake mismatch matrix over a real temp git repo
- `npm test` → 111 passed; `npm run build` green

### Completion Notes List

- `sync.status` = lib `syncStatus()` verbatim (PR-4 landed): remote/reachable/branch-match/ahead-behind/last pull-push/merge-driver/gitattributes — the F8 detector is first-class in the lib and rendered as its own grid rows.
- `sync.run`: PR-5 (async git + structured SyncReport) has NOT landed — recorded deviation: wraps the lib's sync `gitPullPush` under the write lock, computes `SyncReport` from before/after `syncStatus` (pulled = behind-before when the pull ran), injects the identity profile per command (`withGitIdentity`, F7). The lib call still swallows stderr internally (`stdio: 'ignore'`) — the health-diagnosis warnings are the v0.1 stderr net; PR-5 threads real stderr through and replaces this shim.
- Warning firehose audit (engine facade git call sites): `consumeHandoff` (via lib, emits through its receipt path), `syncStatus` (warnings → grid + re-emitted as `git.warning` by `sync.run`), `gitPullPush` (report warnings all emitted), `readOriginRemote` (pure file read, no git). Every emitted warning lands in the panel's session ring buffer (50, consecutive-dupe collapse); app.db persistence deferred to story 3.6 (scope cut).
- Handshake (AC4): uses the lib's `vaultSchemaStatus` (declared frontmatter stamps vs `LOREDEX_SCHEMA`) + app `engineVersion` — the discovery file carries the same values (story 1.6). Deviation: vault `.loredex/engine.json` does not exist in the landed lib PR-2 shape; the frontmatter-stamp comparison is the authoritative lib check. Mismatch → rust banner + `git.warning` (not a log line).
- Port conflict (AC5): panel renders `mcp.status` `'port-conflict'` as a banner with an Open Settings action.
- Vault chip sync dot wired to health (`dotTone`): ink = clean, amber = ahead/behind/diverged, rust = error/unreachable — DESIGN.md semantics, unit-tested.
- `sync.changed` pushed after every `sync.run`; a pull that integrated commits also emits `vault.changed` so board/tree refetch.

### File List

- `src/core/engine.ts` (`syncHealth`, `pullPush`, `schemaStatus`), `src/core/handlers.ts` (`sync.status`, `sync.handshake`, `sync.run`)
- `src/core/sync.test.ts` (new), `src/core/engine.test.ts` (stale NOT_IMPLEMENTED assertion moved to `route.preview`)
- `src/shared/types.ts` (`HandshakeStatus`), `src/shared/ipc-contract.ts` (`sync.handshake`)
- `src/renderer/src/stores/sync.ts` (new), `sync.test.ts` (new)
- `src/renderer/src/views/sync/SyncPanel.tsx` (new)
- `src/renderer/src/components/IdentityBadge.tsx` (live sync dot), `App.tsx` (Sync nav/view), `stores/app.ts`, `styles.css` (sync blocks)

## QA Results

**Verdict: PASS with concerns** — Evidence base (QA pass 2026-07-10, fresh-eyes BMAD QA agent): app vitest 118/118 (23 files), lib vitest 115/115, `npm run typecheck` clean, `npm run build` clean, time-boxed `npm run dev` smoke (alive 3+ min, clean exit), and an M1-DoD driver that exercised the core-host modules directly against the real nimbus simulation vault (tree/readNote/resolveLink/search/handoffs/homeBrief/syncStatus/activity).

- AC1: verified — panel renders `sync.status` = lib `syncStatus` verbatim incl. the F8 gitattributes row; `sync.test.ts` + store `sync.test.ts` green.
- AC2: **concern (recorded deviation)** — PR-5 has not landed, so the lib sync call still swallows stderr internally; the panel's warning net is health-diagnosis warnings + report warnings, not raw stderr. Nothing the engine *surfaces* is swallowed, but "every git stderr warning" is not literally met until PR-5.
- AC3: verified — `sync.run` computes a structured `SyncReport` from before/after status under the write lock (shim, replaced by PR-5).
- AC4: verified — handshake via lib `vaultSchemaStatus` + engine version; rust banner + `git.warning` on mismatch (code-verified).
- AC5: verified — `mcp.status` `'port-conflict'` renders as a banner with an Open Settings action (code-verified); vault-chip dot semantics unit-tested.
