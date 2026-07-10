# Story 10.3: Zoom levels + drill navigation — ATLAS-3

## Status

Done

## Story

**As a** vault reader,
**I want** the Atlas to move between Overview, Learn, and Deep Dive as discrete navigation states with breadcrumbs and history,
**so that** exploring the vault feels like browsing, not panning a huge physics diagram.

## Acceptance Criteria

1. Zoom is **discrete navigation states, not camera zoom**: `Overview` (project cluster cards + aggregated route edges, story 10.2), `Learn` (one project or topic opened: topic groups, key notes, tour affordances), `Deep Dive` (every note/contract/source/commit node and every edge for the current scope). Each level maps to an `atlas.graph` call with the matching `level`/`scope`.
2. Clicking a project cluster drills into Learn for that project; topic folders render as **collapsed-atom groups** that expand lazily on click (one topic's notes at a time); single-child topic groups are dissolved (their one note renders directly).
3. Breadcrumbs (vault › project › topic) render at the top of the canvas and navigate back on click; a **bounded node-history stack** (max 50) supports back/forward through visited nodes/levels.
4. Level transitions preserve selection where the node still exists in the new scope; entering Deep Dive from Learn keeps the current project/topic scope.
5. Every navigation action is keyboard-reachable (Enter to drill, Esc/Backspace to go up, arrow keys across siblings) and listed in ⌘K; both themes, `:focus-visible` gold ring, reduced-motion respected.

## Tasks / Subtasks

- [x] Navigation state (AC: 1, 4)
  - [x] Atlas store slice: `level`, `scope`, selection; re-fetch `atlas.graph` on level/scope change; selection carry-over
- [x] Drill + collapsed atoms (AC: 2)
  - [x] Cluster click → Learn; topic group component with lazy expand + single-child suppression; Deep Dive renders full node/edge set for scope
- [x] Breadcrumbs + history (AC: 3)
  - [x] Breadcrumb bar; bounded history stack (50) with back/forward
- [x] Quality floor (AC: 5)
  - [x] Keyboard map, ⌘K entries, themes, reduced-motion
- [x] Tests

## Dev Notes

- The zoom taxonomy is the §2 translation of UA's discrete nav states: Overview = who owes whom; Learn = one project opened (topic groups, key notes, tour affordances); Deep Dive = everything in scope. "Keep breadcrumbs + node-history stack verbatim as concepts" — including the bounded stack (UA's `MAX_HISTORY = 50`). Discrete states + breadcrumbs are what make it feel like browsing, not panning. [Source: plan/ATLAS-CONCEPT.md#2-concept-translation-understand-anything--loredex-vault-atlas] [Source: plan/ATLAS-CONCEPT.md#1-what-understand-anything-actually-does-verified-from-source]
- Containers are **topic folders** — explicit, no Louvain fallback needed (our buckets always exist); keep UA's single-child suppression and collapsed-atom ideas. Lazy expand means Stage-2 cost is one project's notes at a time; the core precomputes positions per level, the renderer never lays out. [Source: plan/ATLAS-CONCEPT.md#2-concept-translation-understand-anything--loredex-vault-atlas] [Source: plan/ATLAS-CONCEPT.md#5-implementation-notes-for-our-stack]
- ATLAS-3 slice: "Overview ↔ Learn ↔ Deep Dive as discrete states; topic groups with collapsed-atom expand; breadcrumbs + bounded node-history; keyboard reachable." [Source: plan/ATLAS-CONCEPT.md#story-slices-realistic-sequential-where-marked]
- Personas / detail dials / view-mode trinity are deliberately NOT adopted — three levels only. [Source: plan/ATLAS-CONCEPT.md#4-what-we-deliberately-do-not-adopt]
- Node cards at Learn/Deep Dive may render placeholder cards here; full card spec + click resolution is story 10.4 (project-cluster drill is the one resolution this story owns, per the §3 table's `project` row). Depends on stories 10.1, 10.2. Files: atlas store slice, `views/atlas/AtlasBreadcrumbs.tsx`, `TopicGroup.tsx`, updates to `AtlasCanvas.tsx`.

### Testing

- Unit: level/scope transitions fetch the right graph, lazy expand renders one topic's notes, single-child suppression, breadcrumb navigation, history bound at 50 with correct back/forward, keyboard map. [Source: DESIGN.md#quality-floor-non-negotiable-carried-from-v1]

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-10 | 0.1 | Drafted from ATLAS-CONCEPT.md §5 (ATLAS-3) | Bob (SM) |
| 2026-07-10 | 1.0 | Approved | Sarah (PO) |

## Dev Agent Record

### Agent Model Used

Fable 5 (claude-fable-5)

### Debug Log References

- `npx vitest run src/renderer/src/views/atlas` — 17/17 (visibility, breadcrumbs, bounded history)
- `npm run typecheck && npx vitest run` — 293 tests green; `npm run build` green

### Completion Notes List

- Zoom = discrete states: each level/scope change is one `atlas.graph` call; the store pushes a history entry (bounded 50, forward-tail truncated — UA's MAX_HISTORY verbatim) and `load()` carries selection over when the node still exists in the new scope (AC4).
- Collapsed atoms are a **Learn** behavior (Deep Dive renders everything per AC1); expansion is accordion-style — one topic's notes at a time, per AC2's wording — and single-child groups dissolve renderer-side off the model's `singleChild` flag. Visibility is a pure function (`atlas-visibility.ts`); edges wait until both endpoints are visible.
- Keyboard map: arrows traverse cards+atoms (shared roving focus), Enter drills (project) / expands (atom), Esc/Backspace goes up (topic → project → vault), ⌘[ / ⌘] walk history; all navigation actions ⌘K-listed while the atlas is open.
- Level segmented control uses the DESIGN seg-control pattern; Learn is honestly disabled (with a title) until a project is scoped or selected; Deep Dive keeps the current scope (AC4).
- Topic atoms render on `--bg-inset` with a dashed hairline — visually a container, not a resolvable routing-slip card (they navigate, never resolve).

### File List

- `src/renderer/src/stores/atlas.ts` — navigate/drill/up/back/forward, accordion `expandedTopic`, bounded `pushHistory`
- `src/renderer/src/views/atlas/atlas-visibility.ts` + `.test.ts` — NEW: visibility + breadcrumb model + history tests
- `src/renderer/src/views/atlas/TopicGroup.tsx` — NEW: collapsed topic atom
- `src/renderer/src/views/atlas/AtlasBreadcrumbs.tsx` — NEW: crumb bar + history buttons
- `src/renderer/src/views/atlas/AtlasCanvas.tsx` — atoms, Esc/Backspace, shared focus targets
- `src/renderer/src/views/atlas/AtlasView.tsx` — level seg-control, drill wiring, ⌘[/⌘]
- `src/renderer/src/views/atlas/atlas-geometry.ts` — `FocusTarget` generalization
- `src/renderer/src/views/search/Palette.tsx` — atlas navigation ⌘K entries
- `src/renderer/src/styles.css` — breadcrumbs/history/topic-atom classes

## QA Results
