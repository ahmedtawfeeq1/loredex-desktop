# Story 16.6: Activity feed redesign — D1 activity cards + status-churn collapse

## Status

Done

## Story

**As a** vault teammate reading the activity feed,
**I want** each event as a scannable card with a kind chip, actor, relative time, truncated path, sha chip and per-kind actions — with repeated status flips collapsed into one expandable "status churn" card,
**so that** the feed reads like a team ledger instead of a raw git log, per DESIGN.md Addendum D1 "Activity cards".

## Acceptance Criteria

1. Feed rows become cards: `--bg-card`, hairline, radius 10, shadow-sm, 12px padding, grouped under the existing day headers.
2. Card anatomy per D1: kind chip (ROUTE/HANDOFF/CONSUME/STATUS/SYNC — mono 9px, kind-tinted border), actor + relative time (absolute on hover), one-line summary (serif only if it quotes an objective), mono path (middle-truncated, full on hover), commit sha chip (existing CommitChip).
3. Consecutive `status` flips on the same handoff by the same actor within 10 min collapse into ONE expandable "status churn ×N" card; expanding lists each flip (time, from → to, sha chip). The exact 5-flip sequence on `2026-07-10-handoff-nimbus-frontend-4` in the nimbus vault git log is the fixture and must collapse to ×5.
4. Per-kind action buttons (right-aligned, outline pills, max 2): route→Open note · handoff→View card + Consume (when the handoff is open and inbound) · consume/status→View card · sync→Open Sync · contract-linked events additionally offer View diff (capped at 2 total).
5. Action wiring: Open note opens the reader on the note; View card opens the handoffs board; Consume runs the existing store consume (write-lock lib path); Open Sync opens the sync panel; View diff focuses the linked change on the contract timeline.
6. Build green: typecheck + vitest + production build; churn-collapse unit test runs on the real nimbus fixture; per-kind action assertions.

## Tasks / Subtasks

- [x] Pure feed logic (AC: 3, 4)
  - [x] `collapseChurn(events)` → `FeedItem[]` (`single` | `churn`): consecutive status flips, same handoffId + same actor email, adjacent gap ≤ 10 min
  - [x] `groupItemsByDay(items)` (day keyed by the item's newest event — replaces event-level `groupByDay`)
  - [x] `relativeTime(at, now)` / `middleTruncate(path)` / `flipLabel(summary)` / `summaryQuotesObjective(summary)`
  - [x] `feedActions(event, ctx)` — typed action descriptors per kind, contract-linked View diff append, max-2 cap
- [x] Fixture test (AC: 3, 6)
  - [x] Churn collapse on the REAL nimbus activity fixture (views/home/fixtures/nimbus-activity.json, captured from the vault git log): frontend-4 ×5 by Rae Ito, ai-engine-2 ×2, lone flips stay single, order + non-status events untouched
  - [x] Synthetic edges: >10 min gap splits, different actor splits, non-status event breaks the run
- [x] Card UI (AC: 1, 2, 5)
  - [x] FeedView: EventCard + ChurnCard (expand/collapse), day headers kept, card click keeps `targetOf` navigation
  - [x] `performFeedAction` wiring onto existing stores/routes (reader / board / consume / sync / `openContractChange`)
  - [x] Prime handoffs (consume gating) + contracts (link detection via `reverseContractLinks`) on feed mount
- [x] Styles + fidelity (AC: 1, 2, 6)
  - [x] styles.css feed section rewrite: `.feed-card` recipe, kind tints, `.feed-action` outline pills, churn flip rail (2px hairline — sanctioned rail class)
  - [x] design-fidelity.test.ts: D1 activity-cards describe block

## Dev Notes

- Addendum D1 "Activity cards" is the binding spec, verbatim: card recipe radius 10 / 12px padding, kind chips mono 9px kind-tinted border, actor + relative time (absolute on hover), middle-truncated mono paths, sha chips, 10-min same-actor same-handoff churn collapse, per-kind outline-pill actions max 2. [Source: DESIGN.md#addendum-d1]
- The feed data path is untouched: `activity.feed` (lib PR-6 grammar) → feed store window + `dedupeBySha` (defect 14.2-2 pin stays). All new behavior is renderer view logic — read-only, no lib change. [Source: architecture.md#loredex-library-surface]
- Fixture: `views/home/fixtures/nimbus-activity.json` is the parsed activity of the real `_machine2/nimbus-vault` git log (61 events, head 4f77cce) and already contains the user-reported churn sequence (5 consecutive flips on `…-frontend-4`, 06:42:23→06:42:37, Rae Ito). One fixture, two consumers (home insights + feed churn test).
- "Inbound" for the Consume gate: every handoff note lives in `projects/<to>/handoffs/`, so a card is inbound to its `to` project by construction (same rule as the board's inbound lanes); the feed offers Consume when the board card for the event's handoffId is `status: 'open'` — legality stays lib-enforced (skip-accept path), the store's optimistic consume + revert handles races. [Source: shared/handoff-lanes.ts]
- Contract-linked detection reuses story 11.3's `reverseContractLinks` inversion; View diff navigates through the existing `openContractChange` (focus ring + timeline scroll). [Source: views/contracts/contract-links.ts]
- Kind tints (D1 names no colors; token mapping): route `--ok` (safe filing), handoff `--gold` (attention — kept from 6.2), status `--navy`, consume/sync `--text-2` (quiet). Gold budget honored: chips are border-tint only, the view's single gold primary stays the empty-state button.
- D1 supersedes the 14.2-2 *presentation* (basename rows → middle-truncated full paths); the defect's substance (full path on hover, one commit = one row) is preserved and still pinned by the `dedupeBySha` tests.
- Files: views/feed/feed-logic.ts + feed-logic.test.ts + FeedView.tsx, styles.css, design-fidelity.test.ts, this story, sprint-status.yaml (own row).

### Testing

- feed-logic vitest: fixture churn collapse (real sequence pinned by sha), synthetic split edges, `feedActions` descriptor per kind incl. consume gate + View diff cap, relativeTime/middleTruncate/flipLabel, day grouping across midnight, dedupeBySha pins kept.
- design-fidelity: `.feed-card` recipe (radius 10, 12px padding, hairline, shadow), `.feed-kind` mono 9px + kind tints, `.feed-action` outline pill.
- Gate: `npm run typecheck` + `npm test` + `npm run build` (+ e2e release gate), sequentially.

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-10 | 0.1 | Drafted from DESIGN.md Addendum D1 "Activity cards" (M4 polish cycle) | Dev agent (BMAD) |
| 2026-07-10 | 1.0 | Implemented; churn collapse proven on the real nimbus git-log fixture | Dev agent (BMAD) |

## Dev Agent Record

### Agent Model Used

Claude Fable 5 (claude-fable-5)

### Debug Log References

- Sequential gate: `npm run typecheck` clean (node+web) → `npm test` 82 files / 725 tests green (feed-logic grew from 10 to 23 tests: 4 fixture-churn, 4 synthetic churn edges, 5 action-table, 6 text/grouping helpers; +5 fidelity assertions) → `npm run build` clean → `npm run test:e2e` 18/18 (~25 s).
- Real-sequence proof: the fixture churn test pins the exact vault commits — `5297541/75c9231/08eea69/a9c7b78/ee0337e` (Rae Ito, 06:42:23→06:42:37 on `…-frontend-4`) collapse to ONE ×5 card; `f6e4683/4980333` to ×2; lone flips `9d4d230`/`5961d16` stay single; flattened item stream sha-equal to the 61-event input.

### Completion Notes List

- Churn semantics implemented: a run joins while events are CONSECUTIVE in the feed, `kind: status`, same `subject.handoffId`, same `actor.email`, and each adjacent flip is ≤ 10 min from its newer neighbour; any other event breaks the run; runs of 1 stay ordinary cards. Day assignment: a churn card sits on its newest flip's day.
- Action descriptors carry their wiring target (`path`/`handoffId`/`sha`) so the per-kind table is asserted without a DOM (resolve.ts pattern from story 10.4); `performFeedAction` maps them onto existing routes: reader open, board view, store `consume` (optimistic + write-lock lib path), sync panel, `openContractChange` (11.3 focus ring).
- Consume gate: a handoff card is inbound to its `to` project by construction (notes live in `projects/<to>/handoffs/`), so the feed offers Consume exactly when the board card for the event's handoffId is `status: 'open'` — expired-snoozed is NOT offered (consume from snoozed is illegal; reopen first). Races stay lib-enforced via the store's revert.
- Contract-linked detection: `reverseContractLinks` membership by handoffId; View diff uses the strongest (mentioned-first) chip's sha. Cap of 2 keeps View card + Consume ahead of View diff on an open inbound handoff.
- Feed data path untouched (activity.feed → store window → `dedupeBySha`); the redesign is pure renderer view logic. `groupByDay`/`initials`/`noteBasename` (avatar rows, basename-only paths) removed with their tests — D1's card anatomy supersedes that presentation; the 14.2-2 defect substance (one commit = one row, full path on hover) remains pinned.
- Kind tints (D1 names no colors): route `--ok`, handoff `--gold` (kept from 6.2), status `--navy`, consume/sync `--text-2`. Gold budget holds: tint is border-only; the view's one gold primary stays the empty-state button. Churn flip rail is the sanctioned 2px hairline connector class (Don't-list test enforces the allowlist).
- Deviation: none against D1. The fixture is the shared `views/home/fixtures/nimbus-activity.json` (61 events, head `4f77cce`, captured from `_machine2/nimbus-vault`) rather than a second copy — one real fixture, two consumers.

### File List

- src/renderer/src/views/feed/feed-logic.ts — churn collapse, item day-grouping, relativeTime/middleTruncate/flipLabel/summaryQuotesObjective, `feedActions` descriptors (dayLabel/dedupeBySha/targetOf kept)
- src/renderer/src/views/feed/feed-logic.test.ts — fixture churn tests (real nimbus sequence), synthetic edges, per-kind action assertions, helper tests, 14.2-2 pins kept
- src/renderer/src/views/feed/FeedView.tsx — EventCard/ChurnCard/ActionPills, `performFeedAction` wiring, handoffs+contracts priming
- src/renderer/src/styles.css — feed section rewrite: `.feed-card` recipe, kind tints, `.feed-action` pills, churn flip rail
- src/renderer/src/design-fidelity.test.ts — Addendum D1 activity-cards describe block
- docs/stories/epic16.story6-activity-cards.md — this story
- docs/stories/sprint-status.yaml — epic-16 row (16-6)
