# Story 15.5: Home dashboard — directional insight, not a document

## Status

In Progress

## Story

**As a** PM opening the app in the morning,
**I want** Home to be a full-width insight dashboard — what needs attention, who blocks whom, where contracts churn, how fresh each project's knowledge is — every tile a one-click jump into the view that acts on it,
**so that** the first screen answers "where do I look next" instead of rendering the Start-Here brief as a narrow page of prose.

Binding spec: `docs/plan/wireframe-home-dashboard.html` (layout, UI→channel table, states, build plan, resolved defaults).

## Acceptance Criteria

1. **Full-width dashboard shell.** Home drops the reading measure entirely; the grid fills the pane (DESIGN.md v2 cards on the pane surface, one gold primary max, mono data, dense rows). Header: view title, `<vault> · <weekday date>` sub, a "live" chip (watcher + poller) — **no Refresh button on Home**.
2. **KPI row (6 tiles), each mapped to an existing channel** (spec §4): open inbound + across-N-projects (`handoffs.list`), requests waiting (`kind==='request' && status==='open'`), oldest open with its route (max `ageDays` over open/expired), contract changes in the last 7 days (`contracts.timeline`, client-side window), stale briefs of N projects (`dashboard.build` ProjectStates), sync (`sync.status`, degraded local-only text when no remote).
3. **Attention / blocked band.** Needs-attention list: open + expired-snooze handoffs ranked expired-first then `ageDays` desc; stamps reuse the board's chip component; age chips amber ≥2d, rust ≥5d (resolved Q1); row click opens the handoff's brief exactly like the board card; inline Consume / Snooze on hover ride the board's own store actions (`handoffs.consume` / `handoffs.setStatus` — no duplicated logic, receipt toast + instant recompute). Blocked card renders `src/shared/blocked.ts` `blockedRows()` sentences verbatim, row click resolves via `relPath`, footer jumps to Atlas → Blocked.
4. **Second band.** Project pulse: one row per `ProjectState` (notes · last date, open in/out counts, brief chip: stale = `notesNewerThanBrief > 0`, "no brief" = `briefPath === null`, topics), row click → Atlas Learn for that project. Contract churn: `contracts.timeline` grouped by file, 7-day window (resolved Q3), linked-handoff count from the existing chip linker, click → Contracts scoped to the file's project + focus ring on its newest change; **section hides entirely when no project roots are registered**. Today's activity: `activity.feed` since local midnight, counts by kind + a 24-rect per-hour SVG density strip (no chart lib), click → Activity feed. Product brief demotes to a link-out card (resolved Q4): title + freshness via the existing `brief-title.ts`/`freshness.ts`, "Open in Reader".
5. **Pure insights module with fixture tests.** `views/home/insights.ts` folds the channel payloads into tile models (`openInbound`, `requestsWaiting`, `oldestOpen`, `staleBriefs`, `churnByFile(7d)`, `activityCounts(since midnight)`, `attentionRows` ranking, age tones, sync tile) — vitest against fixtures from the real nimbus simulation vault (`tests/fixtures/nimbus-vault` through the lib's own `buildDashboard`/`listHandoffs`, plus checked-in activity/contract JSON captured from the live simulation repos).
6. **Live + key states.** Recompute on existing watcher/poller renderer events, debounced 500 ms. Empty vault: one serif sentence + Route a note… / Join a vault… (spec §3). Degraded: sync tile local-only with a "Wire a remote" link to Sync; churn section hidden without roots — never an empty error. Company-wide scope (resolved Q2). Typecheck + vitest + build green.

## Tasks / Subtasks

- [x] Story + insights module (AC: 5) — commit 1
  - [x] `views/home/insights.ts` pure aggregation + `insights.test.ts` against nimbus fixtures
  - [x] `views/home/fixtures/nimbus-activity.json` + `nimbus-contract-changes.json` captured from the real simulation vault/repo
- [x] Dashboard layout (AC: 1, 2) — commit 2
  - [x] Rebuild `HomeView.tsx`: KPI row, attention/blocked band, project pulse, churn/activity band, brief card; `home.css` (view-scoped, like atlas.css)
- [x] Row actions + deep links (AC: 3, 4) — commit 3
  - [x] Board-card open (`openBrief`), Atlas blocked / Learn, Contracts scoped+focused, Reader brief; inline consume/snooze via `useHandoffs`
- [x] Live recompute (AC: 6) — commit 4
  - [x] `dashboard-data.ts` store: one debounced (500 ms) recompute over existing renderer events; Refresh button gone
- [x] QA + docs (AC: 6) — commit 5
  - [x] USER-GUIDE.md Home section rewrite; sprint-status row; story Done

## Dev Notes

- **Zero new backend asks.** Every number maps to an existing `src/shared/ipc-contract.ts` channel; the dashboard is a pure consumer plus one client-side aggregation module (spec §4 table, verbatim).
- Blocked rows derive from `handoffs.list` cards through the shared `blockedRows()` — the same one blocking rule the Atlas model uses, so the two surfaces cannot disagree (the spec's `atlas.graph` row names the shared module as the mapping).
- Attention actions reuse the handoffs store verbatim: optimistic flip, receipt toast, authoritative refetch — Home renders the same cards object, so recompute is instant.
- Resolved defaults honored: age chips amber ≥2d / rust ≥5d; company-wide scope; churn window fixed 7d; brief is a link-out card only.
- Scope discipline (concurrent workflow in this repo): all new code lives in `views/home/**`; shared modules are imported read-only.

### Testing

- `src/renderer/src/views/home/insights.test.ts` — fixture-driven: dashboard/handoff payloads built by the lib against `tests/fixtures/nimbus-vault` (today pinned 2026-07-10), activity/contract JSON captured from the live simulation; synthetic cards cover expired-snooze ranking and age tones the fixture doesn't contain.
- Existing `brief-title.test.ts` / `freshness.test.ts` keep covering the brief card.

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-10 | 0.1 | Drafted from wireframe-home-dashboard.html | Dev Agent |

## Dev Agent Record

### Agent Model Used

Claude Fable 5 (claude-fable-5)

### Debug Log References

(pending)

### Completion Notes List

(pending)

### File List

(pending)

## QA Results

(pending)
