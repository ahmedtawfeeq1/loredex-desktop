# Story 10.1 (SUPERSEDED): Dependency edge model (core host)

## Status

Superseded — replaced by the Vault Atlas (docs/plan/ATLAS-CONCEPT.md §5). The `graph.model` channel is not built; route edges, blocking flags, depth and critical path are subsumed by `atlas.graph` in epic10.story1-atlas-model.md (ATLAS-1). Do not implement.

## Story

**As the** graph and blocked-on views,
**I want** a single derived edge model of projects and handoffs computed in the core host,
**so that** both views render one truth without re-parsing notes in the renderer.

## Acceptance Criteria

1. A core-host module computes, on demand, a graph model from lib data only (`listHandoffs` + v2 fields): nodes = registered projects (name, open inbound count); edges = handoffs (`from_project → to_project`, carrying id, kind, status, age), plus `replies_to` and `fulfills` edges between handoff nodes.
2. Each project node gets a **dependency depth** (longest path over open `request` edges, sources at depth 0) and each edge a `blocking` flag: an open/accepted `kind: request` edge blocks its target; the **critical path** (longest chain of blocking edges) is marked.
3. A `graph.model {}` → `{nodes, edges, criticalPath}` channel is added (derived, read-only — no new persistent state); cycles are detected and broken deterministically (flagged, never crash or hang).
4. The model recomputes on `handoff.created` / `handoff.stateChanged` / poller integrates; expired snoozes count as open for blocking purposes (derived flag rule).
5. Unit tests cover depth assignment, blocking/critical-path marking, cycle handling, and v1-vault degradation (no kind → `delivery` → never blocking).

## Tasks / Subtasks

- [ ] Model builder (AC: 1, 2)
  - [ ] `src/core/graph.ts`: collect via `listHandoffs` (company scope); nodes from the registry/config project set; edge records with id/kind/status/age; reuse `threads.ts` (Story 8.2) name resolution for replies_to/fulfills edges
  - [ ] Depth = longest-path layering over blocking edges; critical path = max-length blocking chain; deterministic tie-break (alpha by project)
- [ ] Channel + invalidation (AC: 3, 4)
  - [ ] Register `graph.model` in the contract + dispatcher; memoize, invalidate on handoff/vault events
- [ ] Tests (AC: 5)

## Dev Notes

- State placement: threads/lineage and board-lane truth live in vault frontmatter; the graph is DERIVED, recomputed — nothing goes to app-db. This story is core-host read-only view logic, which is exactly what NFR6 permits app-side. [Source: architecture-m2.md#8-ipc-additions]
- Blocking semantics follow the lifecycle: an open request is unanswered work someone waits on; declined/consumed/fulfilled requests stop blocking. Expired snooze sorts/counts with open everywhere — same rule here. [Source: architecture-m2.md#1-handoff-schema-v2]
- The renderer (Stories 10.2/10.3) consumes this channel verbatim — keep the payload shaped for direct rendering (node cards need name + open-count; edges need kind/status for styling). Layout constant: DESIGN lays the graph left→right by dependency depth — depth computed HERE, not in the renderer. [Source: DESIGN.md#data-visualizations-dependency-graph-contract-timeline]
- Depends on Story 7.1 (kind/status fields in cards) and 8.2 (`threads.ts` resolution helpers). No lib changes — build nothing twice, call `listHandoffs`.
- Files: `src/core/graph.ts`, `src/shared/ipc-contract.ts` (`graph.model` + payload types), `src/core/ipc.ts`.

### Testing

- Unit: fixture card sets → depth layers (linear chain, diamond, disconnected), blocking matrix (kind × status × expired-snooze), cycle fixture (A→B→A) flagged + terminates, v1 defaults never block. [Source: architecture-m2.md#1-handoff-schema-v2]

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-10 | 0.1 | Drafted from architecture-m2.md (M2 cycle) | Bob (SM) |
| 2026-07-10 | 1.0 | Approved | Sarah (PO) |
| 2026-07-10 | 1.1 | Superseded by Vault Atlas ATLAS-1 (epic10.story1-atlas-model.md, per docs/plan/ATLAS-CONCEPT.md) | Bob (SM) |

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## QA Results
