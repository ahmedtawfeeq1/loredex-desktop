# Story 3.4: In-app consume with identity

## Status

Approved

## Story

**As a** receiver,
**I want** a consume button that records who/when and shows what changed,
**so that** consumption is attributed and verifiable (F1).

## Acceptance Criteria

1. An app identity profile (name + email) is settable in Settings and stored app-side, never in the vault.
2. The consume button on an inbox card calls `handoffs.consume` with that identity; the frontmatter update happens via the lib export only.
3. A receipt UI shows exactly what changed and whether it pushed.
4. Git identity is injected per command via `-c user.name`/`-c user.email` — never ambient config (NFR11).
5. The board reflects the consumed state immediately.

## Tasks / Subtasks

- [ ] Identity profile (AC: 1)
  - [ ] `views/settings/IdentityForm.tsx`: name + email; persisted via a core-host settings channel into the main-owned settings JSON for now (moves to app.db in Story 3.6 — leave a marked seam)
  - [ ] Empty identity → consume button disabled with a "set your identity" hint
- [ ] Consume flow (AC: 2, 4, 5)
  - [ ] Register `handoffs.consume` → acquire the write lock (if Story 3.5 landed; otherwise direct with a TODO tied to it) → `consumeHandoff(id, identity)` from the engine facade
  - [ ] Git commands triggered by consume carry `-c user.name=<identity.name> -c user.email=<identity.email>` via the `src/core/git.ts` helpers
  - [ ] On success: optimistic board update + refetch on the resulting `vault.changed`
- [ ] Receipt UI (AC: 3)
  - [ ] `components/ConsumeReceiptView.tsx`: frontmatter before/after diff from `ConsumeReceipt`, push outcome (pushed / pending with reason), timestamp

## Dev Notes

- Depends on Story 3.3's pin bump — `consumeHandoff`, `Identity`, `ConsumeReceipt` are lib exports; the app NEVER writes handoff frontmatter itself. [Source: architecture.md#loredex-library-surface] [Source: architecture.md#overview]
- Identity is app-managed and per-user → app-side storage, never the vault (the M1 caveat is explicit: CLI consumes stay ambient-git-config until M2 managed profiles). [Source: architecture.md#state-placement]
- Per-command `-c` injection is the decided git identity mechanism (F7 "auth is ambient" lesson). Helpers live in `src/core/git.ts` (declared in Story 1.8). [Source: architecture.md#git-strategy]
- Write ordering: consume is a lib write op — it must take the core-host write lock once the poller story (3.5) introduces it. If 3.5 hasn't merged, code the call site through a `withWriteLock(fn)` shim that 3.5 replaces.
- Receipt honesty: if the push failed (offline), say so — "recorded locally, will push on next sync" — using the `SyncReport`/receipt data, never a fake success.
- Files: `src/core/ipc.ts` (register), `src/core/git.ts` (identity args), `src/renderer/src/views/settings/IdentityForm.tsx`, `src/renderer/src/components/ConsumeReceiptView.tsx`, `src/renderer/src/views/handoffs/Board.tsx` (button + optimistic state). [Source: architecture.md#source-tree]

### Testing

- Unit: identity validation, disabled-state logic, `-c` argument construction, receipt diff rendering. Integration: consume on the fixture vault flips status and stamps who/when + `loredex_schema` (assert via `parseDoc`). [Source: architecture.md#testing-strategy]

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-09 | 0.1 | Drafted from PRD Epic 3 | Bob (SM) |
| 2026-07-09 | 1.0 | Approved | Sarah (PO) |

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## QA Results
