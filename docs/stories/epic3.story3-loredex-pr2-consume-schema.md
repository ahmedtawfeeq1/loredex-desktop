# Story 3.3: loredex PR-2 — consumeHandoff & schema versioning (loredex repo)

## Status

Approved

## Story

**As a** team,
**I want** consume as a shared lib export that stamps identity, timestamp, and a schema version,
**so that** app and CLI write identical, versioned frontmatter (FR8, NFR8).

## Acceptance Criteria

1. loredex exports `consumeHandoff(id, identity)` extracted from the CLI command into `core/`; the CLI is rewired onto it.
2. Consume writes who/when into the handoff frontmatter and returns an exported `ConsumeReceipt`.
3. Every engine vault write now stamps `loredex_schema: <n>`; scaffold/migration writes `.loredex/engine.json` `{minEngine, schema}`.
4. The lib and `loredex doctor` compare supported schema against the vault's declared schema and warn on mismatch.
5. Tests pass in the loredex repo; release published; desktop pin bumped.

## Tasks / Subtasks

- [ ] Extract consume (AC: 1, 2)
  - [ ] Move the CLI consume command's logic into `core/` as `consumeHandoff(id, identity: Identity)`; export `Identity` (`{name, email}`) and `ConsumeReceipt` (what changed: frontmatter before/after, note path, timestamp, pushed?)
  - [ ] Frontmatter gains consume who/when fields (closed vocabulary, one writer per transition); CLI command rewired onto the export
  - [ ] Emit a consume event via the PR-8 emitter
- [ ] Schema versioning (AC: 3, 4)
  - [ ] Introduce the schema constant (bump to the first versioned schema, n=1 → this PR's consume fields make it n=2 if v1 described the unversioned state — decide in-PR and document); every engine write path stamps `loredex_schema: <n>` in frontmatter it writes
  - [ ] `scaffoldVault` + a migration write `.loredex/engine.json` `{minEngine, schema}` at the vault root
  - [ ] Read paths tolerate missing `loredex_schema` (pre-versioning notes); doctor + lib warn on vault schema > supported schema
  - [ ] Export the schema constant so the desktop discovery file (Story 1.6 TODO) reports it
- [ ] Release (AC: 5)
  - [ ] Tests; regression suite; release; desktop pin bump; replace `ConsumeReceipt`/`Identity` stubs in `src/shared/types.ts`

## Dev Notes

- **Repo:** sibling `loredex` repo. This is M1's frontmatter schema change, which is exactly why the version key ships WITH it, not later (risk 9). [Source: architecture.md#state-placement]
- Consume attribution is team-visible truth → vault frontmatter, written by the lib only; per-user read-state stays out (that's app.db, Story 3.6). [Source: architecture.md#state-placement]
- `ConsumeReceipt` must carry enough to render "exactly what changed and that it pushed" (Story 3.4's receipt UI) — frontmatter diff + push outcome.
- Handshake wiring on the desktop side: after the pin bump, `src/core/discovery.ts` replaces its hardcoded `schemaVersion` TODO with the exported schema constant, and `tests/pinned-release.test.ts` gains a schema-stamp assertion.
- Keep M1 status vocabulary open/consumed; the M2 lifecycle extends the same versioned schema later.

### Testing

- loredex repo: consume writes who/when + schema stamp; receipt diff correctness; unversioned-note tolerance; doctor mismatch warning matrix; CLI behavior parity. [Source: architecture.md#testing-strategy]

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
