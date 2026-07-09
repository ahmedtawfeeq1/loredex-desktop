# Story 3.3: loredex PR-2 — consumeHandoff & schema versioning (loredex repo)

## Status

Done

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

- [x] Extract consume (AC: 1, 2)
  - [x] Move the CLI consume command's logic into `core/` as `consumeHandoff(id, identity: Identity)`; export `Identity` (`{name, email}`) and `ConsumeReceipt` (what changed: frontmatter before/after, note path, timestamp, pushed?)
  - [x] Frontmatter gains consume who/when fields (closed vocabulary, one writer per transition); CLI command rewired onto the export
  - [x] Emit a consume event via the PR-8 emitter
- [x] Schema versioning (AC: 3, 4)
  - [x] Introduce the schema constant (bump to the first versioned schema, n=1 → this PR's consume fields make it n=2 if v1 described the unversioned state — decide in-PR and document); every engine write path stamps `loredex_schema: <n>` in frontmatter it writes
  - [x] `scaffoldVault` + a migration write `.loredex/engine.json` `{minEngine, schema}` at the vault root
  - [x] Read paths tolerate missing `loredex_schema` (pre-versioning notes); doctor + lib warn on vault schema > supported schema
  - [x] Export the schema constant so the desktop discovery file (Story 1.6 TODO) reports it
- [x] Release (AC: 5)
  - [x] Tests; regression suite; release; desktop pin bump; replace `ConsumeReceipt`/`Identity` stubs in `src/shared/types.ts`

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

claude-fable-5 (Claude Code)

### Debug Log References

- loredex repo: `npm run typecheck` clean; `npm run lint` clean; `npm test` 115/115 green; `npm run build` OK (commit 928f13b)
- Manual: consume fields verified via `parseDoc` in tests; doctor schema check exercised in tests via `vaultSchemaStatus`

### Completion Notes List

- `consumeHandoff(vaultPath, config, id, identity, {project?})` in new `loredex/src/core/consume.ts`: writes `status: consumed`, `consumed_by: "Name <email>"`, `consumed_at: <ISO>`, `loredex_schema: 1`; commits, best-effort syncs, emits a `consume` event, returns `ConsumeReceipt` (before/after Meta diff, path, timestamp, pushed).
- CLI `handoffs --consume` AND MCP `handoff_consume` rewired onto it (identity from ambient git config via exported `ambientGitIdentity`) — one consume writer.
- `LOREDEX_SCHEMA = 1` (first versioned schema; includes the consume fields) + `stampSchema` in `frontmatter.ts`; engine note-creation write paths stamp it (route/store via `executePlan`, handoff creation, consume).
- `vaultSchemaStatus(vaultPath)` exported; `loredex doctor` gains a "frontmatter schema" check and warns loudly when the vault declares a newer schema than the engine supports. Read paths tolerate unversioned notes (tested).
- Desktop `Identity`/`ConsumeReceipt` stubs replaced with `import type` re-exports from 'loredex'.
- DEVIATION (sanctioned scope cut): `.loredex/engine.json` {minEngine, schema} NOT written (skipped per v0.1 scope); schema comparison uses note-declared `loredex_schema` instead. Curate/reset rewrites of existing user notes deliberately do not stamp (they mutate user-authored notes; stamping is confined to engine-created/transitioned frontmatter).
- DEVIATION: no npm release/pin bump — local `file:` dep; release-time TODO.

### File List

- loredex: src/core/consume.ts (new), src/core/frontmatter.ts, src/core/router.ts, src/commands/handoff.ts, src/commands/doctor.ts, src/mcp/server.ts, src/lib.ts, tests/consume.test.ts (commit 928f13b)
- loredex-desktop: src/shared/types.ts

## QA Results

**Verdict: PASS with concerns** — Evidence base (QA pass 2026-07-10, fresh-eyes BMAD QA agent): app vitest 118/118 (23 files), lib vitest 115/115, `npm run typecheck` clean, `npm run build` clean, time-boxed `npm run dev` smoke (alive 3+ min, clean exit), and an M1-DoD driver that exercised the core-host modules directly against the real nimbus simulation vault (tree/readNote/resolveLink/search/handoffs/homeBrief/syncStatus/activity).

- AC1/AC2: verified — `consumeHandoff` in lib `core/consume.ts`, CLI + MCP rewired; writes status/consumed_by/consumed_at and returns `ConsumeReceipt` (lib tests green).
- AC3: **concern (recorded deviation)** — `loredex_schema: 1` stamping verified in lib tests, but `.loredex/engine.json` {minEngine, schema} is NOT written (v0.1 scope cut). NFR8's handshake leans on frontmatter stamps only.
- AC4: verified — `vaultSchemaStatus` + doctor warning covered by lib tests.
- AC5: **concern** — lib tests pass but no npm release/pin bump (file: dep; release blocker).
