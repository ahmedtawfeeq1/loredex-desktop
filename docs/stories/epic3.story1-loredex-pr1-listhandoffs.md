# Story 3.1: loredex PR-1 — listHandoffs (loredex repo)

## Status

Approved

## Story

**As a** desktop app and CLI,
**I want** a generalized `listHandoffs(scope)` export,
**so that** both surfaces share one handoff collector.

## Acceptance Criteria

1. loredex exports `listHandoffs(scope)` generalizing `collectProductHandoffs` to inbox/outbox/all, per-project and company-wide, returning an exported `HandoffCard[]` type.
2. The CLI's handoff listing is rewired onto the same export with unchanged output.
3. Unit tests in the loredex repo; a release is published and the desktop pin bumped.

## Tasks / Subtasks

- [ ] Generalize the collector (AC: 1)
  - [ ] In the loredex repo: extract/extend `collectProductHandoffs` into `listHandoffs(scope: { direction: 'inbox'|'outbox'|'all'; project?: string })`
  - [ ] Define + export `HandoffCard`: id, from/to project, objective, created date, status (open/consumed vocabulary in M1), note path, reading-order refs
  - [ ] Company-wide = no `project` filter; per-project = filtered lanes
- [ ] CLI rewire (AC: 2)
  - [ ] Point the CLI's handoff-listing command at `listHandoffs`; output byte-compatible (snapshot test)
- [ ] Release (AC: 3)
  - [ ] Unit tests; loredex release; bump the desktop exact pin; replace the `HandoffCard` stub in `loredex-desktop/src/shared/types.ts` with `import type { HandoffCard } from 'loredex'`

## Dev Notes

- **Repo:** sibling `loredex` repo; only the pin bump + stub replacement touch the desktop app.
- `collectProductHandoffs` exists today but is product-scoped — this PR generalizes rather than duplicates (one collector for CLI, MCP, and app; that's the point). [Source: architecture.md#loredex-library-surface]
- `HandoffCard` becomes the payload of the `handoffs.list` channel and of `handoff.new` events — include everything Story 3.2's card UI needs (from/to, objective, age source, status) so the app never re-parses notes for the board. [Source: architecture.md#ipc-contract]
- Status vocabulary in M1 is open/consumed only — do NOT introduce the M2 lifecycle states here; consume attribution fields arrive with PR-2.
- Listing is read-only; no write-lock or schema-stamp concerns in this PR.

### Testing

- loredex repo: fixture vault with handoffs in both directions across ≥2 projects; scope matrix (inbox/outbox/all × project/company); CLI snapshot parity. [Source: architecture.md#testing-strategy]

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
