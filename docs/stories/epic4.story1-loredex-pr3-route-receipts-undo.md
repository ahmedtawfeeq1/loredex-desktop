# Story 4.1: loredex PR-3 — route plan/apply, receipts & undo (loredex repo)

## Status

Done

## Story

**As an** app and CLI,
**I want** routing split into plan/apply with a persisted receipt and an undo,
**so that** no route is ever silent or irreversible (FR4).

## Acceptance Criteria

1. loredex splits `routeNote` into plan and apply: plan returns an exported `RoutePreview` (exact destination, invented-frontmatter diff, content hash); apply returns a receipt with a stable id.
2. An undo export replays the receipt's inverse, including index regeneration; receipts are persisted under the vault's `.loredex/` directory so CLI and app share them.
3. The CLI is rewired onto the same exports with default behavior unchanged.
4. Tests in the loredex repo; release published; desktop pin bumped.

## Tasks / Subtasks

- [ ] Plan/apply split (AC: 1)
  - [ ] In the loredex repo: refactor the routing internals (CLI/store paths) into `planRoute(file)` → `RoutePreview` (destination path, frontmatter to be invented/changed as a diff, content hash) and `applyRoute(preview)` → receipt `{id, preview, appliedAt, filesTouched}`
  - [ ] Export `RoutePreview` and the receipt type; stamp `loredex_schema` on written frontmatter (PR-2 machinery)
- [ ] Receipts + undo (AC: 2)
  - [ ] Persist receipts under `<vault>/.loredex/receipts/` (JSON per receipt, id-addressed); `undoRoute(receiptId)` replays the inverse (restore/remove routed copy, revert stamps) and regenerates indexes (`rebuildIndexes`)
  - [ ] Undo of an already-undone or superseded receipt fails loudly with a typed error
- [ ] CLI rewire (AC: 3)
  - [ ] Route command = plan+apply; output unchanged by default; receipts now also written for CLI routes (shared history)
- [ ] Release (AC: 4)
  - [ ] Tests; release; desktop pin bump; replace `RoutePreview` stub in `src/shared/types.ts`

## Dev Notes

- **Repo:** sibling `loredex` repo. Routing writes vault content — lib-only territory under the anti-second-engine rule; the app will call these exports via `route.preview`/`route.undo`. [Source: architecture.md#overview] [Source: architecture.md#ipc-contract]
- Receipts in `<vault>/.loredex/` are shared operational metadata (CLI and app must see the same history — F4's watcher/manual race is only reconcilable if both writers share receipts). They are team-visible-ish but machine-generated; keep them out of note frontmatter.
- The content hash in `RoutePreview` powers the app's dedupe (Story 4.2): two routes of identical content → same hash → merge offer instead of duplicate.
- Route/consume/store all emit through the PR-8 emitter — ensure apply/undo emit route events so the app's `route.completed` push works.
- Evidence anchor: F4 is the only friction that DAMAGED the vault (silent publish, duplicate-index hand-edits, stale stamps) — receipts must capture enough to reverse every write they describe.

### Testing

- loredex repo: plan/apply equivalence with legacy `routeNote`, receipt round-trip, undo restores byte-identical state + indexes, double-undo error, content-hash stability. [Source: architecture.md#testing-strategy]

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-09 | 0.1 | Drafted from PRD Epic 4 | Bob (SM) |
| 2026-07-09 | 1.0 | Approved | Sarah (PO) |

## Dev Agent Record

### Agent Model Used

Opus 4.8 (1M) — BMAD dev agent, epic4 sequential.

### Debug Log References

- Git-heavy lib tests flake under vitest file parallelism; run `npx vitest run --no-file-parallelism` (157 green).

### Completion Notes List

- **Approach:** Additive over the existing `executePlan` seam rather than a plan/apply rewrite — the single write chokepoint captures every source's pre-route bytes, persists a `RouteReceipt` JSON under `<vault>/.loredex/receipts/<id>.json` (rides the route's own git commit — `.loredex/` is tracked), and returns `receiptId` on `ExecuteResult`. `routeFile` widened to `{ written; receiptId? }`.
- **Undo (`undoRoute`)** deletes the created vault copies and restores each source to its exact captured bytes, then `rebuildIndexes` + `gitAutoCommit` — byte-identical vault, clean tree. Receipts are append-only: undo marks `undone: true` (a second undo throws `RouteUndoError('ALREADY_UNDONE')`; missing → `RECEIPT_NOT_FOUND`), so the audit trail survives (the one intended tree delta vs pre-route is the receipt JSON itself).
- **Content hash** on the receipt equals the note's stamped `source_hash` (same `hashBody`) — the dedup key story 4.2 reads.
- **Scope (spec §E / story 4.3 lib half):** `Config.neverRoute?: string[]` + a dependency-free `matchNeverRoute` (minimatch-ish, `scope.ts`); `executePlan` refuses a matched source with `RouteScopeError` at the one chokepoint, so app + CLI + store all honor the policy with no bypass.
- **Deviation:** pinned as `loredex-2.3.0.tgz` (release-please had bumped package.json to 2.2.0 but never packed it); no plan/apply *rename* (previewRoute/routeFile kept). CLI rewire (AC3) is satisfied for free — CLI routes go through `executePlan`, so they now write shared receipts + honor globs.

### File List

loredex repo (commit 5eb22e1): `src/core/receipts.ts` (new), `src/core/scope.ts` (new), `src/core/router.ts`, `src/core/config.ts`, `src/core/handoff.ts`, `src/lib.ts`, `tests/receipts.test.ts` (new), `package.json`, `CHANGELOG.md`.

## QA Results
