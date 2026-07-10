# Story 10.4: Node cards + full hyperlink resolution — ATLAS-4

## Status

Approved

## Story

**As a** vault reader,
**I want** every Atlas node rendered as a real routing-slip card that resolves somewhere real in one click,
**so that** the Atlas is a map of things that exist, never a dead-end visualization.

## Acceptance Criteria

1. All 6 node types render to spec as mini routing-slip cards: `note` (title serif, type/topic chips, mono date, freshness — stale = rust); `handoff` (stamp chip OPEN gold / ACCEPTED navy / DECLINED-STALE rust / CONSUMED `--text-2` / SNOOZED dashed, mono `from ⟶ to` route line, REQUEST navy chip); `contract` (file mono + change count); `source` (repo-relative path mono); `commit` (short sha mono, PR chip when known); `project` (per story 10.2). Handoff stamp chips mirror board state **live** via `handoff.stateChanged` events. Card summary = objective (handoffs) or first body sentence (notes) — no generation.
2. The **full §3 resolution table is wired — every row, no dead clicks**:
   - `note` → Reader view on that note (`vault.readNote` + reader route), marking read via `readState.mark`;
   - `handoff` → handoff board card with thread rail expanded (`handoffs.thread`);
   - `source` → editor deep link (`editor: system|vscode|cursor|windsurf|custom` scheme → `<scheme>://file/<abs>[:line]`), resolving `source_project` + `source_rel` against this machine's project-roots map **first**, falling back to the recorded absolute `source_path`;
   - `contract` → contract timeline filtered to that file; a specific change opens the unified diff (`contracts.timeline` / `contracts.diff`);
   - `commit`/PR chip → GitHub commit or PR page in the default browser (`github.ts` remote normalization; PR via `github.prForCommit`, degrading to the plain commit link);
   - `project` → drill (story 10.3), secondary action → registry/company overview entry;
   - `route`/`thread` edge click → the handoff that created it; `contract-link` edge click → the diff on one end, the handoff on the other, by direction of click.
3. When a `source` file exists nowhere locally, the card shows a **disabled state with "repo not on this machine" + a copy-path affordance** — never a silent dead click. Non-GitHub remotes render commit chips as plain mono text + copy-sha, no link.
4. Heuristic-tier `contract-link` edges render dashed `--text-2` (tier labeled, exactly as m2 mandates); `mentioned` tier renders solid.
5. Every resolution is keyboard-reachable and listed in ⌘K; external jumps (editor, GitHub) carry the standard outbound affordance; nothing opens a modal that merely *describes* a thing reachable elsewhere in the app. Both themes, focus rings, reduced-motion per the quality floor.

## Tasks / Subtasks

- [ ] Node cards (AC: 1, 4)
  - [ ] `views/atlas/AtlasNodeCard.tsx`: per-type card variants, stamp/type/topic/date chips, live stamp subscription, dashed heuristic edges
- [ ] Resolution wiring (AC: 2, 3)
  - [ ] `views/atlas/resolve.ts`: one resolver per node/edge type mapped to existing routes/channels; source local re-resolution + disabled fallback + copy-path; GitHub/editor outbound affordances
- [ ] Quality floor (AC: 5)
  - [ ] ⌘K entries for resolutions, keyboard activation, themes, reduced-motion
- [ ] Tests

## Dev Notes

- The HYPERLINK-EVERYTHING rule is binding and is the whole point of this story: "Every node in the Atlas resolves somewhere real in one click. If a node type has no resolution target, it doesn't get to be a node." Implement the §3 resolution table row-for-row — the AC2 list mirrors it; do not invent alternate targets, and honor the corollaries (⌘K, outbound affordance, no describe-only modals). [Source: plan/ATLAS-CONCEPT.md#3-the-hyperlink-everything-rule]
- Source-node resolution order (roots map first, recorded absolute path fallback, disabled + copy-path otherwise) is specified in the table's `source` row; the roots map is the m2 §5 project-roots discovery (config wins over app-db). GitHub resolution and degradation follow m2 §6 (`gh` optional, no OAuth). [Source: plan/ATLAS-CONCEPT.md#3-the-hyperlink-everything-rule] [Source: architecture-m2.md#5-contract-intelligence-read-only-app-side--no-vault-writes-so-core-host-code-not-lib] [Source: architecture-m2.md#6-github-layer-srccoregithubts--networkexec-app-side-read-only]
- Status chips replace UA's complexity/tested indicators: stamp colors per the DESIGN routing-slip spec, freshness stale = rust per token rules; summaries are already authored — no LLM step, ever. Stamp-press animation stays exclusive to the handoff board card — Atlas cards do not press. [Source: plan/ATLAS-CONCEPT.md#2-concept-translation-understand-anything--loredex-vault-atlas] [Source: DESIGN.md#signature-routing-slip-handoff-card-kept-re-skinned]
- Rendering constants: white card, hairline, 12px radius, navy 600 name, gold open-count badge; heuristic contract links dashed `--text-2`; hover gold ring, click = resolution. [Source: plan/ATLAS-CONCEPT.md#5-implementation-notes-for-our-stack]
- Depends on stories 10.1–10.3 (nodes exist and are reachable at Learn/Deep Dive); reuses reader route (epic 2), board + thread rail (8.2), contract timeline/diff (11.1/11.2), GitHub chips (12.1) — where a target view has not shipped yet, the resolver routes to its channel-backed fallback and the story records it. Files: `src/renderer/src/views/atlas/AtlasNodeCard.tsx`, `resolve.ts`, ⌘K registrations.

### Testing

- Unit: one test per resolution-table row (target invoked with right payload), source fallback chain (roots hit / abs-path hit / disabled+copy), non-GitHub degradation, heuristic dashed rendering, live stamp update on `handoff.stateChanged`, keyboard activation of every resolution. [Source: plan/ATLAS-CONCEPT.md#3-the-hyperlink-everything-rule] [Source: DESIGN.md#quality-floor-non-negotiable-carried-from-v1]

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-10 | 0.1 | Drafted from ATLAS-CONCEPT.md §5 (ATLAS-4) + §3 resolution table | Bob (SM) |
| 2026-07-10 | 1.0 | Approved | Sarah (PO) |

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## QA Results
