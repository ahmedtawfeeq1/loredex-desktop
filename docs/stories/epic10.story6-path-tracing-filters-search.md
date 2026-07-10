# Story 10.6: Path tracing + filters + search + blocked-on/focus mode — ATLAS-6

## Status

Done

## Story

**As a** PM,
**I want** to trace how a decision reached a repo, filter the Atlas down to what matters, search it from ⌘K, and isolate what's blocked or focused,
**so that** "what's stuck, on whom, and how did we get here" answers itself on the map.

## Acceptance Criteria

1. A new CoreApi channel `atlas.path: { in: { from: string; to: string }, out: { nodeIds: string[]; edgeIds: string[] } | null }` runs BFS shortest-path over a bidirectional adjacency list **in the core host** (the graph already lives there); a path-trace UI lets the user pick two nodes and renders the result **gold, as a clickable routing-slip chain** (each chain card resolves per the story 10.4 table); no path → one honest sentence, never a crash.
2. A filter panel narrows the canvas by node type, handoff status, topic, edge category, and confidence tier; filters compose (AND across facets), update the rendered set live, and show an active-filter count with one-click clear.
3. `vault.search` integration: the Atlas subscribes to the same ⌘K palette; search hits **tier node highlight rings by hit score**; clearing the query clears the rings. No second search engine — `vault.search` is the one already in the IPC contract.
4. **Focus mode**: a "focus" action on any card fades everything but the node's 1-hop neighborhood; Esc exits. **Blocked-on**: a one-click filter preset isolates blocking chains (open/accepted `kind: request` route edges, expired snooze counting as open — the model's `blocking` flag from story 10.1) rendered gold, with a side list of the blocking handoffs **oldest-first** stating "<to-project> is blocked on <from-project>"; rows resolve to the handoff board card. This preset replaces the superseded blocked-on list view.
5. Path, filters, search highlight, focus, and the blocked preset all interoperate (e.g. focus within a filtered set) and are keyboard-reachable + ⌘K-listed; unit tests cover BFS (path found/none/self), filter composition, score tiering, 1-hop fade set, and blocked ordering.

## Tasks / Subtasks

- [x] `atlas.path` (AC: 1)
  - [x] Core BFS over the story 10.1 adjacency; channel in contract + dispatcher; `views/atlas/PathTrace.tsx` picker + gold chain rendering
- [x] Filters (AC: 2)
  - [x] `views/atlas/AtlasFilterPanel.tsx` + store slice; live set recompute; active count + clear
- [x] Search + focus + blocked (AC: 3, 4)
  - [x] ⌘K/`vault.search` subscription with score-tiered rings; focus action (1-hop fade, Esc); blocked preset + oldest-first side list
- [x] Tests (AC: 5)

## Dev Notes

- Path tracing is UA's BFS PathFinder pointed at a better question: "how did this decision reach that repo?" — a path from a note through handoff → consume → contract change → commit is a *provenance story*, rendered as a routing-slip chain. Plain BFS over a bidirectional adjacency list; no weights, no Dijkstra. [Source: plan/ATLAS-CONCEPT.md#2-concept-translation-understand-anything--loredex-vault-atlas]
- The ATLAS-6 slice is binding: "`atlas.path` BFS + gold path rendering as a routing-slip chain; filter panel (node type, handoff status, topic, edge category, confidence tier); `vault.search` hits tier node highlight rings; focus mode (1-hop isolate)." Focus mode ports UA's `focusNodeId` identically. Channel shape per §5; BFS runs core-side. This story can start once 10.2 lands (10.3–10.5 not required). [Source: plan/ATLAS-CONCEPT.md#story-slices-realistic-sequential-where-marked] [Source: plan/ATLAS-CONCEPT.md#5-implementation-notes-for-our-stack]
- No embeddings/semantic mode in v1 — UA built one and never wired it; our corpus is well inside fuzzy territory and `vault.search` exists. Filtering happens at the *category* level for edges, mirroring UA. [Source: plan/ATLAS-CONCEPT.md#4-what-we-deliberately-do-not-adopt] [Source: plan/ATLAS-CONCEPT.md#1-what-understand-anything-actually-does-verified-from-source]
- Gold budget: "the critical path (path-trace result, blocked chains) gold" — path and blocked chains are this story's gold; still max one gold primary button per view. Blocking semantics per the lifecycle (open/accepted request; expired snooze derives open); older-first because age is the point of the blocked question. [Source: plan/ATLAS-CONCEPT.md#5-implementation-notes-for-our-stack] [Source: architecture-m2.md#1-handoff-schema-v2] [Source: DESIGN.md#tokens]
- Depends on stories 10.1 + 10.2 (10.4 for chain-card resolution — stub to board links if racing it). Files: `src/core/atlas.ts` (BFS), `src/shared/ipc-contract.ts` (`atlas.path`), `src/renderer/src/views/atlas/PathTrace.tsx`, `AtlasFilterPanel.tsx`, store slice.

### Testing

- Unit: BFS fixtures (linear, diamond, disconnected → null, self → single node), filter facet composition + clear, search score → ring tier mapping, focus fade = exactly 1-hop set, blocked preset ordering + sentence derivation, keyboard reachability. [Source: DESIGN.md#quality-floor-non-negotiable-carried-from-v1]

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-10 | 0.1 | Drafted from ATLAS-CONCEPT.md §5 (ATLAS-6); absorbs superseded epic10.story3-blocked-on-list-view | Bob (SM) |
| 2026-07-10 | 1.0 | Approved | Sarah (PO) |

## Dev Agent Record

### Agent Model Used

claude-fable-5 (Claude Code)

### Debug Log References

- `npx vitest run` — 49 files / 350 tests green (atlas-path BFS suite, shared blocked suite incl. nimbus real open request, atlas-filters suite, fixture-channel atlas.path round-trip)
- `npx tsc --noEmit` clean; `npm run build` green

### Completion Notes List

- `shortestPath` is plain BFS over a bidirectional, sorted (deterministic) adjacency of the base model's edges, core-side; `atlas.path` rides the cached model. Disconnected/unknown → null → one honest sentence in `PathTrace.tsx`; result renders gold on canvas (`atlas-edge-path`/`atlas-node-path`) AND as a clickable routing-slip chain (each card resolves via `activateNode`).
- The blocking rule moved to `src/shared/blocked.ts` (core `isBlocking` now delegates) so the atlas model and the blocked-on list can never disagree. Blocked rows are oldest-first with the AC-verbatim sentence "<to> is blocked on <from>"; rows resolve to the handoff board card. The preset (`filters.blocked`) isolates blocking handoffs + blocking route edges + their project endpoints and opens the side list — replacing the superseded blocked-on view.
- Filters AND-compose; facets judge only nodes they speak about (statuses → handoffs, topics → topic-carrying nodes), edges filter at CATEGORY level plus confidence tier; edges always drop with hidden endpoints. Active-count + one-click clear in the panel header.
- Search: no second engine — the atlas subscribes to `useSearch` (the same vault.search behind ⌘K) and tiers rings 1–3 by score relative to the best hit (navy, width by tier — distinct from selected/hover/tour/path). Clearing the query clears the rings.
- Focus: `focusNeighborhood` (1-hop) computed over the FILTERED edge set (interop per AC5); 'f' toggles focus on the selected card, Esc exits focus before walking up a level. All of it ⌘K-listed (filters/path/blocked/focus/path-from/path-to).
- Gold budget: path chain + blocked routes are this story's gold; no new gold buttons (Trace/Clear are navy outline).

### File List

- src/shared/blocked.ts + blocked.test.ts (new: shared rule + oldest-first rows + nimbus DoD test)
- src/shared/types.ts (AtlasPathResult), src/shared/ipc-contract.ts (atlas.path)
- src/core/atlas.ts (shortestPath + atlasPath; isBlocking delegates to shared)
- src/core/atlas-path.test.ts (new), src/core/atlas.test.ts (channel round-trip)
- src/core/handlers.ts (atlas.path dispatch)
- src/renderer/src/views/atlas/atlas-filters.ts + .test.ts (new: facets/focus/tiers)
- src/renderer/src/views/atlas/AtlasFilterPanel.tsx, PathTrace.tsx, BlockedList.tsx (new)
- src/renderer/src/views/atlas/decor.ts (search/path/focus classes), AtlasCanvas.tsx (edge decor, f key), AtlasView.tsx (filter pipeline, panels, Esc priority)
- src/renderer/src/stores/atlas.ts (filters/focus/path/searchRings + search subscription)
- src/renderer/src/views/search/Palette.tsx (⌘K actions)
- src/renderer/src/styles.css (panel, chain, blocked rows, ring taxonomy)

## QA Results
