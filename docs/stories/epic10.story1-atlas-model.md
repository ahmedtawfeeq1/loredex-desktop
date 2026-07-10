# Story 10.1: Atlas data model + `atlas.graph` channel (core host) — ATLAS-1

## Status

Done

## Story

**As the** Vault Atlas views (Overview, Learn, Deep Dive),
**I want** a single derived `AtlasGraph` — nodes, typed edges, clusters, precomputed positions — built in the core host from indexes we already have,
**so that** every Atlas surface renders one truth with zero LLM steps, zero re-parsing in the renderer, and zero new persistent state.

## Acceptance Criteria

1. A core-host builder produces an `AtlasGraph` from lib/index data only, with exactly **6 node types** — `project` (cluster), `note`, `handoff`, `contract`, `source`, `commit` — and **6 edge categories** — `route`, `thread`, `wikilink`, `provenance`, `contract-link`, `affinity`. Node ids are typed-prefixed strings (`note:<project>/<topic>/<name>`, `handoff:<project>/<name>`, …); clusters = projects containing topic groups (no inference — the vault folders ARE the layers).
2. Edges are lifted from existing truth, never re-derived: `route` from handoff `from_project → to_project` (carrying id, kind, status, age, and a `blocking` flag for open/accepted requests, expired snooze counting as open); `thread` from `replies_to`/`fulfills`; `wikilink` from body links incl. reading-order lists via core `links.ts` shortest-path resolution; `provenance` from `source_path`/`source_project`/`source_rel`; `contract-link` from the contracts scan **carrying the m2 §5 `confidence: 'mentioned' | 'heuristic'` tier verbatim**; `affinity` computed same-topic (the only computed category, weight = shared topic).
3. A new CoreApi channel `atlas.graph: { in: { scope?: { project?: string; topic?: string }, level: 'overview'|'learn'|'deep' }, out: AtlasGraph }` is registered in `ipc-contract.ts` + dispatcher. Output includes per-node precomputed positions per the DESIGN layout rules (left→right by route-dependency depth, topics stacked, notes date-sorted) — deterministic, diffable in tests, no physics.
4. The graph is a derived, memoized cache invalidated on `vault.changed` and post-pull reconcile (F4 full-rebuild rule) — same tier as the existing link graph; nothing goes to app-db or the vault. `overview` level returns only project clusters + aggregated route edges (`N open / M total` counts); note-level nodes appear only at `learn`/`deep` scope.
5. Contract-tested against the fixture vault; degradation is graceful and tested: v1 vault (no kind/status) → routes never block; missing provenance/contracts/commits → those node types simply absent; cycles in route edges detected and broken deterministically (flagged, never hang). If per-note metadata needs a lib touch, prefer a small `listNotes(project?)` lib export over N× `vault.readNote` — decide in-story; if added it rides an existing lib-PR train, no new engine.

## Tasks / Subtasks

- [x] Builder (AC: 1, 2)
  - [x] `src/core/atlas.ts`: nodes from registry/config project set + note/handoff/contract/source/commit collection (`listHandoffs`, links index, `contracts.timeline` cache, `activity.feed`); edge extraction per category; affinity grouping by `topic`; blocking flag per m2 lifecycle rules
- [x] Layout + clustering (AC: 3, 4)
  - [x] Deterministic column layout (project depth over route edges, alpha tie-break); topic buckets with single-child suppression; aggregated inter-cluster route counts; positions in the payload
- [x] Channel + invalidation (AC: 3, 4)
  - [x] `atlas.graph` in `src/shared/ipc-contract.ts` + `src/core/ipc.ts`; memoize, invalidate on `vault.changed` / post-pull
- [x] Tests (AC: 5)

## Dev Notes

- Taxonomy is binding: 6 node types and 6 edge categories, mapped one-to-one from the concept-translation table — do not add types, and remember the hyperlink-everything corollary: a node type with no resolution target doesn't get to be a node (story 10.4 wires the targets; this story must only emit the 6 resolvable types). [Source: plan/ATLAS-CONCEPT.md#2-concept-translation-understand-anything--loredex-vault-atlas] [Source: plan/ATLAS-CONCEPT.md#3-the-hyperlink-everything-rule]
- Placement per §5: edge model lives in the **core host** as a derived recomputed cache, same tier as the link graph — read-only view logic, legal app-side under the anti-second-engine rule; no lib PR strictly required for v1. Channel shape (`scope`/`level` in, nodes+edges+clusters+positions out) is sketched there; final types go in `ipc-contract.ts`. [Source: plan/ATLAS-CONCEPT.md#5-implementation-notes-for-our-stack] [Source: architecture-m2.md#8-ipc-additions]
- What NOT to build: no tree-sitter/import parsing of team repos (source files enter only via provenance pointers), no LLM summaries (card summary = objective or first body sentence, already authored), no embeddings, no ELK/d3 — deterministic column layout beats a physics engine at our scale and is diffable. Keep the ideas layout machinery served: collapsed cluster atoms, lazy expand, aggregated edges. [Source: plan/ATLAS-CONCEPT.md#4-what-we-deliberately-do-not-adopt]
- Data availability table (§5) says every edge source exists today except reading-order extraction (new read-only app-side parse of `## Reading order`, shared with story 10.5) and possibly `listNotes` (see AC5). Provenance re-resolution uses the m2 §5 project-roots map, config wins over app-db. [Source: plan/ATLAS-CONCEPT.md#5-implementation-notes-for-our-stack] [Source: architecture-m2.md#5-contract-intelligence-read-only-app-side--no-vault-writes-so-core-host-code-not-lib]
- Blocking semantics reuse the lifecycle rules: open/accepted `kind: request` blocks its target; expired snooze derives as open (never auto-written). [Source: architecture-m2.md#1-handoff-schema-v2]
- Supersedes the old dependency edge model story (`graph.model` channel is not built; the Atlas route category subsumes it). Depends on nothing new; blocks stories 10.2–10.7. Files: `src/core/atlas.ts`, `src/shared/ipc-contract.ts`, `src/core/ipc.ts`.

### Testing

- Contract tests over the fixture vault: node/edge counts per category, id stability, cluster membership, aggregated overview counts, confidence tiers pass through untouched, positions deterministic across runs, blocking matrix (kind × status × expired snooze), route cycle flagged + terminates, v1-vault degradation. [Source: plan/ATLAS-CONCEPT.md#story-slices-realistic-sequential-where-marked]

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-10 | 0.1 | Drafted from ATLAS-CONCEPT.md §5 (ATLAS-1); supersedes epic10.story1-dependency-edge-model | Bob (SM) |
| 2026-07-10 | 1.0 | Approved | Sarah (PO) |

## Dev Agent Record

### Agent Model Used

Fable 5 (claude-fable-5)

### Debug Log References

- `npx vitest run src/core/atlas.test.ts` — 28/28 (pure model + channel + nimbus contract suite)
- `npm run typecheck && npx vitest run` — 41 files / 276 tests green; `npm run build` green

### Completion Notes List

- Pure builder (`buildAtlasModel`) behind an injectable `AtlasSource` seam; production source is engine-backed (`listHandoffs`, tree walk, story 2.2 resolver, `config.projects` roots map). Memoized per generation; `invalidateAtlas()` rides every `invalidateLinkIndex` site + the F4 `reconcileState` + consume/setStatus (stamp flips before any renderer refetch).
- Commit nodes enter via m2 §5's `mentioned` tier (word-bounded 7–40-hex sha with a digit in a note/handoff body — the story 2.5 sha rule) and via the contract-scan provider. The provider is `contracts: []` until story 11.1 ships its scan, so contract nodes are absent in production today (AC5 degradation, hyperlink-everything corollary); tier passthrough is contract-tested with synthetic rows.
- `activity.feed`-derived commits (task note) deliberately NOT emitted as nodes: no AC2 edge category legally connects a bare vault commit to anything, and a node without an edge or resolution has no place on the map. Commit nodes require a mention (edge + resolution) — recorded as the honest reading of AC2's binding edge enumeration.
- Commit-chip base tries the project repo's origin (roots map) first, falls back to the vault remote; GitHub-only per m2 §6 (`commitBase: null` → renderer mono + copy-sha).
- Aggregated overview counts use the board convention: open + expired snoozes count, snoozed-and-current never; `blocking` = open/accepted request (expired snooze counts as open).
- Route cycles: DFS with on-stack detection, back edges ignored, `cyclic: true` flagged on the graph — deterministic, terminates.

### File List

- `src/shared/types.ts` — Atlas payload types (node/edge/cluster/graph/scope/contract-change)
- `src/shared/ipc-contract.ts` — `atlas.graph` channel
- `src/core/atlas.ts` — NEW: builder, level projection, deterministic layout, memo + invalidation
- `src/core/handlers.ts` — channel registration + invalidation at write/refresh sites
- `src/core/index.ts` — `invalidateAtlas()` in the shared F4 reconcile
- `src/core/atlas.test.ts` — NEW: 28 tests (pure, channel over fixture vault, nimbus contract suite)

## QA Results

### Review — QA agent (fresh eyes), 2026-07-10

**Verdict: PASS.** Suites: app vitest 488/488 (63 files, incl. the new `tests/m2-e2e-drive.test.ts` module drive), lib vitest 143/143, typecheck (node+web) clean, production build clean.

- AC coverage: `atlas.test.ts` locks the binding taxonomy (exactly 6 node types / 6 edge categories asserted per node), clusters from explicit topic folders, confidence tiers verbatim from the 11.1 provider, invalidation on vault.changed/post-pull (`invalidateAtlas` called from the shared reconcile in `core/index.ts`).
- E2E drive: after real composes + a poller-integrated second-clone push, `atlas.graph deep` returned the new handoff nodes with `thread` edges for both `replies_to` and `fulfills` plus `route` edges — the graph is genuinely recomputed truth, not cache residue.
- QA fix rode this model (see 10.4): contract nodes now carry `project` (scan row → `AtlasContractChange.project?` → node) so their resolution can scope the timeline; additive, covered by re-run atlas + contracts suites.
