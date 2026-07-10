# Story 10.5: Tours from curate reading orders — ATLAS-5

## Status

Done

## Story

**As a** newcomer to a project (or the recipient of a handoff),
**I want** guided tours generated from the reading orders, threads, and topics the vault already contains,
**so that** "where do I start" is answered by walking the actual notes in the order their author intended.

## Acceptance Criteria

1. A new CoreApi channel `atlas.tours: { in: { scope? }, out: TourDef[] }` extracts tours from existing truth — no LLM, no new persistent state: (a) **reading-order tours** — each handoff's `## Reading order` wikilink list, step k = note k, step description = the surrounding prose from the handoff body; (b) **thread tours** — walking a `replies_to`/`fulfills` chain in order; (c) **topic tours** — a topic's notes date-ordered plus closing handoffs.
2. When a handoff lacks a reading order, a deterministic **heuristic fallback** orders steps by BFS from the handoff over thread/wikilink edges, date-tiebroken; heuristic tours are labeled as such in the payload.
3. A tour panel (title, step description, step x/y, prev/next) drives playback: each step highlights the step's nodes (pulse ring, disabled under reduced-motion), **auto-opens the owning project cluster** (navigating levels via story 10.3 primitives), and fits the viewport to the highlighted set.
4. The tour "Start" button is the **gold primary of the Atlas view** (one per view); each tour step's card click performs the note/handoff resolution of its first node per the story 10.4 table.
5. Tours recompute with graph invalidation (`vault.changed`/post-pull); steps referencing notes that no longer resolve are dropped (tour shrinks, never errors); unit tests cover extraction from fixture handoffs (with and without reading orders), thread walking, date ordering, and the fallback.

## Tasks / Subtasks

- [x] Extraction (AC: 1, 2, 5)
  - [x] Core host: parse `## Reading order` ordered lists (wikilinks resolved via core `links.ts`, same rule as everywhere); thread chains from `replies_to`/`fulfills`; topic date-order; BFS fallback with date tie-break; `atlas.tours` in contract + dispatcher
- [x] Playback (AC: 3, 4)
  - [x] `views/atlas/TourPanel.tsx`: prev/next, step state; store slice tour cursor; step → highlight set + auto-open cluster + viewport fit; gold Start button
- [x] Tests (AC: 5)

## Dev Notes

- The core insight is §2's: **tours ARE the interactive form of curate reading orders** — every handoff already carries a `## Reading order` list of wikilinks (verified in nimbus-vault handoffs); that IS a tour. Also derivable: per-topic tour and thread tour. A tour is nothing more than "an ordered list of (title, prose, nodeId[]) that drives the same navigation primitives a user has." No generation step, no tour-builder agent. [Source: plan/ATLAS-CONCEPT.md#2-concept-translation-understand-anything--loredex-vault-atlas] [Source: plan/ATLAS-CONCEPT.md#1-what-understand-anything-actually-does-verified-from-source]
- Playback mechanics port conceptually 1:1 from UA: highlight step nodes, auto-open the owning project cluster, fit viewport, prev/next — implemented on top of story 10.3's discrete navigation, not a camera animation system. [Source: plan/ATLAS-CONCEPT.md#2-concept-translation-understand-anything--loredex-vault-atlas]
- The heuristic fallback is the ATLAS-5 slice verbatim: "BFS from the handoff over thread/wikilink edges, date-tiebroken — the UA `generateHeuristicTour` idea minus topo-sort ceremony." Deterministic, testable, labeled. [Source: plan/ATLAS-CONCEPT.md#story-slices-realistic-sequential-where-marked]
- `atlas.tours` channel shape is sketched in §5 (final types in `ipc-contract.ts`); reading-order extraction is new but read-only app-side code (data-availability table). Tour-step resolution recurses into the §3 table ("tour step | performs the note/handoff resolution of its first node"). Gold spend: "the tour 'Start' button is the gold spend on this view"; reduced-motion honored on tour pulse. [Source: plan/ATLAS-CONCEPT.md#5-implementation-notes-for-our-stack] [Source: plan/ATLAS-CONCEPT.md#3-the-hyperlink-everything-rule]
- Depends on stories 10.1–10.4; independent of 10.6/10.7. Files: core tour extraction (in/next to `src/core/atlas.ts`), `src/shared/ipc-contract.ts` (`atlas.tours`), `src/renderer/src/views/atlas/TourPanel.tsx`, store slice.

### Testing

- Unit: fixture handoff with reading order → correct step notes + prose; handoff without → labeled BFS fallback, date tie-break deterministic; thread tour order; topic tour date order; dangling step dropped; playback highlights + cluster auto-open + fit called per step; reduced-motion disables pulse. [Source: DESIGN.md#quality-floor-non-negotiable-carried-from-v1]

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-10 | 0.1 | Drafted from ATLAS-CONCEPT.md §5 (ATLAS-5) | Bob (SM) |
| 2026-07-10 | 1.0 | Approved | Sarah (PO) |

## Dev Agent Record

### Agent Model Used

claude-fable-5 (Claude Code)

### Debug Log References

- `npx vitest run` — 46 files / 327 tests green (includes `src/core/tours.test.ts` 11 tests, real nimbus-vault reading-order suite, and `tour-playback.test.ts`)
- `npx tsc --noEmit` clean; `npm run build` green

### Completion Notes List

- Extraction rides the lib's already-parsed `HandoffCard.readingOrder` (names resolved via the story 2.2 resolver); `readingOrderProse` lifts only the same-line trailing prose of `## Reading order` list items as step descriptions — verbatim, no generation.
- Heuristic fallback: BFS from the handoff over thread+wikilink edges, (depth, date, id)-ordered, `heuristic: true` in the payload and labeled in the panel + tour rows.
- Thread tours walk replies_to/fulfills components oldest-first; topic tours = notes date-ordered + closing handoffs (handoffs whose resolved reading order intersects the topic).
- Playback decisions are pure (`tour-playback.ts`): auto-open cluster via `navigate('learn', {project})`, expand the owning topic atom, highlight + `fitViewBoxAround` viewport fit. Gold spend: the panel's single "Start tour" button. Pulse ring is CSS-only; the global reduced-motion rule freezes it to a static gold ring.
- Tours cache invalidates with `invalidateAtlas()`; renderer refetches tours on the same events as the graph and re-points active playback at the fresh (possibly shrunk) def.
- DoD evidence: nimbus test asserts the real `2026-07-10-handoff-nimbus-ai-engine` reading order becomes a non-heuristic tour stepping to `note:nimbus-ai-engine/streaming/2026-07-09-streaming-design`.

### File List

- src/shared/types.ts (TourKind/TourStep/TourDef)
- src/shared/ipc-contract.ts (atlas.tours channel)
- src/core/tours.ts (new: extraction + scope filter)
- src/core/tours.test.ts (new)
- src/core/atlas.ts (BaseModel exported; source cached; atlasTours + invalidation)
- src/core/handlers.ts (atlas.tours dispatch)
- src/renderer/src/stores/atlas.ts (panel/tours/playback state)
- src/renderer/src/views/atlas/tour-playback.ts + .test.ts (new: pure playback)
- src/renderer/src/views/atlas/TourPanel.tsx (new)
- src/renderer/src/views/atlas/decor.ts (new: ring taxonomy seam)
- src/renderer/src/views/atlas/atlas-geometry.ts (fitViewBoxAround)
- src/renderer/src/views/atlas/AtlasCanvas.tsx, AtlasNodeCard.tsx, AtlasView.tsx (decor + fit + panel wiring)
- src/renderer/src/views/search/Palette.tsx (⌘K tour actions)
- src/renderer/src/styles.css (tour panel + pulse ring)

## QA Results
