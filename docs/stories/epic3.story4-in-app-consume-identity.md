# Story 3.4: In-app consume with identity

## Status

Done

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

- [x] Identity profile (AC: 1)
  - [x] `views/settings/IdentityForm.tsx`: name + email; persisted via a core-host settings channel into the main-owned settings JSON for now (moves to app.db in Story 3.6 — leave a marked seam)
  - [x] Empty identity → consume button disabled with a "set your identity" hint
- [x] Consume flow (AC: 2, 4, 5)
  - [x] Register `handoffs.consume` → acquire the write lock (if Story 3.5 landed; otherwise direct with a TODO tied to it) → `consumeHandoff(id, identity)` from the engine facade
  - [x] Git commands triggered by consume carry `-c user.name=<identity.name> -c user.email=<identity.email>` via the `src/core/git.ts` helpers
  - [x] On success: optimistic board update + refetch on the resulting `vault.changed`
- [x] Receipt UI (AC: 3)
  - [x] `components/ConsumeReceiptView.tsx`: frontmatter before/after diff from `ConsumeReceipt`, push outcome (pushed / pending with reason), timestamp

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

Claude Fable 5 (claude-fable-5), BMAD dev agent

### Debug Log References

- `npm run typecheck` clean; `npm test` 13 files / 56 tests green (incl. consume integration on a throwaway fixture-vault copy); `npm run build` green.

### Completion Notes List

- Identity profile: `settings.identity.get/set` channels (app-local contract evolution) → `src/core/settings.ts` JSON under main's userData dir (passed at fork via `--user-data`; MARKED SEAM comment for the 3.6 app.db move). Never touches the vault. Ambient default comes from the lib's `ambientGitIdentity(vaultPath)`.
- Consume: `handoffs.consume` → `withWriteLock` shim (3.5 replaces it, as the story prescribes) → `engine.consume` → lib `consumeHandoff` (the app writes zero frontmatter). Success emits `handoff.stateChanged` + `vault.changed` so all views converge (AC5); renderer additionally flips the card optimistically with the stamp-press animation and reverts on failure.
- **Deviation (AC4 mechanism):** identity is injected per command, never ambient — but via `GIT_AUTHOR_*`/`GIT_COMMITTER_*` env scoped to the lib call (`withGitIdentity`), because the lib's `gitAutoCommit`/`gitPullPush` accept no extra argv yet. Git documents these env vars as overriding all config, so the effect equals `-c` injection. `gitIdentityArgs` ships the prescribed `-c` form for future direct shell-outs. Release TODO: lib PR revision threading `-c` args, then delete the env path.
- Consume button: mono `consume ⌘⏎` on open inbound cards; ⌘⏎ works on the focused card; disabled with a "Set your identity in Settings first" hint when no usable identity (lib's `unknown` fallback fails `isValidIdentity` on purpose).
- Receipt honesty: `ConsumeReceiptView` renders the before → after frontmatter diff from the lib receipt and `pushed: false` reads "Recorded locally — will push on next sync" (amber), never a fake success.

### File List

- `src/shared/ipc-contract.ts` (settings.identity.* channels)
- `src/shared/types.ts` (`IdentitySettings`)
- `src/shared/identity.ts` (`isValidIdentity`)
- `src/core/git.ts` (new — identity args/env + `withGitIdentity`), `src/core/git.test.ts` (new)
- `src/core/write-lock.ts` (new — 3.5 shim)
- `src/core/settings.ts` (new — identity JSON, app.db seam marked)
- `src/core/engine.ts` (`consume`, `ambientIdentity`)
- `src/core/handlers.ts` (consume + settings channels, event emits)
- `src/core/index.ts`, `src/main/index.ts` (`--user-data` at fork)
- `src/core/consume.test.ts` (new — integration on a fixture-vault copy: status flip, who/when, `loredex_schema`, events, honest push)
- `src/renderer/src/stores/identity.ts` (new), `src/renderer/src/stores/handoffs.ts` (consume/receipt state)
- `src/renderer/src/views/settings/SettingsView.tsx`, `IdentityForm.tsx` (new)
- `src/renderer/src/components/ConsumeReceiptView.tsx` (new), `HandoffCardView.tsx` (⌘⏎ + consume slot)
- `src/renderer/src/views/handoffs/Board.tsx` (ConsumeAction, receipt mount)
- `src/renderer/src/App.tsx` (Settings nav), `src/renderer/src/styles.css` (consume/receipt/settings)

## QA Results
