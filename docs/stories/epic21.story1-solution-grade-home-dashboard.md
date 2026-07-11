# Story 21.1: Solution-grade Home dashboard — a real operations surface

## Status

Done

## Story

**As a** PM opening the app in the morning,
**I want** Home to read like a real operations dashboard for a handoff product — headline stats with week-over-week context, a ranked "what do I act on next" column, and an insight column that shows each project's pulse, the 14-day activity rhythm, contract churn, and sync health at a glance,
**so that** the first screen answers "where do I look next" with direction and trend, not a flat row of numbers.

Binding spec: `docs/DESIGN.md` **D1 amendment 7 §A** (verbatim). Supersedes the flat KPI-row dashboard of story 15.5; keeps and extends the `insights.ts` aggregation.

## Acceptance Criteria

1. **Hero band.** 3–4 headline stat tiles WITH context — open inbound + a week-over-week trend arrow, oldest-open age with its route, requests-waiting, and contract changes (7d, hidden when no roots). Each tile is a one-click jump into the owning view. WoW trend rides `activity.feed`: this 7-day window's handoff-created count vs the prior window's.
2. **Attention column (left, 2/3).** The ranked actionable-handoff list (open + expired-snooze, expired-first then `ageDays` desc — reuses `attentionRows`) with inline Consume / Snooze / Reopen on hover riding the board's own store actions (no duplicated logic, receipt toast + instant recompute), and the Blocked / critical-path card beneath it (`src/shared/blocked.ts` `blockedRows()` sentences verbatim, footer → Atlas → Blocked).
3. **Insight column (right, 1/3).** Stacks to fill the height beside the tall attention list: per-project pulse as compact rows WITH a note-count bar (ranked busiest-open-flow first via `rankedPulse`, brief-stale/none chips, open in/out), a 14-day activity sparkline (SVG, 14 kind-tinted stacked day bars, no chart lib), a contract-churn-by-file mini list (7d window, hidden when no roots), and a sync-health mini.
4. **Velocity strip.** Handoffs created vs consumed over 7 days as tiny paired SVG bars, with the plain-language summary "N handed off · M consumed · K still open".
5. **Pure insights extension with fixture tests.** `views/home/insights.ts` gains `dailyBuckets` (14-day sparkline), `velocity` (7d created/consumed), `wowTrend` (window-over-window), `rankedPulse` / `maxNoteCount`, and the `dayStringsEndingAt` day-key helper — all pure, all vitest-covered against the nimbus simulation ground truth (`tests/fixtures/nimbus-vault` through the lib's own `buildDashboard`/`listHandoffs` + the checked-in activity/contract JSON).
6. **States + live.** Empty vault: one serif sentence + Route a note… / Join a vault…. Degraded: sync mini goes quiet + a local-only "Wire a remote" line; churn/contract sections hidden without roots — never an empty error. One gold primary max, no dead space (right column fills height). Live-recompute on the existing watcher/poller events (activity now pulled over the 14-day window); no Refresh button. Typecheck + vitest + build green.

## Tasks / Subtasks

- [x] Insights extension (AC: 5)
  - [x] `dayStringsEndingAt`, `dailyBuckets`, `velocity`, `wowTrend`, `rankedPulse`, `maxNoteCount` in `insights.ts`
  - [x] `insights.test.ts` new describe blocks: sparkline buckets, velocity, WoW trend, ranked pulse — pinned to nimbus fixture ground truth
- [x] Data window (AC: 6)
  - [x] `dashboard-data.ts`: `activity.feed` `since` widened to a 14-day window (`activitySinceIso`) so sparkline/velocity/WoW fold from one load
- [x] Dashboard rebuild (AC: 1–4, 6)
  - [x] `HomeView.tsx`: hero band with `HeroTile`/`TrendArrow`, `VelocityStrip`, attention/insight two-column, `Sparkline`, pulse bars, `SyncMini`; brief card kept as link-out
  - [x] `home.css`: hero, `.dash-main` 2fr/1fr, trend arrow, pulse bars, kind-tinted sparkline, velocity paired bars, sync mini
- [x] Gate + docs (AC: 6)
  - [x] typecheck + full vitest (sequential) + build green; sprint-status row; story Done

## Dev Notes

- **Zero new backend asks.** Every number folds from the same channels 15.5 used — `dashboard.build` / `handoffs.list` / `activity.feed` / `contracts.timeline` / `sync.status` / the shared `blockedRows()` atlas model. The only data-layer change is widening the activity `since` from local-midnight to a 14-day window so the sparkline, velocity strip, and WoW trend all read from one feed load.
- **Day grouping matches the lib.** `dailyBuckets`/`velocity`/`wowTrend` bucket by `ActivityEvent.at` sliced to 10 (the committer's local calendar date — the lib's own convention), anchored to `localDay(now)`. Timezone-independent, so the fixture tests pin exact per-day counts.
- **WoW is informational, not judgemental.** The trend arrow on Open inbound shows this-window vs prior-window handoff-created counts; up ≠ good, so the arrow is navy/quiet, never gold/rust. Gold stays budgeted for state.
- **Attention actions reuse the handoffs store verbatim** (optimistic flip → receipt toast → authoritative refetch); Home renders the same cards object, so a Consume recomputes instantly. Nothing here deletes.
- **Layout kills dead space.** The insight column is a flex stack of sub-cards (pulse / sparkline / churn / sync) that grows to match the tall attention list; the velocity strip is full-width under the hero band; the brief demotes to a link-out card at the bottom.
- **SVG only, no chart libs** (DESIGN §Data visualizations): the sparkline is 14 kind-tinted stacked `<rect>` columns; velocity is 7 paired `<rect>` groups. Kind tints stay inside the palette (gold/ok/navy + muted mixes — no purple, no system blue).
- Scope discipline (concurrent workflow): all new code lives in `views/home/**`; shared modules imported read-only.

### Testing

- `src/renderer/src/views/home/insights.test.ts` — extended: 14-day sparkline buckets (all 61 fixture events land, older days zero-filled, per-kind day breakdown), velocity (21 created / 12 consumed, open passed through), WoW trend (this-week vs empty-last-week → up; re-anchored a week on → down; both-empty → flat), ranked pulse (busiest open-flow first, `maxNoteCount` ≥ 1). Existing 15.5 assertions (`activityCounts`, `startOfTodayIso`, sync tile, KPI folds) kept intact.
- `dashboard-data.test.ts` (live-recompute event set) unchanged and green.

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-11 | 1.0 | Rebuilt Home per D1 amendment 7 §A; insights extended (sparkline/velocity/WoW/ranked pulse); Done | Dev Agent |

## Dev Agent Record

### Agent Model Used

Opus 4.8 (1M context) — BMAD dev agent, sequential v1-completion batch.

### Debug Log References

- Ground-truth values computed from `fixtures/nimbus-activity.json` before pinning tests: 14-day buckets 07-09 ×28 / 07-10 ×33 (total 61); 7d velocity created 21 / consumed 12; WoW handoff current 21 / previous 0.

### Completion Notes

- Hero band drops the old 6-tile KPI row's Stale-briefs and Sync tiles — stale-brief state now lives on the pulse chips, sync on the insight-column mini — keeping the hero to the amendment's 3–4 headline stats.
- `activityCounts` / `startOfTodayIso` kept exported (still covered by their 15.5 tests) though the today-hourly strip they fed is replaced by the 14-day sparkline.
- Gate: typecheck clean; full vitest 919/919 sequential (`--no-file-parallelism`); production build clean. No new deps.

### File List

- `src/renderer/src/views/home/insights.ts` (extended: dayStringsEndingAt, dailyBuckets, velocity, wowTrend, rankedPulse, maxNoteCount)
- `src/renderer/src/views/home/insights.test.ts` (new describe blocks)
- `src/renderer/src/views/home/dashboard-data.ts` (14-day activity window)
- `src/renderer/src/views/home/HomeView.tsx` (rebuilt)
- `src/renderer/src/views/home/home.css` (hero, main grid, sparkline, velocity, pulse bars, sync mini)
- `docs/stories/epic21.story1-solution-grade-home-dashboard.md` (this file)
- `docs/stories/sprint-status.yaml` (epic-21 rows)

## QA Results

Self-verified against the gate (typecheck + full sequential vitest 919/919 + build). Insights aggregation pinned to nimbus-vault ground truth; live-recompute event set unchanged.

- 2026-07-11 fresh-eyes (commit `83b07d1`): **PASS.** All §A bands present and wired through the pure `insights.ts` module: hero (openInbound + `wowTrend` arrow, `oldestOpen`+route, `requestsWaiting`, `changesInWindow`), attention 2/3 (`attentionRows` + inline Consume/Snooze, `blockedRows` card beneath), insight 1/3 (`rankedPulse` bars, 14-day `dailyBuckets` SVG sparkline, `churnByFile`, `syncTile`), velocity strip (`velocity` 7d). Deterministic (`now` injected), zero new backend, same channels the rest of the app reads. `insights.test.ts` green in 933/933.
