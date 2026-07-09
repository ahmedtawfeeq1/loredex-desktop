# Story 4.4: Drift badges & re-route

## Status

Approved

## Story

**As a** reader,
**I want** to see when a vault copy is stale against its source,
**so that** route-once staleness is visible instead of silent (F4).

## Acceptance Criteria

1. Stamped-but-edited source files show a "vault copy N commits behind source" badge, computed from read-only git queries.
2. One-click re-route refreshes the vault copy via the lib's route apply.
3. Each note shows a local-vs-pushed indicator (committed locally? pushed to remote?).
4. Badges update on watcher and poller events.

## Tasks / Subtasks

- [ ] Drift computation (AC: 1)
  - [ ] `src/core/drift.ts`: for a routed note (receipt/stamp identifies source repo + path + routed-at SHA), run read-only git queries against the source repo — `git rev-list <stamped-sha>..HEAD -- <path> | wc -l` → N commits behind; async git helpers from `src/core/git.ts`
  - [ ] Add contract channel `vault.drift { in: { path: string }; out: { behind: number; source?: string } }`; batch variant for lists
- [ ] Re-route (AC: 2)
  - [ ] Badge action → `route.preview` on the source file → confirm → apply (write lock); refresh drift after
- [ ] Local-vs-pushed (AC: 3)
  - [ ] `drift.ts`: per-note indicator from the VAULT repo — untracked/modified (local only), committed-not-pushed (`git log origin/<branch>..HEAD -- <path>`), pushed; surface on `NoteView` header and handoff cards
- [ ] Refresh triggers (AC: 4)
  - [ ] Invalidate drift caches on `vault.changed` and post-integrate `sync.changed`; recompute lazily on view

## Dev Notes

- Drift queries are read-only git — permitted app-side under the anti-second-engine rule; the re-route WRITE goes through lib plan/apply only. [Source: architecture.md#overview] [Source: architecture.md#git-strategy]
- Source identification comes from the route stamp/receipt (PR-3): receipts carry source path + routed content hash; the stamped frontmatter carries the source repo reference. If a note has neither, show no badge (never guess).
- The F4 evidence: "nothing to route" while content diverged, three separate times — the badge is the antidote; the one-click re-route reuses Story 4.2's confirmed-apply flow (including scope-control checks from 4.3).
- Source repos may live outside the vault — resolve their paths from the project registry/config (available via `config.get`; registry-in-vault upgrade arrives in Epic 5 and this code should read through the engine facade so it upgrades for free).
- Use async git exclusively (these queries run per-view; sync would stall the host). [Source: architecture.md#remote-event-poller--write-lock]
- Files: `src/core/drift.ts`, `src/core/git.ts` (query helpers), `src/shared/ipc-contract.ts` (+`vault.drift`), `src/core/ipc.ts`, `src/renderer/src/components/DriftBadge.tsx`, `PushStateDot.tsx`, reader/handoff views mount points. [Source: architecture.md#source-tree]

### Testing

- Unit: rev-list parsing, indicator state machine (untracked/committed/pushed), cache invalidation. Integration: fixture source repo + vault — edit source post-route → badge N=1; re-route → N=0; commit-without-push → indicator state. [Source: architecture.md#testing-strategy]

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-09 | 0.1 | Drafted from PRD Epic 4 | Bob (SM) |
| 2026-07-09 | 1.0 | Approved | Sarah (PO) |

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## QA Results
