# Story 2.3: Vault watcher, live refresh & notification routing (M2-upgraded — board id 9.3)

## Status

Done

## Story

**As a** reader and a recipient,
**I want** the UI to reflect vault changes live and notifications to respect my snoozes,
**so that** CLI/agent writes appear without restarting the app and the badge stays honest.

## Acceptance Criteria

1. The core host subscribes to the vault with `@parcel/watcher` (FSEvents), ignoring `.git/**`, with debounce.
2. `vault.changed` CoreEvents push changed paths; the open note, file tree, board lanes, and thread rails refresh live.
3. After a `git pull` event storm, state is reconciled from filesystem + git truth — cached per-file events are never trusted (F4 rule); `reconcile()` is the entry point the poller (Story 3.5/9.1) calls after every integrate.
4. **Notification routing respects snooze:** `handoff.new`/`handoff.stateChanged` events for a handoff whose vault status is `snoozed` (and not expired) fire NO native notification; `snooze.expired` (Story 3.6/9.2 sweep) fires one local toast per machine and resorts the board.
5. **The dock/tray badge counts open, unsnoozed, inbound handoffs only** — derived from `listHandoffs` + the expired-snooze flag; snoozed-and-current handoffs never count; expired-snooze cards count with open.
6. CI keeps the native-module smoke test: watcher subscribe/emit against the packaged Electron ABI, rerun on every Electron and module bump.

## Tasks / Subtasks

- [x] Watcher subscription (AC: 1)
  - [x] `npm i -E @parcel/watcher` (2.5.x); `src/core/watcher.ts`: `subscribe(vaultPath, cb, { ignore: ['.git/**'] })`; debounce bursts (~250 ms) into one batch
- [x] Event fan-out (AC: 2)
  - [x] Emit `{ kind: 'vault.changed', paths }`; renderer stores invalidate affected paths — reload open note, refresh tree, rebuild link index, refresh board/thread data
- [x] Storm reconcile (AC: 3)
  - [x] Detect storm/overflow: re-walk the vault + emit a single full-refresh `vault.changed`; expose `reconcile()` for the poller's post-integrate call
- [x] Notification routing (AC: 4)
  - [x] `src/core/notify.ts`: gate native notifications on the handoff's derived snooze state (frontmatter truth, expired = notify-eligible); subscribe `snooze.expired` → one toast + board resort; bulk integrates produce one batched summary, never a storm (Story 3.7 rule)
- [x] Honest badge (AC: 5)
  - [x] Badge count = open ∪ expired-snoozed, inbound, for my projects; recompute on `vault.changed`, `handoff.*`, `snooze.expired`
- [x] Native smoke CI (AC: 6)
  - [x] `tests/native-smoke/watcher.test.ts` against the packaged Electron ABI, dedicated `ci.yml` job

## Dev Notes

- `@parcel/watcher` is the decided watcher; ignore `.git/**` always. The F4 rule is load-bearing: after pull storms, reconcile from filesystem + git truth. [Source: architecture.md#tech-stack] [Source: architecture.md#remote-event-poller--write-lock]
- **M2 addition — snooze-aware routing:** snooze truth is vault frontmatter (`snoozed_until`); expiry is DERIVED, never auto-written; `snooze_timers` in app-db exists only so the expiry toast fires once per machine. This story consumes those facts — it writes neither. [Source: architecture-m2.md#1-handoff-schema-v2] [Source: architecture-m2.md#3-app-db]
- Badge discipline: open unsnoozed inbound only (Things discipline, FR9/FR10 honesty); this closes the "story 3.7 leftovers for 3.6" board action item — snooze respect now has its store. [Source: architecture-m2.md#8-ipc-additions]
- Watcher snapshots (`writeSnapshot`/`getEventsSince`) remain Story 2.6's scope; keep `watcher.ts` the single module owning all @parcel/watcher API use.
- Heuristic-tier contract links must never drive notifications (Epic 11 rule) — the notify gate lives here, enforce it here. [Source: architecture-m2.md#5-contract-intelligence]
- Files: `src/core/watcher.ts`, `src/core/notify.ts`, `src/core/index.ts`, `src/core/links.ts`, `src/renderer/src/stores/reader.ts`, `src/renderer/src/stores/handoffs.ts`, `tests/native-smoke/watcher.test.ts`, `.github/workflows/ci.yml`. [Source: architecture.md#source-tree]

### Testing

- Unit: debounce batching, storm-detection threshold, ignore rules, notify-gate matrix (snoozed-current / snoozed-expired / open × new/stateChanged), badge-count derivation. Native smoke as before. Integration: snooze a fixture handoff → no notification on remote change; advance clock past `snoozed_until` → sweep toast once, badge +1. [Source: architecture.md#testing-strategy]

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-09 | 0.1 | Drafted from PRD Epic 2 | Bob (SM) |
| 2026-07-09 | 1.0 | Approved | Sarah (PO) |
| 2026-07-10 | 2.0 | M2 upgrade (board id 9.3): snooze-aware notification routing, snooze.expired toast, badge = open unsnoozed inbound, board/thread live refresh — per architecture-m2.md §1/§3/§8 | Bob (SM) |

## Dev Agent Record

### Agent Model Used

Fable 5 (claude-fable-5)

### Debug Log References

- `npm run typecheck` clean; `npm test` 40 files / 248 tests green; `npm run build` green.
- Storm discipline test: 10 rapid writes → ONE batch (one reconcile); > threshold (25) → onStorm full reconcile, per-file events discarded (F4).
- Snooze routing tests: snoozed-and-current card → badge 0, no notification even when unseen; expired snooze → badges with open but never a "new handoff" banner (its one ping is the snooze.expired toast, once per machine via the 9.2 notified flag).
- Native smoke: real @parcel/watcher subscribe → write → batched `note.md` event → clean unsubscribe.

### Completion Notes List

- `@parcel/watcher@2.5.4` pinned exact; `src/core/watcher.ts` is the single module owning its API (snapshots stay story 2.6's scope). `createEventBatcher` (pure, fake-timer tested): trailing 250 ms debounce, dedupe, scope = markdown inside the vault, `.git/**` excluded both at the subscription (`ignore: ['.git']`) and in the batcher (defense in depth). Batch > STORM_THRESHOLD (25) → `onStorm` (full reconcile) instead of per-file paths.
- FSEvents reports realpaths — the watcher resolves the vault root via `realpathSync` or every event under a symlinked path (e.g. /var → /private/var) would look outside the vault.
- Core wiring (`src/core/index.ts`): watcher batch → shared `reconcileState()` (link-index + facet-cache invalidation, `notifier.refresh()` badge/new-handoff check, `snooze_timers ← frontmatter`) + `vault.changed {paths}`; storm → same reconcile + `vault.changed {paths: []}` (full refetch). The story-9.1 poller calls the SAME reconcile post-integrate — `reconcile()` is one entry point, as specified. Watcher start failure degrades loudly (`git.warning`, manual refresh still works).
- Notification routing respects snooze at the single decider (`notify.ts decideNotifications`): `openInbound` = open ∪ EXPIRED-snoozed inbound (badge, AC5 — matches the lib's expired derivation, never a status write); `newOpen` (native banners + `handoff.new`) = truly `open` unseen cards only, so snoozed-current handoffs never notify and expired ones never masquerade as "new". Batched summary (>3 → one banner) unchanged from 3.7.
- `snooze.expired` sweep (9.2 store): runs once a minute in the core host, after every poller integrate, and on watcher batches (a local snooze edit arms/expires timers immediately); emits once per machine, recomputes the badge.
- Renderer live refresh: module-level store subscriptions (work from EVERY view, not just a mounted board) — reader refreshes tree + open note on `vault.changed`; handoffs store reloads on `vault.changed`/`handoff.new`/`handoff.stateChanged`/`snooze.expired` and toasts "Snooze expired" (resort falls out of the reload — the lib sorts expired with open). Board's own duplicate subscription removed; its Refresh button is now a fallback. `openCount` (nav badge) counts open ∪ expired to match the core badge.
- CI: `tests/native-smoke/` (watcher + 9.2's sqlite) rerun against the packaged Electron ABI via `electron-builder install-app-deps` + `ELECTRON_RUN_AS_NODE` vitest, then node ABI restored — reruns on every Electron/module bump by construction.
- Deviation: thread-rail refresh rides the existing ThreadRail `onEvent` subscription (already live per story 8.2) — no new code needed; dev-mode note from 9.2 applies to @parcel/watcher too (install-app-deps once for `electron-vite dev`).

### File List

- package.json / package-lock.json (@parcel/watcher 2.5.4 exact)
- src/core/watcher.ts (new) + src/core/watcher.test.ts (new)
- src/core/notify.ts (snooze-aware openInbound + newOpen gating) + src/core/notify.test.ts (routing matrix)
- src/core/index.ts (watcher wiring, shared reconcileState, snooze sweep interval, poller reuse)
- src/shared/handoff-lanes.ts (openCount counts expired with open)
- src/renderer/src/stores/reader.ts (vault.changed live refresh)
- src/renderer/src/stores/handoffs.ts (module-level event subscription + snooze.expired toast)
- src/renderer/src/views/handoffs/Board.tsx (duplicate subscription removed)
- tests/native-smoke/watcher.test.ts (new)
- .github/workflows/ci.yml (native-smoke vs packaged Electron ABI step — shared with story 9.2)

## QA Results
