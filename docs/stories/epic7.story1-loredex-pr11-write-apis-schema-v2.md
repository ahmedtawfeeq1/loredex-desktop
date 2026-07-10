# Story 7.1: loredex PR-11 — handoff write APIs & schema v2 (loredex repo)

## Status

Done

## Story

**As a** desktop app and CLI,
**I want** lib exports for creating, replying to, transitioning, annotating, and routing handoffs with schema v2 stamping,
**so that** every vault write in the M2 cycle flows through one shared engine (anti-second-engine rule).

## Acceptance Criteria

1. `LOREDEX_SCHEMA` bumps 1 → 2 in `loredex/src/core/frontmatter.ts`; new `Meta` fields (`status` lifecycle values, `kind`, `replies_to`, `fulfills`, `declined_reason`, `snoozed_until`, `accepted_by/at`, `declined_by/at`, `snoozed_by/at`) are additive; every engine write of any v2 field stamps `loredex_schema: 2` via the existing `stampSchema`; v1/unversioned notes remain fully readable with the documented defaults.
2. New module `loredex/src/core/handoff.ts` exports `createHandoff`, `replyToHandoff`, `setHandoffStatus`, `annotateHandoff`, and `routeFile` with exactly the signatures and semantics in architecture-m2.md §2, including `HandoffCreateResult` and `StatusReceipt` types.
3. The v2 state machine is enforced: legal transitions per the writer-semantics table; illegal transitions (`consumed → *`, reopen from accepted, decline without reason, snooze without date) throw typed errors (`ILLEGAL_TRANSITION`); reopen removes snooze fields but keeps decline/accept attribution.
4. The V1-STATUS qualified-id TODO is fixed: handoff id resolution accepts `"<project>/<name>"`; a bare name matching >1 handoff throws `AMBIGUOUS_HANDOFF`, unknown throws `UNKNOWN_HANDOFF` — the shared finder is extracted and `consumeHandoff` rewired onto it (closes the board action item on colliding basenames).
5. `events.ts` gains `'handoff.created'` and `'handoff.status'` event kinds with the specified payloads; every new write op emits under the existing injectable emitter (PR-8), commits via `gitAutoCommit` + best-effort `gitPullPush`.
6. CLI subcommands for the new operations ride the same release; `vaultSchemaStatus` + `loredex doctor` + `.loredex/engine.json` handle the schema-1-engine-on-v2-vault degradation as specified; tests pass and the desktop pin is bumped.

## Tasks / Subtasks

- [x] Schema v2 (AC: 1)
  - [x] Bump `LOREDEX_SCHEMA` to 2; extend `Meta` with the additive fields table (defaults: `kind` → `delivery` when absent)
  - [x] Verify gray-matter round-trip of unknown keys keeps v1 writers lossless on v2 notes (regression test)
- [x] `createHandoff` + `replyToHandoff` (AC: 2, 5)
  - [x] `handoff.ts createHandoff`: validate `input.notes` via `curate.ts collectNotes` (unknown name → throw), dest `projects/<to>/handoffs/<date>-handoff-<from>[-n].md` via `slugify/uniquePath`, brief assembled verbatim from inputs (NO LLM), `serializeDoc/stampSchema`, commit/push, `rebuildIndexes`, emit `handoff.created`
  - [x] `replyToHandoff`: parent lookup via the shared finder (throws UNKNOWN_HANDOFF if missing), invert route, set `replies_to`; kind default: reply to `request` → `delivery`
- [x] `setHandoffStatus` + shared finder (AC: 3, 4)
  - [x] Extract the resolve-by-id walk from `consume.ts` into a shared finder with qualified-id support; rewire `consumeHandoff`
  - [x] Implement `HandoffTransition` union; write only the fields in the writer-semantics table per transition; return `StatusReceipt` (mirrors `ConsumeReceipt`); emit `handoff.status`
- [x] `annotateHandoff` + `routeFile` (AC: 2)
  - [x] `annotateHandoff`: NEW note `type: 'comment'`, `replies_to: id`, filed in the handoff's own `handoffs/` dir — never mutates the handoff
  - [x] `routeFile`: pure composition of `router.ts planFile + executePlan + knownStructure`
- [x] Degradation + release (AC: 6)
  - [x] `.loredex/engine.json` `schema: 2` written on first v2 write and on scaffold; doctor warns on `declared > supported`
  - [x] CLI subcommands; loredex tests + release; desktop pin bump

## Dev Notes

- **Repo:** sibling `loredex` repo; only the pin bump touches the desktop app. This is the FIRST M2 story by sequencing constraint: no app story that writes handoffs may be authored against a pin predating it. [Source: architecture-m2.md#8-ipc-additions]
- Field-by-field schema, defaults, and the state machine with per-transition writer/fields are decided and final — implement the tables verbatim, do not redesign. Exactly one writer per transition keeps merge pressure near zero. [Source: architecture-m2.md#1-handoff-schema-v2]
- **Snooze expiry never auto-writes**: readers derive an "expired" flag when `snoozed_until` < today; flipping status back is a human action. [Source: architecture-m2.md#1-handoff-schema-v2]
- Signatures, reuse table (build nothing twice), event payloads, and typed error codes (`ILLEGAL_TRANSITION`, `AMBIGUOUS_HANDOFF`, `UNKNOWN_HANDOFF`) are specified exactly. [Source: architecture-m2.md#2-lib-api-additions]
- `replies_to`/`fulfills` values are note names (no `.md`, no path) resolving via the existing shortest-path logic — same rule as reading-order wikilinks. [Source: architecture-m2.md#1-handoff-schema-v2]
- Every transition = one lib write op = write-lock (app-side) + `gitAutoCommit` + best-effort `gitPullPush` + `emitLoredexEvent`. Consume keeps its existing `'consume'` event. [Source: architecture-m2.md#2-lib-api-additions]

### Testing

- loredex repo: state-machine matrix (every legal + illegal transition), qualified-id resolution (bare unique / bare ambiguous / qualified / unknown), v1-engine-on-v2-note round-trip losslessness, create/reply/annotate fixture vault with cross-project collisions, `routeFile` parity with CLI plan/apply. CLI snapshot parity for new subcommands. [Source: architecture-m2.md#1-handoff-schema-v2]

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-10 | 0.1 | Drafted from architecture-m2.md (M2 cycle) | Bob (SM) |
| 2026-07-10 | 1.0 | Approved | Sarah (PO) |
| 2026-07-10 | 2.0 | Implemented (loredex d92146d), pin bumped to packed tarball, Done | Dev Agent |

## Dev Agent Record

### Agent Model Used

Claude Fable 5 (claude-fable-5)

### Debug Log References

- loredex full suite: 22 files / 140 tests green (25 new in `tests/handoff-v2.test.ts`); `tsc --noEmit` + `biome check` + `tsup` build green.
- Desktop: `npm run typecheck` + vitest 28 files / 150 tests + `npm run build` green after pin bump.
- Back-compat evidence (nimbus `_machine2` vault): packed lib wrote a v2 handoff (`status: accepted`, `kind: request`, `loredex_schema: 2`, `.loredex/engine.json {"schema": 2}`); registry `loredex@2.1.0` (schema-1 engine, run from a neutral cwd) lists the v2-stamped open handoff correctly and its `doctor` warns `vault declares 2, engine supports 1`.
- CLI lifecycle verified live: `--snooze/--reopen` transitions succeed; `--decline` without `--reason` and reopen-from-accepted throw `ILLEGAL_TRANSITION` messages.

### Completion Notes List

- `LOREDEX_SCHEMA` 1 → 2; `Meta` gains kind/replies_to/fulfills/declined_reason/snoozed_until + accepted/declined/snoozed `_by/_at` (all additive).
- New `src/core/handoff.ts`: `createHandoff`, `replyToHandoff`, `setHandoffStatus`, `annotateHandoff`, `routeFile`, plus `resolveHandoffPath` (shared finder) and typed `HandoffError` (`ILLEGAL_TRANSITION` / `AMBIGUOUS_HANDOFF` / `UNKNOWN_HANDOFF`). `consumeHandoff` rewired onto the finder — bare colliding ids now throw instead of silently picking the first match (V1-STATUS TODO closed).
- State machine enforced exactly per architecture-m2.md §1: decline requires reason, snooze requires YYYY-MM-DD, reopen only from declined/snoozed and removes snooze fields while keeping decline/accept attribution; consumed is terminal.
- `events.ts` gains `handoff.created` + `handoff.status`; every write op commits via `gitAutoCommit` + best-effort `gitPullPush`.
- `listHandoffs` cards gain `kind` (default `delivery`), `repliesTo`, `fulfills`, `snoozedUntil`, and derived `expired` (sorts with open; never written back).
- `.loredex/engine.json` `{schema: 2}` written on scaffold and on every versioned write (`stampEngineSchema`, advisory/never-throws).
- CLI: `handoffs --accept/--decline --reason/--snooze --until/--reopen/--annotate --title --message`; `handoff` create path now stamps `kind: delivery` + engine.json. Create/route already had CLI commands (`handoff`, `route`); no CLI flag for `replyToHandoff` (app-facing sugar over `createHandoff`) — deviation noted.
- `replyToHandoff` signature kept verbatim (`kind` required by the Omit type); the reply-to-request → delivery default applies at runtime when JS callers omit it.
- Desktop pin: `loredex` → `file:../loredex/loredex-2.1.0.tgz` (content-pinned; npm version bump happens at release). `notify.test.ts` card fixture updated for the two new required `HandoffCard` fields.

### File List

- loredex (sibling repo, commit d92146d): `src/core/handoff.ts` (new), `src/core/frontmatter.ts`, `src/core/events.ts`, `src/core/consume.ts`, `src/core/product.ts`, `src/core/vault.ts`, `src/commands/handoff.ts`, `src/cli.ts`, `src/lib.ts`, `tests/handoff-v2.test.ts` (new)
- loredex-desktop: `package.json`, `package-lock.json` (pin bump), `src/core/notify.test.ts`, `docs/stories/epic7.story1-loredex-pr11-write-apis-schema-v2.md`, `docs/stories/sprint-status.yaml`

## QA Results
